/* Virtual Tactics :: data/companion.js
   The ranger's animal, and what its numbers actually are.

   Built the same way as Wild Shape: the companion is a separate stat block
   shown beside the sheet rather than anything folded into the character, so
   swapping animals is replacing one object and dismissing one is deleting it.

   Three different things are called a companion, and they do not work alike:

     Beast Master (2014)   any beast of CR 1/4 or lower, Medium or smaller,
                           straight out of the bestiary
     Primal Companion      Beast of the Land / Sea / Sky - fixed stat blocks
       (Tasha's, 2024)     that scale with ranger level
     Drakewarden           a single Drake Companion, also scaling

   The scaling ones are the reason this file exists. Their AC and hit points are
   not numbers in the data - they are English:

     ac: [{ special: "13 + PB (natural armor)" }]
     hp: { special: "5 + five times your ranger level" }

   convert.creature reads the leading digits and stops, which gives a companion
   5 hit points. Resolving those two sentences against the ranger they belong to
   is most of what this does. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  var WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
                eight: 8, nine: 9, ten: 10 };

  /* ---- whose companion is it -------------------------------------------- */

  function rangerLevel(actor) {
    var n = 0;
    (actor.classes || []).forEach(function (c) {
      if (/ranger/i.test(c.name || '')) n = Math.max(n, c.level || 0);
    });
    if (!n && /ranger/i.test(actor.className || '')) n = actor.level || 0;
    return n;
  }

  function subclassOf(actor) {
    var found = null;
    (actor.classes || []).forEach(function (c) {
      if (/ranger/i.test(c.name || '') && c.subclass) {
        found = c.subclass.shortName || c.subclass.name;
      }
    });
    if (!found && /ranger/i.test(actor.className || '')) {
      var m = String(actor.className).match(/\(([^)]+)\)/);
      if (m) found = m[1];
    }
    return found;
  }

  /* Which flavour of companion this character gets, or null for none. */
  function kind(actor) {
    var lvl = rangerLevel(actor);
    if (!lvl) return null;
    var sub = String(subclassOf(actor) || '');
    if (/drakewarden/i.test(sub)) return lvl >= 3 ? 'drake' : null;
    if (/beast\s*master/i.test(sub)) {
      if (lvl < 3) return null;
      /* Tasha's replaced the 2014 companion with the Primal ones, and the 2024
         book made that the only version. Offer both lists rather than guessing
         which one a table is using - the beasts are still legal at any table
         playing the older feature. */
      return 'beastmaster';
    }
    return null;
  }

  /* ---- the choices ------------------------------------------------------- */

  var PRIMAL = ['Beast of the Land', 'Beast of the Sea', 'Beast of the Sky'];

  function creature(name) {
    var FT = VT.fivetools;
    if (!FT || !FT.get) return null;
    return (FT.get('creature') || []).find(function (m) { return m.name === name; }) || null;
  }

  /* Beasts a 2014 Beast Master may take: CR 1/4 or lower, Medium or smaller. */
  function classicBeasts(actor, opts) {
    opts = opts || {};
    var FT = VT.fivetools;
    if (!FT || !FT.get) return [];
    var WS = VT.wildshape;
    return (FT.get('creature') || []).filter(function (m) {
      if (!/beast/i.test(VT.convert.typeOf(m) || '')) return false;
      if (opts.all) return true;
      var cr = WS.crNumber(VT.convert.crOf(m));
      if (cr == null || cr > 0.25) return false;
      var size = Array.isArray(m.size) ? m.size[0] : m.size;
      return ['T', 'S', 'M'].indexOf(size) >= 0;
    }).sort(function (a, b) {
      var d = (WS.crNumber(VT.convert.crOf(a)) || 0) - (WS.crNumber(VT.convert.crOf(b)) || 0);
      return d || String(a.name).localeCompare(String(b.name));
    });
  }

  /* Everything this character may choose, grouped so the two Beast Master
     versions do not look like one confusing list. */
  function options(actor, opts) {
    var k = kind(actor);
    if (!k) return [];
    if (k === 'drake') {
      var d = creature('Drake Companion');
      return d ? [{ group: 'Drakewarden', list: [d] }] : [];
    }
    var out = [];
    var primal = PRIMAL.map(creature).filter(Boolean);
    if (primal.length) out.push({ group: 'Primal Companion', list: primal });
    var classic = classicBeasts(actor, opts);
    if (classic.length) out.push({ group: 'Beast (2014 Ranger’s Companion)', list: classic });
    return out;
  }

  /* ---- resolving the prose ----------------------------------------------- */

  /* "13 + PB (natural armor)" -> 13 + the ranger's proficiency bonus. */
  function specialAC(mon, prof) {
    var entry = Array.isArray(mon.ac) ? mon.ac[0] : mon.ac;
    var text = entry && entry.special;
    if (!text) return null;
    var m = String(text).match(/(\d+)\s*\+\s*PB/i);
    return m ? parseInt(m[1], 10) + prof : null;
  }

  /* "5 + five times your ranger level" -> 5 + 5 x level. */
  function specialHP(mon, level) {
    var text = mon.hp && mon.hp.special;
    if (!text) return null;
    var m = String(text).match(/(\d+)\s*\+\s*([a-z]+|\d+)\s+times your/i);
    if (!m) return null;
    var per = WORDS[String(m[2]).toLowerCase()];
    if (per == null) per = parseInt(m[2], 10);
    if (isNaN(per)) return null;
    return parseInt(m[1], 10) + per * level;
  }

  /* Build the block to sit beside the sheet, with the owner's numbers folded
     in. Anything that could not be resolved is left as the data had it and
     said out loud, rather than quietly guessed at. */
  function assume(mon, actor) {
    var block = VT.convert.creature(mon, { team: 'party' });
    var level = rangerLevel(actor);
    var prof = VT.actor.prof(actor);
    var notes = [];

    var ac = specialAC(mon, prof);
    var hp = specialHP(mon, level);
    var scaling = !!(ac || hp);

    if (ac) block.ac = ac;
    if (hp) { block.hpMax = hp; block.hp = hp; }
    if (scaling && !ac) notes.push('AC could not be read from the stat block.');
    if (scaling && !hp) notes.push('Hit points could not be read from the stat block.');

    /* A scaling companion attacks with the RANGER's numbers, and the stat
       block says so in prose the converter cannot turn into a number:

         {@atk mw} {@hitYourSpellAttack} to hit ... {@damage 1d8 + 2 + PB}

       Unresolved, that comes out as an ability with no attack roll and a
       proficiency bonus guessed at 2 - so a level 8 companion hits for one
       less than it should and cannot be rolled to hit at all. Both halves are
       fixable here, where the owner is known. */
    var actions = (block.actions || []).map(function (x) { return U.clone(x); });
    if (scaling) {
      var spellAtk = actor.spellAttack != null
        ? actor.spellAttack
        : prof + VT.actor.abilityMod(actor, 'wis');
      actions.forEach(function (act) {
        var raw = act.dmgRaw || act.dmg || '';
        if (/\bPB\b/.test(raw)) {
          act.dmg = String(raw).replace(/\bPB\b/g, String(prof));
          delete act.variable;
        }
        if (/spell attack modifier/i.test(act.desc || '')) {
          act.kind = /ranged/i.test(act.desc || '') ? 'ranged' : 'melee';
          act.toHit = spellAtk;
          if (!act.range) act.range = act.kind === 'ranged' ? [80, 320] : [5, 5];
        }
      });
    }

    return {
      name: block.name,
      source: block.source || null,
      size: block.size || 'medium',
      kind: kind(actor),
      scaling: scaling,
      cr: VT.wildshape.crNumber(block.cr),
      ac: block.ac,
      hp: block.hp,
      hpMax: block.hpMax,
      speed: block.speed,
      senses: block.senses || '',
      abilities: block.abilities,
      actions: actions,
      notes: block.notes || '',
      warnings: notes,
      ownerLevel: level,
      at: Date.now()
    };
  }

  VT.companion = {
    kind: kind, rangerLevel: rangerLevel, subclassOf: subclassOf,
    options: options, classicBeasts: classicBeasts, assume: assume,
    specialAC: specialAC, specialHP: specialHP
  };
})();
