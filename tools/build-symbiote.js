/* Assemble installable TaleSpire symbiote folders.

   A symbiote is installed as a self-contained directory, so it cannot reach
   back into ../src. This concatenates the shared engine into vendor.js, copies
   the symbiote's own files alongside it, and drops in the shared dev shim.

     node tools/build-symbiote.js   ->   dist/tale-sheet/  and  dist/tale-shop/

   Copy those folders into
     %AppData%\..\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes\ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* Load order matters: each module reads the ones above it at definition time. */
const ENGINE = [
  'src/core/util.js',
  'src/core/sync.js',
  'src/core/dice.js',
  'src/rules/srd.js',
  'src/render/spriteart.js',
  'src/rules/actor.js',
  'src/rules/gear.js',
  'src/rules/proficiency.js',
  'src/rules/itemfx.js',
  'src/rules/resist.js',
  'src/data/tags.js',
  'src/data/fivetools.js',
  'src/data/convert.js',
  'src/data/currency.js',
  'src/data/upcast.js',
  'src/data/features.js',
  'src/data/featuretext.js',
  'src/data/wildshape.js',
  'src/data/companion.js',
  'src/data/summon.js',
  'src/data/shops.js',
  'src/data/loot.js',
  'src/data/choices.js',
  'src/data/multiclass.js',
  'src/data/choicefx.js',
  'src/data/homebrew.js',
  'src/data/charbuild.js',
  'src/ui/choiceui.js'
];

/* Shared stylesheets copied in beside the symbiote's own. A symbiote folder has
   to be self-contained - the manifest check below rejects any ../ reference -
   so these are copied rather than linked. */
const SHARED_CSS = ['src/ui/choiceui.css'];

const SYMBIOTES = ['tale-sheet', 'tale-shop'];

function build(name) {
  const SRC = path.join(ROOT, name);
  const OUT = path.join(ROOT, 'dist', name);
  if (!fs.existsSync(SRC)) { console.log('skip ' + name + ' (no source folder)'); return; }

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  /* vendor.js — the shared engine.
     NOTE: joined with an array join, never String.replace with the code as the
     replacement string. Replacement strings treat $$ / $& / $` as substitution
     patterns, which silently rewrites `function $$(sel, root)` in core/util.js. */
  const vendor = ENGINE.map(rel =>
    '/* ===== ' + rel + ' ===== */\n' + fs.readFileSync(path.join(ROOT, rel), 'utf8')
  ).join('\n');
  fs.writeFileSync(path.join(OUT, 'vendor.js'), vendor);

  /* the shared development shim */
  fs.copyFileSync(path.join(ROOT, 'src/dev/ts-shim.js'), path.join(OUT, 'ts-shim.js'));

  for (const rel of SHARED_CSS) {
    fs.copyFileSync(path.join(ROOT, rel), path.join(OUT, path.basename(rel)));
  }

  /* the symbiote's own files, verbatim */
  for (const f of fs.readdirSync(SRC)) {
    const from = path.join(SRC, f);
    if (fs.statSync(from).isDirectory()) continue;
    fs.copyFileSync(from, path.join(OUT, f));
  }

  /* homebrew/ travels with the symbiote.

     The 5etools data cannot ship - that is the whole point of the runtime data
     source - but a converted supplement can, and putting it here means it needs
     no directory picker, no filesystem API and no per-machine import. Fetching
     a file next to the page is the only thing that works in every browser on
     every OS, which is what makes this the answer for anyone the folder picker
     does not serve.

     index.json names what to load; without it the loader finds nothing, since
     http offers no directory listing. */
  const HB_SRC = path.join(ROOT, 'homebrew');
  if (fs.existsSync(path.join(HB_SRC, 'index.json'))) {
    const idx = JSON.parse(fs.readFileSync(path.join(HB_SRC, 'index.json'), 'utf8'));
    const wanted = (idx.toImport || []).filter(f => fs.existsSync(path.join(HB_SRC, f)));
    const stale = (idx.toImport || []).filter(f => !fs.existsSync(path.join(HB_SRC, f)));
    if (stale.length) {
      console.error('ERROR [' + name + ']: homebrew/index.json lists missing files:', stale);
      process.exit(1);
    }
    if (wanted.length) {
      const HB_OUT = path.join(OUT, 'homebrew');
      fs.mkdirSync(HB_OUT, { recursive: true });
      fs.copyFileSync(path.join(HB_SRC, 'index.json'), path.join(HB_OUT, 'index.json'));
      for (const f of wanted) fs.copyFileSync(path.join(HB_SRC, f), path.join(HB_OUT, f));
      HB_SHIPPED[name] = wanted;
    }
  }

  /* srd/ travels with the symbiote too, on the same reasoning as homebrew/ and
     under a narrower rule: the SRD is the one data set that may be shared, so
     bundling it is what lets the sheet work before anyone has connected a data
     folder. It ships empty from a source checkout; whatever is listed in
     srd/index.json is copied verbatim.

     Every file the index names must exist, for the same reason homebrew's must:
     a symbiote that fetches a file that is not there fails silently at the
     table, and the build is the only place that can still catch it. */
  const SRD_SRC = path.join(ROOT, 'srd');
  if (fs.existsSync(path.join(SRD_SRC, 'index.json'))) {
    const idx = JSON.parse(fs.readFileSync(path.join(SRD_SRC, 'index.json'), 'utf8'));
    const wanted = [];
    for (const kind of Object.keys(idx)) {
      for (const f of idx[kind] || []) if (!wanted.includes(f)) wanted.push(f);
    }
    const stale = wanted.filter(f => !fs.existsSync(path.join(SRD_SRC, f)));
    if (stale.length) {
      console.error('ERROR [' + name + ']: srd/index.json lists missing files:', stale);
      process.exit(1);
    }
    if (wanted.length) {
      const SRD_OUT = path.join(OUT, 'srd');
      fs.mkdirSync(SRD_OUT, { recursive: true });
      fs.copyFileSync(path.join(SRD_SRC, 'index.json'), path.join(SRD_OUT, 'index.json'));
      for (const f of wanted) {
        const dest = path.join(SRD_OUT, f);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(SRD_SRC, f), dest);
      }
      /* OGL 1.0a requires the licence to travel with the content. This is not
         optional and not cosmetic: shipping the data without it is the one way
         to turn a correctly-licensed bundle into an incorrectly-licensed one. */
      const ogl = path.join(SRD_SRC, 'OGL.txt');
      if (!fs.existsSync(ogl)) {
        console.error('ERROR [' + name + ']: srd/ has data but no OGL.txt - ' +
                      'the licence must ship with the content.');
        process.exit(1);
      }
      fs.copyFileSync(ogl, path.join(SRD_OUT, 'OGL.txt'));
      SRD_SHIPPED[name] = wanted;
    }
  }

  /* sanity: the entry point must be self-contained and complete */
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
  const entry = manifest.entryPoint.replace(/^\//, '');
  if (!fs.existsSync(path.join(OUT, entry))) {
    console.error('ERROR [' + name + ']: entryPoint "' + manifest.entryPoint + '" does not exist.');
    process.exit(1);
  }
  const html = fs.readFileSync(path.join(OUT, entry), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
  const outside = refs.filter(u => u.startsWith('../') || /^https?:/.test(u));
  const missing = refs.filter(u => !fs.existsSync(path.join(OUT, u)));
  if (outside.length) {
    console.error('ERROR [' + name + ']: references outside the folder:', outside);
    process.exit(1);
  }
  if (missing.length) {
    console.error('ERROR [' + name + ']: references missing files:', missing);
    process.exit(1);
  }

  /* sanity: the interop id.

     TS.sync.send does nothing at all without one - it rejects with
     symbioteManifestMissingInteropId - so a symbiote that talks to other
     clients must declare it, and it must be a real UUIDv4. Shipping without one
     looks fine on a single machine and fails the moment two people try to use
     it together, which is the worst way to find out. */
  const interop = manifest.api && manifest.api.interop && manifest.api.interop.id;
  const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!interop) {
    console.error('ERROR [' + name + ']: manifest has no api.interop.id - sync will not work.');
    process.exit(1);
  }
  if (!UUID4.test(interop)) {
    console.error('ERROR [' + name + ']: api.interop.id "' + interop + '" is not a UUIDv4.');
    process.exit(1);
  }
  INTEROP_SEEN[name] = interop;

  const files = fs.readdirSync(OUT).filter(f => !fs.statSync(path.join(OUT, f)).isDirectory());
  let size = files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  const hb = HB_SHIPPED[name] || [];
  for (const f of hb) size += fs.statSync(path.join(OUT, 'homebrew', f)).size;
  const srd = SRD_SHIPPED[name] || [];
  for (const f of srd) size += fs.statSync(path.join(OUT, 'srd', f)).size;
  console.log('Wrote dist/' + name + '/  "' + manifest.name + '"  (' +
    files.length + ' files, ' + (size / 1024).toFixed(0) + ' KB' +
    (hb.length ? ', + ' + hb.length + ' homebrew' : '') +
    (srd.length ? ', + ' + srd.length + ' SRD' : '') + ')');
}

const INTEROP_SEEN = {};
const HB_SHIPPED = {};
const SRD_SHIPPED = {};
SYMBIOTES.forEach(build);

/* Two symbiotes sharing an interop id is how the API lets them message each
   other - but TaleSpire would not load ours while they did, and each one only
   needs to reach its own copies on other clients. Keep them distinct, and say
   so loudly if they ever drift back together. */
const usedIds = Object.keys(INTEROP_SEEN).map(k => INTEROP_SEEN[k]);
if (new Set(usedIds).size !== usedIds.length) {
  console.error('ERROR: symbiotes share an interop id:', INTEROP_SEEN);
  process.exit(1);
}

console.log('\nInstall by copying those folders into');
console.log('  %AppData%\\..\\LocalLow\\BouncyRock Entertainment\\TaleSpire\\Symbiotes\\');
