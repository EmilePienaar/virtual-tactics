/* Virtual Tactics :: data/features.js
   Mechanical effects for class features.

   5etools stores features as prose — there is no machine-readable "this grants
   expertise in two skills" field anywhere in the data, and no amount of parsing
   will reliably extract one from English. So this is a curated table: the core
   features of the PHB classes, mapped to a small vocabulary of effects the
   sheet can actually apply.

   Everything NOT in this table still appears on the sheet with its full printed
   text — it simply is not wired to anything. That is the honest split, and the
   table is plain data, so adding an entry is a two-line change.

   Effect vocabulary:
     resource     a tracked pool (Ki, Rage, Bardic Inspiration...)
     actions      entries added to the action list
     expertise    number of skills that get double proficiency
     jackOfAllTrades  half proficiency on non-proficient ability checks
     saveBonusAll a flat bonus to every saving throw (Aura of Protection)
     acFormula    replaces AC while unarmoured (Unarmored Defense)
     speedBonus   walking speed increase
     note         a short mechanical reminder shown under the feature */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function mod(a, k) { return SRD.mod(a.abilities[k] || 10); }
  function lvl(a) { return a.level || 1; }
  function byLevel(pairs, level) {
    /* pairs: [[minLevel, value], ...] highest matching wins */
    var v = pairs[0][1];
    pairs.forEach(function (p) { if (level >= p[0]) v = p[1]; });
    return v;
  }

  /* ---- spell slots ------------------------------------------------------ */
  var FULL = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
    [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
    [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
  ];
  var HALF = [
    [], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
    [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2],
    [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]
  ];
  var THIRD = [
    [], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3],
    [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3],
    [4, 3, 3, 1], [4, 3, 3, 1]
  ];
  /* warlock: [number of slots, the level they are cast at] */
  var PACT = [
    [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
    [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]
  ];

  /* How many full-caster levels one class level is worth. The 2014 half-caster
     rounds down and gets nothing at 1st; the artificer - and, in 2024, the
     paladin and ranger, which 5etools marks with the same code - rounds UP, so
     they have slots from 1st level. Third-casters are the Eldritch Knight and
     Arcane Trickster subclasses. */
  function casterLevels(progression, level) {
    if (!level) return 0;
    if (progression === 'full') return level;
    if (progression === 'artificer') return Math.ceil(level / 2);
    if (progression === '1/2') return Math.floor(level / 2);
    if (progression === '1/3') return Math.floor(level / 3);
    return 0;
  }

  function slotsFor(progression, level) {
    var i = U.clamp(level, 1, 20) - 1;
    if (progression === 'pact') {
      var p = PACT[i];
      return { pact: true, count: p[0], slotLevel: p[1] };
    }
    /* The artificer's own table IS the full table read at half its level
       rounded up, which is exactly what casterLevels() computes. */
    if (progression === 'artificer') {
      var eff = casterLevels('artificer', U.clamp(level, 1, 20));
      return { pact: false, slots: (FULL[eff - 1] || []).slice() };
    }
    var table = progression === 'full' ? FULL
      : progression === '1/2' ? HALF
      : progression === '1/3' ? THIRD : null;
    if (!table) return null;
    return { pact: false, slots: (table[i] || []).slice() };
  }

  /* Multiclass slots come from ONE combined caster level read off the full
     table - not from adding each class's own row together. */
  function slotsForCasterLevel(n) {
    if (!n) return null;
    return { pact: false, slots: (FULL[U.clamp(n, 1, 20) - 1] || []).slice() };
  }

  /* ---- small action builders -------------------------------------------- */
  function damageOnly(name, dice, type, desc, cost) {
    /* Not an attack of its own — a damage roll the player adds to a hit. The
       sheet gives any action with dice a roll button, which is exactly right. */
    return { name: name, kind: 'buff', dmg: dice, dmgType: type || 'radiant',
             cost: cost || 'action', desc: desc || '', fromFeature: true };
  }
  function martialArtsDie(level) { return byLevel([[1, '1d4'], [5, '1d6'], [11, '1d8'], [17, '1d10']], level); }
  function bardicDie(level) { return byLevel([[1, '1d6'], [5, '1d8'], [10, '1d10'], [15, '1d12']], level); }
  function sneakDice(level) { return Math.ceil(level / 2) + 'd6'; }

  /* ---- the table --------------------------------------------------------
     Keyed by lower-cased feature name. `cls` narrows it when two classes share
     a feature name that behaves differently. */
  var EFFECTS = {
    /* --- Barbarian --- */
    'rage': { cls: 'barbarian', resource: function (a) {
        return { key: 'rage', name: 'Rage', per: 'long',
                 max: byLevel([[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]], lvl(a)) }; },
      note: 'Advantage on STR checks and saves; bonus melee damage; resistance to physical damage.' },
    'unarmored defense': { resource: null, acFormula: function (a, cls) {
        /* Barbarian uses CON, monk uses WIS — same feature name, different sums */
        var second = /monk/i.test(cls || '') ? 'wis' : 'con';
        return 10 + mod(a, 'dex') + mod(a, second);
      }, note: 'While wearing no armour.' },
    'brutal critical': { note: 'Roll one extra weapon damage die on a critical hit.' },

    /* --- Bard --- */
    'bardic inspiration': { cls: 'bard', resource: function (a) {
        return { key: 'bardic', name: 'Bardic Inspiration', per: lvl(a) >= 5 ? 'short' : 'long',
                 max: Math.max(1, mod(a, 'cha')) }; },
      actions: function (a) {
        return [damageOnly('Bardic Inspiration', bardicDie(lvl(a)), 'radiant',
          'Bonus action: give the die to an ally to add to one roll.', 'bonus')];
      } },
    'jack of all trades': { jackOfAllTrades: true,
      note: 'Half proficiency on ability checks you are not already proficient in.' },
    'expertise': { expertise: 2, note: 'Double proficiency on the chosen skills.' },
    'cutting words': { cls: 'bard', actions: function (a) {
        return [damageOnly('Cutting Words', bardicDie(lvl(a)), 'psychic',
          'Reaction: subtract the roll from an enemy attack, check or damage. Costs a Bardic Inspiration.', 'reaction')];
      } },
    'song of rest': { note: 'Allies regain extra hit points on a short rest.' },

    /* --- Cleric --- */
    'channel divinity': { resource: function (a) {
        return { key: 'channel', name: 'Channel Divinity', per: 'short',
                 max: byLevel([[1, 1], [6, 2], [18, 3]], lvl(a)) }; } },
    'channel divinity|paladin': { resource: function () {
        return { key: 'channel', name: 'Channel Divinity', per: 'short', max: 1 }; } },
    'divine intervention': { resource: function () {
        return { key: 'intervention', name: 'Divine Intervention', per: 'long', max: 1 }; } },

    /* --- Druid --- */
    'wild shape': { resource: function () {
        return { key: 'wildshape', name: 'Wild Shape', per: 'short', max: 2 }; } },

    /* --- Fighter --- */
    'second wind': { resource: function () {
        return { key: 'secondwind', name: 'Second Wind', per: 'short', max: 1 }; },
      actions: function (a) {
        return [{ name: 'Second Wind', kind: 'heal', dmg: '1d10+' + lvl(a),
                  range: [0, 0], cost: 'bonus', fromFeature: true,
                  desc: 'Bonus action: regain 1d10 + fighter level hit points.' }];
      } },
    'action surge': { resource: function (a) {
        return { key: 'actionsurge', name: 'Action Surge', per: 'short',
                 max: byLevel([[1, 1], [17, 2]], lvl(a)) }; } },
    'indomitable': { resource: function (a) {
        return { key: 'indomitable', name: 'Indomitable', per: 'long',
                 max: byLevel([[9, 1], [13, 2], [17, 3]], lvl(a)) }; } },
    'superiority dice': { resource: function (a) {
        return { key: 'superiority', name: 'Superiority Dice', per: 'short',
                 max: byLevel([[3, 4], [7, 5], [15, 6]], lvl(a)) }; } },
    'combat superiority': { resource: function (a) {
        return { key: 'superiority', name: 'Superiority Dice', per: 'short',
                 max: byLevel([[3, 4], [7, 5], [15, 6]], lvl(a)) }; },
      actions: function (a) {
        return [damageOnly('Superiority Die', byLevel([[3, '1d8'], [10, '1d10'], [18, '1d12']], lvl(a)),
          'slashing', 'Spend a superiority die on a manoeuvre.', 'action')];
      } },
    'extra attack': { note: 'Attack twice whenever you take the Attack action.' },

    /* --- Monk --- */
    'ki': { cls: 'monk', resource: function (a) {
        return { key: 'ki', name: 'Ki', per: 'short', max: lvl(a) }; } },
    'martial arts': { cls: 'monk', actions: function (a) {
        var best = Math.max(mod(a, 'dex'), mod(a, 'str'));
        return [{ name: 'Unarmed Strike', kind: 'melee', reach: 5,
                  toHit: VT.actor.prof(a) + best,
                  dmg: martialArtsDie(lvl(a)) + (best ? U.sign(best) : ''),
                  dmgType: 'bludgeoning', cost: 'action', fromFeature: true,
                  desc: 'Bonus action unarmed strike when you attack with a monk weapon.' }];
      } },
    'unarmored movement': { speedBonus: function (a) {
        return byLevel([[2, 10], [6, 15], [10, 20], [14, 25], [18, 30]], lvl(a));
      }, note: 'While wearing no armour and no shield.' },
    'stunning strike': { note: 'Spend 1 ki: the target makes a CON save or is stunned.' },
    'deflect missiles': { note: 'Reaction: reduce ranged weapon damage by 1d10 + monk level + DEX.' },

    /* --- Paladin --- */
    'divine sense': { resource: function (a) {
        return { key: 'divinesense', name: 'Divine Sense', per: 'long', max: 1 + mod(a, 'cha') }; } },
    'lay on hands': { resource: function (a) {
        return { key: 'layonhands', name: 'Lay on Hands (hp)', per: 'long', max: lvl(a) * 5 }; },
      actions: function () {
        return [{ name: 'Lay on Hands', kind: 'heal', dmg: '0', range: [5, 5], cost: 'action',
                  fromFeature: true, desc: 'Spend points from the pool to heal that many hit points.' }];
      } },
    'divine smite': { cls: 'paladin', actions: function () {
        return [damageOnly('Divine Smite', '2d8', 'radiant',
          'On a melee hit, expend a spell slot: 2d8 radiant, +1d8 per slot level above 1st, +1d8 against undead or fiends.')];
      } },
    'aura of protection': { saveBonusAll: function (a) { return Math.max(1, mod(a, 'cha')); },
      note: 'You and allies within 10 ft add your CHA modifier to saving throws.' },
    'aura of courage': { note: 'You and allies within 10 ft cannot be frightened.' },

    /* --- Ranger --- */
    'favored enemy': { note: 'Advantage on Survival to track, and INT checks to recall, your chosen foe.' },
    'natural explorer': { note: 'Doubled proficiency on INT and WIS checks for your favoured terrain.' },

    /* --- Rogue --- */
    'sneak attack': { cls: 'rogue', actions: function (a) {
        return [damageOnly('Sneak Attack', sneakDice(lvl(a)), 'piercing',
          'Once per turn, with advantage or an ally adjacent, using a finesse or ranged weapon.')];
      } },
    'cunning action': { note: 'Bonus action to Dash, Disengage or Hide.' },
    'uncanny dodge': { note: 'Reaction: halve the damage of one attack you can see.' },
    'evasion': { note: 'DEX saves for half damage take none on a success, half on a failure.' },
    'reliable talent': { note: 'Treat any proficient ability check roll below 10 as a 10.' },

    /* --- Sorcerer --- */
    'font of magic': { resource: function (a) {
        return { key: 'sorcery', name: 'Sorcery Points', per: 'long', max: lvl(a) }; } },
    'sorcery points': { resource: function (a) {
        return { key: 'sorcery', name: 'Sorcery Points', per: 'long', max: lvl(a) }; } },

    /* --- Warlock --- */
    'mystic arcanum': { note: 'One free casting of a high-level spell per long rest.' },

    /* --- Wizard --- */
    'arcane recovery': { resource: function () {
        return { key: 'arcanerecovery', name: 'Arcane Recovery', per: 'long', max: 1 }; } }
  };

  /* ---- application ------------------------------------------------------ */
  /* Reads actor.features (already resolved from the compendium) and writes the
     mechanical consequences onto the actor. Idempotent: it rebuilds its own
     output every time, so re-deriving never double-applies anything. */
  function apply(actor, choices) {
    choices = choices || {};
    var className = (choices.cls && choices.cls.name) || actor.className || '';
    var seenResource = {};
    var resources = [];
    var featureActions = [];
    var notes = {};

    actor.expertiseSlots = 0;
    actor.jackOfAllTrades = false;
    actor.saveBonusAll = 0;
    actor.speedBonus = 0;

    (actor.features || []).forEach(function (f) {
      var key = String(f.name || '').toLowerCase().trim();
      /* Each feature remembers which class granted it, which is what makes a
         Cleric/Paladin work: their two Channel Divinities scale differently and
         a single character-wide class name could only ever get one right. */
      var lowClass = String(f.className || className).toLowerCase();
      /* A class-scoped entry wins over the generic one: Channel Divinity is a
         different number of uses for a cleric and a paladin. */
      var e = EFFECTS[key + '|' + lowClass.split(' ')[0]] || EFFECTS[key];
      if (!e) return;
      if (e.cls && lowClass.indexOf(e.cls) < 0) return;

      /* A note is what the sheet shows under the feature AND how it knows to
         mark it 'applied'. Anything that grants a resource or an action is
         just as applied as something with hand-written prose, so say so rather
         than letting the sheet undercount its own work. */
      var did = [];
      if (e.note) notes[f.name] = e.note;

      if (e.resource) {
        var r = e.resource(actor);
        if (r && !seenResource[r.key]) {
          seenResource[r.key] = 1;
          resources.push({ key: r.key, name: r.name, max: r.max, per: r.per, used: 0 });
          did.push('tracked as a resource: ' + r.name + ' (' + r.max + ', per ' + r.per + ' rest)');
        }
      }
      if (e.actions) {
        var made = (e.actions(actor) || []);
        made.forEach(function (act) { featureActions.push(act); });
        if (made.length) {
          did.push('added to your actions: ' + made.map(function (x) { return x.name; }).join(', '));
        }
      }
      if (did.length && !notes[f.name]) notes[f.name] = U.cap(did.join('; '));
      if (e.expertise) actor.expertiseSlots += e.expertise;
      if (e.jackOfAllTrades) actor.jackOfAllTrades = true;
      if (e.saveBonusAll) actor.saveBonusAll = Math.max(actor.saveBonusAll, e.saveBonusAll(actor));
      if (e.speedBonus) actor.speedBonus = Math.max(actor.speedBonus, e.speedBonus(actor));
      if (e.acFormula && !actor.armorName) {
        var ac = e.acFormula(actor, className);
        if (ac > actor.ac) { actor.ac = ac + (actor.shield ? 2 : 0); actor.acNote = 'Unarmored Defense'; }
      }
    });

    /* Carry forward how much of each resource is already spent. */
    var prior = {};
    (actor.resources || []).forEach(function (r) { prior[r.key] = r.used; });
    resources.forEach(function (r) { r.used = Math.min(prior[r.key] || 0, r.max); });
    actor.resources = resources;

    /* Spell slots are their own resource. One class reads its own table; two or
       more contribute to a single combined caster level, with the warlock's
       pact slots kept separate because they come back on a short rest. */
    var multi = (actor.classes || []).length > 1;
    actor.pactSlots = null;
    if (multi && VT.multiclass) {
      var sc = VT.multiclass.spellcasting(actor.classes);
      actor.spellSlots = sc.slots;
      if (sc.pact) actor.pactSlots = { count: sc.pact.count, slotLevel: sc.pact.slotLevel };
      actor.casterLevel = sc.casterLevel;
    } else {
      var prog = choices.cls && choices.cls.casterProgression;
      if (!prog && (actor.classes || []).length === 1 && VT.choices) {
        var rec = VT.choices.classRecord(actor.classes[0]);
        prog = rec && rec.casterProgression;
        if (!prog) {
          var sub = VT.choices.subclassRecord(actor.classes[0]);
          prog = sub && sub.casterProgression;
        }
      }
      actor.spellSlots = prog ? slotsFor(prog, actor.level) : null;
      if (actor.spellSlots && actor.spellSlots.pact) {
        actor.pactSlots = { count: actor.spellSlots.count, slotLevel: actor.spellSlots.slotLevel };
      }
    }
    if (actor.spellSlots) {
      var priorSlots = actor.slotsUsed || {};
      actor.slotsUsed = {};
      if (actor.spellSlots.pact) {
        actor.slotsUsed.pact = Math.min(priorSlots.pact || 0, actor.spellSlots.count);
      } else {
        actor.spellSlots.slots.forEach(function (n, i) {
          actor.slotsUsed[i + 1] = Math.min(priorSlots[i + 1] || 0, n);
        });
      }
    } else {
      actor.slotsUsed = {};
    }

    if (actor.speedBonus) actor.speed = (actor.speed || 30) + actor.speedBonus;

    /* Feature actions go in after gear and spells, and never duplicate. */
    var have = {};
    (actor.actions || []).forEach(function (x) { have[String(x.name).toLowerCase()] = 1; });
    featureActions.forEach(function (act) {
      if (have[String(act.name).toLowerCase()]) return;
      have[String(act.name).toLowerCase()] = 1;
      actor.actions.push(act);
    });

    actor.featureNotes = notes;
    actor.expertise = (choices.expertise || actor.expertise || [])
      .slice(0, actor.expertiseSlots);
    return actor;
  }

  /* ---- derived numbers the sheet asks for ------------------------------- */
  function skillMod(actor, skill) {
    var abil = SRD.SKILL_ABILITY[skill];
    var base = VT.actor.abilityMod(actor, abil);
    var prof = VT.actor.prof(actor);
    if ((actor.expertise || []).indexOf(skill) >= 0) return base + prof * 2;
    if ((actor.skillProf || []).indexOf(skill) >= 0) return base + prof;
    if (actor.jackOfAllTrades) return base + Math.floor(prof / 2);
    return base;
  }

  function skillSource(actor, skill) {
    if ((actor.expertise || []).indexOf(skill) >= 0) return 'expertise';
    if ((actor.skillProf || []).indexOf(skill) >= 0) return 'proficient';
    if (actor.jackOfAllTrades) return 'jack of all trades';
    return '';
  }

  function saveMod(actor, ability) {
    return VT.actor.saveMod(actor, ability) + (actor.saveBonusAll || 0);
  }

  /* ---- resources -------------------------------------------------------- */
  function spend(actor, key, n) {
    var r = (actor.resources || []).find(function (x) { return x.key === key; });
    if (!r) return false;
    n = n == null ? 1 : n;
    if (r.used + n > r.max) return false;
    r.used += n;
    return true;
  }
  function restore(actor, key, n) {
    var r = (actor.resources || []).find(function (x) { return x.key === key; });
    if (!r) return false;
    r.used = Math.max(0, r.used - (n == null ? 1 : n));
    return true;
  }
  /* kind: 'short' | 'long'. A long rest restores everything. */
  function rest(actor, kind) {
    (actor.resources || []).forEach(function (r) {
      if (kind === 'long' || r.per === 'short') r.used = 0;
    });
    if (kind === 'long') { actor.slotsUsed = {}; return; }
    /* Pact magic - and only pact magic - returns on a short rest. For a warlock
       multiclass that means the pact pool refills while the ordinary slots do
       not, so clear that one key rather than the whole record. */
    if (actor.pactSlots || (actor.spellSlots && actor.spellSlots.pact)) {
      actor.slotsUsed = actor.slotsUsed || {};
      actor.slotsUsed.pact = 0;
    }
  }

  function slotsLeft(actor, level) {
    var used = actor.slotsUsed || {};
    /* level omitted, or a pure warlock: the pact pool. */
    if (level == null || (actor.spellSlots && actor.spellSlots.pact)) {
      var p = actor.pactSlots ||
        (actor.spellSlots && actor.spellSlots.pact ? actor.spellSlots : null);
      return p ? p.count - (used.pact || 0) : 0;
    }
    if (!actor.spellSlots || !actor.spellSlots.slots) return 0;
    var max = actor.spellSlots.slots[level - 1] || 0;
    return max - (used[level] || 0);
  }

  function pactLeft(actor) {
    if (!actor.pactSlots) return 0;
    return actor.pactSlots.count - ((actor.slotsUsed || {}).pact || 0);
  }

  VT.features = {
    EFFECTS: EFFECTS, apply: apply, slotsFor: slotsFor,
    casterLevels: casterLevels, slotsForCasterLevel: slotsForCasterLevel,
    skillMod: skillMod, skillSource: skillSource, saveMod: saveMod,
    spend: spend, restore: restore, rest: rest, slotsLeft: slotsLeft, pactLeft: pactLeft,
    bardicDie: bardicDie, martialArtsDie: martialArtsDie, sneakDice: sneakDice,
    covered: Object.keys(EFFECTS).length
  };
})();
