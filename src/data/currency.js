/* Virtual Tactics :: data/currency.js
   Coins, prices and purses.

   D&D's denominations are the default, but the whole thing is table-driven so a
   setting with marks and shillings — or a single flat credit — works by editing
   the system rather than the code. Everything is stored internally as an integer
   count of the BASE unit (copper, by default), because storing "3.7 gp" invites
   rounding drift the moment you split a bill three ways.

   5etools item prices are already integers in copper, so they drop straight in. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* inBase = how many base units one coin of this denomination is worth. */
  var DND = {
    id: 'dnd',
    name: 'Standard (D&D)',
    base: 'cp',
    denoms: [
      { key: 'pp', name: 'Platinum', inBase: 1000 },
      { key: 'gp', name: 'Gold', inBase: 100 },
      { key: 'ep', name: 'Electrum', inBase: 50 },
      { key: 'sp', name: 'Silver', inBase: 10 },
      { key: 'cp', name: 'Copper', inBase: 1 }
    ],
    /* Denominations that exist but are never used to QUOTE a price or make
       change. D&D prices everything in gp/sp/cp — a longsword is "15 gp", not
       "1 pp 5 gp" — and almost every table ignores electrum entirely. Both
       still display normally when a character is actually carrying them. */
    skipInChange: ['pp', 'ep']
  };

  /* Athas has no gold standard: the everyday coin is the ceramic piece, and it
     divides into ten bits. The exchange above ceramic matches the Player's
     Handbook (10 cr = 1 sp, 100 cr = 1 gp), so a ceramic is a copper by another
     name - but the bit sits BELOW copper, which is why this system's base unit
     is the bit rather than the ceramic. Prices converted from the Dark Sun
     guide are stored in bits so they stay whole numbers. */
  var ATHAS = {
    id: 'athas',
    name: 'Athasian (Dark Sun)',
    base: 'bit',
    denoms: [
      { key: 'gp', name: 'Gold', inBase: 1000 },
      { key: 'sp', name: 'Silver', inBase: 100 },
      { key: 'cr', name: 'Ceramic', inBase: 10 },
      { key: 'bit', name: 'Bit', inBase: 1 }
    ],
    skipInChange: []
  };

  function system(sys) {
    if (!sys || !sys.denoms || !sys.denoms.length) return DND;
    return sys;
  }

  function denoms(sys) {
    return system(sys).denoms.slice().sort(function (a, b) { return b.inBase - a.inBase; });
  }

  function emptyPurse(sys) {
    var p = {};
    denoms(sys).forEach(function (d) { p[d.key] = 0; });
    return p;
  }

  /* purse -> integer base units */
  function toBase(purse, sys) {
    if (typeof purse === 'number') return Math.round(purse);
    var total = 0;
    denoms(sys).forEach(function (d) {
      total += (Number(purse && purse[d.key]) || 0) * d.inBase;
    });
    return Math.round(total);
  }

  /* integer base units -> the fewest coins that make it up */
  function fromBase(n, sys, opts) {
    opts = opts || {};
    var s = system(sys);
    var left = Math.max(0, Math.round(n));
    var out = emptyPurse(s);
    denoms(s).forEach(function (d) {
      if (!opts.useAll && (s.skipInChange || []).indexOf(d.key) >= 0) return;
      var c = Math.floor(left / d.inBase);
      if (c > 0) { out[d.key] = c; left -= c * d.inBase; }
    });
    /* anything left over is smaller than the smallest denomination we used */
    if (left > 0) {
      var smallest = denoms(s)[denoms(s).length - 1];
      out[smallest.key] = (out[smallest.key] || 0) + left;
    }
    return out;
  }

  /* "12 gp 5 sp" — omits zeroes, falls back to "0 cp" for an empty purse */
  function format(value, sys, opts) {
    var s = system(sys);
    var purse = typeof value === 'number' ? fromBase(value, s, opts) : value;
    var parts = [];
    denoms(s).forEach(function (d) {
      var c = Number(purse && purse[d.key]) || 0;
      if (c) parts.push(c.toLocaleString() + ' ' + d.key);
    });
    if (!parts.length) return '0 ' + s.base;
    return parts.join(' ');
  }

  /* A compact single-denomination reading, for tight columns: "1.5 gp" */
  function formatShort(value, sys) {
    var s = system(sys);
    var n = typeof value === 'number' ? value : toBase(value, s);
    if (n === 0) return '—';
    var list = denoms(s).filter(function (d) { return (s.skipInChange || []).indexOf(d.key) < 0; });
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (n >= d.inBase) {
        var v = n / d.inBase;
        var txt = (Math.round(v * 100) / 100).toString();
        return txt + ' ' + d.key;
      }
    }
    return n + ' ' + s.base;
  }

  /* "12gp 5sp" / "12 gp, 5 sp" / "250" (bare = base units) */
  function parse(str, sys) {
    var s = system(sys);
    if (typeof str === 'number') return Math.round(str);
    var text = String(str || '').toLowerCase().trim();
    if (!text) return 0;
    if (/^\d+(\.\d+)?$/.test(text)) return Math.round(parseFloat(text));
    var total = 0, matched = false;
    denoms(s).forEach(function (d) {
      var re = new RegExp('(\\d+(?:\\.\\d+)?)\\s*' + d.key + '\\b', 'g');
      var m;
      while ((m = re.exec(text))) { total += parseFloat(m[1]) * d.inBase; matched = true; }
    });
    return matched ? Math.round(total) : 0;
  }

  function add(purse, baseAmount, sys) {
    return fromBase(toBase(purse, sys) + baseAmount, sys);
  }
  function canAfford(purse, baseAmount, sys) {
    return toBase(purse, sys) >= baseAmount;
  }
  /* Returns the new purse, or null if there isn't enough. Coins are re-made from
     the remaining total, which is what actually happens when you pay with a
     bigger coin and take change. */
  function spend(purse, baseAmount, sys) {
    var have = toBase(purse, sys);
    if (have < baseAmount) return null;
    return fromBase(have - baseAmount, sys);
  }

  /* 5etools stores item value as an integer number of copper pieces. */
  function itemPrice(item) {
    if (!item) return 0;
    if (typeof item.value === 'number') return Math.round(item.value);
    if (item.value && typeof item.value.value === 'number') return Math.round(item.value.value);
    return 0;
  }

  /* Most magic items carry no `value` at all — the books deliberately decline to
     price them — so a shop stocked straight from the data would show a wall of
     dashes. These are the DMG's suggested rarity bands (midpoint), halved for
     consumables as the DMG suggests. Always flagged as an estimate so the GM
     knows it is a starting point, not canon. */
  var RARITY_PRICE = {
    'common': 7500,          //     75 gp
    'uncommon': 30000,       //    300 gp
    'rare': 250000,          //  2,500 gp
    'very rare': 2500000,    // 25,000 gp
    'legendary': 10000000    // 100,000 gp
    /* artifacts are deliberately absent: they are not for sale */
  };

  function isConsumable(item) {
    var t = String(item.type || '').split('|')[0];
    if (t === 'P' || t === 'SC' || t === 'A') return true;
    return /\b(potion|scroll|oil of|dust of|elixir|philter|ammunition)\b/i.test(item.name || '');
  }

  /* -> { price, estimated } */
  function estimatePrice(item) {
    var p = itemPrice(item);
    if (p) return { price: p, estimated: false };
    var band = RARITY_PRICE[String(item && item.rarity || '').toLowerCase()];
    if (!band) return { price: 0, estimated: false };
    return { price: isConsumable(item) ? Math.round(band / 2) : band, estimated: true };
  }

  VT.coin = {
    DND: DND, ATHAS: ATHAS, SYSTEMS: [DND, ATHAS], system: system, denoms: denoms, emptyPurse: emptyPurse,
    toBase: toBase, fromBase: fromBase, format: format, formatShort: formatShort,
    parse: parse, add: add, spend: spend, canAfford: canAfford,
    itemPrice: itemPrice, estimatePrice: estimatePrice, RARITY_PRICE: RARITY_PRICE
  };
})();
