/* Virtual Tactics :: map/gridmap.js
   Map data model. Kept as plain JSON-able objects (no classes) so the whole
   campaign serialises with one JSON.stringify.

   A tile is { e: elevation in 5ft steps, t: terrain key, p: prop key|null }. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* ---- terrain -------------------------------------------------------- */
  /* cost: movement multiplier (2 = difficult terrain). liquid/hazard drive rules. */
  var TERRAIN = {
    grass:   { name: 'Grass',   top: '#5f8b46', side: '#4a3b2a', cost: 1, grain: 'noise' },
    dirt:    { name: 'Dirt',    top: '#7a6244', side: '#4c3d2a', cost: 1, grain: 'noise' },
    stone:   { name: 'Stone',   top: '#7d7c86', side: '#4e4d57', cost: 1, grain: 'crack' },
    cobble:  { name: 'Cobble',  top: '#8a8590', side: '#514d59', cost: 1, grain: 'brick' },
    sand:    { name: 'Sand',    top: '#c8b184', side: '#8c7551', cost: 1, grain: 'noise' },
    snow:    { name: 'Snow',    top: '#dfe6ee', side: '#8e9aa8', cost: 2, grain: 'noise' },
    wood:    { name: 'Wood',    top: '#8b6239', side: '#5a3f24', cost: 1, grain: 'plank' },
    marble:  { name: 'Marble',  top: '#cfc7bd', side: '#8d857b', cost: 1, grain: 'crack' },
    moss:    { name: 'Moss',    top: '#4d6b3c', side: '#3a3125', cost: 2, grain: 'noise' },
    water:   { name: 'Water',   top: '#3f6f9e', side: '#2b4c6d', cost: 2, liquid: true, grain: 'wave' },
    deep:    { name: 'Deep W.', top: '#27496b', side: '#1b3550', cost: 3, liquid: true, deep: true, grain: 'wave' },
    lava:    { name: 'Lava',    top: '#d1552a', side: '#6d2412', cost: 2, hazard: '2d6', hazardType: 'fire', glow: '#ff8a3d', grain: 'wave' },
    ice:     { name: 'Ice',     top: '#a9d3e0', side: '#6d94a4', cost: 1, slick: true, grain: 'crack' },
    road:    { name: 'Road',    top: '#9c9080', side: '#5f574c', cost: 1, grain: 'brick' },
    ash:     { name: 'Ash',     top: '#4a464b', side: '#312e33', cost: 1, grain: 'noise' },
    void:    { name: 'Chasm',   top: '#0a0910', side: '#0a0910', cost: 99, pit: true, grain: 'flat' }
  };

  var TERRAIN_ORDER = ['grass', 'dirt', 'stone', 'cobble', 'sand', 'snow', 'wood', 'marble',
                       'moss', 'road', 'ash', 'ice', 'water', 'deep', 'lava', 'void'];

  /* ---- props ---------------------------------------------------------- */
  /* blocks: cannot be entered. cover: 'half' (+2 AC) | 'three' (+5 AC).
     tall: blocks line of sight entirely. */
  var PROPS = {
    tree:    { name: 'Tree',    blocks: true,  cover: 'three', tall: true,  h: 2.4, color: '#3d6b34' },
    pine:    { name: 'Pine',    blocks: true,  cover: 'three', tall: true,  h: 2.8, color: '#2f5730' },
    bush:    { name: 'Bush',    blocks: false, cover: 'half',  tall: false, h: .55, color: '#4b7340', diff: true },
    rock:    { name: 'Boulder', blocks: true,  cover: 'three', tall: true,  h: 1.1, color: '#77747d' },
    stump:   { name: 'Stump',   blocks: false, cover: 'half',  tall: false, h: .5,  color: '#6b4b2c', diff: true },
    crate:   { name: 'Crate',   blocks: true,  cover: 'half',  tall: false, h: .9,  color: '#8a6336' },
    barrel:  { name: 'Barrel',  blocks: true,  cover: 'half',  tall: false, h: .95, color: '#7a5730' },
    wall:    { name: 'Wall',    blocks: true,  cover: 'three', tall: true,  h: 2.2, color: '#6f6b74' },
    pillar:  { name: 'Pillar',  blocks: true,  cover: 'three', tall: true,  h: 2.6, color: '#b3aa9e' },
    statue:  { name: 'Statue',  blocks: true,  cover: 'three', tall: true,  h: 1.9, color: '#9a938a' },
    brazier: { name: 'Brazier', blocks: true,  cover: 'half',  tall: false, h: 1.0, color: '#7c6a45', light: '#ff9b45' },
    torch:   { name: 'Torch',   blocks: false, cover: null,    tall: false, h: 1.4, color: '#6b5334', light: '#ffb04d' },
    chest:   { name: 'Chest',   blocks: true,  cover: 'half',  tall: false, h: .7,  color: '#8a6a33' },
    banner:  { name: 'Banner',  blocks: false, cover: null,    tall: false, h: 2.2, color: '#8d3b46' },
    fence:   { name: 'Fence',   blocks: true,  cover: 'half',  tall: false, h: 1.0, color: '#6d5436' },
    grave:   { name: 'Grave',   blocks: false, cover: 'half',  tall: false, h: .9,  color: '#8d8a92', diff: true }
  };
  var PROP_ORDER = Object.keys(PROPS);

  var AMBIENCE = {
    day:   { name: 'Daylight',  light: '#fff6e2', amb: 0.00, sky: '#1d1b28', shadow: .28 },
    dusk:  { name: 'Dusk',      light: '#ffbb7a', amb: 0.14, sky: '#241a26', shadow: .34, tint: 'rgba(255,140,70,.10)' },
    night: { name: 'Night',     light: '#8fa8d8', amb: 0.34, sky: '#0d0e18', shadow: .18, tint: 'rgba(50,70,140,.20)' },
    cave:  { name: 'Underdark', light: '#7fd0c0', amb: 0.42, sky: '#0a0c10', shadow: .12, tint: 'rgba(20,60,60,.22)' },
    hell:  { name: 'Infernal',  light: '#ff7a45', amb: 0.26, sky: '#170a0c', shadow: .30, tint: 'rgba(180,50,20,.18)' }
  };

  /* ---- construction ---------------------------------------------------- */
  function create(w, h, opts) {
    opts = opts || {};
    w = U.clamp(w | 0 || 16, 4, 64); h = U.clamp(h | 0 || 16, 4, 64);
    var tiles = new Array(w * h);
    for (var i = 0; i < w * h; i++) tiles[i] = { e: opts.e || 0, t: opts.t || 'grass', p: null };
    return {
      id: U.uid('map'),
      name: opts.name || 'Untitled Field',
      w: w, h: h,
      tiles: tiles,
      tokens: [],
      ambience: opts.ambience || 'day',
      notes: ''
    };
  }

  function inB(m, x, y) { return x >= 0 && y >= 0 && x < m.w && y < m.h; }
  function at(m, x, y) { return inB(m, x, y) ? m.tiles[y * m.w + x] : null; }
  function elev(m, x, y) { var t = at(m, x, y); return t ? t.e : 0; }
  function terrain(m, x, y) { var t = at(m, x, y); return t ? TERRAIN[t.t] || TERRAIN.grass : null; }
  function prop(m, x, y) { var t = at(m, x, y); return t && t.p ? PROPS[t.p] : null; }

  /* Is the tile physically standable? (ignores occupancy) */
  function standable(m, x, y) {
    var t = at(m, x, y); if (!t) return false;
    var ter = TERRAIN[t.t] || TERRAIN.grass;
    if (ter.pit) return false;
    if (ter.deep) return false;
    var p = t.p ? PROPS[t.p] : null;
    if (p && p.blocks) return false;
    return true;
  }

  function tokenAt(m, x, y) {
    for (var i = 0; i < m.tokens.length; i++) {
      var a = m.tokens[i];
      if (a.x === x && a.y === y && a.hp > 0) return a;
    }
    return null;
  }
  function anyTokenAt(m, x, y) {
    return m.tokens.find(function (a) { return a.x === x && a.y === y; }) || null;
  }

  /* Cost in feet to *enter* this tile (before elevation), or null if blocked. */
  function enterCost(m, x, y) {
    if (!standable(m, x, y)) return null;
    var ter = TERRAIN[at(m, x, y).t] || TERRAIN.grass;
    var p = prop(m, x, y);
    var mult = ter.cost;
    if (p && p.diff) mult = Math.max(mult, 2);
    return VT.iso.FT * mult;
  }

  function resize(m, nw, nh) {
    nw = U.clamp(nw | 0, 4, 64); nh = U.clamp(nh | 0, 4, 64);
    var tiles = new Array(nw * nh);
    for (var y = 0; y < nh; y++) for (var x = 0; x < nw; x++) {
      var old = at(m, x, y);
      tiles[y * nw + x] = old ? { e: old.e, t: old.t, p: old.p } : { e: 0, t: 'grass', p: null };
    }
    m.w = nw; m.h = nh; m.tiles = tiles;
    m.tokens = m.tokens.filter(function (a) { return a.x < nw && a.y < nh; });
    return m;
  }

  function maxElev(m) {
    var mx = 0; for (var i = 0; i < m.tiles.length; i++) if (m.tiles[i].e > mx) mx = m.tiles[i].e;
    return mx;
  }

  /* ---- generators ------------------------------------------------------ */
  /* Small hand-tuned procedural fields so there's something to fight on the
     moment the app opens. Each returns a finished map object. */
  var GENERATORS = {
    plain: function (w, h) {
      var m = create(w, h, { name: 'Open Field', t: 'grass' });
      scatter(m, 'bush', .04); scatter(m, 'tree', .03);
      softHills(m, 3, 2);
      return m;
    },
    arena: function (w, h) {
      var m = create(w, h, { name: 'Colosseum', t: 'sand' });
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        var t = at(m, x, y);
        if (edge === 0) { t.e = 3; t.t = 'stone'; }
        else if (edge === 1) { t.e = 1; t.t = 'cobble'; }
      }
      /* four raised platforms + pillars, the classic tactics arena */
      [[3, 3], [w - 4, 3], [3, h - 4], [w - 4, h - 4]].forEach(function (p) {
        stamp(m, p[0], p[1], 2, 2, { e: 2, t: 'marble' });
      });
      [[Math.floor(w / 2), 2], [Math.floor(w / 2), h - 3]].forEach(function (p) {
        var t = at(m, p[0], p[1]); if (t) t.p = 'pillar';
      });
      return m;
    },
    canyon: function (w, h) {
      var m = create(w, h, { name: 'Red Canyon', t: 'sand', ambience: 'dusk' });
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var t = at(m, x, y);
        var band = Math.abs(y - h / 2) / (h / 2);
        var n = U.hash01(x, y, 7);
        var e = Math.round(band * 5 + n * 1.4 - .6);
        t.e = U.clamp(e, 0, 6);
        t.t = t.e >= 4 ? 'stone' : t.e >= 2 ? 'dirt' : 'sand';
      }
      /* a river of nothing down the middle - jumping puzzle */
      for (var x2 = 0; x2 < w; x2++) {
        if (x2 % 5 === 2) continue;
        var t2 = at(m, x2, Math.floor(h / 2));
        if (t2) { t2.t = 'void'; }
      }
      scatter(m, 'rock', .05);
      return m;
    },
    ruins: function (w, h) {
      var m = create(w, h, { name: 'Sunken Ruins', t: 'moss', ambience: 'dusk' });
      softHills(m, 2, 2);
      /* broken walls in rough rectangles */
      for (var k = 0; k < 4; k++) {
        var rx = 1 + Math.floor(Math.random() * (w - 6)), ry = 1 + Math.floor(Math.random() * (h - 6));
        var rw = 3 + Math.floor(Math.random() * 4), rh = 3 + Math.floor(Math.random() * 4);
        outline(m, rx, ry, rw, rh, 'wall', .55);
        stamp(m, rx, ry, rw, rh, { t: 'marble' });
      }
      scatter(m, 'pillar', .02); scatter(m, 'rock', .03); scatter(m, 'bush', .04);
      return m;
    },
    crypt: function (w, h) {
      var m = create(w, h, { name: 'Forgotten Crypt', t: 'cobble', ambience: 'cave' });
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var edge = Math.min(x, y, w - 1 - x, h - 1 - y);
        if (edge === 0) { var t = at(m, x, y); t.e = 4; t.t = 'stone'; }
      }
      for (var i = 3; i < w - 3; i += 4) for (var j = 3; j < h - 3; j += 4) {
        var tt = at(m, i, j); if (tt) tt.p = (i + j) % 8 === 0 ? 'brazier' : 'pillar';
      }
      scatter(m, 'grave', .06); scatter(m, 'crate', .02);
      return m;
    },
    volcano: function (w, h) {
      var m = create(w, h, { name: 'Ashfall Ridge', t: 'ash', ambience: 'hell' });
      var cx = w / 2, cy = h / 2;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var t = at(m, x, y);
        var d = Math.hypot(x - cx, y - cy) / Math.max(cx, cy);
        t.e = U.clamp(Math.round((1 - d) * 5 + U.hash01(x, y, 3) * 1.2), 0, 6);
        if (d < .18) { t.t = 'lava'; t.e = 0; }
        else if (t.e >= 4) t.t = 'stone';
      }
      scatter(m, 'rock', .05);
      return m;
    },
    keep: function (w, h) {
      var m = create(w, h, { name: 'Castle Approach', t: 'grass' });
      /* stepped keep on the north edge - defenders hold the high ground */
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var t = at(m, x, y);
        if (y < 3) { t.e = 5; t.t = 'stone'; }
        else if (y < 5) { t.e = 3; t.t = 'cobble'; }
        else if (y < 6) { t.e = 1; t.t = 'cobble'; }
      }
      /* a ramp of single steps so attackers can actually climb */
      var mx = Math.floor(w / 2);
      for (var s = 0; s < 6; s++) { var tt = at(m, mx, 6 - s); if (tt) tt.e = s; }
      for (var x3 = 1; x3 < w - 1; x3 += 3) { var tw = at(m, x3, 2); if (tw && x3 !== mx) tw.p = 'banner'; }
      scatter(m, 'crate', .02); scatter(m, 'tree', .03);
      return m;
    }
  };

  function stamp(m, x0, y0, w, h, patch) {
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) {
      var t = at(m, x, y); if (!t) continue;
      if (patch.e != null) t.e = patch.e;
      if (patch.t) t.t = patch.t;
      if (patch.p !== undefined) t.p = patch.p;
    }
  }
  function outline(m, x0, y0, w, h, propKey, density) {
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) {
      if (x !== x0 && x !== x0 + w - 1 && y !== y0 && y !== y0 + h - 1) continue;
      var t = at(m, x, y); if (!t) continue;
      if (Math.random() < (density == null ? 1 : density)) t.p = propKey;
    }
  }
  function scatter(m, propKey, density) {
    for (var i = 0; i < m.tiles.length; i++) {
      var t = m.tiles[i];
      if (t.p) continue;
      var ter = TERRAIN[t.t];
      if (ter.liquid || ter.pit || ter.hazard) continue;
      if (Math.random() < density) t.p = propKey;
    }
  }
  /* Gentle rolling elevation via summed value noise. */
  function softHills(m, amp, scale) {
    for (var y = 0; y < m.h; y++) for (var x = 0; x < m.w; x++) {
      var n = 0, f = 1 / (scale || 3), a = 1, sum = 0;
      for (var o = 0; o < 3; o++) {
        n += a * smoothNoise(x * f, y * f, o);
        sum += a; a *= .5; f *= 2;
      }
      var t = at(m, x, y);
      t.e = U.clamp(Math.round((n / sum) * amp), 0, 8);
    }
  }
  function smoothNoise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = U.hash01(xi, yi, seed), b = U.hash01(xi + 1, yi, seed);
    var c = U.hash01(xi, yi + 1, seed), d = U.hash01(xi + 1, yi + 1, seed);
    return U.lerp(U.lerp(a, b, u), U.lerp(c, d, u), v);
  }

  VT.gmap = {
    TERRAIN: TERRAIN, TERRAIN_ORDER: TERRAIN_ORDER,
    PROPS: PROPS, PROP_ORDER: PROP_ORDER, AMBIENCE: AMBIENCE,
    create: create, resize: resize, inB: inB, at: at, elev: elev,
    terrain: terrain, prop: prop, standable: standable,
    tokenAt: tokenAt, anyTokenAt: anyTokenAt, enterCost: enterCost, maxElev: maxElev,
    GENERATORS: GENERATORS, stamp: stamp, scatter: scatter, softHills: softHills
  };
})();
