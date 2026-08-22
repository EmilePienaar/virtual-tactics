/* Virtual Tactics :: data/multiclass.js
   Multiclassing rules.

   A character is a list of {name, source, subclass, level} entries. Total level
   drives proficiency; each class contributes its own hit die and its own share
   of one combined spellcasting level.

   Three things are easy to get wrong and are handled explicitly here:

     - Spell slots come from ONE combined caster level read off the full-caster
       table, not from adding each class's own slot row together. A Cleric 3 /
       Wizard 3 is a 6th-level caster with 3rd-level slots, not two 2nd-level
       casters.
     - Warlock pact slots stay separate. They recharge on a short rest and are
       tracked alongside, never merged in.
     - Only the FIRST class gives you its full starting proficiencies. Every
       class after that gives the shorter multiclassing list, and neither the
       2014 nor the 2024 book gives a multiclass its saving-throw proficiencies. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function low(v) { return String(v == null ? '' : v).toLowerCase(); }
  function FT() { return VT.fivetools; }

  /* ==== the list ========================================================= */
  function normalise(build) {
    return VT.choices.classList(build);
  }

  function totalLevel(classes) {
    return (classes || []).reduce(function (n, c) { return n + (c.level || 0); }, 0);
  }

  function profBonus(classes) { return SRD.profBonus(U.clamp(totalLevel(classes), 1, 20)); }

  function label(classes) {
    return (classes || []).map(function (c) {
      return c.name + (c.subclass ? ' (' + c.subclass.name + ')' : '') + ' ' + c.level;
    }).join(' / ');
  }

  /* ==== requirements ===================================================== */
  /* 2014 classes carry multiclassing.requirements outright. 2024 classes do
     not: the rule became "13 in the class's primary ability", which 5etools
     stores as primaryAbility. Fall back to that. */
  function requirementsFor(clsRec) {
    if (!clsRec) return null;
    var mc = clsRec.multiclassing || {};
    if (mc.requirements) return mc.requirements;
    if (clsRec.primaryAbility && clsRec.primaryAbility.length) {
      /* primaryAbility is an OR list: Fighter is STR or DEX. */
      var opts = clsRec.primaryAbility.map(function (set) {
        var req = {};
        Object.keys(set).forEach(function (k) { if (set[k]) req[k] = 13; });
        return req;
      });
      return opts.length === 1 ? opts[0] : { or: opts };
    }
    return null;
  }

  /* '' if the character qualifies, otherwise a short reason. */
  function requirementReason(clsRec, abilities) {
    var req = requirementsFor(clsRec);
    if (!req || !abilities) return '';
    var sets = req.or ? req.or : [req];
    var misses = [];
    for (var i = 0; i < sets.length; i++) {
      var miss = [];
      Object.keys(sets[i]).forEach(function (k) {
        if (!SRD.ABILITY_NAME[k]) return;
        if ((abilities[k] || 0) < sets[i][k]) miss.push(SRD.ABILITY_NAME[k] + ' ' + sets[i][k]);
      });
      if (!miss.length) return '';
      misses.push(miss.join(' and '));
    }
    return 'needs ' + misses.join(', or ');
  }

  /* ==== hit points ======================================================= */
  /* The first class takes its die at maximum for the character's very first
     level; everything after that is the die's average rounded up, plus
     Constitution, exactly as charbuild does for a single class. */
  function hitPoints(classes, conMod) {
    var total = 0, first = true;
    (classes || []).forEach(function (entry) {
      var faces = dieFor(entry);
      var levels = entry.level || 0;
      if (!levels) return;
      if (first) {
        total += faces + conMod;
        levels -= 1;
        first = false;
      }
      total += levels * (Math.floor(faces / 2) + 1 + conMod);
    });
    return Math.max(1, total);
  }

  function dieFor(entry) {
    var rec = VT.choices.classRecord(entry);
    return (rec && rec.hd && rec.hd.faces) || 8;
  }

  /* Hit dice, grouped by size - a Fighter 3 / Rogue 2 has 3d10 and 2d8. */
  function hitDice(classes) {
    var by = {};
    (classes || []).forEach(function (e) {
      if (!e.level) return;
      var f = dieFor(e);
      by[f] = (by[f] || 0) + e.level;
    });
    return Object.keys(by).map(Number).sort(function (a, b) { return b - a; })
      .map(function (f) { return { faces: f, count: by[f] }; });
  }

  /* ==== spellcasting ===================================================== */
  /* One combined caster level, plus the warlock's separate pact slots. */
  function spellcasting(classes) {
    var casterLevel = 0, pactLevel = 0, casters = [];
    (classes || []).forEach(function (entry) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      var prog = rec.casterProgression;
      if (prog === 'pact') { pactLevel += entry.level || 0; casters.push(entry); return; }
      /* A third-caster subclass (Eldritch Knight, Arcane Trickster) turns an
         otherwise non-casting class into one. */
      if (!prog) {
        var sub = VT.choices.subclassRecord(entry);
        if (sub && sub.casterProgression) prog = sub.casterProgression;
      }
      var add = VT.features.casterLevels(prog, entry.level || 0);
      if (add) { casterLevel += add; casters.push(entry); }
    });

    var slots = casterLevel ? VT.features.slotsForCasterLevel(casterLevel) : null;
    var pact = pactLevel ? VT.features.slotsFor('pact', pactLevel) : null;
    return { casterLevel: casterLevel, slots: slots, pact: pact, casters: casters };
  }

  /* Spell save DC and attack bonus are per class, because each uses its own
     ability. The sheet shows the highest, and lists the rest. */
  function spellStats(classes, actor) {
    var prof = profBonus(classes);
    var out = [];
    (classes || []).forEach(function (entry) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      var ability = rec.spellcastingAbility;
      if (!ability) {
        var sub = VT.choices.subclassRecord(entry);
        ability = sub && sub.spellcastingAbility;
      }
      if (!ability) return;
      var mod = VT.actor.abilityMod(actor, ability);
      out.push({ cls: entry.name, ability: ability, dc: 8 + prof + mod, attack: prof + mod });
    });
    return out;
  }

  /* ==== proficiencies ==================================================== */
  /* Returns {armor:[], weapons:[], tools:[], saves:[], skillChoices:[]} for the
     whole character, with the first class full and the rest reduced. */
  function proficiencies(classes) {
    var out = { armor: [], weapons: [], tools: [], saves: [], skillChoices: [] };
    (classes || []).forEach(function (entry, i) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      if (i === 0) {
        var sp = rec.startingProficiencies || {};
        push(out.armor, sp.armor);
        push(out.weapons, sp.weapons);
        push(out.tools, sp.tools);
        push(out.saves, rec.proficiency);
        (sp.skills || []).forEach(function (s) { if (s.choose) out.skillChoices.push(s.choose); });
      } else {
        var mc = (rec.multiclassing || {}).proficienciesGained || {};
        push(out.armor, mc.armor);
        push(out.weapons, mc.weapons);
        push(out.tools, mc.tools);
        /* Saving throws are deliberately absent: no edition grants them on a
           multiclass, and quietly adding them would break every save DC. */
        (mc.skills || []).forEach(function (s) { if (s.choose) out.skillChoices.push(s.choose); });
      }
    });
    return out;
  }

  function push(target, src) {
    (src || []).forEach(function (v) {
      var name = typeof v === 'string' ? v : (v.proficiency || v.name || JSON.stringify(v));
      if (typeof v === 'object' && !v.proficiency && !v.name) return;   // choose-blocks
      if (target.indexOf(name) < 0) target.push(name);
    });
  }

  /* ==== editing the list ================================================= */
  function addClass(build, clsRec) {
    build.classes = normalise(build).slice();
    var existing = build.classes.filter(function (c) {
      return low(c.name) === low(clsRec.name) && low(c.source) === low(clsRec.source);
    })[0];
    if (existing) { existing.level += 1; return existing; }
    var entry = { name: clsRec.name, source: clsRec.source || null, subclass: null, level: 1 };
    build.classes.push(entry);
    delete build.cls;              /* the single-class shape is now stale */
    delete build.subclass;
    return entry;
  }

  function setLevel(build, index, level) {
    build.classes = normalise(build).slice();
    var e = build.classes[index];
    if (!e) return false;
    level = U.clamp(level, 0, 20);
    if (level === 0) {
      if (build.classes.length === 1) return false;   // must keep one
      build.classes.splice(index, 1);
    } else {
      e.level = level;
    }
    delete build.cls;
    delete build.subclass;
    return true;
  }

  /* Every class on the character whose ability requirement is not met, for a
     builder that let the choice through because the scores had not been rolled
     yet. Returns [{name, reason}]. */
  function unmetRequirements(classes, abilities) {
    var out = [];
    (classes || []).forEach(function (entry) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      var why = requirementReason(rec, abilities);
      if (why) out.push({ name: entry.name, reason: why });
    });
    return out;
  }

  /* The class the character started as - the one whose hit die is maximised
     and whose full proficiencies they got. */
  function primary(classes) { return (classes || [])[0] || null; }

  VT.multiclass = {
    normalise: normalise, totalLevel: totalLevel, profBonus: profBonus, label: label,
    requirementsFor: requirementsFor, requirementReason: requirementReason,
    hitPoints: hitPoints, hitDice: hitDice, dieFor: dieFor,
    spellcasting: spellcasting, spellStats: spellStats,
    proficiencies: proficiencies,
    addClass: addClass, setLevel: setLevel, primary: primary,
    unmetRequirements: unmetRequirements
  };
})();
