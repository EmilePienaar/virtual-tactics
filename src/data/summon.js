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

  /* ---- the three shapes a summon spell takes ------------------------------

     Only sixteen spells have a creature that names them back. The rest say what
     they summon in one of two other ways, and both are just as readable:

       named     Find Familiar and Animate Dead list them outright -
                 "{@creature bat}", "{@creature skeleton}"
       filtered  the Conjure spells give criteria -
                 "{@filter beast of challenge rating 2 or lower|bestiary|
                  challenge rating=[&0;&2]|type=beast|miscellaneous=!swarm}"

     Handling only the first shape was why Find Familiar and every Conjure spell
     did nothing. It was never about which class was casting. */

  function spellText(sp) {
    try { return JSON.stringify(sp.entries || ''); } catch (e) { return ''; }
  }

  /* "{@creature bat}", "{@creature imp|MM}" -> the records themselves. */
  function namedCreatures(sp) {
    var FT = VT.fivetools;
    if (!FT || !FT.get) return [];
    var text = spellText(sp);
    var out = [], seen = {};
    var re = /\{@creature ([^}|]+)/g, m;
    while ((m = re.exec(text)) !== null) {
      var key = m[1].trim().toLowerCase();
      if (seen[key]) continue;
      seen[key] = 1;
      var rec = (FT.get('creature') || []).find(function (c) {
        return String(c.name).toLowerCase() === key;
      });
      if (rec) out.push(rec);
    }
    return out;
  }

  /* A {@filter ...|bestiary|...} clause, read as a bestiary query. */
  function filteredCreatures(sp, level) {
    var FT = VT.fivetools;
    if (!FT || !FT.get) return [];
    var text = spellText(sp);
    var WS = VT.wildshape;
    var best = null;

    var re = /\{@filter ([^|}]*)\|bestiary\|([^}]*)\}/g, m;
    while ((m = re.exec(text)) !== null) {
      var parts = m[2].split('|');
      var maxCr = null, type = null, noSwarm = false;
      parts.forEach(function (piece) {
        var cr = piece.match(/challenge rating=\[&\d+;&(\d+)\]/i);
        if (cr) maxCr = parseInt(cr[1], 10);
        var ty = piece.match(/^type=([^=]+)$/i);
        if (ty) type = ty[1].toLowerCase();
        if (/miscellaneous=!swarm/i.test(piece)) noSwarm = true;
      });
      if (maxCr == null || !type) continue;
      /* The spell lists several bands - CR 2 or lower, CR 1 or lower and more
         of them, and so on. Offer the widest, which is the first. */
      if (!best || maxCr > best.maxCr) best = { maxCr: maxCr, type: type, noSwarm: noSwarm };
    }
    if (!best) return [];

    return (FT.get('creature') || []).filter(function (c) {
      if (String(VT.convert.typeOf(c) || '').toLowerCase().indexOf(best.type) < 0) return false;
      if (best.noSwarm && /swarm/i.test(c.name)) return false;
      var cr = WS.crNumber(VT.convert.crOf(c));
      return cr != null && cr <= best.maxCr;
    }).sort(function (a, b) {
      var d = (WS.crNumber(VT.convert.crOf(a)) || 0) - (WS.crNumber(VT.convert.crOf(b)) || 0);
      return d || String(a.name).localeCompare(String(b.name));
    });
  }

  /* Everything a given summon spell could put on the board. */
  function choicesFor(sp, level) {
    var map = bySpell();
    var direct = map[String(sp.name).toLowerCase()];
    if (direct) return { kind: 'block', list: [direct] };
    var named = namedCreatures(sp);
    if (named.length) return { kind: 'named', list: named };
    var filtered = filteredCreatures(sp, level);
    if (filtered.length) return { kind: 'filtered', list: filtered };
    return { kind: 'none', list: [] };
  }

  /* Does this spell summon anything? The books tag it. */
  function isSummon(sp) {
    return !!(sp && ((sp.miscTags || []).indexOf('SMN') >= 0 ||
                     bySpell()[String(sp.name).toLowerCase()]));
  }

  /* The summon spells this character has, with what each can call up. */
  function available(actor) {
    var FT = VT.fivetools;
    if (!FT || !FT.get) return [];
    var seen = {};
    return (actor.actions || []).filter(function (act) {
      return act.spellLevel != null;
    }).map(function (act) {
      if (seen[act.name]) return null;
      var sp = (FT.get('spell') || []).find(function (x) {
        return String(x.name).toLowerCase() === String(act.name).toLowerCase();
      });
      if (!sp || !isSummon(sp)) return null;
      var lvl = act.spellLevel || sp.level || 1;
      var got = choicesFor(sp, lvl);
      if (!got.list.length) return null;
      seen[act.name] = 1;
      return { spell: act.name, minLevel: lvl, shape: got.kind,
               mon: got.list[0], list: got.list };
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
    isSummon: isSummon, choicesFor: choicesFor,
    namedCreatures: namedCreatures, filteredCreatures: filteredCreatures,
    acAt: acAt, hpAt: hpAt, tagsIn: tagsIn
  };
})();
