/* Virtual Tactics :: data/loot.js
   Rolling treasure off the book's own tables.

   data/loot.json is one of the more completely machine-readable things in the
   whole data set. A hoard is a CR band with a coin formula and a d100 table
   whose rows point at the gem, art-object and magic-item tables:

     coins: { cp: "6d6*100", sp: "3d6*100", gp: "2d6*10" }
     { min: 7, max: 16, gems: { type: 10, amount: "2d6" } }
     { min: 51, max: 60, item: "{@item Spell Scroll (Cantrip)}" }

   So this rolls rather than invents: every coin, gem and item below came off a
   table in the book, and a hoard generated twice is different both times for
   the same reason it would be at the table. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  function FT() { return VT.fivetools; }
  function low(v) { return String(v == null ? '' : v).toLowerCase(); }

  /* "6d6*100", "2d4", "1d6 * 10" -> a rolled number. */
  function rollAmount(expr) {
    var t = String(expr || '').replace(/\s+/g, '');
    if (!t) return 0;
    var mult = 1;
    var m = t.match(/^(.*?)[*x](\d+)$/i);
    if (m) { t = m[1]; mult = parseInt(m[2], 10) || 1; }
    var r = VT.dice.roll(t);
    return (r.invalid ? 0 : r.total) * mult;
  }

  function d100() { return VT.dice.roll('1d100').total; }

  function rowFor(table, roll) {
    return (table || []).find(function (r) {
      return roll >= (r.min || 0) && roll <= (r.max == null ? r.min : r.max);
    }) || null;
  }

  /* An "{@item Potion of Healing}" tag down to a name. */
  function itemName(tag) {
    var m = String(tag || '').match(/\{@item\s+([^|}]+)/);
    return (m ? m[1] : String(tag || '')).trim();
  }

  /* ==== the tables ======================================================= */
  function tables() { return (FT() && FT().loot) || null; }

  /* The data carries both the 2014 (DMG) and 2024 (XDMG) printing of every
     band, so "Challenge 0-4" appears twice. Keep one of each range - a GM
     picking a band should see four, not eight. */
  function hoardBands(source) {
    var t = tables();
    if (!t) return [];
    var want = low(source || preferredSource());
    var byRange = {};
    (t.hoard || []).forEach(function (b) {
      var k = b.crMin + '-' + b.crMax;
      if (!byRange[k] || low(b.source) === want) byRange[k] = b;
    });
    return Object.keys(byRange)
      .map(function (k) { return byRange[k]; })
      .sort(function (a, b) { return (a.crMin || 0) - (b.crMin || 0); });
  }

  /* Which printing to prefer. Overridable, because a table running the 2024
     books wants its tables and a table running the 2014 ones wants those. */
  var preferred = 'DMG';
  function preferredSource() { return preferred; }
  function setPreferredSource(src) { preferred = src || 'DMG'; }

  function bandFor(cr) {
    var n = typeof cr === 'number' ? cr : parseFloat(cr) || 0;
    return hoardBands().find(function (b) {
      return n >= (b.crMin || 0) && n <= (b.crMax == null ? 99 : b.crMax);
    }) || hoardBands()[0] || null;
  }

  function pickTable(list, type) {
    return (list || []).find(function (t) { return t.type === type; }) || null;
  }

  /* ==== rolling ========================================================== */
  /* Returns { coins:{}, gems:[], art:[], items:[], notes:[] } */
  function rollHoard(cr, opts) {
    opts = opts || {};
    var t = tables();
    var out = { coins: {}, gems: [], art: [], items: [], notes: [], band: null };
    if (!t) { out.notes.push('No loot tables in the connected data.'); return out; }

    var band = opts.band || bandFor(cr);
    if (!band) { out.notes.push('No hoard table covers that challenge rating.'); return out; }
    out.band = band.name;

    /* coins */
    Object.keys(band.coins || {}).forEach(function (k) {
      var n = rollAmount(band.coins[k]);
      if (n) out.coins[k] = (out.coins[k] || 0) + n;
    });

    /* the d100 row decides what else is in it */
    var roll = d100();
    out.roll = roll;
    var row = rowFor(band.table, roll);
    if (!row) { out.notes.push('Rolled ' + roll + ' — coins only.'); return out; }

    if (row.gems) {
      var gt = pickTable(t.gems, row.gems.type);
      var n = rollAmount(row.gems.amount);
      for (var i = 0; i < n; i++) {
        var pick = U.pick(gt && gt.table || []);
        if (pick) out.gems.push({ name: itemName(pick), value: row.gems.type, unit: 'gp' });
      }
    }
    if (row.artObjects) {
      var at = pickTable(t.artObjects, row.artObjects.type);
      var an = rollAmount(row.artObjects.amount);
      for (var j = 0; j < an; j++) {
        var apick = U.pick(at && at.table || []);
        if (apick) out.art.push({ name: itemName(apick), value: row.artObjects.type, unit: 'gp' });
      }
    }
    (row.magicItems ? [row.magicItems] : []).concat(row.magicItems2 || []).forEach(function (mi) {
      var mt = (t.magicItems || []).find(function (x) { return x.type === mi.type; });
      if (!mt) { out.notes.push('Magic item table ' + mi.type + ' is missing.'); return; }
      var count = rollAmount(mi.amount || '1');
      for (var k = 0; k < count; k++) {
        var r2 = rowFor(mt.table, d100());
        if (!r2 || !r2.item) continue;
        out.items.push(resolveItem(itemName(r2.item), mt.name));
      }
    });
    return out;
  }

  /* Individual treasure: what one creature is carrying. Coins only. */
  function rollIndividual(cr) {
    var t = tables();
    var out = { coins: {}, gems: [], art: [], items: [], notes: [] };
    if (!t) return out;
    var n = typeof cr === 'number' ? cr : parseFloat(cr) || 0;
    var band = (t.individual || []).find(function (b) {
      return n >= (b.crMin || 0) && n <= (b.crMax == null ? 99 : b.crMax);
    });
    if (!band) return out;
    var row = rowFor(band.table, d100());
    Object.keys((row && row.coins) || {}).forEach(function (k) {
      var v = rollAmount(row.coins[k]);
      if (v) out.coins[k] = (out.coins[k] || 0) + v;
    });
    return out;
  }

  /* Roll straight off one magic item table (A-I), for a GM who wants one. */
  function rollMagicItem(tableType) {
    var t = tables();
    if (!t) return null;
    var mt = (t.magicItems || []).find(function (x) { return x.type === tableType; });
    if (!mt) return null;
    var row = rowFor(mt.table, d100());
    return row && row.item ? resolveItem(itemName(row.item), mt.name) : null;
  }

  function magicTables() {
    var t = tables();
    return t ? (t.magicItems || []).map(function (x) { return { type: x.type, name: x.name }; }) : [];
  }

  /* Match a rolled name back to a real item record where one exists, so the
     reward carries the item's own rarity, weight and text rather than a bare
     string. Names like "Spell Scroll (1st Level)" often will not match, and
     that is fine - the name alone is still what the table said. */
  function resolveItem(name, from) {
    var rec = null;
    if (FT() && FT().loaded) {
      var all = FT().get('item') || [];
      var n = low(name);
      rec = all.find(function (i) { return low(i.name) === n; }) ||
            all.find(function (i) { return low(i.name).indexOf(n) === 0; }) || null;
    }
    return {
      name: rec ? rec.name : name,
      source: rec ? rec.source : null,
      rarity: rec ? (rec.rarity || null) : null,
      reqAttune: rec ? !!rec.reqAttune : false,
      from: from || null,
      matched: !!rec
    };
  }

  /* ==== to a reward list ================================================= */
  /* Fold a rolled hoard into the shape a reward window shows: one line per
     thing, with gems and art collapsed by kind because ten identical azurites
     is a quantity, not ten rows. */
  function toRewardItems(hoard) {
    var out = [], byName = {};
    function add(name, note, extra) {
      var key = low(name) + '|' + (note || '');
      if (byName[key]) { byName[key].qty += 1; return; }
      byName[key] = Object.assign({ id: U.uid('rw'), name: name, qty: 1, note: note || '' }, extra || {});
      out.push(byName[key]);
    }
    (hoard.gems || []).forEach(function (g) { add(g.name, g.value + ' gp gemstone'); });
    (hoard.art || []).forEach(function (a) { add(a.name, a.value + ' gp art object'); });
    (hoard.items || []).forEach(function (i) {
      add(i.name, [i.rarity, i.reqAttune ? 'attunement' : null].filter(Boolean).join(' · '),
          { source: i.source, magic: true });
    });
    return out;
  }

  VT.loot = {
    rollHoard: rollHoard, rollIndividual: rollIndividual, rollMagicItem: rollMagicItem,
    magicTables: magicTables, hoardBands: hoardBands, bandFor: bandFor,
    setPreferredSource: setPreferredSource, preferredSource: preferredSource,
    toRewardItems: toRewardItems, rollAmount: rollAmount, resolveItem: resolveItem,
    available: function () { return !!tables(); }
  };
})();
