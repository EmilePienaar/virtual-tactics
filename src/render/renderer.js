/* Virtual Tactics :: render/renderer.js
   Draws the board. One canvas, painter's algorithm in rotated tile space:
   back-to-front, and each tile paints its two visible cliff faces before its
   top, then whatever is standing on it. That single ordering gives correct
   occlusion for elevation, props and tokens without any z-buffer. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, ISO = VT.iso, G = VT.gmap;
  var W = ISO.TILE_W, H = ISO.TILE_H, STEP = ISO.STEP;
  var PROP_UNIT = 30;          // px of prop height per 1.0 in PROPS[].h
  var TOKEN_H = 52;            // px tall for a Medium creature

  var SIZE_SCALE = { tiny: .55, small: .78, medium: 1, large: 1.45, huge: 1.95, gargantuan: 2.5 };
  var TEAM_COLOR = { party: '#5f9ecf', foe: '#c9605a', neutral: '#c8a44c' };

  /* ---- custom sprite images ------------------------------------------- */
  var imgCache = {};
  function getImage(spriteId) {
    if (!spriteId) return null;
    if (imgCache[spriteId]) return imgCache[spriteId];
    var rec = VT.store.getSprite(spriteId);
    if (!rec) return null;
    var im = new Image();
    im.addEventListener('load', function () { im._ok = true; VT.bus.emit('repaint'); });
    im.src = rec.src;
    im._ok = im.complete && im.naturalWidth > 0;
    imgCache[spriteId] = im;
    return im;
  }
  function dropImage(spriteId) { delete imgCache[spriteId]; }

  /* Never trust a single flag for "is this decoded yet" - an already-cached
     image can be complete before any listener is attached. */
  function ready(im) { return !!im && (im._ok || (im.complete && im.naturalWidth > 0)); }

  /* ---- renderer -------------------------------------------------------- */
  function Renderer(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = camera;
    this.time = 0;
    this.dpr = 1;
  }

  Renderer.prototype.resize = function () {
    var c = this.canvas, r = c.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * this.dpr));
    c.height = Math.max(1, Math.round(r.height * this.dpr));
    this.cam.resize(r.width, r.height);
  };

  Renderer.prototype.applyTransform = function () {
    var cam = this.cam, d = this.dpr, z = cam.zoom;
    this.ctx.setTransform(d * z, 0, 0, d * z,
      d * (cam.vw / 2 - cam.x * z), d * (cam.vh / 2 - cam.y * z));
  };

  /* Elevation used for drawing: chasms sink so their neighbours show a cliff. */
  function renderElev(map, x, y) {
    if (!G.inB(map, x, y)) return -1;
    var t = G.at(map, x, y);
    var ter = G.TERRAIN[t.t];
    return (ter && ter.pit) ? -3 : t.e;
  }

  Renderer.prototype.draw = function (map, view, dt) {
    view = view || {};
    this.time += dt || 0;
    var ctx = this.ctx, cam = this.cam;
    var amb = G.AMBIENCE[map.ambience] || G.AMBIENCE.day;

    /* background */
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cam.vw, cam.vh);
    var bg = ctx.createRadialGradient(cam.vw / 2, cam.vh * .38, 40, cam.vw / 2, cam.vh * .5, Math.max(cam.vw, cam.vh) * .75);
    bg.addColorStop(0, U.shade(amb.sky, .10));
    bg.addColorStop(1, U.shade(amb.sky, -.55));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cam.vw, cam.vh);

    this.applyTransform();

    var self = this;
    var rot = cam.rot;
    var settings = VT.store.settings();
    var range = view.range || null;
    var pathSet = {};
    if (view.path) view.path.forEach(function (p) { pathSet[p.x + ',' + p.y] = true; });
    var targetSet = {};
    if (view.targets) view.targets.forEach(function (p) { targetSet[p.x + ',' + p.y] = true; });
    var aoeSet = {};
    if (view.aoe) view.aoe.forEach(function (p) { aoeSet[p.x + ',' + p.y] = true; });

    ISO.forEachDrawOrder(rot, map.w, map.h, function (x, y, rx, ry) {
      var tile = G.at(map, x, y);
      var ter = G.TERRAIN[tile.t] || G.TERRAIN.grass;
      var e = tile.e;
      var p = ISO.project(rx, ry, e);

      if (!ter.pit) {
        /* --- cliff faces --------------------------------------------- */
        var nL = ISO.unrot(rx, ry + 1, rot, map.w, map.h);
        var nR = ISO.unrot(rx + 1, ry, rot, map.w, map.h);
        var eL = (ry + 1 < ISO.rdims(rot, map.w, map.h).h) ? renderElev(map, nL.x, nL.y) : -1;
        var eR = (rx + 1 < ISO.rdims(rot, map.w, map.h).w) ? renderElev(map, nR.x, nR.y) : -1;
        var sc = VT.tileart.sideColors(tile.t);
        var dL = Math.max(0, (e - eL) * STEP);
        var dR = Math.max(0, (e - eR) * STEP);
        if (dL > 0) self._face(p, -1, dL, sc.left, sc.leftDark);
        if (dR > 0) self._face(p, 1, dR, sc.right, sc.rightDark);

        /* --- top face ------------------------------------------------ */
        ctx.drawImage(VT.tileart.top(tile.t, x, y), p.x - W / 2, p.y - H / 2);

        if (ter.liquid || ter.hazard) self._liquidShine(p, ter);

        if (settings.gridLines) {
          ctx.strokeStyle = 'rgba(0,0,0,.18)';
          ctx.lineWidth = 1;
          self._diamond(p); ctx.stroke();
        }

        /* --- overlays ------------------------------------------------ */
        var k = x + ',' + y;
        if (range && range.has(k) && !(view.selected && view.selected.x === x && view.selected.y === y)) {
          var node = range.get(k);
          self._overlay(p, node.fall ? 'rgba(216,146,60,.30)' : node.danger ? 'rgba(201,96,90,.30)' : 'rgba(95,158,207,.28)',
            node.fall ? 'rgba(255,190,120,.85)' : 'rgba(150,205,255,.75)');
        }
        if (aoeSet[k]) self._overlay(p, 'rgba(154,118,196,.36)', 'rgba(198,168,235,.9)');
        if (targetSet[k]) self._overlay(p, 'rgba(201,96,90,.30)', 'rgba(255,140,130,.9)');
        if (pathSet[k]) {
          ctx.fillStyle = 'rgba(255,244,214,.85)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, 6.2832); ctx.fill();
        }
        if (view.hover && view.hover.x === x && view.hover.y === y) {
          ctx.strokeStyle = 'rgba(255,246,220,.95)';
          ctx.lineWidth = 1.6;
          self._diamond(p); ctx.stroke();
        }
        if (view.marks && view.marks[k]) self._overlay(p, view.marks[k], null);
      }

      /* --- prop ------------------------------------------------------ */
      if (tile.p && G.PROPS[tile.p]) self._prop(p, tile.p, x, y, amb);

      /* --- token ----------------------------------------------------- */
      var tok = G.anyTokenAt(map, x, y);
      if (tok) self._token(map, tok, p, view, amb);
    });

    /* projectile / effect layer */
    if (view.fx && view.fx.length) this._fx(map, view.fx);

    /* ambience tint + vignette, in screen space */
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (amb.tint) { ctx.fillStyle = amb.tint; ctx.fillRect(0, 0, cam.vw, cam.vh); }
    var vg = ctx.createRadialGradient(cam.vw / 2, cam.vh / 2, Math.min(cam.vw, cam.vh) * .35,
      cam.vw / 2, cam.vh / 2, Math.max(cam.vw, cam.vh) * .72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, cam.vw, cam.vh);
  };

  /* ---- primitives ------------------------------------------------------ */
  Renderer.prototype._diamond = function (p) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - H / 2);
    ctx.lineTo(p.x + W / 2, p.y);
    ctx.lineTo(p.x, p.y + H / 2);
    ctx.lineTo(p.x - W / 2, p.y);
    ctx.closePath();
  };

  Renderer.prototype._overlay = function (p, fill, stroke) {
    var ctx = this.ctx;
    this._diamond(p);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.4; ctx.stroke(); }
  };

  /* side: -1 = down-left face, +1 = down-right face */
  Renderer.prototype._face = function (p, side, depth, color, darkColor) {
    var ctx = this.ctx, ex = side * W / 2;
    ctx.beginPath();
    ctx.moveTo(p.x + ex, p.y);
    ctx.lineTo(p.x, p.y + H / 2);
    ctx.lineTo(p.x, p.y + H / 2 + depth);
    ctx.lineTo(p.x + ex, p.y + depth);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, p.y, 0, p.y + depth);
    g.addColorStop(0, color);
    g.addColorStop(1, darkColor);
    ctx.fillStyle = g;
    ctx.fill();
    /* strata lines every 5 ft so height is readable at a glance */
    ctx.strokeStyle = 'rgba(0,0,0,.22)';
    ctx.lineWidth = 1;
    for (var d = STEP; d < depth; d += STEP) {
      ctx.beginPath();
      ctx.moveTo(p.x + ex, p.y + d);
      ctx.lineTo(p.x, p.y + H / 2 + d);
      ctx.stroke();
    }
  };

  Renderer.prototype._liquidShine = function (p, ter) {
    var ctx = this.ctx, t = this.time;
    ctx.save();
    this._diamond(p); ctx.clip();
    var a = ter.hazard ? .30 : .18;
    var glow = ter.glow || '#bfe6ff';
    ctx.globalAlpha = a * (0.6 + 0.4 * Math.sin(t * 1.7 + p.x * 0.05 + p.y * 0.08));
    ctx.fillStyle = glow;
    ctx.fillRect(p.x - W / 2, p.y - H / 2, W, H);
    ctx.restore();
  };

  /* ---- props ----------------------------------------------------------- */
  Renderer.prototype._isoBox = function (cx, cy, hw, hh, height, color) {
    var ctx = this.ctx;
    var top = cy - height;
    ctx.fillStyle = U.shade(color, -0.30);
    ctx.beginPath();
    ctx.moveTo(cx - hw, top); ctx.lineTo(cx, top + hh); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx - hw, cy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = U.shade(color, -0.12);
    ctx.beginPath();
    ctx.moveTo(cx + hw, top); ctx.lineTo(cx, top + hh); ctx.lineTo(cx, cy + hh); ctx.lineTo(cx + hw, cy);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = U.shade(color, 0.12);
    ctx.beginPath();
    ctx.moveTo(cx, top - hh); ctx.lineTo(cx + hw, top); ctx.lineTo(cx, top + hh); ctx.lineTo(cx - hw, top);
    ctx.closePath(); ctx.fill();
  };

  Renderer.prototype._flame = function (cx, cy, size, seed) {
    var ctx = this.ctx, t = this.time * 4 + seed;
    for (var i = 0; i < 3; i++) {
      var f = 1 - i * .3;
      var wob = Math.sin(t + i * 1.7) * size * .18;
      ctx.fillStyle = ['#ffdf8a', '#ff9b3d', '#e2542a'][i];
      ctx.globalAlpha = .85;
      ctx.beginPath();
      ctx.ellipse(cx + wob * .5, cy - size * f * .6, size * .38 * f, size * .8 * f, 0, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  Renderer.prototype._prop = function (p, key, x, y, amb) {
    var ctx = this.ctx, def = G.PROPS[key];
    var hPx = def.h * PROP_UNIT;
    var jitter = (U.hash01(x, y, 5) - .5) * 6;
    var cx = p.x + jitter, cy = p.y + 2;

    /* contact shadow */
    ctx.fillStyle = 'rgba(0,0,0,' + (amb.shadow * .8) + ')';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, W * .26, H * .24, 0, 0, 6.2832);
    ctx.fill();

    switch (key) {
      case 'tree': {
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(cx - 3, cy - hPx * .45, 6, hPx * .45);
        var r = hPx * .34;
        [[0, -hPx * .55, r], [-r * .6, -hPx * .42, r * .78], [r * .6, -hPx * .44, r * .8], [0, -hPx * .78, r * .72]]
          .forEach(function (b, i) {
            ctx.fillStyle = i % 2 ? U.shade(def.color, .12) : def.color;
            ctx.beginPath(); ctx.ellipse(cx + b[0], cy + b[1], b[2], b[2] * .86, 0, 0, 6.2832); ctx.fill();
          });
        break;
      }
      case 'pine': {
        ctx.fillStyle = '#4a3524';
        ctx.fillRect(cx - 2.5, cy - hPx * .2, 5, hPx * .2);
        for (var i = 0; i < 3; i++) {
          var yy = cy - hPx * (.18 + i * .26), ww = (hPx * .30) * (1 - i * .22);
          ctx.fillStyle = i % 2 ? U.shade(def.color, .10) : def.color;
          ctx.beginPath();
          ctx.moveTo(cx, yy - hPx * .34);
          ctx.lineTo(cx + ww, yy);
          ctx.lineTo(cx - ww, yy);
          ctx.closePath(); ctx.fill();
        }
        break;
      }
      case 'bush':
      case 'grave': {
        if (key === 'bush') {
          [[0, 0, hPx * .8], [-hPx * .5, hPx * .2, hPx * .6], [hPx * .5, hPx * .2, hPx * .62]].forEach(function (b, i) {
            ctx.fillStyle = i ? U.shade(def.color, -.1) : def.color;
            ctx.beginPath(); ctx.ellipse(cx + b[0], cy - b[2] * .4 + b[1], b[2] * .7, b[2] * .55, 0, 0, 6.2832); ctx.fill();
          });
        } else {
          ctx.fillStyle = def.color;
          ctx.beginPath();
          ctx.moveTo(cx - 7, cy);
          ctx.lineTo(cx - 7, cy - hPx * .6);
          ctx.quadraticCurveTo(cx, cy - hPx * 1.05, cx + 7, cy - hPx * .6);
          ctx.lineTo(cx + 7, cy);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = U.shade(def.color, -.3);
          ctx.fillRect(cx - 4, cy - hPx * .62, 8, 2);
        }
        break;
      }
      case 'rock': {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(cx - hPx * .5, cy);
        ctx.lineTo(cx - hPx * .38, cy - hPx * .6);
        ctx.lineTo(cx + hPx * .1, cy - hPx * .8);
        ctx.lineTo(cx + hPx * .5, cy - hPx * .45);
        ctx.lineTo(cx + hPx * .45, cy);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = U.shade(def.color, .16);
        ctx.beginPath();
        ctx.moveTo(cx - hPx * .38, cy - hPx * .6);
        ctx.lineTo(cx + hPx * .1, cy - hPx * .8);
        ctx.lineTo(cx + hPx * .05, cy - hPx * .5);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'stump':
        this._isoBox(cx, cy, 11, 5, hPx, def.color);
        ctx.fillStyle = U.shade(def.color, .3);
        ctx.beginPath(); ctx.ellipse(cx, cy - hPx, 7, 3.4, 0, 0, 6.2832); ctx.fill();
        break;
      case 'crate': this._isoBox(cx, cy, 13, 6, hPx, def.color); break;
      case 'chest':
        this._isoBox(cx, cy, 13, 6, hPx * .7, def.color);
        this._isoBox(cx, cy - hPx * .7, 13, 6, hPx * .3, U.shade(def.color, .18));
        break;
      case 'barrel': {
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.ellipse(cx, cy - hPx * .5, 10, hPx * .5, 0, 0, 6.2832);
        ctx.fill();
        ctx.fillStyle = U.shade(def.color, -.35);
        ctx.fillRect(cx - 10, cy - hPx * .66, 20, 2.5);
        ctx.fillRect(cx - 10, cy - hPx * .34, 20, 2.5);
        ctx.fillStyle = U.shade(def.color, .22);
        ctx.beginPath(); ctx.ellipse(cx, cy - hPx, 9, 4, 0, 0, 6.2832); ctx.fill();
        break;
      }
      case 'wall': this._isoBox(cx - jitter, cy, W / 2, H / 2, hPx, def.color); break;
      case 'fence':
        this._isoBox(cx - 10, cy, 2.5, 1.4, hPx, def.color);
        this._isoBox(cx + 10, cy, 2.5, 1.4, hPx, def.color);
        ctx.fillStyle = U.shade(def.color, -.15);
        ctx.fillRect(cx - 11, cy - hPx * .8, 22, 3);
        ctx.fillRect(cx - 11, cy - hPx * .45, 22, 3);
        break;
      case 'pillar':
        this._isoBox(cx, cy, 10, 5, hPx * .92, def.color);
        this._isoBox(cx, cy - hPx * .92, 13, 6, hPx * .1, U.shade(def.color, .12));
        break;
      case 'statue':
        this._isoBox(cx, cy, 13, 6, hPx * .22, U.shade(def.color, -.2));
        ctx.save();
        ctx.translate(cx, cy - hPx * .22);
        ctx.imageSmoothingEnabled = false;
        var st = VT.spriteart.get({ kind: 'humanoid', skin: def.color, cloth: def.color, hair: def.color, trim: def.color, metal: def.color, weapon: 'spear' });
        var sh = hPx * .8, sw = sh * (st.width / st.height);
        ctx.drawImage(st, -sw / 2, -sh, sw, sh);
        ctx.restore();
        break;
      case 'brazier':
        this._isoBox(cx, cy, 5, 2.5, hPx * .6, def.color);
        ctx.fillStyle = U.shade(def.color, .1);
        ctx.beginPath(); ctx.ellipse(cx, cy - hPx * .6, 9, 4.5, 0, 0, 6.2832); ctx.fill();
        this._flame(cx, cy - hPx * .62, 13, x * 1.7 + y);
        break;
      case 'torch':
        ctx.fillStyle = def.color;
        ctx.fillRect(cx - 1.5, cy - hPx, 3, hPx);
        this._flame(cx, cy - hPx, 9, x + y * 2.3);
        break;
      case 'banner':
        ctx.fillStyle = '#5b4527';
        ctx.fillRect(cx - 1.5, cy - hPx, 3, hPx);
        ctx.fillStyle = def.color;
        ctx.beginPath();
        ctx.moveTo(cx + 1, cy - hPx + 2);
        ctx.lineTo(cx + 15, cy - hPx + 4);
        ctx.lineTo(cx + 15, cy - hPx * .42);
        ctx.lineTo(cx + 8, cy - hPx * .52);
        ctx.lineTo(cx + 1, cy - hPx * .40);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = U.shade(def.color, .25);
        ctx.fillRect(cx + 6, cy - hPx + 6, 3, hPx * .34);
        break;
      default:
        this._isoBox(cx, cy, 11, 5, hPx, def.color);
    }
  };

  /* ---- tokens ---------------------------------------------------------- */
  /* Rotate a map-space facing vector into screen space to decide the flip. */
  function facingScreenDx(fx, fy, rot) {
    var v = { x: fx, y: fy };
    for (var i = 0; i < (rot & 3); i++) v = { x: -v.y, y: v.x };
    return v.x - v.y;
  }

  Renderer.prototype._token = function (map, a, p, view, amb) {
    var ctx = this.ctx;
    var alive = a.hp > 0;
    var sc = SIZE_SCALE[a.size || 'medium'] || 1;
    /* Mid-step: slide between the two tiles in world space, so the tween stays
       correct no matter which way the camera is rotated. */
    var cx = p.x, cy = p.y;
    if (a._anim) {
      var wf = this.tileWorld(map, a._anim.from.x, a._anim.from.y);
      var wt = this.tileWorld(map, a._anim.to.x, a._anim.to.y);
      cx = U.lerp(wf.x, wt.x, a._anim.t);
      cy = U.lerp(wf.y, wt.y, a._anim.t) - Math.sin(a._anim.t * Math.PI) * 3;
    }
    var bob = 0;
    if (alive && view.current && view.current.id === a.id && VT.store.settings().animate !== false) {
      bob = Math.sin(this.time * 3.2) * 1.6;
    }

    /* shadow */
    ctx.fillStyle = 'rgba(0,0,0,' + (amb.shadow) + ')';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, W * .28 * sc, H * .26 * sc, 0, 0, 6.2832);
    ctx.fill();

    /* team ring */
    var col = TEAM_COLOR[a.team] || TEAM_COLOR.neutral;
    ctx.strokeStyle = alive ? col : 'rgba(120,110,110,.5)';
    ctx.lineWidth = view.selected && view.selected.id === a.id ? 2.4 : 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, W * .30 * sc, H * .28 * sc, 0, 0, 6.2832);
    ctx.stroke();
    if (view.current && view.current.id === a.id) {
      ctx.strokeStyle = 'rgba(216,178,92,.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 2, W * .36 * sc, H * .34 * sc, 0, 0, 6.2832);
      ctx.stroke();
    }

    /* body */
    var img = a.spriteId ? getImage(a.spriteId) : null;
    var rec = a.spriteId ? VT.store.getSprite(a.spriteId) : null;
    var flip = facingScreenDx(a.fx == null ? 1 : a.fx, a.fy == null ? 1 : a.fy, this.cam.rot) < 0;

    ctx.save();
    ctx.translate(cx, cy + 3 + bob);
    if (!alive) { ctx.globalAlpha = .55; ctx.rotate(Math.PI / 2.2); ctx.translate(6, -4); }
    if (flip) ctx.scale(-1, 1);
    ctx.imageSmoothingEnabled = false;

    if (ready(img)) {
      var fw = rec.cols > 1 ? img.width / rec.cols : img.width;
      var fh = rec.rows > 1 ? img.height / rec.rows : img.height;
      var col0 = 0, row0 = 0;
      if (rec.rows > 1) row0 = Math.min(rec.rows - 1, facingRow(a, this.cam.rot));
      if (rec.cols > 1 && rec.animate) col0 = Math.floor(this.time * 4) % rec.cols;
      var hh = TOKEN_H * sc * (rec.scale || 1);
      var ww = hh * (fw / fh);
      ctx.drawImage(img, col0 * fw, row0 * fh, fw, fh, -ww / 2, -hh, ww, hh);
    } else {
      var spr = VT.spriteart.get(a.spec || VT.spriteart.autoSpec(a.name));
      var h2 = TOKEN_H * sc, w2 = h2 * (spr.width / spr.height);
      ctx.drawImage(spr, -w2 / 2, -h2, w2, h2);
    }
    ctx.restore();

    if (!alive) return;

    /* hp pip bar + conditions above the head */
    var topY = cy - TOKEN_H * sc - 6 + bob;
    var barW = 26 * Math.min(1.5, sc), barH = 3.5;
    ctx.fillStyle = 'rgba(10,8,14,.78)';
    ctx.fillRect(cx - barW / 2 - 1, topY - 1, barW + 2, barH + 2);
    var frac = U.clamp(a.hp / Math.max(1, a.hpMax), 0, 1);
    ctx.fillStyle = frac > .5 ? '#78b06a' : frac > .25 ? '#d8b25c' : '#c9605a';
    ctx.fillRect(cx - barW / 2, topY, barW * frac, barH);
    if (a.tempHp) {
      ctx.fillStyle = '#7fd0e0';
      ctx.fillRect(cx - barW / 2, topY - 3, barW * U.clamp(a.tempHp / Math.max(1, a.hpMax), 0, 1), 2);
    }
    if (a.conditions && a.conditions.length) {
      ctx.font = '9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2a6a2';
      ctx.fillText(a.conditions.map(function (c) { return VT.srd.CONDITION_ICON[c] || '*'; }).join(''), cx, topY - 6);
      ctx.textAlign = 'left';
    }
  };

  /* 4-row sprite sheets are ordered: 0 down/front, 1 left, 2 right, 3 up/back */
  function facingRow(a, rot) {
    var v = { x: a.fx == null ? 1 : a.fx, y: a.fy == null ? 1 : a.fy };
    for (var i = 0; i < (rot & 3); i++) v = { x: -v.y, y: v.x };
    if (Math.abs(v.x) > Math.abs(v.y)) return v.x > 0 ? 2 : 1;
    return v.y > 0 ? 0 : 3;
  }

  /* ---- transient effects ----------------------------------------------- */
  Renderer.prototype._fx = function (map, fx) {
    var ctx = this.ctx, cam = this.cam, self = this;
    fx.forEach(function (f) {
      var t = U.clamp(f.t / f.dur, 0, 1);
      var a = self.tileWorld(map, f.from.x, f.from.y);
      var b = self.tileWorld(map, f.to.x, f.to.y);
      if (f.kind === 'bolt' || f.kind === 'arrow') {
        var x = U.lerp(a.x, b.x, t), y = U.lerp(a.y, b.y, t) - Math.sin(t * Math.PI) * 22;
        ctx.strokeStyle = f.color || '#ffe9b0';
        ctx.lineWidth = f.kind === 'bolt' ? 3 : 2;
        ctx.globalAlpha = 1 - t * .3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(U.lerp(a.x, b.x, Math.max(0, t - .08)), U.lerp(a.y, b.y, Math.max(0, t - .08)) - Math.sin(Math.max(0, t - .08) * Math.PI) * 22);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'slash') {
        ctx.strokeStyle = f.color || '#fff4d6';
        ctx.lineWidth = 3 * (1 - t);
        ctx.globalAlpha = 1 - t;
        ctx.beginPath();
        ctx.arc(b.x, b.y - 16, 18, -0.9 + t * 2.2, 0.7 + t * 2.2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'burst') {
        ctx.fillStyle = f.color || '#ffb04d';
        ctx.globalAlpha = (1 - t) * .8;
        ctx.beginPath();
        ctx.ellipse(b.x, b.y - 8, 8 + t * 34, (8 + t * 34) * .55, 0, 0, 6.2832);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    });
  };

  /* ---- coordinate helpers --------------------------------------------- */
  Renderer.prototype.tileWorld = function (map, x, y, extraElev) {
    var r = ISO.rot(x, y, this.cam.rot, map.w, map.h);
    return ISO.project(r.x, r.y, G.elev(map, x, y) + (extraElev || 0));
  };

  /* Screen position of a token's head, for damage numbers. */
  Renderer.prototype.tokenScreen = function (map, a) {
    var p = this.tileWorld(map, a.x, a.y);
    var s = this.cam.worldToScreen(p.x, p.y - TOKEN_H * (SIZE_SCALE[a.size || 'medium'] || 1) * .9);
    return s;
  };

  /* Front-to-back hit test: top faces first, then cliff faces. */
  Renderer.prototype.pick = function (map, sx, sy) {
    var world = this.cam.screenToWorld(sx, sy);
    var rot = this.cam.rot, hit = null;
    ISO.forEachPickOrder(rot, map.w, map.h, function (x, y, rx, ry) {
      var tile = G.at(map, x, y);
      if (G.TERRAIN[tile.t] && G.TERRAIN[tile.t].pit) return false;
      var p = ISO.project(rx, ry, tile.e);
      var poly = [
        { x: p.x, y: p.y - H / 2 }, { x: p.x + W / 2, y: p.y },
        { x: p.x, y: p.y + H / 2 }, { x: p.x - W / 2, y: p.y }
      ];
      if (ISO.pointInPoly(world.x, world.y, poly)) { hit = { x: x, y: y }; return true; }
      return false;
    });
    if (hit) return hit;
    /* second pass: cliff faces, so clicking the side of a plateau still works */
    ISO.forEachPickOrder(rot, map.w, map.h, function (x, y, rx, ry) {
      var tile = G.at(map, x, y);
      if (G.TERRAIN[tile.t] && G.TERRAIN[tile.t].pit) return false;
      var p = ISO.project(rx, ry, tile.e);
      var depth = (tile.e + 1) * STEP;
      var poly = [
        { x: p.x - W / 2, y: p.y }, { x: p.x, y: p.y + H / 2 },
        { x: p.x + W / 2, y: p.y }, { x: p.x + W / 2, y: p.y + depth },
        { x: p.x, y: p.y + H / 2 + depth }, { x: p.x - W / 2, y: p.y + depth }
      ];
      if (ISO.pointInPoly(world.x, world.y, poly)) { hit = { x: x, y: y }; return true; }
      return false;
    });
    return hit;
  };

  VT.Renderer = Renderer;
  VT.sprites = { getImage: getImage, dropImage: dropImage, ready: ready, TEAM_COLOR: TEAM_COLOR, SIZE_SCALE: SIZE_SCALE, TOKEN_H: TOKEN_H };
})();
