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
  'src/core/dice.js',
  'src/rules/srd.js',
  'src/render/spriteart.js',
  'src/rules/actor.js',
  'src/data/tags.js',
  'src/data/fivetools.js',
  'src/data/convert.js',
  'src/data/currency.js',
  'src/data/upcast.js',
  'src/data/features.js',
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

  const files = fs.readdirSync(OUT);
  const size = files.reduce((n, f) => n + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('Wrote dist/' + name + '/  "' + manifest.name + '"  (' +
    files.length + ' files, ' + (size / 1024).toFixed(0) + ' KB)');
}

SYMBIOTES.forEach(build);
console.log('\nInstall by copying those folders into');
console.log('  %AppData%\\..\\LocalLow\\BouncyRock Entertainment\\TaleSpire\\Symbiotes\\');
