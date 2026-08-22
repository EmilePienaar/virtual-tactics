/* Virtual Tactics :: render/tileart.js
   Every tile texture is generated in-browser, so the app ships with zero image
   assets and still reads as a hand-placed tactics field. Four variants per
   terrain are baked once and picked per-tile by a stable position hash, which
   kills the "tiled wallpaper" look without any randomness that could shimmer
   between frames. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, ISO = VT.iso;
  var W = ISO.TILE_W, H = ISO.TILE_H, VARIANTS = 4;
  var cache = {};

  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function diamondPath(ctx, w, h) {
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w, h / 2);
    ctx.lineTo(w / 2, h);
    ctx.lineTo(0, h / 2);
    ctx.closePath();
  }

  function bakeTop(terrainKey, variant) {
    var def = VT.gmap.TERRAIN[terrainKey] || VT.gmap.TERRAIN.grass;
    var c = newCanvas(W, H), ctx = c.getContext('2d');
    ctx.save();
    diamondPath(ctx, W, H);
    ctx.clip();
    ctx.fillStyle = def.top;
    ctx.fillRect(0, 0, W, H);

    var seed = variant * 97 + terrainKey.length * 13;
    var grain = def.grain || 'noise';

    if (grain === 'noise') {
      /* speckle - two passes, light then dark, low alpha */
      for (var i = 0; i < 130; i++) {
        var x = U.hash01(i, variant, seed) * W;
        var y = U.hash01(i, variant + 50, seed) * H;
        var v = U.hash01(i, variant + 90, seed);
        ctx.fillStyle = v > .5 ? 'rgba(255,255,255,.075)' : 'rgba(0,0,0,.085)';
        var s = 1 + (v > .93 ? 1 : 0);
        ctx.fillRect(x | 0, y | 0, s, s);
      }
    } else if (grain === 'brick') {
      ctx.strokeStyle = 'rgba(0,0,0,.20)';
      ctx.lineWidth = 1;
      for (var b = 0; b < 3; b++) {
        var off = (b + 1) / 4;
        ctx.beginPath();
        ctx.moveTo(W * off, H * off - H / 2 + H / 2 * 0);
        ctx.lineTo(W * off + W / 2, H * off + H / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W * off, H - H * off);
        ctx.lineTo(W * off - W / 2, H - H * off - H / 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,.07)';
      ctx.strokeRect(1, 1, W - 2, H - 2);
    } else if (grain === 'plank') {
      ctx.strokeStyle = 'rgba(0,0,0,.24)';
      for (var p = 1; p < 4; p++) {
        ctx.beginPath();
        ctx.moveTo(W * (p / 4), H * (p / 4));
        ctx.lineTo(W * (p / 4) + W / 2, H * (p / 4) - H / 2 + H);
        ctx.stroke();
      }
    } else if (grain === 'crack') {
      ctx.strokeStyle = 'rgba(0,0,0,.26)';
      ctx.lineWidth = 1;
      for (var k = 0; k < 2; k++) {
        var sx = U.hash01(k, variant, seed) * W, sy = U.hash01(k + 9, variant, seed) * H;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        for (var s2 = 0; s2 < 3; s2++) {
          sx += (U.hash01(k * 7 + s2, variant, seed) - .5) * 18;
          sy += (U.hash01(k * 11 + s2, variant, seed) - .5) * 10;
          ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }
      for (var n = 0; n < 40; n++) {
        ctx.fillStyle = 'rgba(255,255,255,.05)';
        ctx.fillRect((U.hash01(n, variant, seed) * W) | 0, (U.hash01(n + 31, variant, seed) * H) | 0, 1, 1);
      }
    } else if (grain === 'wave') {
      for (var wv = 0; wv < 3; wv++) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.09 - wv * 0.02) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        var yy = H * (0.28 + wv * 0.22) + (variant % 2) * 2;
        ctx.moveTo(2, yy);
        for (var xx = 2; xx < W; xx += 4) {
          ctx.lineTo(xx, yy + Math.sin((xx + variant * 9) * 0.28) * 1.6);
        }
        ctx.stroke();
      }
    }

    /* light from the north-west: brighten the two back edges */
    var g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'rgba(255,246,220,.16)');
    g.addColorStop(.55, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.14)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    /* crisp top-left rim */
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H / 2); ctx.lineTo(W / 2, 0); ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.restore();
    return c;
  }

  function top(terrainKey, x, y) {
    var v = Math.floor(U.hash01(x, y, 11) * VARIANTS) % VARIANTS;
    var k = terrainKey + '#' + v;
    if (!cache[k]) cache[k] = bakeTop(terrainKey, v);
    return cache[k];
  }

  /* Flat colours for the two visible cliff faces. Left face catches less light. */
  function sideColors(terrainKey) {
    var k = 'side#' + terrainKey;
    if (cache[k]) return cache[k];
    var def = VT.gmap.TERRAIN[terrainKey] || VT.gmap.TERRAIN.grass;
    cache[k] = {
      left: U.shade(def.side, -0.22),
      right: U.shade(def.side, 0.04),
      leftDark: U.shade(def.side, -0.44),
      rightDark: U.shade(def.side, -0.26),
      cap: U.shade(def.top, -0.12)
    };
    return cache[k];
  }

  /* Small preview used by the editor palette. */
  function preview(terrainKey, size) {
    var c = newCanvas(size || 56, size || 56), ctx = c.getContext('2d');
    var sc = (size || 56) / W;
    ctx.save();
    ctx.translate((size || 56) / 2, (size || 56) * .62);
    ctx.scale(sc, sc);
    var sd = sideColors(terrainKey);
    /* two side faces */
    ctx.fillStyle = sd.left;
    ctx.beginPath();
    ctx.moveTo(-W / 2, 0); ctx.lineTo(0, H / 2); ctx.lineTo(0, H / 2 + 14); ctx.lineTo(-W / 2, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sd.right;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0); ctx.lineTo(0, H / 2); ctx.lineTo(0, H / 2 + 14); ctx.lineTo(W / 2, 14); ctx.closePath(); ctx.fill();
    ctx.drawImage(top(terrainKey, 0, 0), -W / 2, -H / 2);
    ctx.restore();
    return c;
  }

  function clearCache() { cache = {}; }

  VT.tileart = { top: top, sideColors: sideColors, preview: preview, clearCache: clearCache, newCanvas: newCanvas };
})();
