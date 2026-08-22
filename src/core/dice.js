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
