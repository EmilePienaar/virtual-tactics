/* Virtual Tactics :: core/util.js
   Global namespace + small helpers. Everything hangs off window.VT so the whole
   app runs from plain <script> tags (no bundler, no server, no CORS). */
(function () {
  'use strict';
  var VT = window.VT = window.VT || {};

  /* ---- DOM ------------------------------------------------------------- */
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') n.value = v;
      else if (k === 'checked') n.checked = !!v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    if (kids != null) {
      if (!Array.isArray(kids)) kids = [kids];
      kids.forEach(function (c) {
        if (c == null || c === false) return;
        n.appendChild(typeof c === 'string' || typeof c === 'number'
          ? document.createTextNode(String(c)) : c);
      });
    }
    return n;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); return node; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---- math ------------------------------------------------------------ */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  function dist2(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  /* D&D grid distance: Chebyshev, 5 ft per square (PHB basic rule). */
  function gridDist(ax, ay, bx, by) { return Math.max(Math.abs(ax - bx), Math.abs(ay - by)); }

  /* Deterministic hash -> 0..1, used for stable procedural texture noise. */
  function hash01(x, y, seed) {
    var h = (x * 374761393 + y * 668265263 + (seed || 0) * 1274126177) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }

  /* ---- colour ---------------------------------------------------------- */
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbStr(c, a) {
    return 'rgba(' + (c.r | 0) + ',' + (c.g | 0) + ',' + (c.b | 0) + ',' + (a == null ? 1 : a) + ')';
  }
  /* amt > 0 lightens, < 0 darkens */
  function shade(hex, amt) {
    var c = hexToRgb(hex), t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    return '#' + [c.r, c.g, c.b].map(function (v) {
      return Math.round(v + (t - v) * p).toString(16).padStart(2, '0');
    }).join('');
  }

  /* ---- misc ------------------------------------------------------------ */
  var _id = 0;
  function uid(prefix) { return (prefix || 'id') + '_' + (Date.now().toString(36)) + '_' + (++_id).toString(36); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function cap(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }
  function sign(n) { return (n >= 0 ? '+' : '') + n; }
  function pick(arr, rnd) { return arr[Math.floor((rnd || Math.random)() * arr.length)]; }
  function ord(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function debounce(fn, ms) {
    var t; return function () {
      var a = arguments, self = this;
      clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms || 120);
    };
  }

  /* ---- tiny event bus --------------------------------------------------- */
  function Bus() { this._h = {}; }
  Bus.prototype.on = function (ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); return this; };
  Bus.prototype.off = function (ev, fn) {
    var a = this._h[ev]; if (!a) return this;
    var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); return this;
  };
  Bus.prototype.emit = function (ev) {
    var args = Array.prototype.slice.call(arguments, 1), a = this._h[ev];
    if (a) a.slice().forEach(function (f) { f.apply(null, args); });
    var any = this._h['*'];
    if (any) any.slice().forEach(function (f) { f(ev, args); });
    return this;
  };

  VT.util = {
    el: el, $: $, $$: $$, clear: clear, esc: esc,
    clamp: clamp, lerp: lerp, easeOut: easeOut, easeInOut: easeInOut,
    dist2: dist2, gridDist: gridDist, hash01: hash01,
    hexToRgb: hexToRgb, rgbStr: rgbStr, shade: shade,
    uid: uid, clone: clone, cap: cap, sign: sign, pick: pick, ord: ord, debounce: debounce,
    Bus: Bus
  };
  VT.bus = new Bus();
})();
