/* Virtual Tactics :: rules/proficiency.js
   What you are trained to use, and what it costs you when you are not.

   Four lists hang off a character: languages, tools, weapons and armour. Tools
   were already there because a thieves' tools check is a thing you roll. The
   other three were not, and their absence was quietly generous: a wizard in
   plate got the full armour class with no penalty, and every weapon on the
   sheet added the proficiency bonus whether or not the character had ever been
   taught to hold it.

   The rules for the two that matter are short:

     - A weapon you are not proficient with does NOT add your proficiency
       bonus to the attack roll. Everything else about it is unchanged.
     - Armour you are not proficient with gives disadvantage on any ability
       check, saving throw or attack roll that uses Strength or Dexterity, and
       you cannot cast spells at all. The armour class itself is unaffected -
       the plate still stops swords, you are just bad at wearing it.

   Neither penalty is applied by editing a number in place. `retune` recomputes
   an attack's proficiency share from a recorded base, and the armour penalty is
   a flag other code reads - because `gear.recompute()` runs again every time
   anything is equipped, and anything that accumulates instead of recomputing
   drifts. See the note about `features.apply()` in the design notes.

   What is a list and what is missing:

     null / absent   nothing is known about this character's training, so no
                     penalty is applied. Monsters, and characters imported as
                     flat statblocks, land here on purpose.
     []              known, and empty. A character with no weapon training
                     really does swing a sword without the bonus. */
(function () {
  'use strict';
  var VT = window.VT;

  var ARMOUR_KINDS = ['light', 'medium', 'heavy', 'shields'];
  var WEAPON_KINDS = ['simple', 'martial'];

  /* ---- reading what the books wrote ------------------------------------ */
  /* The same proficiency is written half a dozen ways across 5etools:

       "light"                      a class's startingProficiencies.armor
       "martial weapons"            the 2024 phrasing
       "longsword|phb"              a specific item, with its source
       {"proficiency": "shields"}   an object wrapper
       {"light": true}              a race's armorProficiencies, as a map
       "{@item thieves' tools|PHB}" a tagged item inside prose

     All of them mean one lowercase word or item name, so normalise hard and
     compare on the result rather than teaching every caller the shapes. */
  function clean(v) {
    if (v == null) return '';
    if (typeof v === 'object') v = v.proficiency || v.name || '';
    var s = String(v);
    /* pull the name out of a {@item ...} tag if there is one */
    var tag = s.match(/\{@item\s+([^|}]+)/i);
    if (tag) s = tag[1];
    s = s.split('|')[0].trim().toLowerCase();
    s = s.replace(/\s+weapons?$/, '').replace(/\s+armou?r$/, '');
    if (s === 'shield') s = 'shields';
    return s;
  }

  /* A list of proficiencies from any of the shapes above, deduplicated.
     Map-shaped entries ({"light": true}) come from race and background
     records; keys whose value is a number are a count of free choices and are
     reported separately by `choicesIn`, not folded in as if they were names. */
  function listOf(raw) {
    var out = [];
    function add(v) {
      var c = clean(v);
      if (c && out.indexOf(c) < 0) out.push(c);
    }
    (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).forEach(function (v) {
      if (v && typeof v === 'object' && !v.proficiency && !v.name) {
        Object.keys(v).forEach(function (k) {
          if (v[k] === true) add(k);
          /* {"choose": {...}} and {"anyStandard": 2} are choices, not grants */
        });
      } else if (typeof v === 'object' && (v.proficiency || v.name)) {
        add(v);
      } else if (typeof v === 'string') {
        add(v);
      }
    });
    return out;
  }

  /* How many free picks a record grants - "two languages of your choice" is
     written as {"anyStandard": 2} and there is nothing to resolve it to, so we
     count them and let the sheet say "2 still to choose". Silently dropping
     them is how a character ends up mysteriously missing Elvish. */
  function choicesIn(raw) {
    var n = 0;
    (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).forEach(function (v) {
      if (!v || typeof v !== 'object') return;
      Object.keys(v).forEach(function (k) {
        if (typeof v[k] === 'number') n += v[k];
        else if (k === 'choose' && v[k] && v[k].count) n += v[k].count;
        else if (k === 'choose') n += 1;
      });
    });
    return n;
  }

  /* ---- gathering a character's training -------------------------------- */
  /* Everything a build grants, from class, race, subrace and background.

     `classes` is the multiclass shape [{cls, subclass, level}]; only the class
     you started as gives its full starting proficiencies, which is what
     multiclass.proficiencies() already works out. Race and background are read
     here because nothing else does.

     Returns {armor, weapons, skills, languages, languageChoices, skillChoices}.
     Tools stay where they are - choices.js already reads them out of prose,
     which is a harder job than this one and not worth duplicating. */
  function gather(c) {
    var out = { armor: [], weapons: [], skills: [], languages: [],
                languageChoices: 0, skillChoices: 0 };
    if (!c) return out;

    if (VT.multiclass && c.classes && c.classes.length) {
      var mc = VT.multiclass.proficiencies(c.classes);
      out.armor = listOf(mc.armor);
      out.weapons = listOf(mc.weapons);
    }

    /* Skills from race and background. The class side is a CHOICE and is made
       on the choice tree, so it is not gathered here - but a race that simply
       grants Perception, and a background that simply grants two skills, were
       being dropped entirely. They are written as a map, {"survival": true,
       "nature": true}, which is the same shape as the rest of this file's
       input, so it costs one more line to read them. */
    [c.race, c.subrace, c.background].forEach(function (rec) {
      if (!rec) return;
      merge(out.armor, listOf(rec.armorProficiencies));
      merge(out.weapons, listOf(rec.weaponProficiencies));
      merge(out.languages, listOf(rec.languageProficiencies));
      merge(out.skills, skillsIn(rec.skillProficiencies));
      out.languageChoices += choicesIn(rec.languageProficiencies);
      out.skillChoices += choicesIn(rec.skillProficiencies);
    });

    /* Everyone speaks the local tongue. The books assume it rather than
       granting it, and a sheet that lists no languages at all reads as a bug. */
    if (out.languages.indexOf('common') < 0) out.languages.unshift('common');
    return out;
  }

  function merge(target, list) {
    list.forEach(function (v) { if (target.indexOf(v) < 0) target.push(v); });
  }

  /* Skill names have to survive normalisation intact. `clean` strips a trailing
     " weapons"/" armour", which no skill name ends in, but it also lowercases -
     and lowercase is exactly the form skillProf is stored in, so that is right.
     What must NOT happen is a skill the sheet cannot match: anything not in the
     18 is dropped rather than added as a row nothing can roll. */
  function skillsIn(raw) {
    var known = (VT.tags && VT.tags.SKILL_ABILITY) || (VT.srd && VT.srd.SKILL_ABILITY) || null;
    return listOf(raw).filter(function (sk) {
      return !known || Object.prototype.hasOwnProperty.call(known, sk);
    });
  }

  /* ---- am I proficient with this? -------------------------------------- */
  /* A missing list means "we were never told", and an unknown is not a
     penalty. An empty list means "told, and the answer is nothing". */
  function known(list) { return Array.isArray(list); }

  /* item may be a 5etools item record, an inventory gear entry, or just a
     name. Category is the "simple"/"martial" side; the name catches a class
     that grants specific weapons, like a rogue's rapier or a monk's
     shortsword. */
  function weaponOk(actor, item, category) {
    var list = actor && actor.weaponProf;
    if (!known(list)) return true;
    var name = clean(typeof item === 'string' ? item : (item && item.name));
    var cat = clean(category != null ? category
      : (item && (item.weaponCategory || item.category)));
    if (cat && list.indexOf(cat) >= 0) return true;
    if (name && list.indexOf(name) >= 0) return true;
    /* An unarmed strike is not a weapon and needs no training; neither do the
       natural attacks a wild-shaped druid or a summon brings with it. Those
       arrive with no category at all, so treat a nameless, categoryless attack
       as fine rather than docking it a bonus it never had. */
    if (!cat && !name) return true;
    return false;
  }

  /* `worn` is an inventory entry with a gear record, or an item record. */
  function armourWeight(worn) {
    if (!worn) return null;
    if (worn.gear) return worn.gear.slot === 'shield' ? 'shields' : worn.gear.weight || null;
    var t = String(worn.type || '').split('|')[0];
    return { HA: 'heavy', MA: 'medium', LA: 'light', S: 'shields' }[t] || null;
  }

  function armourOk(actor, worn) {
    var list = actor && actor.armorProf;
    if (!known(list)) return true;
    var weight = armourWeight(worn);
    if (!weight) return true;
    if (list.indexOf(weight) >= 0) return true;
    /* Heavy armour training implies the lighter kinds in every class list the
       books print, but nothing in the data says so, so do not infer it. The
       one thing worth honouring is a specific grant by name - a race that
       trains you in a single piece of armour. */
    var name = clean(worn && worn.name);
    return !!(name && list.indexOf(name) >= 0);
  }

  /* What you are wearing that you should not be, or null. Read by the sheet,
     the roll helpers and the battle map's advantage calculation. */
  function armourPenalty(actor) {
    if (!actor || !known(actor.armorProf) || !VT.gear) return null;
    var bad = [];
    var arm = VT.gear.armour(actor);
    if (arm && !armourOk(actor, arm)) bad.push(arm.name);
    var shd = VT.gear.shield(actor);
    if (shd && !armourOk(actor, shd)) bad.push(shd.name);
    if (!bad.length) return null;
    return {
      items: bad,
      why: 'not proficient with ' + bad.join(' or '),
      /* spelled out because the penalty is three separate rules and a player
         who sees only "disadvantage" will not know spells are off too */
      note: 'Disadvantage on Strength and Dexterity checks, saves and attacks, ' +
            'and you cannot cast spells, while wearing ' + bad.join(' and ') + '.'
    };
  }

  /* Does an unfamiliar-armour penalty touch this roll? */
  var STR_DEX = { str: 1, dex: 1 };
  function hindersAbility(actor, ability) {
    return !!(actor && actor.armorUnskilled && STR_DEX[ability]);
  }
  function hindersSkill(actor, skill) {
    var abil = VT.tags && VT.tags.SKILL_ABILITY && VT.tags.SKILL_ABILITY[skill];
    return hindersAbility(actor, abil);
  }
  /* Weapon attacks use Strength or Dexterity; a spell attack uses the casting
     ability and is instead forbidden outright. */
  function hindersAttack(actor, act) {
    if (!actor || !actor.armorUnskilled || !act) return false;
    return act.kind === 'melee' || act.kind === 'ranged';
  }
  function blocksSpells(actor) { return !!(actor && actor.armorUnskilled); }

  /* ---- keeping attack bonuses honest ------------------------------------ */
  /* convert.weapon records how much of an attack's `toHit` is the proficiency
     bonus, on `profBonus`. That makes the share removable and re-addable
     without rebuilding the character, which is what changing your training on
     the Edit tab has to do.

     Recomputed from the recorded share every time rather than adjusted, so
     running this twice is the same as running it once. Actions saved before
     this existed carry no `profBonus` and are left exactly alone. */
  function retune(actor) {
    if (!actor || !Array.isArray(actor.actions)) return actor;
    var full = VT.actor ? VT.actor.prof(actor) : 2;
    actor.actions.forEach(function (act) {
      if (!act || act.profBonus == null) return;
      var ok = weaponOk(actor, act.itemName || act.name, act.weaponCategory);
      var want = ok ? full : 0;
      if (want !== act.profBonus) {
        act.toHit = (act.toHit || 0) + (want - act.profBonus);
        act.profBonus = want;
      }
      if (ok) delete act.notProficient;
      else act.notProficient = true;
    });
    return actor;
  }

  /* ---- characters saved before any of this existed ---------------------- */
  /* They have no lists at all, which reads as "nothing is known" and so costs
     them nothing - but it also means their Proficiencies card is empty, and a
     fighter with a blank armour row looks broken rather than untold.

     If the build references are still there and the compendium can resolve
     them, work the lists out now. If it cannot - no data connected, or a
     character imported as a flat statblock - leave them absent, because a
     guess here becomes a penalty on the sheet. Runs once: it only fills what
     is missing, so it is safe to call on every load. */
  function backfill(actor) {
    if (!actor || known(actor.armorProf)) return actor;
    var refs = actor.build;
    if (!refs || !VT.charbuild || !VT.charbuild.fromRefs) return actor;
    var r = VT.charbuild.fromRefs(refs);
    if (!r || !r.choices || !r.choices.classes.length) return actor;
    /* fromRefs hands back the record shape, [{cls, subclass, level}]; what
       multiclass.proficiencies looks up is the flat one the actor carries,
       [{name, source, level}]. Different shapes, same list, and passing the
       wrong one fails silently by finding no class at all. */
    var out = gather({
      classes: r.choices.classes.map(function (e) {
        return { name: e.cls.name, source: e.cls.source || null, level: e.level || 1 };
      }),
      race: r.choices.race, subrace: r.choices.subrace, background: r.choices.background
    });
    actor.armorProf = out.armor;
    actor.weaponProf = out.weapons;
    actor.langProf = merged(out.languages, actor.langProf);
    actor.langChoices = out.languageChoices;
    /* Skills already exist on every character, so this MERGES rather than
       replaces - a hand-toggled proficiency must not be thrown away by a
       backfill that only meant to add the race's. */
    actor.skillProf = merged(out.skills, actor.skillProf);
    return actor;
  }

  function merged(a, b) {
    var out = a.slice();
    (b || []).forEach(function (v) {
      var c = clean(v);
      if (c && out.indexOf(c) < 0) out.push(c);
    });
    return out;
  }

  VT.proficiency = {
    ARMOUR_KINDS: ARMOUR_KINDS, WEAPON_KINDS: WEAPON_KINDS,
    backfill: backfill,
    clean: clean, listOf: listOf, choicesIn: choicesIn, gather: gather,
    skillsIn: skillsIn,
    weaponOk: weaponOk, armourOk: armourOk, armourWeight: armourWeight,
    armourPenalty: armourPenalty,
    hindersAbility: hindersAbility, hindersSkill: hindersSkill,
    hindersAttack: hindersAttack, blocksSpells: blocksSpells,
    retune: retune
  };
})();
