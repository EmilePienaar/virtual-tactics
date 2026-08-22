/* Virtual Tactics :: data/choicefx.js
   Turning the things a player CHOSE into things on the sheet.

   choices.js finds what a character may pick and records the picks. This turns
   those picks into numbers and actions, and is the choice-tree counterpart to
   features.js.

   Two halves, and the split matters:

     - The generic half applies to everything. Every pick becomes an entry in
       actor.picked, carrying its printed text, so a fighting style, an
       invocation, a maneuver and a feat all appear on the sheet, are searchable,
       and survive a level-up. Feats that raise an ability score do so from the
       record's own `ability` field - 55 of the 77 2024 feats carry one, so that
       part needs no table at all.

     - The curated half is EFFECTS: the handful of options with a clean numeric
       effect worth wiring - Defense's +1 AC, Archery's +2 to hit, Unarmed
       Fighting's bigger die, Agonizing Blast's damage.

   Anything not in EFFECTS still shows its full text; it simply is not doing
   arithmetic on your behalf. That is the same bargain features.js strikes, and
   for the same reason: the effect of "you can reroll 1s and 2s on damage" is
   not something a statblock can hold. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function low(v) { return String(v == null ? '' : v).toLowerCase(); }
  function mod(a, k) { return VT.actor.abilityMod(a, k); }

  /* ==== the curated effects ============================================== */
  /* Keyed by lowercased option name. Each may set:
       acBonus     flat addition to AC
       toHit       {kind:'ranged'|'melee', bonus:n} applied to matching attacks
       damage      {kind:..., bonus:n}
       unarmed     die faces for the unarmed strike
       note        one line explaining what was applied
       action(a)   extra actions                                            */
  var EFFECTS = {
    /* --- fighting styles --- */
    'defense': { acBonus: 1, note: '+1 AC while wearing armour.' },
    'archery': { toHit: { kind: 'ranged', bonus: 2 }, note: '+2 to hit with ranged weapons.' },
    'dueling': { damage: { kind: 'melee', bonus: 2, oneHanded: true },
                 note: '+2 damage with a one-handed melee weapon and no second weapon.' },
    'great weapon fighting': { note: 'Reroll 1s and 2s on damage with a two-handed weapon.' },
    'two-weapon fighting': { note: 'Add your ability modifier to the off-hand attack’s damage.' },
    'protection': { note: 'Reaction: impose disadvantage on an attack against an ally within 5 ft.' },
    'interception': { note: 'Reaction: reduce damage to a creature within 5 ft by 1d10 + proficiency.' },
    'blind fighting': { note: 'Blindsight 10 ft.' },
    'thrown weapon fighting': { damage: { kind: 'ranged', bonus: 2, thrown: true },
                                note: '+2 damage with a thrown weapon.' },
    'unarmed fighting': { unarmed: 6, note: 'Unarmed strikes deal d6 (d8 with both hands free).' },
    'superior technique': { note: 'One maneuver and one superiority die.' },
    'druidic warrior': { note: 'Two druid cantrips, cast with Wisdom.' },
    'blessed warrior': { note: 'Two cleric cantrips, cast with Charisma.' },

    /* --- invocations with a number behind them --- */
    'agonizing blast': {
      note: 'Add your Charisma modifier to Eldritch Blast damage.',
      patch: function (a) {
        var cha = mod(a, 'cha');
        if (cha <= 0) return;
        (a.actions || []).forEach(function (act) {
          if (!/eldritch blast/i.test(act.name || '')) return;
          if (act.__agonizing) return;
          act.__agonizing = true;
          act.dmg = String(act.dmg || '1d10') + U.sign(cha);
        });
      }
    },
    'repelling blast': { note: 'Eldritch Blast pushes a creature 10 ft.' },
    'devil’s sight': { note: 'See in magical and non-magical darkness to 120 ft.' },
    'devils sight': { note: 'See in magical and non-magical darkness to 120 ft.' },
    'armor of shadows': { note: 'Cast Mage Armor on yourself at will.' },
    'eldritch mind': { note: 'Advantage on concentration saves.' },
    'fiendish vigor': { note: 'Cast False Life on yourself at will.' },
    'thirsting blade': { note: 'Attack twice with your pact weapon.' },
    'lifedrinker': { note: 'Extra necrotic damage with your pact weapon.' },
    'pact of the blade': {
      note: 'Summon a magic weapon; it counts as magical and uses your pact ability.'
    },
    'pact of the tome': { note: 'Three cantrips from any list.' },
    'pact of the chain': { note: 'Find Familiar, with more forms available.' },
    'pact of the talisman': { note: 'A talisman that adds d4 to a failed ability check.' }
  };

  /* ==== ability increases from feats ===================================== */
  /* 5etools stores a feat's ability increase in a machine-readable `ability`
     field: either fixed ({"cha": 1}) or a choice with a count, an amount and a
     cap. That is enough to apply it without a table - the UI only has to ask
     WHICH ability when the field says "choose". */
  function abilityNeed(rec) {
    var out = null;
    ((rec && rec.ability) || []).forEach(function (set) {
      if (!set.choose) return;
      out = {
        from: (set.choose.from || SRD.ABILITIES).slice(),
        count: set.choose.count || 1,
        amount: set.choose.amount || 1,
        max: set.max || 20
      };
    });
    return out;
  }

  function fixedAbility(rec) {
    var out = {};
    ((rec && rec.ability) || []).forEach(function (set) {
      if (set.choose) return;
      Object.keys(set).forEach(function (k) {
        if (SRD.ABILITIES.indexOf(k) >= 0) out[k] = (out[k] || 0) + set[k];
      });
    });
    return out;
  }

  /* Every ability point the character's picks are worth, with the cap each one
     allows - epic boons raise a score to 30, ordinary feats stop at 20. */
  function abilityBonuses(c) {
    var bonus = {}, cap = {};
    if (!VT.choices || !c || !c.picks) return { bonus: bonus, cap: cap };
    var build = { classes: (c.classes || []).map(toEntry), picks: c.picks };
    VT.choices.pending(build).forEach(function (ch) {
      if (ch.kind !== 'feat') return;
      (ch.picked || []).forEach(function (p) {
        var rec = findFeat(p);
        if (rec) {
          var fixed = fixedAbility(rec);
          Object.keys(fixed).forEach(function (k) { bonus[k] = (bonus[k] || 0) + fixed[k]; });
          var need = abilityNeed(rec);
          if (need && need.max > 20) {
            (Object.keys(p.abil || {})).forEach(function (k) { cap[k] = Math.max(cap[k] || 20, need.max); });
          }
        }
        /* Whatever the player chose for a "choose an ability" feat. */
        Object.keys(p.abil || {}).forEach(function (k) {
          if (SRD.ABILITIES.indexOf(k) >= 0) bonus[k] = (bonus[k] || 0) + p.abil[k];
        });
      });
    });
    return { bonus: bonus, cap: cap };
  }

  function toEntry(e) {
    return e && e.cls
      ? { name: e.cls.name, source: e.cls.source, level: e.level,
          subclass: e.subclass ? { name: e.subclass.name, source: e.subclass.source } : null }
      : e;
  }

  function findFeat(ref) {
    var FT = VT.fivetools;
    if (!FT || !FT.loaded || !ref) return null;
    return (FT.get('feat') || []).filter(function (f) {
      return low(f.name) === low(ref.name) && (!ref.source || low(f.source) === low(ref.source));
    })[0] || null;
  }

  /* ==== applying everything else ========================================= */
  function apply(actor, c) {
    actor.picked = [];
    if (!VT.choices || !c || !c.picks) return actor;

    var build = { classes: (c.classes || []).map(toEntry), picks: c.picks };
    var patches = [];

    VT.choices.pending(build).forEach(function (ch) {
      if (ch.kind === 'skill' || ch.kind === 'subclass') return;
      (ch.picked || []).forEach(function (p) {
        var rec = findRecordFor(ch, p);
        var e = EFFECTS[low(p.name)];
        var entry = {
          name: p.name, source: p.source || null,
          kind: ch.kind, label: ch.label,
          cls: ch.entry ? ch.entry.name : '',
          note: e && e.note ? e.note : '',
          abil: p.abil || null,
          applied: !!e
        };
        actor.picked.push(entry);

        /* A spell you chose should be castable, not just listed. Convert it the
           same way gear-picked spells are converted in charbuild.derive. */
        if (ch.kind === 'cantrip' || ch.kind === 'spell') {
          var sp = rec || findRecordFor(ch, p);
          if (sp && !hasAction(actor, sp.name)) {
            var act = VT.convert.spell(sp, {
              dc: actor.spellDC || 13,
              atk: actor.spellAttack == null ? VT.actor.prof(actor) : actor.spellAttack,
              mod: actor.castAbility ? mod(actor, actor.castAbility) : 0,
              prof: VT.actor.prof(actor),
              level: actor.level
            });
            if (act) { act.fromChoice = true; actor.actions.push(act); }
          }
          entry.applied = true;
        }
        if (!e) return;

        if (e.acBonus) actor.ac += e.acBonus;
        if (e.unarmed) actor.unarmedDie = Math.max(actor.unarmedDie || 0, e.unarmed);
        if (e.toHit) patches.push({ kind: 'toHit', spec: e.toHit });
        if (e.damage) patches.push({ kind: 'damage', spec: e.damage });
        if (e.patch) patches.push({ kind: 'fn', fn: e.patch });
        if (e.action) (e.action(actor) || []).forEach(function (act) { actor.actions.push(act); });
      });
    });

    /* Attack patches run after every action exists, so a fighting style applies
       to weapons added later in the same derive. */
    patches.forEach(function (p) {
      if (p.kind === 'fn') { p.fn(actor); return; }
      (actor.actions || []).forEach(function (act) {
        if (p.spec.kind && act.kind !== p.spec.kind) return;
        if (p.spec.thrown && !/thrown/i.test(act.name || '')) return;
        if (p.kind === 'toHit' && act.toHit != null) act.toHit += p.spec.bonus;
        if (p.kind === 'damage' && act.dmg) act.dmg = String(act.dmg) + U.sign(p.spec.bonus);
      });
    });

    /* Unarmed Fighting gives the unarmed strike a real die. */
    if (actor.unarmedDie) {
      (actor.actions || []).forEach(function (act) {
        if (!/unarmed strike/i.test(act.name || '')) return;
        var str = mod(actor, 'str');
        act.dmg = '1d' + actor.unarmedDie + (str ? U.sign(str) : '');
      });
    }
    return actor;
  }

  function hasAction(actor, name) {
    var n = low(name);
    return (actor.actions || []).some(function (x) { return low(x.name) === n; });
  }

  function findRecordFor(ch, ref) {
    var FT = VT.fivetools;
    if (!FT || !FT.loaded) return null;
    var kind = ch.kind === 'feat' ? 'feat'
      : ch.kind === 'optionalfeature' ? 'optionalfeature'
      : (ch.kind === 'cantrip' || ch.kind === 'spell') ? 'spell' : null;
    if (!kind) return null;
    return (FT.get(kind) || []).filter(function (r) {
      return low(r.name) === low(ref.name) && (!ref.source || low(r.source) === low(ref.source));
    })[0] || null;
  }

  /* The printed text of a picked option, resolved at render time rather than
     stored - the same bargain charbuild strikes with class features. */
  function textFor(entry) {
    var FT = VT.fivetools;
    if (!FT || !FT.loaded) return '';
    var kinds = entry.kind === 'feat' ? ['feat']
      : entry.kind === 'optionalfeature' ? ['optionalfeature']
      : ['spell'];
    for (var i = 0; i < kinds.length; i++) {
      var rec = (FT.get(kinds[i]) || []).filter(function (r) {
        return low(r.name) === low(entry.name) &&
          (!entry.source || low(r.source) === low(entry.source));
      })[0];
      if (rec) return VT.tags ? VT.tags.toText(rec.entries) : '';
    }
    return '';
  }

  VT.choiceFx = {
    EFFECTS: EFFECTS, apply: apply, abilityBonuses: abilityBonuses,
    abilityNeed: abilityNeed, fixedAbility: fixedAbility, textFor: textFor,
    findFeat: findFeat, findRecordFor: findRecordFor
  };
})();
