/* Virtual Tactics :: data/wildshape.js
   Which forms a character can take, and what they turn into.

   Wild Shape is awkward to model because it is not a modifier - it is a second
   stat block. Beast form replaces AC, HP, speed, size and attacks, while you
   keep your own mental scores, proficiencies and features.

   Rather than swapping the character out and having to remember how to put them
   back, a form is built as a *separate* stat block that sits alongside the
   sheet. Nothing about the character is touched, so nothing about the character
   can be lost: dismissing the form is deleting one object, not restoring state.
   The beast's hit points live on that object too, which is what you actually
   need at the table - damage goes to the form until it drops.

   The rules the shape list follows (PHB Wild Shape):

     level 2   CR 1/4, no flying or swimming speed
     level 4   CR 1/2, no flying speed
     level 8   CR 1
     Moon      CR equal to a third of druid level, rounded down (min 1) from 2nd

   These bound what is *offered*. A DM who allows something else can turn the
   limits off - the list is a convenience, not a rules engine, and the last word
   at a table is never the software's. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* ---- what the rules allow -------------------------------------------- */

  function druidLevel(actor) {
    var found = 0;
    (actor.classes || []).forEach(function (c) {
      if (/druid/i.test(c.name || '')) found = Math.max(found, c.level || 0);
    });
    /* single-class characters carry the level but not always the class list */
    if (!found && /druid/i.test(actor.className || '')) found = actor.level || 0;
    return found;
  }

  function isMoonDruid(actor) {
    return (actor.classes || []).some(function (c) {
      return /druid/i.test(c.name || '') && c.subclass &&
             /moon/i.test(c.subclass.shortName || c.subclass.name || '');
    }) || /moon/i.test(actor.className || '');
  }

  /* Max CR, or null when this character has no Wild Shape at all. */
  function limits(actor) {
    var lvl = druidLevel(actor);
    if (!lvl) return null;
    if (isMoonDruid(actor)) {
      return { maxCr: Math.max(1, Math.floor(lvl / 3)), fly: lvl >= 8, swim: true, moon: true };
    }
    if (lvl >= 8) return { maxCr: 1, fly: true, swim: true, moon: false };
    if (lvl >= 4) return { maxCr: 0.5, fly: false, swim: true, moon: false };
    if (lvl >= 2) return { maxCr: 0.25, fly: false, swim: false, moon: false };
    return { maxCr: 0, fly: false, swim: false, moon: false };
  }

  /* convert.crOf returns the printed challenge rating as a STRING - "1/2",
     "24", or null. Comparing that against a number is a trap: "24" > 1 coerces
     and works, but "1/2" > 0.25 is NaN > 0.25, which is false, so every
     fractional CR silently passed whatever limit was set. A 2nd-level druid
     was being offered CR 1/2 beasts. */
  function crNumber(cr) {
    if (cr == null) return null;
    if (typeof cr === 'number') return cr;
    var t = String(cr).trim();
    var frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (frac) return parseInt(frac[1], 10) / parseInt(frac[2], 10);
    var n = parseFloat(t);
    return isNaN(n) ? null : n;
  }

  function speedsOf(mon) {
    var s = mon && mon.speed;
    if (!s || typeof s !== 'object') return {};
    return s;
  }

  function hasSpeed(mon, kind) {
    var s = speedsOf(mon)[kind];
    return !!(s && (typeof s === 'number' ? s > 0 : s.number > 0));
  }

  /* ---- the list of beasts ----------------------------------------------- */

  /* Every beast the data has, filtered to what this character may become.
     `all` ignores the level limits for a DM who has said yes to something. */
  function beasts(actor, opts) {
    opts = opts || {};
    var FT = VT.fivetools;
    if (!FT || !FT.get) return [];
    var lim = limits(actor) || { maxCr: 0, fly: false, swim: false };

    return (FT.get('creature') || []).filter(function (m) {
      if (!/beast/i.test(VT.convert.typeOf(m) || '')) return false;
      if (opts.all) return true;
      var cr = crNumber(VT.convert.crOf(m));
      if (cr == null || cr > lim.maxCr) return false;
      if (!lim.fly && hasSpeed(m, 'fly')) return false;
      if (!lim.swim && hasSpeed(m, 'swim')) return false;
      return true;
    }).sort(function (a, b) {
      var d = (crNumber(VT.convert.crOf(a)) || 0) - (crNumber(VT.convert.crOf(b)) || 0);
      return d || String(a.name).localeCompare(String(b.name));
    });
  }

  /* ---- forms that are not beasts ---------------------------------------- */

  /* Starry Form, Wildfire Spirit and the like spend a use of Wild Shape but do
     not replace your stat block. They are listed so the player can see every
     option in one place, and carry their own actions where those were read out
     of the feature text. */
  var SPECIAL = {
    'starry form': ['Archer', 'Chalice', 'Dragon'],
    'symbiotic entity': [],
    'wildfire spirit': []
  };

  function specials(actor) {
    var out = [];
    (actor.features || []).forEach(function (f) {
      var key = String(f.name || '').toLowerCase();
      if (!(key in SPECIAL)) return;
      var parts = SPECIAL[key];
      if (!parts.length) { out.push({ name: f.name, kind: 'special', parts: [] }); return; }
      parts.forEach(function (p) {
        if ((actor.features || []).some(function (x) { return x.name === p; })) {
          out.push({ name: p, kind: 'special', parent: f.name });
        }
      });
    });
    return out;
  }

  /* ---- becoming one ------------------------------------------------------ */

  /* Build the stat block to show alongside the sheet. Deliberately a plain
     object rather than a full actor: it is displayed and rolled from, never
     levelled or saved as a character. */
  function assume(mon) {
    var a = VT.convert.creature(mon, { team: 'party' });
    return {
      name: a.name,
      source: a.source || null,
      size: a.size || 'medium',
      cr: crNumber(a.cr),
      ac: a.ac,
      hp: a.hpMax,
      hpMax: a.hpMax,
      speed: a.speed,
      speeds: speedsOf(mon),
      senses: a.senses || '',
      abilities: a.abilities,
      actions: (a.actions || []).map(function (x) { return U.clone(x); }),
      notes: a.notes || '',
      at: Date.now()
    };
  }

  /* The character's own numbers that survive the change, for the panel to show
     next to the beast's - these are the ones people forget. */
  function keeps(actor) {
    return {
      int: (actor.abilities || {}).int,
      wis: (actor.abilities || {}).wis,
      cha: (actor.abilities || {}).cha
    };
  }

  function crLabel(raw) {
    var cr = crNumber(raw);
    if (cr == null) return '?';
    if (cr === 0.125) return '1/8';
    if (cr === 0.25) return '1/4';
    if (cr === 0.5) return '1/2';
    return String(cr);
  }

  VT.wildshape = {
    limits: limits, druidLevel: druidLevel, isMoonDruid: isMoonDruid,
    beasts: beasts, specials: specials, assume: assume, keeps: keeps,
    crLabel: crLabel, crNumber: crNumber
  };
})();
