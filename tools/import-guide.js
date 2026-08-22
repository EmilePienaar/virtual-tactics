#!/usr/bin/env node
/* Convert a plain-text player's guide into 5etools-schema homebrew.
 *
 *   node tools/import-guide.js <guide.txt> <out.json> [--source DSA]
 *
 * Written against the Dark Sun "Athascon" 5e conversion, whose layout is the
 * one almost every fan supplement ends up with once it has been pasted out of
 * a PDF:
 *
 *   ALL-CAPS HEADING            a section
 *   Trait Name. Body text.      a named entry inside it
 *   3                           a page number, alone on its line
 *   two  spaces  everywhere     column wrapping
 *
 * The output is the SAME schema the books use, which is the entire point: once
 * imported, one of these races is offered by the character builder beside a PHB
 * one, and one of these subclasses appears in the choice tree with its features
 * at the right levels.
 *
 * It emits only what it can point at in the source. Where it cannot work
 * something out it says so on stderr rather than inventing a number - a
 * character sheet built on guessed rules is worse than one with a gap in it.
 */
'use strict';
const fs = require('fs');

/* ==== reading ============================================================ */
/* Two extractions of the same book disagree about what a paragraph is. A web
   render wraps mid-sentence and separates paragraphs with a blank line;
   pdftotext puts each whole paragraph on one long line. So split on every
   newline and glue back only the lines that are continuations - ones carrying
   on a sentence the previous line left open. That reads both correctly. */
function loadParagraphs(file) {
  const lines = fs.readFileSync(file, 'utf8').replace(/ /g, ' ')
    .split(/\n/).map(l => l.replace(/[ \t]+/g, ' ').trim());

  const out = [];
  for (const line of lines) {
    if (!line || /^\d{1,3}$/.test(line)) { out.push(''); continue; }
    const prev = out.length ? out[out.length - 1] : '';
    const continues = prev && !/[.!?:”"’]$/.test(prev) &&
      /^[a-z(]/.test(line) && !isHeading(line);
    if (continues) out[out.length - 1] = prev + ' ' + line;
    else out.push(line);
  }
  return out.filter(Boolean);
}

const HEAD_CHARS = "A-Z0-9'’(),:&\\-– .";
const isHeading = p =>
  new RegExp('^[A-Z][' + HEAD_CHARS + ']+$').test(p) && p.length < 70 && /[A-Z]{3}/.test(p);

/* The export glues body text onto a heading: "GLADIATOR Gladiators are..." */
function splitGlued(p) {
  const m = p.match(new RegExp("^([A-Z][" + HEAD_CHARS + "]{3,60}?)\\s+([A-Z][a-z].*)$"));
  if (!m || !/[A-Z]{3}/.test(m[1])) return null;
  return { head: m[1].trim(), body: m[2].trim() };
}

function sections(paras) {
  const out = [];
  let cur = { head: null, paras: [] };
  for (const p of paras) {
    if (isHeading(p)) { out.push(cur); cur = { head: p, paras: [] }; continue; }
    const g = splitGlued(p);
    if (g && g.head.split(' ').length >= 2) { out.push(cur); cur = { head: g.head, paras: [g.body] }; continue; }
    cur.paras.push(p);
  }
  out.push(cur);
  return out.filter(s => s.head || s.paras.length);
}

/* ==== entries ============================================================ */
const LEADIN = /^(You|Your|The|This|That|These|A|An|When|If|At|As|In|On|Whenever|While|Choose|Alternatively|Starting|Beginning|Additionally|Also|Once|Each|Any|Some|Most|They|Their|It|Its|He|She|We|But|And|For|From|With)$/i;

function namedEntry(p) {
  let m = p.match(/^([A-Z][A-Za-z'’\- ]{2,42})\.\s+(.+)$/) ||
          p.match(/^([A-Z][A-Za-z'’\- ]{2,42}):\s+(.+)$/);
  if (!m) return null;
  const name = m[1].trim();
  if (name.split(' ').length > 5) return null;
  if (LEADIN.test(name.split(' ')[0])) return null;
  return { type: 'entries', name, entries: [m[2].trim()] };
}

function toEntries(paras) {
  const out = [];
  for (const p of paras) {
    const ne = namedEntry(p);
    if (ne) out.push(ne);
    else if (out.length && typeof out[out.length - 1] === 'object' && out[out.length - 1].entries) {
      out[out.length - 1].entries.push(p);
    } else out.push(p);
  }
  return out;
}

function titleCase(s) {
  return s.toLowerCase()
    .replace(/\b[a-z]/g, c => c.toUpperCase())
    .replace(/\b(Of|The|And|A|In|On)\b/g, m => m.toLowerCase())
    .replace(/^./, c => c.toUpperCase())
    .trim();
}

/* "Starting at 6th level", "When you choose this path at 3rd level", "At 18th
   level" - the level a feature arrives. */
function levelOf(text, fallback) {
  const m = text.match(/\b(?:at|reach)\s+(\d+)(?:st|nd|rd|th)\s+level/i) ||
            text.match(/\b(\d+)(?:st|nd|rd|th)\s+level\b/i);
  return m ? parseInt(m[1], 10) : fallback;
}

/* ==== races ============================================================== */
const ABILITY = { strength: 'str', dexterity: 'dex', constitution: 'con',
                  intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

function buildRace(name, paras, SRC, warn) {
  const entries = toEntries(paras);
  const all = paras.join(' ');
  const rec = { name: titleCase(name), source: SRC, page: 0 };

  /* The book states these three different ways depending on the chapter:
     "Your base walking speed is 25 feet", "Speed: 30 feet", "Your walking
     speed is 30 feet". Take whichever appears. */
  const sp = all.match(/(?:base )?walking speed is (\d+)\s*feet/i) ||
             all.match(/Speed[.:]\s*(\d+)\s*feet/i);
  if (sp) rec.speed = parseInt(sp[1], 10);
  else { rec.speed = 30; warn('no walking speed stated for ' + rec.name + ' - defaulted to 30'); }

  const sz = all.match(/Your size is (Tiny|Small|Medium|Large)/i) ||
             all.match(/Size[.:]\s*(?:You are )?(Tiny|Small|Medium|Large)/i) ||
             all.match(/\bYou are (Tiny|Small|Medium|Large)\b/);
  rec.size = [sz ? sz[1][0].toUpperCase() : 'M'];
  if (!sz) warn('no size stated for ' + rec.name + ' - defaulted to Medium');

  const dv = all.match(/Darkvision[^.]{0,60}?range of (\d+)\s*feet/i);
  if (dv) rec.darkvision = parseInt(dv[1], 10);

  const ct = all.match(/Creature Type:?\s*([A-Za-z]+)/i);
  if (ct) rec.creatureTypes = [ct[1].toLowerCase()];

  /* Fixed ability changes, where the race states them. A 2024-style race says
     nothing here and leaves them to the background, which is correct and must
     not be filled in with a guess. */
  const abil = {};
  const inc = all.match(/Your ([A-Za-z]+) score increases by \+?(\d)/i);
  if (inc && ABILITY[inc[1].toLowerCase()]) abil[ABILITY[inc[1].toLowerCase()]] = parseInt(inc[2], 10);
  const dec = all.match(/Your ([A-Za-z, ]+?) scores? (?:are|is) all decreased by (\d)/i);
  if (dec) {
    dec[1].split(/,| and /).map(s => s.trim().toLowerCase()).forEach(w => {
      if (ABILITY[w]) abil[ABILITY[w]] = -parseInt(dec[2], 10);
    });
  }
  if (Object.keys(abil).length) rec.ability = [abil];

  const cap = all.match(/Your ([A-Za-z]+) score maximum is (\d+)/i);
  if (cap && ABILITY[cap[1].toLowerCase()]) {
    rec.__scoreMax = { [ABILITY[cap[1].toLowerCase()]]: parseInt(cap[2], 10) };
  }

  rec.entries = entries;
  return rec;
}

/* ==== the class table ==================================================== */
/* "1st +2 Psionics, Psionic Talents 1 1 4 1 2nd +2 Telepathy 1 1 6 1 ..." */
function parseClassTable(line) {
  const rows = [];
  for (const part of line.split(/(?=\b(?:1st|2nd|3rd|\d+th)\s+\+\d)/)) {
    const m = part.trim().match(/^(\d+)(?:st|nd|rd|th)\s+\+(\d)\s+(.*)$/);
    if (!m) continue;
    const level = parseInt(m[1], 10);
    if (level < 1 || level > 20) continue;
    const rest = m[3].trim();
    const tail = rest.match(/((?:\s\d+)+)\s*$/);
    rows.push({
      level,
      features: (tail ? rest.slice(0, tail.index) : rest)
        .split(/,\s*/).map(s => s.trim()).filter(Boolean),
      nums: tail ? tail[1].trim().split(/\s+/).map(Number) : []
    });
  }
  return rows;
}


/* ==== spells ============================================================= */
/* "Doom Legion 7th-level necromancy Casting Time: 1 minute Range: 360 feet
    Components: V, S, M (a black gem worth at least 1,000cr) Duration: Permanent
    This spell creates skeletons ..."

   One paragraph per spell, every field labelled. The only real trap is the
   school: this guide uses the 2nd-edition name "alteration" for what 5e calls
   transmutation. */
const SCHOOL = {
  abjuration: 'A', conjuration: 'C', divination: 'D', enchantment: 'E',
  evocation: 'V', illusion: 'I', necromancy: 'N', transmutation: 'T',
  alteration: 'T'                      /* the 2e name for transmutation */
};

const SPELL_HEAD = new RegExp(
  '^([A-Z][A-Za-z\u2019\' -]{2,40}?)\\s+' +
  '(?:(\\d+)(?:st|nd|rd|th)[- ]level|([a-z]+)\\s+cantrip)\\s+' +
  '([a-z]+)?\\s*(\\(ritual\\))?\\s*' +
  'Casting Time:\\s*(.+?)\\s+Range:\\s*(.+?)\\s+Components:\\s*(.+?)\\s+Duration:\\s*(.+?)\\s+([A-Z].*)$'
);

function parseTime(txt) {
  const m = String(txt).match(/(\d+)\s*(action|bonus action|reaction|minute|hour|round)/i);
  if (!m) return [{ number: 1, unit: 'action' }];
  const unit = m[2].toLowerCase() === 'bonus action' ? 'bonus' : m[2].toLowerCase();
  return [{ number: parseInt(m[1], 10), unit }];
}

function parseRange(txt) {
  const t = String(txt).trim();
  if (/^self/i.test(t)) return { type: 'point', distance: { type: 'self' } };
  if (/^touch/i.test(t)) return { type: 'point', distance: { type: 'touch' } };
  if (/^sight|^unlimited|^special/i.test(t)) return { type: 'special' };
  const mi = t.match(/(\d+)\s*mile/i);
  if (mi) return { type: 'point', distance: { type: 'miles', amount: parseInt(mi[1], 10) } };
  const ft = t.match(/(\d[\d,]*)\s*(?:feet|foot|ft)/i);
  if (ft) return { type: 'point', distance: { type: 'feet', amount: parseInt(ft[1].replace(/,/g, ''), 10) } };
  return { type: 'special' };
}

function parseComponents(txt) {
  const out = {};
  const t = String(txt);
  if (/\bV\b/.test(t)) out.v = true;
  if (/\bS\b/.test(t)) out.s = true;
  const m = t.match(/\bM\b\s*\(([^)]*)\)/);
  if (m) out.m = m[1].trim();
  else if (/\bM\b/.test(t)) out.m = true;
  return out;
}

function parseDuration(txt) {
  const t = String(txt).trim();
  if (/^instantaneous/i.test(t)) return [{ type: 'instant' }];
  if (/^permanent|^until dispelled/i.test(t)) return [{ type: 'permanent', ends: ['dispel'] }];
  const conc = /concentration/i.test(t);
  const m = t.match(/(\d+)\s*(round|minute|hour|day)/i);
  if (m) {
    const d = { type: 'timed', duration: { type: m[2].toLowerCase(), amount: parseInt(m[1], 10) } };
    if (conc) d.concentration = true;
    return [d];
  }
  return [{ type: 'special' }];
}

function extractSpells(paras, SRC, out, warn) {
  let n = 0;
  for (const p of paras) {
    const m = p.match(SPELL_HEAD);
    if (!m) continue;
    const [, name, lvl, cantripSchool, schoolWord, ritual, time, range, comp, dur, body] = m;
    const schoolName = (cantripSchool || schoolWord || '').toLowerCase();
    const school = SCHOOL[schoolName];
    if (!school) { warn('spell "' + name.trim() + '": unknown school "' + schoolName + '" - skipped'); continue; }
    const rec = {
      name: name.trim(), source: SRC, page: 0,
      level: lvl ? parseInt(lvl, 10) : 0,
      school,
      time: parseTime(time),
      range: parseRange(range),
      components: parseComponents(comp),
      duration: parseDuration(dur),
      entries: [body.trim()]
    };
    if (ritual) rec.meta = { ritual: true };
    out.spell.push(rec);
    n++;
  }
  return n;
}

/* Which classes gained or lost which spells. The tables are column-major - all
   the names, then all the levels - so the names cannot be split apart by
   position. The ADDED lists only ever name spells this same chapter defines, so
   those resolve against the spells just parsed; the REMOVED lists name spells
   from the Player's Handbook, which this file has no way to check, so they are
   taken from the side-car where the book's own wording is transcribed. */
function extractSpellLists(paras, SRC, out, MAP, warn) {
  const text = paras.join('\n');
  const known = out.spell.map(sp => sp.name);
  const byClass = {};

  /* Walk the paragraphs so the "WIZARD MAGIC" heading above an untagged
     "ADDED SPELLS" still says whose list it is. The table is two paragraphs -
     the names, then the levels - so reading stops at the "Level" row. Without
     that stop the last ADDED heading swallows the whole of NEW SPELLS, and
     every spell in the chapter joins the wizard list. */
  let cls = null, collecting = false;
  for (const line of paras) {
    const mc = line.match(/^([A-Z]+)\s+MAGIC\b/);
    if (mc) { cls = titleCase(mc[1]); collecting = false; continue; }
    if (/^NEW SPELLS\b/.test(line)) { collecting = false; cls = null; continue; }
    if (/^ADDED\b/.test(line)) { collecting = true; }
    else if (/^REMOVED\b/.test(line)) { collecting = false; }
    if (!cls || !collecting) continue;

    for (const name of known) {
      if (line.toLowerCase().includes(name.toLowerCase())) {
        (byClass[cls] = byClass[cls] || new Set()).add(name);
      }
    }
    /* the levels row closes the table */
    if (/^Level\b/.test(line)) {
      const levels = (line.match(/\d+(?:st|nd|rd|th)/g) || []).length;
      const names = byClass[cls] ? byClass[cls].size : 0;
      if (levels && names && levels !== names) {
        warn(cls + ': the added-spell table lists ' + levels + ' levels but ' +
             names + ' names were matched');
      }
      collecting = false;
    }
  }

  Object.keys(byClass).forEach(c => {
    byClass[c].forEach(name => {
      const sp = out.spell.find(x => x.name === name);
      if (!sp) return;
      sp.classes = sp.classes || { fromClassList: [] };
      if (!sp.classes.fromClassList.some(e => e.name === c)) {
        sp.classes.fromClassList.push({ name: c, source: 'PHB' });
      }
    });
  });

  /* removals, from the side-car */
  const removals = (MAP && MAP.spellListRemovals) || null;
  if (removals) {
    Object.keys(removals).forEach(c => {
      out.spelllistchange.push({
        name: c + ' spell list', source: SRC,
        className: c, classSource: 'PHB',
        removed: removals[c].slice()
      });
    });
  } else if (/REMOVED/.test(text)) {
    warn('the book removes spells from some class lists, but the side-car has no spellListRemovals to transcribe them into');
  }

  return Object.keys(byClass).map(c => c + ': ' + Array.from(byClass[c]).join(', '));
}


/* ==== equipment ========================================================== */
/* The tables need BOTH extractions of the PDF - see tools/import-tables.js for
   why - so this only runs when --layout gives it the second one. */
const TB = require('./import-tables.js');

const DMG_TYPE = { bludgeoning: 'B', piercing: 'P', slashing: 'S' };
const PROP_CODE = {
  'light': 'L', 'heavy': 'H', 'finesse': 'F', 'finess': 'F', 'reach': 'R',
  'loading': 'LD', 'special': 'S', 'two-handed': '2H', 'versatile': 'V',
  'thrown': 'T', 'ammunition': 'A', 'double': 'DBL', 'vicious': 'VIC'
};

/* "12 cr" / "5 bits" -> whole numbers of the smallest coin, so nothing rounds
   away. 1 ceramic piece is 10 bits. */
function coinToBits(text, units) {
  const t = String(text || '').trim();
  if (!t || /^[─—–]$/.test(t)) return null;
  const m = t.match(/([\d,]+)\s*([a-z]+)/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ''), 10);
  const key = m[2].toLowerCase().replace(/s$/, '');
  const unit = (units || []).find(u => u.key === key || u.key === key + 's');
  return unit ? n * unit.inBase : n;
}

function weightOf(text) {
  const t = String(text || '').trim();
  if (/¼/.test(t)) return 0.25;
  if (/½/.test(t)) return 0.5;
  const m = t.match(/([\d.]+)\s*lb/i);
  return m ? parseFloat(m[1]) : null;
}

function propertyCodes(text) {
  const out = [];
  let range = null;
  String(text || '').split(',').forEach(part => {
    const p = part.trim();
    if (!p) return;
    const word = (p.match(/^[a-z-]+/i) || [''])[0].toLowerCase();
    const code = PROP_CODE[word];
    if (!code) return;
    const paren = p.match(/\(([^)]*)\)/);
    if (word === 'versatile' && paren) out.push('V');
    else out.push(code);
    if ((word === 'thrown' || word === 'ammunition') && paren && /\d+\/\d+/.test(paren[1])) {
      range = paren[1].trim();
    }
    if (word === 'versatile' && paren) out.__versatile = paren[1];
  });
  return { codes: Array.from(new Set(out)), range, raw: String(text || '') };
}

function buildItems(spec, layout, raw, SRC, units, corrections, out, warn) {
  const SKIP = new RegExp('^(Name|Cost|Armor|' +
    Object.keys(spec.categories).join('|').replace(/[()]/g, '') + ')$');
  const STOP = /^\s*\*|^\s*(METAL|ATHASIAN|WEAPON|such as)/;

  const rows = TB.namesFromLayout(layout, spec.heading, 'Cost', STOP);
  if (!rows) { warn('table "' + spec.heading + '" not found in the layout text'); return 0; }

  /* Walk the name column, remembering which category heading we are under. A
     heading can share its name with an item - "Shield" is both - so a row only
     counts as a heading the first time it appears. */
  const names = [], cats = [];
  const usedCat = {};
  let cat = Object.values(spec.categories)[0];
  rows.forEach(r => {
    if (spec.categories[r] && !usedCat[r]) { usedCat[r] = 1; cat = spec.categories[r]; return; }
    if (SKIP.test(r) && !spec.categories[r]) return;
    names.push(r);
    cats.push(cat);
  });
  if (!names.length) { warn('table "' + spec.heading + '" produced no names'); return 0; }

  /* The header prints the columns in this order, and they arrive in it. */
  const runs = TB.runsAfter(raw, spec.heading, 90) || [];
  const specs = spec.kind === 'weapon'
    ? [{ key: 'cost', split: TB.splitCosts },
       { key: 'damage', split: TB.splitDamage },
       { key: 'weight', split: TB.splitWeights },
       { key: 'properties', split: TB.splitProperties }]
    : [{ key: 'cost', split: TB.splitCosts },
       { key: 'ac', split: TB.splitAC },
       { key: 'strength', split: TB.splitStrength },
       { key: 'stealth', split: TB.splitStealth },
       { key: 'weight', split: TB.splitWeights }];

  const cols = TB.readColumns(runs, specs, names.length);
  if (!cols) {
    warn('table "' + spec.heading + '": ' + names.length +
         ' names but the columns do not line up - table skipped');
    return 0;
  }
  const cost = cols.cost, weight = cols.weight;
  const damage = cols.damage || [], ac = cols.ac || [];
  const str = cols.strength || [], stealth = cols.stealth || [];
  const props = cols.properties || [];

  names.forEach((rawName, i) => {
    const name = rawName.replace(/\*+$/, '').trim();
    const nonMetal = /\*$/.test(rawName.trim());
    const fix = (corrections || {})[name] || {};

    const rec = { name, source: SRC, page: 0 };
    const bits = coinToBits(fix.cost || cost[i], units);
    if (bits != null) rec.value = bits;
    const w = weightOf(fix.weight || weight[i]);
    if (w != null) rec.weight = w;

    if (spec.kind === 'weapon') {
      rec.weapon = true;
      rec.weaponCategory = spec.weaponCategory;
      rec.type = cats[i];
      const dm = String(fix.damage || damage[i] || '').match(/^(\d*d?\d+)\s+([a-z]+)/i);
      if (dm && DMG_TYPE[dm[2].toLowerCase()]) {
        rec.dmg1 = dm[1];
        rec.dmgType = DMG_TYPE[dm[2].toLowerCase()];
      }
      const pr = propertyCodes(fix.properties != null ? fix.properties : props[i]);
      if (pr.codes.length) rec.property = pr.codes;
      if (pr.range) rec.range = pr.range;
      if (pr.raw) rec.propertyText = pr.raw;
    } else {
      rec.armor = true;
      rec.type = cats[i];
      const a = String(fix.ac || ac[i] || '');
      const base = a.match(/^(\d+)/);
      if (base) rec.ac = parseInt(base[1], 10);
      if (/\+\s*Dex/i.test(a)) {
        const cap = a.match(/max\.\s*(\d+)/i);
        if (cap) rec.dexterityMax = parseInt(cap[1], 10);
      } else if (rec.type !== 'S') rec.dexterityMax = 0;
      const st = String(fix.strength || str[i] || '').match(/Str\s*(\d+)/i);
      if (st) rec.strength = parseInt(st[1], 10);
      if (/Disadvantage/i.test(String(fix.stealth || stealth[i] || ''))) rec.stealth = true;
    }

    if (nonMetal) {
      rec.entries = ['Cannot be made from metal, or gains no benefit from being made of metal.'];
    }
    out.item.push(rec);
  });
  return names.length;
}

/* ==== subclass recognition =============================================== */
/* A subclass heading either follows one of the setting's naming patterns, or
   its first feature says "when you choose this <thing> at Nth level". Both are
   checked, and everything classified is printed so it can be eyeballed against
   the book's own contents page. */
const SUBCLASS_PATTERNS = [
  /^PATH OF /, /^CIRCLE OF /, /^ORDER OF /, /^WAY OF /, /^COLLEGE OF /,
  /^OATH OF /, /^SCHOOL OF /, / DOMAIN$/, / CONCLAVE$/, / ARCHETYPE$/
];
const SELECTOR = /(PATHS|DOMAINS|CIRCLES|ARCHETYPES|CONCLAVES|ORDERS|TRADITIONS|SPIRITS)$/;
const CLASS_NAMES = ['BARBARIAN', 'BARD', 'CLERIC', 'DRUID', 'FIGHTER', 'MONK',
                     'PALADIN', 'PSION', 'RANGER', 'ROGUE', 'SORCERER', 'WARLOCK', 'WIZARD'];

const CHOOSE_THIS = /(choose|select|adopt|gain)\s+this\s+(path|archetype|domain|circle|order|conclave|tradition)/i;

/* A CHARACTER level, as a feature states it - not "a spell of 3rd level or
   higher", which the looser levelOf() would happily match. */
const FEATURE_LEVEL = /(?:at|starting at|beginning at|reach|when you reach)\s+(\d+)(?:st|nd|rd|th)\s+level/i;
function featureLevel(text) {
  const m = text.match(FEATURE_LEVEL);
  return m ? parseInt(m[1], 10) : null;
}

/* When a side-car names the book's subclasses - transcribed from its own
   contents page - use that and nothing else. Telling a subclass from its first
   feature is a question about layout, not about language, and a wrong answer
   quietly puts a feature into the choice tree as a path you can take. The
   heuristic below is the fallback for a guide with no side-car. */
function looksLikeSubclass(secs, i, known) {
  const sec = secs[i];
  if (known) return known.has(sec.head.toUpperCase().replace(/[^A-Z ]/g, '').trim());
  if (SUBCLASS_PATTERNS.some(re => re.test(sec.head))) return true;
  const own = sec.paras.join(' ');
  /* The giveaway is which section states the level. A FEATURE says "when you
     choose this archetype at 3rd level" or "Starting at 6th level"; a SUBCLASS
     is flavour with no level of its own, followed by a run of features that do
     have one. Checking only the sections AFTER it is what keeps a feature like
     "Brawler" from being mistaken for a path in its own right. */
  if (featureLevel(own) != null) return false;
  if (own.split(' ').length < 25) return false;      // too short to be flavour
  let levelled = 0;
  for (let j = i + 1; j <= i + 4 && j < secs.length; j++) {
    const body = secs[j].paras.join(' ');
    if (CHOOSE_THIS.test(body)) return true;
    if (featureLevel(body) != null) levelled++;
  }
  return levelled >= 2;
}

/* ==== main =============================================================== */
function main() {
  const [, , inFile, outFile, ...rest] = process.argv;
  if (!inFile || !outFile) {
    console.error('usage: node tools/import-guide.js <guide.txt> <out.json> [--source DSA] [--name "..."]');
    process.exit(2);
  }
  const SRC = argOf(rest, '--source') || 'DSA';
  const FULL = argOf(rest, '--name') || 'Dark Sun Player’s Guide (Athascon)';

  const warnings = [];
  const warn = m => warnings.push(m);
  let spellListNote = [];
  let itemNote = '';

  const mapFile = argOf(rest, '--map');
  const MAP = mapFile ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : null;
  /* A subclass belongs to a printing of a class, not to the book that adds it:
     a Dark Sun primal path hangs off the PHB Barbarian, or the character
     builder would look for a "Barbarian" that the guide never defines. The
     record's own `source` stays DSA - that is who wrote it. */
  const classSourceOf = cls =>
    (MAP && MAP.classSource && (MAP.classSource[cls] || MAP.classSource.default)) || SRC;

  const knownFor = cls => {
    if (!MAP || !MAP.subclasses || !MAP.subclasses[cls]) return null;
    return new Set(MAP.subclasses[cls].map(n => n.toUpperCase().replace(/[^A-Z ]/g, '').trim()));
  };

  const paras = loadParagraphs(inFile);
  const secs = sections(paras);
  const out = {
    _meta: { sources: [{ json: SRC, abbreviation: SRC, full: FULL, version: '1', convertedBy: 'tools/import-guide.js' }] },
    race: [], subrace: [], class: [], subclass: [],
    classFeature: [], subclassFeature: [], feat: [], background: [],
    optionalfeature: [], spell: [], spelllistchange: [], item: []
  };

  /* ---- races ---- */
  const SKIP_HEAD = /(NAMES|TRAITS|SUBSPECIES|FOCUS)$/;
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    if (!s.head || !/\bTRAITS$/.test(s.head)) continue;
    let name = s.head.replace(/\s*TRAITS$/, '');
    /* Compare on the first word: "DWARVEN TRAITS" belongs to "DWARF, ATHASIAN"
       and "ELF TRAITS" to "ELF, ATHASIAN", so a fixed slice of the whole
       heading (which would read "ELFA") is the wrong thing to match on. */
    const firstWord = h => (h.match(/[A-Z-]+/) || [''])[0];
    const stem = firstWord(name).slice(0, 4);
    for (let j = i - 1; j >= 0 && j > i - 14; j--) {
      const h = secs[j].head;
      if (!h || SKIP_HEAD.test(h)) continue;
      /* Prefer the fuller heading: "ELF, ATHASIAN" over a bare "ELF". */
      if (firstWord(h).slice(0, 4) === stem) {
        if (h.length > name.length || !/,/.test(name)) name = h;
        break;
      }
    }
    const rec = buildRace(name, s.paras, SRC, warn);
    if (rec.entries.length) out.race.push(rec);
  }

  /* ---- subspecies -> subraces ---- */
  for (const s of secs) {
    if (!s.head || !/SUBSPECIES$/.test(s.head)) continue;
    const stem = s.head.replace(/[^A-Z-]/g, '').slice(0, 4);
    const parent = out.race.find(r => r.name.toUpperCase().replace(/[^A-Z-]/g, '').slice(0, 4) === stem);
    if (!parent) { warn('subspecies block "' + s.head + '" has no matching race'); continue; }
    /* A subspecies block alternates "Name. what it looks like" with the trait
       it grants, and the two are told apart only by indentation - which the
       paragraph collapse has already thrown away. The book names its
       subspecies, so use that list and fold everything after each one into it
       as its trait. */
    const known = (MAP && MAP.subspecies && MAP.subspecies[parent.name])
      ? new Set(MAP.subspecies[parent.name].map(n => n.toLowerCase().replace(/[^a-z]/g, ''))) : null;
    let cur = null;
    for (const e of toEntries(s.paras)) {
      if (!e || !e.name) { if (cur) cur.entries.push(e); continue; }
      const key = e.name.toLowerCase().replace(/[^a-z]/g, '');
      const isSub = known ? known.has(key) : true;
      if (isSub) {
        cur = { name: e.name, source: SRC, raceName: parent.name, raceSource: SRC, entries: e.entries.slice() };
        out.subrace.push(cur);
      } else if (cur) {
        cur.entries.push({ type: 'entries', name: e.name, entries: e.entries });
      }
    }
  }

  /* ---- classes and subclasses ---- */
  let curClass = null, inSubclasses = false, curSub = null;
  for (let i = 0; i < secs.length; i++) {
    const s = secs[i];
    if (!s.head) continue;

    if (CLASS_NAMES.includes(s.head) && s.paras.join(' ').length > 120) {
      curClass = titleCase(s.head); inSubclasses = false; curSub = null;
      continue;
    }
    if (!curClass) continue;
    if (SELECTOR.test(s.head)) { inSubclasses = true; curSub = null; continue; }

    /* a class the guide defines outright, table and all */
    if (MAP && MAP.classTable && MAP.classTable[curClass] && s.head === 'CLASS FEATURES'
        && !out.class.some(c => c.name === curClass)) {
      buildClassFromTable(curClass, MAP.classTable[curClass], secs.slice(i, i + 70), SRC, out, warn);
      continue;
    }

    if (inSubclasses && looksLikeSubclass(secs, i, knownFor(curClass))) {
      const cSrc = classSourceOf(curClass);
      curSub = {
        name: titleCase(s.head),
        shortName: titleCase(s.head).replace(/^(Path|Circle|Order|Way|College|School) of (the )?/i, ''),
        source: SRC, className: curClass, classSource: cSrc,
        subclassFeatures: [], entries: toEntries(s.paras)
      };
      out.subclass.push(curSub);
      continue;
    }

    if (curSub) {
      const body = s.paras.join(' ');
      if (!body) continue;
      const lvl = featureLevel(body) != null ? featureLevel(body) : levelOf(body, null);
      /* Domain spell lists, Circle of the Land terrain tables and the like
         carry no level because they are not features - they are reference
         material for the subclass. Keep them on the subclass rather than
         dropping them on the floor. */
      if (lvl == null) {
        curSub.entries.push({ type: 'entries', name: titleCase(s.head), entries: s.paras.slice() });
        continue;
      }
      const cSrc2 = classSourceOf(curClass);
      out.subclassFeature.push({
        name: titleCase(s.head), source: SRC, page: 0,
        className: curClass, classSource: cSrc2,
        subclassShortName: curSub.shortName, subclassSource: SRC,
        level: lvl, entries: toEntries(s.paras)
      });
      curSub.subclassFeatures.push(
        [titleCase(s.head), curClass, cSrc2, curSub.shortName, SRC, lvl].join('|'));
    }
  }

  /* ---- psionic disciplines, and anything shaped like them ---- */
  if (MAP && MAP.classTable) {
    Object.keys(MAP.classTable).forEach(cls => {
      const spec = MAP.classTable[cls];
      if (!spec.disciplineFeatureType) return;
      const n = extractDisciplines(paras, SRC, spec.disciplineFeatureType, out);
      if (!n) warn('no options found for ' + cls + "'s " + (spec.disciplineColumn || 'options'));
    });
  }

  /* ---- equipment ---- */
  const layoutFile = argOf(rest, '--layout');
  if (layoutFile && MAP && MAP.itemTables) {
    const layoutText = fs.readFileSync(layoutFile, 'utf8');
    const rawText = fs.readFileSync(inFile, 'utf8').replace(/\r/g, '');
    const units = (MAP.currency && MAP.currency.denominations) || [];
    let n = 0;
    MAP.itemTables.forEach(spec => {
      n += buildItems(spec, layoutText, rawText, SRC, units, MAP.itemCorrections, out, warn);
    });
    if (n) itemNote = n + ' items from ' + MAP.itemTables.length + ' tables';
  } else if (MAP && MAP.itemTables) {
    warn('the guide has equipment tables but no --layout text was given, so none were read');
  }

  /* ---- spells, and the class lists they join or leave ---- */
  const nSpells = extractSpells(paras, SRC, out, warn);
  if (nSpells) {
    const lists = extractSpellLists(paras, SRC, out, MAP, warn);
    if (lists.length) spellListNote = lists;
  }

  /* ---- feats ---- */
  const fStart = secs.findIndex(s => s.head && /^CHAPTER 4/.test(s.head));
  const fEnd = secs.findIndex(s => s.head && /^CHAPTER 5/.test(s.head));
  if (fStart >= 0) {
    for (let i = fStart + 1; i < (fEnd < 0 ? secs.length : fEnd); i++) {
      const s = secs[i];
      if (!s.head) continue;
      const body = s.paras.join(' ');
      if (!/Repeatable:/i.test(body)) continue;          // the real feats all state it
      const rec = { name: titleCase(s.head), source: SRC, page: 0 };
      const pre = body.match(/Prerequisite:\s*(.*?)\s*Repeatable/i);
      const lvl = pre && pre[1].match(/(\d+)(?:st|nd|rd|th)\s+level/i);
      const at = lvl ? parseInt(lvl[1], 10) : 1;
      rec.category = at >= 4 ? 'G' : 'O';
      if (at > 1) rec.prerequisite = [{ level: at }];
      if (/Repeatable:\s*Yes/i.test(body)) rec.repeatable = true;
      rec.entries = toEntries(s.paras.filter(p => !/^(Prerequisite|Repeatable):/i.test(p)));
      out.feat.push(rec);
    }
  }

  /* ---- backgrounds: Title Case headings, not caps ---- */
  const bgAt = secs.findIndex(s => s.head && /CHARACTER BACKGROUNDS/i.test(s.head));
  if (bgAt >= 0) {
    let cur = null;
    for (let i = bgAt; i < secs.length; i++) {
      const s = secs[i];
      if (s.head && /^CHAPTER/.test(s.head) && i > bgAt) break;
      for (const p of s.paras) {
        if (/^[A-Z][A-Za-z'’\- ]{2,28}$/.test(p) && p.split(' ').length <= 3 && !/:/.test(p)) {
          cur = { name: titleCase(p), source: SRC, page: 0, entries: [] };
          out.background.push(cur);
          continue;
        }
        if (!cur) continue;
        const ne = namedEntry(p);
        cur.entries.push(ne || p);
      }
    }
  }

  /* clean up the private marker we used for score caps */
  out.race.forEach(r => { delete r.__scoreMax; });

  fs.writeFileSync(outFile, JSON.stringify(out, null, 1));
  const counts = Object.keys(out).filter(k => Array.isArray(out[k]) && out[k].length)
    .map(k => k + ' ' + out[k].length).join(', ');
  console.log('Wrote ' + outFile);
  console.log('  ' + counts);
  console.log('  subclasses: ' + out.subclass.map(s => s.className + '/' + s.name).join(', '));
  /* Say plainly which of the book's own subclasses never turned up. */
  if (MAP && MAP.subclasses) {
    const got = new Set(out.subclass.map(s => s.className + '|' + s.name.toUpperCase()));
    const missing = [];
    Object.keys(MAP.subclasses).forEach(cls => {
      MAP.subclasses[cls].forEach(n => {
        if (!got.has(cls + '|' + n.toUpperCase())) missing.push(cls + '/' + n);
      });
    });
    if (missing.length) console.log('  NOT FOUND in the text: ' + missing.join(', '));
    else console.log('  all ' + got.size + ' subclasses the contents page lists were found');
  }
  if (itemNote) console.log('  equipment: ' + itemNote);
  if (spellListNote.length) {
    console.log('  spell lists: ' + spellListNote.join('; '));
  }
  if (warnings.length) {
    console.log('\n  ' + warnings.length + ' things it would not guess at:');
    warnings.slice(0, 25).forEach(w => console.log('    - ' + w));
  }
}

/* ---- a class the guide defines outright ---- */
/* The table comes from the side-car, because pdftotext renders it column-major
   and the Features column arrives as one undelimited run of words. What CAN be
   read from the text is each numeric column - they are labelled and are exactly
   twenty numbers long - so those are checked against the side-car and any
   disagreement is reported rather than silently preferred. */
function buildClassFromTable(name, spec, secs, SRC, out, warn) {
  const text = secs.map(x => x.paras.join(' ')).join(' ');
  const rec = {
    name, source: SRC, page: 0,
    hd: { number: 1, faces: spec.hitDie || 8 },
    proficiency: (spec.saves || []).slice(),
    subclassTitle: spec.subclassTitle || 'Subclass',
    classFeatures: [], classTableGroups: []
  };

  const skillPara = secs.map(x => x.paras).flat().find(p => /^Skills:/i.test(p)) || '';
  const sk = skillPara.match(/Skills:\s*Choose (\w+) skills? from ([A-Za-z, ]+?)\s*$/i);
  if (sk) {
    const count = { one: 1, two: 2, three: 3, four: 4 }[sk[1].toLowerCase()] || parseInt(sk[1], 10) || 2;
    rec.startingProficiencies = {
      skills: [{ choose: { from: sk[2].split(/,| and /).map(x => x.trim().toLowerCase()).filter(Boolean), count } }],
      armor: ['light'], weapons: ['simple']
    };
  }

  /* check the side-car's numbers against the ones printed in the book */
  const cols = spec.columns || {};
  Object.keys(cols).forEach(label => {
    const re = new RegExp(label.replace(/ /g, '\\s+') + '\\s*((?:\\s*\\d+){20})');
    const m = text.match(re);
    if (!m) { warn(name + ': could not find the "' + label + '" column in the text to check against'); return; }
    const found = m[1].trim().split(/\s+/).map(Number);
    if (found.join(',') !== cols[label].join(',')) {
      warn(name + ': the side-car\'s "' + label + '" disagrees with the book — book says ' + found.join(' '));
    }
  });

  rec.classTableGroups.push({
    colLabels: Object.keys(cols),
    rows: Array.from({ length: 20 }, (_, i) => Object.keys(cols).map(k => cols[k][i]))
  });

  const featLevels = {};
  let nFeats = 0;
  Object.keys(spec.features || {}).map(Number).sort((a, b) => a - b).forEach(level => {
    for (const f of spec.features[String(level)]) {
      if (/^Select a Feat$/i.test(f)) { featLevels[level] = ++nFeats; continue; }
      if (/Order|Subclass|Archetype|Domain|Circle/i.test(f) && /Feature|^Psionic Order$/i.test(f) === false && !/^Psionic Order/i.test(f)) {
        /* not a subclass marker */
      }
      if (/^Psionic Order/i.test(f)) {
        rec.classFeatures.push({ classFeature: [f, name, SRC, level].join('|'), gainSubclassFeature: true });
        continue;
      }
      rec.classFeatures.push([f, name, SRC, level].join('|'));
      const sec = secs.find(x => x.head && x.head.toUpperCase() === f.toUpperCase().replace(/\s*\(.*\)$/, ''));
      out.classFeature.push({
        name: f, source: SRC, page: 0, className: name, classSource: SRC, level,
        entries: sec ? toEntries(sec.paras) : ['See the ' + name + ' class description.']
      });
    }
  });
  if (nFeats) rec.featProgression = [{ name: 'Feat', category: ['G'], progression: featLevels }];

  /* Disciplines are picked the way invocations are: give them a featureType and
     the choice tree needs no new code at all. */
  const dc = spec.disciplineColumn;
  if (dc && cols[dc]) {
    const prog = {};
    let last = 0;
    cols[dc].forEach((n, i) => { if (n !== last) { prog[i + 1] = n; last = n; } });
    rec.optionalfeatureProgression = [{
      name: dc, featureType: [spec.disciplineFeatureType || 'OPT'], progression: prog
    }];
  }
  out.class.push(rec);
}

/* ---- disciplines: "Adaptive Body" then "Psychometabolic Discipline ..." ---- */
function extractDisciplines(paras, SRC, featureType, out) {
  let found = 0;
  for (let i = 0; i < paras.length - 1; i++) {
    const name = paras[i];
    const m = paras[i + 1].match(/^([A-Z][a-z]+)\s+Discipline\b\s*(.*)$/);
    if (!m) continue;
    if (!/^[A-Z][A-Za-z'\u2019 -]{2,34}$/.test(name)) continue;
    const body = [m[2]].filter(Boolean).concat(paras.slice(i + 2, i + 3));
    out.optionalfeature.push({
      name, source: SRC, page: 0,
      featureType: [featureType],
      entries: toEntries(body.filter(Boolean))
    });
    found++;
  }
  return found;
}

function argOf(list, flag) { const i = list.indexOf(flag); return i >= 0 ? list[i + 1] : null; }

if (require.main === module) main();
module.exports = { loadParagraphs, sections, toEntries, buildRace, parseClassTable, namedEntry, levelOf };
