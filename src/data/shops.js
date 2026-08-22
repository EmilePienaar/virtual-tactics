/* Virtual Tactics :: data/shops.js
   The shop model: templates, stocking, pricing, and the shopkeeper.

   Extracted from the symbiote so the browser-based Shopsmith and Tale Shop
   build identical shops — a shop exported from one has to drop straight into
   the other, which it cannot do if each has its own idea of what a shop is. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, COIN = VT.coin;

  /* ---- item classification --------------------------------------------- */
  function typeOf(i) { return String(i.type || '').split('|')[0]; }
  function isMagic(i) {
    var r = String(i.rarity || '').toLowerCase();
    return !!r && r !== 'none' && r !== 'unknown' && r !== 'unknown (magic)';
  }
  function priced(i) { return COIN.estimatePrice(i).price > 0; }

  /* ---- templates -------------------------------------------------------- */
  /* 5etools type codes: G gear, TG trade goods, AT artisan's tools, P potion,
     M/R melee & ranged weapon, LA/MA/HA armour, S shield, A ammunition,
     FD food & drink, MNT mount, VEH vehicle, TAH tack, GS gaming set,
     INS instrument. */
  var TEMPLATES = [
    { key: 'general', name: 'General Store', keeper: 'Shopkeeper', count: 34, markup: 100,
      look: { weapon: 'none', cloth: '#6b5334' },
      greeting: 'Come in, come in. If I have not got it, you did not need it.',
      blurb: 'Rope, rations, lanterns and everything else the party forgot.',
      match: function (i) { return ['G', 'TG', 'AT', 'GS', 'INS'].indexOf(typeOf(i)) >= 0 && !isMagic(i) && priced(i); } },

    { key: 'smith', name: 'Blacksmith', keeper: 'Smith', count: 30, markup: 100,
      look: { weapon: 'axe', cloth: '#5a4028', helm: false },
      greeting: 'Mind the sparks. Steel is honest work — say what you need.',
      blurb: 'Weapons, armour and shields, plainly made.',
      match: function (i) { return ['M', 'R', 'LA', 'MA', 'HA', 'S', 'A'].indexOf(typeOf(i)) >= 0 && !isMagic(i) && priced(i); } },

    { key: 'fletcher', name: 'Fletcher', keeper: 'Bowyer', count: 16, markup: 100,
      look: { weapon: 'bow', cloth: '#3f7a5c' },
      greeting: 'Straight shafts, true flights. Draw one and feel the weight.',
      blurb: 'Bows, bolts and arrows.',
      match: function (i) { return ['R', 'A'].indexOf(typeOf(i)) >= 0 && !isMagic(i) && priced(i); } },

    { key: 'alchemist', name: 'Alchemist', keeper: 'Alchemist', count: 22, markup: 110,
      look: { weapon: 'staff', cloth: '#4d6b3c', accent: '#78b06a' },
      greeting: 'Do not drink the green one. That one. Yes, that one.',
      blurb: 'Potions, oils and things that fizz.',
      match: function (i) {
        return typeOf(i) === 'P' || /potion|oil of|antitoxin|acid|alchemist|holy water/i.test(i.name || '');
      } },

    { key: 'magic', name: 'Magic Emporium', keeper: 'Curiosity Dealer', count: 24, markup: 130,
      look: { weapon: 'staff', cloth: '#7a4a8e', accent: '#9a76c4', cape: true },
      greeting: 'Everything here has a history. Some of it is even pleasant.',
      blurb: 'Wondrous items, wands and rings. Priced accordingly.',
      match: function (i) { return isMagic(i); } },

    { key: 'inn', name: 'Inn & Tavern', keeper: 'Innkeeper', count: 20, markup: 100,
      look: { weapon: 'none', cloth: '#8a6a2f' },
      greeting: 'Fire is lit, stew is hot, and the beds have only the usual guests.',
      blurb: 'Ale, stew, and a bed that is nearly clean.',
      match: function (i) {
        return typeOf(i) === 'FD' || /\b(inn|lodging|meal|ale|wine|bread|cheese|rations|stabling)\b/i.test(i.name || '');
      } },

    { key: 'stable', name: 'Stable & Wainwright', keeper: 'Stablemaster', count: 18, markup: 100,
      look: { weapon: 'spear', cloth: '#7a6244' },
      greeting: 'Sound animals, sound axles. I will not sell you a lame either.',
      blurb: 'Horses, carts and the tack to go with them.',
      match: function (i) { return ['MNT', 'VEH', 'TAH', 'SHP'].indexOf(typeOf(i)) >= 0 && priced(i); } },

    { key: 'temple', name: 'Temple Offerings', keeper: 'Acolyte', count: 14, markup: 100,
      look: { weapon: 'none', cloth: '#cfc7bd', trim: '#c8a44c' },
      greeting: 'Offerings are given freely. The prices are a formality.',
      blurb: 'Holy water, incense, and healers\' supplies.',
      match: function (i) {
        return /holy water|incense|healer|bless|censer|reliquary|prayer|vestment|symbol/i.test(i.name || '') && priced(i);
      } },

    { key: 'empty', name: 'Empty Shop', keeper: 'Proprietor', count: 0, markup: 100,
      look: { weapon: 'none' },
      greeting: '',
      blurb: 'Start from nothing and stock it yourself.',
      match: function () { return false; } }
  ];

  function templateByKey(k) {
    return TEMPLATES.find(function (t) { return t.key === k; }) || TEMPLATES[0];
  }

  /* ---- stocking --------------------------------------------------------- */
  function defaultQty(i) {
    var p = COIN.estimatePrice(i).price;
    if (isMagic(i)) return 1;
    if (p >= 100000) return 1;         // 1000 gp and up
    if (p >= 10000) return 2;
    if (p >= 1000) return 5;
    return 10;
  }

  function shortNote(i) {
    var bits = [];
    if (i.dmg1) bits.push(i.dmg1 + ' ' + (VT.convert.DMG[i.dmgType] || ''));
    if (i.armor && i.ac) bits.push('AC ' + i.ac);
    if (i.rarity && isMagic(i)) bits.push(i.rarity);
    if (i.wondrous) bits.push('wondrous');
    return bits.join(' · ');
  }

  /* Evenly sample a sorted list so the result spans its whole range. */
  function spread(list, count) {
    if (list.length <= count) return list.slice();
    var out = [], step = list.length / count;
    for (var i = 0; i < count; i++) out.push(list[Math.floor(i * step)]);
    return out;
  }

  function stockFrom(template) {
    var FT = VT.fivetools;
    var pool = (FT.get('item') || []).filter(function (i) {
      try { return template.match(i); } catch (e) { return false; }
    });
    /* de-duplicate by name so the same longsword from six books appears once */
    var seen = {}, unique = [];
    pool.forEach(function (i) {
      var k = String(i.name).toLowerCase();
      if (seen[k]) return;
      seen[k] = 1; unique.push(i);
    });

    /* Price everything first and drop what cannot be priced at all — a shelf
       of dashes helps nobody. */
    var priceable = [];
    unique.forEach(function (i) {
      var est = COIN.estimatePrice(i);
      if (est.price > 0) priceable.push({ item: i, price: est.price, estimated: est.estimated });
    });
    priceable.sort(function (a, b) { return a.price - b.price; });

    var picked = spread(priceable, template.count);
    /* Shelve them alphabetically: a smith's window should not open with
       "Blowgun Needle, 2 cp" just because it is the cheapest thing he sells. */
    picked.sort(function (a, b) { return a.item.name < b.item.name ? -1 : 1; });

    return picked.map(function (e) {
      return {
        id: U.uid('g'),
        name: e.item.name, source: e.item.source || null,
        price: e.price, estimated: e.estimated,
        qty: defaultQty(e.item),
        note: shortNote(e.item) + (e.estimated ? (shortNote(e.item) ? ' · ' : '') + 'est. price' : '')
      };
    });
  }

  function goodFromItem(item) {
    var est = COIN.estimatePrice(item);
    return {
      id: U.uid('g'), name: item.name, source: item.source || null,
      price: est.price, estimated: est.estimated,
      qty: defaultQty(item), note: shortNote(item)
    };
  }

  /* ---- the shopkeeper --------------------------------------------------- */
  var KEEPER_NAMES = [
    'Maribel', 'Orin', 'Tessa', 'Hald', 'Yenna', 'Brann', 'Sisi', 'Corvin',
    'Delve', 'Marta', 'Ospry', 'Wren', 'Gulliver', 'Nessa', 'Talbot', 'Fen'
  ];

  /* Same procedural pixel art the game uses for creatures, so a shopkeeper
     looks like it belongs to the same world as the minis. */
  function keeperSpec(shop) {
    var t = templateByKey(shop.templateKey);
    return VT.spriteart.autoSpec(shop.keeperName || shop.keeper || shop.name,
      Object.assign({ kind: 'humanoid' }, t.look || {}));
  }

  function randomKeeperName() {
    return KEEPER_NAMES[Math.floor(Math.random() * KEEPER_NAMES.length)];
  }

  /* ---- shops ------------------------------------------------------------ */
  function makeShop(template) {
    var t = typeof template === 'string' ? templateByKey(template) : template;
    var shop = {
      id: U.uid('shop'),
      templateKey: t.key,
      name: t.name,
      keeper: t.keeper,
      keeperName: randomKeeperName(),
      greeting: t.greeting || '',
      keeperImage: null,          // data URL when the GM supplies one
      description: t.blurb,
      markup: t.markup || 100,
      items: stockFrom(t)
    };
    shop.keeperSpec = keeperSpec(shop);
    return shop;
  }

  function shownPrice(shop, item) {
    if (shop && shop.free) return 0;          /* a hoard costs nothing */
    return Math.max(0, Math.round(item.price * (shop.markup || 100) / 100));
  }

  /* What the players receive. Prices are already marked up — the GM's margin is
     not their business — and nothing else about the shop's internals travels. */
  function publicShop(shop) {
    return {
      id: shop.id, name: shop.name,
      keeper: shop.keeper, keeperName: shop.keeperName,
      greeting: shop.greeting || '',
      keeperImage: shop.keeperImage || null,
      keeperSpec: shop.keeperSpec || keeperSpec(shop),
      description: shop.description,
      free: !!shop.free,
      coins: U.clone(shop.coins || {}),
      tier: shop.free ? hoardTier(shop) : null,
      artSeed: shop.artSeed || shop.id,
      items: (shop.items || []).map(function (g) {
        return { id: g.id, name: g.name, source: g.source, note: g.note,
                 price: shownPrice(shop, g), qty: g.qty };
      })
    };
  }

  /* Fill in anything an older or hand-edited shop is missing. */
  function normalise(shop) {
    if (!shop.id) shop.id = U.uid('shop');
    if (!shop.templateKey) shop.templateKey = 'general';
    if (!shop.keeperName) shop.keeperName = randomKeeperName();
    if (shop.greeting == null) shop.greeting = '';
    if (shop.free) {
      /* A hoard imported from Shopsmith is given a fresh id, so its picture is
         seeded from a separate key that survives the trip. */
      if (!shop.artSeed) shop.artSeed = shop.id;
      if (!shop.coins || typeof shop.coins !== 'object') shop.coins = {};
    }
    if (!Array.isArray(shop.items)) shop.items = [];
    if (!shop.markup) shop.markup = 100;
    if (!shop.keeperSpec) shop.keeperSpec = keeperSpec(shop);
    shop.items.forEach(function (g) { if (!g.id) g.id = U.uid('g'); });
    return shop;
  }

  var EXPORT_FORMAT = 'tale-shop';

  function exportPayload(shops, currency) {
    return { _format: EXPORT_FORMAT, version: 1, created: Date.now(),
             shops: shops, currency: currency || null };
  }

  /* Accepts our own export, a bare array, or a single shop object. */
  function importPayload(text) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    var list = Array.isArray(data) ? data
      : (data && Array.isArray(data.shops)) ? data.shops
      : (data && data.items) ? [data] : null;
    if (!list) throw new Error('No shops in that file.');
    return {
      shops: list.map(function (sh) {
        var copy = U.clone(sh);
        copy.id = U.uid('shop');
        (copy.items || []).forEach(function (g) { g.id = U.uid('g'); });
        return normalise(copy);
      }),
      currency: (data && data.currency) || null
    };
  }



  /* ---- handing loot to a character ---------------------------------------
     TaleSpire only lets two different symbiotes message each other when both
     declare a shared interop id, and a manifest carrying one is not always
     accepted - so this does not rely on it. Tale Shop writes what you got as a
     short piece of JSON, you copy it, and Tale Sheet reads it back. Slower than
     a direct hand-off by one paste, but it works everywhere, survives either
     panel being shut, and can be pasted into chat for someone who missed it. */
  function lootCode(payload) {
    var out = { vt: 'loot', v: 1 };
    if (payload.from) out.from = String(payload.from);
    var items = (payload.items || []).filter(function (i) { return i && i.name; })
      .map(function (i) {
        var o = { name: String(i.name), qty: Math.max(1, i.qty | 0) || 1 };
        if (i.note) o.note = String(i.note);
        return o;
      });
    if (items.length) out.items = items;
    var coins = {};
    Object.keys(payload.coins || {}).forEach(function (k) {
      if (payload.coins[k] > 0) coins[k] = payload.coins[k] | 0;
    });
    if (Object.keys(coins).length) out.coins = coins;
    return JSON.stringify(out);
  }

  /* Accepts a loot code, or a bare object, or the JSON with stray text around
     it - people paste from chat and bring the quotes with them. */
  function parseLootCode(text) {
    if (!text) return null;
    var data = text;
    if (typeof text === 'string') {
      var t = text.trim();
      if (t.charAt(0) !== '{') {
        var a = t.indexOf('{'), b = t.lastIndexOf('}');
        if (a < 0 || b < a) return null;
        t = t.slice(a, b + 1);
      }
      try { data = JSON.parse(t); } catch (e) { return null; }
    }
    if (!data || data.vt !== 'loot') return null;
    if (!data.items && !data.coins) return null;
    return { from: data.from || null, items: data.items || [], coins: data.coins || {} };
  }

  /* A one-line reading of what a code contains, for confirming before applying. */
  function describeLoot(payload, sys) {
    var bits = (payload.items || []).map(function (i) {
      return (i.qty || 1) + ' ' + '×' + ' ' + i.name;
    });
    var base = VT.coin.toBase(payload.coins || {}, sys);
    if (base) bits.push(VT.coin.format(base, sys));
    return bits.join(', ') || 'nothing';
  }

  /* ---- what a hoard looks like -------------------------------------------
     Four scenes, picked by what the pile is worth, so the party can tell a
     looted corpse from a dragon's bed at a glance before reading a word:

       body    a fallen adventurer and their purse   under ~100 gp
       chest   a bound strongbox                     under ~2,500 gp
       gold    a heaped pile of coin and cups        under ~25,000 gp
       hoard   a mound with a crown and gems on it   above that

     Drawn rather than shipped as images: the symbiote folder stays small, and
     the pixels match the rest of the app. Deterministic from the hoard's id,
     so the same treasure looks the same every time it is opened. */
  var HOARD_TIERS = [
    { key: 'body', label: 'A body and its purse', upto: 10000 },
    { key: 'chest', label: 'A bound strongbox', upto: 250000 },
    { key: 'gold', label: 'A heap of coin', upto: 2500000 },
    { key: 'hoard', label: "A dragon's bed", upto: Infinity }
  ];

  /* Roughly what is in it, in copper, for choosing the picture. Gems and art
     objects say their worth in their note ("50 gp gemstone"). */
  function hoardWorth(shop, sys) {
    var total = VT.coin.toBase(shop.coins || {}, sys);
    (shop.items || []).forEach(function (g) {
      var m = String(g.note || '').match(/(\d[\d,]*)\s*gp/i);
      if (m) total += parseInt(m[1].replace(/,/g, ''), 10) * 100 * (g.qty || 1);
      else if (g.price) total += g.price * (g.qty || 1);
      else total += 5000 * (g.qty || 1);      /* a magic item is worth having */
    });
    return total;
  }

  function hoardTier(shop, sys) {
    if (shop.tier && HOARD_TIERS.some(function (t) { return t.key === shop.tier; })) {
      return shop.tier;                        /* the GM chose one */
    }
    var worth = hoardWorth(shop, sys);
    return (HOARD_TIERS.find(function (t) { return worth < t.upto; }) || HOARD_TIERS[3]).key;
  }

  var HOARD_PALETTE = {
    gold: ['#d8b25c', '#f0d68a', '#8f7534'],
    wood: ['#6b4a2c', '#8a6238', '#4a3320'],
    iron: ['#5c6070', '#7d8294', '#3b3e4a'],
    bone: ['#ddd6c2', '#f2ecdc', '#9d9481'],
    cloth: ['#5a4a6a', '#7a6a8a', '#3d3148'],
    gem: ['#5f9ecf', '#c9605a', '#78b06a', '#9a76c4']
  };

  function hoardArt(shop, size, sys) {
    size = size || 64;
    var c = document.createElement('canvas');
    var px = 16;                                /* drawn at 16x16, scaled up */
    c.width = size; c.height = size;
    c.style.width = size + 'px'; c.style.height = size + 'px';
    c.style.imageRendering = 'pixelated';
    var g = c.getContext('2d');
    var s = size / px;
    /* U.hash01 takes coordinates, not text, so seed from the id's characters. */
    var key = String(shop.artSeed || shop.id || shop.name || 'hoard');
    var seed = 0;
    for (var si = 0; si < key.length; si++) seed = (seed * 31 + key.charCodeAt(si)) % 233280;
    var rnd = (function (n) {
      return function () { n = (n * 9301 + 49297) % 233280; return n / 233280; };
    })(seed + 1);

    function rect(x, y, w, h, col) { g.fillStyle = col; g.fillRect(x * s, y * s, w * s, h * s); }
    function dot(x, y, col) { rect(x, y, 1, 1, col); }
    function scatter(x, y, w, h, cols, n) {
      for (var i = 0; i < n; i++) {
        dot(x + Math.floor(rnd() * w), y + Math.floor(rnd() * h),
            cols[Math.floor(rnd() * cols.length)]);
      }
    }

    var tier = hoardTier(shop, sys);
    g.clearRect(0, 0, size, size);

    if (tier === 'body') {
      /* A skull and a spilled purse. A figure lying down is unreadable at this
         size - a skull is not, and it says the same thing. */
      rect(3, 4, 6, 5, HOARD_PALETTE.bone[0]);           // cranium
      rect(4, 3, 4, 1, HOARD_PALETTE.bone[0]);
      rect(4, 9, 4, 2, HOARD_PALETTE.bone[0]);           // jaw
      rect(4, 9, 4, 1, HOARD_PALETTE.bone[2]);           // shadow under the cheek
      dot(4, 11, HOARD_PALETTE.bone[1]);                 // teeth
      dot(6, 11, HOARD_PALETTE.bone[1]);
      rect(4, 6, 2, 2, '#1a1620');                       // eye sockets
      rect(7, 6, 2, 2, '#1a1620');
      dot(6, 8, HOARD_PALETTE.bone[2]);                  // nose

      rect(1, 12, 14, 1, '#2a2633');                     // ground, laid first so
      rect(10, 8, 4, 4, HOARD_PALETTE.wood[0]);          // the spilled coins can
      rect(10, 8, 4, 1, HOARD_PALETTE.wood[2]);          // sit on top of it
      dot(11, 9, HOARD_PALETTE.gold[1]);
      dot(13, 9, HOARD_PALETTE.wood[1]);
      scatter(9, 12, 6, 2, HOARD_PALETTE.gold, 6);       // coins spilling out
    } else if (tier === 'chest') {
      rect(3, 6, 10, 3, HOARD_PALETTE.wood[2]);          // lid
      rect(3, 5, 10, 2, HOARD_PALETTE.wood[1]);
      rect(3, 9, 10, 4, HOARD_PALETTE.wood[0]);          // body
      rect(3, 9, 10, 1, HOARD_PALETTE.iron[0]);          // band
      rect(7, 8, 2, 3, HOARD_PALETTE.iron[1]);           // lock
      dot(7, 9, HOARD_PALETTE.gold[0]);
      rect(3, 13, 10, 1, '#2a2633');
      scatter(4, 6, 8, 2, [HOARD_PALETTE.gold[1]], 3);
    } else if (tier === 'gold') {
      /* a heap, widest at the base */
      for (var r = 0; r < 5; r++) {
        var w = 12 - r * 2;
        rect(2 + r, 12 - r, w, 1, HOARD_PALETTE.gold[r % 2]);
      }
      scatter(3, 8, 10, 4, HOARD_PALETTE.gold, 14);
      rect(5, 6, 2, 2, HOARD_PALETTE.gold[1]);           // a cup on top
      dot(6, 5, HOARD_PALETTE.gold[0]);
      rect(2, 13, 12, 1, '#2a2633');
    } else {
      /* a bed of treasure with a crown and gems */
      for (var r2 = 0; r2 < 6; r2++) {
        rect(1 + r2, 12 - r2, 14 - r2 * 2, 1, HOARD_PALETTE.gold[r2 % 2]);
      }
      scatter(2, 7, 12, 5, HOARD_PALETTE.gold, 18);
      scatter(3, 8, 10, 4, HOARD_PALETTE.gem, 6);
      rect(6, 4, 4, 1, HOARD_PALETTE.gold[1]);           // crown
      dot(6, 3, HOARD_PALETTE.gold[0]);
      dot(8, 3, HOARD_PALETTE.gold[0]);
      dot(7, 3, HOARD_PALETTE.gem[0]);
      rect(1, 13, 14, 1, '#2a2633');
    }
    return c;
  }

  /* ---- splitting a purse -------------------------------------------------
     Divide loose coin between however many people are claiming it. Done in
     base units so nothing is lost to rounding twice, and the remainder goes
     round one coin at a time rather than vanishing - a party that finds three
     copper and splits it four ways should still have three copper. */
  function splitCoins(coins, ways, sys) {
    ways = Math.max(1, ways | 0);
    var total = VT.coin.toBase(coins || {}, sys);
    var each = Math.floor(total / ways);
    var over = total - each * ways;
    var shares = [];
    for (var i = 0; i < ways; i++) {
      var base = each + (i < over ? 1 : 0);
      shares.push({ base: base, purse: VT.coin.fromBase(base, sys) });
    }
    return { total: total, each: each, remainder: over, shares: shares };
  }

  /* ---- rewards ------------------------------------------------------------
     A hoard is a shop whose prices are all zero: the same model, the same
     stock list, the same broadcast, the same player window. Making it a flag
     rather than a second type means every improvement to shops - the
     shopkeeper, the preview, the import/export - lands on treasure too. */
  function makeHoard(name) {
    /* makeShop takes a TEMPLATE, not a name - pass a string and you inherit
       the general store's name and stock, which is how the first hoard came
       out called "General Store". Build from the empty template and name it. */
    var h = makeShop(templateByKey('empty') ? 'empty' : TEMPLATES[0]);
    h.name = name || 'Treasure';
    h.templateKey = 'hoard';
    h.free = true;
    h.keeper = '';
    h.greeting = '';
    h.description = 'Take what you can carry.';
    h.goods = [];
    h.coins = {};                 /* loose coin in the hoard, by denomination */
    h.tier = null;                /* let the picture follow the value */
    h.artSeed = h.id;             /* so the picture survives export/import */
    return h;
  }

  function isFree(shop) { return !!(shop && shop.free); }

  VT.shops = {
    makeHoard: makeHoard, isFree: isFree,
    hoardArt: hoardArt, hoardTier: hoardTier, hoardWorth: hoardWorth,
    lootCode: lootCode, parseLootCode: parseLootCode, describeLoot: describeLoot,
    HOARD_TIERS: HOARD_TIERS, splitCoins: splitCoins,
    TEMPLATES: TEMPLATES, templateByKey: templateByKey,
    makeShop: makeShop, stockFrom: stockFrom, goodFromItem: goodFromItem,
    shownPrice: shownPrice, publicShop: publicShop, normalise: normalise,
    keeperSpec: keeperSpec, randomKeeperName: randomKeeperName,
    defaultQty: defaultQty, shortNote: shortNote,
    isMagic: isMagic, typeOf: typeOf,
    exportPayload: exportPayload, importPayload: importPayload,
    EXPORT_FORMAT: EXPORT_FORMAT
  };
})();
