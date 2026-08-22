/* Virtual Tactics :: render/spriteart.js
   Procedural pixel-art tokens. Any actor without a custom sprite gets one of
   these, generated from a small spec (kind + palette + kit) and cached. It
   means a fresh campaign already has a visually distinct cast, and it gives
   players a fallback while they draw their own. Custom PNGs always win. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  var GW = 16, GH = 22, S = 3;             // 16x22 logical pixels at 3x = 48x66
  var cache = {};

  function blank() {
    var c = document.createElement('canvas');
    c.width = GW * S; c.height = GH * S;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return { c: c, ctx: ctx };
  }
  function px(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * S, y * S, (w || 1) * S, (h || 1) * S);
  }

  var DEFAULT = {
    kind: 'humanoid', skin: '#d9a074', hair: '#54331f', cloth: '#4b6fa8',
    trim: '#c8a44c', metal: '#b9bcc4', weapon: 'sword', shield: false,
    helm: false, cape: false, accent: '#c8504a'
  };

  /* ---- builds ---------------------------------------------------------- */
  function humanoid(ctx, s) {
    var dark = U.shade(s.cloth, -0.28), boot = U.shade(s.cloth, -0.46);
    var skinDark = U.shade(s.skin, -0.22);

    if (s.cape) {
      px(ctx, 3, 8, 10, 11, U.shade(s.accent, -0.18));
      px(ctx, 2, 10, 1, 7, U.shade(s.accent, -0.34));
      px(ctx, 13, 10, 1, 7, U.shade(s.accent, -0.34));
    }
    /* legs + boots */
    px(ctx, 5, 15, 2, 5, dark);
    px(ctx, 9, 15, 2, 5, dark);
    px(ctx, 4, 19, 3, 2, boot);
    px(ctx, 9, 19, 3, 2, boot);
    /* torso */
    px(ctx, 4, 8, 8, 8, s.cloth);
    px(ctx, 4, 8, 8, 1, U.shade(s.cloth, 0.16));
    px(ctx, 4, 14, 8, 2, s.trim);
    px(ctx, 7, 15, 2, 1, U.shade(s.trim, -0.3));
    /* arms */
    px(ctx, 2, 9, 2, 5, s.cloth);
    px(ctx, 12, 9, 2, 5, s.cloth);
    px(ctx, 2, 13, 2, 2, s.skin);
    px(ctx, 12, 13, 2, 2, s.skin);
    /* head */
    px(ctx, 7, 7, 2, 1, skinDark);
    px(ctx, 5, 3, 6, 5, s.skin);
    px(ctx, 5, 7, 6, 1, skinDark);
    if (s.helm) {
      px(ctx, 4, 2, 8, 3, s.metal);
      px(ctx, 4, 5, 8, 1, U.shade(s.metal, -0.3));
      px(ctx, 6, 5, 4, 1, '#16121a');
      px(ctx, 7, 1, 2, 1, s.trim);
    } else {
      px(ctx, 4, 2, 8, 2, s.hair);
      px(ctx, 4, 4, 1, 3, s.hair);
      px(ctx, 11, 4, 1, 3, s.hair);
      px(ctx, 6, 5, 1, 1, '#1a1218');
      px(ctx, 9, 5, 1, 1, '#1a1218');
    }
    weapon(ctx, s);
    if (s.shield) {
      px(ctx, 0, 9, 3, 7, s.trim);
      px(ctx, 0, 9, 3, 1, U.shade(s.trim, 0.25));
      px(ctx, 1, 11, 1, 2, s.metal);
    }
  }

  function weapon(ctx, s) {
    var m = s.metal, w = '#6b4a2a';
    switch (s.weapon) {
      case 'sword':
        px(ctx, 14, 3, 1, 10, m);
        px(ctx, 14, 3, 1, 4, U.shade(m, 0.25));
        px(ctx, 13, 13, 3, 1, s.trim);
        px(ctx, 14, 14, 1, 2, w);
        break;
      case 'greatsword':
        px(ctx, 13, 1, 2, 12, m);
        px(ctx, 13, 1, 1, 6, U.shade(m, 0.25));
        px(ctx, 12, 13, 4, 1, s.trim);
        px(ctx, 13, 14, 2, 3, w);
        break;
      case 'axe':
        px(ctx, 14, 4, 1, 13, w);
        px(ctx, 12, 3, 3, 4, m);
        px(ctx, 12, 3, 3, 1, U.shade(m, 0.22));
        break;
      case 'spear':
        px(ctx, 14, 1, 1, 17, w);
        px(ctx, 13, 0, 3, 3, m);
        break;
      case 'bow':
        ctx.strokeStyle = w; ctx.lineWidth = S;
        ctx.beginPath();
        ctx.arc(13 * S, 11 * S, 7 * S, -Math.PI / 2.1, Math.PI / 2.1);
        ctx.stroke();
        ctx.strokeStyle = '#e8e3d5'; ctx.lineWidth = Math.max(1, S / 2);
        ctx.beginPath(); ctx.moveTo(13.6 * S, 4.4 * S); ctx.lineTo(13.6 * S, 17.6 * S); ctx.stroke();
        break;
      case 'staff':
        px(ctx, 14, 2, 1, 17, w);
        px(ctx, 13, 0, 3, 3, s.accent);
        px(ctx, 14, 0, 1, 1, U.shade(s.accent, 0.4));
        break;
      case 'dagger':
        px(ctx, 14, 9, 1, 5, m);
        px(ctx, 13, 14, 3, 1, s.trim);
        break;
      case 'claws':
        px(ctx, 13, 13, 1, 3, m);
        px(ctx, 15, 13, 1, 3, m);
        px(ctx, 14, 14, 1, 3, m);
        break;
    }
  }

  function beast(ctx, s) {
    var fur = s.cloth, dark = U.shade(fur, -0.3), light = U.shade(fur, 0.15);
    px(ctx, 1, 10, 3, 2, dark);                 // tail
    px(ctx, 3, 12, 10, 6, fur);                 // body
    px(ctx, 3, 12, 10, 1, light);
    px(ctx, 10, 8, 5, 6, fur);                  // head
    px(ctx, 10, 8, 5, 1, light);
    px(ctx, 14, 11, 2, 2, dark);                // snout
    px(ctx, 10, 6, 2, 2, dark);                 // ears
    px(ctx, 13, 6, 2, 2, dark);
    px(ctx, 12, 10, 1, 1, s.accent);            // eye
    px(ctx, 14, 10, 1, 1, s.accent);
    px(ctx, 3, 18, 2, 3, dark);                 // legs
    px(ctx, 6, 18, 2, 3, dark);
    px(ctx, 9, 18, 2, 3, dark);
    px(ctx, 11, 18, 2, 3, dark);
    px(ctx, 14, 13, 1, 1, '#ffffff');           // fang
  }

  function undead(ctx, s) {
    var bone = s.skin, dark = U.shade(bone, -0.32);
    px(ctx, 5, 15, 2, 6, bone);
    px(ctx, 9, 15, 2, 6, bone);
    px(ctx, 5, 8, 6, 7, bone);
    for (var r = 9; r < 15; r += 2) px(ctx, 5, r, 6, 1, dark);   // ribs
    px(ctx, 3, 9, 2, 6, bone);
    px(ctx, 11, 9, 2, 6, bone);
    px(ctx, 5, 3, 6, 5, bone);
    px(ctx, 5, 7, 6, 1, dark);
    px(ctx, 6, 5, 1, 2, '#160f14');
    px(ctx, 9, 5, 1, 2, '#160f14');
    px(ctx, 6, 8, 4, 1, '#160f14');
    if (s.cape) { px(ctx, 3, 7, 10, 12, U.shade(s.accent, -0.3)); px(ctx, 5, 3, 6, 5, bone); px(ctx, 6, 5, 1, 2, s.accent); px(ctx, 9, 5, 1, 2, s.accent); }
    weapon(ctx, s);
  }

  function construct(ctx, s) {
    var m = s.metal, d = U.shade(m, -0.3), l = U.shade(m, 0.2);
    px(ctx, 4, 17, 3, 4, d);
    px(ctx, 9, 17, 3, 4, d);
    px(ctx, 3, 7, 10, 10, m);
    px(ctx, 3, 7, 10, 1, l);
    px(ctx, 1, 8, 2, 8, d);
    px(ctx, 13, 8, 2, 8, d);
    px(ctx, 5, 2, 6, 5, m);
    px(ctx, 5, 2, 6, 1, l);
    px(ctx, 6, 4, 1, 2, s.accent);
    px(ctx, 9, 4, 1, 2, s.accent);
    px(ctx, 6, 11, 4, 3, s.accent);
    px(ctx, 7, 12, 2, 1, U.shade(s.accent, 0.45));
  }

  function ooze(ctx, s) {
    var b = s.cloth;
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.ellipse(8 * S, 16 * S, 6.5 * S, 5.5 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8 * S, 12 * S, 4.6 * S, 4 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = U.shade(b, 0.28);
    ctx.beginPath();
    ctx.ellipse(6 * S, 11 * S, 1.6 * S, 1.2 * S, 0, 0, Math.PI * 2);
    ctx.fill();
    px(ctx, 6, 14, 1, 2, '#14101a');
    px(ctx, 10, 14, 1, 2, '#14101a');
  }

  function dragon(ctx, s) {
    var b = s.cloth, d = U.shade(b, -0.3), l = U.shade(b, 0.2);
    px(ctx, 0, 4, 5, 9, d);                     // far wing
    px(ctx, 11, 3, 5, 10, U.shade(b, -0.14));   // near wing
    px(ctx, 4, 11, 8, 7, b);                    // body
    px(ctx, 4, 11, 8, 1, l);
    px(ctx, 10, 6, 5, 6, b);                    // head/neck
    px(ctx, 14, 9, 2, 2, d);
    px(ctx, 11, 4, 1, 3, d);                    // horn
    px(ctx, 13, 4, 1, 3, d);
    px(ctx, 12, 8, 1, 1, s.accent);
    px(ctx, 14, 8, 1, 1, s.accent);
    px(ctx, 0, 13, 4, 2, d);                    // tail
    px(ctx, 4, 18, 3, 3, d);
    px(ctx, 9, 18, 3, 3, d);
  }

  var BUILDS = {
    humanoid: humanoid, beast: beast, undead: undead,
    construct: construct, ooze: ooze, dragon: dragon
  };

  /* ---- public ---------------------------------------------------------- */
  function get(spec) {
    var s = Object.assign({}, DEFAULT, spec || {});
    var k = JSON.stringify(s);
    if (cache[k]) return cache[k];
    var b = blank();
    (BUILDS[s.kind] || humanoid)(b.ctx, s);
    cache[k] = b.c;
    return b.c;
  }

  /* Deterministic palette from a name - two goblins never look identical. */
  var SKINS = ['#d9a074', '#b9805a', '#8a5c3c', '#eac39a', '#6f4b34'];
  var HAIRS = ['#2b1b12', '#54331f', '#8a5a2b', '#c9a95f', '#3b3b44', '#7a2f2a'];
  var CLOTHS = ['#4b6fa8', '#7a4a8e', '#3f7a5c', '#a8543f', '#5a5f78', '#8a6a2f', '#3b5f7a'];
  function autoSpec(name, base) {
    var h = 0, str = String(name || 'x');
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    h = Math.abs(h);
    return Object.assign({
      skin: SKINS[h % SKINS.length],
      hair: HAIRS[(h >> 3) % HAIRS.length],
      cloth: CLOTHS[(h >> 6) % CLOTHS.length]
    }, base || {});
  }

  function clearCache() { cache = {}; }

  VT.spriteart = {
    get: get, autoSpec: autoSpec, clearCache: clearCache,
    DEFAULT: DEFAULT, BUILDS: Object.keys(BUILDS),
    WEAPONS: ['sword', 'greatsword', 'axe', 'spear', 'bow', 'staff', 'dagger', 'claws', 'none'],
    GW: GW, GH: GH, S: S
  };
})();
