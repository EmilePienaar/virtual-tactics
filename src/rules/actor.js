/* Virtual Tactics :: rules/actor.js
   Actor construction and the derived numbers combat asks for. An "actor" is a
   plain object: a roster entry is a template, and putting one on the board
   clones it into a token with its own id and per-encounter state. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function base(name) {
    return {
      id: U.uid('a'),
      name: name || 'Unnamed',
      team: 'party',
      level: 3,
      size: 'medium',
      ac: 12,
      hpMax: 10, hp: 10, tempHp: 0,
      speed: 30,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProf: [],
      actions: [],
      conditions: [],
      resist: [], vulnerable: [], immune: [],
      coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      spriteId: null,
      spec: null,
      x: 0, y: 0, fx: 1, fy: 1,
      notes: '',
      /* per-turn state, reset by combat */
      initiative: 0, moveLeft: 30, actionUsed: false, bonusUsed: false,
      reactionUsed: false, dashed: false, deathSaves: { s: 0, f: 0 }, used: {}
    };
  }

  function fromClass(key, name, level) {
    var c = SRD.CLASSES[key];
    if (!c) return base(name);
    var a = base(name || c.name);
    level = U.clamp(level || 3, 1, 20);
    a.level = level;
    a.className = c.name;
    a.classKey = key;
    a.team = 'party';
    a.ac = c.ac;
    a.speed = c.speed;
    a.abilities = U.clone(c.abilities);
    var conMod = SRD.mod(a.abilities.con);
    var avgDie = c.hitDie / 2 + 0.5;
    a.hpMax = Math.max(1, Math.round(c.hitDie + conMod + (level - 1) * (avgDie + conMod)));
    a.hp = a.hpMax;
    a.actions = U.clone(c.actions);
    a.spec = VT.spriteart.autoSpec(a.name, c.spec);
    a.saveProf = key === 'wizard' ? ['int', 'wis'] : key === 'rogue' ? ['dex', 'int'] : ['str', 'con'];
    return a;
  }

  function fromMonster(key, name) {
    var m = SRD.MONSTERS[key];
    if (!m) return base(name);
    var a = base(name || m.name);
    a.monsterKey = key;
    a.team = 'foe';
    a.size = m.size;
    a.ac = m.ac;
    a.hpMax = m.hp; a.hp = m.hp;
    a.speed = m.speed;
    a.abilities = U.clone(m.abilities);
    a.actions = U.clone(m.actions);
    a.cr = m.cr;
    a.resist = U.clone(m.resist || []);
    a.vulnerable = U.clone(m.vulnerable || []);
    a.immune = U.clone(m.immune || []);
    a.regen = m.regen || 0;
    a.spec = VT.spriteart.autoSpec(a.name, m.spec);
    a.level = crToLevel(m.cr);
    return a;
  }

  function crToLevel(cr) {
    if (!cr) return 1;
    if (String(cr).indexOf('/') >= 0) return 1;
    return Math.max(1, parseInt(cr, 10) || 1);
  }

  /* A board token: fresh id, full hp, no leftover conditions. */
  function instance(template, over) {
    var a = U.clone(template);
    a.id = U.uid('t');
    a.templateId = template.id;
    a.hp = a.hpMax;
    a.tempHp = 0;
    a.conditions = [];
    a.used = {};
    a.deathSaves = { s: 0, f: 0 };
    resetTurn(a);
    return Object.assign(a, over || {});
  }

  /* ---- derived numbers ------------------------------------------------- */
  function abilityMod(a, k) { return SRD.mod((a.abilities && a.abilities[k]) || 10); }
  function prof(a) { return SRD.profBonus(a.level || 1); }
  function saveMod(a, k) {
    return abilityMod(a, k) + ((a.saveProf || []).indexOf(k) >= 0 ? prof(a) : 0);
  }
  function passivePerception(a) { return 10 + abilityMod(a, 'wis'); }

  /* AC as it stands this instant: the sheet's number, plus anything the active
     conditions add (Haste is +2, the Shield spell +5), plus a manual override
     for whatever the rules did not model. Combat asks for this, not a.ac, so a
     hasted target is genuinely harder to hit. */
  function effectiveAC(a) {
    var ac = (a.ac || 10) + (a.acBonus || 0);
    (a.conditions || []).forEach(function (c) {
      var def = SRD.CONDITIONS[c];
      if (def && def.acBonus) ac += def.acBonus;
    });
    return ac;
  }

  /* What is adding to it, for the "18 (+2 hasted)" hint. */
  function acSources(a) {
    var out = [];
    if (a.acBonus) out.push(U.sign(a.acBonus) + ' manual');
    (a.conditions || []).forEach(function (c) {
      var def = SRD.CONDITIONS[c];
      if (def && def.acBonus) out.push(U.sign(def.acBonus) + ' ' + def.name.toLowerCase());
    });
    return out;
  }

  function speedOf(a) {
    var s = a.speed || 30;
    (a.conditions || []).forEach(function (c) {
      var def = SRD.CONDITIONS[c];
      if (!def) return;
      if (def.speed0) s = 0;
      if (def.speedMult) s = Math.round(s * def.speedMult);
    });
    return s;
  }

  function canAct(a) {
    if (a.hp <= 0) return false;
    return !(a.conditions || []).some(function (c) {
      return SRD.CONDITIONS[c] && SRD.CONDITIONS[c].noAct;
    });
  }

  function hasCond(a, c) { return (a.conditions || []).indexOf(c) >= 0; }
  function addCond(a, c) {
    a.conditions = a.conditions || [];
    if (a.conditions.indexOf(c) < 0) a.conditions.push(c);
  }
  function removeCond(a, c) {
    a.conditions = (a.conditions || []).filter(function (x) { return x !== c; });
  }

  function resetTurn(a) {
    a.moveLeft = speedOf(a);
    a.actionUsed = false;
    a.bonusUsed = false;
    a.dashed = false;
    a.movedThisTurn = 0;
  }

  function usesLeft(a, action) {
    if (!action.uses) return Infinity;
    var spent = (a.used && a.used[action.name]) || 0;
    return Math.max(0, action.uses.max - spent);
  }
  function spendUse(a, action) {
    if (!action.uses) return;
    a.used = a.used || {};
    a.used[action.name] = ((a.used[action.name]) || 0) + 1;
  }

  /* ---- damage ---------------------------------------------------------- */
  function applyDamage(a, amount, type) {
    var before = a.hp;
    if (type && (a.immune || []).indexOf(type) >= 0) return { taken: 0, immune: true, hp: a.hp };
    if (type && (a.resist || []).indexOf(type) >= 0) amount = Math.floor(amount / 2);
    if (type && (a.vulnerable || []).indexOf(type) >= 0) amount = amount * 2;
    var toTemp = Math.min(a.tempHp || 0, amount);
    a.tempHp = (a.tempHp || 0) - toTemp;
    amount -= toTemp;
    a.hp = Math.max(0, a.hp - amount);
    var downed = before > 0 && a.hp === 0;
    var deathFail = null;
    if (downed) {
      a.conditions = ['unconscious'];
      a.deathSaves = { s: 0, f: 0 };
      a.stable = false;
    } else if (before === 0 && amount > 0) {
      /* already down: the hit itself is a failed death save */
      deathFail = deathSaveDamage(a, !!(type && type.crit));
    }
    return {
      taken: amount + toTemp, absorbed: toTemp, hp: a.hp, downed: downed,
      deathFail: deathFail,
      resisted: type && (a.resist || []).indexOf(type) >= 0,
      vulnerable: type && (a.vulnerable || []).indexOf(type) >= 0
    };
  }

  function healBy(a, amount) {
    var was = a.hp;
    if (a.hp === 0 && amount > 0) removeCond(a, 'unconscious');
    a.hp = Math.min(a.hpMax, a.hp + amount);
    return a.hp - was;
  }

  /* ---- UI helper ------------------------------------------------------- */
  /* A small canvas portrait for the initiative strip and roster lists. */
  function portrait(a, w, h) {
    var c = document.createElement('canvas');
    c.width = w || 52; c.height = h || 42;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    /* VT.sprites lives in the renderer, which the character builder does not
       load - fall back to generated art rather than exploding. */
    var hasSprites = !!(VT.sprites && VT.sprites.getImage);
    var img = (a.spriteId && hasSprites) ? VT.sprites.getImage(a.spriteId) : null;
    var rec = (a.spriteId && VT.store && VT.store.getSprite) ? VT.store.getSprite(a.spriteId) : null;
    function place(src, sx, sy, sw, sh) {
      var scale = Math.min(c.width / sw, c.height / sh);
      var dw = sw * scale, dh = sh * scale;
      ctx.drawImage(src, sx, sy, sw, sh, (c.width - dw) / 2, c.height - dh, dw, dh);
    }
    if (hasSprites && VT.sprites.ready(img) && rec) {
      var fw = rec.cols > 1 ? img.width / rec.cols : img.width;
      var fh = rec.rows > 1 ? img.height / rec.rows : img.height;
      place(img, 0, 0, fw, fh);
    } else {
      var spr = VT.spriteart.get(a.spec || VT.spriteart.autoSpec(a.name));
      place(spr, 0, 0, spr.width, spr.height);
    }
    return c;
  }

  /* ---- death saves -------------------------------------------------------
     Three successes and you are stable; three failures and you are dead. A
     natural 20 puts you back on your feet with one hit point; a natural 1
     counts as two failures. Damage taken while at zero is itself a failure,
     and two if the hit was a critical.

     Worth tracking rather than remembering, because the whole table loses
     count and the difference is a character. */
  function deathSaveState(a) {
    a.deathSaves = a.deathSaves || { s: 0, f: 0 };
    return a.deathSaves;
  }

  function deathSaveOutcome(a) {
    var d = deathSaveState(a);
    if (d.f >= 3) return 'dead';
    if (d.s >= 3) return 'stable';
    return '';
  }

  /* Record a d20. `nat` is the die face, so a 20 and a 1 can be told apart
     from a modified total. Returns what happened, for the sheet to say. */
  function deathSave(a, nat) {
    var d = deathSaveState(a);
    if (nat >= 20) {
      a.deathSaves = { s: 0, f: 0 };
      a.hp = Math.max(1, a.hp);
      removeCond(a, 'unconscious');
      return { result: 'revived', note: 'natural 20 — back up with 1 hit point' };
    }
    if (nat <= 1) {
      d.f = Math.min(3, d.f + 2);
      return { result: 'fumble', note: 'natural 1 — two failures', outcome: deathSaveOutcome(a) };
    }
    if (nat >= 10) {
      d.s = Math.min(3, d.s + 1);
      var out = deathSaveOutcome(a);
      if (out === 'stable') { a.deathSaves = { s: 0, f: 0 }; a.stable = true; }
      return { result: 'success', outcome: out };
    }
    d.f = Math.min(3, d.f + 1);
    return { result: 'failure', outcome: deathSaveOutcome(a) };
  }

  /* Damage while already down. */
  function deathSaveDamage(a, crit) {
    var d = deathSaveState(a);
    d.f = Math.min(3, d.f + (crit ? 2 : 1));
    a.stable = false;
    return { result: crit ? 'fumble' : 'failure', outcome: deathSaveOutcome(a) };
  }

  function clearDeathSaves(a) { a.deathSaves = { s: 0, f: 0 }; a.stable = false; }

  /* ---- attunement --------------------------------------------------------
     A character can be attuned to three magic items at once. The rule is worth
     modelling rather than leaving to memory because it is a real constraint on
     a party's loot, and the sheet is where the argument about it happens. */
  var ATTUNE_MAX = 3;

  function attuneMax(a) { return (a && a.attuneMax) || ATTUNE_MAX; }
  function attunedTo(a) { return (a && a.attuned) || []; }
  function attuneCount(a) { return attunedTo(a).length; }
  function attuneFull(a) { return attuneCount(a) >= attuneMax(a); }

  function isAttuned(a, name) {
    var n = String(name || '').toLowerCase();
    return attunedTo(a).some(function (x) { return String(x.name).toLowerCase() === n; });
  }

  function attune(a, item) {
    a.attuned = a.attuned || [];
    if (isAttuned(a, item.name)) return { ok: false, reason: 'Already attuned.' };
    if (attuneFull(a)) {
      return { ok: false, reason: 'Already attuned to ' + attuneMax(a) + ' items.' };
    }
    a.attuned.push({ name: item.name, source: item.source || null,
                     note: typeof item.reqAttune === 'string' ? item.reqAttune : '' });
    return { ok: true };
  }

  function unattune(a, name) {
    var n = String(name || '').toLowerCase();
    a.attuned = attunedTo(a).filter(function (x) { return String(x.name).toLowerCase() !== n; });
    return { ok: true };
  }

  VT.actor = {
    deathSave: deathSave, deathSaveDamage: deathSaveDamage,
    deathSaveState: deathSaveState, deathSaveOutcome: deathSaveOutcome,
    clearDeathSaves: clearDeathSaves,
    attuneMax: attuneMax, attunedTo: attunedTo, attuneCount: attuneCount,
    attuneFull: attuneFull, isAttuned: isAttuned, attune: attune, unattune: unattune,
    ATTUNE_MAX: ATTUNE_MAX,
    base: base, fromClass: fromClass, fromMonster: fromMonster, instance: instance,
    abilityMod: abilityMod, prof: prof, saveMod: saveMod, passivePerception: passivePerception,
    speedOf: speedOf, effectiveAC: effectiveAC, acSources: acSources, canAct: canAct, hasCond: hasCond, addCond: addCond, removeCond: removeCond,
    resetTurn: resetTurn, usesLeft: usesLeft, spendUse: spendUse,
    applyDamage: applyDamage, healBy: healBy, portrait: portrait
  };
})();
