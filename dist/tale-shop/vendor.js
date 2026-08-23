/* ===== src/core/util.js ===== */
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

/* ===== src/core/sync.js ===== */
/* Board messaging that survives TaleSpire's size limit.

   TS.sync.send rejects any payload over 500 characters:

     sync failed: Error: string too long: max length is 500, length was 3853

   and it rejects the whole message rather than truncating it, so anything
   bigger simply never arrives. A shop with its stock is a few thousand
   characters and a mirrored character sheet is around a thousand, which is why
   neither was reaching the other side of the table.

   So every message goes out in frames small enough to be accepted, and is put
   back together on arrival:

     VTF|<msgId>|<index>|<total>|<chunk of the payload>

   Plain text on purpose. Wrapping a chunk of JSON inside another JSON object
   would escape every quote in it, which inflates the very thing being kept
   small - by roughly a third for our payloads, and unpredictably.

   Frames are budgeted in UTF-8 bytes rather than characters. The limit is
   stated in characters, but an item name with an accent or a dash costs more
   than one byte, and being wrong in that direction means the message is thrown
   away with no way to tell. Counting bytes is never an underestimate. */
(function () {
  'use strict';
  var VT = window.VT = window.VT || {};

  var MAGIC = 'VTF';
  var LIMIT = 440;          /* whole frame, in UTF-8 bytes; 500 is the wall */
  var STALE = 30000;        /* drop half-assembled messages after this */

  /* What a string costs once encoded, without allocating a buffer for it. */
  function byteLen(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1;
      else if (c < 0x800) n += 2;
      else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }   /* surrogate pair */
      else n += 3;
    }
    return n;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 8);
  }

  /* Cut text into pieces that each fit the budget. Never splits a surrogate
     pair, so an emoji in a shop name cannot come out the other end as two
     broken halves. */
  function chunk(text, budget) {
    var out = [], i = 0;
    while (i < text.length) {
      var used = 0, start = i;
      while (i < text.length) {
        var c = text.charCodeAt(i);
        var cost, step;
        if (c < 0x80) { cost = 1; step = 1; }
        else if (c < 0x800) { cost = 2; step = 1; }
        else if (c >= 0xD800 && c <= 0xDBFF) { cost = 4; step = 2; }
        else { cost = 3; step = 1; }
        if (used + cost > budget) break;
        used += cost; i += step;
      }
      if (i === start) { i = start + 1; }   /* budget smaller than one char */
      out.push(text.slice(start, i));
    }
    return out.length ? out : [''];
  }

  /* One message -> the frames to put on the board, in order. */
  function frames(text) {
    var id = uid();
    /* Budget the header at its widest so the count cannot change the maths
       once the pieces are already cut. */
    var header = MAGIC + '|' + id + '|999|999|';
    var pieces = chunk(String(text), LIMIT - byteLen(header));
    return pieces.map(function (p, i) {
      return MAGIC + '|' + id + '|' + i + '|' + pieces.length + '|' + p;
    });
  }

  /* Half-assembled messages, keyed by sender and message id. Kept per sender so
     two people talking at once cannot interleave into each other's message. */
  var pending = {};

  function sweep(now) {
    Object.keys(pending).forEach(function (k) {
      if (now - pending[k].at > STALE) delete pending[k];
    });
  }

  /* Feed every incoming string through this. Returns the complete payload when
     the last missing frame arrives, and null until then. A string that is not
     one of our frames comes straight back, so a caller can still handle
     anything else that turns up on the board. */
  function receive(str, from) {
    if (typeof str !== 'string') return null;
    if (str.slice(0, 4) !== MAGIC + '|') return str;

    var head = str.split('|', 4);
    if (head.length < 4) return null;
    var id = head[1], i = parseInt(head[2], 10), n = parseInt(head[3], 10);
    if (!id || isNaN(i) || isNaN(n) || n < 1 || i < 0 || i >= n) return null;

    /* the chunk is everything after the fourth separator, which may itself
       contain '|' - so count separators rather than splitting on them */
    var at = 0;
    for (var seen = 0; seen < 4 && at < str.length; at++) {
      if (str.charAt(at) === '|') seen++;
    }
    var data = str.slice(at);

    if (n === 1) return data;                 /* the common case, no bookkeeping */

    var now = Date.now();
    sweep(now);
    var key = (from || '?') + '|' + id;
    var slot = pending[key];
    if (!slot || slot.n !== n) slot = pending[key] = { n: n, parts: new Array(n), got: 0, at: now };
    if (slot.parts[i] == null) { slot.parts[i] = data; slot.got++; }
    slot.at = now;

    if (slot.got < n) return null;
    delete pending[key];
    return slot.parts.join('');
  }

  /* Frames go out spaced slightly apart. Firing twenty at once is a good way to
     meet a rate limit nobody documented, and a message that is a few
     milliseconds late costs nothing here. */
  function send(api, text, target, onError) {
    if (!api || !api.send) return;
    var list = frames(text);
    list.forEach(function (f, i) {
      var fire = function () {
        try {
          var p = api.send(f, target || 'board');
          if (p && p.catch) {
            p.catch(function (e) {
              if (onError) onError(e, f);
            });
          }
        } catch (e) { if (onError) onError(e, f); }
      };
      if (i === 0) fire(); else setTimeout(fire, i * 25);
    });
    return list.length;
  }

  VT.sync = {
    LIMIT: LIMIT,
    byteLen: byteLen,
    frames: frames,
    receive: receive,
    send: send
  };
})();

/* ===== src/core/dice.js ===== */
/* Virtual Tactics :: core/dice.js
   Dice notation parser + roller. Understands things like:
     "1d8+3"  "2d6"  "d20"  "2d6+1d4+2"  "1d10-1"  "4"
   Every roll returns the individual die faces so the log can show its work. */
(function () {
  'use strict';
  var VT = window.VT;

  /* Optional seeded RNG so a table can replay a session deterministically. */
  var _seed = null;
  function rnd() {
    if (_seed == null) return Math.random();
    /* mulberry32 */
    _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
    var t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function setSeed(s) { _seed = (s == null || s === '') ? null : (parseInt(s, 10) | 0); }

  function die(sides) { return 1 + Math.floor(rnd() * sides); }

  /* Parse "2d6+1d4+2" into terms. Returns null on garbage. */
  function parse(expr) {
    if (typeof expr === 'number') return [{ n: 0, s: 0, flat: expr, sign: 1 }];
    var s = String(expr || '').replace(/\s+/g, '').toLowerCase();
    if (!s) return null;
    if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null;
    var terms = [], re = /([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g, m;
    while ((m = re.exec(s))) {
      if (m[3]) {
        terms.push({ sign: m[1] === '-' ? -1 : 1, n: m[2] === '' ? 1 : parseInt(m[2], 10), s: parseInt(m[3], 10) });
      } else {
        terms.push({ sign: m[4] === '-' ? -1 : 1, n: 0, s: 0, flat: parseInt(m[5], 10) });
      }
    }
    return terms.length ? terms : null;
  }

  /* roll("2d6+3") -> {total, faces:[...], text:"2d6+3", detail:"[4,5]+3"} */
  function roll(expr, opts) {
    opts = opts || {};
    var terms = parse(expr);
    if (!terms) return { total: 0, faces: [], text: String(expr), detail: '?', invalid: true };
    var total = 0, faces = [], parts = [];
    terms.forEach(function (t) {
      if (t.n) {
        var sub = [];
        for (var i = 0; i < t.n; i++) {
          var v = die(t.s);
          if (opts.maximize) v = t.s;
          sub.push(v); faces.push({ sides: t.s, v: v });
          total += t.sign * v;
        }
        parts.push((t.sign < 0 ? '-' : parts.length ? '+' : '') + '[' + sub.join(',') + ']');
      } else {
        total += t.sign * t.flat;
        parts.push((t.sign < 0 ? '-' : parts.length ? '+' : '') + t.flat);
      }
    });
    if (opts.bonus) { total += opts.bonus; parts.push(VT.util.sign(opts.bonus)); }
    if (opts.min != null) total = Math.max(opts.min, total);
    return { total: total, faces: faces, text: String(expr), detail: parts.join('') };
  }

  /* Doubles the dice, not the modifiers - 5e critical hit rule. */
  function critDice(expr) {
    var terms = parse(expr); if (!terms) return expr;
    return terms.map(function (t, i) {
      var pre = t.sign < 0 ? '-' : (i ? '+' : '');
      return pre + (t.n ? (t.n * 2) + 'd' + t.s : t.flat);
    }).join('');
  }

  /* d20 test with advantage / disadvantage.
     adv: 1 = advantage, -1 = disadvantage, 0 = flat. */
  function d20(mod, adv) {
    mod = mod || 0; adv = adv || 0;
    var a = die(20), b = adv ? die(20) : a;
    var nat = adv > 0 ? Math.max(a, b) : adv < 0 ? Math.min(a, b) : a;
    return {
      nat: nat, both: adv ? [a, b] : [a], mod: mod, total: nat + mod,
      crit: nat === 20, fumble: nat === 1, adv: adv,
      detail: (adv ? '(' + a + '/' + b + ')' : '(' + a + ')') + VT.util.sign(mod)
    };
  }

  /* Average of an expression - used for AI target scoring and previews. */
  function avg(expr) {
    var terms = parse(expr); if (!terms) return 0;
    return terms.reduce(function (sum, t) {
      return sum + t.sign * (t.n ? t.n * (t.s + 1) / 2 : t.flat);
    }, 0);
  }

  VT.dice = { roll: roll, d20: d20, avg: avg, parse: parse, critDice: critDice, die: die, rnd: rnd, setSeed: setSeed };
})();

/* ===== src/rules/srd.js ===== */
/* Virtual Tactics :: rules/srd.js
   5e-compatible reference data: ability maths, conditions, and a starter
   bestiary / party of archetypes so a table can start playing immediately.
   Statblocks are ordinary game numbers - edit any of them in the Roster tab,
   or build your own from scratch. Swap this file wholesale to run a different
   d20 system; nothing else hard-codes these values. */
(function () {
  'use strict';
  var VT = window.VT;

  var ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
  var ABILITY_NAME = { str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA' };
  var SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
  var DAMAGE_TYPES = ['slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning',
    'acid', 'poison', 'necrotic', 'radiant', 'psychic', 'thunder', 'force'];

  /* The 18 skills and the ability each is measured against. */
  var SKILL_ABILITY = {
    athletics: 'str', acrobatics: 'dex', 'sleight of hand': 'dex', stealth: 'dex',
    arcana: 'int', history: 'int', investigation: 'int', nature: 'int', religion: 'int',
    'animal handling': 'wis', insight: 'wis', medicine: 'wis', perception: 'wis', survival: 'wis',
    deception: 'cha', intimidation: 'cha', performance: 'cha', persuasion: 'cha'
  };

  function mod(score) { return Math.floor((score - 10) / 2); }
  function profBonus(level) { return 2 + Math.floor((Math.max(1, level) - 1) / 4); }

  /* ---- conditions ------------------------------------------------------ */
  /* atkFrom  : advantage this creature's own attacks get (-1/0/1)
     atkAgainst: advantage attackers get against it
     noAct    : cannot take actions */
  var CONDITIONS = {
    prone:      { name: 'Prone',      atkFrom: -1, atkAgainstMelee: 1, atkAgainstRanged: -1 },
    dodging:    { name: 'Dodging',    atkAgainst: -1 },
    poisoned:   { name: 'Poisoned',   atkFrom: -1 },
    blinded:    { name: 'Blinded',    atkFrom: -1, atkAgainst: 1 },
    frightened: { name: 'Frightened', atkFrom: -1 },
    restrained: { name: 'Restrained', atkFrom: -1, atkAgainst: 1, speed0: true },
    grappled:   { name: 'Grappled',   speed0: true },
    stunned:    { name: 'Stunned',    atkAgainst: 1, noAct: true, speed0: true },
    paralyzed:  { name: 'Paralyzed',  atkAgainst: 1, noAct: true, speed0: true },
    unconscious:{ name: 'Unconscious',atkAgainst: 1, noAct: true, speed0: true },
    blessed:    { name: 'Blessed',    bonusToHit: '1d4' },
    shielded:   { name: 'Shielded',   acBonus: 5 },
    hasted:     { name: 'Hasted',     speedMult: 2, acBonus: 2 },
    slowed:     { name: 'Slowed',     speedMult: .5 },
    invisible:  { name: 'Invisible',  atkFrom: 1, atkAgainst: -1 },
    concentrating: { name: 'Concentrating' }
  };
  var CONDITION_ICON = {
    prone: '↓', dodging: '○', poisoned: '☠', blinded: '●',
    frightened: '!', restrained: '⊕', grappled: '⊗', stunned: '✳',
    paralyzed: '✖', unconscious: 'z', blessed: '+', hasted: '»', shielded: '△',
    slowed: '«', invisible: '◌', concentrating: '◆'
  };

  /* ---- attack helpers -------------------------------------------------- */
  function melee(name, toHit, dmg, type, opts) {
    return Object.assign({ name: name, kind: 'melee', reach: 5, toHit: toHit, dmg: dmg, dmgType: type || 'slashing', cost: 'action' }, opts || {});
  }
  function ranged(name, toHit, dmg, type, near, far, opts) {
    return Object.assign({ name: name, kind: 'ranged', range: [near || 80, far || 320], toHit: toHit, dmg: dmg, dmgType: type || 'piercing', cost: 'action' }, opts || {});
  }
  function saveSpell(name, ability, dc, dmg, type, radiusFt, rangeFt, opts) {
    return Object.assign({
      name: name, kind: 'save', save: ability, dc: dc, dmg: dmg, dmgType: type || 'fire',
      aoe: radiusFt ? { radius: radiusFt } : null, range: [rangeFt || 60, rangeFt || 60],
      half: true, cost: 'action'
    }, opts || {});
  }
  function heal(name, dice, rangeFt, opts) {
    return Object.assign({ name: name, kind: 'heal', dmg: dice, range: [rangeFt || 5, rangeFt || 5], cost: 'action' }, opts || {});
  }

  /* ---- party archetypes ------------------------------------------------ */
  /* Level 3 baselines - a sane starting point that is easy to retune. */
  var CLASSES = {
    fighter: {
      name: 'Fighter', hitDie: 10, ac: 18, speed: 30,
      abilities: { str: 16, dex: 12, con: 15, int: 10, wis: 12, cha: 10 },
      spec: { kind: 'humanoid', weapon: 'sword', shield: true, helm: true, cloth: '#5a5f78', trim: '#c8a44c' },
      actions: [melee('Longsword', 5, '1d8+3', 'slashing'), ranged('Handaxe', 5, '1d6+3', 'slashing', 20, 60),
        { name: 'Second Wind', kind: 'heal', dmg: '1d10+3', range: [0, 0], cost: 'bonus', uses: { max: 1, per: 'rest' }, self: true }]
    },
    barbarian: {
      name: 'Barbarian', hitDie: 12, ac: 15, speed: 40,
      abilities: { str: 17, dex: 14, con: 16, int: 8, wis: 11, cha: 10 },
      spec: { kind: 'humanoid', weapon: 'greatsword', cloth: '#8a5a2b', trim: '#7a2f2a', hair: '#c9a95f' },
      actions: [melee('Greataxe', 5, '1d12+3', 'slashing'),
        { name: 'Rage', kind: 'buff', condition: 'blessed', range: [0, 0], cost: 'bonus', self: true, uses: { max: 3, per: 'rest' } }]
    },
    rogue: {
      name: 'Rogue', hitDie: 8, ac: 15, speed: 30,
      abilities: { str: 10, dex: 17, con: 13, int: 13, wis: 12, cha: 14 },
      spec: { kind: 'humanoid', weapon: 'dagger', cloth: '#3b3b44', trim: '#4d6b3c', cape: true },
      actions: [melee('Shortsword', 5, '1d6+3', 'piercing', { sneak: '2d6' }),
        ranged('Shortbow', 5, '1d6+3', 'piercing', 80, 320, { sneak: '2d6' }),
        { name: 'Hide', kind: 'buff', condition: 'invisible', range: [0, 0], cost: 'bonus', self: true }]
    },
    ranger: {
      name: 'Ranger', hitDie: 10, ac: 16, speed: 30,
      abilities: { str: 12, dex: 16, con: 14, int: 11, wis: 14, cha: 10 },
      spec: { kind: 'humanoid', weapon: 'bow', cloth: '#3f7a5c', trim: '#6b4a2a' },
      actions: [ranged('Longbow', 5, '1d8+3', 'piercing', 150, 600), melee('Shortsword', 5, '1d6+3', 'piercing')]
    },
    wizard: {
      name: 'Wizard', hitDie: 6, ac: 12, speed: 30,
      abilities: { str: 8, dex: 14, con: 13, int: 17, wis: 12, cha: 11 },
      spec: { kind: 'humanoid', weapon: 'staff', cloth: '#7a4a8e', trim: '#c8a44c', accent: '#9a76c4', cape: true },
      actions: [ranged('Fire Bolt', 5, '2d10', 'fire', 120, 120, { spell: true }),
        saveSpell('Burning Hands', 'dex', 13, '3d6', 'fire', 15, 15),
        saveSpell('Fireball', 'dex', 13, '8d6', 'fire', 20, 150, { uses: { max: 1, per: 'rest' } }),
        { name: 'Shield', kind: 'buff', condition: 'dodging', range: [0, 0], cost: 'reaction', self: true }]
    },
    cleric: {
      name: 'Cleric', hitDie: 8, ac: 18, speed: 30,
      abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 },
      spec: { kind: 'humanoid', weapon: 'sword', shield: true, cloth: '#cfc7bd', trim: '#c8a44c' },
      actions: [melee('Mace', 4, '1d6+2', 'bludgeoning'),
        ranged('Sacred Flame', 5, '2d8', 'radiant', 60, 60, { spell: true }),
        heal('Cure Wounds', '1d8+3', 30, { uses: { max: 3, per: 'rest' } }),
        { name: 'Bless', kind: 'buff', condition: 'blessed', range: [30, 30], cost: 'action', uses: { max: 2, per: 'rest' } }]
    },
    paladin: {
      name: 'Paladin', hitDie: 10, ac: 18, speed: 30,
      abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 15 },
      spec: { kind: 'humanoid', weapon: 'sword', shield: true, helm: true, cloth: '#b9bcc4', trim: '#d8b25c', cape: true, accent: '#c8504a' },
      actions: [melee('Longsword', 5, '1d8+3', 'slashing'),
        melee('Divine Smite', 5, '1d8+3+2d8', 'radiant', { uses: { max: 2, per: 'rest' } }),
        heal('Lay on Hands', '15', 5, { uses: { max: 1, per: 'rest' } })]
    },
    druid: {
      name: 'Druid', hitDie: 8, ac: 14, speed: 30,
      abilities: { str: 10, dex: 13, con: 14, int: 12, wis: 17, cha: 11 },
      spec: { kind: 'humanoid', weapon: 'staff', cloth: '#4d6b3c', trim: '#8a6a2f', accent: '#78b06a' },
      actions: [ranged('Thorn Whip', 5, '2d6', 'piercing', 30, 30, { spell: true }),
        saveSpell('Thunderwave', 'con', 13, '2d8', 'thunder', 15, 5),
        heal('Healing Word', '1d4+3', 60, { cost: 'bonus', uses: { max: 2, per: 'rest' } })]
    }
  };

  /* ---- bestiary -------------------------------------------------------- */
  var MONSTERS = {
    goblin: {
      name: 'Goblin', size: 'small', cr: '1/4', ac: 15, hp: 7, speed: 30,
      abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      spec: { kind: 'humanoid', skin: '#7d9b52', hair: '#3a2a18', cloth: '#6b5334', weapon: 'dagger' },
      actions: [melee('Scimitar', 4, '1d6+2', 'slashing'), ranged('Shortbow', 4, '1d6+2', 'piercing', 80, 320)]
    },
    kobold: {
      name: 'Kobold', size: 'small', cr: '1/8', ac: 12, hp: 5, speed: 30,
      abilities: { str: 7, dex: 15, con: 9, int: 8, wis: 7, cha: 8 },
      spec: { kind: 'humanoid', skin: '#b06a3a', hair: '#5a2f1c', cloth: '#7a4a2a', weapon: 'spear' },
      actions: [melee('Spear', 4, '1d6+2', 'piercing'), ranged('Sling', 4, '1d4+2', 'bludgeoning', 30, 120)]
    },
    orc: {
      name: 'Orc', size: 'medium', cr: '1/2', ac: 13, hp: 15, speed: 30,
      abilities: { str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10 },
      spec: { kind: 'humanoid', skin: '#6f8a54', hair: '#241a12', cloth: '#5a4028', weapon: 'axe' },
      actions: [melee('Greataxe', 5, '1d12+3', 'slashing'), ranged('Javelin', 5, '1d6+3', 'piercing', 30, 120)]
    },
    hobgoblin: {
      name: 'Hobgoblin', size: 'medium', cr: '1/2', ac: 18, hp: 11, speed: 30,
      abilities: { str: 13, dex: 12, con: 12, int: 10, wis: 10, cha: 9 },
      spec: { kind: 'humanoid', skin: '#b06b4a', hair: '#3a1f14', cloth: '#7a3f3a', weapon: 'sword', shield: true, helm: true },
      actions: [melee('Longsword', 3, '1d8+1', 'slashing'), ranged('Longbow', 3, '1d8+1', 'piercing', 150, 600)]
    },
    bandit: {
      name: 'Bandit', size: 'medium', cr: '1/8', ac: 12, hp: 11, speed: 30,
      abilities: { str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
      spec: { kind: 'humanoid', cloth: '#5a4a6a', weapon: 'sword' },
      actions: [melee('Scimitar', 3, '1d6+1', 'slashing'), ranged('Light Crossbow', 3, '1d8+1', 'piercing', 80, 320)]
    },
    cultist: {
      name: 'Cultist', size: 'medium', cr: '1/8', ac: 12, hp: 9, speed: 30,
      abilities: { str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10 },
      spec: { kind: 'humanoid', cloth: '#3a2b44', trim: '#8d3b46', weapon: 'dagger', cape: true },
      actions: [melee('Ritual Dagger', 3, '1d4+1', 'piercing'),
        saveSpell('Hex Bolt', 'wis', 11, '2d6', 'necrotic', 0, 60)]
    },
    bugbear: {
      name: 'Bugbear', size: 'medium', cr: '1', ac: 16, hp: 27, speed: 30,
      abilities: { str: 15, dex: 14, con: 13, int: 8, wis: 11, cha: 9 },
      spec: { kind: 'humanoid', skin: '#8a6a3a', hair: '#4a2f16', cloth: '#4a3a24', weapon: 'axe' },
      actions: [melee('Morningstar', 4, '2d8+2', 'piercing', { reach: 10 }), ranged('Javelin', 4, '1d6+2', 'piercing', 30, 120)]
    },
    gnoll: {
      name: 'Gnoll', size: 'medium', cr: '1/2', ac: 15, hp: 22, speed: 30,
      abilities: { str: 14, dex: 12, con: 11, int: 6, wis: 10, cha: 7 },
      spec: { kind: 'beast', cloth: '#a8874a', accent: '#c8504a' },
      actions: [melee('Bite', 4, '1d4+2', 'piercing'), melee('Spear', 4, '1d6+2', 'piercing')]
    },
    wolf: {
      name: 'Wolf', size: 'medium', cr: '1/4', ac: 13, hp: 11, speed: 40,
      abilities: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
      spec: { kind: 'beast', cloth: '#6b6b70', accent: '#d8b25c' },
      actions: [melee('Bite', 4, '2d4+2', 'piercing')]
    },
    direwolf: {
      name: 'Dire Wolf', size: 'large', cr: '1', ac: 14, hp: 37, speed: 50,
      abilities: { str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7 },
      spec: { kind: 'beast', cloth: '#3f4048', accent: '#c9605a' },
      actions: [melee('Bite', 5, '2d6+3', 'piercing')]
    },
    spider: {
      name: 'Giant Spider', size: 'large', cr: '1', ac: 14, hp: 26, speed: 30,
      abilities: { str: 14, dex: 16, con: 12, int: 2, wis: 11, cha: 4 },
      spec: { kind: 'beast', cloth: '#2f2a36', accent: '#c8504a' },
      actions: [melee('Bite', 5, '1d8+3', 'piercing'),
        ranged('Web', 5, '0', 'bludgeoning', 30, 60, { applies: 'restrained' })]
    },
    owlbear: {
      name: 'Owlbear', size: 'large', cr: '3', ac: 13, hp: 59, speed: 40,
      abilities: { str: 20, dex: 12, con: 17, int: 3, wis: 12, cha: 7 },
      spec: { kind: 'beast', cloth: '#8a6a4a', accent: '#d8b25c' },
      actions: [melee('Beak', 7, '1d10+5', 'piercing'), melee('Claws', 7, '2d8+5', 'slashing')]
    },
    skeleton: {
      name: 'Skeleton', size: 'medium', cr: '1/4', ac: 13, hp: 13, speed: 30,
      abilities: { str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5 },
      spec: { kind: 'undead', skin: '#d8d2c0', accent: '#c9605a', weapon: 'sword' },
      actions: [melee('Shortsword', 4, '1d6+2', 'piercing'), ranged('Shortbow', 4, '1d6+2', 'piercing', 80, 320)],
      resist: ['piercing'], vulnerable: ['bludgeoning']
    },
    zombie: {
      name: 'Zombie', size: 'medium', cr: '1/4', ac: 8, hp: 22, speed: 20,
      abilities: { str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5 },
      spec: { kind: 'undead', skin: '#8a9b76', accent: '#5f8b46', weapon: 'none' },
      actions: [melee('Slam', 3, '1d6+1', 'bludgeoning')]
    },
    wight: {
      name: 'Wight', size: 'medium', cr: '3', ac: 14, hp: 45, speed: 30,
      abilities: { str: 15, dex: 14, con: 16, int: 10, wis: 13, cha: 15 },
      spec: { kind: 'undead', skin: '#b9c0c8', accent: '#9a76c4', weapon: 'sword', cape: true },
      actions: [melee('Life Drain', 4, '1d6+2+1d6', 'necrotic'), ranged('Longbow', 4, '1d8+2', 'piercing', 150, 600)],
      resist: ['necrotic']
    },
    armor: {
      name: 'Animated Armor', size: 'medium', cr: '1', ac: 18, hp: 33, speed: 25,
      abilities: { str: 14, dex: 11, con: 13, int: 1, wis: 3, cha: 1 },
      spec: { kind: 'construct', metal: '#8f96a3', accent: '#5f9ecf' },
      actions: [melee('Slam', 4, '1d6+2', 'bludgeoning')],
      immune: ['poison', 'psychic']
    },
    ogre: {
      name: 'Ogre', size: 'large', cr: '2', ac: 11, hp: 59, speed: 40,
      abilities: { str: 19, dex: 8, con: 16, int: 5, wis: 7, cha: 7 },
      spec: { kind: 'humanoid', skin: '#c0a07a', hair: '#4a2f16', cloth: '#7a6244', weapon: 'greatsword' },
      actions: [melee('Greatclub', 6, '2d8+4', 'bludgeoning'), ranged('Javelin', 6, '2d6+4', 'piercing', 30, 120)]
    },
    troll: {
      name: 'Troll', size: 'large', cr: '5', ac: 15, hp: 84, speed: 30,
      abilities: { str: 18, dex: 13, con: 20, int: 7, wis: 9, cha: 7 },
      spec: { kind: 'humanoid', skin: '#6f8a54', hair: '#3f5a2a', cloth: '#4a3a24', weapon: 'claws' },
      actions: [melee('Claw', 7, '2d6+4', 'slashing'), melee('Bite', 7, '1d6+4', 'piercing')],
      regen: 10
    },
    ooze: {
      name: 'Gray Ooze', size: 'medium', cr: '1/2', ac: 8, hp: 22, speed: 10,
      abilities: { str: 12, dex: 6, con: 16, int: 1, wis: 6, cha: 2 },
      spec: { kind: 'ooze', cloth: '#6d7a72' },
      actions: [melee('Pseudopod', 3, '1d6+1+2d6', 'acid')],
      immune: ['acid', 'poison']
    },
    drake: {
      name: 'Young Drake', size: 'large', cr: '4', ac: 17, hp: 68, speed: 40,
      abilities: { str: 17, dex: 14, con: 16, int: 8, wis: 11, cha: 12 },
      spec: { kind: 'dragon', cloth: '#8a3f3a', accent: '#ffb04d' },
      actions: [melee('Bite', 6, '2d10+3', 'piercing'), melee('Claw', 6, '1d8+3', 'slashing'),
        saveSpell('Fire Breath', 'dex', 14, '6d6', 'fire', 15, 30, { uses: { max: 1, per: 'rest' } })],
      resist: ['fire']
    }
  };

  VT.srd = {
    ABILITIES: ABILITIES, ABILITY_NAME: ABILITY_NAME, SIZES: SIZES, DAMAGE_TYPES: DAMAGE_TYPES,
    SKILL_ABILITY: SKILL_ABILITY,
    CONDITIONS: CONDITIONS, CONDITION_ICON: CONDITION_ICON,
    CLASSES: CLASSES, MONSTERS: MONSTERS,
    mod: mod, profBonus: profBonus,
    melee: melee, ranged: ranged, saveSpell: saveSpell, heal: heal
  };
})();

/* ===== src/render/spriteart.js ===== */
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

/* ===== src/rules/actor.js ===== */
/* Virtual Tactics :: rules/actor.js
   Actor construction and the derived numbers combat asks for. An "actor" is a
   plain object: a roster entry is a template, and putting one on the board
   clones it into a token with its own id and per-encounter state. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function base(name) {
    return {
      id: U.uid('a'),
      name: name || 'Unnamed',
      team: 'party',
      level: 3,
      size: 'medium',
      ac: 12,
      hpMax: 10, hp: 10, tempHp: 0,
      speed: 30,
      abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
      saveProf: [],
      actions: [],
      conditions: [],
      resist: [], vulnerable: [], immune: [],
      coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      spriteId: null,
      spec: null,
      x: 0, y: 0, fx: 1, fy: 1,
      notes: '',
      /* per-turn state, reset by combat */
      initiative: 0, moveLeft: 30, actionUsed: false, bonusUsed: false,
      reactionUsed: false, dashed: false, deathSaves: { s: 0, f: 0 }, used: {}
    };
  }

  function fromClass(key, name, level) {
    var c = SRD.CLASSES[key];
    if (!c) return base(name);
    var a = base(name || c.name);
    level = U.clamp(level || 3, 1, 20);
    a.level = level;
    a.className = c.name;
    a.classKey = key;
    a.team = 'party';
    a.ac = c.ac;
    a.speed = c.speed;
    a.abilities = U.clone(c.abilities);
    var conMod = SRD.mod(a.abilities.con);
    var avgDie = c.hitDie / 2 + 0.5;
    a.hpMax = Math.max(1, Math.round(c.hitDie + conMod + (level - 1) * (avgDie + conMod)));
    a.hp = a.hpMax;
    a.actions = U.clone(c.actions);
    a.spec = VT.spriteart.autoSpec(a.name, c.spec);
    a.saveProf = key === 'wizard' ? ['int', 'wis'] : key === 'rogue' ? ['dex', 'int'] : ['str', 'con'];
    return a;
  }

  function fromMonster(key, name) {
    var m = SRD.MONSTERS[key];
    if (!m) return base(name);
    var a = base(name || m.name);
    a.monsterKey = key;
    a.team = 'foe';
    a.size = m.size;
    a.ac = m.ac;
    a.hpMax = m.hp; a.hp = m.hp;
    a.speed = m.speed;
    a.abilities = U.clone(m.abilities);
    a.actions = U.clone(m.actions);
    a.cr = m.cr;
    a.resist = U.clone(m.resist || []);
    a.vulnerable = U.clone(m.vulnerable || []);
    a.immune = U.clone(m.immune || []);
    a.regen = m.regen || 0;
    a.spec = VT.spriteart.autoSpec(a.name, m.spec);
    a.level = crToLevel(m.cr);
    return a;
  }

  function crToLevel(cr) {
    if (!cr) return 1;
    if (String(cr).indexOf('/') >= 0) return 1;
    return Math.max(1, parseInt(cr, 10) || 1);
  }

  /* A board token: fresh id, full hp, no leftover conditions. */
  function instance(template, over) {
    var a = U.clone(template);
    a.id = U.uid('t');
    a.templateId = template.id;
    a.hp = a.hpMax;
    a.tempHp = 0;
    a.conditions = [];
    a.used = {};
    a.deathSaves = { s: 0, f: 0 };
    resetTurn(a);
    return Object.assign(a, over || {});
  }

  /* ---- derived numbers ------------------------------------------------- */
  function abilityMod(a, k) { return SRD.mod((a.abilities && a.abilities[k]) || 10); }
  function prof(a) { return SRD.profBonus(a.level || 1); }
  function saveMod(a, k) {
    return abilityMod(a, k) + ((a.saveProf || []).indexOf(k) >= 0 ? prof(a) : 0);
  }
  function passivePerception(a) { return 10 + abilityMod(a, 'wis'); }

  /* AC as it stands this instant: the sheet's number, plus anything the active
     conditions add (Haste is +2, the Shield spell +5), plus a manual override
     for whatever the rules did not model. Combat asks for this, not a.ac, so a
     hasted target is genuinely harder to hit. */
  function effectiveAC(a) {
    var ac = (a.ac || 10) + (a.acBonus || 0);
    (a.conditions || []).forEach(function (c) {
      var def = SRD.CONDITIONS[c];
      if (def && def.acBonus) ac += def.acBonus;
    });
    return ac;
  }

  /* What is adding to it, for the "18 (+2 hasted)" hint. */
  function acSources(a) {
    var out = [];
    if (a.acBonus) out.push(U.sign(a.acBonus) + ' manual');
    (a.conditions || []).forEach(function (c) {
      var def = SRD.CONDITIONS[c];
      if (def && def.acBonus) out.push(U.sign(def.acBonus) + ' ' + def.name.toLowerCase());
    });
    return out;
  }

  function speedOf(a) {
    var s = a.speed || 30;
    (a.conditions || []).forEach(function (c) {
      var def = SRD.CONDITIONS[c];
      if (!def) return;
      if (def.speed0) s = 0;
      if (def.speedMult) s = Math.round(s * def.speedMult);
    });
    return s;
  }

  function canAct(a) {
    if (a.hp <= 0) return false;
    return !(a.conditions || []).some(function (c) {
      return SRD.CONDITIONS[c] && SRD.CONDITIONS[c].noAct;
    });
  }

  function hasCond(a, c) { return (a.conditions || []).indexOf(c) >= 0; }
  function addCond(a, c) {
    a.conditions = a.conditions || [];
    if (a.conditions.indexOf(c) < 0) a.conditions.push(c);
  }
  function removeCond(a, c) {
    a.conditions = (a.conditions || []).filter(function (x) { return x !== c; });
  }

  function resetTurn(a) {
    a.moveLeft = speedOf(a);
    a.actionUsed = false;
    a.bonusUsed = false;
    a.dashed = false;
    a.movedThisTurn = 0;
  }

  function usesLeft(a, action) {
    if (!action.uses) return Infinity;
    var spent = (a.used && a.used[action.name]) || 0;
    return Math.max(0, action.uses.max - spent);
  }
  function spendUse(a, action) {
    if (!action.uses) return;
    a.used = a.used || {};
    a.used[action.name] = ((a.used[action.name]) || 0) + 1;
  }

  /* ---- damage ---------------------------------------------------------- */
  function applyDamage(a, amount, type) {
    var before = a.hp;
    if (type && (a.immune || []).indexOf(type) >= 0) return { taken: 0, immune: true, hp: a.hp };
    if (type && (a.resist || []).indexOf(type) >= 0) amount = Math.floor(amount / 2);
    if (type && (a.vulnerable || []).indexOf(type) >= 0) amount = amount * 2;
    var toTemp = Math.min(a.tempHp || 0, amount);
    a.tempHp = (a.tempHp || 0) - toTemp;
    amount -= toTemp;
    a.hp = Math.max(0, a.hp - amount);
    var downed = before > 0 && a.hp === 0;
    var deathFail = null;
    if (downed) {
      a.conditions = ['unconscious'];
      a.deathSaves = { s: 0, f: 0 };
      a.stable = false;
    } else if (before === 0 && amount > 0) {
      /* already down: the hit itself is a failed death save */
      deathFail = deathSaveDamage(a, !!(type && type.crit));
    }
    return {
      taken: amount + toTemp, absorbed: toTemp, hp: a.hp, downed: downed,
      deathFail: deathFail,
      resisted: type && (a.resist || []).indexOf(type) >= 0,
      vulnerable: type && (a.vulnerable || []).indexOf(type) >= 0
    };
  }

  function healBy(a, amount) {
    var was = a.hp;
    if (a.hp === 0 && amount > 0) removeCond(a, 'unconscious');
    a.hp = Math.min(a.hpMax, a.hp + amount);
    return a.hp - was;
  }

  /* ---- UI helper ------------------------------------------------------- */
  /* A small canvas portrait for the initiative strip and roster lists. */
  function portrait(a, w, h) {
    var c = document.createElement('canvas');
    c.width = w || 52; c.height = h || 42;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    /* VT.sprites lives in the renderer, which the character builder does not
       load - fall back to generated art rather than exploding. */
    var hasSprites = !!(VT.sprites && VT.sprites.getImage);
    var img = (a.spriteId && hasSprites) ? VT.sprites.getImage(a.spriteId) : null;
    var rec = (a.spriteId && VT.store && VT.store.getSprite) ? VT.store.getSprite(a.spriteId) : null;
    function place(src, sx, sy, sw, sh) {
      var scale = Math.min(c.width / sw, c.height / sh);
      var dw = sw * scale, dh = sh * scale;
      ctx.drawImage(src, sx, sy, sw, sh, (c.width - dw) / 2, c.height - dh, dw, dh);
    }
    if (hasSprites && VT.sprites.ready(img) && rec) {
      var fw = rec.cols > 1 ? img.width / rec.cols : img.width;
      var fh = rec.rows > 1 ? img.height / rec.rows : img.height;
      place(img, 0, 0, fw, fh);
    } else {
      var spr = VT.spriteart.get(a.spec || VT.spriteart.autoSpec(a.name));
      place(spr, 0, 0, spr.width, spr.height);
    }
    return c;
  }

  /* ---- death saves -------------------------------------------------------
     Three successes and you are stable; three failures and you are dead. A
     natural 20 puts you back on your feet with one hit point; a natural 1
     counts as two failures. Damage taken while at zero is itself a failure,
     and two if the hit was a critical.

     Worth tracking rather than remembering, because the whole table loses
     count and the difference is a character. */
  function deathSaveState(a) {
    a.deathSaves = a.deathSaves || { s: 0, f: 0 };
    return a.deathSaves;
  }

  function deathSaveOutcome(a) {
    var d = deathSaveState(a);
    if (d.f >= 3) return 'dead';
    if (d.s >= 3) return 'stable';
    return '';
  }

  /* Record a d20. `nat` is the die face, so a 20 and a 1 can be told apart
     from a modified total. Returns what happened, for the sheet to say. */
  function deathSave(a, nat) {
    var d = deathSaveState(a);
    if (nat >= 20) {
      a.deathSaves = { s: 0, f: 0 };
      a.hp = Math.max(1, a.hp);
      removeCond(a, 'unconscious');
      return { result: 'revived', note: 'natural 20 — back up with 1 hit point' };
    }
    if (nat <= 1) {
      d.f = Math.min(3, d.f + 2);
      return { result: 'fumble', note: 'natural 1 — two failures', outcome: deathSaveOutcome(a) };
    }
    if (nat >= 10) {
      d.s = Math.min(3, d.s + 1);
      var out = deathSaveOutcome(a);
      if (out === 'stable') { a.deathSaves = { s: 0, f: 0 }; a.stable = true; }
      return { result: 'success', outcome: out };
    }
    d.f = Math.min(3, d.f + 1);
    return { result: 'failure', outcome: deathSaveOutcome(a) };
  }

  /* Damage while already down. */
  function deathSaveDamage(a, crit) {
    var d = deathSaveState(a);
    d.f = Math.min(3, d.f + (crit ? 2 : 1));
    a.stable = false;
    return { result: crit ? 'fumble' : 'failure', outcome: deathSaveOutcome(a) };
  }

  function clearDeathSaves(a) { a.deathSaves = { s: 0, f: 0 }; a.stable = false; }

  /* ---- attunement --------------------------------------------------------
     A character can be attuned to three magic items at once. The rule is worth
     modelling rather than leaving to memory because it is a real constraint on
     a party's loot, and the sheet is where the argument about it happens. */
  var ATTUNE_MAX = 3;

  function attuneMax(a) { return (a && a.attuneMax) || ATTUNE_MAX; }
  function attunedTo(a) { return (a && a.attuned) || []; }
  function attuneCount(a) { return attunedTo(a).length; }
  function attuneFull(a) { return attuneCount(a) >= attuneMax(a); }

  function isAttuned(a, name) {
    var n = String(name || '').toLowerCase();
    return attunedTo(a).some(function (x) { return String(x.name).toLowerCase() === n; });
  }

  function attune(a, item) {
    a.attuned = a.attuned || [];
    if (isAttuned(a, item.name)) return { ok: false, reason: 'Already attuned.' };
    if (attuneFull(a)) {
      return { ok: false, reason: 'Already attuned to ' + attuneMax(a) + ' items.' };
    }
    a.attuned.push({ name: item.name, source: item.source || null,
                     note: typeof item.reqAttune === 'string' ? item.reqAttune : '' });
    return { ok: true };
  }

  function unattune(a, name) {
    var n = String(name || '').toLowerCase();
    a.attuned = attunedTo(a).filter(function (x) { return String(x.name).toLowerCase() !== n; });
    return { ok: true };
  }

  VT.actor = {
    deathSave: deathSave, deathSaveDamage: deathSaveDamage,
    deathSaveState: deathSaveState, deathSaveOutcome: deathSaveOutcome,
    clearDeathSaves: clearDeathSaves,
    attuneMax: attuneMax, attunedTo: attunedTo, attuneCount: attuneCount,
    attuneFull: attuneFull, isAttuned: isAttuned, attune: attune, unattune: unattune,
    ATTUNE_MAX: ATTUNE_MAX,
    base: base, fromClass: fromClass, fromMonster: fromMonster, instance: instance,
    abilityMod: abilityMod, prof: prof, saveMod: saveMod, passivePerception: passivePerception,
    speedOf: speedOf, effectiveAC: effectiveAC, acSources: acSources, canAct: canAct, hasCond: hasCond, addCond: addCond, removeCond: removeCond,
    resetTurn: resetTurn, usesLeft: usesLeft, spendUse: spendUse,
    applyDamage: applyDamage, healBy: healBy, portrait: portrait
  };
})();

/* ===== src/rules/gear.js ===== */
/* Virtual Tactics :: rules/gear.js
   What a character is wearing, and what that costs them.

   Armour used to be picked once at build time and then only existed as a name
   and an AC number. That made three things impossible: seeing your armour in
   your inventory, taking it off without deleting it, and applying the penalties
   that come with wearing it. All three are the same missing idea - equipment is
   a thing you own that may or may not be worn right now.

   So an inventory entry can carry a `gear` record and an `equipped` flag, and
   everything else is derived from what is equipped. Taking off plate is
   unsetting a boolean; the plate is still in the bag.

   The penalties are the part that was quietly missing. Heavy armour gives
   disadvantage on Stealth, and wearing armour heavier than your Strength can
   support costs you 10 feet of speed - and a monk's Unarmored Movement and a
   barbarian's Fast Movement both stop applying, which is the whole reason those
   features say "unarmoured" in their names. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  /* 5etools types: HA heavy, MA medium, LA light, S shield. */
  var ARMOUR = { HA: 'heavy', MA: 'medium', LA: 'light' };

  function baseType(item) {
    return String((item && item.type) || '').split('|')[0];
  }

  /* Which slot an item occupies, or null if it is not something you wear. */
  function slotOf(item) {
    var t = baseType(item);
    if (ARMOUR[t]) return 'armor';
    if (t === 'S') return 'shield';
    if (item && (item.weaponCategory || t === 'M' || t === 'R')) return 'weapon';
    return null;
  }

  /* The compact record kept on an inventory entry. Deliberately a copy of the
     few fields that matter rather than the whole item: this is saved with the
     character and rides through the symbiote's 500-byte sync budget. */
  function fromItem(item) {
    var slot = slotOf(item);
    if (!slot) return null;
    var g = { slot: slot };
    var t = baseType(item);
    if (slot === 'armor') {
      g.weight = ARMOUR[t];                       /* heavy | medium | light */
      g.ac = item.ac || 10;
      if (item.stealth) g.stealth = true;         /* disadvantage while worn */
      if (item.strength) g.strength = parseInt(item.strength, 10) || 0;
    } else if (slot === 'shield') {
      g.ac = item.ac || 2;
    }
    return g;
  }

  function entries(actor) {
    return (actor && actor.inventory) || [];
  }

  function equippedIn(actor, slot) {
    return entries(actor).filter(function (e) {
      return e.equipped && e.gear && e.gear.slot === slot;
    })[0] || null;
  }

  function armour(actor) { return equippedIn(actor, 'armor'); }
  function shield(actor) { return equippedIn(actor, 'shield'); }

  /* Wearing something takes off whatever was in that slot. You cannot wear two
     breastplates, and a sheet that lets you is worse than one that does not. */
  function equip(actor, entry) {
    if (!entry || !entry.gear) return false;
    entries(actor).forEach(function (e) {
      if (e !== entry && e.equipped && e.gear && e.gear.slot === entry.gear.slot) {
        e.equipped = false;
      }
    });
    entry.equipped = true;
    recompute(actor);
    return true;
  }

  function unequip(actor, entry) {
    if (!entry) return false;
    entry.equipped = false;
    recompute(actor);
    return true;
  }

  function toggle(actor, entry) {
    return entry.equipped ? unequip(actor, entry) : equip(actor, entry);
  }

  /* ---- what being dressed costs ----------------------------------------- */

  /* Disadvantage on Stealth, from the armour itself. */
  function stealthDisadvantage(actor) {
    var a = armour(actor);
    return !!(a && a.gear && a.gear.stealth);
  }

  /* Armour you are not strong enough for costs 10 feet. Dwarves are famously
     exempt, and say so in their own trait text rather than anywhere central, so
     derive() records it when it reads the race. */
  function speedPenalty(actor) {
    var a = armour(actor);
    if (!a || !a.gear || !a.gear.strength) return 0;
    if (actor.heavyArmorSpeedOk) return 0;
    var str = SRD.mod ? (actor.abilities && actor.abilities.str) || 10 : 10;
    return str < a.gear.strength ? 10 : 0;
  }

  function wearingArmour(actor) { return !!armour(actor); }
  function wearingHeavy(actor) {
    var a = armour(actor);
    return !!(a && a.gear && a.gear.weight === 'heavy');
  }
  function wearingShield(actor) { return !!shield(actor); }

  /* ---- putting the numbers back together -------------------------------- */

  /* Recalculate everything that depends on what is worn. Called after any
     equip or unequip, and by derive() once the inventory exists. */
  function recompute(actor) {
    if (!actor) return actor;
    var arm = armour(actor), shd = shield(actor);
    var dex = SRD.mod((actor.abilities && actor.abilities.dex) || 10);

    var ac, why;
    if (arm) {
      var g = arm.gear;
      var base = g.ac || 10;
      if (g.weight === 'heavy') { ac = base; why = arm.name + ' ' + base; }
      else if (g.weight === 'medium') {
        var capped = Math.min(2, dex);
        ac = base + capped;
        why = arm.name + ' ' + base + U.sign(capped) + ' DEX (capped at +2)';
      } else {
        ac = base + dex;
        why = arm.name + ' ' + base + U.sign(dex) + ' DEX';
      }
    } else {
      ac = 10 + dex;
      why = '10' + U.sign(dex) + ' DEX (no armour)';
    }
    if (shd) { ac += (shd.gear.ac || 2); why += ' +' + (shd.gear.ac || 2) + ' shield'; }

    actor.armorName = arm ? arm.name : '';
    actor.armorType = arm ? arm.gear.weight : null;
    actor.shield = !!shd;
    actor.ac = ac;
    actor.acWhy = why;

    /* Features that replace AC or add speed depend on what is worn, so they
       have to be reconsidered every time it changes. apply() carries spent
       resources forward, so re-running it costs nothing but the recalculation. */
    if (VT.features && VT.features.apply) VT.features.apply(actor);
    return actor;
  }

  /* Put an item into the bag, as gear when it is wearable. */
  function add(actor, item, opts) {
    opts = opts || {};
    actor.inventory = actor.inventory || [];
    var g = fromItem(item);
    var entry = {
      name: item.name,
      qty: opts.qty || 1,
      note: opts.note || '',
      gear: g || undefined,
      equipped: g ? !!opts.equipped : undefined
    };
    actor.inventory.push(entry);
    if (entry.equipped) equip(actor, entry);
    return entry;
  }

  VT.gear = {
    slotOf: slotOf, fromItem: fromItem, add: add,
    armour: armour, shield: shield,
    equip: equip, unequip: unequip, toggle: toggle,
    recompute: recompute,
    stealthDisadvantage: stealthDisadvantage, speedPenalty: speedPenalty,
    wearingArmour: wearingArmour, wearingHeavy: wearingHeavy, wearingShield: wearingShield
  };
})();

/* ===== src/data/tags.js ===== */
/* Virtual Tactics :: data/tags.js
   Parser for 5etools' inline markup and nested `entries` trees.

   Every text field in that dataset is peppered with tags like
     {@atk mw} {@hit 4} to hit, reach 5 ft. {@h}5 ({@damage 1d6+2}) piercing
   and cross-references like {@spell fireball|phb|the fireball spell}, which are
   pipe-separated as {@tag name|source|displayText}.

   Two jobs here:
     render()  - tags to readable text or HTML, for the compendium
     mechanics() - tags to structured numbers, so an action becomes a real
                   {toHit, dmg, dmgType, save, dc} the combat engine can run. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* ---- tag splitting ---------------------------------------------------- */
  /* Tags nest, so a regex alone won't do. Walk the string and match braces. */
  function splitTags(str) {
    var out = [], depth = 0, buf = '', tagBuf = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === '{' && str[i + 1] === '@') {
        if (depth === 0) { if (buf) { out.push({ text: buf }); buf = ''; } tagBuf = ''; }
        else tagBuf += ch;
        depth++;
        if (depth === 1) { i++; continue; }   // skip the '@'
      } else if (ch === '}' && depth > 0) {
        depth--;
        if (depth === 0) { out.push(parseTag(tagBuf)); tagBuf = ''; }
        else tagBuf += ch;
      } else if (depth > 0) {
        tagBuf += ch;
      } else {
        buf += ch;
      }
    }
    if (buf) out.push({ text: buf });
    if (depth > 0 && tagBuf) out.push({ text: tagBuf });
    return out;
  }

  function parseTag(body) {
    var sp = body.indexOf(' ');
    var name = (sp < 0 ? body : body.slice(0, sp)).toLowerCase();
    var rest = sp < 0 ? '' : body.slice(sp + 1);
    var parts = rest.split('|');
    return { tag: name, parts: parts, raw: rest };
  }

  /* ---- attack type codes ------------------------------------------------ */
  var ATK = {
    mw: 'Melee Weapon Attack', rw: 'Ranged Weapon Attack',
    ms: 'Melee Spell Attack', rs: 'Ranged Spell Attack',
    mp: 'Melee Power Attack', rp: 'Ranged Power Attack',
    m: 'Melee Attack', r: 'Ranged Attack', a: 'Attack', aw: 'Area Weapon Attack'
  };

  /* Lives in srd.js now — kept here as an alias so callers need not care. */
  var SKILL_ABILITY = VT.srd.SKILL_ABILITY;

  /* ---- rendering -------------------------------------------------------- */
  /* mode: 'text' (plain) or 'html' (linkable spans the compendium can click) */
  function renderTag(t, mode) {
    if (t.text != null) return mode === 'html' ? U.esc(t.text) : t.text;
    var p = t.parts, first = p[0] || '';
    function ref(kind) {
      /* {@spell fireball|phb|the fireball} -> prefer explicit display text */
      var shown = p[2] || first;
      if (mode !== 'html') return shown;
      return '<a class="xref" data-kind="' + kind + '" data-name="' + U.esc(first) +
        '" data-source="' + U.esc(p[1] || '') + '">' + U.esc(shown) + '</a>';
    }
    switch (t.tag) {
      /* Formatting tags wrap further markup, so recurse in BOTH modes -
         otherwise nested tags leak out as literal {@i ...} in plain text. */
      case 'b': case 'bold': return mode === 'html' ? '<b>' + render(first, mode) + '</b>' : render(first, mode);
      case 'i': case 'italic': return mode === 'html' ? '<i>' + render(first, mode) + '</i>' : render(first, mode);
      case 'u': case 'underline': return mode === 'html' ? '<u>' + render(first, mode) + '</u>' : render(first, mode);
      case 's': case 'strike': return mode === 'html' ? '<s>' + render(first, mode) + '</s>' : render(first, mode);
      case 'note': return mode === 'html' ? '<i class="note">' + render(first, mode) + '</i>' : render(first, mode);
      case 'atk': case 'atkr': {
        /* "mw,rw" should read "Melee or Ranged Weapon Attack", not
           "Melee Weapon or Ranged Weapon Attack" - factor the shared tail out.
           This is the most common tag in any bestiary, so it is worth getting
           right rather than merely legible. */
        var names = first.split(',').map(function (c) { return ATK[c.trim().toLowerCase()] || c.trim(); });
        if (names.length > 1) {
          var tails = names.map(function (n) { return n.split(' ').slice(1).join(' '); });
          if (tails.every(function (t) { return t === tails[0]; }) && tails[0]) {
            return names.map(function (n) { return n.split(' ')[0]; }).join(' or ') + ' ' + tails[0] + ':';
          }
        }
        return names.join(' or ') + ':';
      }
      case 'h': return mode === 'html' ? '<i>Hit:</i> ' : 'Hit: ';
      case 'hom': return 'Miss: ';
      case 'dc': return 'DC ' + first;
      case 'hit': return (Number(first) >= 0 ? '+' : '') + first;
      case 'd20': return (Number(first) >= 0 ? '+' : '') + first;
      case 'dice': case 'damage': case 'scaledice': case 'scaledamage': case 'autodice': {
        var expr = t.tag === 'scaledice' || t.tag === 'scaledamage' ? (p[2] || first) : first;
        var shown2 = p[1] && t.tag !== 'scaledice' && t.tag !== 'scaledamage' ? p[1] : expr;
        return mode === 'html'
          ? '<span class="roll-tag" data-dice="' + U.esc(expr) + '">' + U.esc(shown2) + '</span>'
          : shown2;
      }
      case 'recharge': return '(Recharge ' + (first ? first + '–6' : '6') + ')';
      case 'chance': return first + ' percent';
      case 'hitYourSpellAttack': case 'hityourspellattack': return 'your spell attack modifier';
      case 'spell': return ref('spell');
      case 'creature': return ref('creature');
      case 'item': return ref('item');
      case 'condition': return ref('condition');
      case 'disease': return ref('condition');
      case 'status': return ref('condition');
      case 'skill': return ref('skill');
      case 'sense': return ref('sense');
      case 'action': return ref('action');
      case 'feat': return ref('feat');
      case 'race': return ref('race');
      case 'class': return ref('class');
      case 'background': return ref('background');
      case 'optfeature': return ref('optionalfeature');
      case 'variantrule': return ref('variantrule');
      case 'table': return ref('table');
      case 'deity': return ref('deity');
      case 'hazard': case 'trap': return ref('hazard');
      case 'object': return ref('object');
      case 'vehicle': return ref('vehicle');
      case 'language': return ref('language');
      case 'reward': return ref('reward');
      case 'psionic': return ref('psionic');
      case 'filter': return p[0];
      case 'quickref': return p[0];
      case 'book': case 'adventure': return p[0];
      case 'homebrew': return p[0] || p[1] || '';
      case '5etools': case 'link': return p[0];
      case 'footnote': return p[0];
      case 'area': return p[1] || p[0];
      case 'classfeature': case 'subclassfeature': return first;
      default: return first || '';
    }
  }

  function render(str, mode) {
    if (str == null) return '';
    if (typeof str !== 'string') return renderEntries(str, mode);
    return splitTags(str).map(function (t) { return renderTag(t, mode); }).join('');
  }

  /* ---- entry trees ------------------------------------------------------ */
  /* 5etools `entries` are a recursive mix of strings and typed objects. */
  function renderEntries(entry, mode, depth) {
    mode = mode || 'html';
    depth = depth || 0;
    if (entry == null) return '';
    if (typeof entry === 'string' || typeof entry === 'number') return render(String(entry), mode);
    if (Array.isArray(entry)) {
      return entry.map(function (e) { return renderEntries(e, mode, depth); }).join(mode === 'html' ? '' : '\n');
    }
    var name = entry.name ? render(entry.name, mode) : '';
    var inner = entry.entries ? renderEntries(entry.entries, mode, depth + 1)
      : entry.entry ? renderEntries(entry.entry, mode, depth + 1) : '';

    if (mode !== 'html') {
      return (name ? name + '. ' : '') + inner;
    }
    switch (entry.type) {
      case 'entries':
      case 'section':
        return (name ? '<div class="e-name">' + name + '</div>' : '') + '<div class="e-body">' + inner + '</div>';
      case 'list':
        return '<ul class="e-list">' + (entry.items || []).map(function (it) {
          return '<li>' + renderEntries(it, mode, depth + 1) + '</li>';
        }).join('') + '</ul>';
      case 'item':
      case 'itemSpell':
      case 'itemSub':
        return '<div class="e-item"><b>' + name + '</b> ' + inner + '</div>';
      case 'table': {
        var head = (entry.colLabels || []).map(function (c) { return '<th>' + render(c, mode) + '</th>'; }).join('');
        var rows = (entry.rows || []).map(function (r) {
          if (r && r.type === 'row') r = r.row || [];
          return '<tr>' + (r || []).map(function (c) { return '<td>' + renderEntries(c, mode, depth + 1) + '</td>'; }).join('') + '</tr>';
        }).join('');
        return '<div class="e-tablewrap"><table class="e-table">' +
          (entry.caption ? '<caption>' + render(entry.caption, mode) + '</caption>' : '') +
          (head ? '<thead><tr>' + head + '</tr></thead>' : '') + '<tbody>' + rows + '</tbody></table></div>';
      }
      case 'inset':
      case 'insetReadaloud':
        return '<div class="e-inset">' + (name ? '<b>' + name + '</b> ' : '') + inner + '</div>';
      case 'quote':
        return '<blockquote class="e-quote">' + inner +
          (entry.by ? '<cite>' + render(entry.by, mode) + '</cite>' : '') + '</blockquote>';
      case 'abilityDc':
        return '<b>Spell save DC</b> = 8 + your proficiency bonus + your ' +
          (entry.attributes || []).join(' or ').toUpperCase() + ' modifier';
      case 'abilityAttackMod':
        return '<b>Spell attack modifier</b> = your proficiency bonus + your ' +
          (entry.attributes || []).join(' or ').toUpperCase() + ' modifier';
      case 'options':
        return '<div class="e-body">' + renderEntries(entry.entries || [], mode, depth) + '</div>';
      case 'image':
        return '';   /* images live outside the data set; skip rather than 404 */
      default:
        return (name ? '<div class="e-name">' + name + '</div>' : '') + '<div class="e-body">' + inner + '</div>';
    }
  }

  function toText(entry) { return renderEntries(entry, 'text').replace(/\s+/g, ' ').trim(); }

  /* ---- mechanics extraction --------------------------------------------- */
  /* Turn a monster action's prose into something combat.js can actually run.
     This is heuristic by necessity - the source data is written for humans -
     but the tags carry the numbers, so the important parts are exact. */
  function mechanics(action, ctx) {
    var text = toText(action.entries || action.entry || '');
    /* Re-scan the RAW text: toText() has already expanded the tags, and the
       numbers we need live inside them. The name is included because recharge
       is conventionally written there ("Fire Breath {@recharge 5}"). */
    var raw = String(action.name || '') + ' ' + rawOf(action);
    var rawTags = splitTags(raw).filter(function (t) { return t.tag; });

    var get = function (n) { return rawTags.find(function (t) { return t.tag === n; }); };
    var all = function (n) { return rawTags.filter(function (t) { return t.tag === n; }); };

    var out = {
      name: render(action.name || 'Action', 'text'),
      kind: 'buff',
      cost: 'action',
      desc: text
    };

    var atk = get('atk') || get('atkr');
    var hit = get('hit');
    var dmgTags = all('damage');
    var dcTag = get('dc');

    if (atk && hit) {
      var code = String(atk.parts[0] || '').toLowerCase();
      var isRanged = /r/.test(code.split(',')[0]) && !/^m/.test(code.split(',')[0]);
      /* "mw,rw" - thrown weapons; treat as melee unless only ranged */
      if (code.indexOf('m') >= 0) isRanged = false;
      out.kind = isRanged ? 'ranged' : 'melee';
      out.toHit = parseInt(hit.parts[0], 10) || 0;

      var reach = raw.match(/reach\s+(\d+)\s*(?:ft|feet)/i);
      var range = raw.match(/range\s+(\d+)\s*\/\s*(\d+)\s*(?:ft|feet)/i) ||
                  raw.match(/range\s+(\d+)\s*(?:ft|feet)/i);
      if (out.kind === 'melee') {
        out.reach = reach ? parseInt(reach[1], 10) : 5;
        if (!reach && range) { out.kind = 'ranged'; }
      }
      if (out.kind === 'ranged') {
        out.range = range
          ? [parseInt(range[1], 10), parseInt(range[2] || range[1], 10)]
          : [reach ? parseInt(reach[1], 10) : 30, reach ? parseInt(reach[1], 10) : 120];
      }
    } else if (dcTag) {
      out.kind = 'save';
      out.dc = parseInt(dcTag.parts[0], 10) || 10;
      var ab = raw.match(/DC\s*\}?\s*\d*\s*\)?\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i) ||
               raw.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
      out.save = ab ? ab[1].slice(0, 3).toLowerCase() : 'dex';
      out.half = /half as much damage|half damage/i.test(raw);
      /* Explicit shapes first ("15-foot cone"), then the looser phrasing that
         a lot of statblocks use instead ("each creature within 10 feet"). */
      var aoe = raw.match(/(\d+)[- ]foot[- ](?:radius|sphere|cone|line|cube|square)/i) ||
                raw.match(/(?:each|any|every)\s+creature[^.]{0,48}?within\s+(\d+)\s*(?:ft\.?|feet)/i);
      out.aoe = aoe ? { radius: parseInt(aoe[1], 10) } : null;

      /* A cone or a "within X of it" burst originates on the caster, so the
         aim point is the caster's own square - not some distant target. */
      var selfCentered = /\bcone\b|\bwithin\s+\d+\s*(?:ft\.?|feet)\s+of\s+(?:it|itself|him|her|them|you)\b/i.test(raw) ||
                         /(?:each|any|every)\s+creature[^.]{0,48}?within/i.test(raw);
      var rangeS = raw.match(/range\s+(\d+)/i) || raw.match(/within\s+(\d+)\s*(?:ft\.?|feet)/i);
      if (selfCentered && out.aoe) {
        out.range = [out.aoe.radius, out.aoe.radius];
      } else {
        out.range = [rangeS ? parseInt(rangeS[1], 10) : 30, rangeS ? parseInt(rangeS[1], 10) : 30];
      }
    }

    if (dmgTags.length) {
      /* primary damage, plus any riders ("plus 7 (2d6) fire damage") */
      out.dmg = dmgTags.map(function (d) { return d.parts[0]; }).join('+');
      var typeMatch = raw.match(/\{@damage[^}]+\}\)?\s*([a-z]+(?:\s+[a-z]+)?)\s+damage/i);
      out.dmgType = typeMatch ? typeMatch[1].trim().toLowerCase() : 'bludgeoning';
      if (VT.srd.DAMAGE_TYPES.indexOf(out.dmgType) < 0) {
        var found = VT.srd.DAMAGE_TYPES.find(function (dt) { return raw.toLowerCase().indexOf(dt + ' damage') >= 0; });
        out.dmgType = found || 'bludgeoning';
      }
    } else if (out.kind === 'melee' || out.kind === 'ranged' || out.kind === 'save') {
      out.dmg = '0';
    }

    /* conditions the attack inflicts */
    var cond = rawTags.find(function (t) { return t.tag === 'condition'; });
    if (cond && VT.srd.CONDITIONS[String(cond.parts[0]).toLowerCase()]) {
      out.applies = String(cond.parts[0]).toLowerCase();
    }

    var rech = get('recharge');
    if (rech) out.uses = { max: 1, per: 'rest' };
    if (/\bbonus action\b/i.test(raw)) out.cost = 'bonus';
    if (ctx && ctx.reaction) out.cost = 'reaction';

    return out;
  }

  /* The un-rendered source string of an entry, tags intact. */
  function rawOf(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry;
    if (Array.isArray(entry)) return entry.map(rawOf).join(' ');
    if (entry.entries) return rawOf(entry.entries);
    if (entry.entry) return rawOf(entry.entry);
    if (entry.items) return rawOf(entry.items);
    return '';
  }

  VT.tags = {
    render: render, renderEntries: renderEntries, toText: toText,
    splitTags: splitTags, mechanics: mechanics, rawOf: rawOf,
    ATK: ATK, SKILL_ABILITY: SKILL_ABILITY
  };
})();

/* ===== src/data/fivetools.js ===== */
/* Virtual Tactics :: data/fivetools.js
   Reads a 5etools-format data set and indexes it for search.

   Two ingest paths, because they fail in different ways:

     URL    - point at a self-hosted instance ("http://localhost:8080"). Fast,
              but the instance must send CORS headers, and most docker/nginx
              setups do not by default. We detect that and say so plainly
              instead of showing a generic network error.

     FOLDER - pick your local `data/` directory in a file dialog. No network, no
              CORS, works offline. Slower to load once, then cached.

   This module never ships any content of its own; it only reads what you point
   it at. Parsed results are cached in IndexedDB so the second load is instant. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* Fallback list for instances without data/bestiary/index.json. Misses are
     skipped silently, so an over-long list costs nothing but a few 404s. */
  var FALLBACK_BESTIARY = ['mm', 'phb', 'dmg', 'vgm', 'mtf', 'xge', 'ggr', 'skt', 'toa',
    'wdh', 'wdmm', 'brw', 'erlw', 'egw', 'idrotf', 'tce', 'vrgr', 'mpmm', 'sac',
    'cos', 'hotdq', 'rot', 'pota', 'oota', 'llk', 'gos', 'bgdia', 'mot', 'crcotn',
    'jttrc', 'wbtw', 'dsotdq', 'kftgv', 'bam', 'sais', 'phb24', 'mm25', 'dmg24'];
  var FALLBACK_SPELLS = ['phb', 'xge', 'tce', 'scag', 'ggr', 'ai', 'egw', 'idrotf',
    'ftd', 'scc', 'aag', 'bmt', 'phb24'];

  var FLAT_FILES = {
    item: ['items.json', 'items-base.json'],
    race: ['races.json'],
    background: ['backgrounds.json'],
    feat: ['feats.json'],
    optionalfeature: ['optionalfeatures.json'],
    condition: ['conditionsdiseases.json'],
    action: ['actions.json'],
    language: ['languages.json'],
    sense: ['senses.json'],
    skill: ['skills.json'],
    variantrule: ['variantrules.json'],
    deity: ['deities.json'],
    object: ['objects.json'],
    vehicle: ['vehicles.json'],
    reward: ['rewards.json'],
    psionic: ['psionics.json'],
    table: ['tables.json'],
    hazard: ['trapshazards.json'],
    magicvariant: ['magicvariants.json'],
    book: ['books.json'],
    adventure: ['adventures.json']
  };

  /* Which array key inside each JSON file holds the records. */
  var ARRAY_KEYS = {
    item: ['item', 'baseitem'], race: ['race', 'subrace'], background: ['background'],
    feat: ['feat'], optionalfeature: ['optionalfeature'],
    condition: ['condition', 'disease', 'status'], action: ['action'],
    language: ['language'], sense: ['sense'], skill: ['skill'],
    variantrule: ['variantrule'], deity: ['deity'], object: ['object'],
    vehicle: ['vehicle'], reward: ['reward'], psionic: ['psionic'],
    table: ['table'], hazard: ['trap', 'hazard'], magicvariant: ['magicvariant'],
    book: ['book'], adventure: ['adventure'],
    creature: ['monster'], spell: ['spell'], class: ['class', 'subclass', 'classFeature', 'subclassFeature']
  };

  var ft = {
    mode: null,          // 'url' | 'folder'
    baseUrl: '',
    files: null,         // path -> File, in folder mode
    db: {},              // kind -> [records]
    index: {},           // kind -> Map(lowername -> record[])
    sources: {},         // source code -> count
    dirName: null,       // name of a remembered directory handle, if any
    cachedAt: null,
    homebrew: {},        // user content, merged in after every load
    homebrewCount: 0,
    loaded: false,
    loading: false,
    stats: { files: 0, records: 0, failed: [] }
  };

  /* ---- low level fetch --------------------------------------------------- */
  function normBase(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    /* Accept any scheme (TaleSpire may serve a symbiote over file:// or its own)
       and leave relative paths alone; only bare hostnames get a scheme added. */
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
    if (url.charAt(0) === '.' || url.charAt(0) === '/') return url;
    return 'http://' + url;
  }

  function readJSON(relPath) {
    if (ft.mode === 'fs') {
      return fsResolve(relPath)
        .then(function (f) { return f.text(); })
        .then(JSON.parse)
        .catch(function (e) {
          /* a missing file is normal (we probe optional sources) */
          throw new Error(/NotFound|not be found/i.test(String(e && e.name) + String(e && e.message))
            ? 'missing' : (e && e.message) || 'read failed');
        });
    }
    if (ft.mode === 'folder') {
      var f = ft.files[relPath] || ft.files[relPath.replace(/^data\//, '')];
      if (!f) return Promise.reject(new Error('missing'));
      return f.text().then(JSON.parse);
    }
    return fetch(ft.baseUrl + '/' + relPath, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  /* ---- connection check -------------------------------------------------- */
  /* Distinguishes "wrong URL" from "CORS blocked", which look identical to
     fetch() but need completely different fixes from the user. */
  function testUrl(url) {
    var base = normBase(url);
    if (!base) return Promise.resolve({ ok: false, reason: 'Enter a URL first.' });
    return fetch(base + '/data/backgrounds.json', { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) return { ok: false, reason: 'Reached the server but got HTTP ' + r.status + ' for /data/backgrounds.json. Is this the site root?' };
        return r.json().then(function () { return { ok: true, base: base }; });
      })
      .catch(function () {
        /* A no-cors probe that succeeds means the server is up and it's CORS. */
        return fetch(base + '/data/backgrounds.json', { mode: 'no-cors' })
          .then(function () {
            return { ok: false, cors: true, reason:
              'The server is reachable but is not sending CORS headers, so the browser blocks reading it. ' +
              'Either add "Access-Control-Allow-Origin: *" to that server, or use the Folder option instead.' };
          })
          .catch(function () {
            return { ok: false, reason: 'Could not reach ' + base + '. Check the address and that the instance is running.' };
          });
      });
  }

  /* ---- loading ----------------------------------------------------------- */
  function add(kind, records, sourceFile, noStats) {
    if (!records || !records.length) return 0;
    ft.db[kind] = ft.db[kind] || [];
    records.forEach(function (r) {
      if (!r) return;
      if (sourceFile && /items-base\.json$/.test(sourceFile)) r.__baseItem = true;
      if (!r.name) {
        /* Almost everything is keyed by name, so a nameless record is noise -
           with one real exception. 5etools stores a race's DEFAULT subrace
           with no name at all, and that is the only place the standard
           Human's +1 to every ability score is written down. Keep those,
           flagged, and drop the rest. */
        if (kind !== 'subrace' || !r.raceName) return;
        r.__base = true;
        r.name = '';
      }
      r.__kind = kind;
      r.__file = sourceFile;
      ft.db[kind].push(r);
      if (r.source) ft.sources[r.source] = (ft.sources[r.source] || 0) + 1;
    });
    if (!noStats) ft.stats.records += records.length;
    return records.length;
  }

  function ingestFile(kind, json, path) {
    var keys = ARRAY_KEYS[kind] || [kind];
    var n = 0;
    keys.forEach(function (k) { if (Array.isArray(json[k])) n += add(kindFor(kind, k), json[k], path); });
    /* Some files nest everything under a single unexpected key; take arrays of
       objects-with-names as a last resort so odd sources still land. */
    if (!n) {
      Object.keys(json).forEach(function (k) {
        if (Array.isArray(json[k]) && json[k].length && json[k][0] && json[k][0].name) {
          n += add(kind, json[k], path);
        }
      });
    }
    return n;
  }

  /* subclass / classFeature live in class files but deserve their own bucket */
  /* Which array a record came from matters for exactly one thing: magic
     variants apply to BASE items only. "+1 Armor" makes "+1 Plate Armor" from
     the plain plate in items-base.json - never from an Animated Shield, which
     is already magic. Losing that distinction generates nonsense like
     "+1 Armor of Invulnerability". */
  function kindFor(fileKind, arrayKey) {
    if (fileKind === 'class') {
      if (arrayKey === 'subclass') return 'subclass';
      if (arrayKey === 'classFeature') return 'classfeature';
      if (arrayKey === 'subclassFeature') return 'subclassfeature';
      return 'class';
    }
    if (fileKind === 'race' && arrayKey === 'subrace') return 'subrace';
    if (fileKind === 'item' && arrayKey === 'baseitem') return 'item';
    return fileKind;
  }

  function tryLoad(kind, path, onProgress) {
    return readJSON(path)
      .then(function (json) {
        ft.stats.files++;
        var n = ingestFile(kind, json, path);
        if (onProgress) onProgress(path, n);
        return n;
      })
      .catch(function (e) {
        if (String(e.message) !== 'missing' && !/HTTP 404/.test(String(e.message))) {
          ft.stats.failed.push(path + ': ' + e.message);
        }
        return 0;
      });
  }

  /* Resolve a folder index (bestiary/spells/class) or fall back to guessing. */
  function resolveIndexed(kind, folder, prefix, fallbackCodes, onProgress) {
    return readJSON('data/' + folder + '/index.json')
      .then(function (idx) {
        var files = Object.keys(idx).map(function (src) { return idx[src]; });
        return files;
      })
      .catch(function () {
        if (ft.mode === 'fs') {
          return fsList('data/' + folder).then(function (names) {
            return names.filter(function (n) { return n.indexOf(prefix) === 0; });
          });
        }
        if (ft.mode === 'folder') {
          /* We already have the whole listing - just take what's there. */
          return Object.keys(ft.files)
            .filter(function (p) { return p.indexOf('data/' + folder + '/' + prefix) === 0 && /\.json$/.test(p); })
            .map(function (p) { return p.split('/').pop(); });
        }
        return fallbackCodes.map(function (c) { return prefix + c + '.json'; });
      })
      .then(function (files) {
        return runLimited(files.filter(function (f) { return f.indexOf('fluff') < 0 && f !== 'index.json'; }), 6,
          function (f) { return tryLoad(kind, 'data/' + folder + '/' + f, onProgress); });
      });
  }

  /* Bounded concurrency - a full bestiary is 100+ files and unbounded fetch
     storms make some self-hosted servers drop connections. */
  function runLimited(items, limit, fn) {
    var i = 0, active = 0, done = 0, total = items.length;
    return new Promise(function (resolve) {
      if (!total) return resolve();
      function next() {
        while (active < limit && i < total) {
          active++;
          fn(items[i++]).then(function () {
            active--; done++;
            if (done === total) resolve(); else next();
          });
        }
      }
      next();
    });
  }

  function loadAll(onProgress) {
    if (ft.loading) return Promise.reject(new Error('Already loading.'));
    ft.loading = true;

    /* Loading is atomic: a probe that finds nothing (a wrong folder, a missing
       bundled data/) must not destroy the compendium already in memory. */
    var prev = {
      db: ft.db, index: ft.index, sources: ft.sources, stats: ft.stats,
      loaded: ft.loaded, mode: ft.mode, baseUrl: ft.baseUrl, dirName: ft.dirName,
      spellLists: ft.spellLists, loot: ft.loot
    };
    function rollback() {
      ft.db = prev.db; ft.index = prev.index; ft.sources = prev.sources;
      ft.stats = prev.stats; ft.loaded = prev.loaded;
      ft.mode = prev.mode; ft.baseUrl = prev.baseUrl; ft.dirName = prev.dirName;
      ft.spellLists = prev.spellLists;
      ft.loot = prev.loot;
      /* hbBundled is deliberately untouched: it came from beside the app, not
         from the source being rolled back, and losing it here would make a
         failed data load silently drop a supplement that is still present. */
      mergeHomebrew();
    }

    ft.db = {}; ft.index = {}; ft.sources = {};
    ft.stats = { files: 0, records: 0, failed: [] };
    var report = function (label) { if (onProgress) onProgress({ phase: label, files: ft.stats.files, records: ft.stats.records }); };

    var flat = [];
    Object.keys(FLAT_FILES).forEach(function (kind) {
      FLAT_FILES[kind].forEach(function (f) { flat.push({ kind: kind, path: 'data/' + f }); });
    });

    return runLimited(flat, 6, function (job) {
      return tryLoad(job.kind, job.path, function () { report('core data'); });
    })
      .then(function () { report('bestiary'); return resolveIndexed('creature', 'bestiary', 'bestiary-', FALLBACK_BESTIARY, function () { report('bestiary'); }); })
      .then(function () { report('spells'); return resolveIndexed('spell', 'spells', 'spells-', FALLBACK_SPELLS, function () { report('spells'); }); })
      .then(function () { report('classes'); return loadClasses(function () { report('classes'); }); })
      .then(function () { report('spell lists'); return loadSpellLists(); })
      .then(function () { report('treasure'); return loadLoot(); })
      .then(function () {
        report('magic items');
        var n = buildVariants();
        if (n) ft.stats.variants = n;
      })
      .then(function () { report('homebrew'); return loadFolderHomebrew(); })
      .then(function () {
        var stats = ft.stats;
        if (!stats.records) {
          /* nothing found - put back whatever we had */
          rollback();
          ft.loading = false;
          report('done');
          return stats;
        }
        buildIndex();
        applyHomebrew();
        ft.loaded = true;
        ft.loading = false;
        report('done');
        return stats;
      })
      .catch(function (e) { rollback(); ft.loading = false; throw e; });
  }

  /* Which classes may learn a given spell is not stored on the spell. It lives
     in data/spells/sources.json as SOURCE -> spell name -> {class, subclass,
     race}. Without it there is no way to offer a bard their own spell list, so
     it is worth the extra fetch. A missing file is not fatal: spell choices
     simply fall back to "every spell of that level". */
  /* Treasure tables. Not name-indexed like the rest: the file is a handful of
     arrays whose meaning comes from which key they sit under, so it is kept
     whole rather than flattened into the compendium. */
  function loadLoot() {
    return readJSON('data/loot.json')
      .then(function (json) { ft.loot = json || null; return json; })
      .catch(function () { ft.loot = null; return null; });
  }

  function loadSpellLists() {
    return readJSON('data/spells/sources.json')
      .then(function (json) {
        var map = {};                       // 'name|source' -> [{name, source}]
        Object.keys(json).forEach(function (src) {
          var bySpell = json[src] || {};
          Object.keys(bySpell).forEach(function (spellName) {
            var rec = bySpell[spellName] || {};
            var list = [];
            (rec.class || []).forEach(function (c) { list.push(c); });
            /* A subclass grant (a domain spell) still means the class can cast
               it, but only through that subclass - keep them apart. */
            var subs = [];
            (rec.subclass || []).forEach(function (c) {
              if (c.class) subs.push({ name: c.class.name, source: c.class.source, subclass: c.subclass });
            });
            map[low(spellName) + '|' + low(src)] = { cls: list, sub: subs };
          });
        });
        ft.spellLists = map;
        return map;
      })
      .catch(function () { ft.spellLists = null; return null; });
  }

  function low(v) { return String(v || '').toLowerCase(); }

  /* Every spell the given class can learn, at any level.

     Three sources have to agree: data/spells/sources.json for the books, a
     spell record's own classes.fromClassList (which is how a converted
     supplement says who may cast what), and any spelllistchange record, which
     is how a setting REMOVES a spell from a list - Athasian clerics lose
     Create Food and Water, because Athas has no water to spare. */
  function spellsForClass(className, classSource) {
    var all = get('spell');
    var cn = low(className);

    var gone = {};
    (get('spelllistchange') || []).forEach(function (c) {
      if (low(c.className) !== cn) return;
      (c.removed || []).forEach(function (r) { gone[low(r.name)] = c.source || 'homebrew'; });
    });

    var list = all.filter(function (sp) {
      if (gone[low(sp.name)]) return false;
      /* a record that names its own classes is self-describing */
      var own = sp.classes && sp.classes.fromClassList;
      if (own && own.some(function (c) { return low(c.name) === cn; })) return true;
      if (!ft.spellLists) return !own;
      var e = ft.spellLists[low(sp.name) + '|' + low(sp.source)];
      if (!e) return false;
      return e.cls.some(function (c) { return low(c.name) === cn; });
    });
    list.__removed = Object.keys(gone).length;
    return list;
  }

  /* What a setting changed about a class's spell list, for the UI to say so. */
  function spellListChanges(className) {
    var cn = low(className);
    return (get('spelllistchange') || []).filter(function (c) {
      return low(c.className) === cn;
    });
  }

  function loadClasses(onProgress) {
    return readJSON('data/class/index.json')
      .then(function (idx) { return Object.keys(idx).map(function (k) { return idx[k]; }); })
      .catch(function () {
        if (ft.mode === 'fs') {
          return fsList('data/class').then(function (names) {
            return names.filter(function (n) { return n.indexOf('class-') === 0; });
          });
        }
        if (ft.mode === 'folder') {
          return Object.keys(ft.files)
            .filter(function (p) { return /^data\/class\/class-.*\.json$/.test(p); })
            .map(function (p) { return p.split('/').pop(); });
        }
        return ['class-artificer.json', 'class-barbarian.json', 'class-bard.json', 'class-cleric.json',
          'class-druid.json', 'class-fighter.json', 'class-monk.json', 'class-paladin.json',
          'class-ranger.json', 'class-rogue.json', 'class-sorcerer.json', 'class-warlock.json',
          'class-wizard.json'];
      })
      .then(function (files) {
        return runLimited(files.filter(function (f) { return f.indexOf('fluff') < 0 && f !== 'index.json' && f !== 'foundry.json'; }),
          5, function (f) { return tryLoad('class', 'data/class/' + f, onProgress); });
      });
  }


  /* ---- magic variants ----------------------------------------------------
     "+1 Plate Armor" is not a record. 5etools stores 214 `magicvariant`
     templates - "+1 Armor", "+2 Weapon", "Adamantine Armor" - each with a
     `requires` that says which base items it applies to and an `inherits` of
     the fields it overlays. The concrete items are generated, which is why a
     search for "+1 breastplate" finds nothing until you do it.

     Generating them turns 25 base armours and 37 base weapons into the several
     hundred magic ones a table actually shops for. Kept behind a flag because
     it multiplies the item count and not every table wants it. */
  function matchesRequirement(base, req) {
    return Object.keys(req).every(function (k) {
      var want = req[k], have = base[k];
      if (k === 'type') return String(have || '').split('|')[0] === String(want).split('|')[0];
      if (typeof want === 'boolean') return !!have === want;
      if (Array.isArray(want)) return want.indexOf(have) >= 0;
      return have === want;
    });
  }

  function variantApplies(base, mv) {
    var reqs = mv.requires || [];
    if (!reqs.length) return false;
    if (!reqs.some(function (r) { return matchesRequirement(base, r); })) return false;
    if (mv.excludes && matchesRequirement(base, mv.excludes)) return false;
    return true;
  }

  function buildVariants() {
    var bases = (ft.db.item || []).filter(function (i) {
      if (i.__variant) return false;
      /* a base item: plain gear, not something already enchanted */
      if (i.__baseItem) return true;
      return !i.reqAttune && (!i.rarity || i.rarity === 'none');
    });
    var variants = ft.db.magicvariant || [];
    if (!variants.length) return 0;

    var made = [], seen = {};
    variants.forEach(function (mv) {
      var inh = mv.inherits || {};
      bases.forEach(function (base) {
        if (!variantApplies(base, mv)) return;
        var name = (inh.namePrefix || '') + base.name + (inh.nameSuffix || '');
        /* Two printings of the same base give the same variant name twice. */
        var key = low(name);
        if (seen[key]) return;
        seen[key] = 1;

        var out = JSON.parse(JSON.stringify(base));
        Object.keys(inh).forEach(function (k) {
          if (k === 'namePrefix' || k === 'nameSuffix') return;
          out[k] = JSON.parse(JSON.stringify(inh[k]));
        });
        out.name = name;
        out.__variant = true;
        out.__baseItem = base.name;
        /* A +N bonus is written as a string the item's own text substitutes.
           Fold it into the numbers so the sheet can use it without parsing. */
        if (inh.bonusAc) out.ac = (base.ac || 10) + (parseInt(inh.bonusAc, 10) || 0);
        if (inh.bonusWeapon) out.bonusWeapon = inh.bonusWeapon;
        made.push(out);
      });
    });
    if (made.length) add('item', made, 'magicvariant', true);
    return made.length;
  }

  /* ---- homebrew ----------------------------------------------------------- */
  /* User content is held separately from the loaded book data and re-merged
     after every load, so reloading or switching your source never wipes it.

     There are three ways in, kept apart so none can erase another:

       stored   what this browser saved (the Forge's Homebrew tab)
       folder   a homebrew/ directory inside the data source itself
       bundled  a homebrew/ directory beside the app's own files

     `folder` is the one that matters when a table shares a data folder: drop a
     converted supplement next to your 5etools data and every app pointed there
     gets it, with nothing to import per machine.

     `bundled` covers what folder cannot. It is read relative to the app rather
     than the data source, so a supplement travels with the download and is
     there before anyone has connected anything. It needs no directory picker
     and no filesystem API, which matters on Linux and in any browser without
     showDirectoryPicker - fetching a file sitting next to the page is the one
     thing that works everywhere. */
  var hbStored = {}, hbFolder = {}, hbBundled = {};

  function setHomebrew(map) {
    hbStored = map || {};
    mergeHomebrew();
  }

  function setFolderHomebrew(map) {
    hbFolder = map || {};
    mergeHomebrew();
  }

  function setBundledHomebrew(map) {
    hbBundled = map || {};
    mergeHomebrew();
  }

  function mergeHomebrew() {
    var out = {};
    [hbBundled, hbFolder, hbStored].forEach(function (src) {
      Object.keys(src || {}).forEach(function (kind) {
        out[kind] = (out[kind] || []).concat(src[kind] || []);
      });
    });
    ft.homebrew = out;
    applyHomebrew();
  }

  /* Read every .json in the data source's homebrew/ directory. A file may be
     our own export ({data:{...}}) or a raw 5etools-shaped one; both are just
     kind -> records once unwrapped. Absent directory is the normal case. */
  var HB_KEYS = {
    race: ['race'], subrace: ['subrace'], 'class': ['class'], subclass: ['subclass'],
    classfeature: ['classFeature', 'classfeature'],
    subclassfeature: ['subclassFeature', 'subclassfeature'],
    background: ['background'], spell: ['spell'], item: ['item', 'baseitem'],
    feat: ['feat'], optionalfeature: ['optionalfeature', 'optionalFeature'],
    creature: ['monster'], spelllistchange: ['spelllistchange', 'spellListChange']
  };

  /* Pull every record out of one homebrew file into `map`, returning how many.
     A file may be our own export ({data:{...}}) or a raw 5etools-shaped one. */
  function collectHomebrew(json, map) {
    var incoming = (json && json.data) ? json.data : json;
    if (!incoming || typeof incoming !== 'object') return 0;
    var records = 0;
    Object.keys(HB_KEYS).forEach(function (kind) {
      HB_KEYS[kind].forEach(function (key) {
        if (!Array.isArray(incoming[key])) return;
        incoming[key].forEach(function (r) {
          if (!r || (!r.name && !(kind === 'subrace' && r.raceName))) return;
          var c = JSON.parse(JSON.stringify(r));
          c.__hb = true;
          c.source = c.source || 'HB';
          (map[kind] = map[kind] || []).push(c);
          records++;
        });
      });
    });
    return records;
  }

  function loadFolderHomebrew() {
    return listHomebrewFiles()
      .then(function (names) {
        if (!names.length) { setFolderHomebrew({}); return { files: 0, records: 0 }; }
        var map = {}, records = 0;
        return runLimited(names, 4, function (name) {
          return readJSON('homebrew/' + name)
            .then(function (json) { records += collectHomebrew(json, map); })
            .catch(function () {});
        }).then(function () {
          setFolderHomebrew(map);
          return { files: names.length, records: records };
        });
      })
      .catch(function () { setFolderHomebrew({}); return { files: 0, records: 0 }; });
  }

  /* Where the app's own files live, whatever scheme served the page. */
  function appBase() {
    try { return new URL('.', window.location.href).href; } catch (e) { return './'; }
  }

  /* Read homebrew/ from beside the app rather than from the data source.

     There is no directory listing over http, so homebrew/index.json names the
     files - 5etools' own convention, and the same one the folder loader falls
     back to. A missing index is the normal case and stays silent: most installs
     ship no bundled homebrew at all. */
  var bundledOnce = null;

  /* Safe to call from every boot path - the work happens once and later calls
     get the same promise. Deliberately independent of loadAll: this content
     sits beside the app, not beside the data, so it must survive a data source
     that is missing, empty or still being chosen. */
  function loadBundledHomebrew(force) {
    if (bundledOnce && !force) return bundledOnce;
    bundledOnce = reallyLoadBundledHomebrew();
    return bundledOnce;
  }

  function reallyLoadBundledHomebrew() {
    /* A symbiote has homebrew/ right beside it. The Forge is served out of
       builder/, and the single-file build out of dist/, so for those it is one
       level up. Try the app's own directory first, then its parent, and use
       whichever has an index - checking two places costs one failed fetch and
       saves explaining which layout you have. */
    var bases = [appBase(), appBase() + '../'];

    function grab(base, rel) {
      return fetch(base + rel, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('missing');
        return r.json();
      });
    }

    function tryBase(i) {
      if (i >= bases.length) return Promise.resolve(null);
      return grab(bases[i], 'homebrew/index.json')
        .then(function (idx) { return { base: bases[i], idx: idx }; })
        .catch(function () { return tryBase(i + 1); });
    }

    return tryBase(0)
      .then(function (found) {
        if (!found) { setBundledHomebrew({}); return { files: 0, records: 0 }; }
        var idx = found.idx;
        var names = Array.isArray(idx) ? idx
          : (idx && Array.isArray(idx.toImport)) ? idx.toImport : [];
        if (!names.length) { setBundledHomebrew({}); return { files: 0, records: 0 }; }
        var map = {}, records = 0, read = 0;
        return runLimited(names, 4, function (name) {
          return grab(found.base, 'homebrew/' + name)
            .then(function (json) { records += collectHomebrew(json, map); read++; })
            .catch(function () {});
        }).then(function () {
          setBundledHomebrew(map);
          ft.bundledHomebrew = { files: read, records: records, from: found.base + 'homebrew/' };
          return ft.bundledHomebrew;
        });
      })
      .catch(function () {
        setBundledHomebrew({});
        ft.bundledHomebrew = { files: 0, records: 0 };
        return { files: 0, records: 0 };
      });
  }

  function listHomebrewFiles() {
    if (ft.mode === 'fs') {
      return fsList('homebrew').then(function (n) { return n; }).catch(function () { return []; });
    }
    if (ft.mode === 'folder') {
      return Promise.resolve(Object.keys(ft.files)
        .filter(function (p) { return /(^|\/)homebrew\/[^/]+\.json$/i.test(p); })
        .map(function (p) { return p.split('/').pop(); }));
    }
    /* Over http there is no directory listing, so an index names the files.
       5etools already has this convention - homebrew/index.json with a
       "toImport" array - so use theirs rather than inventing a second one. */
    return readJSON('homebrew/index.json')
      .then(function (idx) {
        if (Array.isArray(idx)) return idx;
        if (idx && Array.isArray(idx.toImport)) return idx.toImport;
        return Object.keys(idx || {})
          .filter(function (k) { return typeof idx[k] === 'string'; })
          .map(function (k) { return idx[k]; });
      })
      .catch(function () { return []; });
  }

  function applyHomebrew() {
    /* drop anything previously merged, then re-add from the authoritative copy */
    Object.keys(ft.db).forEach(function (kind) {
      ft.db[kind] = ft.db[kind].filter(function (r) { return !r.__hb; });
    });
    var total = 0;
    Object.keys(ft.homebrew || {}).forEach(function (kind) {
      var recs = (ft.homebrew[kind] || []).map(function (r) {
        var c = JSON.parse(JSON.stringify(r));
        c.__hb = true;
        return c;
      });
      if (recs.length) { add(kind, recs, 'homebrew', true); total += recs.length; }
    });
    ft.homebrewCount = total;
    /* Recount rather than increment: applyHomebrew runs on every edit, and an
       incrementing tally would climb forever. */
    ft.sources = {};
    Object.keys(ft.db).forEach(function (kind) {
      ft.db[kind].forEach(function (r) {
        if (r.source) ft.sources[r.source] = (ft.sources[r.source] || 0) + 1;
      });
    });
    buildIndex();
    return total;
  }

  /* ---- indexing / search -------------------------------------------------- */
  function buildIndex() {
    ft.index = {};
    Object.keys(ft.db).forEach(function (kind) {
      var map = new Map();
      ft.db[kind].forEach(function (r) {
        var k = String(r.name).toLowerCase();
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
      });
      ft.index[kind] = map;
      ft.db[kind].sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    });
  }

  function byName(kind, name, source) {
    var map = ft.index[kind];
    if (!map) return null;
    var hits = map.get(String(name).toLowerCase());
    if (!hits) return null;
    if (source) {
      var exact = hits.find(function (r) { return String(r.source).toLowerCase() === String(source).toLowerCase(); });
      if (exact) return exact;
    }
    return hits[0];
  }

  function get(kind) { return ft.db[kind] || []; }

  function search(query, kinds, limit) {
    var q = String(query || '').trim().toLowerCase();
    kinds = kinds && kinds.length ? kinds : Object.keys(ft.db);
    var out = [];
    kinds.forEach(function (kind) {
      (ft.db[kind] || []).forEach(function (r) {
        if (!q) { out.push(r); return; }
        var n = String(r.name).toLowerCase();
        var i = n.indexOf(q);
        if (i >= 0) { r.__score = (i === 0 ? 0 : 1) + n.length / 200; out.push(r); }
      });
    });
    out.sort(function (a, b) {
      var d = (a.__score || 0) - (b.__score || 0);
      return d || (a.name < b.name ? -1 : 1);
    });
    return out.slice(0, limit || 200);
  }

  /* ---- persistence -------------------------------------------------------- */
  /* The full data set is far too big for localStorage, so cache in IndexedDB. */
  var DB_NAME = 'vtactics-compendium', STORE = 'blobs';
  function idb() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function idbPut(key, value) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readonly');
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function saveCache() {
    var clean = {};
    Object.keys(ft.db).forEach(function (k) {
      clean[k] = ft.db[k].filter(function (r) { return !r.__hb; });
    });
    return idbPut('db', { db: clean, sources: ft.sources, stats: ft.stats, at: Date.now(),
                          spellLists: ft.spellLists || null,
                          loot: ft.loot || null,
                          folderHomebrew: hbFolder,
                          bundledHomebrew: hbBundled,
                          mode: ft.mode, base: ft.baseUrl, dirName: ft.dirName || null })
      .then(function () { return true; })
      .catch(function () { return false; });
  }
  function loadCache() {
    return idbGet('db').then(function (rec) {
      if (!rec || !rec.db) return null;
      ft.db = rec.db; ft.sources = rec.sources || {}; ft.stats = rec.stats || ft.stats;
      ft.spellLists = rec.spellLists || null;
      ft.loot = rec.loot || null;
      hbFolder = rec.folderHomebrew || {};
      hbBundled = rec.bundledHomebrew || {};
      ft.mode = rec.mode; ft.baseUrl = rec.base || '';
      ft.dirName = rec.dirName || null;
      ft.cachedAt = rec.at || null;
      buildIndex();
      /* merge, not apply: the cache has just restored the folder half, and
         applyHomebrew alone would re-merge a stale ft.homebrew without it. */
      mergeHomebrew();
      ft.loaded = true;
      return rec;
    }).catch(function () { return null; });
  }
  function clearCache() {
    return idbPut('db', null).then(function () { ft.db = {}; ft.index = {}; ft.loaded = false; return true; });
  }

  /* ---- remembered folder (File System Access) ----------------------------
     A browser is never given the absolute path of a picked folder, and could
     not open one from a string anyway - so "remember the path" is impossible
     in the literal sense. What IS possible: showDirectoryPicker() returns a
     directory HANDLE, handles are structured-cloneable, and storing one in
     IndexedDB lets us re-open the same folder on a later visit. If the
     permission is still granted we read it with no dialog at all; if the
     browser has downgraded it to "prompt", it costs one click - never
     navigating the folder tree again.

     Requires a secure context: https:// or http://localhost. NOT file://. */
  var fsRoot = null;         // FileSystemDirectoryHandle when mode === 'fs'
  var fsHasDataChild = null; // did the user pick the site root, or data/ itself?

  function supportsFS() {
    return typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
  }

  function useDirectory(handle) {
    ft.mode = 'fs';
    fsRoot = handle;
    fsHasDataChild = null;
    ft.files = null;
    ft.baseUrl = '';
    ft.dirName = handle && handle.name;
  }

  function pickDirectory() {
    if (!supportsFS()) return Promise.reject(new Error('unsupported'));
    return window.showDirectoryPicker({ id: 'vtactics-5etools', mode: 'read' })
      .then(function (handle) {
        useDirectory(handle);
        return idbPut('dirHandle', handle)
          .catch(function () { /* handle still usable this session */ })
          .then(function () { return handle; });
      });
  }

  /* opts.prompt = true allows the one-click re-grant; without it we only
     reconnect silently, so boot never throws a dialog at the user. */
  function reconnectDirectory(opts) {
    if (!supportsFS()) return Promise.resolve({ ok: false, reason: 'unsupported' });
    return idbGet('dirHandle').then(function (handle) {
      if (!handle || !handle.queryPermission) return { ok: false, reason: 'none' };
      return handle.queryPermission({ mode: 'read' }).then(function (perm) {
        if (perm === 'granted') { useDirectory(handle); return { ok: true, name: handle.name }; }
        if (!opts || !opts.prompt) return { ok: false, reason: 'prompt', name: handle.name };
        return handle.requestPermission({ mode: 'read' }).then(function (p2) {
          if (p2 !== 'granted') return { ok: false, reason: 'denied', name: handle.name };
          useDirectory(handle);
          return { ok: true, name: handle.name };
        });
      });
    }).catch(function () { return { ok: false, reason: 'none' }; });
  }

  function forgetDirectory() {
    fsRoot = null;
    ft.dirName = null;
    return idbPut('dirHandle', null).catch(function () {});
  }

  function rememberedName() { return ft.dirName || null; }

  /* Resolve "data/bestiary/x.json" inside the picked directory. */
  function fsResolve(relPath) {
    var parts = String(relPath).split('/').filter(Boolean);
    var probe = fsHasDataChild === null
      ? fsRoot.getDirectoryHandle('data').then(function () { fsHasDataChild = true; })
          .catch(function () { fsHasDataChild = false; })
      : Promise.resolve();

    return probe.then(function () {
      if (!fsHasDataChild && parts[0] === 'data') parts = parts.slice(1);
      var chain = Promise.resolve(fsRoot);
      for (var i = 0; i < parts.length - 1; i++) {
        (function (name) {
          chain = chain.then(function (dir) { return dir.getDirectoryHandle(name); });
        })(parts[i]);
      }
      return chain.then(function (dir) { return dir.getFileHandle(parts[parts.length - 1]); })
        .then(function (fh) { return fh.getFile(); });
    });
  }

  /* Directory listing, for data sets with no index.json to guide us. */
  function fsList(relDir) {
    var parts = String(relDir).split('/').filter(Boolean);
    if (fsHasDataChild === false && parts[0] === 'data') parts = parts.slice(1);
    var chain = Promise.resolve(fsRoot);
    parts.forEach(function (name) {
      chain = chain.then(function (dir) { return dir.getDirectoryHandle(name); });
    });
    return chain.then(function (dir) {
      var names = [];
      if (!dir.values) return names;
      var it = dir.values();
      function step() {
        return it.next().then(function (r) {
          if (r.done) return names;
          var h = r.value;
          if (h.kind === 'file' && /\.json$/i.test(h.name)) names.push(h.name);
          return step();
        });
      }
      return step();
    }).catch(function () { return []; });
  }

  /* ---- setup -------------------------------------------------------------- */
  function useUrl(url) { ft.mode = 'url'; ft.baseUrl = normBase(url); ft.files = null; fsRoot = null; }
  /* Normalise whatever the directory picker hands us to "data/<rest>" keys.
     Three shapes have to work:
       site root picked     5etools/data/bestiary/x.json -> data/bestiary/x.json
       data folder picked   data/bestiary/x.json         -> data/bestiary/x.json
       renamed data folder  5e-json/bestiary/x.json      -> data/bestiary/x.json
     The match must be on a PATH SEGMENT: a plain indexOf("data/") also hits the
     tail of a folder named "5etools-data", which silently mangles every key. */
  function folderKey(rawPath) {
    var p = String(rawPath).replace(/\\/g, '/').replace(/^\.\//, '');
    var m = p.match(/(?:^|\/)(data\/.+)$/);
    if (m) return m[1];
    /* No data/ segment: assume the picked folder IS the data dir, so drop its
       own name (always the first segment of webkitRelativePath) and re-prefix. */
    var parts = p.split('/');
    if (parts.length > 1) return 'data/' + parts.slice(1).join('/');
    return 'data/' + parts[0];
  }

  function useFolder(fileList) {
    ft.mode = 'folder';
    ft.files = {};
    Array.prototype.slice.call(fileList).forEach(function (f) {
      if (!/\.json$/i.test(f.name)) return;      // skip img/, js/, css/ entirely
      ft.files[folderKey(f.webkitRelativePath || f.name)] = f;
    });
    return Object.keys(ft.files).length;
  }

  function summary() {
    return Object.keys(ft.db).map(function (k) {
      return { kind: k, count: ft.db[k].length };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  VT.fivetools = Object.assign(ft, {
    useUrl: useUrl, useFolder: useFolder, folderKey: folderKey, testUrl: testUrl, normBase: normBase,
    supportsFS: supportsFS, pickDirectory: pickDirectory, reconnectDirectory: reconnectDirectory,
    forgetDirectory: forgetDirectory, rememberedName: rememberedName, useDirectory: useDirectory,
    loadAll: loadAll, get: get, byName: byName, search: search, summary: summary,
    saveCache: saveCache, loadCache: loadCache, clearCache: clearCache,
    setHomebrew: setHomebrew, applyHomebrew: applyHomebrew,
    setFolderHomebrew: setFolderHomebrew, loadFolderHomebrew: loadFolderHomebrew,
    loadBundledHomebrew: loadBundledHomebrew,
    folderHomebrewCount: function () {
      return Object.keys(hbFolder).reduce(function (n, k) { return n + hbFolder[k].length; }, 0);
    },
    spellsForClass: spellsForClass, spellListChanges: spellListChanges,
    buildVariants: buildVariants,
    ARRAY_KEYS: ARRAY_KEYS
  });
})();

/* ===== src/data/convert.js ===== */
/* Virtual Tactics :: data/convert.js
   5etools records -> Virtual Tactics statblocks.

   The source data is written to be *displayed*, not executed, so conversion is
   part schema-mapping (exact) and part prose-parsing (best effort, via
   tags.js). Anything ambiguous lands in the statblock as editable numbers, so
   a wrong guess is a two-second fix in the Forge rather than a dead end. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, T = VT.tags, SRD = VT.srd;

  var SIZE = { T: 'tiny', S: 'small', M: 'medium', L: 'large', H: 'huge', G: 'gargantuan' };
  var DMG = {
    A: 'acid', B: 'bludgeoning', C: 'cold', F: 'fire', O: 'force', L: 'lightning',
    N: 'necrotic', P: 'piercing', I: 'poison', Y: 'psychic', R: 'radiant',
    S: 'slashing', T: 'thunder'
  };
  var ABILITY_FULL = {
    strength: 'str', dexterity: 'dex', constitution: 'con',
    intelligence: 'int', wisdom: 'wis', charisma: 'cha'
  };
  /* creature type -> which procedural sprite build to use */
  var BUILD = {
    beast: 'beast', dragon: 'dragon', undead: 'undead', construct: 'construct',
    ooze: 'ooze', monstrosity: 'beast', elemental: 'construct', plant: 'beast',
    aberration: 'ooze', fiend: 'humanoid', celestial: 'humanoid', fey: 'humanoid',
    giant: 'humanoid', humanoid: 'humanoid'
  };

  /* ---- small helpers ---------------------------------------------------- */
  function flatten(list) {
    /* resist/immune arrays mix plain strings with {resist:[...], note, cond} */
    var out = [];
    (function walk(v) {
      if (v == null) return;
      if (typeof v === 'string') { out.push(v.toLowerCase()); return; }
      if (Array.isArray(v)) { v.forEach(walk); return; }
      ['resist', 'immune', 'vulnerable', 'conditionImmune'].forEach(function (k) {
        if (v[k]) walk(v[k]);
      });
    })(list);
    return out.filter(function (s) { return SRD.DAMAGE_TYPES.indexOf(s) >= 0; });
  }

  function acOf(mon) {
    var a = mon.ac;
    if (a == null) return 10;
    if (typeof a === 'number') return a;
    if (Array.isArray(a)) {
      for (var i = 0; i < a.length; i++) {
        var e = a[i];
        if (typeof e === 'number') return e;
        if (e && typeof e.ac === 'number') return e.ac;
        if (e && e.special) {
          var m = String(e.special).match(/(\d+)/);
          if (m) return parseInt(m[1], 10);
        }
      }
    }
    return 10;
  }

  function hpOf(mon) {
    var h = mon.hp;
    if (h == null) return 1;
    if (typeof h === 'number') return h;
    if (typeof h.average === 'number') return h.average;
    if (h.formula) return Math.max(1, Math.round(VT.dice.avg(h.formula)));
    if (h.special) {
      var m = String(h.special).match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
    return 1;
  }

  function speedOf(mon) {
    var s = mon.speed;
    if (s == null) return 30;
    if (typeof s === 'number') return s;
    var best = 0;
    ['walk', 'fly', 'swim', 'climb', 'burrow'].forEach(function (k) {
      var v = s[k];
      if (v == null) return;
      var n = typeof v === 'number' ? v : (v && typeof v.number === 'number' ? v.number : 0);
      if (k === 'walk') best = Math.max(best, n);
      else best = Math.max(best, n * 0.999);   // prefer walk on a tie
    });
    return Math.round(best) || 30;
  }

  function typeOf(mon) {
    var t = mon.type;
    if (!t) return 'humanoid';
    if (typeof t === 'string') return t.toLowerCase();
    if (t.type) return typeof t.type === 'string' ? t.type.toLowerCase()
      : (t.type.choose ? String(t.type.choose[0]).toLowerCase() : 'humanoid');
    return 'humanoid';
  }

  function crOf(mon) {
    var c = mon.cr;
    if (c == null) return null;
    if (typeof c === 'string' || typeof c === 'number') return String(c);
    if (c.cr) return String(c.cr);
    return null;
  }

  /* Some statblocks express damage as a formula rather than fixed dice:
       "1d8 + 3 + summonSpellLevel"      Tasha's summon spells
       "1d8 + 2 + PB"                    beast-master companions
       "(summonSpellLevel - 4)d4 + 3"    scaling dice counts
     Those are not dice notation, so the roller rejects them and the attack
     silently deals nothing - the worst possible failure. Substitute the
     variables for concrete numbers, evaluate the arithmetic, and drop any term
     whose dice count came out at zero or less. The result is a real expression
     the engine can roll, and the Forge leaves it editable. */
  function resolveFormula(expr, ctx) {
    if (expr == null) return expr;
    ctx = ctx || {};
    var s = String(expr).trim();
    if (!s) return '0';

    var hasVars = /\{\{/.test(s) || /[A-Za-z]/.test(s.replace(/\d*d\d+/g, '').replace(/\s+/g, ''));
    if (hasVars) {
      s = s.replace(/\{\{\s*spellcasting_mod\s*\}\}/gi, String(ctx.mod == null ? 3 : ctx.mod))
           .replace(/\{\{[^}]*\}\}/g, '0')          // any other template placeholder
           .replace(/\bPB\b/g, String(ctx.prof == null ? 2 : ctx.prof))
           .replace(/\bsummonSpellLevel\b|\bsummonClassLevel\b|\bsummonLevel\b/g,
                    String(ctx.summonLevel == null ? 5 : ctx.summonLevel));
      /* collapse "(5 - 4)" style groups that prefix a dice term */
      for (var i = 0; i < 3; i++) {
        s = s.replace(/\(\s*(-?\d+)\s*([+-])\s*(\d+)\s*\)/g, function (_, a, op, b) {
          return String(op === '+' ? (+a) + (+b) : (+a) - (+b));
        });
      }
      /* a term like "-1d4" or "0d6" means that size/tier does not apply */
      s = s.replace(/([+-]?)\s*(-?\d+)d(\d+)/g, function (m, sign, n, faces) {
        return (+n) > 0 ? (sign || '') + n + 'd' + faces : '';
      });
      s = s.replace(/\s*\+\s*\+/g, '+').replace(/^\s*[+]\s*/, '').trim();
    }
    /* Normalise a stray "+-3" into "-3" - valid arithmetic, invalid notation. */
    s = s.replace(/\+\s*-/g, '-').replace(/-\s*\+/g, '-');
    if (!s) return '0';

    /* Last line of defence, applied to EVERY expression however it was built:
       whatever comes out of here must actually roll. A visible zero the DM can
       correct beats an expression that silently contributes nothing. */
    return VT.dice.roll(s).invalid ? '0' : s;
  }

  /* CR -> a "level" for proficiency-bonus purposes. */
  function crToLevel(cr) {
    if (!cr) return 1;
    if (String(cr).indexOf('/') >= 0) return 1;
    var n = parseInt(cr, 10);
    return isNaN(n) ? 1 : Math.max(1, n);
  }

  /* Pick a weapon look for the procedural sprite from what it attacks with. */
  function weaponFor(actions) {
    var text = actions.map(function (a) { return a.name; }).join(' ').toLowerCase();
    if (/bow|sling|crossbow/.test(text)) return 'bow';
    if (/axe/.test(text)) return 'axe';
    if (/spear|pike|lance|javelin|trident/.test(text)) return 'spear';
    if (/greatsword|maul|greatclub/.test(text)) return 'greatsword';
    if (/dagger|shortsword|scimitar/.test(text)) return 'dagger';
    if (/claw|bite|talon|tentacle|slam/.test(text)) return 'claws';
    if (/staff|wand|spell|bolt/.test(text)) return 'staff';
    if (/sword|blade|mace|hammer|flail|morningstar/.test(text)) return 'sword';
    return 'sword';
  }

  /* ---- creature --------------------------------------------------------- */
  function creature(mon, opts) {
    opts = opts || {};
    var a = VT.actor.base(mon.name);
    a.team = opts.team || 'foe';
    a.source = mon.source;
    a.size = SIZE[Array.isArray(mon.size) ? mon.size[0] : mon.size] || 'medium';
    a.ac = acOf(mon);
    a.hpMax = hpOf(mon);
    a.hp = a.hpMax;
    a.speed = speedOf(mon);
    a.abilities = {
      str: mon.str || 10, dex: mon.dex || 10, con: mon.con || 10,
      int: mon.int || 10, wis: mon.wis || 10, cha: mon.cha || 10
    };
    a.cr = crOf(mon);
    a.level = crToLevel(a.cr);
    a.saveProf = mon.save ? Object.keys(mon.save).filter(function (k) { return SRD.ABILITIES.indexOf(k) >= 0; }) : [];
    a.resist = flatten(mon.resist);
    a.immune = flatten(mon.immune);
    a.vulnerable = flatten(mon.vulnerable);
    a.creatureType = typeOf(mon);
    a.alignment = Array.isArray(mon.alignment) ? mon.alignment.join('') : (mon.alignment || '');
    a.languages = Array.isArray(mon.languages) ? mon.languages.join(', ') : (mon.languages || '');
    a.senses = Array.isArray(mon.senses) ? mon.senses.join(', ') : (mon.senses || '');
    if (mon.trait) {
      a.notes = mon.trait.map(function (t) {
        return T.render(t.name, 'text') + ': ' + T.toText(t.entries);
      }).join('\n\n');
      var regen = a.notes.match(/regains?\s+(\d+)\s+hit points/i);
      if (regen) a.regen = parseInt(regen[1], 10);
    }

    /* actions */
    a.actions = [];
    (mon.action || []).forEach(function (act) {
      var m = T.mechanics(act);
      if (m.kind === 'buff' && !m.dmg) {
        /* No attack roll and no save - keep it as a note-only ability so the
           DM can still see and narrate it, but it does nothing mechanical. */
        m.kind = 'buff'; m.condition = m.applies || null; m.range = [5, 5];
      }
      a.actions.push(m);
    });
    (mon.reaction || []).forEach(function (act) {
      var m = T.mechanics(act, { reaction: true });
      m.cost = 'reaction';
      a.actions.push(m);
    });
    if (opts.includeLegendary !== false) {
      (mon.legendary || []).forEach(function (act) {
        var m = T.mechanics(act);
        m.name = '★ ' + m.name;
        a.actions.push(m);
      });
    }
    /* spellcasting, if we have a spell compendium to resolve names against */
    (mon.spellcasting || []).forEach(function (sc) {
      spellcastingActions(sc, a).forEach(function (x) { a.actions.push(x); });
    });

    if (!a.actions.length) {
      /* Critters and summon templates often have no action block at all. Give
         them something rollable - and note that a negative modifier must not be
         glued on as "+-4", which is not valid dice notation. */
      var sm = VT.actor.abilityMod(a, 'str');
      a.actions.push(SRD.melee('Attack', 2 + sm, '1d4' + (sm ? U.sign(sm) : ''), 'bludgeoning'));
    }

    /* Resolve any formula-based damage into rollable dice. */
    var fctx = { prof: VT.actor.prof(a), summonLevel: opts.summonLevel || 5 };
    a.actions.forEach(function (act) {
      if (!act.dmg) return;
      var resolved = resolveFormula(act.dmg, fctx);
      if (resolved !== act.dmg) {
        act.variable = true;
        act.dmgRaw = act.dmg;
        act.dmg = resolved;
      }
    });

    a.spec = VT.spriteart.autoSpec(mon.name, {
      kind: BUILD[a.creatureType] || 'humanoid',
      weapon: weaponFor(a.actions)
    });
    return a;
  }

  /* Monster spellcasting blocks -> castable actions. */
  function spellcastingActions(sc, actor) {
    var out = [];
    var header = T.toText(sc.headerEntries || '');
    var dcM = header.match(/DC\s*(\d+)/i);
    var atkM = header.match(/([+-]\d+)\s+to hit with spell/i);
    var dc = dcM ? parseInt(dcM[1], 10) : 8 + VT.actor.prof(actor) + VT.actor.abilityMod(actor, sc.ability || 'cha');
    var atk = atkM ? parseInt(atkM[1], 10) : VT.actor.prof(actor) + VT.actor.abilityMod(actor, sc.ability || 'cha');

    function addList(names, uses, label) {
      (names || []).forEach(function (raw) {
        var nm = String(raw).replace(/\{@spell\s+([^}|]+)[^}]*\}/i, '$1').replace(/[{}]/g, '').trim();
        var rec = VT.fivetools.byName('spell', nm);
        if (!rec) return;
        var act = spell(rec, { dc: dc, atk: atk, level: actor.level });
        if (!act) return;
        if (uses) act.uses = { max: uses, per: 'rest' };
        if (label) act.name = act.name + ' (' + label + ')';
        out.push(act);
      });
    }
    addList(sc.will, 0, 'at will');
    Object.keys(sc.daily || {}).forEach(function (k) {
      var n = parseInt(k, 10) || 1;
      addList(sc.daily[k], n, n + '/day');
    });
    Object.keys(sc.spells || {}).forEach(function (lvl) {
      var slot = sc.spells[lvl];
      addList(slot.spells, slot.slots || 0, lvl === '0' ? 'cantrip' : 'level ' + lvl);
    });
    return out;
  }

  /* ---- spell ------------------------------------------------------------ */
  /* opts: {dc, atk, level} - the caster's numbers, since a spell has none. */
  function spell(sp, opts) {
    opts = opts || {};
    var raw = T.rawOf(sp.entries) + ' ' + T.rawOf(sp.entriesHigherLevel || '');
    var act = {
      name: sp.name,
      cost: (sp.time && sp.time[0] && sp.time[0].unit === 'bonus') ? 'bonus' : 'action',
      spell: true,
      level: sp.level,
      school: sp.school,
      desc: T.toText(sp.entries)
    };

    /* range */
    var ft = 60;
    if (sp.range) {
      var r = sp.range;
      if (r.type === 'point' && r.distance) {
        if (r.distance.type === 'feet') ft = r.distance.amount || 60;
        else if (r.distance.type === 'touch') ft = 5;
        else if (r.distance.type === 'self') ft = 0;
        else if (r.distance.type === 'miles') ft = (r.distance.amount || 1) * 5280;
        else ft = 60;
      } else if (r.type === 'radius' || r.type === 'sphere' || r.type === 'cone' ||
                 r.type === 'line' || r.type === 'cube' || r.type === 'hemisphere') {
        ft = (r.distance && r.distance.amount) || 15;
        act.aoe = { radius: ft };
        ft = 0;
      } else if (r.type === 'special') ft = 60;
    }

    /* Damage expression. Cantrips are the awkward case: their entries carry the
       1st-level dice inline AND a scalingLevelDice table, so the inline tag
       must lose or every cantrip stays frozen at its level-1 damage. */
    var allTags = T.splitTags(raw);
    var dmgTags = allTags.filter(function (t) { return t.tag === 'damage'; });
    var diceTags = allTags.filter(function (t) { return t.tag === 'dice'; });
    var expr = dmgTags.length ? dmgTags[0].parts[0] : null;
    if (sp.scalingLevelDice && (sp.level === 0 || !expr)) {
      var sld = Array.isArray(sp.scalingLevelDice) ? sp.scalingLevelDice[0] : sp.scalingLevelDice;
      var scaling = sld && sld.scaling;
      if (scaling) {
        var lvl = opts.level || 1;
        var best = null;
        Object.keys(scaling).map(Number).sort(function (a, b) { return a - b; })
          .forEach(function (k) { if (k <= lvl) best = scaling[k]; });
        expr = best || scaling[Object.keys(scaling)[0]] || expr;
      }
    }
    /* Healing is written with {@dice}, not {@damage} - pick that up too. */
    var anyExpr = expr || (diceTags.length ? diceTags[0].parts[0] : null);
    var dtype = (sp.damageInflict && sp.damageInflict[0]) || null;
    if (!dtype) {
      var dm = raw.match(/\{@damage[^}]+\}\)?\s*([a-z]+)\s+damage/i);
      dtype = dm ? dm[1].toLowerCase() : 'force';
    }

    /* area, if the prose says so and range didn't already tell us */
    if (!act.aoe) {
      var aoeM = raw.match(/(\d+)[- ]foot[- ](?:radius|sphere|cone|line|cube)/i);
      if (aoeM) act.aoe = { radius: parseInt(aoeM[1], 10) };
    }

    if (sp.savingThrow && sp.savingThrow.length) {
      act.kind = 'save';
      act.save = ABILITY_FULL[String(sp.savingThrow[0]).toLowerCase()] || 'dex';
      act.dc = opts.dc || 13;
      act.half = /half as much damage|half damage/i.test(raw);
      act.dmg = expr || '0';
      act.dmgType = dtype;
      act.range = [ft || (act.aoe ? 60 : 30), ft || (act.aoe ? 60 : 30)];
    } else if (sp.spellAttack && sp.spellAttack.length) {
      act.kind = String(sp.spellAttack[0]).toUpperCase() === 'M' ? 'melee' : 'ranged';
      act.toHit = opts.atk == null ? 5 : opts.atk;
      act.dmg = expr || '1d8';
      act.dmgType = dtype;
      if (act.kind === 'melee') act.reach = ft || 5;
      else act.range = [ft || 60, ft || 60];
    } else if (/regains?\s+hit points|healing/i.test(raw) || /\bheal/i.test(sp.name)) {
      act.kind = 'heal';
      act.dmg = anyExpr || '1d8';
      act.range = [ft || 30, ft || 30];
    } else {
      /* buffs, utility, control - carry the condition if we can spot one */
      act.kind = 'buff';
      act.range = [ft || 30, ft || 30];
      var condTag = T.splitTags(raw).find(function (t) {
        return t.tag === 'condition' && SRD.CONDITIONS[String(t.parts[0]).toLowerCase()];
      });
      act.condition = condTag ? String(condTag.parts[0]).toLowerCase() : 'blessed';
      if (expr) {
        /* Damage, but the spell names neither a saving throw nor an attack
           roll: Magic Missile and its kind simply hit. The battle map has no
           "just hits" action, so it is still resolved as a DEX save there;
           the sheets say `auto` rather than showing a DC that is not real. */
        act.kind = 'save'; act.save = 'dex'; act.dc = opts.dc || 13;
        act.dmg = expr; act.dmgType = dtype;
        act.half = !/automatically|without an attack roll|strikes? .*simultaneous/i.test(raw);
        act.autoHit = !act.half;
      }
    }
    /* Spell text carries its own placeholders ({{spellcasting_mod}} in a few
       cantrips), so run the same resolver the creature path uses. */
    if (act.dmg != null) {
      act.dmg = resolveFormula(act.dmg, {
        mod: opts.mod == null ? 3 : opts.mod,
        prof: opts.prof,
        summonLevel: opts.level
      });
    }

    /* What this spell does with a bigger slot, and how many projectiles it
       throws at its own level. Cantrips scale with character level instead and
       have no upcast rule at all. */
    act.spellLevel = sp.level || 0;
    if (sp.level > 0 && VT.upcast) {
      var up = VT.upcast.parse(sp);
      if (up) {
        act.upcast = up;
        if (up.kind === 'count') act.count = VT.upcast.baseCount(sp);
      }
    }
    return act;
  }

  /* ---- weapon item ------------------------------------------------------ */
  /* opts: {str, dex, prof} - the wielder's numbers. */
  function weapon(item, opts) {
    opts = opts || {};
    if (!item || (!item.dmg1 && !item.weapon)) return null;
    var props = (item.property || []).map(function (p) {
      return typeof p === 'string' ? p : (p && p.uid ? String(p.uid).split('|')[0] : '');
    });
    var finesse = props.indexOf('F') >= 0;
    var isRanged = String(item.type || '').split('|')[0] === 'R' || props.indexOf('A') >= 0;
    var thrown = props.indexOf('T') >= 0;

    var str = opts.str == null ? 0 : opts.str;
    var dex = opts.dex == null ? 0 : opts.dex;
    var mod = (isRanged || (finesse && dex > str)) ? dex : str;
    var prof = opts.prof == null ? 2 : opts.prof;

    /* `bonusWeapon` is the generic "+X to attack AND damage". The split
       bonusWeaponAttack / bonusWeaponDamage fields exist for items that only
       boost one of the two, so each side falls back to the generic value. */
    var bonusAtk = parseInt(item.bonusWeapon || item.bonusWeaponAttack || 0, 10) || 0;
    var bonusDmg = parseInt(item.bonusWeaponDamage || item.bonusWeapon || 0, 10) || 0;

    /* Some "weapons" deal no damage at all - a net restrains instead. Without
       this guard the expression comes out as the string "undefined+2". */
    var dmgMod = mod + bonusDmg;
    var expr = item.dmg1
      ? item.dmg1 + (dmgMod ? (dmgMod > 0 ? '+' : '') + dmgMod : '')
      : '0';
    var act = {
      name: item.name,
      toHit: prof + mod + bonusAtk,
      dmg: expr,
      dmgType: DMG[item.dmgType] || 'bludgeoning',
      cost: 'action',
      itemName: item.name
    };
    if (isRanged || (thrown && !item.dmg1)) {
      act.kind = 'ranged';
      var rng = String(item.range || '30/120').split('/');
      act.range = [parseInt(rng[0], 10) || 30, parseInt(rng[1], 10) || parseInt(rng[0], 10) || 120];
    } else {
      act.kind = 'melee';
      act.reach = props.indexOf('R') >= 0 ? 10 : 5;
      if (thrown) act.thrown = String(item.range || '20/60');
    }
    if (props.indexOf('V') >= 0 && item.dmg2) act.versatile = item.dmg2;
    return act;
  }

  /* ---- misc lookups ----------------------------------------------------- */
  function abilityBonusesFromRace(race) {
    var out = {};
    var ab = race && race.ability && race.ability[0];
    if (!ab) return out;
    Object.keys(ab).forEach(function (k) {
      if (SRD.ABILITIES.indexOf(k) >= 0) out[k] = ab[k];
    });
    return out;
  }

  function raceSpeed(race) {
    if (!race || race.speed == null) return 30;
    if (typeof race.speed === 'number') return race.speed;
    if (race.speed.walk) return typeof race.speed.walk === 'number' ? race.speed.walk : 30;
    return 30;
  }

  function raceSize(race) {
    var s = race && race.size;
    if (!s) return 'medium';
    return SIZE[Array.isArray(s) ? s[0] : s] || 'medium';
  }

  VT.convert = {
    creature: creature, spell: spell, weapon: weapon,
    abilityBonusesFromRace: abilityBonusesFromRace, raceSpeed: raceSpeed, raceSize: raceSize,
    SIZE: SIZE, DMG: DMG, ABILITY_FULL: ABILITY_FULL, BUILD: BUILD,
    acOf: acOf, hpOf: hpOf, speedOf: speedOf, typeOf: typeOf, crOf: crOf, crToLevel: crToLevel, resolveFormula: resolveFormula,
    flatten: flatten
  };
})();

/* ===== src/data/currency.js ===== */
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

/* ===== src/data/upcast.js ===== */
/* Virtual Tactics :: data/upcast.js
   Casting a spell with a higher-level slot.

   5etools writes the upcast rule into `entriesHigherLevel`, and for damage and
   healing it is machine-readable:

     {@scaledamage 8d6|3-9|1d6}   Fireball: 8d6 at 3rd, +1d6 per level above
     {@scaledice 2d8|1-9|2d8}     Cure Wounds: 2d8 at 1st, +2d8 per level above

   The other common shape is prose - "one more dart for each spell slot level
   above 1" - which is regular enough to read: Magic Missile and Scorching Ray
   and their relatives add projectiles rather than dice. Both are handled.

   Anything stranger keeps its printed higher-level text and casts at its base
   numbers, which is the same bargain the rest of the app strikes. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, T = VT.tags;

  var WORD_NUMBER = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
                      seven: 7, eight: 8, nine: 9, ten: 10 };

  /* ==== dice arithmetic ================================================== */
  /* "8d6" plus two lots of "1d6" is "10d6", not "8d6 + 1d6 + 1d6". Merging
     matters: a d20 tray with ten separate 1d6 entries is unreadable, and crit
     doubling has to see one term. */
  function parseExpr(expr) {
    var terms = { dice: {}, flat: 0 };
    String(expr == null ? '' : expr).replace(/\s+/g, '')
      .replace(/([+-]?)(\d*)d(\d+)|([+-]?\d+)(?![d\d])/gi,
        function (m, sign, n, faces, flat) {
          if (faces) {
            var count = (n === '' ? 1 : parseInt(n, 10)) * (sign === '-' ? -1 : 1);
            terms.dice[faces] = (terms.dice[faces] || 0) + count;
          } else if (flat) {
            terms.flat += parseInt(flat, 10);
          }
          return '';
        });
    return terms;
  }

  function formatExpr(terms) {
    var parts = Object.keys(terms.dice).map(Number)
      .sort(function (a, b) { return b - a; })
      .filter(function (f) { return terms.dice[f]; })
      .map(function (f) { return terms.dice[f] + 'd' + f; });
    var out = parts.join('+');
    if (terms.flat) out += (terms.flat > 0 ? '+' : '') + terms.flat;
    return out || '0';
  }

  /* base + (per x times) */
  function addDice(base, per, times) {
    if (!times || !per) return base;
    var a = parseExpr(base), b = parseExpr(per);
    Object.keys(b.dice).forEach(function (f) {
      a.dice[f] = (a.dice[f] || 0) + b.dice[f] * times;
    });
    a.flat += b.flat * times;
    return formatExpr(a);
  }

  /* ==== reading the rule ================================================= */
  /* Returns null, or:
       { kind:'dice',  base, min, max, per }
       { kind:'count', per, what }                                          */
  function parse(sp) {
    if (!sp || !sp.entriesHigherLevel) return null;
    var raw = T.rawOf(sp.entriesHigherLevel);

    var tags = T.splitTags(raw).filter(function (t) {
      return t.tag === 'scaledamage' || t.tag === 'scaledice';
    });
    if (tags.length) {
      var p = tags[0].parts || [];
      var range = String(p[1] || '').split('-');
      var min = parseInt(range[0], 10);
      return {
        kind: 'dice',
        base: p[0] || null,
        min: isNaN(min) ? (sp.level || 1) : min,
        max: parseInt(range[1], 10) || 9,
        per: p[2] || p[0]
      };
    }

    /* "one more dart", "one additional ray", "two additional creatures" */
    var m = raw.match(/\b(one|two|three|a)\s+(?:more|additional|extra)\s+([a-z]+)\b[\s\S]{0,80}?for each (?:spell )?slot level above/i);
    if (m) {
      return { kind: 'count', per: WORD_NUMBER[m[1].toLowerCase()] || 1, what: m[2].toLowerCase() };
    }
    return null;
  }

  /* How many projectiles the spell throws at its base level - "three glowing
     darts", "three fiery rays". Only meaningful alongside a 'count' rule. */
  function baseCount(sp) {
    var raw = T.rawOf(sp && sp.entries);
    var m = raw.match(/\b(one|two|three|four|five|six)\s+(?:glowing|fiery|[a-z]+\s+)?(darts?|rays?|beams?|bolts?|missiles?)\b/i);
    return m ? (WORD_NUMBER[m[1].toLowerCase()] || 1) : 1;
  }

  /* ==== what an action looks like at a given slot level ================== */
  /* Returns { dmg, count, note, levels } for the action cast with `slot`. */
  function hasDamage(act) {
    var d = String(act && act.dmg || '').trim();
    return !!d && d !== '0' && /\d/.test(d);
  }

  function at(act, slot) {
    var base = normalise(act.dmg || '0');
    var lvl = act.spellLevel == null ? 0 : act.spellLevel;
    var count = act.count || 1;
    var up = act.upcast;
    if (!up || !slot || slot <= lvl) {
      return { dmg: base, count: count, note: '', levels: 0 };
    }
    var over = slot - Math.max(lvl, up.kind === 'dice' ? up.min : lvl);
    if (over <= 0) return { dmg: base, count: count, note: '', levels: 0 };

    if (up.kind === 'dice') {
      var capped = Math.min(over, Math.max(0, (up.max || 9) - up.min));
      return {
        dmg: addDice(base, up.per, capped),
        count: count,
        note: '+' + capped + ' level' + (capped === 1 ? '' : 's') +
              ' (' + up.per + ' each)',
        levels: capped
      };
    }
    var extra = over * (up.per || 1);
    var word = '+' + extra + ' ' + (up.what || 'more') + (extra === 1 ? '' : 's');
    /* Bless and its relatives add TARGETS, not damage. Multiplying a spell with
       no damage by its target count would print "3x0", so say it in words. */
    if (!hasDamage(act)) return { dmg: base, count: 1, note: word, levels: over };
    return { dmg: base, count: count + extra, note: word, levels: over };
  }

  /* The whole damage of one cast: count copies of the expression. Kept as a
     separate call because the tray shows each projectile as its own roll. */
  function totalExpr(act, slot) {
    var r = at(act, slot);
    if (r.count <= 1) return r.dmg;
    var terms = parseExpr(r.dmg), out = { dice: {}, flat: 0 };
    Object.keys(terms.dice).forEach(function (f) { out.dice[f] = terms.dice[f] * r.count; });
    out.flat = terms.flat * r.count;
    return formatExpr(out);
  }

  /* ==== which slots are available ======================================== */
  /* [{ level, max, left, pact }] for every slot the character could spend on
     this spell - its own level and up. */
  function slotOptions(actor, act) {
    var out = [];
    if (!actor || !act) return out;
    /* A cantrip costs no slot at all - it scales with character level, which
       the converter has already baked into its damage. */
    if (!act.spellLevel) return out;
    var min = act.spellLevel;
    var slots = actor.spellSlots;
    if (slots && slots.slots) {
      slots.slots.forEach(function (max, i) {
        var lv = i + 1;
        if (!max || lv < min) return;
        out.push({ level: lv, max: max, left: VT.features.slotsLeft(actor, lv), pact: false });
      });
    }
    /* Pact slots are one pool at a fixed level, and are a legitimate way to
       cast anything that fits. */
    var pact = actor.pactSlots || (slots && slots.pact ? slots : null);
    if (pact && pact.slotLevel >= min) {
      out.push({ level: pact.slotLevel, max: pact.count,
                 left: VT.features.pactLeft(actor) || (pact.count - ((actor.slotsUsed || {}).pact || 0)),
                 pact: true });
    }
    return out;
  }

  /* Spend one. Returns true if there was one to spend. */
  function spendSlot(actor, opt) {
    actor.slotsUsed = actor.slotsUsed || {};
    if (opt.pact) {
      if ((actor.slotsUsed.pact || 0) >= opt.max) return false;
      actor.slotsUsed.pact = (actor.slotsUsed.pact || 0) + 1;
      return true;
    }
    var used = actor.slotsUsed[opt.level] || 0;
    if (used >= opt.max) return false;
    actor.slotsUsed[opt.level] = used + 1;
    return true;
  }

  /* "1d4 + 1" and "1d4+1" are the same roll; the tray prefers the tidy one. */
  function normalise(expr) {
    var e = String(expr == null ? '' : expr).trim();
    if (!e || !/\d/.test(e)) return e || '0';
    var t = parseExpr(e);
    var out = formatExpr(t);
    return out === '0' && e !== '0' ? e : out;
  }

  VT.upcast = {
    normalise: normalise, hasDamage: hasDamage,
    parse: parse, baseCount: baseCount, at: at, totalExpr: totalExpr,
    slotOptions: slotOptions, spendSlot: spendSlot,
    addDice: addDice, parseExpr: parseExpr, formatExpr: formatExpr
  };
})();

/* ===== src/data/features.js ===== */
/* Virtual Tactics :: data/features.js
   Mechanical effects for class features.

   5etools stores features as prose — there is no machine-readable "this grants
   expertise in two skills" field anywhere in the data. So this is a curated
   table: the core features of the PHB classes, mapped to a small vocabulary of
   effects the sheet can actually apply.

   Anything with no entry here falls through to data/featuretext.js, which reads
   the printed text for the two shapes that ARE written predictably — attacks
   and saving-throw effects — and builds an action when every part is stated.
   That covers a further thirty-odd features, Radiant Sun Bolt among them,
   without anyone hand-writing them.

   Whatever neither of those catches still appears on the sheet with its full
   printed text, unwired. That is the honest split, and this table is plain
   data, so adding an entry is a two-line change.

   Effect vocabulary:
     resource     a tracked pool (Ki, Rage, Bardic Inspiration...)
     actions      entries added to the action list
     expertise    number of skills that get double proficiency
     jackOfAllTrades  half proficiency on non-proficient ability checks
     saveBonusAll a flat bonus to every saving throw (Aura of Protection)
     acFormula    replaces AC while unarmoured (Unarmored Defense)
     speedBonus   walking speed increase
     note         a short mechanical reminder shown under the feature */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function mod(a, k) { return SRD.mod(a.abilities[k] || 10); }

  /* Some classes set a save DC without casting anything - the monk's Ki save
     DC is the common one, and its features lean on it without restating it.
     Only classes whose rules actually define such a DC are listed; for anyone
     else the answer is nothing, so the reader abstains rather than inventing
     a number. */
  var CLASS_DC_ABILITY = { monk: 'wis' };

  function classSaveDC(actor, className) {
    var key = String(className || '').toLowerCase().split(' ')[0];
    var ability = CLASS_DC_ABILITY[key];
    if (!ability) return null;
    return 8 + VT.actor.prof(actor) + mod(actor, ability);
  }
  function lvl(a) { return a.level || 1; }
  function byLevel(pairs, level) {
    /* pairs: [[minLevel, value], ...] highest matching wins */
    var v = pairs[0][1];
    pairs.forEach(function (p) { if (level >= p[0]) v = p[1]; });
    return v;
  }

  /* ---- spell slots ------------------------------------------------------ */
  var FULL = [
    [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2],
    [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
    [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
    [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
    [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]
  ];
  var HALF = [
    [], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
    [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2],
    [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2]
  ];
  var THIRD = [
    [], [], [2], [3], [3], [3], [4, 2], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3],
    [4, 3, 2], [4, 3, 2], [4, 3, 2], [4, 3, 3], [4, 3, 3], [4, 3, 3],
    [4, 3, 3, 1], [4, 3, 3, 1]
  ];
  /* warlock: [number of slots, the level they are cast at] */
  var PACT = [
    [1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5],
    [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]
  ];

  /* How many full-caster levels one class level is worth. The 2014 half-caster
     rounds down and gets nothing at 1st; the artificer - and, in 2024, the
     paladin and ranger, which 5etools marks with the same code - rounds UP, so
     they have slots from 1st level. Third-casters are the Eldritch Knight and
     Arcane Trickster subclasses. */
  function casterLevels(progression, level) {
    if (!level) return 0;
    if (progression === 'full') return level;
    if (progression === 'artificer') return Math.ceil(level / 2);
    if (progression === '1/2') return Math.floor(level / 2);
    if (progression === '1/3') return Math.floor(level / 3);
    return 0;
  }

  function slotsFor(progression, level) {
    var i = U.clamp(level, 1, 20) - 1;
    if (progression === 'pact') {
      var p = PACT[i];
      return { pact: true, count: p[0], slotLevel: p[1] };
    }
    /* The artificer's own table IS the full table read at half its level
       rounded up, which is exactly what casterLevels() computes. */
    if (progression === 'artificer') {
      var eff = casterLevels('artificer', U.clamp(level, 1, 20));
      return { pact: false, slots: (FULL[eff - 1] || []).slice() };
    }
    var table = progression === 'full' ? FULL
      : progression === '1/2' ? HALF
      : progression === '1/3' ? THIRD : null;
    if (!table) return null;
    return { pact: false, slots: (table[i] || []).slice() };
  }

  /* Multiclass slots come from ONE combined caster level read off the full
     table - not from adding each class's own row together. */
  function slotsForCasterLevel(n) {
    if (!n) return null;
    return { pact: false, slots: (FULL[U.clamp(n, 1, 20) - 1] || []).slice() };
  }

  /* ---- small action builders -------------------------------------------- */
  function damageOnly(name, dice, type, desc, cost) {
    /* Not an attack of its own — a damage roll the player adds to a hit. The
       sheet gives any action with dice a roll button, which is exactly right. */
    return { name: name, kind: 'buff', dmg: dice, dmgType: type || 'radiant',
             cost: cost || 'action', desc: desc || '', fromFeature: true };
  }
  function martialArtsDie(level) { return byLevel([[1, '1d4'], [5, '1d6'], [11, '1d8'], [17, '1d10']], level); }
  function bardicDie(level) { return byLevel([[1, '1d6'], [5, '1d8'], [10, '1d10'], [15, '1d12']], level); }
  function sneakDice(level) { return Math.ceil(level / 2) + 'd6'; }

  /* ---- the table --------------------------------------------------------
     Keyed by lower-cased feature name. `cls` narrows it when two classes share
     a feature name that behaves differently. */
  var EFFECTS = {
    /* --- Barbarian --- */
    'rage': { cls: 'barbarian', resource: function (a) {
        return { key: 'rage', name: 'Rage', per: 'long',
                 max: byLevel([[1, 2], [3, 3], [6, 4], [12, 5], [17, 6]], lvl(a)) }; },
      note: 'Advantage on STR checks and saves; bonus melee damage; resistance to physical damage.' },
    'unarmored defense': { resource: null, acFormula: function (a, cls) {
        /* Barbarian uses CON, monk uses WIS — same feature name, different sums */
        var second = /monk/i.test(cls || '') ? 'wis' : 'con';
        return 10 + mod(a, 'dex') + mod(a, second);
      }, note: 'While wearing no armour.' },
    /* The permanently-on speed features. Most features that mention speed are
       activated - Bladesong, Dread Ambusher, Blade Flourish - and would be
       wrong applied passively, so they are deliberately not here. */
    'superior mobility': { cls: 'rogue', speedBonus: function () { return 10; },
      note: 'Climbing and swimming speeds increase too.' },
    'roving': { cls: 'ranger', speedBonus: function (a) {
        /* 2024 wording: only while not in heavy armour. */
        if (VT.gear && VT.gear.wearingHeavy(a)) return 0;
        return 10;
      }, note: 'While not wearing heavy armour. Climb and swim speeds match your walking speed.' },
    'deft explorer improvement': { cls: 'ranger', speedBonus: function () { return 5; },
      note: 'Climbing and swimming speeds equal your walking speed.' },

    'fast movement': { speedBonus: function (a) {
        if (VT.gear && VT.gear.wearingHeavy(a)) return 0;
        return 10;
      }, note: 'While not wearing heavy armour.' },
    'brutal critical': { note: 'Roll one extra weapon damage die on a critical hit.' },

    /* --- Bard --- */
    'bardic inspiration': { cls: 'bard', resource: function (a) {
        return { key: 'bardic', name: 'Bardic Inspiration', per: lvl(a) >= 5 ? 'short' : 'long',
                 max: Math.max(1, mod(a, 'cha')) }; },
      actions: function (a) {
        return [damageOnly('Bardic Inspiration', bardicDie(lvl(a)), 'radiant',
          'Bonus action: give the die to an ally to add to one roll.', 'bonus')];
      } },
    'jack of all trades': { jackOfAllTrades: true,
      note: 'Half proficiency on ability checks you are not already proficient in.' },
    'expertise': { expertise: 2, note: 'Double proficiency on the chosen skills.' },
    'cutting words': { cls: 'bard', actions: function (a) {
        return [damageOnly('Cutting Words', bardicDie(lvl(a)), 'psychic',
          'Reaction: subtract the roll from an enemy attack, check or damage. Costs a Bardic Inspiration.', 'reaction')];
      } },
    'song of rest': { note: 'Allies regain extra hit points on a short rest.' },

    /* --- Cleric --- */
    'channel divinity': { resource: function (a) {
        return { key: 'channel', name: 'Channel Divinity', per: 'short',
                 max: byLevel([[1, 1], [6, 2], [18, 3]], lvl(a)) }; } },
    'channel divinity|paladin': { resource: function () {
        return { key: 'channel', name: 'Channel Divinity', per: 'short', max: 1 }; } },
    'divine intervention': { resource: function () {
        return { key: 'intervention', name: 'Divine Intervention', per: 'long', max: 1 }; } },

    /* --- Druid --- */
    'wild shape': { resource: function () {
        return { key: 'wildshape', name: 'Wild Shape', per: 'short', max: 2 }; } },

    /* --- Fighter --- */
    'second wind': { resource: function () {
        return { key: 'secondwind', name: 'Second Wind', per: 'short', max: 1 }; },
      actions: function (a) {
        return [{ name: 'Second Wind', kind: 'heal', dmg: '1d10+' + lvl(a),
                  range: [0, 0], cost: 'bonus', fromFeature: true,
                  desc: 'Bonus action: regain 1d10 + fighter level hit points.' }];
      } },
    'action surge': { resource: function (a) {
        return { key: 'actionsurge', name: 'Action Surge', per: 'short',
                 max: byLevel([[1, 1], [17, 2]], lvl(a)) }; } },
    'indomitable': { resource: function (a) {
        return { key: 'indomitable', name: 'Indomitable', per: 'long',
                 max: byLevel([[9, 1], [13, 2], [17, 3]], lvl(a)) }; } },
    'superiority dice': { resource: function (a) {
        return { key: 'superiority', name: 'Superiority Dice', per: 'short',
                 max: byLevel([[3, 4], [7, 5], [15, 6]], lvl(a)) }; } },
    'combat superiority': { resource: function (a) {
        return { key: 'superiority', name: 'Superiority Dice', per: 'short',
                 max: byLevel([[3, 4], [7, 5], [15, 6]], lvl(a)) }; },
      actions: function (a) {
        return [damageOnly('Superiority Die', byLevel([[3, '1d8'], [10, '1d10'], [18, '1d12']], lvl(a)),
          'slashing', 'Spend a superiority die on a manoeuvre.', 'action')];
      } },
    'extra attack': { note: 'Attack twice whenever you take the Attack action.' },

    /* --- Monk --- */
    'ki': { cls: 'monk', resource: function (a) {
        return { key: 'ki', name: 'Ki', per: 'short', max: lvl(a) }; } },
    'martial arts': { cls: 'monk', actions: function (a) {
        var best = Math.max(mod(a, 'dex'), mod(a, 'str'));
        return [{ name: 'Unarmed Strike', kind: 'melee', reach: 5,
                  toHit: VT.actor.prof(a) + best,
                  dmg: martialArtsDie(lvl(a)) + (best ? U.sign(best) : ''),
                  dmgType: 'bludgeoning', cost: 'action', fromFeature: true,
                  desc: 'Bonus action unarmed strike when you attack with a monk weapon.' }];
      } },
    'unarmored movement': { speedBonus: function (a) {
        /* The name is the rule. Applying it in plate was making a monk in full
           armour the fastest thing on the board. */
        if (VT.gear && (VT.gear.wearingArmour(a) || VT.gear.wearingShield(a))) return 0;
        return byLevel([[2, 10], [6, 15], [10, 20], [14, 25], [18, 30]], lvl(a));
      }, note: 'While wearing no armour and no shield.' },
    'stunning strike': { note: 'Spend 1 ki: the target makes a CON save or is stunned.' },
    'deflect missiles': { note: 'Reaction: reduce ranged weapon damage by 1d10 + monk level + DEX.' },

    /* --- Paladin --- */
    'divine sense': { resource: function (a) {
        return { key: 'divinesense', name: 'Divine Sense', per: 'long', max: 1 + mod(a, 'cha') }; } },
    'lay on hands': { resource: function (a) {
        return { key: 'layonhands', name: 'Lay on Hands (hp)', per: 'long', max: lvl(a) * 5 }; },
      actions: function () {
        return [{ name: 'Lay on Hands', kind: 'heal', dmg: '0', range: [5, 5], cost: 'action',
                  fromFeature: true, desc: 'Spend points from the pool to heal that many hit points.' }];
      } },
    'divine smite': { cls: 'paladin', actions: function () {
        return [damageOnly('Divine Smite', '2d8', 'radiant',
          'On a melee hit, expend a spell slot: 2d8 radiant, +1d8 per slot level above 1st, +1d8 against undead or fiends.')];
      } },
    'aura of protection': { saveBonusAll: function (a) { return Math.max(1, mod(a, 'cha')); },
      note: 'You and allies within 10 ft add your CHA modifier to saving throws.' },
    'aura of courage': { note: 'You and allies within 10 ft cannot be frightened.' },

    /* --- Ranger --- */
    'favored enemy': { note: 'Advantage on Survival to track, and INT checks to recall, your chosen foe.' },
    'natural explorer': { note: 'Doubled proficiency on INT and WIS checks for your favoured terrain.' },

    /* --- Rogue --- */
    'sneak attack': { cls: 'rogue', actions: function (a) {
        return [damageOnly('Sneak Attack', sneakDice(lvl(a)), 'piercing',
          'Once per turn, with advantage or an ally adjacent, using a finesse or ranged weapon.')];
      } },
    'cunning action': { note: 'Bonus action to Dash, Disengage or Hide.' },
    'uncanny dodge': { note: 'Reaction: halve the damage of one attack you can see.' },
    'evasion': { note: 'DEX saves for half damage take none on a success, half on a failure.' },
    'reliable talent': { note: 'Treat any proficient ability check roll below 10 as a 10.' },

    /* --- Sorcerer --- */
    'font of magic': { resource: function (a) {
        return { key: 'sorcery', name: 'Sorcery Points', per: 'long', max: lvl(a) }; } },
    'sorcery points': { resource: function (a) {
        return { key: 'sorcery', name: 'Sorcery Points', per: 'long', max: lvl(a) }; } },

    /* --- Warlock --- */
    'mystic arcanum': { note: 'One free casting of a high-level spell per long rest.' },

    /* --- Wizard --- */
    'arcane recovery': { resource: function () {
        return { key: 'arcanerecovery', name: 'Arcane Recovery', per: 'long', max: 1 }; } }
  };

  /* ---- application ------------------------------------------------------ */
  /* Reads actor.features (already resolved from the compendium) and writes the
     mechanical consequences onto the actor. Idempotent: it rebuilds its own
     output every time, so re-deriving never double-applies anything. */
  function apply(actor, choices) {
    choices = choices || {};
    var className = (choices.cls && choices.cls.name) || actor.className || '';
    var seenResource = {};
    var resources = [];
    var featureActions = [];
    var notes = {};
    var derivedCount = 0;      /* actions read from prose rather than curated */

    actor.expertiseSlots = 0;
    actor.jackOfAllTrades = false;
    actor.saveBonusAll = 0;
    actor.speedBonus = 0;

    (actor.features || []).forEach(function (f) {
      var key = String(f.name || '').toLowerCase().trim();
      /* Each feature remembers which class granted it, which is what makes a
         Cleric/Paladin work: their two Channel Divinities scale differently and
         a single character-wide class name could only ever get one right. */
      var lowClass = String(f.className || className).toLowerCase();
      /* A class-scoped entry wins over the generic one: Channel Divinity is a
         different number of uses for a cleric and a paladin. */
      var e = EFFECTS[key + '|' + lowClass.split(' ')[0]] || EFFECTS[key];

      /* Nothing hand-written for this one: try reading an action straight out
         of its printed text. Only attacks and saving-throw effects are written
         predictably enough to be worth it, and featuretext only answers when
         every part was found - so most features still fall through to their
         prose, which is the honest outcome. */
      if (!e || (!e.actions && !e.resource)) {
        /* The actor's feature list carries a name and a level, not the prose,
           so fetch the source record before trying to read anything out of it. */
        var rec = (VT.charbuild && VT.charbuild.featureRecord)
          ? VT.charbuild.featureRecord(f, f.className || className) : null;
        var read = rec && VT.featureText && VT.featureText.toAction(rec, {
          level: lvl(actor),
          prof: VT.actor.prof(actor),
          abilities: actor.abilities,
          castAbility: actor.castAbility,
          saveDC: actor.spellDC,
          classDC: classSaveDC(actor, f.className || className)
        });
        if (read && !featureActions.some(function (x) { return x.name === read.name; })) {
          featureActions.push(read);
          if (!notes[f.name]) {
            notes[f.name] = 'Read from the printed text and added to your actions.';
          }
          derivedCount++;
        }
      }

      if (!e) return;
      if (e.cls && lowClass.indexOf(e.cls) < 0) return;

      /* A note is what the sheet shows under the feature AND how it knows to
         mark it 'applied'. Anything that grants a resource or an action is
         just as applied as something with hand-written prose, so say so rather
         than letting the sheet undercount its own work. */
      var did = [];
      if (e.note) notes[f.name] = e.note;

      if (e.resource) {
        var r = e.resource(actor);
        if (r && !seenResource[r.key]) {
          seenResource[r.key] = 1;
          resources.push({ key: r.key, name: r.name, max: r.max, per: r.per, used: 0 });
          did.push('tracked as a resource: ' + r.name + ' (' + r.max + ', per ' + r.per + ' rest)');
        }
      }
      if (e.actions) {
        var made = (e.actions(actor) || []);
        made.forEach(function (act) { featureActions.push(act); });
        if (made.length) {
          did.push('added to your actions: ' + made.map(function (x) { return x.name; }).join(', '));
        }
      }
      if (did.length && !notes[f.name]) notes[f.name] = U.cap(did.join('; '));
      if (e.expertise) actor.expertiseSlots += e.expertise;
      if (e.jackOfAllTrades) actor.jackOfAllTrades = true;
      if (e.saveBonusAll) actor.saveBonusAll = Math.max(actor.saveBonusAll, e.saveBonusAll(actor));
      if (e.speedBonus) actor.speedBonus = Math.max(actor.speedBonus, e.speedBonus(actor));
      if (e.acFormula && !actor.armorName) {
        var ac = e.acFormula(actor, className) + (actor.shield ? 2 : 0);
        if (ac > actor.ac) {
          actor.ac = ac;
          actor.acNote = 'Unarmored Defense';
          actor.acWhy = 'Unarmored Defense: 10' + U.sign(mod(actor, 'dex')) + ' DEX' +
            U.sign(mod(actor, /monk/i.test(className || '') ? 'wis' : 'con')) +
            (/monk/i.test(className || '') ? ' WIS' : ' CON') +
            (actor.shield ? ' +2 shield' : '');
        } else {
          /* It applies, it is just not an improvement - which happens when the
             ability scores behind it are low. Say so, rather than leaving the
             feature looking as though it was ignored. */
          actor.acNote = null;
          actor.acWhyAlt = 'Unarmored Defense would give ' + ac + ', so plain AC is used instead.';
        }
      }
    });

    /* Carry forward how much of each resource is already spent. */
    var prior = {};
    (actor.resources || []).forEach(function (r) { prior[r.key] = r.used; });
    resources.forEach(function (r) { r.used = Math.min(prior[r.key] || 0, r.max); });
    actor.resources = resources;

    /* Spell slots are their own resource. One class reads its own table; two or
       more contribute to a single combined caster level, with the warlock's
       pact slots kept separate because they come back on a short rest. */
    var multi = (actor.classes || []).length > 1;
    actor.pactSlots = null;
    if (multi && VT.multiclass) {
      var sc = VT.multiclass.spellcasting(actor.classes);
      actor.spellSlots = sc.slots;
      if (sc.pact) actor.pactSlots = { count: sc.pact.count, slotLevel: sc.pact.slotLevel };
      actor.casterLevel = sc.casterLevel;
    } else {
      var prog = choices.cls && choices.cls.casterProgression;
      if (!prog && (actor.classes || []).length === 1 && VT.choices) {
        var rec = VT.choices.classRecord(actor.classes[0]);
        prog = rec && rec.casterProgression;
        if (!prog) {
          var sub = VT.choices.subclassRecord(actor.classes[0]);
          prog = sub && sub.casterProgression;
        }
      }
      actor.spellSlots = prog ? slotsFor(prog, actor.level) : null;
      if (actor.spellSlots && actor.spellSlots.pact) {
        actor.pactSlots = { count: actor.spellSlots.count, slotLevel: actor.spellSlots.slotLevel };
      }
    }
    if (actor.spellSlots) {
      var priorSlots = actor.slotsUsed || {};
      actor.slotsUsed = {};
      if (actor.spellSlots.pact) {
        actor.slotsUsed.pact = Math.min(priorSlots.pact || 0, actor.spellSlots.count);
      } else {
        actor.spellSlots.slots.forEach(function (n, i) {
          actor.slotsUsed[i + 1] = Math.min(priorSlots[i + 1] || 0, n);
        });
      }
    } else {
      actor.slotsUsed = {};
    }

    /* Speed is RECOMPUTED from the base rather than adjusted in place. This
       pass runs again every time armour is put on or taken off, and adding the
       bonus to whatever was already there compounded it every time - a
       barbarian who equipped and unequipped plate twice ended up at zero. */
    if (actor.baseSpeed == null) actor.baseSpeed = actor.speed || 30;
    var drag = VT.gear ? VT.gear.speedPenalty(actor) : 0;
    actor.speed = Math.max(0, actor.baseSpeed + (actor.speedBonus || 0) - drag);
    actor.speedNote = drag ? 'slowed 10 ft by armour' : null;

    /* Feature actions go in after gear and spells, and never duplicate. */
    var have = {};
    (actor.actions || []).forEach(function (x) { have[String(x.name).toLowerCase()] = 1; });
    featureActions.forEach(function (act) {
      if (have[String(act.name).toLowerCase()]) return;
      have[String(act.name).toLowerCase()] = 1;
      actor.actions.push(act);
    });

    /* A later feature may improve an earlier one's die - the Stars druid's
       Twinkling Constellations does exactly this to the Archer and the Chalice.
       Applied after every action exists, so order in the feature list does not
       matter. */
    if (VT.featureText && VT.featureText.upgrades) {
      (actor.features || []).forEach(function (f) {
        var rec = (VT.charbuild && VT.charbuild.featureRecord)
          ? VT.charbuild.featureRecord(f, f.className || className) : null;
        if (!rec) return;
        VT.featureText.upgrades(VT.featureText.textOf(rec)).forEach(function (up) {
          featureActions.forEach(function (act) {
            if (VT.featureText.applyUpgrade(act, up)) {
              notes[f.name] = notes[f.name] ||
                ('Upgraded ' + act.name + ' to ' + up.to + '.');
            }
          });
        });
      });
    }

    actor.featureNotes = notes;
    actor.derivedActionCount = derivedCount;
    actor.expertise = (choices.expertise || actor.expertise || [])
      .slice(0, actor.expertiseSlots);
    return actor;
  }

  /* ---- derived numbers the sheet asks for ------------------------------- */
  function skillMod(actor, skill) {
    var abil = SRD.SKILL_ABILITY[skill];
    var base = VT.actor.abilityMod(actor, abil);
    var prof = VT.actor.prof(actor);
    if ((actor.expertise || []).indexOf(skill) >= 0) return base + prof * 2;
    if ((actor.skillProf || []).indexOf(skill) >= 0) return base + prof;
    if (actor.jackOfAllTrades) return base + Math.floor(prof / 2);
    return base;
  }

  function skillSource(actor, skill) {
    if ((actor.expertise || []).indexOf(skill) >= 0) return 'expertise';
    if ((actor.skillProf || []).indexOf(skill) >= 0) return 'proficient';
    if (actor.jackOfAllTrades) return 'jack of all trades';
    return '';
  }

  function saveMod(actor, ability) {
    return VT.actor.saveMod(actor, ability) + (actor.saveBonusAll || 0);
  }

  /* ---- resources -------------------------------------------------------- */
  function spend(actor, key, n) {
    var r = (actor.resources || []).find(function (x) { return x.key === key; });
    if (!r) return false;
    n = n == null ? 1 : n;
    if (r.used + n > r.max) return false;
    r.used += n;
    return true;
  }
  function restore(actor, key, n) {
    var r = (actor.resources || []).find(function (x) { return x.key === key; });
    if (!r) return false;
    r.used = Math.max(0, r.used - (n == null ? 1 : n));
    return true;
  }
  /* kind: 'short' | 'long'. A long rest restores everything. */
  function rest(actor, kind) {
    (actor.resources || []).forEach(function (r) {
      if (kind === 'long' || r.per === 'short') r.used = 0;
    });
    if (kind === 'long') { actor.slotsUsed = {}; return; }
    /* Pact magic - and only pact magic - returns on a short rest. For a warlock
       multiclass that means the pact pool refills while the ordinary slots do
       not, so clear that one key rather than the whole record. */
    if (actor.pactSlots || (actor.spellSlots && actor.spellSlots.pact)) {
      actor.slotsUsed = actor.slotsUsed || {};
      actor.slotsUsed.pact = 0;
    }
  }

  function slotsLeft(actor, level) {
    var used = actor.slotsUsed || {};
    /* level omitted, or a pure warlock: the pact pool. */
    if (level == null || (actor.spellSlots && actor.spellSlots.pact)) {
      var p = actor.pactSlots ||
        (actor.spellSlots && actor.spellSlots.pact ? actor.spellSlots : null);
      return p ? p.count - (used.pact || 0) : 0;
    }
    if (!actor.spellSlots || !actor.spellSlots.slots) return 0;
    var max = actor.spellSlots.slots[level - 1] || 0;
    return max - (used[level] || 0);
  }

  function pactLeft(actor) {
    if (!actor.pactSlots) return 0;
    return actor.pactSlots.count - ((actor.slotsUsed || {}).pact || 0);
  }

  VT.features = {
    EFFECTS: EFFECTS, apply: apply, slotsFor: slotsFor,
    casterLevels: casterLevels, slotsForCasterLevel: slotsForCasterLevel,
    skillMod: skillMod, skillSource: skillSource, saveMod: saveMod,
    spend: spend, restore: restore, rest: rest, slotsLeft: slotsLeft, pactLeft: pactLeft,
    bardicDie: bardicDie, martialArtsDie: martialArtsDie, sneakDice: sneakDice,
    covered: Object.keys(EFFECTS).length
  };
})();

/* ===== src/data/featuretext.js ===== */
/* Virtual Tactics :: data/featuretext.js
   Reading rollable actions out of the printed text of a class feature.

   features.js is a curated table: hand-written mechanics for the features worth
   the effort. It says, correctly, that no amount of parsing will reliably turn
   English into arbitrary game effects - you cannot read "you gain expertise in
   two skills of your choice" out of prose and be sure of it.

   But two shapes are not arbitrary. Attacks and saving-throw effects are
   written to a house style that barely varies across twenty years of books:

     "a ranged spell attack with a range of 30 feet ... you add your Dexterity
      modifier to its attack and damage rolls ... its damage is radiant, and
      its damage die is a d4"

     "each creature in that area must make a Dexterity saving throw, taking
      3d6 fire damage on a failed save"

   Everything needed for a clickable action is stated outright: what kind of
   attack, the range, which ability, the die, the damage type. So this reads
   those two shapes and nothing else.

   The rule it works to is: produce an action only when every part was found in
   the text, and otherwise produce nothing. A missing action is a feature you
   read and apply yourself, which is where you already were. A wrong one is a
   character sheet that lies to you, which is worse than useless - so every
   extraction here is all-or-nothing, and anything it emits is tagged `derived`
   so the sheet can say where it came from. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  var ABILITY_WORD = {
    strength: 'str', dexterity: 'dex', constitution: 'con',
    intelligence: 'int', wisdom: 'wis', charisma: 'cha'
  };

  var DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning',
    'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];

  /* Feature entries nest: strings, {entries:[...]}, lists, tables. Flatten to
     one string, keeping the inline tags intact - the damage tags are the most
     reliable thing in the whole record and must survive. */
  function flatten(node, out) {
    out = out || [];
    if (node == null) return out;
    if (typeof node === 'string') { out.push(node); return out; }
    if (Array.isArray(node)) { node.forEach(function (n) { flatten(n, out); }); return out; }
    if (typeof node === 'object') {
      if (node.name) out.push(node.name);
      flatten(node.entries || node.items || node.rows || [], out);
    }
    return out;
  }

  function textOf(feature) {
    return flatten(feature && feature.entries).join(' ').replace(/\s+/g, ' ');
  }

  /* "{@damage 2d6}" / "{@dice d4}" / a bare "3d8".

     The first usable die wins - the first damage a feature mentions is the
     damage it deals, and later ones are nearly always an upgrade table or a
     secondary rider. "Usable" is doing real work there: a d20 is skipped and
     the scan continues, because a feature that rolls 1d20 on a table and then
     deals 2d6 must not come out as a 1d20 attack. */
  function firstDie(text) {
    var tag = text.match(/\{@(?:damage|dice|scaledamage|scaledice)\s+([^}|]+)/i);
    if (tag) {
      var inner = tag[1].trim();
      var m = inner.match(/\d*d\d+(?:\s*[+-]\s*\d+)?/i);
      if (m) { var tagged = normaliseDie(m[0]); if (tagged) return tagged; }
    }
    var all = text.match(/\b\d*d\d+\b/gi) || [];
    for (var i = 0; i < all.length; i++) {
      var d = normaliseDie(all[i]);
      if (d) return d;
    }
    return null;
  }

  function normaliseDie(d) {
    d = String(d).replace(/\s+/g, '');
    d = /^d/i.test(d) ? '1' + d : d;         /* "d4" is one d4 */
    /* A d20 or d100 is a table roll, never damage. "Tales from Beyond" rolls
       1d20 to pick which effect you get, and reading that as damage produces a
       weapon that hits for 1d20 fire - confidently, and completely wrong. */
    var faces = parseInt((d.match(/d(\d+)/i) || [])[1], 10);
    if (faces === 20 || faces === 100) return null;
    return d;
  }

  /* Which damage type this feature deals, or null when the text does not make
     that unambiguous.

     The trap is that damage words appear in text for reasons other than the
     damage being dealt - "resistance to bludgeoning, piercing, and slashing"
     is the common one, and picking the first word out of that list invents an
     attack that deals slashing damage. So the evidence is ranked, and a list
     of several types is treated as no answer at all rather than a menu to
     choose from. */
  function damageType(text) {
    /* strongest: the feature says outright what its damage is */
    var m = text.match(/damage(?:\s+type)?\s+is\s+([a-z]+)/i);
    if (m && DAMAGE_TYPES.indexOf(m[1].toLowerCase()) >= 0) return m[1].toLowerCase();

    /* strong: the type sits directly against a die - "takes 3d6 fire damage" */
    m = text.match(/\b\d*d\d+\s+([a-z]+)\s+damage\b/i);
    if (m && DAMAGE_TYPES.indexOf(m[1].toLowerCase()) >= 0) return m[1].toLowerCase();

    /* weakest: "<type> damage" somewhere in the prose.

       Two separate traps, needing two separate rules.

       The word must be the noun, not the verb: "you can force it to make a
       Wisdom saving throw" is not force damage. So the match requires "damage"
       right after it.

       But adjacency alone is not enough either, because a list ends with one:
       "Bludgeoning, Piercing, or Slashing damage" satisfies it exactly once,
       for Slashing, and turns a damage-reduction reaction into a slashing
       attack. So the abstain check counts the type words themselves, wherever
       they appear - more than one distinct type anywhere means the text is
       listing or offering a choice, and there is no way to tell from here
       which one this feature actually deals. */
    var named = DAMAGE_TYPES.filter(function (t) {
      return new RegExp('\\b' + t + '\\b', 'i').test(text);
    });
    if (named.length !== 1) return null;

    var t0 = named[0];
    return new RegExp('\\b' + t0 + '\\s+damage\\b', 'i').test(text) ? t0 : null;
  }

  /* Which ability feeds the roll. Both phrasings are common and mean the same
     thing - "you add your Dexterity modifier to its attack and damage rolls",
     and "radiant damage equal to 1d8 + your Wisdom modifier". */
  function statedAbility(text) {
    var m = text.match(/add your ([A-Za-z]+) modifier/i)
         || text.match(/\+\s*your ([A-Za-z]+) modifier/i);
    if (m && ABILITY_WORD[m[1].toLowerCase()]) return ABILITY_WORD[m[1].toLowerCase()];
    return null;
  }

  /* How far it reaches. "a range of 30 feet" is the formal phrasing; "targets
     one creature within 60 feet of you" is the one the books actually use most
     of the time, and missing it was silently costing every feature written that
     way - the Circle of the Stars Archer among them. */
  function statedRange(text) {
    var m = text.match(/range of (\d+)\s*(?:feet|ft)/i)
         || text.match(/within (\d+)\s*(?:feet|ft)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function statedReach(text) {
    var m = text.match(/reach of (\d+)\s*(?:feet|ft)/i);
    return m ? parseInt(m[1], 10) : null;
  }

  /* Some features say their die follows a class table rather than printing it.
     Only the Martial Arts column is common enough to be worth resolving, and
     features.js already owns that progression. */
  function tableDie(text, ctx) {
    if (/Martial Arts (?:column|die|table)/i.test(text) && VT.features && VT.features.martialArtsDie) {
      return VT.features.martialArtsDie(ctx.level || 1);
    }
    return null;
  }

  /* ---- the two shapes ---------------------------------------------------- */

  function asAttack(feature, ctx, text) {
    var atk = text.match(/\b(ranged|melee)\s+(spell\s+)?attack\b/i);
    if (!atk) return null;

    var die = tableDie(text, ctx) || firstDie(text);
    if (!die) return null;

    var type = damageType(text);
    if (!type) return null;

    var ability = statedAbility(text) || ctx.castAbility || 'dex';
    var abilityMod = SRD.mod((ctx.abilities || {})[ability] || 10);
    var ranged = /ranged/i.test(atk[1]);
    var reach = statedReach(text);
    var range = statedRange(text);
    if (ranged && !range) return null;              /* a ranged attack needs a range */

    var act = {
      name: feature.name,
      kind: ranged ? 'ranged' : 'melee',
      toHit: (ctx.prof || 2) + abilityMod,
      dmg: die + (abilityMod ? U.sign(abilityMod) : ''),
      dmgType: type,
      cost: 'action',
      fromFeature: true,
      derived: true,
      desc: 'Read from the feature text: ' + (ranged ? range + ' ft range' : (reach || 5) + ' ft reach') +
            ', ' + ability.toUpperCase() + ' to hit and damage.'
    };
    if (ranged) act.range = [range, range];
    else act.reach = reach || 5;
    return act;
  }

  function asSave(feature, ctx, text) {
    var sv = text.match(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw\b/i);
    if (!sv) return null;

    var die = tableDie(text, ctx) || firstDie(text);
    if (!die) return null;

    var type = damageType(text);
    if (!type) return null;

    /* Where the DC comes from, in the order the text itself settles it.

       Most features say "against your spell save DC" outright. A few name a
       class DC instead - the monk's Ki save DC - and some, like Searing
       Sunburst, name none at all because the class table already did. So a
       class DC is accepted as the fallback where the rules define one, and
       anything left over is refused: a wrong DC is worse than no action. */
    var dc = /spell save DC/i.test(text) ? (ctx.saveDC || ctx.classDC)
           : (ctx.classDC || ctx.saveDC);
    if (!dc) return null;

    return {
      name: feature.name,
      kind: 'save',
      save: ABILITY_WORD[sv[1].toLowerCase()],
      dc: dc,
      dmg: die,
      dmgType: type,
      half: /half as much damage|half damage/i.test(text),
      range: [0, statedRange(text) || 30],
      cost: 'action',
      fromFeature: true,
      derived: true,
      desc: 'Read from the feature text: ' + sv[1] + ' save against DC ' + dc +
            (/half as much damage|half damage/i.test(text) ? ', half on a success.' : '.')
    };
  }

  /* Healing. Narrower than the other two on purpose: the die has to sit
     directly against the words that spend it, because "hit points" appears in
     half the features in the game and a feature that merely mentions them is
     not a heal. */
  function asHeal(feature, ctx, text) {
    var m = text.match(/(?:regains?|restores?)\s+(?:a number of\s+)?(?:hit points|Hit Points)[^.]{0,30}?equal to[^.]{0,20}?(\d*d\d+)/i);
    if (!m) return null;
    var die = normaliseDie(m[1]);
    if (!die) return null;

    var ability = statedAbility(text);
    var abilityMod = ability ? SRD.mod((ctx.abilities || {})[ability] || 10) : 0;

    return {
      name: feature.name,
      kind: 'heal',
      dmg: die + (abilityMod ? U.sign(abilityMod) : ''),
      range: [0, statedRange(text) || 0],
      cost: 'action',
      fromFeature: true,
      derived: true,
      desc: 'Read from the feature text: restores ' + die +
            (ability ? ' + ' + ability.toUpperCase() : '') + ' hit points.'
    };
  }

  /* One feature in, zero or one action out. */
  /* A die that feeds temporary hit points, healing, or a table roll is not
     damage. When the only die in the text is spoken for like that, there is
     nothing to build an attack out of. */
  function dieIsNotDamage(text, die) {
    if (!die) return true;
    var faces = die.replace(/^\d+/, '');
    var pattern = '\\b\\d*' + faces + '\\b[^.]{0,40}?(temporary hit points|hit points back|regains?)';
    if (new RegExp(pattern, 'i').test(text)) return true;
    return false;
  }

  /* Some records are containers: "Psionic Disciplines" is every discipline in
     the book under one name, "Eldritch Invocations" likewise. Reading a single
     attack out of a list of thirty abilities picks an arbitrary one and labels
     it with the container's name, which is worse than saying nothing. Length is
     a crude signal but a reliable one - a single feature that grants an attack
     is a paragraph, not a chapter. */
  var CONTAINER_CHARS = 1500;

  function toAction(feature, ctx) {
    if (!feature || !feature.name) return null;
    var text = textOf(feature);
    if (!text) return null;
    if (text.length > CONTAINER_CHARS) return null;
    ctx = ctx || {};
    var act = asAttack(feature, ctx, text) || asSave(feature, ctx, text) ||
              asHeal(feature, ctx, text);
    if (!act) return null;
    if (dieIsNotDamage(text, (act.dmg || '').match(/\d*d\d+/) && (act.dmg.match(/\d*d\d+/) || [])[0])) {
      return null;
    }
    return act;
  }

  /* Later features that improve earlier ones.

     "The {@damage 1d8} of the Archer and the Chalice becomes {@damage 2d8}" is
     a whole sentence naming the features it upgrades, the die it replaces and
     the die it replaces it with. That is enough to apply without guessing, and
     without it a 10th-level Stars druid is shown 1d8 for an attack that has
     dealt 2d8 since they levelled - the sheet being confidently out of date,
     which is the failure mode this whole file exists to avoid.

     Only this one sentence shape is read. Anything vaguer is left alone. */
  function upgrades(text) {
    var out = [];
    var re = /the \{@(?:damage|dice)\s+([^}|]+)\}[^.]{0,80}?\bof the ([^.]{0,80}?)\bbecomes \{@(?:damage|dice)\s+([^}|]+)\}/gi;
    var m;
    while ((m = re.exec(text)) !== null) {
      var names = m[2].split(/\s*(?:,|and)\s*/i)
        .map(function (n) { return n.replace(/^the\s+/i, '').trim(); })
        .filter(Boolean);
      if (!names.length) continue;
      out.push({ names: names, from: normaliseDie(m[1]), to: normaliseDie(m[3]) });
    }
    return out;
  }

  /* Rewrite an action's die in place when an upgrade names it. */
  function applyUpgrade(act, up) {
    if (!act || !up || !up.from || !up.to) return false;
    var named = up.names.some(function (n) {
      return String(act.name).toLowerCase() === n.toLowerCase();
    });
    if (!named) return false;
    if (String(act.dmg).indexOf(up.from) !== 0) return false;
    act.dmg = up.to + String(act.dmg).slice(up.from.length);
    return true;
  }

  VT.featureText = {
    toAction: toAction,
    upgrades: upgrades, applyUpgrade: applyUpgrade,
    textOf: textOf,
    /* exposed for the tests that keep this honest */
    firstDie: firstDie, damageType: damageType, statedAbility: statedAbility
  };
})();

/* ===== src/data/wildshape.js ===== */
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

/* ===== src/data/companion.js ===== */
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

/* ===== src/data/summon.js ===== */
/* Virtual Tactics :: data/summon.js
   Spells that put a creature on the board.

   Same idea as Wild Shape and the ranger's companion - a separate stat block
   beside the sheet - but summons need two things those do not: the spell can be
   cast at different levels, and most of them offer a choice of shape.

   The data links the two halves cleanly. A creature carries the spell that
   makes it:

     summonedBySpell: "Summon Beast|TCE",  summonedBySpellLevel: 2

   and everything that varies is written in the stat block as English, in a
   shape that is the same across all two dozen of them:

     ac: "11 + the level of the spell (natural armor)"
     hp: "20 (Air only) or 30 (Land and Water only) + 5 for each spell level above 2nd"
     Maul: "{@hitYourSpellAttack} to hit ... {@damage 1d8 + 4 + summonSpellLevel}"
     traits: "Flyby (Air Only)", "Pack Tactics (Land and Water Only)"

   So the choice is not a separate stat block per form - it is those "(X Only)"
   tags, and choosing a form means keeping the lines that match it. That is why
   this is one implementation rather than twenty-four special cases. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* ---- finding them ------------------------------------------------------ */

  /* Every creature in the data that some spell summons, keyed by spell name. */
  function bySpell() {
    var FT = VT.fivetools;
    if (!FT || !FT.get) return {};
    var out = {};
    (FT.get('creature') || []).forEach(function (m) {
      if (!m.summonedBySpell) return;
      var name = String(m.summonedBySpell).split('|')[0].toLowerCase();
      /* keep the first, but prefer one whose source matches the spell's */
      if (!out[name]) out[name] = m;
    });
    return out;
  }

  /* The summon spells this character actually has, paired with their block. */
  function available(actor) {
    var map = bySpell();
    var seen = {};
    return (actor.actions || []).filter(function (act) {
      return act.spellLevel != null;
    }).map(function (act) {
      var mon = map[String(act.name).toLowerCase()];
      if (!mon || seen[act.name]) return null;
      seen[act.name] = 1;
      return { spell: act.name, minLevel: act.spellLevel || mon.summonedBySpellLevel || 1, mon: mon };
    }).filter(Boolean);
  }

  /* ---- the "(X Only)" tags ----------------------------------------------- */

  /* "Pack Tactics (Land and Water Only)" -> ['land','water'] */
  function tagsIn(text) {
    var m = String(text || '').match(/\(([^)]*?)\s+only\)/i);
    if (!m) return null;
    /* Word-boundaried "and", not a bare one: splitting on a bare "and" cuts
       the word "Land" into "L" and "", so the Land form never matched and
       every Land summon silently got the wrong hit points. */
    return m[1].split(/\s*(?:,|\band\b)\s*/i)
      .map(function (x) { return x.trim().toLowerCase(); })
      .filter(Boolean);
  }

  function keepsFor(text, form) {
    var tags = tagsIn(text);
    if (!tags) return true;                       /* untagged applies always */
    return !form || tags.indexOf(String(form).toLowerCase()) >= 0;
  }

  function stripTag(text) {
    return String(text || '').replace(/\s*\([^)]*?\s+only\)/i, '').trim();
  }

  /* Every form this block offers, in the order the book mentions them. */
  function forms(mon) {
    var found = [], seen = {};
    function scan(text) {
      (tagsIn(text) || []).forEach(function (t) {
        if (seen[t]) return;
        seen[t] = 1; found.push(t);
      });
    }
    scan(mon.hp && mon.hp.special);
    (mon.trait || []).forEach(function (t) { scan(t.name); });
    (mon.action || []).forEach(function (t) { scan(t.name); });
    Object.keys(mon.speed || {}).forEach(function (k) {
      var v = mon.speed[k];
      if (v && v.condition) scan(v.condition);
    });
    return found.map(function (f) { return U.cap(f); });
  }

  /* ---- resolving the numbers --------------------------------------------- */

  /* "11 + the level of the spell (natural armor)" */
  function acAt(mon, level) {
    var entry = Array.isArray(mon.ac) ? mon.ac[0] : mon.ac;
    var text = entry && entry.special;
    if (!text) return null;
    var m = String(text).match(/(\d+)\s*\+\s*the level of the spell/i);
    return m ? parseInt(m[1], 10) + level : null;
  }

  /* "20 (Air only) or 30 (Land and Water only) + 5 for each spell level above 2nd"
     and the simpler "30 + 10 for each spell level above 3rd". */
  function hpAt(mon, level, form) {
    var text = mon.hp && mon.hp.special;
    if (!text) return null;
    text = String(text);

    var per = 0, from = mon.summonedBySpellLevel || 1;
    var scale = text.match(/\+\s*(\d+)\s*for each spell level above\s*(\d+)/i);
    if (scale) { per = parseInt(scale[1], 10); from = parseInt(scale[2], 10); }

    var head = scale ? text.slice(0, scale.index) : text;
    var base = null;
    var branch = /(\d+)\s*\(([^)]*?)\s+only\)/gi, b;
    var fallback = null;
    while ((b = branch.exec(head)) !== null) {
      var n = parseInt(b[1], 10);
      if (fallback == null) fallback = n;
      var tags = b[2].split(/\s*(?:,|\band\b)\s*/i)
        .map(function (x) { return x.trim().toLowerCase(); });
      if (form && tags.indexOf(String(form).toLowerCase()) >= 0) { base = n; break; }
    }
    if (base == null) {
      var plain = head.match(/(\d+)/);
      base = fallback != null ? fallback : (plain ? parseInt(plain[1], 10) : null);
    }
    if (base == null) return null;
    return base + Math.max(0, level - from) * per;
  }

  /* ---- building the block ------------------------------------------------ */

  function conjure(mon, level, form, caster) {
    var block = VT.convert.creature(mon, { team: 'party' });
    var prof = VT.actor.prof(caster);
    var spellAtk = caster.spellAttack != null
      ? caster.spellAttack : prof + VT.actor.abilityMod(caster, 'wis');
    var warnings = [];

    var ac = acAt(mon, level);
    var hp = hpAt(mon, level, form);
    if (ac) block.ac = ac; else warnings.push('AC could not be read from the stat block.');
    if (hp) { block.hpMax = hp; block.hp = hp; }
    else warnings.push('Hit points could not be read from the stat block.');

    /* Speeds that belong to another form are not this creature's. */
    var speeds = {};
    Object.keys(mon.speed || {}).forEach(function (k) {
      var v = mon.speed[k];
      var cond = v && v.condition;
      if (cond && !keepsFor(cond, form)) return;
      speeds[k] = typeof v === 'number' ? v : v.number;
    });
    if (speeds.walk != null) block.speed = speeds.walk;

    /* Keep only the lines this form has, and resolve the two tokens the
       converter cannot: the caster's attack bonus and the spell's level. */
    var actions = (block.actions || [])
      .filter(function (act) { return keepsFor(act.name, form); })
      .map(function (act) {
        var a = U.clone(act);
        a.name = stripTag(a.name);
        var raw = a.dmgRaw || a.dmg || '';
        if (/summonSpellLevel/i.test(raw)) {
          a.dmg = String(raw).replace(/summonSpellLevel/gi, String(level))
            /* two damage tags run together produce "5++ 1d6" */
            .replace(/\+\s*\+/g, '+')
            .replace(/\s+/g, ' ')
            .trim();
          delete a.variable;
        }
        if (/spell attack modifier/i.test(a.desc || '')) {
          a.kind = /ranged/i.test(a.desc || '') ? 'ranged' : 'melee';
          a.toHit = spellAtk;
          if (!a.range) a.range = a.kind === 'ranged' ? [60, 60] : [5, 5];
        }
        /* "attacks equal to half this spell's level (rounded down)" */
        if (/half this spell's level/i.test(a.desc || '')) {
          a.desc = a.desc.replace(/a number of attacks equal to half this spell's level[^.]*/i,
            Math.max(1, Math.floor(level / 2)) + ' attacks');
        }
        return a;
      });

    var traits = (mon.trait || [])
      .filter(function (t) { return keepsFor(t.name, form); })
      .map(function (t) { return stripTag(t.name); });

    return {
      name: block.name + (form ? ' (' + U.cap(form) + ')' : ''),
      spell: String(mon.summonedBySpell || '').split('|')[0],
      form: form || null,
      level: level,
      source: block.source || null,
      size: block.size || 'medium',
      ac: block.ac,
      hp: block.hp,
      hpMax: block.hpMax,
      speed: block.speed,
      speeds: speeds,
      abilities: block.abilities,
      actions: actions,
      traits: traits,
      senses: block.senses || '',
      warnings: warnings,
      at: Date.now()
    };
  }

  VT.summon = {
    available: available, forms: forms, conjure: conjure,
    acAt: acAt, hpAt: hpAt, tagsIn: tagsIn
  };
})();

/* ===== src/data/shops.js ===== */
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

/* ===== src/data/loot.js ===== */
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

/* ===== src/data/choices.js ===== */
/* Virtual Tactics :: data/choices.js
   The class choice tree.

   Most of what a character "picks" IS machine-readable in 5etools, which is a
   happier story than the feature text. Four fields carry it:

     class.optionalfeatureProgression   fighting styles, invocations, metamagic,
     subclass.optionalfeatureProgression   maneuvers, infusions, runes, arcane
                                        shots, elemental disciplines, pact boons
     class.featProgression              2024 only: fighting-style feats at 1st,
                                        epic boons at 19th
     class.classFeatures[].gainSubclassFeature   the level a subclass is chosen
     class.startingProficiencies.skills[].choose  skill proficiencies
     class.classTableGroups             cantrips known, prepared spells

   Everything those fields point at is a real record - an `optionalfeature` with
   a `featureType` like "EI" or "MV:B", or a `feat` with a `category` like "FS".
   So this module is a reader, not a table: adding a book adds its options with
   no code change.

   Ability Score Improvements stay where they were (charbuild.asiStatus), since
   they predate all of this and already work.

   What is NOT modelled, and is listed as prose instead: anything a feature
   grants in its own text without a structured field behind it - a Circle of the
   Land's terrain, a warlock patron's expanded list, choose-your-damage-type
   features. Those show their printed text and a place to write the answer down. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  /* The books the user asked us to cover properly, plus the 2014 PHB because a
     2014 class needs 2014 options. Widened by the UI on request. */
  var CORE_SOURCES = ['XPHB', 'PHB', 'XGE', 'TCE', 'SRD', 'SRD52'];

  /* featureType codes, for labels the data does not give us. */
  var TYPE_LABEL = {
    'EI': 'Eldritch Invocation', 'MM': 'Metamagic', 'MV:B': 'Maneuver',
    'AI': 'Infusion', 'AS': 'Arcane Shot', 'ED': 'Elemental Discipline',
    'RN': 'Rune', 'PB': 'Pact Boon', 'FS:F': 'Fighting Style',
    'FS:R': 'Fighting Style', 'FS:P': 'Fighting Style', 'FS:B': 'Fighting Style',
    'MV': 'Maneuver', 'RP': 'Rune'
  };
  var CATEGORY_LABEL = {
    'FS': 'Fighting Style', 'EB': 'Epic Boon', 'G': 'Feat',
    'O': 'Origin Feat', 'FS:P': 'Fighting Style', 'FS:R': 'Fighting Style'
  };

  function low(v) { return String(v == null ? '' : v).toLowerCase(); }
  function FT() { return VT.fivetools; }

  /* A progression is either an object keyed by level ({"3": 2, "10": 3}) or a
     flat 20-entry array. Both mean "how many do you have AT this level", not
     "how many do you gain", so the answer is the highest key at or below it. */
  function countAt(progression, level) {
    if (!progression) return 0;
    if (Array.isArray(progression)) return progression[U.clamp(level, 1, 20) - 1] || 0;
    var best = 0;
    Object.keys(progression).forEach(function (k) {
      var lv = parseInt(k, 10);
      if (lv <= level) best = Math.max(best, progression[k] | 0);
    });
    return best;
  }

  /* ==== the class list =================================================== */
  /* Characters used to have one class. build.classes is the multiclass shape;
     build.cls is the old single-class one. Read both, write the new. */
  function classList(build) {
    if (!build) return [];
    if (build.classes && build.classes.length) return build.classes;
    if (build.cls) {
      return [{ name: build.cls.name, source: build.cls.source || null,
                subclass: build.subclass
                  ? { name: build.subclass.name, source: build.subclass.source || null } : null,
                level: build.level || 1 }];
    }
    return [];
  }

  function totalLevel(build) {
    return classList(build).reduce(function (n, c) { return n + (c.level || 0); }, 0);
  }

  function classRecord(entry) {
    if (!entry || !FT().loaded) return null;
    var hits = FT().get('class').filter(function (c) {
      return low(c.name) === low(entry.name) &&
        (!entry.source || low(c.source) === low(entry.source));
    });
    return hits[0] || null;
  }

  function subclassRecord(entry) {
    if (!entry || !entry.subclass || !FT().loaded) return null;
    var hits = FT().get('subclass').filter(function (s) {
      return low(s.name) === low(entry.subclass.name) &&
        low(s.className) === low(entry.name) &&
        (!entry.subclass.source || low(s.source) === low(entry.subclass.source));
    });
    return hits[0] || null;
  }

  /* The level at which this class picks its subclass. */
  function subclassLevel(clsRec) {
    if (!clsRec) return 3;
    var found = null;
    (clsRec.classFeatures || []).forEach(function (f) {
      if (found) return;
      if (f && typeof f === 'object' && f.gainSubclassFeature && f.classFeature) {
        var lv = parseInt(String(f.classFeature).split('|').pop(), 10);
        if (lv) found = lv;
      }
    });
    return found || 3;
  }

  /* ==== building the list of pending choices ============================= */
  /* Returns one entry per choice a character is owed or has made, in the order
     they come up. `have` is what is already picked; `count` is how many the
     class table says they get. count > have.length means something is unspent. */
  function pending(build) {
    var out = [];
    if (!build) return out;
    var picks = build.picks || {};
    classList(build).forEach(function (entry, ci) {
      var rec = classRecord(entry);
      var sub = subclassRecord(entry);
      var lv = entry.level || 1;
      var tag = low(entry.name) + '|' + low(entry.source || '') + '|' + ci;

      /* --- subclass --- */
      if (rec) {
        var scLv = subclassLevel(rec);
        if (lv >= scLv) {
          out.push({
            key: tag + ':subclass', kind: 'subclass', ci: ci, entry: entry,
            label: rec.subclassTitle || 'Subclass', level: scLv, count: 1,
            picked: entry.subclass ? [entry.subclass] : [],
            className: entry.name, classSource: entry.source
          });
        }
      }

      /* --- skills --- */
      /* The class you started as gives its full list; a class taken later gives
         the shorter multiclass one, which for most classes is none at all but
         for a bard, ranger or rogue is one more skill. */
      if (rec) {
        var skillSets = ci === 0
          ? ((rec.startingProficiencies || {}).skills || [])
          : (((rec.multiclassing || {}).proficienciesGained || {}).skills || []);
        skillSets.forEach(function (sk, i) {
          if (!sk.choose) return;
          out.push({
            key: tag + ':skill' + i, kind: 'skill', ci: ci, entry: entry,
            label: 'Skill proficiencies' + (ci ? ' (' + entry.name + ')' : ''), level: 1,
            count: sk.choose.count || 1, from: (sk.choose.from || []).slice(),
            picked: (picks[tag + ':skill' + i] || []).slice()
          });
        });
      }

      /* --- tools, from the class you started as --- */
      if (rec && ci === 0) {
        toolGrants(rec).choices.forEach(function (tc, i) {
          var k = tag + ':tool' + i;
          out.push({
            key: k, kind: 'tool', ci: ci, entry: entry,
            label: 'Tool proficiencies', level: 1,
            count: tc.count, categories: tc.categories, hint: tc.label,
            picked: (picks[k] || []).slice()
          });
        });
      }

      /* --- optional features: the big one --- */
      [rec, sub].forEach(function (holder, hi) {
        ((holder && holder.optionalfeatureProgression) || []).forEach(function (p, i) {
          var n = countAt(p.progression, lv);
          if (!n) return;
          var k = tag + ':of' + hi + '-' + i;
          out.push({
            key: k, kind: 'optionalfeature', ci: ci, entry: entry,
            label: p.name || (TYPE_LABEL[(p.featureType || [])[0]] || 'Option'),
            featureType: (p.featureType || []).slice(),
            level: firstLevel(p.progression), count: n,
            picked: (picks[k] || []).slice()
          });
        });
      });

      /* --- feats granted by the class table (2024) --- */
      ((rec && rec.featProgression) || []).forEach(function (p, i) {
        var n = countAt(p.progression, lv);
        if (!n) return;
        var k = tag + ':feat' + i;
        out.push({
          key: k, kind: 'feat', ci: ci, entry: entry,
          label: p.name || 'Feat', category: (p.category || []).slice(),
          level: firstLevel(p.progression), count: n,
          picked: (picks[k] || []).slice()
        });
      });

      /* --- cantrips and prepared spells --- */
      /* A third-caster keeps its table on the SUBCLASS, so an Arcane Trickster
         is a caster while a plain Rogue is not. Read both holders. */
      [rec, sub].forEach(function (holder, hi) {
        if (!holder) return;
        spellCounts(holder, lv).forEach(function (sc) {
          var k = tag + ':' + sc.kind + hi;
          out.push({
            key: k, kind: sc.kind, ci: ci, entry: entry,
            label: sc.label + (hi ? ' (' + sub.name + ')' : ''),
            level: 1, count: sc.count,
            listFrom: hi ? spellListFor(entry, sub) : { name: entry.name, source: entry.source },
            spellLevelMax: sc.kind === 'cantrip' ? 0 : maxSpellLevel(rec, sub, lv),
            picked: (picks[k] || []).slice()
          });
        });
      });
    });
    return out;
  }

  function firstLevel(progression) {
    if (!progression) return 1;
    if (Array.isArray(progression)) {
      for (var i = 0; i < progression.length; i++) if (progression[i]) return i + 1;
      return 1;
    }
    return Math.min.apply(Math, Object.keys(progression).map(Number)) || 1;
  }

  /* Which spell list a subclass caster draws from. 5etools records who may
     learn a spell per CLASS (data/spells/sources.json) and has no entry at all
     for subclasses, so the two third-casters - both of which use the wizard
     list by their printed text - need saying explicitly. This is the only
     hand-written mapping in the choice tree. */
  var SUBCLASS_SPELL_LIST = {
    'arcane trickster': { name: 'Wizard' },
    'eldritch knight': { name: 'Wizard' }
  };

  function spellListFor(entry, sub) {
    var m = sub && SUBCLASS_SPELL_LIST[low(sub.name)];
    if (m) return { name: m.name, source: entry.source };
    return { name: entry.name, source: entry.source };
  }

  /* "Cantrips Known" and "Prepared Spells"/"Spells Known" are columns in the
     class table, labelled with a {@filter ...} tag we have to look inside.
     Some records skip the table and carry a plain 20-entry array instead. */
  function spellCounts(rec, level) {
    var out = [];
    var i = U.clamp(level, 1, 20) - 1;
    if (Array.isArray(rec.cantripProgression) && rec.cantripProgression[i] > 0) {
      out.push({ kind: 'cantrip', label: 'Cantrips', count: rec.cantripProgression[i] });
    }
    var known = rec.preparedSpellsProgression || rec.spellsKnownProgression;
    if (Array.isArray(known) && known[i] > 0) {
      out.push({ kind: 'spell',
                 label: rec.preparedSpellsProgression ? 'Prepared spells' : 'Spells known',
                 count: known[i] });
    }
    if (out.length) return out;

    (rec.classTableGroups || rec.subclassTableGroups || []).forEach(function (g) {
      var labels = g.colLabels || [];
      var rows = g.rows || [];
      var row = rows[U.clamp(level, 1, rows.length) - 1] || [];
      labels.forEach(function (raw, i) {
        var text = String(raw).replace(/\{@filter\s+([^|}]+)[^}]*\}/g, '$1');
        var n = row[i];
        if (typeof n !== 'number' || n <= 0) return;
        if (/cantrip/i.test(text)) out.push({ kind: 'cantrip', label: 'Cantrips', count: n });
        else if (/prepared spells|spells known/i.test(text)) {
          out.push({ kind: 'spell', label: /prepared/i.test(text) ? 'Prepared spells' : 'Spells known', count: n });
        }
      });
    });
    return out;
  }

  /* Highest spell level this class can cast at this level - so the picker does
     not offer a 5th-level spell to a 3rd-level bard. */
  function maxSpellLevel(rec, sub, level) {
    var prog = (rec && rec.casterProgression) || (sub && sub.casterProgression);
    var slots = VT.features.slotsFor(prog, level);
    if (!slots) return 0;
    if (slots.pact) return slots.slotLevel;
    var top = 0;
    slots.slots.forEach(function (n, i) { if (n > 0) top = i + 1; });
    return top;
  }


  /* ==== tool proficiencies ================================================
     5etools writes these as tagged prose rather than a list:

       "{@item thieves' tools|PHB}"                         a fixed grant
       "Choose three {@item Musical Instrument|XPHB|...}"    a choice
       "any one type of {@item artisan's tools|PHB} ..."     a choice

     So a fixed grant is any entry with exactly one @item tag and no words of
     choosing, and everything else is a choice of N from a category. */
  var TOOL_CATEGORY = {
    'artisan': 'AT', "artisan's tools": 'AT', 'musical instrument': 'INS',
    'musical instruments': 'INS', 'gaming set': 'GS', 'gaming sets': 'GS'
  };
  var COUNT_WORD = { one: 1, two: 2, three: 3, four: 4, a: 1, any: 1 };

  function toolGrants(rec) {
    var out = { fixed: [], choices: [] };
    ((rec && rec.startingProficiencies || {}).tools || []).forEach(function (raw) {
      var text = String(raw);
      var tags = [];
      String(text).replace(/\{@item\s+([^|}]+)(?:\|[^}]*)?\}/g, function (m, nm) {
        tags.push(nm.trim()); return '';
      });
      var choosing = /\b(choose|of your choice|any one|any)\b/i.test(text);
      if (!choosing && tags.length === 1) { out.fixed.push(tags[0]); return; }

      var cm = text.match(/\b(one|two|three|four|a|any)\b/i);
      var count = cm ? (COUNT_WORD[cm[1].toLowerCase()] || 1) : 1;
      /* which category is being chosen from - a monk may pick from two */
      var cats = [];
      tags.forEach(function (t) {
        var key = t.toLowerCase().replace(/s$/, '');
        Object.keys(TOOL_CATEGORY).forEach(function (k) {
          if (key.indexOf(k.replace(/s$/, '')) >= 0 && cats.indexOf(TOOL_CATEGORY[k]) < 0) {
            cats.push(TOOL_CATEGORY[k]);
          }
        });
      });
      out.choices.push({ count: count, categories: cats.length ? cats : ['AT', 'INS', 'GS', 'T'],
                         label: text.replace(/\{@item\s+([^|}]+)(?:\|[^}]*)?\}/g, '$1') });
    });
    return out;
  }

  /* Every tool a character is proficient with, fixed grants only. */
  function fixedTools(build) {
    var out = [];
    classList(build).forEach(function (entry, i) {
      if (i > 0) return;                      /* a multiclass grants no tools */
      var rec = classRecord(entry);
      if (!rec) return;
      toolGrants(rec).fixed.forEach(function (t) {
        if (out.indexOf(t) < 0) out.push(t);
      });
    });
    return out;
  }

  function chosenTools(build) {
    var out = [];
    pending(build).forEach(function (ch) {
      if (ch.kind !== 'tool') return;
      (ch.picked || []).forEach(function (t) {
        var nm = typeof t === 'string' ? t : t.name;
        if (out.indexOf(nm) < 0) out.push(nm);
      });
    });
    return out;
  }

  /* ==== what can be picked =============================================== */
  function optionsFor(choice, opts) {
    opts = opts || {};
    if (!FT().loaded) return [];
    var allSources = !!opts.allSources;

    if (choice.kind === 'subclass') {
      return FT().get('subclass').filter(function (s) {
        if (low(s.className) !== low(choice.className)) return false;
        /* 2014 and 2024 subclasses are not interchangeable: a 2024 Fighter
           takes 2024 subclasses, and taking a 2014 one would pull in a feature
           tree written against the other edition's chassis. */
        if (choice.classSource && low(s.classSource) !== low(choice.classSource)) return false;
        return allSources || inCore(s.source, s);
      }).sort(byName);
    }

    if (choice.kind === 'optionalfeature') {
      var types = choice.featureType || [];
      return dedupe(FT().get('optionalfeature').filter(function (o) {
        if (!(o.featureType || []).some(function (t) { return types.indexOf(t) >= 0; })) return false;
        return allSources || inCore(o.source, o);
      }), choice).sort(byName);
    }

    if (choice.kind === 'feat') {
      var cats = choice.category || [];
      return dedupe(FT().get('feat').filter(function (f) {
        if (cats.length && cats.indexOf(f.category) < 0) return false;
        return allSources || inCore(f.source, f);
      }), choice).sort(byName);
    }

    if (choice.kind === 'skill') {
      return (choice.from || []).map(function (s) { return { name: U.cap(s), __skill: s }; });
    }

    if (choice.kind === 'tool') {
      var cats = choice.categories || [];
      var seen = {};
      return FT().get('item').filter(function (i) {
        if (i.__variant || (i.rarity && i.rarity !== 'none')) return false;
        var t = String(i.type || '').split('|')[0];
        if (cats.indexOf(t) < 0) return false;
        var k = low(i.name);
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      }).sort(byName);
    }

    if (choice.kind === 'cantrip' || choice.kind === 'spell') {
      var from = choice.listFrom || { name: choice.entry.name, source: choice.entry.source };
      var list = FT().spellsForClass(from.name, from.source);
      var max = choice.spellLevelMax || 0;
      return list.filter(function (sp) {
        if (choice.kind === 'cantrip') return sp.level === 0;
        return sp.level > 0 && sp.level <= max;
      }).sort(function (a, b) { return (a.level - b.level) || byName(a, b); });
    }
    return [];
  }

  /* The default filter keeps the option lists to the books most tables use. It
     must never hide content the user imported themselves: a supplement you went
     to the trouble of converting is not "some other book you did not ask for". */
  function inCore(src, rec) {
    if (rec && rec.__hb) return true;
    return CORE_SOURCES.indexOf(String(src || '').toUpperCase()) >= 0;
  }

  /* 2024 reprinted most of the 2014 options under the same names: 20 of the 43
     Battle Master maneuvers and 23 of the 82 invocations exist twice. Offering
     both is worse than useless - it lets a player take "Ambush" twice and hides
     the real choices behind duplicates. Keep one of each name, preferring the
     printing that matches the class the character actually took. */
  var ONE_SOURCES = ['XPHB', 'XDMG', 'XMM'];

  function editionOf(src) {
    return ONE_SOURCES.indexOf(String(src || '').toUpperCase()) >= 0 ? 'one' : 'classic';
  }

  function dedupe(list, choice) {
    var rec = classRecord(choice && choice.entry);
    var want = rec ? (rec.edition === 'one' ? 'one' : editionOf(rec.source)) : null;
    var wantSource = rec ? low(rec.source) : '';
    var best = {};
    list.forEach(function (o) {
      var k = low(o.name);
      var score = low(o.source) === wantSource ? 3
        : (want && editionOf(o.source) === want) ? 2 : 1;
      if (!best[k] || score > best[k].score) best[k] = { score: score, rec: o };
    });
    return Object.keys(best).map(function (k) { return best[k].rec; });
  }
  function byName(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }

  /* ==== prerequisites ==================================================== */
  /* Returns '' if the option is legal, or a short reason why it is not. The
     check is advisory: the UI greys the row and says why, but a table that
     rules differently can still take it. */
  function prereqReason(option, actor, build, choice) {
    var pres = option.prerequisite;
    if (!pres || !pres.length) return '';
    /* Prerequisites are an OR list - meeting any one entry is enough. */
    var reasons = [];
    for (var i = 0; i < pres.length; i++) {
      var r = checkOne(pres[i], actor, build, choice);
      if (!r) return '';
      reasons.push(r);
    }
    return reasons[0];
  }

  function checkOne(p, actor, build, choice) {
    if (p.level != null) {
      var need = typeof p.level === 'object' ? p.level.level : p.level;
      var cls = typeof p.level === 'object' && p.level.class ? p.level.class.name : null;
      var have = cls ? classLevel(build, cls) : totalLevel(build);
      if (have < need) return 'needs level ' + need + (cls ? ' in ' + cls : '');
    }
    if (p.ability) {
      var miss = [];
      p.ability.forEach(function (set) {
        Object.keys(set).forEach(function (k) {
          if (!SRD.ABILITY_NAME[k]) return;
          if (!actor || (actor.abilities[k] || 0) < set[k]) miss.push(SRD.ABILITY_NAME[k] + ' ' + set[k]);
        });
      });
      if (miss.length) return 'needs ' + miss.join(' or ');
    }
    if (p.spellcasting || p.spellcasting2020) {
      if (!actor || !actor.spellSlots) return 'needs spellcasting';
    }
    if (p.pact) {
      var boons = pickedNames(build, 'PB');
      if (!boons.some(function (n) { return low(n).indexOf(low(p.pact)) >= 0; })) {
        return 'needs Pact of the ' + p.pact;
      }
    }
    if (p.patron) return 'needs the ' + p.patron + ' patron';
    if (p.feat) return 'needs the ' + p.feat.join(' or ') + ' feat';
    if (p.otherSummary) return String(p.otherSummary.entrySummary || p.otherSummary.entry || '').slice(0, 60);
    if (p.other) return String(p.other).slice(0, 60);
    return '';
  }

  function classLevel(build, name) {
    var hit = classList(build).filter(function (c) { return low(c.name) === low(name); })[0];
    return hit ? hit.level : 0;
  }

  function pickedNames(build, featureType) {
    var out = [];
    pending(build).forEach(function (ch) {
      if (ch.kind !== 'optionalfeature') return;
      if ((ch.featureType || []).indexOf(featureType) < 0) return;
      (ch.picked || []).forEach(function (p) { out.push(p.name); });
    });
    return out;
  }

  /* ==== making a pick ==================================================== */
  function pick(build, choice, option) {
    build.picks = build.picks || {};
    if (choice.kind === 'subclass') {
      var entry = classList(build)[choice.ci];
      if (entry) entry.subclass = { name: option.name, source: option.source || null };
      return true;
    }
    var list = build.picks[choice.key] = (build.picks[choice.key] || []);
    var val = choice.kind === 'skill'
      ? option.__skill
      : { name: option.name, source: option.source || null };
    if (has(list, val)) return false;
    if (list.length >= choice.count) return false;
    list.push(val);
    return true;
  }

  function unpick(build, choice, option) {
    if (choice.kind === 'subclass') {
      var entry = classList(build)[choice.ci];
      if (entry) entry.subclass = null;
      return true;
    }
    var list = (build.picks || {})[choice.key];
    if (!list) return false;
    var val = choice.kind === 'skill' ? option.__skill : { name: option.name, source: option.source || null };
    var i = indexOfPick(list, val);
    if (i < 0) return false;
    list.splice(i, 1);
    return true;
  }

  function has(list, val) { return indexOfPick(list, val) >= 0; }
  function indexOfPick(list, val) {
    for (var i = 0; i < list.length; i++) {
      var x = list[i];
      if (typeof val === 'string') { if (low(x) === low(val)) return i; continue; }
      if (x && low(x.name) === low(val.name) &&
          (!val.source || !x.source || low(x.source) === low(val.source))) return i;
    }
    return -1;
  }

  /* ==== what is still owed =============================================== */
  function outstanding(build) {
    return pending(build).filter(function (c) { return (c.picked || []).length < c.count; });
  }

  function summary(build) {
    var all = pending(build);
    var left = all.filter(function (c) { return (c.picked || []).length < c.count; });
    return {
      total: all.length,
      unspent: left.reduce(function (n, c) { return n + (c.count - c.picked.length); }, 0),
      groups: left.length
    };
  }

  /* Everything picked, as records, so the sheet can list and apply them. */
  function pickedRecords(build) {
    var out = [];
    pending(build).forEach(function (ch) {
      if (ch.kind === 'skill' || ch.kind === 'subclass') return;
      (ch.picked || []).forEach(function (p) {
        var rec = findRecord(ch, p);
        out.push({ choice: ch, ref: p, rec: rec });
      });
    });
    return out;
  }

  function findRecord(choice, ref) {
    if (!FT().loaded) return null;
    var kind = choice.kind === 'feat' ? 'feat'
      : choice.kind === 'optionalfeature' ? 'optionalfeature'
      : (choice.kind === 'cantrip' || choice.kind === 'spell') ? 'spell' : null;
    if (!kind) return null;
    var hits = FT().get(kind).filter(function (r) {
      return low(r.name) === low(ref.name) && (!ref.source || low(r.source) === low(ref.source));
    });
    return hits[0] || null;
  }

  /* Skills chosen through the class table, for charbuild to fold into skillProf. */
  function chosenSkills(build) {
    var out = [];
    pending(build).forEach(function (ch) {
      if (ch.kind !== 'skill') return;
      (ch.picked || []).forEach(function (s) { if (out.indexOf(s) < 0) out.push(s); });
    });
    return out;
  }

  VT.choices = {
    pending: pending, optionsFor: optionsFor, pick: pick, unpick: unpick,
    outstanding: outstanding, summary: summary, prereqReason: prereqReason,
    pickedRecords: pickedRecords, chosenSkills: chosenSkills,
    toolGrants: toolGrants, fixedTools: fixedTools, chosenTools: chosenTools,
    classList: classList, totalLevel: totalLevel, classRecord: classRecord,
    subclassRecord: subclassRecord, subclassLevel: subclassLevel,
    countAt: countAt, CORE_SOURCES: CORE_SOURCES, spellListFor: spellListFor,
    editionOf: editionOf,
    TYPE_LABEL: TYPE_LABEL, CATEGORY_LABEL: CATEGORY_LABEL
  };
})();

/* ===== src/data/multiclass.js ===== */
/* Virtual Tactics :: data/multiclass.js
   Multiclassing rules.

   A character is a list of {name, source, subclass, level} entries. Total level
   drives proficiency; each class contributes its own hit die and its own share
   of one combined spellcasting level.

   Three things are easy to get wrong and are handled explicitly here:

     - Spell slots come from ONE combined caster level read off the full-caster
       table, not from adding each class's own slot row together. A Cleric 3 /
       Wizard 3 is a 6th-level caster with 3rd-level slots, not two 2nd-level
       casters.
     - Warlock pact slots stay separate. They recharge on a short rest and are
       tracked alongside, never merged in.
     - Only the FIRST class gives you its full starting proficiencies. Every
       class after that gives the shorter multiclassing list, and neither the
       2014 nor the 2024 book gives a multiclass its saving-throw proficiencies. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function low(v) { return String(v == null ? '' : v).toLowerCase(); }
  function FT() { return VT.fivetools; }

  /* ==== the list ========================================================= */
  function normalise(build) {
    return VT.choices.classList(build);
  }

  function totalLevel(classes) {
    return (classes || []).reduce(function (n, c) { return n + (c.level || 0); }, 0);
  }

  function profBonus(classes) { return SRD.profBonus(U.clamp(totalLevel(classes), 1, 20)); }

  function label(classes) {
    return (classes || []).map(function (c) {
      return c.name + (c.subclass ? ' (' + c.subclass.name + ')' : '') + ' ' + c.level;
    }).join(' / ');
  }

  /* ==== requirements ===================================================== */
  /* 2014 classes carry multiclassing.requirements outright. 2024 classes do
     not: the rule became "13 in the class's primary ability", which 5etools
     stores as primaryAbility. Fall back to that. */
  function requirementsFor(clsRec) {
    if (!clsRec) return null;
    var mc = clsRec.multiclassing || {};
    if (mc.requirements) return mc.requirements;
    if (clsRec.primaryAbility && clsRec.primaryAbility.length) {
      /* primaryAbility is an OR list: Fighter is STR or DEX. */
      var opts = clsRec.primaryAbility.map(function (set) {
        var req = {};
        Object.keys(set).forEach(function (k) { if (set[k]) req[k] = 13; });
        return req;
      });
      return opts.length === 1 ? opts[0] : { or: opts };
    }
    return null;
  }

  /* '' if the character qualifies, otherwise a short reason. */
  function requirementReason(clsRec, abilities) {
    var req = requirementsFor(clsRec);
    if (!req || !abilities) return '';
    var sets = req.or ? req.or : [req];
    var misses = [];
    for (var i = 0; i < sets.length; i++) {
      var miss = [];
      Object.keys(sets[i]).forEach(function (k) {
        if (!SRD.ABILITY_NAME[k]) return;
        if ((abilities[k] || 0) < sets[i][k]) miss.push(SRD.ABILITY_NAME[k] + ' ' + sets[i][k]);
      });
      if (!miss.length) return '';
      misses.push(miss.join(' and '));
    }
    return 'needs ' + misses.join(', or ');
  }

  /* ==== hit points ======================================================= */
  /* The first class takes its die at maximum for the character's very first
     level; everything after that is the die's average rounded up, plus
     Constitution, exactly as charbuild does for a single class. */
  function hitPoints(classes, conMod) {
    var total = 0, first = true;
    (classes || []).forEach(function (entry) {
      var faces = dieFor(entry);
      var levels = entry.level || 0;
      if (!levels) return;
      if (first) {
        total += faces + conMod;
        levels -= 1;
        first = false;
      }
      total += levels * (Math.floor(faces / 2) + 1 + conMod);
    });
    return Math.max(1, total);
  }

  function dieFor(entry) {
    var rec = VT.choices.classRecord(entry);
    return (rec && rec.hd && rec.hd.faces) || 8;
  }

  /* Hit dice, grouped by size - a Fighter 3 / Rogue 2 has 3d10 and 2d8. */
  function hitDice(classes) {
    var by = {};
    (classes || []).forEach(function (e) {
      if (!e.level) return;
      var f = dieFor(e);
      by[f] = (by[f] || 0) + e.level;
    });
    return Object.keys(by).map(Number).sort(function (a, b) { return b - a; })
      .map(function (f) { return { faces: f, count: by[f] }; });
  }

  /* ==== spellcasting ===================================================== */
  /* One combined caster level, plus the warlock's separate pact slots. */
  function spellcasting(classes) {
    var casterLevel = 0, pactLevel = 0, casters = [];
    (classes || []).forEach(function (entry) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      var prog = rec.casterProgression;
      if (prog === 'pact') { pactLevel += entry.level || 0; casters.push(entry); return; }
      /* A third-caster subclass (Eldritch Knight, Arcane Trickster) turns an
         otherwise non-casting class into one. */
      if (!prog) {
        var sub = VT.choices.subclassRecord(entry);
        if (sub && sub.casterProgression) prog = sub.casterProgression;
      }
      var add = VT.features.casterLevels(prog, entry.level || 0);
      if (add) { casterLevel += add; casters.push(entry); }
    });

    var slots = casterLevel ? VT.features.slotsForCasterLevel(casterLevel) : null;
    var pact = pactLevel ? VT.features.slotsFor('pact', pactLevel) : null;
    return { casterLevel: casterLevel, slots: slots, pact: pact, casters: casters };
  }

  /* Spell save DC and attack bonus are per class, because each uses its own
     ability. The sheet shows the highest, and lists the rest. */
  function spellStats(classes, actor) {
    var prof = profBonus(classes);
    var out = [];
    (classes || []).forEach(function (entry) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      var ability = rec.spellcastingAbility;
      if (!ability) {
        var sub = VT.choices.subclassRecord(entry);
        ability = sub && sub.spellcastingAbility;
      }
      if (!ability) return;
      var mod = VT.actor.abilityMod(actor, ability);
      out.push({ cls: entry.name, ability: ability, dc: 8 + prof + mod, attack: prof + mod });
    });
    return out;
  }

  /* ==== proficiencies ==================================================== */
  /* Returns {armor:[], weapons:[], tools:[], saves:[], skillChoices:[]} for the
     whole character, with the first class full and the rest reduced. */
  function proficiencies(classes) {
    var out = { armor: [], weapons: [], tools: [], saves: [], skillChoices: [] };
    (classes || []).forEach(function (entry, i) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      if (i === 0) {
        var sp = rec.startingProficiencies || {};
        push(out.armor, sp.armor);
        push(out.weapons, sp.weapons);
        push(out.tools, sp.tools);
        push(out.saves, rec.proficiency);
        (sp.skills || []).forEach(function (s) { if (s.choose) out.skillChoices.push(s.choose); });
      } else {
        var mc = (rec.multiclassing || {}).proficienciesGained || {};
        push(out.armor, mc.armor);
        push(out.weapons, mc.weapons);
        push(out.tools, mc.tools);
        /* Saving throws are deliberately absent: no edition grants them on a
           multiclass, and quietly adding them would break every save DC. */
        (mc.skills || []).forEach(function (s) { if (s.choose) out.skillChoices.push(s.choose); });
      }
    });
    return out;
  }

  function push(target, src) {
    (src || []).forEach(function (v) {
      var name = typeof v === 'string' ? v : (v.proficiency || v.name || JSON.stringify(v));
      if (typeof v === 'object' && !v.proficiency && !v.name) return;   // choose-blocks
      if (target.indexOf(name) < 0) target.push(name);
    });
  }

  /* ==== editing the list ================================================= */
  function addClass(build, clsRec) {
    build.classes = normalise(build).slice();
    var existing = build.classes.filter(function (c) {
      return low(c.name) === low(clsRec.name) && low(c.source) === low(clsRec.source);
    })[0];
    if (existing) { existing.level += 1; return existing; }
    var entry = { name: clsRec.name, source: clsRec.source || null, subclass: null, level: 1 };
    build.classes.push(entry);
    delete build.cls;              /* the single-class shape is now stale */
    delete build.subclass;
    return entry;
  }

  function setLevel(build, index, level) {
    build.classes = normalise(build).slice();
    var e = build.classes[index];
    if (!e) return false;
    level = U.clamp(level, 0, 20);
    if (level === 0) {
      if (build.classes.length === 1) return false;   // must keep one
      build.classes.splice(index, 1);
    } else {
      e.level = level;
    }
    delete build.cls;
    delete build.subclass;
    return true;
  }

  /* Every class on the character whose ability requirement is not met, for a
     builder that let the choice through because the scores had not been rolled
     yet. Returns [{name, reason}]. */
  function unmetRequirements(classes, abilities) {
    var out = [];
    (classes || []).forEach(function (entry) {
      var rec = VT.choices.classRecord(entry);
      if (!rec) return;
      var why = requirementReason(rec, abilities);
      if (why) out.push({ name: entry.name, reason: why });
    });
    return out;
  }

  /* The class the character started as - the one whose hit die is maximised
     and whose full proficiencies they got. */
  function primary(classes) { return (classes || [])[0] || null; }

  VT.multiclass = {
    normalise: normalise, totalLevel: totalLevel, profBonus: profBonus, label: label,
    requirementsFor: requirementsFor, requirementReason: requirementReason,
    hitPoints: hitPoints, hitDice: hitDice, dieFor: dieFor,
    spellcasting: spellcasting, spellStats: spellStats,
    proficiencies: proficiencies,
    addClass: addClass, setLevel: setLevel, primary: primary,
    unmetRequirements: unmetRequirements
  };
})();

/* ===== src/data/choicefx.js ===== */
/* Virtual Tactics :: data/choicefx.js
   Turning the things a player CHOSE into things on the sheet.

   choices.js finds what a character may pick and records the picks. This turns
   those picks into numbers and actions, and is the choice-tree counterpart to
   features.js.

   Two halves, and the split matters:

     - The generic half applies to everything. Every pick becomes an entry in
       actor.picked, carrying its printed text, so a fighting style, an
       invocation, a maneuver and a feat all appear on the sheet, are searchable,
       and survive a level-up. Feats that raise an ability score do so from the
       record's own `ability` field - 55 of the 77 2024 feats carry one, so that
       part needs no table at all.

     - The curated half is EFFECTS: the handful of options with a clean numeric
       effect worth wiring - Defense's +1 AC, Archery's +2 to hit, Unarmed
       Fighting's bigger die, Agonizing Blast's damage.

   Anything not in EFFECTS still shows its full text; it simply is not doing
   arithmetic on your behalf. That is the same bargain features.js strikes, and
   for the same reason: the effect of "you can reroll 1s and 2s on damage" is
   not something a statblock can hold. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd;

  function low(v) { return String(v == null ? '' : v).toLowerCase(); }
  function mod(a, k) { return VT.actor.abilityMod(a, k); }

  /* ==== the curated effects ============================================== */
  /* Keyed by lowercased option name. Each may set:
       acBonus     flat addition to AC
       toHit       {kind:'ranged'|'melee', bonus:n} applied to matching attacks
       damage      {kind:..., bonus:n}
       unarmed     die faces for the unarmed strike
       note        one line explaining what was applied
       action(a)   extra actions                                            */
  var EFFECTS = {
    /* --- fighting styles --- */
    'defense': { acBonus: 1, note: '+1 AC while wearing armour.' },
    'archery': { toHit: { kind: 'ranged', bonus: 2 }, note: '+2 to hit with ranged weapons.' },
    'dueling': { damage: { kind: 'melee', bonus: 2, oneHanded: true },
                 note: '+2 damage with a one-handed melee weapon and no second weapon.' },
    'great weapon fighting': { note: 'Reroll 1s and 2s on damage with a two-handed weapon.' },
    'two-weapon fighting': { note: 'Add your ability modifier to the off-hand attack’s damage.' },
    'protection': { note: 'Reaction: impose disadvantage on an attack against an ally within 5 ft.' },
    'interception': { note: 'Reaction: reduce damage to a creature within 5 ft by 1d10 + proficiency.' },
    'blind fighting': { note: 'Blindsight 10 ft.' },
    'thrown weapon fighting': { damage: { kind: 'ranged', bonus: 2, thrown: true },
                                note: '+2 damage with a thrown weapon.' },
    'unarmed fighting': { unarmed: 6, note: 'Unarmed strikes deal d6 (d8 with both hands free).' },
    'superior technique': { note: 'One maneuver and one superiority die.' },
    'druidic warrior': { note: 'Two druid cantrips, cast with Wisdom.' },
    'blessed warrior': { note: 'Two cleric cantrips, cast with Charisma.' },

    /* --- invocations with a number behind them --- */
    'agonizing blast': {
      note: 'Add your Charisma modifier to Eldritch Blast damage.',
      patch: function (a) {
        var cha = mod(a, 'cha');
        if (cha <= 0) return;
        (a.actions || []).forEach(function (act) {
          if (!/eldritch blast/i.test(act.name || '')) return;
          if (act.__agonizing) return;
          act.__agonizing = true;
          act.dmg = String(act.dmg || '1d10') + U.sign(cha);
        });
      }
    },
    'repelling blast': { note: 'Eldritch Blast pushes a creature 10 ft.' },
    'devil’s sight': { note: 'See in magical and non-magical darkness to 120 ft.' },
    'devils sight': { note: 'See in magical and non-magical darkness to 120 ft.' },
    'armor of shadows': { note: 'Cast Mage Armor on yourself at will.' },
    'eldritch mind': { note: 'Advantage on concentration saves.' },
    'fiendish vigor': { note: 'Cast False Life on yourself at will.' },
    'thirsting blade': { note: 'Attack twice with your pact weapon.' },
    'lifedrinker': { note: 'Extra necrotic damage with your pact weapon.' },
    'pact of the blade': {
      note: 'Summon a magic weapon; it counts as magical and uses your pact ability.'
    },
    'pact of the tome': { note: 'Three cantrips from any list.' },
    'pact of the chain': { note: 'Find Familiar, with more forms available.' },
    'pact of the talisman': { note: 'A talisman that adds d4 to a failed ability check.' }
  };

  /* ==== ability increases from feats ===================================== */
  /* 5etools stores a feat's ability increase in a machine-readable `ability`
     field: either fixed ({"cha": 1}) or a choice with a count, an amount and a
     cap. That is enough to apply it without a table - the UI only has to ask
     WHICH ability when the field says "choose". */
  function abilityNeed(rec) {
    var out = null;
    ((rec && rec.ability) || []).forEach(function (set) {
      if (!set.choose) return;
      out = {
        from: (set.choose.from || SRD.ABILITIES).slice(),
        count: set.choose.count || 1,
        amount: set.choose.amount || 1,
        max: set.max || 20
      };
    });
    return out;
  }

  function fixedAbility(rec) {
    var out = {};
    ((rec && rec.ability) || []).forEach(function (set) {
      if (set.choose) return;
      Object.keys(set).forEach(function (k) {
        if (SRD.ABILITIES.indexOf(k) >= 0) out[k] = (out[k] || 0) + set[k];
      });
    });
    return out;
  }

  /* Every ability point the character's picks are worth, with the cap each one
     allows - epic boons raise a score to 30, ordinary feats stop at 20. */
  function abilityBonuses(c) {
    var bonus = {}, cap = {};
    if (!VT.choices || !c || !c.picks) return { bonus: bonus, cap: cap };
    var build = { classes: (c.classes || []).map(toEntry), picks: c.picks };
    VT.choices.pending(build).forEach(function (ch) {
      if (ch.kind !== 'feat') return;
      (ch.picked || []).forEach(function (p) {
        var rec = findFeat(p);
        if (rec) {
          var fixed = fixedAbility(rec);
          Object.keys(fixed).forEach(function (k) { bonus[k] = (bonus[k] || 0) + fixed[k]; });
          var need = abilityNeed(rec);
          if (need && need.max > 20) {
            (Object.keys(p.abil || {})).forEach(function (k) { cap[k] = Math.max(cap[k] || 20, need.max); });
          }
        }
        /* Whatever the player chose for a "choose an ability" feat. */
        Object.keys(p.abil || {}).forEach(function (k) {
          if (SRD.ABILITIES.indexOf(k) >= 0) bonus[k] = (bonus[k] || 0) + p.abil[k];
        });
      });
    });
    return { bonus: bonus, cap: cap };
  }

  function toEntry(e) {
    return e && e.cls
      ? { name: e.cls.name, source: e.cls.source, level: e.level,
          subclass: e.subclass ? { name: e.subclass.name, source: e.subclass.source } : null }
      : e;
  }

  function findFeat(ref) {
    var FT = VT.fivetools;
    if (!FT || !FT.loaded || !ref) return null;
    return (FT.get('feat') || []).filter(function (f) {
      return low(f.name) === low(ref.name) && (!ref.source || low(f.source) === low(ref.source));
    })[0] || null;
  }

  /* ==== applying everything else ========================================= */
  function apply(actor, c) {
    actor.picked = [];
    if (!VT.choices || !c || !c.picks) return actor;

    var build = { classes: (c.classes || []).map(toEntry), picks: c.picks };
    var patches = [];

    VT.choices.pending(build).forEach(function (ch) {
      if (ch.kind === 'skill' || ch.kind === 'subclass') return;
      (ch.picked || []).forEach(function (p) {
        var rec = findRecordFor(ch, p);
        var e = EFFECTS[low(p.name)];
        var entry = {
          name: p.name, source: p.source || null,
          kind: ch.kind, label: ch.label,
          cls: ch.entry ? ch.entry.name : '',
          note: e && e.note ? e.note : '',
          abil: p.abil || null,
          applied: !!e
        };
        actor.picked.push(entry);

        /* A spell you chose should be castable, not just listed. Convert it the
           same way gear-picked spells are converted in charbuild.derive. */
        if (ch.kind === 'cantrip' || ch.kind === 'spell') {
          var sp = rec || findRecordFor(ch, p);
          if (sp && !hasAction(actor, sp.name)) {
            var act = VT.convert.spell(sp, {
              dc: actor.spellDC || 13,
              atk: actor.spellAttack == null ? VT.actor.prof(actor) : actor.spellAttack,
              mod: actor.castAbility ? mod(actor, actor.castAbility) : 0,
              prof: VT.actor.prof(actor),
              level: actor.level
            });
            if (act) { act.fromChoice = true; actor.actions.push(act); }
          }
          entry.applied = true;
        }
        if (!e) return;

        if (e.acBonus) actor.ac += e.acBonus;
        if (e.unarmed) actor.unarmedDie = Math.max(actor.unarmedDie || 0, e.unarmed);
        if (e.toHit) patches.push({ kind: 'toHit', spec: e.toHit });
        if (e.damage) patches.push({ kind: 'damage', spec: e.damage });
        if (e.patch) patches.push({ kind: 'fn', fn: e.patch });
        if (e.action) (e.action(actor) || []).forEach(function (act) { actor.actions.push(act); });
      });
    });

    /* Attack patches run after every action exists, so a fighting style applies
       to weapons added later in the same derive. */
    patches.forEach(function (p) {
      if (p.kind === 'fn') { p.fn(actor); return; }
      (actor.actions || []).forEach(function (act) {
        if (p.spec.kind && act.kind !== p.spec.kind) return;
        if (p.spec.thrown && !/thrown/i.test(act.name || '')) return;
        if (p.kind === 'toHit' && act.toHit != null) act.toHit += p.spec.bonus;
        if (p.kind === 'damage' && act.dmg) act.dmg = String(act.dmg) + U.sign(p.spec.bonus);
      });
    });

    /* Unarmed Fighting gives the unarmed strike a real die. */
    if (actor.unarmedDie) {
      (actor.actions || []).forEach(function (act) {
        if (!/unarmed strike/i.test(act.name || '')) return;
        var str = mod(actor, 'str');
        act.dmg = '1d' + actor.unarmedDie + (str ? U.sign(str) : '');
      });
    }
    return actor;
  }

  function hasAction(actor, name) {
    var n = low(name);
    return (actor.actions || []).some(function (x) { return low(x.name) === n; });
  }

  function findRecordFor(ch, ref) {
    var FT = VT.fivetools;
    if (!FT || !FT.loaded) return null;
    var kind = ch.kind === 'feat' ? 'feat'
      : ch.kind === 'optionalfeature' ? 'optionalfeature'
      : (ch.kind === 'cantrip' || ch.kind === 'spell') ? 'spell' : null;
    if (!kind) return null;
    return (FT.get(kind) || []).filter(function (r) {
      return low(r.name) === low(ref.name) && (!ref.source || low(r.source) === low(ref.source));
    })[0] || null;
  }

  /* The printed text of a picked option, resolved at render time rather than
     stored - the same bargain charbuild strikes with class features. */
  function textFor(entry) {
    var FT = VT.fivetools;
    if (!FT || !FT.loaded) return '';
    var kinds = entry.kind === 'feat' ? ['feat']
      : entry.kind === 'optionalfeature' ? ['optionalfeature']
      : ['spell'];
    for (var i = 0; i < kinds.length; i++) {
      var rec = (FT.get(kinds[i]) || []).filter(function (r) {
        return low(r.name) === low(entry.name) &&
          (!entry.source || low(r.source) === low(entry.source));
      })[0];
      if (rec) return VT.tags ? VT.tags.toText(rec.entries) : '';
    }
    return '';
  }

  VT.choiceFx = {
    EFFECTS: EFFECTS, apply: apply, abilityBonuses: abilityBonuses,
    abilityNeed: abilityNeed, fixedAbility: fixedAbility, textFor: textFor,
    findFeat: findFeat, findRecordFor: findRecordFor
  };
})();

/* ===== src/data/homebrew.js ===== */
/* Virtual Tactics :: data/homebrew.js
   Local storage for user-authored content.

   Homebrew is written in the SAME 5etools schema as everything else, which is
   the whole trick: once saved it is merged into the compendium and every part
   of the app - the character builder's pickers, the Forge, search, conversion
   to statblocks - treats it identically to book content. No special cases.

   Stored in localStorage under its own key, so it survives reloading or
   switching your 5etools data source, and exports as a plain JSON file you can
   share with your table. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;
  var KEY = 'vtactics.homebrew.v1';

  /* Everything the compendium buckets content into. The last six matter for
     the choice tree: a class is not really a class without its subclasses, its
     feature records and the optional features it may pick from, and a book
     converted from a PDF brings all of them at once. Our internal bucket names
     are lower-case with no camel hump; 5etools files use their own spelling,
     which FILE_KEYS maps. */
  var TYPES = ['race', 'subrace', 'class', 'subclass', 'classfeature',
               'subclassfeature', 'background', 'spell', 'item', 'feat',
               'optionalfeature', 'spelllistchange'];

  var FILE_KEYS = {
    race: ['race'], subrace: ['subrace'], 'class': ['class'],
    subclass: ['subclass'], classfeature: ['classFeature', 'classfeature'],
    subclassfeature: ['subclassFeature', 'subclassfeature'],
    background: ['background'], spell: ['spell'],
    item: ['item', 'baseitem'], feat: ['feat'],
    optionalfeature: ['optionalfeature', 'optionalFeature'],
    spelllistchange: ['spelllistchange', 'spellListChange']
  };

  var hb = {
    data: null,

    blank: function () {
      var d = {};
      TYPES.forEach(function (t) { d[t] = []; });
      return d;
    },

    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        this.data = raw ? JSON.parse(raw) : this.blank();
      } catch (e) {
        this.data = this.blank();
      }
      TYPES.forEach(function (t) { if (!Array.isArray(hb.data[t])) hb.data[t] = []; }.bind(this));
      return this.data;
    },

    save: function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    },

    list: function (type) { return (this.data && this.data[type]) || []; },

    count: function () {
      var n = 0;
      TYPES.forEach(function (t) { n += hb.list(t).length; });
      return n;
    },

    /* Insert or replace by __hbId. */
    upsert: function (type, rec) {
      if (!this.data[type]) this.data[type] = [];
      rec.__hbId = rec.__hbId || U.uid('hb');
      rec.__hb = true;
      var arr = this.data[type];
      var i = arr.findIndex(function (r) { return r.__hbId === rec.__hbId; });
      if (i >= 0) arr[i] = rec; else arr.push(rec);
      var res = this.save();
      this.apply();
      return res.ok ? rec : null;
    },

    remove: function (type, id) {
      this.data[type] = this.list(type).filter(function (r) { return r.__hbId !== id; });
      this.save();
      this.apply();
    },

    get: function (type, id) {
      return this.list(type).find(function (r) { return r.__hbId === id; }) || null;
    },

    /* Push everything into the loaded compendium so the rest of the app sees it. */
    apply: function () {
      if (VT.fivetools && VT.fivetools.setHomebrew) {
        VT.fivetools.setHomebrew(this.data);
      }
    },

    exportFile: function () {
      var payload = { _format: 'vtactics-homebrew', version: 1, created: Date.now(), data: this.data };
      var blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'homebrew.vthb.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    },

    /* Accepts our own export, or a raw 5etools-shaped file ({race:[...]} etc). */
    importJSON: function (text, merge) {
      var parsed = JSON.parse(text);
      var incoming = parsed && parsed.data ? parsed.data : parsed;
      if (!incoming || typeof incoming !== 'object') throw new Error('Not a homebrew file.');

      var added = 0;
      if (!merge) this.data = this.blank();
      TYPES.forEach(function (t) {
        var src = null;
        (FILE_KEYS[t] || [t]).forEach(function (k) {
          if (!src && Array.isArray(incoming[k])) src = incoming[k];
        });
        if (!Array.isArray(src)) return;
        src.forEach(function (r) {
          if (!r) return;
          /* A race's default subrace has no name at all - see baseSubrace in
             charbuild.js - so a nameless record is only junk outside that one
             bucket. */
          if (!r.name && !(t === 'subrace' && r.raceName)) return;
          var copy = U.clone(r);
          copy.__hbId = copy.__hbId || U.uid('hb');
          copy.__hb = true;
          copy.source = copy.source || 'HB';
          hb.data[t] = hb.data[t] || [];
          hb.data[t].push(copy);
          added++;
        });
      });
      if (!added) throw new Error('No recognised entries found in that file.');
      this.save();
      this.apply();
      return added;
    },

    clearAll: function () {
      this.data = this.blank();
      this.save();
      this.apply();
    },

    TYPES: TYPES,
    /* The five you can author by hand in the Homebrew tab. The rest of TYPES
       arrives only by importing a converted book - there is no sensible form
       for "subclass feature #94", but it still has to be stored and merged. */
    AUTHORED: ['race', 'class', 'background', 'spell', 'item'],
    FILE_KEYS: FILE_KEYS,
    KEY: KEY
  };

  VT.homebrew = hb;
})();

/* ===== src/data/charbuild.js ===== */
/* Virtual Tactics :: data/charbuild.js
   Turns a set of character choices into a finished statblock.

   Extracted so the Forge and the TaleSpire symbiote derive characters through
   exactly the same code - two implementations of "how much HP does a level 7
   half-caster have" would drift within a week. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, SRD = VT.srd, CV = VT.convert;

  /* choices = {
       name, level, race, subrace, cls, subclass, background,
       base: {str..cha},         raw scores before racial bonuses
       weapons: [itemRecord],    armor: itemRecord|null, shield: bool,
       spells: [spellRecord],    skillProf: ['stealth', ...]
     } */
  /* 5etools keeps a race's default ability bonuses on a subrace with NO name.
     The standard Human's +1 to everything lives there and nowhere else - the
     base Human record has no 'ability' field at all. Picking Human without
     noticing a blank row in the subrace list therefore left you with no racial
     bonuses whatsoever, silently. Treat the nameless subrace as the default. */
  function baseSubrace(race) {
    if (!race || !VT.fivetools || !VT.fivetools.loaded) return null;
    var name = String(race.name || '').toLowerCase();
    var src = String(race.source || '').toLowerCase();
    return VT.fivetools.get('subrace').find(function (s) {
      if (!s.__base) return false;
      if (String(s.raceName || '').toLowerCase() !== name) return false;
      return !src || !s.raceSource || String(s.raceSource).toLowerCase() === src;
    }) || null;
  }

  function racialBonuses(c) {
    var out = {};
    [c.race, c.subrace || baseSubrace(c.race)].forEach(function (r) {
      if (!r) return;
      var ab = CV.abilityBonusesFromRace(r);
      Object.keys(ab).forEach(function (k) { out[k] = (out[k] || 0) + ab[k]; });
    });
    return out;
  }

  /* AC, and a plain-English account of how it was reached.

     Worth spelling out because the number alone is unfalsifiable: a character
     built with unspent ability points looks identical to a correct one, just
     worse, and there is no way to tell which without doing the arithmetic by
     hand. The breakdown turns "my AC seems low" into something you can read. */
  function armourClass(actor, c) {
    var dexMod = SRD.mod(actor.abilities.dex);
    var ac, why;
    if (c.armor) {
      var kind = String(c.armor.type || '').split('|')[0];
      var base = c.armor.ac || 10;
      if (kind === 'HA') { ac = base; why = c.armor.name + ' ' + base; }
      else if (kind === 'MA') {
        var capped = Math.min(2, dexMod);
        ac = base + capped;
        why = c.armor.name + ' ' + base + U.sign(capped) + ' DEX (capped at +2)';
      } else {
        ac = base + dexMod;
        why = c.armor.name + ' ' + base + U.sign(dexMod) + ' DEX';
      }
    } else {
      ac = 10 + dexMod;
      why = '10' + U.sign(dexMod) + ' DEX (no armour)';
    }
    if (c.shield) { ac += 2; why += ' +2 shield'; }
    actor.acWhy = why;
    return ac;
  }

  /* Max hit die at 1st level, then the die's average rounded up - the
     convention almost every table uses. */
  function hitPoints(faces, level, conMod) {
    var perLevel = Math.floor(faces / 2) + 1 + conMod;
    return Math.max(1, faces + conMod + (level - 1) * perLevel);
  }

  function weaponLook(w) {
    var n = String(w && w.name || '').toLowerCase();
    if (/bow|sling/.test(n)) return 'bow';
    if (/axe/.test(n)) return 'axe';
    if (/spear|pike|lance|javelin|trident|halberd|glaive/.test(n)) return 'spear';
    if (/greatsword|maul|greatclub|greataxe/.test(n)) return 'greatsword';
    if (/dagger|dart|sickle/.test(n)) return 'dagger';
    if (/staff|wand|rod/.test(n)) return 'staff';
    return 'sword';
  }

  /* ---- class features ---------------------------------------------------
     5etools keeps class and subclass features as their own records, keyed by
     class name and level, so a character's feature list is a lookup rather than
     anything we have to hard-code. We store only the identity on the actor and
     resolve the text at render time — the full text of twenty levels of features
     would bloat every save, and would go stale if the source data changed. */
  /* A character is a LIST of classes. `c.classes` is the multiclass shape;
     `c.cls`/`c.subclass`/`c.level` is the original single-class one, still
     accepted everywhere so old saves and old callers keep working. */
  function classesOf(c) {
    if (!c) return [];
    if (c.classes && c.classes.length) {
      return c.classes.filter(function (e) { return e && e.cls; });
    }
    if (c.cls) return [{ cls: c.cls, subclass: c.subclass || null, level: c.level || 1 }];
    return [];
  }

  function totalLevelOf(c) {
    var list = classesOf(c);
    if (!list.length) return U.clamp(c && c.level || 1, 1, 20);
    return U.clamp(list.reduce(function (n, e) { return n + (e.level || 0); }, 0), 1, 20);
  }

  function featuresFor(c) {
    var FT = VT.fivetools, out = [];
    if (!FT || !FT.get) return out;

    classesOf(c).forEach(function (entry) {
      var cname = String(entry.cls.name).toLowerCase();
      var csrc = String(entry.cls.source || '').toLowerCase();
      var lvl = U.clamp(entry.level || 1, 1, 20);

      /* Match the PRINTING, not just the class name. A full data set carries
         both the 2014 (PHB) and 2024 (XPHB) Bard, each with its own feature
         tree - take both and the character ends up with two Extra Attacks and
         four Expertise features. The class record the player picked decides. */
      function sameClass(f) {
        if (String(f.className || '').toLowerCase() !== cname) return false;
        if (!csrc || !f.classSource) return true;
        return String(f.classSource).toLowerCase() === csrc;
      }

      (FT.get('classfeature') || []).forEach(function (f) {
        if (!sameClass(f)) return;
        if ((f.level || 1) > lvl) return;
        out.push({ name: f.name, level: f.level || 1, source: f.source || null,
                   subclass: false, className: entry.cls.name, classSource: entry.cls.source || null });
      });

      if (entry.subclass) {
        var sname = String(entry.subclass.shortName || entry.subclass.name).toLowerCase();
        var ssrc = String(entry.subclass.source || '').toLowerCase();
        (FT.get('subclassfeature') || []).forEach(function (f) {
          if (!sameClass(f)) return;
          if (String(f.subclassShortName || '').toLowerCase() !== sname) return;
          if (ssrc && f.subclassSource &&
              String(f.subclassSource).toLowerCase() !== ssrc) return;
          if ((f.level || 1) > lvl) return;
          out.push({ name: f.name, level: f.level || 1, source: f.source || null,
                     subclass: true, className: entry.cls.name, classSource: entry.cls.source || null });
        });
      }
    });

    /* De-duplicate WITHIN a class only. Two classes can each legitimately grant
       an Extra Attack or an Ability Score Improvement at their own levels, and
       collapsing those across classes would quietly rob a multiclass character
       of improvements they are owed. */
    var seen = {}, uniq = [];
    out.forEach(function (f) {
      var k = String(f.className).toLowerCase() + '|' + f.level + '|' + String(f.name).toLowerCase();
      if (seen[k]) return;
      seen[k] = 1; uniq.push(f);
    });
    uniq.sort(function (a, b) {
      return a.level - b.level ||
        (a.className < b.className ? -1 : a.className > b.className ? 1 : 0) ||
        (a.name < b.name ? -1 : 1);
    });
    return uniq;
  }

  /* Resolve a stored feature back to its printed text, when the data is loaded. */
  /* The feature list carried on an actor is deliberately thin - a name and a
     level - so a saved character does not haul the whole printed text of forty
     features around with it. Anything that needs the prose looks it back up. */
  function featureRecord(feature, className) {
    var FT = VT.fivetools;
    if (!FT || !FT.get || !feature) return null;
    /* A subclass feature can be listed without the flag being set, so check
       both pools rather than trusting it. */
    var pools = feature.subclass ? ['subclassfeature', 'classfeature']
                                 : ['classfeature', 'subclassfeature'];
    var hit = null;
    pools.forEach(function (kind) {
      if (hit) return;
      hit = (FT.get(kind) || []).find(function (f) {
        return String(f.name).toLowerCase() === String(feature.name).toLowerCase() &&
          (f.level || 1) === feature.level &&
          (!className || String(f.className || '').toLowerCase() === String(className).toLowerCase());
      }) || null;
    });
    /* Last resort: name and level alone. A subclass feature's className is the
       parent class, but homebrew is not always so tidy. */
    if (!hit) {
      pools.forEach(function (kind) {
        if (hit) return;
        hit = (FT.get(kind) || []).find(function (f) {
          return String(f.name).toLowerCase() === String(feature.name).toLowerCase() &&
            (f.level || 1) === feature.level;
        }) || null;
      });
    }
    return hit;
  }

  function featureText(feature, className) {
    var hit = featureRecord(feature, className);
    return hit ? VT.tags.toText(hit.entries) : '';
  }

  function isASI(f) { return /^ability score improvement/i.test(f.name || ''); }

  /* How many ability score improvements this build has earned, and how many the
     player has actually assigned. */
  function asiStatus(c) {
    var earned = featuresFor(c).filter(isASI).length;
    var spent = (c.asi || []).length;
    return { earned: earned, spent: spent, left: Math.max(0, earned - spent) };
  }

  function derive(c) {
    c = c || {};
    var classes = classesOf(c);
    var primary = classes[0] || null;
    var level = totalLevelOf(c);
    var a = VT.actor.base(c.name || (primary ? primary.cls.name : 'Adventurer'));
    a.team = 'party';
    a.level = level;

    /* Keep the flat, per-class shape on the actor so every existing consumer -
       the battle map, the shop, the party list - keeps working unchanged. */
    a.classes = classes.map(function (e) {
      return { name: e.cls.name, source: e.cls.source || null, level: e.level || 1,
               subclass: e.subclass
                 ? { name: e.subclass.name, shortName: e.subclass.shortName || e.subclass.name,
                     source: e.subclass.source || null } : null };
    });
    a.multiclass = classes.length > 1;
    a.className = classes.map(function (e) {
      return e.cls.name + (e.subclass ? ' (' + (e.subclass.shortName || e.subclass.name) + ')' : '') +
             (classes.length > 1 ? ' ' + e.level : '');
    }).join(' / ');
    a.raceName = c.race
      ? c.race.name + (c.subrace && c.subrace.name ? ' (' + c.subrace.name + ')' : '') : '';
    a.backgroundName = c.background ? c.background.name : '';

    /* Some races say their speed is not reduced by heavy armour - both PHB and
       Athasian dwarves do. It is stated in the race's own trait text and
       nowhere central, so read it here rather than keeping a list of names. */
    a.heavyArmorSpeedOk = /speed is not reduced by wearing heavy armor/i
      .test(JSON.stringify((c.race && c.race.entries) || ''));

    var bonuses = racialBonuses(c);
    /* Ability score improvements stack on top of race, and cap at 20. */
    (c.asi || []).forEach(function (entry) {
      Object.keys(entry.picks || {}).forEach(function (k) {
        if (SRD.ABILITIES.indexOf(k) >= 0) bonuses[k] = (bonuses[k] || 0) + entry.picks[k];
      });
    });
    /* Feats raise scores too, and an Epic Boon raises its cap to 30. */
    var caps = {};
    if (VT.choiceFx) {
      var fb = VT.choiceFx.abilityBonuses({ classes: a.classes, picks: c.picks });
      Object.keys(fb.bonus).forEach(function (k) { bonuses[k] = (bonuses[k] || 0) + fb.bonus[k]; });
      caps = fb.cap;
    }
    var base = c.base || {};
    SRD.ABILITIES.forEach(function (k) {
      a.abilities[k] = U.clamp((base[k] == null ? 10 : base[k]) + (bonuses[k] || 0), 1, caps[k] || 20);
    });

    a.size = c.race ? CV.raceSize(c.race) : 'medium';
    a.speed = c.race ? CV.raceSpeed(c.race) : 30;
    /* What the race walks at, before features and armour. Kept so the feature
       pass can recompute rather than accumulate - it runs again every time
       something is equipped. */
    a.baseSpeed = a.speed;

    /* Only the class you started as grants saving-throw proficiencies. No
       edition gives them on a multiclass, and adding them silently would
       inflate every save the character makes. */
    a.saveProf = (primary && primary.cls.proficiency)
      ? primary.cls.proficiency.filter(function (s) { return SRD.ABILITIES.indexOf(s) >= 0; })
      : [];

    /* Skills chosen on the class step live in the choice tree; skills chosen
       anywhere else (a background, an edit by hand) come in on skillProf. */
    a.skillProf = (c.skillProf || []).slice();
    if (VT.choices && c.picks) {
      VT.choices.chosenSkills({ classes: a.classes, picks: c.picks }).forEach(function (sk) {
        if (a.skillProf.indexOf(sk) < 0) a.skillProf.push(sk);
      });
    }

    /* Tool proficiencies: the fixed grants from the class you started as, plus
       whatever was chosen for the "one of your choice" ones. */
    a.toolProf = [];
    if (VT.choices) {
      var toolBuild = { classes: a.classes, picks: c.picks || {} };
      VT.choices.fixedTools(toolBuild).concat(VT.choices.chosenTools(toolBuild))
        .forEach(function (t) { if (a.toolProf.indexOf(t) < 0) a.toolProf.push(t); });
    }
    (c.toolProf || []).forEach(function (t) {
      if (a.toolProf.indexOf(t) < 0) a.toolProf.push(t);
    });

    var faces = (primary && primary.cls.hd && primary.cls.hd.faces) || 8;
    a.hitDie = faces;
    var conMod = SRD.mod(a.abilities.con);
    a.hpMax = classes.length > 1
      ? VT.multiclass.hitPoints(a.classes, conMod)
      : hitPoints(faces, level, conMod);
    a.hitDiceBreakdown = classes.length > 1 ? VT.multiclass.hitDice(a.classes) : null;
    a.hp = a.hpMax;
    a.hpWhy = classes.length > 1
      ? 'multiclass hit dice' + U.sign(conMod * level) + ' CON over ' + level + ' levels'
      : 'd' + faces + U.sign(conMod) + ' at 1st, then ' + (level - 1) + ' x (' +
        (Math.floor(faces / 2) + 1) + U.sign(conMod) + ' CON)';
    a.ac = armourClass(a, c);
    a.armorName = c.armor ? c.armor.name : '';
    a.shield = !!c.shield;

    /* actions from gear and spells */
    var prof = VT.actor.prof(a);
    var strMod = SRD.mod(a.abilities.str);
    var dexMod = SRD.mod(a.abilities.dex);
    a.actions = [];
    (c.weapons || []).forEach(function (w) {
      var act = CV.weapon(w, { str: strMod, dex: dexMod, prof: prof });
      if (act) a.actions.push(act);
    });

    /* Each class casts off its own ability, so a Cleric/Wizard has two save
       DCs. The sheet leads with the highest and lists the rest. */
    a.spellStats = VT.multiclass.spellStats(a.classes, a);
    var lead = a.spellStats.slice().sort(function (x, y) { return y.dc - x.dc; })[0] || null;
    var castAbility = lead ? lead.ability : null;
    var castMod = castAbility ? SRD.mod(a.abilities[castAbility] || 10) : 0;
    a.castAbility = castAbility || null;
    a.spellDC = lead ? lead.dc : null;
    a.spellAttack = lead ? lead.attack : null;

    (c.spells || []).forEach(function (s) {
      var act = CV.spell(s, { dc: a.spellDC || 13, atk: a.spellAttack || prof, mod: castMod, prof: prof, level: level });
      if (act) a.actions.push(act);
    });



    a.spec = VT.spriteart.autoSpec(a.name, {
      kind: 'humanoid',
      weapon: (c.weapons && c.weapons.length) ? weaponLook(c.weapons[0]) : (castAbility ? 'staff' : 'sword'),
      shield: !!c.shield,
      helm: !!(c.armor && String(c.armor.type || '').indexOf('HA') === 0)
    });

    a.features = featuresFor(c);
    a.asiStatus = asiStatus(c);
    a.picks = U.clone(c.picks || {});
    /* Turn the features that have mechanics into actual mechanics: resources,
       actions, expertise, aura bonuses, unarmoured AC. */
    if (VT.features) VT.features.apply(a, c);

    /* Only after features have had their say — a monk's Martial Arts provides a
       real unarmed strike, and the placeholder must not sit in its place. */
    if (!a.actions.length) {
      a.actions.push(SRD.melee('Unarmed Strike', VT.actor.prof(a) + SRD.mod(a.abilities.str),
        '1' + (SRD.mod(a.abilities.str) ? U.sign(SRD.mod(a.abilities.str)) : ''), 'bludgeoning'));
    }
    /* Choices the player has made - fighting styles, invocations, metamagic,
       feats - become real notes, actions and resources on the sheet. */
    if (VT.choiceFx) VT.choiceFx.apply(a, c);

    a.hitDiceMax = level;
    a.hitDiceUsed = 0;
    a.coins = U.clone(c.coins || VT.coin.emptyPurse());
    /* Equipment lives in the inventory, worn or not, so it can be taken off
       without being thrown away. AC, stealth and speed all follow from what is
       equipped rather than from a build-time choice nothing can revisit.

       This has to come after the inventory exists, not before: an earlier
       version built the gear a hundred lines up and had it silently overwritten
       here. */
    a.inventory = U.clone(c.inventory || []);
    if (VT.gear) {
      var have = {};
      a.inventory.forEach(function (e) { have[String(e.name).toLowerCase()] = e; });
      if (c.armor && !have[String(c.armor.name).toLowerCase()]) {
        VT.gear.add(a, c.armor, { equipped: true });
      }
      if (c.shield && !have.shield) {
        VT.gear.add(a, { name: 'Shield', type: 'S', ac: 2 }, { equipped: true });
      }
      (c.weapons || []).forEach(function (w) {
        if (!have[String(w.name).toLowerCase()]) VT.gear.add(a, w, { equipped: true });
      });
      VT.gear.recompute(a);
    }

    /* Remember how this was built so Edit/level-up can re-derive. */
    a.build = toRefs(c);

    a.notes = [
      a.raceName ? 'Race: ' + a.raceName : '',
      a.backgroundName ? 'Background: ' + a.backgroundName : '',
      a.className ? 'Class: ' + a.className : ''
    ].filter(Boolean).join('\n');
    return a;
  }

  /* ---- build references -------------------------------------------------
     A derived character is a flat statblock, which is all play needs - but
     levelling up has to recompute hit points, proficiency and every attack
     bonus, so it needs the original choices back.

     Storing the whole records would bloat the save (a spell record is several
     KB), so we keep {name, source} references and re-resolve them against the
     compendium. Small, and portable between machines. */
  function ref(r) { return r ? { name: r.name, source: r.source || null } : null; }

  /* A subclass name is only unique within its class: "Champion" exists in both
     printings of Fighter, and there is more than one "Life Domain". Match the
     class and printing too. */
  function subclassFor(clsRec, r) {
    var FT = VT.fivetools;
    if (!FT || !FT.get || !r) return null;
    var hits = (FT.get('subclass') || []).filter(function (sc) {
      if (String(sc.name).toLowerCase() !== String(r.name).toLowerCase()) return false;
      if (String(sc.className || '').toLowerCase() !== String(clsRec.name).toLowerCase()) return false;
      if (clsRec.source && sc.classSource &&
          String(sc.classSource).toLowerCase() !== String(clsRec.source).toLowerCase()) return false;
      if (r.source && sc.source &&
          String(sc.source).toLowerCase() !== String(r.source).toLowerCase()) return false;
      return true;
    });
    return hits[0] || null;
  }

  function toRefs(c) {
    var classes = classesOf(c);
    var first = classes[0] || null;
    return {
      level: totalLevelOf(c), base: U.clone(c.base || {}),
      /* The multiclass list is the truth; cls/subclass/level stay written as
         the primary class so an older build of the app, or an older symbiote
         still on a player's machine, opens the character rather than failing. */
      classes: classes.map(function (e) {
        return { name: e.cls.name, source: e.cls.source || null, level: e.level || 1,
                 subclass: e.subclass ? { name: e.subclass.name, source: e.subclass.source || null } : null };
      }),
      picks: U.clone(c.picks || {}),
      race: ref(c.race), subrace: ref(c.subrace),
      cls: first ? ref(first.cls) : null,
      subclass: first && first.subclass ? ref(first.subclass) : null,
      background: ref(c.background), armor: ref(c.armor), shield: !!c.shield,
      weapons: (c.weapons || []).map(ref),
      spells: (c.spells || []).map(ref),
      skillProf: (c.skillProf || []).slice(),
      toolProf: (c.toolProf || []).slice(),
      asi: U.clone(c.asi || []),
      expertise: (c.expertise || []).slice()
    };
  }

  /* Returns { choices, missing:[label] } - missing tells the UI honestly which
     references could not be found rather than silently dropping them. */
  function fromRefs(refs) {
    var FT = VT.fivetools, missing = [];
    function get(kind, r, label) {
      if (!r) return null;
      var rec = FT.byName(kind, r.name, r.source);
      if (!rec) missing.push((label || kind) + ' "' + r.name + '"');
      return rec;
    }
    /* Resolve the multiclass list, falling back to the single-class fields for
       characters saved before multiclassing existed. */
    var classRefs = (refs.classes && refs.classes.length)
      ? refs.classes
      : (refs.cls ? [{ name: refs.cls.name, source: refs.cls.source,
                       subclass: refs.subclass || null, level: refs.level || 1 }] : []);
    var classes = classRefs.map(function (r) {
      var rec = get('class', { name: r.name, source: r.source }, 'class');
      if (!rec) return null;
      var sub = r.subclass ? subclassFor(rec, r.subclass) : null;
      if (r.subclass && !sub) missing.push('subclass "' + r.subclass.name + '"');
      return { cls: rec, subclass: sub, level: r.level || 1 };
    }).filter(Boolean);

    var choices = {
      level: refs.level, base: U.clone(refs.base || {}),
      classes: classes,
      picks: U.clone(refs.picks || {}),
      skillProf: (refs.skillProf || []).slice(),
      toolProf: (refs.toolProf || []).slice(),
      asi: U.clone(refs.asi || []),
      expertise: (refs.expertise || []).slice(),
      race: get('race', refs.race, 'race'),
      subrace: get('subrace', refs.subrace, 'subrace'),
      cls: classes[0] ? classes[0].cls : get('class', refs.cls, 'class'),
      subclass: classes[0] ? classes[0].subclass : get('subclass', refs.subclass, 'subclass'),
      background: get('background', refs.background, 'background'),
      armor: get('item', refs.armor, 'armour'),
      shield: !!refs.shield,
      weapons: (refs.weapons || []).map(function (r) { return get('item', r, 'weapon'); }).filter(Boolean),
      spells: (refs.spells || []).map(function (r) { return get('spell', r, 'spell'); }).filter(Boolean)
    };
    return { choices: choices, missing: missing };
  }

  /* Re-derive at a new level while keeping everything play has changed since:
     damage taken, conditions, spent uses, hand-edited skill proficiencies. */
  /* Change ONE class's level, leaving the others alone. This is what levelling
     up actually is for a multiclass character: you pick a class and take a
     level in it. `index` is a position in build.classes. */
  function relevelClass(actor, index, newLevel) {
    var refs = actor.build;
    if (!refs) return { ok: false, reason: 'This character has no build data - it was imported as a flat statblock.' };
    var r = fromRefs(refs);
    if (!r.choices.classes.length) {
      return { ok: false, reason: "None of this character's classes are in the loaded data.", missing: r.missing };
    }
    var entry = r.choices.classes[index];
    if (!entry) return { ok: false, reason: 'No such class on this character.' };

    newLevel = U.clamp(newLevel, 0, 20);
    if (newLevel === 0) {
      if (r.choices.classes.length === 1) {
        return { ok: false, reason: 'A character needs at least one class level.' };
      }
      r.choices.classes.splice(index, 1);
    } else {
      entry.level = newLevel;
    }
    if (totalLevelOf(r.choices) > 20) {
      return { ok: false, reason: 'That would take the character past 20th level.' };
    }
    return finishRelevel(actor, r);
  }

  /* Add a class, or take another level in one already held. */
  function addClassLevel(actor, clsRec, subclassRec) {
    var refs = actor.build;
    if (!refs) return { ok: false, reason: 'This character has no build data.' };
    var r = fromRefs(refs);
    var existing = r.choices.classes.filter(function (e) {
      return String(e.cls.name).toLowerCase() === String(clsRec.name).toLowerCase() &&
             String(e.cls.source || '').toLowerCase() === String(clsRec.source || '').toLowerCase();
    })[0];
    if (totalLevelOf(r.choices) >= 20) {
      return { ok: false, reason: 'Already at 20th level.' };
    }
    if (existing) existing.level += 1;
    else r.choices.classes.push({ cls: clsRec, subclass: subclassRec || null, level: 1 });
    return finishRelevel(actor, r);
  }

  function relevel(actor, newLevel) {
    var refs = actor.build;
    if (!refs) return { ok: false, reason: 'This character has no build data — it was imported as a flat statblock.' };
    var r = fromRefs(refs);
    if (!r.choices.cls) {
      return { ok: false, reason: 'Class "' + (refs.cls && refs.cls.name) + '" is not in the loaded data.', missing: r.missing };
    }
    newLevel = U.clamp(newLevel, 1, 20);
    /* A single overall level only has one meaning when there is one class. For
       a multiclass character, put the difference into the class they most
       recently took - the others keep the levels they earned. */
    if (r.choices.classes.length > 1) {
      var delta = newLevel - totalLevelOf(r.choices);
      var last = r.choices.classes[r.choices.classes.length - 1];
      var want = (last.level || 1) + delta;
      if (want < 1) {
        return { ok: false, reason: 'Reduce a specific class instead — that would take ' +
                 last.cls.name + ' below 1st level.' };
      }
      last.level = want;
      return finishRelevel(actor, r);
    }
    r.choices.classes[0].level = newLevel;
    r.choices.level = newLevel;
    return finishRelevel(actor, r);
  }

  /* Everything a re-derive has to carry across, in one place, so that changing
     a level, adding a class and adding a weapon all preserve exactly the same
     things. Play state survives; the build is recomputed. */
  function finishRelevel(actor, r) {
    var refs = actor.build || {};
    r.choices.name = actor.name;
    r.choices.level = totalLevelOf(r.choices);
    r.choices.skillProf = (actor.skillProf || refs.skillProf || []).slice();
    r.choices.toolProf = (actor.toolProf || refs.toolProf || []).slice();

    var damage = Math.max(0, actor.hpMax - actor.hp);
    r.choices.coins = actor.coins;
    r.choices.inventory = actor.inventory;
    r.choices.expertise = actor.expertise || (refs.expertise || []);

    var next = derive(r.choices);
    next.id = actor.id;
    next.hp = Math.max(1, next.hpMax - damage);

    /* Everything below belongs to PLAY, not to the build, and must survive a
       level-up untouched. Losing a party's gold to a level-up is the kind of
       bug that costs a session. */
    next.tempHp = actor.tempHp || 0;
    next.conditions = (actor.conditions || []).slice();
    next.used = U.clone(actor.used || {});
    next.coins = U.clone(actor.coins || VT.coin.emptyPurse());
    next.inventory = U.clone(actor.inventory || []);
    next.spriteId = actor.spriteId || null;
    next.acBonus = actor.acBonus || 0;
    next.deathSaves = U.clone(actor.deathSaves || { s: 0, f: 0 });
    next.hitDiceUsed = Math.min(actor.hitDiceUsed || 0, next.hitDiceMax);
    /* What you are attuned to is a fact about the character, not the build. */
    next.attuned = U.clone(actor.attuned || []);
    if (actor.attuneMax) next.attuneMax = actor.attuneMax;

    /* Spent resources and spell slots are play state: keep what is used, but
       clamp to the new maximums in case a level-up shrank something. */
    var priorUse = {};
    (actor.resources || []).forEach(function (r2) { priorUse[r2.key] = r2.used; });
    (next.resources || []).forEach(function (r2) {
      r2.used = Math.min(priorUse[r2.key] || 0, r2.max);
    });
    if (next.spellSlots && actor.slotsUsed) {
      next.slotsUsed = {};
      if (next.spellSlots.pact) {
        next.slotsUsed.pact = Math.min(actor.slotsUsed.pact || 0, next.spellSlots.count);
      } else {
        next.spellSlots.slots.forEach(function (n2, i2) {
          next.slotsUsed[i2 + 1] = Math.min(actor.slotsUsed[i2 + 1] || 0, n2);
        });
      }
    }
    if (actor.notesCustom) { next.notes = actor.notes; next.notesCustom = true; }
    next.hitDiceMax = next.level;

    /* Which side they fight on, and a sprite the GM chose by hand, are theirs
       and not the class table's. The build re-derives the default look from
       equipped gear, so only an explicit override is worth protecting. */
    if (actor.team) next.team = actor.team;
    if (actor.specCustom) { next.spec = U.clone(actor.spec); next.specCustom = true; }

    /* keep any actions the player added by hand in the Edit tab */
    (actor.actions || []).filter(function (x) { return x.custom; })
      .forEach(function (x) { next.actions.push(U.clone(x)); });
    return { ok: true, actor: next, missing: r.missing };
  }

  VT.charbuild = {
    derive: derive, racialBonuses: racialBonuses,
    armourClass: armourClass, hitPoints: hitPoints, weaponLook: weaponLook,
    toRefs: toRefs, fromRefs: fromRefs, relevel: relevel, baseSubrace: baseSubrace,
    relevelClass: relevelClass, addClassLevel: addClassLevel,
    classesOf: classesOf, totalLevelOf: totalLevelOf,
    subclassFor: subclassFor,
    featuresFor: featuresFor, featureText: featureText, featureRecord: featureRecord, asiStatus: asiStatus, isASI: isASI
  };
})();

/* ===== src/ui/choiceui.js ===== */
/* Virtual Tactics :: ui/choiceui.js
   The choice tree and the class list, as UI, once.

   The Forge and the Tale Sheet symbiote both need to show "you have three
   maneuvers to pick and here are the 23 you may pick from", and a second
   implementation of that would drift inside a week. So this renders neutral
   markup with its own `ch-` class names, and each app skins it.

   Everything it knows about rules it asks VT.choices and VT.multiclass. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, SRD = VT.srd;

  /* Which groups are open, and what has been typed into each search box. Held
     outside the render so a redraw does not collapse what you were reading. */
  var S = { open: {}, q: {}, allSources: false, adding: false, addQ: '' };

  function low(v) { return String(v == null ? '' : v).toLowerCase(); }
  function FT() { return VT.fivetools; }

  /* ==== the class list, with multiclassing =============================== */
  /* opts: { actor, onLevel(index, level), onAdd(clsRec), onSubclass(index, rec),
             readOnly } */
  function renderClasses(host, opts) {
    var a = opts.actor;
    var classes = (a.classes && a.classes.length)
      ? a.classes
      : [{ name: a.className || 'Class', source: null, level: a.level || 1, subclass: null }];

    var wrap = el('div', { class: 'ch-classes' });
    classes.forEach(function (entry, i) {
      var rec = VT.choices.classRecord(entry);
      var scLv = rec ? VT.choices.subclassLevel(rec) : 3;
      var row = el('div', { class: 'ch-class' });
      row.appendChild(el('div', { class: 'ch-class-main' }, [
        el('span', { class: 'ch-class-nm' }, [entry.name]),
        el('span', { class: 'ch-sub' }, [
          entry.subclass ? entry.subclass.name
            : (entry.level >= scLv ? 'no subclass chosen' : 'subclass at ' + U.ord(scLv)),
          rec ? '  ·  d' + ((rec.hd && rec.hd.faces) || 8) : '',
          rec && rec.casterProgression ? '  ·  ' + casterWord(rec.casterProgression) : ''
        ].filter(Boolean).join(''))
      ]));
      if (!opts.readOnly) {
        row.appendChild(el('div', { class: 'ch-steps' }, [
          el('button', { class: 'btn sm', title: 'One level fewer',
            onClick: function () { opts.onLevel(i, entry.level - 1); } }, ['−']),
          el('span', { class: 'ch-lv' }, [String(entry.level)]),
          el('button', { class: 'btn sm', title: 'One level more',
            onClick: function () { opts.onLevel(i, entry.level + 1); } }, ['+'])
        ]));
      } else {
        row.appendChild(el('span', { class: 'ch-lv' }, [String(entry.level)]));
      }
      wrap.appendChild(row);
    });

    var total = classes.reduce(function (n, c) { return n + (c.level || 0); }, 0);
    wrap.appendChild(el('div', { class: 'ch-total' }, [
      'Character level ' + total + '  ·  proficiency ' + U.sign(SRD.profBonus(U.clamp(total, 1, 20))) +
      (classes.length > 1 ? '  ·  ' + castingLine(a) : '')
    ]));

    if (!opts.readOnly) wrap.appendChild(addClassBlock(a, classes, total, opts));
    host.appendChild(wrap);
  }

  function casterWord(p) {
    return p === 'full' ? 'full caster' : p === 'pact' ? 'pact magic'
      : p === 'artificer' ? 'half caster (rounds up)'
      : p === '1/2' ? 'half caster' : p === '1/3' ? 'third caster' : p;
  }

  function castingLine(a) {
    var bits = [];
    if (a.casterLevel) bits.push('caster level ' + a.casterLevel);
    if (a.pactSlots) bits.push('pact ' + a.pactSlots.count + '×' + U.ord(a.pactSlots.slotLevel));
    return bits.join(', ') || 'no spellcasting';
  }

  function addClassBlock(a, classes, total, opts) {
    var box = el('div', { class: 'ch-add' });
    if (total >= 20) {
      box.appendChild(el('div', { class: 'ch-note' }, ['At 20th level — no more class levels to take.']));
      return box;
    }
    if (!FT().loaded) {
      box.appendChild(el('div', { class: 'ch-note' }, ['Connect a data source to add a class.']));
      return box;
    }
    if (!S.adding) {
      box.appendChild(el('button', { class: 'btn sm', onClick: function () {
        S.adding = true; opts.onChange && opts.onChange();
      } }, ['+ Multiclass…']));
      return box;
    }

    box.appendChild(el('div', { class: 'ch-note' }, [
      'Taking a level in a new class. You keep the hit points, proficiencies and ' +
      'features you already have; the new class adds its own. Saving-throw ' +
      'proficiencies are not granted by a multiclass.' +
      (opts.enforce === false
        ? ' Your ability scores are not set yet, so the requirements below are ' +
          'shown but not enforced — check them once you have rolled.'
        : '')
    ]));

    /* Only offer classes from the same printing as the one they started in -
       mixing a 2014 and a 2024 class gives a character two incompatible
       feature trees for the same twenty levels. */
    var first = classes[0];
    var firstRec = VT.choices.classRecord(first);
    var wantSource = firstRec ? low(firstRec.source) : '';

    var list = el('div', { class: 'ch-list' });
    FT().get('class').filter(function (c) {
      if (wantSource && low(c.source) !== wantSource) return false;
      return true;
    }).sort(function (x, y) { return x.name < y.name ? -1 : 1; }).forEach(function (rec) {
      /* 5e checks BOTH ends: you must qualify for the class you are leaving as
         well as the one you are joining. */
      var reason = VT.multiclass.requirementReason(rec, a.abilities);
      if (!reason) {
        for (var ci = 0; ci < classes.length && !reason; ci++) {
          var haveRec = VT.choices.classRecord(classes[ci]);
          if (!haveRec || low(haveRec.name) === low(rec.name)) continue;
          var r2 = VT.multiclass.requirementReason(haveRec, a.abilities);
          if (r2) reason = classes[ci].name + ' ' + r2 + ' to multiclass out';
        }
      }
      var already = classes.filter(function (e) { return low(e.name) === low(rec.name); })[0];
      /* During character CREATION the abilities have not been assigned yet -
         the wizard asks for a class before it asks for scores - so every class
         would fail its requirement and the whole list would be dead. There,
         the requirement is shown but not enforced, and the Review step says if
         one is still unmet. Where the scores are known, it blocks. */
      var blocked = !!reason && opts.enforce !== false;
      var row = el('div', {
        class: 'ch-opt' + (blocked ? ' ch-no' : (reason ? ' ch-caution' : '')),
        onClick: function () {
          if (blocked) return;
          S.adding = false;
          opts.onAdd(rec);
        } }, [
        el('span', { class: 'ch-opt-nm' }, [rec.name,
          already ? el('span', { class: 'ch-sub' }, ['  already ' + already.level]) : null]),
        el('span', { class: 'ch-sub' }, [
          reason ? reason : 'd' + ((rec.hd && rec.hd.faces) || 8) +
            (rec.casterProgression ? ' · ' + casterWord(rec.casterProgression) : '')
        ])
      ]);
      list.appendChild(row);
    });
    box.appendChild(list);
    box.appendChild(el('button', { class: 'btn sm', onClick: function () {
      S.adding = false; opts.onChange && opts.onChange();
    } }, ['Cancel']));
    return box;
  }

  /* ==== the choice tree ================================================== */
  /* opts: { actor, build, onChange, max } - build must be the actor's own
     build object so picks are written where a re-derive will read them. */
  function render(host, opts) {
    var a = opts.actor, build = opts.build;
    if (!build) {
      host.appendChild(el('div', { class: 'ch-note' }, [
        'This character has no build data, so there is nothing to choose from. ' +
        'Characters made in the Character tab carry their choices with them.'
      ]));
      return;
    }
    if (!FT().loaded) {
      host.appendChild(el('div', { class: 'ch-note' }, [
        'Connect your 5etools data to see fighting styles, invocations, metamagic, ' +
        'maneuvers, feats and spell lists.'
      ]));
      return;
    }

    var list = VT.choices.pending(build);
    if (!list.length) {
      host.appendChild(el('div', { class: 'ch-note' }, [
        'Nothing to choose yet — this class makes its first choice at a higher level.'
      ]));
      return;
    }

    var sum = VT.choices.summary(build);
    host.appendChild(el('div', { class: 'ch-head' }, [
      el('span', {}, [sum.unspent
        ? sum.unspent + ' still to choose'
        : 'Everything chosen.']),
      el('label', { class: 'ch-srcs' }, [
        el('input', { type: 'checkbox', checked: S.allSources,
          onChange: function (e) { S.allSources = e.target.checked; opts.onChange(); } }),
        ' every book'
      ])
    ]));

    list.forEach(function (ch) {
      host.appendChild(choiceCard(ch, a, build, opts));
    });
  }

  function choiceCard(ch, a, build, opts) {
    var done = (ch.picked || []).length;
    var short = done < ch.count;
    var card = el('div', { class: 'ch-group' + (short ? ' ch-short' : '') });

    var open = !!S.open[ch.key];
    card.appendChild(el('div', { class: 'ch-group-h', onClick: function () {
      S.open[ch.key] = !open; opts.onChange();
    } }, [
      el('span', { class: 'ch-group-nm' }, [
        ch.label,
        el('span', { class: 'ch-sub' }, ['  ' + (ch.entry ? ch.entry.name : '') +
          (ch.level > 1 ? ' · ' + U.ord(ch.level) + ' level' : '')])
      ]),
      el('span', { class: 'ch-count' + (short ? ' ch-warn' : '') }, [done + ' / ' + ch.count]),
      el('span', { class: 'ch-caret' }, [open ? '▾' : '▸'])
    ]));

    /* what has been picked */
    if (done) {
      var chosen = el('div', { class: 'ch-chosen' });
      (ch.picked || []).forEach(function (p) {
        var name = typeof p === 'string' ? U.cap(p) : p.name;
        chosen.appendChild(el('span', { class: 'ch-pill' }, [
          name,
          abilTag(p),
          el('button', { class: 'ch-x', title: 'Remove', onClick: function (e) {
            e.stopPropagation();
            VT.choices.unpick(build, ch, typeof p === 'string' ? { __skill: p } : p);
            opts.onChange();
          } }, ['×'])
        ]));
      });
      card.appendChild(chosen);
    }

    if (!open) return card;

    /* the options */
    var opts2 = VT.choices.optionsFor(ch, { allSources: S.allSources });
    /* Say so when a setting has taken spells off this class's list, rather
       than leaving the player to wonder where Flame Strike went. */
    if ((ch.kind === 'spell' || ch.kind === 'cantrip') && ch.listFrom && FT().spellListChanges) {
      var changes = FT().spellListChanges(ch.listFrom.name);
      var lost = changes.reduce(function (n, c) { return n + (c.removed || []).length; }, 0);
      if (lost) {
        card.appendChild(el('div', { class: 'ch-note' }, [
          lost + ' spell' + (lost === 1 ? '' : 's') + ' removed from the ' +
          ch.listFrom.name + ' list by ' + changes[0].source + '.'
        ]));
      }
    }
    var q = low(S.q[ch.key] || '');
    if (opts2.length > 12) {
      card.appendChild(el('div', { class: 'ch-search' }, [
        el('input', { type: 'text', placeholder: 'Search ' + opts2.length + ' options',
          value: S.q[ch.key] || '',
          onInput: function (e) { S.q[ch.key] = e.target.value; opts.onChange(); } })
      ]));
    }
    var shown = opts2.filter(function (o) { return !q || low(o.name).indexOf(q) >= 0; });
    var full = done >= ch.count;

    var box = el('div', { class: 'ch-list' });
    shown.slice(0, 300).forEach(function (o) {
      var already = isPicked(ch, o);
      var reason = ch.kind === 'skill' ? '' : VT.choices.prereqReason(o, a, build, ch);
      var blocked = (full && !already) || (!!reason && !already);
      var row = el('div', { class: 'ch-opt' + (already ? ' ch-on' : '') + (blocked ? ' ch-no' : ''),
        onClick: function () {
          if (already) { VT.choices.unpick(build, ch, o); opts.onChange(); return; }
          if (blocked) return;
          VT.choices.pick(build, ch, o);
          opts.onChange();
        } }, [
        el('span', { class: 'ch-opt-nm' }, [o.name]),
        el('span', { class: 'ch-sub' }, [subtitleFor(ch, o, reason)])
      ]);
      box.appendChild(row);
    });
    if (!shown.length) box.appendChild(el('div', { class: 'ch-note' }, ['Nothing matches.']));
    if (shown.length > 300) {
      box.appendChild(el('div', { class: 'ch-note' }, [
        shown.length - 300 + ' more — narrow the search to see them.']));
    }
    card.appendChild(box);

    /* a feat that raises a score has to be told which one */
    (ch.picked || []).forEach(function (p) {
      if (ch.kind !== 'feat' || typeof p === 'string') return;
      var rec = VT.choiceFx.findFeat(p);
      var need = rec && VT.choiceFx.abilityNeed(rec);
      if (!need) return;
      card.appendChild(abilityPicker(p, need, opts));
    });

    /* the printed text of whatever is highlighted */
    if (full && ch.picked.length) {
      var txt = VT.choiceFx.textFor({
        name: ch.picked[ch.picked.length - 1].name,
        source: ch.picked[ch.picked.length - 1].source, kind: ch.kind
      });
      if (txt) card.appendChild(el('div', { class: 'ch-text' }, [txt.slice(0, 900)]));
    }
    return card;
  }

  function abilTag(p) {
    if (!p || !p.abil) return null;
    var bits = Object.keys(p.abil).map(function (k) {
      return SRD.ABILITY_NAME[k] + ' ' + U.sign(p.abil[k]);
    });
    return bits.length ? el('span', { class: 'ch-sub' }, ['  ' + bits.join(', ')]) : null;
  }

  function abilityPicker(pick, need, opts) {
    var box = el('div', { class: 'ch-abil' });
    box.appendChild(el('div', { class: 'ch-note' }, [
      pick.name + ': raise ' + (need.count > 1 ? need.count + ' abilities' : 'one ability') +
      ' by ' + need.amount + (need.max > 20 ? ' (up to ' + need.max + ')' : '')
    ]));
    need.from.forEach(function (k) {
      var on = !!(pick.abil && pick.abil[k]);
      box.appendChild(el('button', {
        class: 'btn sm' + (on ? ' on' : ''),
        onClick: function () {
          pick.abil = pick.abil || {};
          if (on) delete pick.abil[k];
          else {
            var used = Object.keys(pick.abil).length;
            if (used >= need.count) return;
            pick.abil[k] = need.amount;
          }
          opts.onChange();
        }
      }, [SRD.ABILITY_NAME[k]]));
    });
    return box;
  }

  function isPicked(ch, o) {
    var val = ch.kind === 'skill' ? o.__skill : o;
    return (ch.picked || []).some(function (p) {
      if (typeof p === 'string') return low(p) === low(val);
      return low(p.name) === low(o.name) &&
        (!o.source || !p.source || low(p.source) === low(o.source));
    });
  }

  function subtitleFor(ch, o, reason) {
    if (reason) return reason;
    if (ch.kind === 'skill') return SRD.ABILITY_NAME[SRD.SKILL_ABILITY[o.__skill]] || '';
    var bits = [];
    if (ch.kind === 'cantrip' || ch.kind === 'spell') {
      bits.push(o.level ? U.ord(o.level) + ' level' : 'cantrip');
      if (o.school) bits.push(schoolName(o.school));
    }
    if (o.source) bits.push(o.source);
    return bits.join(' · ');
  }

  var SCHOOLS = { A: 'abjuration', C: 'conjuration', D: 'divination', E: 'enchantment',
                  V: 'evocation', I: 'illusion', N: 'necromancy', T: 'transmutation' };
  function schoolName(s) { return SCHOOLS[s] || s; }

  /* ==== what a character has already chosen, for the sheet =============== */
  function renderPicked(host, actor, opts) {
    var picked = actor.picked || [];
    if (!picked.length) return false;
    var byLabel = {};
    picked.forEach(function (p) { (byLabel[p.label] = byLabel[p.label] || []).push(p); });
    Object.keys(byLabel).forEach(function (label) {
      host.appendChild(el('div', { class: 'ch-picked-h' }, [label]));
      byLabel[label].forEach(function (p) {
        var open = !!S.open['pk:' + p.name];
        var body = el('div', { class: 'ch-text' + (open ? '' : ' hidden') });
        if (open) body.textContent = VT.choiceFx.textFor(p) || 'Text unavailable.';
        host.appendChild(el('div', { class: 'ch-opt', onClick: function () {
          S.open['pk:' + p.name] = !open;
          opts && opts.onChange && opts.onChange();
        } }, [
          el('span', { class: 'ch-opt-nm' }, [p.name, abilTag(p)]),
          el('span', { class: 'ch-sub' }, [p.note || (p.applied ? 'applied' : (p.source || ''))])
        ]));
        host.appendChild(body);
      });
    });
    return true;
  }

  VT.choiceUI = {
    render: render, renderClasses: renderClasses, renderPicked: renderPicked,
    state: S, reset: function () { S.open = {}; S.q = {}; S.adding = false; }
  };
})();
