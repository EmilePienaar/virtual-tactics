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
