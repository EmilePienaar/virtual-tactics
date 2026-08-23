/* Virtual Tactics :: rules/combat.js
   The encounter engine: initiative, turns, movement (with opportunity attacks
   and falls), attacks, saves, healing and conditions.

   Everything that changes the board goes through here and emits an event, so
   the UI never has to guess when to repaint or what to write in the log. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd, A = VT.actor, G = VT.gmap, P = VT.path;

  var combat = {
    active: false,
    map: null,
    order: [],      // actor ids, initiative order
    idx: 0,
    round: 0,
    anim: null,     // in-flight movement
    fx: [],         // transient visual effects
    busy: false
  };

  function log(html, cls) { VT.bus.emit('log', html, cls); }
  function changed() { VT.bus.emit('update'); }
  function floater(actor, text, color) { VT.bus.emit('floater', actor, text, color); }

  function live(map) { return map.tokens.filter(function (a) { return a.hp > 0; }); }
  function byId(id) {
    return combat.map ? combat.map.tokens.find(function (a) { return a.id === id; }) : null;
  }

  /* ---- initiative ------------------------------------------------------ */
  function rollInitiative(map) {
    combat.map = map;
    map.tokens.forEach(function (a) {
      if (a.hp <= 0) { a.initiative = -99; return; }
      var r = VT.dice.d20(A.abilityMod(a, 'dex'));
      a.initiative = r.total;
      a.initRoll = r;
    });
    combat.order = map.tokens.slice().sort(function (a, b) {
      if (b.initiative !== a.initiative) return b.initiative - a.initiative;
      var d = A.abilityMod(b, 'dex') - A.abilityMod(a, 'dex');
      if (d) return d;
      return a.name < b.name ? -1 : 1;
    }).map(function (a) { return a.id; });
    combat.idx = 0;
    combat.round = 1;
    combat.active = true;
    log('<b>Roll for initiative.</b>', 'turn');
    map.tokens.slice()
      .sort(function (a, b) { return b.initiative - a.initiative; })
      .forEach(function (a) {
        if (a.hp <= 0) return;
        log(U.esc(a.name) + ' <span class="roll">' + (a.initRoll ? a.initRoll.detail : '') + '</span> = <b>' + a.initiative + '</b>');
      });
    beginTurn();
    return combat.order;
  }

  function end() {
    combat.active = false;
    combat.order = [];
    combat.idx = 0;
    combat.round = 0;
    changed();
    VT.bus.emit('turn', null);
  }

  function current() {
    if (!combat.active) return null;
    return byId(combat.order[combat.idx]);
  }

  function beginTurn() {
    var a = current();
    if (!a) return;
    if (a.hp <= 0) return nextTurn();

    A.resetTurn(a);
    a.reactionUsed = false;

    log('&#9656; <b>' + U.esc(a.name) + '</b> &mdash; round ' + combat.round, 'turn');

    /* standing in something nasty */
    var ter = G.terrain(combat.map, a.x, a.y);
    if (ter && ter.hazard) {
      var d = VT.dice.roll(ter.hazard);
      var res = A.applyDamage(a, d.total, ter.hazardType);
      log(U.esc(a.name) + ' burns in the ' + ter.name.toLowerCase() +
        ' <span class="roll">' + d.detail + '</span> <span class="dmg">' + res.taken + '</span>');
      floater(a, '-' + res.taken, '#ff8a5c');
      if (res.downed) announceDown(a);
    }
    if (a.regen && a.hp > 0 && a.hp < a.hpMax) {
      var got = A.healBy(a, a.regen);
      if (got) { log(U.esc(a.name) + ' regenerates <span class="hit">' + got + '</span>'); floater(a, '+' + got, '#78b06a'); }
    }

    changed();
    VT.bus.emit('turn', a);
  }

  function nextTurn() {
    if (!combat.active) return;
    var guard = 0;
    do {
      combat.idx++;
      if (combat.idx >= combat.order.length) {
        combat.idx = 0;
        combat.round++;
        log('&mdash; round ' + combat.round + ' &mdash;', 'turn');
      }
      guard++;
    } while (guard < 200 && (function () { var a = current(); return !a || a.hp <= 0; })());

    if (checkVictory()) return;
    beginTurn();
  }

  function checkVictory() {
    var map = combat.map;
    if (!map) return false;
    var foes = map.tokens.filter(function (a) { return a.team === 'foe' && a.hp > 0; });
    var party = map.tokens.filter(function (a) { return a.team === 'party' && a.hp > 0; });
    if (!foes.length && map.tokens.some(function (a) { return a.team === 'foe'; })) {
      log('<b>The field is won.</b> No enemies remain standing.', 'turn');
      end(); return true;
    }
    if (!party.length && map.tokens.some(function (a) { return a.team === 'party'; })) {
      log('<b>The party has fallen.</b>', 'turn');
      end(); return true;
    }
    return false;
  }

  function announceDown(a) {
    if (a.team === 'party') log('<b>' + U.esc(a.name) + '</b> falls unconscious!', 'turn');
    else log('<b>' + U.esc(a.name) + '</b> is slain.', 'turn');
    floater(a, a.team === 'party' ? 'DOWN' : 'SLAIN', '#c9605a');
  }

  /* ---- advantage ------------------------------------------------------- */
  /* 5e stacking: any number of sources of advantage and disadvantage cancel to
     a flat roll. We collect both sides and report the reasons for the log. */
  function advantage(attacker, target, action) {
    var map = combat.map, adv = false, dis = false, why = [];
    var ranged = action.kind === 'ranged';

    (attacker.conditions || []).forEach(function (c) {
      var d = SRD.CONDITIONS[c]; if (!d) return;
      if (d.atkFrom > 0) { adv = true; why.push(d.name); }
      if (d.atkFrom < 0) { dis = true; why.push(d.name); }
    });
    (target.conditions || []).forEach(function (c) {
      var d = SRD.CONDITIONS[c]; if (!d) return;
      var v = d.atkAgainst;
      if (ranged && d.atkAgainstRanged != null) v = d.atkAgainstRanged;
      if (!ranged && d.atkAgainstMelee != null) v = d.atkAgainstMelee;
      if (v > 0) { adv = true; why.push('target ' + d.name.toLowerCase()); }
      if (v < 0) { dis = true; why.push('target ' + d.name.toLowerCase()); }
    });

    if (VT.store.settings().highGround) {
      var dz = G.elev(map, attacker.x, attacker.y) - G.elev(map, target.x, target.y);
      if (dz >= 1) { adv = true; why.push('high ground'); }
      else if (dz <= -1 && ranged) { dis = true; why.push('shooting uphill'); }
    }

    if (ranged) {
      /* shooting while something is breathing down your neck */
      var pressed = map.tokens.some(function (o) {
        return o.hp > 0 && o.team !== attacker.team && o.id !== target.id &&
          U.gridDist(o.x, o.y, attacker.x, attacker.y) <= 1;
      });
      if (pressed) { dis = true; why.push('enemy adjacent'); }
      var ft = P.feet(map, attacker, target);
      if (action.range && ft > action.range[0]) { dis = true; why.push('long range'); }
    }

    return { adv: adv && dis ? 0 : adv ? 1 : dis ? -1 : 0, why: why, cancelled: adv && dis };
  }

  function coverAgainst(attacker, target) {
    var l = P.los(combat.map, attacker, target);
    return l;
  }

  /* ---- range / legality ------------------------------------------------ */
  function actionReachFt(action) {
    if (action.kind === 'melee') return action.reach || 5;
    if (action.range) return action.range[1] || action.range[0] || 5;
    return 5;
  }

  function inRangeOf(attacker, action, tx, ty) {
    var ft = P.feet(combat.map, attacker, { x: tx, y: ty });
    return ft <= actionReachFt(action);
  }

  /* Every legal target square for an action. */
  function targetsFor(actor, action) {
    var map = combat.map, out = [];
    var reach = actionReachFt(action);
    if (action.self || (action.range && action.range[1] === 0)) return [{ x: actor.x, y: actor.y }];
    map.tokens.forEach(function (t) {
      if (t.hp <= 0 && action.kind !== 'heal') return;
      if (t.id === actor.id && action.kind !== 'heal' && action.kind !== 'buff') return;
      if (!inRangeOf(actor, action, t.x, t.y)) return;
      if (action.kind !== 'melee' && P.los(map, actor, t).blocked) return;
      out.push({ x: t.x, y: t.y, actor: t });
    });
    /* area spells can be aimed at empty ground */
    if (action.aoe) {
      P.inRadius(map, actor.x, actor.y, reach, true).forEach(function (p) {
        if (!out.some(function (o) { return o.x === p.x && o.y === p.y; })) out.push(p);
      });
    }
    return out;
  }

  function aoeTiles(action, cx, cy) {
    if (!action.aoe) return [{ x: cx, y: cy }];
    return P.inRadius(combat.map, cx, cy, action.aoe.radius, true);
  }

  /* ---- movement -------------------------------------------------------- */
  function faceToward(a, tx, ty) {
    var dx = tx - a.x, dy = ty - a.y;
    if (dx || dy) { a.fx = Math.sign(dx) || a.fx; a.fy = Math.sign(dy) || a.fy; }
  }

  /* Enemies who threaten `from` but not `to` get a swing as you leave. */
  function opportunityAttacks(mover, from, to) {
    if (!VT.store.settings().opportunity || mover.disengaged) return;
    combat.map.tokens.forEach(function (o) {
      if (o.hp <= 0 || o.team === mover.team || o.reactionUsed || !A.canAct(o)) return;
      var atk = (o.actions || []).find(function (ac) { return ac.kind === 'melee'; });
      if (!atk) return;
      var reach = Math.floor((atk.reach || 5) / 5);
      var was = U.gridDist(o.x, o.y, from.x, from.y) <= reach;
      var now = U.gridDist(o.x, o.y, to.x, to.y) <= reach;
      if (was && !now) {
        o.reactionUsed = true;
        log('<b>' + U.esc(o.name) + '</b> takes an opportunity attack.');
        resolveAttack(o, mover, atk, { free: true });
      }
    });
  }

  /* Kick off an animated move along a path produced by path.pathTo(). */
  function moveAlong(actor, path, onDone) {
    if (!path || path.length < 2) { if (onDone) onDone(); return; }
    var costTotal = path[path.length - 1].cost || 0;
    actor.moveLeft = Math.max(0, actor.moveLeft - costTotal);
    actor.movedThisTurn = (actor.movedThisTurn || 0) + costTotal;
    combat.anim = { actor: actor, path: path, i: 0, t: 0, onDone: onDone };
    combat.busy = true;
    if (VT.store.settings().animate === false) {
      while (combat.anim) stepMove(1);
    }
  }

  function stepMove(dt) {
    var an = combat.anim;
    if (!an) return;
    var stepDur = 0.13;
    an.t += dt / stepDur;
    while (an.t >= 1 && combat.anim) {
      an.t -= 1;
      var from = an.path[an.i], to = an.path[an.i + 1];
      an.i++;
      var a = an.actor;
      faceToward(a, to.x, to.y);
      var prev = { x: a.x, y: a.y };
      a.x = to.x; a.y = to.y;
      opportunityAttacks(a, prev, to);

      if (to.fall) {
        var feet = to.fall * VT.iso.FT;
        if (VT.store.settings().fallDamage) {
          var dmg = VT.dice.roll(Math.max(1, Math.floor(feet / 10)) + 'd6');
          var res = A.applyDamage(a, dmg.total, 'bludgeoning');
          A.addCond(a, 'prone');
          log('<b>' + U.esc(a.name) + '</b> drops ' + feet + ' ft <span class="roll">' + dmg.detail +
            '</span> <span class="dmg">' + res.taken + '</span> and lands prone');
          floater(a, '-' + res.taken, '#ff8a5c');
          if (res.downed) announceDown(a);
        }
      }
      var ter = G.terrain(combat.map, a.x, a.y);
      if (ter && ter.hazard && a.hp > 0) {
        var hd = VT.dice.roll(ter.hazard);
        var hr = A.applyDamage(a, hd.total, ter.hazardType);
        log('<b>' + U.esc(a.name) + '</b> steps into ' + ter.name.toLowerCase() +
          ' <span class="dmg">' + hr.taken + '</span>');
        floater(a, '-' + hr.taken, '#ff8a5c');
        if (hr.downed) announceDown(a);
      }

      if (an.i >= an.path.length - 1 || a.hp <= 0 || to.fall) {
        var done = an.onDone;
        combat.anim = null;
        combat.busy = false;
        a._anim = null;
        changed();
        if (done) done();
        return;
      }
    }
    if (combat.anim) {
      var cur = combat.anim.path[combat.anim.i];
      var nxt = combat.anim.path[combat.anim.i + 1];
      combat.anim.actor._anim = { from: cur, to: nxt, t: U.clamp(combat.anim.t, 0, 1) };
    }
  }

  /* ---- attacks --------------------------------------------------------- */
  function resolveAttack(attacker, target, action, opts) {
    opts = opts || {};
    var map = combat.map;
    faceToward(attacker, target.x, target.y);

    var advInfo = advantage(attacker, target, action);
    var coverInfo = action.kind === 'melee' ? { cover: 0, coverName: null } : coverAgainst(attacker, target);
    if (coverInfo.cover === 99) {
      log('<b>' + U.esc(attacker.name) + '</b> has no line to <b>' + U.esc(target.name) + '</b>.');
      return { blocked: true };
    }
    var ac = A.effectiveAC(target) + (coverInfo.cover || 0);

    var bonusDice = 0, bonusNote = '';
    (attacker.conditions || []).forEach(function (c) {
      var d = SRD.CONDITIONS[c];
      if (d && d.bonusToHit) { var b = VT.dice.roll(d.bonusToHit); bonusDice += b.total; bonusNote += ' +' + b.total + '(' + d.name.toLowerCase() + ')'; }
    });

    var roll = VT.dice.d20(action.toHit + bonusDice, advInfo.adv);
    var hit = roll.crit || (!roll.fumble && roll.total >= ac);

    var head = '<b>' + U.esc(attacker.name) + '</b> ' + U.esc(action.name) + ' &rarr; <b>' + U.esc(target.name) + '</b>';
    var detail = ' <span class="roll">' + roll.detail + bonusNote +
      (advInfo.adv > 0 ? ' adv' : advInfo.adv < 0 ? ' dis' : '') + ' = ' + (roll.total) + ' vs AC ' + ac +
      (coverInfo.coverName ? ' (' + coverInfo.coverName + ')' : '') + '</span>';

    VT.bus.emit('fx', {
      kind: action.kind === 'melee' ? 'slash' : 'arrow',
      from: { x: attacker.x, y: attacker.y }, to: { x: target.x, y: target.y },
      color: action.spell ? '#c69cff' : '#ffe9b0', dur: 0.3
    });

    if (!hit) {
      log(head + ' &mdash; <span class="miss">' + (roll.fumble ? 'fumble' : 'miss') + '</span>' + detail);
      floater(target, 'MISS', '#a49c86');
      changed();
      return { hit: false, roll: roll };
    }

    /* damage */
    var dmgExpr = action.dmg || '0';
    if (action.sneak && (advInfo.adv > 0 || allyAdjacent(attacker, target))) {
      dmgExpr += '+' + action.sneak;
    }
    var expr = roll.crit ? VT.dice.critDice(dmgExpr) : dmgExpr;
    var dmg = VT.dice.roll(expr);
    var res = A.applyDamage(target, Math.max(0, dmg.total), action.dmgType);

    log(head + ' &mdash; <span class="' + (roll.crit ? 'crit' : 'hit') + '">' +
      (roll.crit ? 'CRITICAL' : 'hit') + '</span>' + detail +
      ' <span class="roll">' + dmg.detail + '</span> <span class="dmg">' + res.taken + ' ' +
      U.esc(action.dmgType || '') + '</span>' +
      (res.resisted ? ' <span class="miss">(resisted)</span>' : '') +
      (res.vulnerable ? ' <span class="crit">(vulnerable)</span>' : '') +
      (res.immune ? ' <span class="miss">(immune)</span>' : ''));
    floater(target, '-' + res.taken, roll.crit ? '#ffd76a' : '#ff8a5c');

    if (action.applies && res.taken >= 0) {
      A.addCond(target, action.applies);
      log('<b>' + U.esc(target.name) + '</b> is ' + (SRD.CONDITIONS[action.applies] || {}).name.toLowerCase() + '.');
    }
    if (res.downed) announceDown(target);
    changed();
    checkVictory();
    return { hit: true, crit: roll.crit, damage: res.taken, roll: roll };
  }

  function allyAdjacent(attacker, target) {
    return combat.map.tokens.some(function (o) {
      return o.hp > 0 && o.id !== attacker.id && o.team === attacker.team &&
        U.gridDist(o.x, o.y, target.x, target.y) <= 1;
    });
  }

  /* Area / saving-throw actions. */
  function resolveSave(attacker, action, cx, cy) {
    var tiles = aoeTiles(action, cx, cy);
    var map = combat.map;
    faceToward(attacker, cx, cy);
    VT.bus.emit('fx', {
      kind: 'burst', from: { x: attacker.x, y: attacker.y }, to: { x: cx, y: cy },
      color: '#ffb04d', dur: 0.45
    });
    /* Magic Missile and its kind name no saving throw and no attack roll -
       they simply hit. convert.js models them as a save because the engine has
       no "just hits" kind, and marks them autoHit; honouring that mark is this
       side of the bargain. Without it a target rolled a Dexterity save against
       Magic Missile and took half, or none, which is not a thing that can
       happen. */
    var auto = !!action.autoHit;
    log('<b>' + U.esc(attacker.name) + '</b> casts ' + U.esc(action.name) +
      (auto ? ' <span class="roll">hits automatically</span>'
            : ' <span class="roll">DC ' + action.dc + ' ' +
              String(action.save).toUpperCase() + '</span>'));

    var caught = map.tokens.filter(function (t) {
      return t.hp > 0 && tiles.some(function (p) { return p.x === t.x && p.y === t.y; });
    });
    if (!caught.length) log('&nbsp;&nbsp;<span class="miss">nothing in the area</span>');

    caught.forEach(function (t) {
      var dmg = VT.dice.roll(action.dmg || '0');
      /* Some of these throw several darts at once. */
      var count = Math.max(1, action.count || 1);
      var total = dmg.total;
      for (var extra = 1; extra < count; extra++) total += VT.dice.roll(action.dmg || '0').total;

      var r = null, ok = false, amount = total;
      if (!auto) {
        r = VT.dice.d20(A.saveMod(t, action.save));
        ok = r.total >= action.dc;
        amount = ok ? (action.half ? Math.floor(total / 2) : 0) : total;
      }

      var res = A.applyDamage(t, amount, action.dmgType);
      log('&nbsp;&nbsp;' + U.esc(t.name) + ' ' +
        (auto ? '<span class="hit">hit</span>'
              : '<span class="roll">' + r.detail + ' = ' + r.total + '</span> ' +
                (ok ? '<span class="hit">saves</span>' : '<span class="miss">fails</span>')) +
        ' <span class="dmg">' + res.taken + '</span>');
      floater(t, '-' + res.taken, (!auto && ok) ? '#e0b96a' : '#ff8a5c');
      if (!ok && action.applies) A.addCond(t, action.applies);
      if (res.downed) announceDown(t);
    });
    changed();
    checkVictory();
    return { targets: caught.length };
  }

  function resolveHeal(actor, action, target) {
    var r = VT.dice.roll(action.dmg || '1d8');
    var got = A.healBy(target, r.total);
    log('<b>' + U.esc(actor.name) + '</b> ' + U.esc(action.name) + ' &rarr; <b>' + U.esc(target.name) +
      '</b> <span class="roll">' + r.detail + '</span> <span class="hit">+' + got + '</span>');
    floater(target, '+' + got, '#78b06a');
    VT.bus.emit('fx', { kind: 'burst', from: { x: actor.x, y: actor.y }, to: { x: target.x, y: target.y }, color: '#9ee08a', dur: 0.4 });
    changed();
    return { healed: got };
  }

  function resolveBuff(actor, action, target) {
    A.addCond(target, action.condition);
    log('<b>' + U.esc(actor.name) + '</b> ' + U.esc(action.name) + ' &rarr; <b>' + U.esc(target.name) +
      '</b> is ' + (SRD.CONDITIONS[action.condition] || { name: action.condition }).name.toLowerCase() + '.');
    VT.bus.emit('fx', { kind: 'burst', from: { x: actor.x, y: actor.y }, to: { x: target.x, y: target.y }, color: '#d8b25c', dur: 0.4 });
    changed();
    return { ok: true };
  }

  /* Single entry point the UI calls once a target square is chosen. */
  function performAction(actor, action, tx, ty) {
    if (action.cost === 'action' && actor.actionUsed) return { error: 'Action already used.' };
    if (action.cost === 'bonus' && actor.bonusUsed) return { error: 'Bonus action already used.' };
    if (A.usesLeft(actor, action) <= 0) return { error: 'No uses left.' };

    var target = G.tokenAt(combat.map, tx, ty) || G.anyTokenAt(combat.map, tx, ty);
    var out;
    switch (action.kind) {
      case 'melee':
      case 'ranged':
        if (!target) return { error: 'No target there.' };
        out = resolveAttack(actor, target, action);
        break;
      case 'save':
        out = resolveSave(actor, action, tx, ty);
        break;
      case 'heal':
        if (!target) return { error: 'No target there.' };
        out = resolveHeal(actor, action, target);
        break;
      case 'buff':
        if (!target) return { error: 'No target there.' };
        out = resolveBuff(actor, action, target);
        break;
      default:
        return { error: 'Unknown action type.' };
    }
    if (out && out.blocked) return out;
    A.spendUse(actor, action);
    if (action.cost === 'action') actor.actionUsed = true;
    if (action.cost === 'bonus') actor.bonusUsed = true;
    changed();
    return out;
  }

  /* ---- simple actions -------------------------------------------------- */
  function dash(actor) {
    if (actor.actionUsed) return false;
    actor.actionUsed = true;
    actor.moveLeft += A.speedOf(actor);
    actor.dashed = true;
    log('<b>' + U.esc(actor.name) + '</b> dashes.');
    changed();
    return true;
  }
  function dodge(actor) {
    if (actor.actionUsed) return false;
    actor.actionUsed = true;
    A.addCond(actor, 'dodging');
    log('<b>' + U.esc(actor.name) + '</b> takes the Dodge action.');
    changed();
    return true;
  }
  function disengage(actor) {
    if (actor.actionUsed) return false;
    actor.actionUsed = true;
    actor.disengaged = true;
    log('<b>' + U.esc(actor.name) + '</b> disengages.');
    changed();
    return true;
  }
  function standUp(actor) {
    if (!A.hasCond(actor, 'prone')) return false;
    var cost = Math.ceil(A.speedOf(actor) / 2);
    if (actor.moveLeft < cost) { log('<span class="miss">Not enough movement to stand.</span>'); return false; }
    actor.moveLeft -= cost;
    A.removeCond(actor, 'prone');
    log('<b>' + U.esc(actor.name) + '</b> stands up.');
    changed();
    return true;
  }

  function endTurn() {
    var a = current();
    if (a) {
      A.removeCond(a, 'dodging');
      a.disengaged = false;
    }
    nextTurn();
  }

  /* ---- preview for the UI --------------------------------------------- */
  function preview(attacker, target, action) {
    if (!attacker || !target) return null;
    var advInfo = advantage(attacker, target, action);
    var cover = action.kind === 'melee' ? { cover: 0 } : coverAgainst(attacker, target);
    if (cover.cover === 99) return { blocked: true };
    var ac = A.effectiveAC(target) + (cover.cover || 0);
    var need = U.clamp(ac - action.toHit, 2, 20);
    var p1 = (21 - need) / 20;
    var chance = advInfo.adv > 0 ? 1 - Math.pow(1 - p1, 2)
      : advInfo.adv < 0 ? Math.pow(p1, 2) : p1;
    return {
      chance: Math.round(chance * 100),
      avg: Math.round(VT.dice.avg(action.dmg || '0')),
      adv: advInfo.adv, why: advInfo.why, cover: cover.coverName, ac: ac
    };
  }

  /* ---- frame ----------------------------------------------------------- */
  function update(dt) {
    if (combat.anim) stepMove(dt);
    for (var i = combat.fx.length - 1; i >= 0; i--) {
      combat.fx[i].t += dt;
      if (combat.fx[i].t >= combat.fx[i].dur) combat.fx.splice(i, 1);
    }
  }
  VT.bus.on('fx', function (f) { f.t = 0; combat.fx.push(f); });

  VT.combat = Object.assign(combat, {
    rollInitiative: rollInitiative, end: end, current: current, nextTurn: nextTurn,
    endTurn: endTurn, beginTurn: beginTurn, byId: byId, live: live,
    moveAlong: moveAlong, performAction: performAction, targetsFor: targetsFor,
    aoeTiles: aoeTiles, advantage: advantage, preview: preview, actionReachFt: actionReachFt,
    dash: dash, dodge: dodge, disengage: disengage, standUp: standUp,
    update: update, checkVictory: checkVictory, faceToward: faceToward,
    resolveAttack: resolveAttack
  });
})();
