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
