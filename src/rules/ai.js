/* Virtual Tactics :: rules/ai.js
   Monster turns. Deliberately simple and readable so a DM can predict it -
   it plays like a competent but unsubtle opponent: find the best shot it can
   actually reach this turn, prefer the high ground, and finish wounded targets.
   Turn off "Foes act on their own" in Settings to drive them by hand instead. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, A = VT.actor, C = VT.combat, G = VT.gmap, P = VT.path;

  function enemiesOf(actor) {
    return C.map.tokens.filter(function (t) { return t.hp > 0 && t.team !== actor.team; });
  }
  function alliesOf(actor) {
    return C.map.tokens.filter(function (t) { return t.hp > 0 && t.team === actor.team && t.id !== actor.id; });
  }

  function usable(actor, action) {
    if (action.cost === 'action' && actor.actionUsed) return false;
    if (action.cost === 'bonus' && actor.bonusUsed) return false;
    if (action.cost === 'reaction') return false;
    return A.usesLeft(actor, action) > 0;
  }

  /* How good is firing `action` at `target` from tile (x,y)? */
  function scoreShot(actor, action, target, x, y, elevBonus) {
    var map = C.map;
    var ghost = { x: x, y: y, id: actor.id, team: actor.team, conditions: actor.conditions, ac: actor.ac };
    var ft = Math.max(U.gridDist(x, y, target.x, target.y),
      Math.abs(G.elev(map, x, y) - G.elev(map, target.x, target.y))) * VT.iso.FT;
    var reach = C.actionReachFt(action);
    if (ft > reach) return null;
    if (action.kind !== 'melee') {
      var l = P.los(map, { x: x, y: y }, target);
      if (l.blocked) return null;
    }
    var avg = VT.dice.avg(action.dmg || '0');
    var est = avg;
    if (action.kind === 'melee' || action.kind === 'ranged') {
      var acEff = A.effectiveAC(target) + (action.kind === 'melee' ? 0 : (P.los(map, { x: x, y: y }, target).cover || 0));
      var need = U.clamp(acEff - action.toHit, 2, 20);
      var chance = (21 - need) / 20;
      if (VT.store.settings().highGround && G.elev(map, x, y) > G.elev(map, target.x, target.y)) {
        chance = 1 - Math.pow(1 - chance, 2);
      }
      est = avg * chance;
    } else if (action.kind === 'save') {
      est = avg * 0.75;
      /* count everyone the blast would catch, friendly fire included */
      var tiles = P.inRadius(map, target.x, target.y, (action.aoe && action.aoe.radius) || 5, true);
      var hits = 0, friends = 0;
      map.tokens.forEach(function (t) {
        if (t.hp <= 0) return;
        if (!tiles.some(function (p) { return p.x === t.x && p.y === t.y; })) return;
        if (t.team === actor.team) friends++; else hits++;
      });
      est = est * hits - est * friends * 1.4;
      if (hits === 0) return null;
    }
    /* finishing blow is worth more than overkill */
    if (est >= target.hp) est += 6;
    est += (elevBonus || 0);
    return est;
  }

  /* Decide the whole turn: where to stand, what to do there. */
  function plan(actor) {
    var map = C.map;
    var foes = enemiesOf(actor);
    if (!foes.length) return null;

    var budget = A.canAct(actor) ? actor.moveLeft : 0;
    var range = P.reachable(map, actor, budget);
    var actions = (actor.actions || []).filter(function (a) { return usable(actor, a); });

    /* 1. heal a badly hurt ally if we can */
    var healAct = actions.find(function (a) { return a.kind === 'heal'; });
    if (healAct) {
      var hurt = alliesOf(actor).concat([actor]).filter(function (t) { return t.hp < t.hpMax * 0.45; })
        .sort(function (a, b) { return (a.hp / a.hpMax) - (b.hp / b.hpMax); })[0];
      if (hurt) {
        var reachFt = C.actionReachFt(healAct);
        var spot = bestTileWhere(range, function (x, y) {
          return Math.max(U.gridDist(x, y, hurt.x, hurt.y)) * VT.iso.FT <= reachFt;
        }, actor, map);
        if (spot) return { move: spot, action: healAct, tx: hurt.x, ty: hurt.y };
      }
    }

    /* 2. best attack from any tile we can reach */
    var best = null;
    range.forEach(function (node) {
      var elevBonus = G.elev(map, node.x, node.y) * 0.6 - node.cost * 0.012;
      if (node.danger) elevBonus -= 8;      // don't stand in the lava
      if (node.fall) elevBonus -= 4;
      actions.forEach(function (action) {
        var pool = action.kind === 'save' ? foes.concat(foes) : foes;
        pool.forEach(function (target) {
          var s = scoreShot(actor, action, target, node.x, node.y, elevBonus);
          if (s == null) return;
          if (!best || s > best.score) {
            best = { score: s, move: node, action: action, tx: target.x, ty: target.y };
          }
        });
      });
    });
    if (best) return best;

    /* 3. nothing in reach - close the distance */
    var nearest = foes.slice().sort(function (a, b) {
      return U.gridDist(actor.x, actor.y, a.x, a.y) - U.gridDist(actor.x, actor.y, b.x, b.y);
    })[0];
    var approach = null, approachScore = Infinity;
    range.forEach(function (node) {
      if (node.danger) return;
      var d = U.gridDist(node.x, node.y, nearest.x, nearest.y);
      var s = d * 10 - G.elev(map, node.x, node.y) * 0.8 + node.cost * 0.001;
      if (s < approachScore) { approachScore = s; approach = node; }
    });
    return approach ? { move: approach, action: null, approach: true } : null;
  }

  function bestTileWhere(range, pred, actor, map) {
    var best = null, bestScore = -Infinity;
    range.forEach(function (node) {
      if (!pred(node.x, node.y)) return;
      var s = G.elev(map, node.x, node.y) * 0.6 - node.cost * 0.01 - (node.danger ? 20 : 0);
      if (s > bestScore) { bestScore = s; best = node; }
    });
    return best;
  }

  /* ---- execution ------------------------------------------------------- */
  function takeTurn(actor, done) {
    if (!actor || actor.hp <= 0) return done();

    if (!A.canAct(actor)) {
      VT.bus.emit('log', '<b>' + U.esc(actor.name) + '</b> cannot act.');
      return setTimeout(done, 300);
    }
    if (A.hasCond(actor, 'prone')) C.standUp(actor);

    var p = plan(actor);
    if (!p) return setTimeout(done, 250);

    var range = P.reachable(C.map, actor, actor.moveLeft);
    var path = (p.move && (p.move.x !== actor.x || p.move.y !== actor.y))
      ? P.pathTo(range, p.move.x, p.move.y) : null;

    var afterMove = function () {
      if (p.action) {
        C.faceToward(actor, p.tx, p.ty);
        var res = C.performAction(actor, p.action, p.tx, p.ty);
        if (res && res.error) VT.bus.emit('log', '<span class="miss">' + U.esc(res.error) + '</span>');
        /* a second swing if it still has a bonus action attack */
        var bonus = (actor.actions || []).find(function (a) { return a.cost === 'bonus' && usable(actor, a) && a.kind === 'melee'; });
        if (bonus) {
          var t = C.map.tokens.find(function (t2) { return t2.x === p.tx && t2.y === p.ty && t2.hp > 0; });
          if (t) setTimeout(function () { C.performAction(actor, bonus, p.tx, p.ty); setTimeout(done, 450); }, 420);
          else setTimeout(done, 450);
          return;
        }
      }
      setTimeout(done, 480);
    };

    if (path && path.length > 1) C.moveAlong(actor, path, afterMove);
    else setTimeout(afterMove, 220);
  }

  VT.ai = { takeTurn: takeTurn, plan: plan };
})();
