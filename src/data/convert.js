/* Virtual Tactics :: data/convert.js
   5etools records -> Virtual Tactics statblocks.

   The source data is written to be *displayed*, not executed, so conversion is
   part schema-mapping (exact) and part prose-parsing (best effort, via
   tags.js). Anything ambiguous lands in the statblock as editable numbers, so
   a wrong guess is a two-second fix in the Forge rather than a dead end. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, T = VT.tags, SRD = VT.srd;

  var SIZE = { T: 'tiny', S: 'small', M: 'medium', L: 'large', H: 'huge', G: 'gargantuan' };
  var DMG = {
    A: 'acid', B: 'bludgeoning', C: 'cold', F: 'fire', O: 'force', L: 'lightning',
    N: 'necrotic', P: 'piercing', I: 'poison', Y: 'psychic', R: 'radiant',
    S: 'slashing', T: 'thunder'
  };
  var ABILITY_FULL = {
    strength: 'str', dexterity: 'dex', constitution: 'con',
    intelligence: 'int', wisdom: 'wis', charisma: 'cha'
  };
  /* creature type -> which procedural sprite build to use */
  var BUILD = {
    beast: 'beast', dragon: 'dragon', undead: 'undead', construct: 'construct',
    ooze: 'ooze', monstrosity: 'beast', elemental: 'construct', plant: 'beast',
    aberration: 'ooze', fiend: 'humanoid', celestial: 'humanoid', fey: 'humanoid',
    giant: 'humanoid', humanoid: 'humanoid'
  };

  /* ---- small helpers ---------------------------------------------------- */
  function flatten(list) {
    /* resist/immune arrays mix plain strings with {resist:[...], note, cond} */
    var out = [];
    (function walk(v) {
      if (v == null) return;
      if (typeof v === 'string') { out.push(v.toLowerCase()); return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      ['resist', 'immune', 'vulnerable', 'conditionImmune'].forEach(function (k) {
        if (v[k]) walk(v[k]);
      });
    })(list);
    return out.filter(function (s) { return SRD.DAMAGE_TYPES.indexOf(s) >= 0; });
  }

  function acOf(mon) {
    var a = mon.ac;
    if (a == null) return 10;
    if (typeof a === 'number') return a;
    if (Array.isArray(a)) {
      for (var i = 0; i < a.length; i++) {
        var e = a[i];
        if (typeof e === 'number') return e;
        if (e && typeof e.ac === 'number') return e.ac;
        if (e && e.special) {
          var m = String(e.special).match(/(\d+)/);
          if (m) return parseInt(m[1], 10);
        }
      }
    }
    return 10;
  }

  function hpOf(mon) {
    var h = mon.hp;
    if (h == null) return 1;
    if (typeof h === 'number') return h;
    if (typeof h.average === 'number') return h.average;
    if (h.formula) return Math.max(1, Math.round(VT.dice.avg(h.formula)));
    if (h.special) {
      var m = String(h.special).match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    return 1;
  }

  function speedOf(mon) {
    var s = mon.speed;
    if (s == null) return 30;
    if (typeof s === 'number') return s;
    var best = 0;
    ['walk', 'fly', 'swim', 'climb', 'burrow'].forEach(function (k) {
      var v = s[k];
      if (v == null) return;
      var n = typeof v === 'number' ? v : (v && typeof v.number === 'number' ? v.number : 0);
      if (k === 'walk') best = Math.max(best, n);
      else best = Math.max(best, n * 0.999);   // prefer walk on a tie
    });
    return Math.round(best) || 30;
  }

  function typeOf(mon) {
    var t = mon.type;
    if (!t) return 'humanoid';
    if (typeof t === 'string') return t.toLowerCase();
    if (t.type) return typeof t.type === 'string' ? t.type.toLowerCase()
      : (t.type.choose ? String(t.type.choose[0]).toLowerCase() : 'humanoid');
    return 'humanoid';
  }

  function crOf(mon) {
    var c = mon.cr;
    if (c == null) return null;
    if (typeof c === 'string' || typeof c === 'number') return String(c);
    if (c.cr) return String(c.cr);
    return null;
  }

  /* Some statblocks express damage as a formula rather than fixed dice:
       "1d8 + 3 + summonSpellLevel"      Tasha's summon spells
       "1d8 + 2 + PB"                    beast-master companions
       "(summonSpellLevel - 4)d4 + 3"    scaling dice counts
     Those are not dice notation, so the roller rejects them and the attack
     silently deals nothing - the worst possible failure. Substitute the
     variables for concrete numbers, evaluate the arithmetic, and drop any term
     whose dice count came out at zero or less. The result is a real expression
     the engine can roll, and the Forge leaves it editable. */
  function resolveFormula(expr, ctx) {
    if (expr == null) return expr;
    ctx = ctx || {};
    var s = String(expr).trim();
    if (!s) return '0';

    var hasVars = /\{\{/.test(s) || /[A-Za-z]/.test(s.replace(/\d*d\d+/g, '').replace(/\s+/g, ''));
    if (hasVars) {
      s = s.replace(/\{\{\s*spellcasting_mod\s*\}\}/gi, String(ctx.mod == null ? 3 : ctx.mod))
           .replace(/\{\{[^}]*\}\}/g, '0')          // any other template placeholder
           .replace(/\bPB\b/g, String(ctx.prof == null ? 2 : ctx.prof))
           .replace(/\bsummonSpellLevel\b|\bsummonClassLevel\b|\bsummonLevel\b/g,
                    String(ctx.summonLevel == null ? 5 : ctx.summonLevel));
      /* collapse "(5 - 4)" style groups that prefix a dice term */
      for (var i = 0; i < 3; i++) {
        s = s.replace(/\(\s*(-?\d+)\s*([+-])\s*(\d+)\s*\)/g, function (_, a, op, b) {
          return String(op === '+' ? (+a) + (+b) : (+a) - (+b));
        });
      }
      /* a term like "-1d4" or "0d6" means that size/tier does not apply */
      s = s.replace(/([+-]?)\s*(-?\d+)d(\d+)/g, function (m, sign, n, faces) {
        return (+n) > 0 ? (sign || '') + n + 'd' + faces : '';
      });
      s = s.replace(/\s*\+\s*\+/g, '+').replace(/^\s*[+]\s*/, '').trim();
    }
    /* Normalise a stray "+-3" into "-3" - valid arithmetic, invalid notation. */
    s = s.replace(/\+\s*-/g, '-').replace(/-\s*\+/g, '-');
    if (!s) return '0';

    /* Last line of defence, applied to EVERY expression however it was built:
       whatever comes out of here must actually roll. A visible zero the DM can
       correct beats an expression that silently contributes nothing. */
    return VT.dice.roll(s).invalid ? '0' : s;
  }

  /* CR -> a "level" for proficiency-bonus purposes. */
  function crToLevel(cr) {
    if (!cr) return 1;
    if (String(cr).indexOf('/') >= 0) return 1;
    var n = parseInt(cr, 10);
    return isNaN(n) ? 1 : Math.max(1, n);
  }

  /* Pick a weapon look for the procedural sprite from what it attacks with. */
  function weaponFor(actions) {
    var text = actions.map(function (a) { return a.name; }).join(' ').toLowerCase();
    if (/bow|sling|crossbow/.test(text)) return 'bow';
    if (/axe/.test(text)) return 'axe';
    if (/spear|pike|lance|javelin|trident/.test(text)) return 'spear';
    if (/greatsword|maul|greatclub/.test(text)) return 'greatsword';
    if (/dagger|shortsword|scimitar/.test(text)) return 'dagger';
    if (/claw|bite|talon|tentacle|slam/.test(text)) return 'claws';
    if (/staff|wand|spell|bolt/.test(text)) return 'staff';
    if (/sword|blade|mace|hammer|flail|morningstar/.test(text)) return 'sword';
    return 'sword';
  }

  /* ---- creature --------------------------------------------------------- */
  function creature(mon, opts) {
    opts = opts || {};
    var a = VT.actor.base(mon.name);
    a.team = opts.team || 'foe';
    a.source = mon.source;
    a.size = SIZE[Array.isArray(mon.size) ? mon.size[0] : mon.size] || 'medium';
    a.ac = acOf(mon);
    a.hpMax = hpOf(mon);
    a.hp = a.hpMax;
    a.speed = speedOf(mon);
    a.abilities = {
      str: mon.str || 10, dex: mon.dex || 10, con: mon.con || 10,
      int: mon.int || 10, wis: mon.wis || 10, cha: mon.cha || 10
    };
    a.cr = crOf(mon);
    a.level = crToLevel(a.cr);
    a.saveProf = mon.save ? Object.keys(mon.save).filter(function (k) { return SRD.ABILITIES.indexOf(k) >= 0; }) : [];
    a.resist = flatten(mon.resist);
    a.immune = flatten(mon.immune);
    a.vulnerable = flatten(mon.vulnerable);
    a.creatureType = typeOf(mon);
    a.alignment = Array.isArray(mon.alignment) ? mon.alignment.join('') : (mon.alignment || '');
    a.languages = Array.isArray(mon.languages) ? mon.languages.join(', ') : (mon.languages || '');
    a.senses = Array.isArray(mon.senses) ? mon.senses.join(', ') : (mon.senses || '');
    if (mon.trait) {
      a.notes = mon.trait.map(function (t) {
        return T.render(t.name, 'text') + ': ' + T.toText(t.entries);
      }).join('\n\n');
      var regen = a.notes.match(/regains?\s+(\d+)\s+hit points/i);
      if (regen) a.regen = parseInt(regen[1], 10);
    }

    /* actions */
    a.actions = [];
    (mon.action || []).forEach(function (act) {
      var m = T.mechanics(act);
      if (m.kind === 'buff' && !m.dmg) {
        /* No attack roll and no save - keep it as a note-only ability so the
           DM can still see and narrate it, but it does nothing mechanical. */
        m.kind = 'buff'; m.condition = m.applies || null; m.range = [5, 5];
      }
      a.actions.push(m);
    });
    (mon.reaction || []).forEach(function (act) {
      var m = T.mechanics(act, { reaction: true });
      m.cost = 'reaction';
      a.actions.push(m);
    });
    if (opts.includeLegendary !== false) {
      (mon.legendary || []).forEach(function (act) {
        var m = T.mechanics(act);
        m.name = '★ ' + m.name;
        a.actions.push(m);
      });
    }
    /* spellcasting, if we have a spell compendium to resolve names against */
    (mon.spellcasting || []).forEach(function (sc) {
      spellcastingActions(sc, a).forEach(function (x) { a.actions.push(x); });
    });

    if (!a.actions.length) {
      /* Critters and summon templates often have no action block at all. Give
         them something rollable - and note that a negative modifier must not be
         glued on as "+-4", which is not valid dice notation. */
      var sm = VT.actor.abilityMod(a, 'str');
      a.actions.push(SRD.melee('Attack', 2 + sm, '1d4' + (sm ? U.sign(sm) : ''), 'bludgeoning'));
    }

    /* Resolve any formula-based damage into rollable dice. */
    var fctx = { prof: VT.actor.prof(a), summonLevel: opts.summonLevel || 5 };
    a.actions.forEach(function (act) {
      if (!act.dmg) return;
      var resolved = resolveFormula(act.dmg, fctx);
      if (resolved !== act.dmg) {
        act.variable = true;
        act.dmgRaw = act.dmg;
        act.dmg = resolved;
      }
    });

    a.spec = VT.spriteart.autoSpec(mon.name, {
      kind: BUILD[a.creatureType] || 'humanoid',
      weapon: weaponFor(a.actions)
    });
    return a;
  }

  /* Monster spellcasting blocks -> castable actions. */
  function spellcastingActions(sc, actor) {
    var out = [];
    var header = T.toText(sc.headerEntries || '');
    var dcM = header.match(/DC\s*(\d+)/i);
    var atkM = header.match(/([+-]\d+)\s+to hit with spell/i);
    var dc = dcM ? parseInt(dcM[1], 10) : 8 + VT.actor.prof(actor) + VT.actor.abilityMod(actor, sc.ability || 'cha');
    var atk = atkM ? parseInt(atkM[1], 10) : VT.actor.prof(actor) + VT.actor.abilityMod(actor, sc.ability || 'cha');

    function addList(names, uses, label) {
      (names || []).forEach(function (raw) {
        var nm = String(raw).replace(/\{@spell\s+([^}|]+)[^}]*\}/i, '$1').replace(/[{}]/g, '').trim();
        var rec = VT.fivetools.byName('spell', nm);
        if (!rec) return;
        var act = spell(rec, { dc: dc, atk: atk, level: actor.level });
        if (!act) return;
        if (uses) act.uses = { max: uses, per: 'rest' };
        if (label) act.name = act.name + ' (' + label + ')';
        out.push(act);
      });
    }
    addList(sc.will, 0, 'at will');
    Object.keys(sc.daily || {}).forEach(function (k) {
      var n = parseInt(k, 10) || 1;
      addList(sc.daily[k], n, n + '/day');
    });
    Object.keys(sc.spells || {}).forEach(function (lvl) {
      var slot = sc.spells[lvl];
      addList(slot.spells, slot.slots || 0, lvl === '0' ? 'cantrip' : 'level ' + lvl);
    });
    return out;
  }

  /* ---- spell ------------------------------------------------------------ */
  /* opts: {dc, atk, level} - the caster's numbers, since a spell has none. */
  function spell(sp, opts) {
    opts = opts || {};
    var raw = T.rawOf(sp.entries) + ' ' + T.rawOf(sp.entriesHigherLevel || '');
    var act = {
      name: sp.name,
      cost: (sp.time && sp.time[0] && sp.time[0].unit === 'bonus') ? 'bonus' : 'action',
      spell: true,
      level: sp.level,
      school: sp.school,
      desc: T.toText(sp.entries)
    };

    /* range */
    var ft = 60;
    if (sp.range) {
      var r = sp.range;
      if (r.type === 'point' && r.distance) {
        if (r.distance.type === 'feet') ft = r.distance.amount || 60;
        else if (r.distance.type === 'touch') ft = 5;
        else if (r.distance.type === 'self') ft = 0;
        else if (r.distance.type === 'miles') ft = (r.distance.amount || 1) * 5280;
        else ft = 60;
      } else if (r.type === 'radius' || r.type === 'sphere' || r.type === 'cone' ||
                 r.type === 'line' || r.type === 'cube' || r.type === 'hemisphere') {
        ft = (r.distance && r.distance.amount) || 15;
        act.aoe = { radius: ft };
        ft = 0;
      } else if (r.type === 'special') ft = 60;
    }

    /* Damage expression. Cantrips are the awkward case: their entries carry the
       1st-level dice inline AND a scalingLevelDice table, so the inline tag
       must lose or every cantrip stays frozen at its level-1 damage. */
    var allTags = T.splitTags(raw);
    var dmgTags = allTags.filter(function (t) { return t.tag === 'damage'; });
    var diceTags = allTags.filter(function (t) { return t.tag === 'dice'; });
    var expr = dmgTags.length ? dmgTags[0].parts[0] : null;
    if (sp.scalingLevelDice && (sp.level === 0 || !expr)) {
      var sld = Array.isArray(sp.scalingLevelDice) ? sp.scalingLevelDice[0] : sp.scalingLevelDice;
      var scaling = sld && sld.scaling;
      if (scaling) {
        var lvl = opts.level || 1;
        var best = null;
        Object.keys(scaling).map(Number).sort(function (a, b) { return a - b; })
          .forEach(function (k) { if (k <= lvl) best = scaling[k]; });
        expr = best || scaling[Object.keys(scaling)[0]] || expr;
      }
    }
    /* Healing is written with {@dice}, not {@damage} - pick that up too. */
    var anyExpr = expr || (diceTags.length ? diceTags[0].parts[0] : null);
    var dtype = (sp.damageInflict && sp.damageInflict[0]) || null;
    if (!dtype) {
      var dm = raw.match(/\{@damage[^}]+\}\)?\s*([a-z]+)\s+damage/i);
      dtype = dm ? dm[1].toLowerCase() : 'force';
    }

    /* area, if the prose says so and range didn't already tell us */
    if (!act.aoe) {
      var aoeM = raw.match(/(\d+)[- ]foot[- ](?:radius|sphere|cone|line|cube)/i);
      if (aoeM) act.aoe = { radius: parseInt(aoeM[1], 10) };
    }

    if (sp.savingThrow && sp.savingThrow.length) {
      act.kind = 'save';
      act.save = ABILITY_FULL[String(sp.savingThrow[0]).toLowerCase()] || 'dex';
      act.dc = opts.dc || 13;
      act.half = /half as much damage|half damage/i.test(raw);
      act.dmg = expr || '0';
      act.dmgType = dtype;
      act.range = [ft || (act.aoe ? 60 : 30), ft || (act.aoe ? 60 : 30)];
    } else if (sp.spellAttack && sp.spellAttack.length) {
      act.kind = String(sp.spellAttack[0]).toUpperCase() === 'M' ? 'melee' : 'ranged';
      act.toHit = opts.atk == null ? 5 : opts.atk;
      act.dmg = expr || '1d8';
      act.dmgType = dtype;
      if (act.kind === 'melee') act.reach = ft || 5;
      else act.range = [ft || 60, ft || 60];
    } else if (/regains?\s+hit points|healing/i.test(raw) || /\bheal/i.test(sp.name)) {
      act.kind = 'heal';
      act.dmg = anyExpr || '1d8';
      act.range = [ft || 30, ft || 30];
    } else {
      /* buffs, utility, control - carry the condition if we can spot one */
      act.kind = 'buff';
      act.range = [ft || 30, ft || 30];
      var condTag = T.splitTags(raw).find(function (t) {
        return t.tag === 'condition' && SRD.CONDITIONS[String(t.parts[0]).toLowerCase()];
      });
      act.condition = condTag ? String(condTag.parts[0]).toLowerCase() : 'blessed';
      if (expr) {
        /* Damage, but the spell names neither a saving throw nor an attack
           roll: Magic Missile and its kind simply hit. The battle map has no
           "just hits" action, so it is still resolved as a DEX save there;
           the sheets say `auto` rather than showing a DC that is not real. */
        act.kind = 'save'; act.save = 'dex'; act.dc = opts.dc || 13;
        act.dmg = expr; act.dmgType = dtype;
        act.half = !/automatically|without an attack roll|strikes? .*simultaneous/i.test(raw);
        act.autoHit = !act.half;
        /* The buff branch above sets a default condition before we know this
           is damage. Leaving it behind put "blessed" on Magic Missile, which
           is not a thing it does. */
        if (act.condition === 'blessed') delete act.condition;
      }
    }
    /* Spell text carries its own placeholders ({{spellcasting_mod}} in a few
       cantrips), so run the same resolver the creature path uses. */
    if (act.dmg != null) {
      act.dmg = resolveFormula(act.dmg, {
        mod: opts.mod == null ? 3 : opts.mod,
        prof: opts.prof,
        summonLevel: opts.level
      });
    }

    /* What this spell does with a bigger slot, and how many projectiles it
       throws at its own level. Cantrips scale with character level instead and
       have no upcast rule at all. */
    act.spellLevel = sp.level || 0;
    if (sp.level > 0 && VT.upcast) {
      var up = VT.upcast.parse(sp);
      if (up) {
        act.upcast = up;
        if (up.kind === 'count') act.count = VT.upcast.baseCount(sp);
      }
    }
    return act;
  }

  /* ---- weapon item ------------------------------------------------------ */
  /* opts: {str, dex, prof} - the wielder's numbers. */
  function weapon(item, opts) {
    opts = opts || {};
    if (!item || (!item.dmg1 && !item.weapon)) return null;
    var props = (item.property || []).map(function (p) {
      return typeof p === 'string' ? p : (p && p.uid ? String(p.uid).split('|')[0] : '');
    });
    var finesse = props.indexOf('F') >= 0;
    var isRanged = String(item.type || '').split('|')[0] === 'R' || props.indexOf('A') >= 0;
    var thrown = props.indexOf('T') >= 0;

    var str = opts.str == null ? 0 : opts.str;
    var dex = opts.dex == null ? 0 : opts.dex;
    var mod = (isRanged || (finesse && dex > str)) ? dex : str;
    var prof = opts.prof == null ? 2 : opts.prof;

    /* `bonusWeapon` is the generic "+X to attack AND damage". The split
       bonusWeaponAttack / bonusWeaponDamage fields exist for items that only
       boost one of the two, so each side falls back to the generic value. */
    var bonusAtk = parseInt(item.bonusWeapon || item.bonusWeaponAttack || 0, 10) || 0;
    var bonusDmg = parseInt(item.bonusWeaponDamage || item.bonusWeapon || 0, 10) || 0;

    /* Some "weapons" deal no damage at all - a net restrains instead. Without
       this guard the expression comes out as the string "undefined+2". */
    var dmgMod = mod + bonusDmg;
    var expr = item.dmg1
      ? item.dmg1 + (dmgMod ? (dmgMod > 0 ? '+' : '') + dmgMod : '')
      : '0';
    var act = {
      name: item.name,
      toHit: prof + mod + bonusAtk,
      dmg: expr,
      dmgType: DMG[item.dmgType] || 'bludgeoning',
      cost: 'action',
      itemName: item.name
    };
    if (isRanged || (thrown && !item.dmg1)) {
      act.kind = 'ranged';
      var rng = String(item.range || '30/120').split('/');
      act.range = [parseInt(rng[0], 10) || 30, parseInt(rng[1], 10) || parseInt(rng[0], 10) || 120];
    } else {
      act.kind = 'melee';
      act.reach = props.indexOf('R') >= 0 ? 10 : 5;
      if (thrown) act.thrown = String(item.range || '20/60');
    }
    if (props.indexOf('V') >= 0 && item.dmg2) act.versatile = item.dmg2;
    return act;
  }

  /* ---- misc lookups ----------------------------------------------------- */
  function abilityBonusesFromRace(race) {
    var out = {};
    var ab = race && race.ability && race.ability[0];
    if (!ab) return out;
    Object.keys(ab).forEach(function (k) {
      if (SRD.ABILITIES.indexOf(k) >= 0) out[k] = ab[k];
    });
    return out;
  }

  function raceSpeed(race) {
    if (!race || race.speed == null) return 30;
    if (typeof race.speed === 'number') return race.speed;
    if (race.speed.walk) return typeof race.speed.walk === 'number' ? race.speed.walk : 30;
    return 30;
  }

  function raceSize(race) {
    var s = race && race.size;
    if (!s) return 'medium';
    return SIZE[Array.isArray(s) ? s[0] : s] || 'medium';
  }

  VT.convert = {
    creature: creature, spell: spell, weapon: weapon,
    abilityBonusesFromRace: abilityBonusesFromRace, raceSpeed: raceSpeed, raceSize: raceSize,
    SIZE: SIZE, DMG: DMG, ABILITY_FULL: ABILITY_FULL, BUILD: BUILD,
    acOf: acOf, hpOf: hpOf, speedOf: speedOf, typeOf: typeOf, crOf: crOf, crToLevel: crToLevel, resolveFormula: resolveFormula,
    flatten: flatten
  };
})();
