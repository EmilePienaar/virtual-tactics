/* Extract the SRD subset out of a 5etools data folder.

     node tools/extract-srd.js "D:/path/to/5etools/data"

   -> srd/data/... and srd/index.json, which the builds then ship.

   WHY THIS AND NOT A PARSER
   -------------------------
   The first attempt at this read the SRD document (BTMorton/dnd-5e-srd) and
   parsed the numbers back out of markdown prose. It worked, but it was the
   wrong tool: 5etools already ships this material in exactly the shape every
   app here reads, and every record carries an `srd` flag saying whether it is
   part of the freely licensed subset.

   So this filters rather than parses. That means:

     - no chance of a mis-read number, because nothing is re-derived
     - the tagged text ({@atk}, {@hit}, {@damage}) is already there, so
       converted monsters can fight without a rewriting pass
     - the structured fields a parser cannot invent - casterProgression,
       classTableGroups, optionalfeatureProgression, startingProficiencies -
       come through intact

   WHAT MAY BE EXTRACTED, AND WHAT MAY NOT
   ---------------------------------------
   Only records flagged `srd`. That flag IS the licence boundary: it marks the
   material released under the OGL, which is the one part that may be
   redistributed. Everything else in a 5etools folder is book content and stays
   where it is. This tool cannot be talked into copying it - the filter is the
   whole program.

   `srd: true` means "included under its own name". `srd: "Some Name"` means
   included under a DIFFERENT name, because the printed one is Product
   Identity - so the record is renamed to the string. Dropping that rename
   would ship a name that is not licensed.

   SOURCES ARE LEFT ALONE
   ----------------------
   A record keeps `source: "PHB"` rather than being restamped as SRD.
   Cross-references depend on it: a classFeature finds its class by
   `classSource`, a subclass by `classSource` + `subclassSource`, and rewriting
   one side of that without the other silently empties a character's feature
   list. 5etools itself keeps the original source beside the srd flag, and so
   do we.

   Duplication is handled at load time instead: the SRD layer is merged with
   name-level de-duplication, so someone who loads their own PHB keeps theirs.
   See "The bundled SRD" in the design notes. */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'srd');

/* Which array keys hold records in each file, mirroring ARRAY_KEYS in
   src/data/fivetools.js. A file not listed here is not extracted at all -
   fluff, adventures, books and the rest are neither needed nor licensed. */
const WANTED = [
  { file: 'items.json', kind: 'item', keys: ['item'] },
  { file: 'items-base.json', kind: 'item', keys: ['baseitem', 'item'] },
  { file: 'races.json', kind: 'race', keys: ['race', 'subrace'] },
  { file: 'backgrounds.json', kind: 'background', keys: ['background'] },
  { file: 'feats.json', kind: 'feat', keys: ['feat'] },
  { file: 'optionalfeatures.json', kind: 'optionalfeature', keys: ['optionalfeature'] },
  { file: 'conditionsdiseases.json', kind: 'condition', keys: ['condition', 'disease', 'status'] },
  { file: 'actions.json', kind: 'action', keys: ['action'] },
  { file: 'languages.json', kind: 'language', keys: ['language'] },
  { file: 'senses.json', kind: 'sense', keys: ['sense'] },
  { file: 'skills.json', kind: 'skill', keys: ['skill'] },
  { file: 'deities.json', kind: 'deity', keys: ['deity'] },
  { file: 'variantrules.json', kind: 'variantrule', keys: ['variantrule'] }
];

/* Folders whose files are all one kind. */
const FOLDERS = [
  { dir: 'spells', prefix: 'spells-', kind: 'spell', keys: ['spell'] },
  { dir: 'bestiary', prefix: 'bestiary-', kind: 'creature', keys: ['monster'] },
  { dir: 'class', prefix: 'class-', kind: 'class',
    keys: ['class', 'subclass', 'classFeature', 'subclassFeature'] }
];

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

/* The licence filter, and the only thing standing between this tool and
   copying a book. A record is in iff 5etools says it is. */
function srdOf(rec) {
  if (!rec || typeof rec !== 'object') return null;
  const flag = rec.srd;
  if (!flag) return null;
  const out = JSON.parse(JSON.stringify(rec));
  /* `srd: "Name"` - the SRD prints it under a different, non-trademarked
     name. Ship that name; the printed one is Product Identity. */
  if (typeof flag === 'string') {
    out.__srdFrom = rec.name;
    out.name = flag;
  }
  return out;
}

function filterFile(json, keys) {
  const out = {};
  let n = 0;
  for (const k of keys) {
    if (!Array.isArray(json[k])) continue;
    const kept = json[k].map(srdOf).filter(Boolean);
    if (kept.length) { out[k] = kept; n += kept.length; }
  }
  return n ? { json: out, n } : null;
}

function write(rel, obj) {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(obj, null, 1));
}

/* Newer 5etools books do not put class lists on the spell; they live in
   data/spells/sources.json as SOURCE -> spell name -> {class:[...]}. The
   bundled SRD is layered by index.json and never loads a sources.json, so the
   lists are folded onto each spell as `classes.fromClassList` - the older
   shape, which spellsForClass() reads first and treats as self-describing. */
function foldSpellLists(dataDir, spellsByFile) {
  const src = readJSON(path.join(dataDir, 'spells', 'sources.json'));
  if (!src) return 0;
  let tagged = 0;
  for (const file of Object.keys(spellsByFile)) {
    for (const sp of spellsByFile[file]) {
      const book = src[sp.source];
      /* sources.json keys by the name as PRINTED, so a spell the srd flag
         renamed must be looked up under the name it was renamed FROM -
         otherwise every renamed spell silently loses its class list, which is
         seventeen of them, Acid Arrow and Arcane Hand among them. */
      const entry = book && book[sp.__srdFrom || sp.name];
      const classes = entry && entry.class;
      if (!classes || !classes.length) continue;
      sp.classes = sp.classes || {};
      const have = sp.classes.fromClassList || [];
      const merged = have.slice();
      for (const c of classes) {
        if (!merged.some(x => x.name === c.name && x.source === c.source)) merged.push(c);
      }
      sp.classes.fromClassList = merged;
      tagged++;
    }
  }
  return tagged;
}

function main() {
  const dataDir = process.argv[2];
  if (!dataDir) {
    console.error('usage: node tools/extract-srd.js "<path to a 5etools data folder>"');
    console.error('');
    console.error('The folder is the one containing items.json, bestiary/ and class/.');
    process.exit(1);
  }
  if (!fs.existsSync(path.join(dataDir, 'items.json')) ||
      !fs.existsSync(path.join(dataDir, 'bestiary'))) {
    console.error('That does not look like a 5etools data folder: ' + dataDir);
    console.error('Expected items.json and a bestiary/ directory inside it.');
    process.exit(1);
  }

  /* Start clean, or a record dropped upstream lingers forever. */
  fs.rmSync(path.join(OUT, 'data'), { recursive: true, force: true });

  const index = {};
  const report = [];
  let total = 0, renamed = 0;

  const note = (rel, kind) => {
    index[kind] = index[kind] || [];
    if (!index[kind].includes(rel)) index[kind].push(rel);
  };

  for (const w of WANTED) {
    const json = readJSON(path.join(dataDir, w.file));
    if (!json) continue;
    const got = filterFile(json, w.keys);
    if (!got) continue;
    const rel = 'data/' + w.file;
    write(rel, got.json);
    note(rel, w.kind);
    report.push([w.file, got.n]);
    total += got.n;
    for (const k of Object.keys(got.json)) {
      renamed += got.json[k].filter(r => r.__srdFrom).length;
    }
  }

  const spellsByFile = {};
  for (const f of FOLDERS) {
    const dir = path.join(dataDir, f.dir);
    if (!fs.existsSync(dir)) continue;
    let kept = 0, files = 0;
    for (const name of fs.readdirSync(dir).sort()) {
      if (!name.startsWith(f.prefix) || !name.endsWith('.json')) continue;
      if (name.includes('fluff')) continue;
      const json = readJSON(path.join(dir, name));
      if (!json) continue;
      const got = filterFile(json, f.keys);
      if (!got) continue;
      const rel = 'data/' + f.dir + '/' + name;
      write(rel, got.json);
      note(rel, f.kind);
      kept += got.n; files++;
      total += got.n;
      for (const k of Object.keys(got.json)) {
        renamed += got.json[k].filter(r => r.__srdFrom).length;
      }
      if (f.kind === 'spell' && got.json.spell) spellsByFile[rel] = got.json.spell;
    }
    if (files) report.push([f.dir + '/ (' + files + ' file' + (files === 1 ? '' : 's') + ')', kept]);
  }

  /* class spell lists, folded in and rewritten */
  const tagged = foldSpellLists(dataDir, spellsByFile);
  for (const rel of Object.keys(spellsByFile)) {
    write(rel, { spell: spellsByFile[rel] });
  }
  if (tagged) report.push(['  spells given a class list', tagged]);

  fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  const pad = Math.max(...report.map(r => String(r[0]).length));
  console.log('Extracted the SRD subset from ' + dataDir);
  console.log('');
  for (const [label, n] of report) console.log('  ' + String(label).padEnd(pad) + '  ' + n);
  console.log('  ' + 'TOTAL'.padEnd(pad) + '  ' + total +
    (renamed ? '   (' + renamed + ' renamed by the srd flag)' : ''));
  console.log('');
  console.log('Only records flagged `srd` were copied - that flag is the OGL boundary.');
  console.log('Run the builds to ship it.');
}

main();
