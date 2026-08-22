/* Bundle the whole app into one self-contained HTML file you can email or drop
   in a Discord channel. Because the sources are plain <script> files (no
   modules, no imports), "bundling" really is just concatenation in load order.
     node tools/build-single.js   ->   dist/virtual-tactics.html */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* Inline one page's stylesheets and scripts. `dir` is the page's own directory,
   since the builder lives in builder/ and references ../src/... */
function bundle(pageRel, outName, stripLinks) {
  const dir = path.dirname(path.join(ROOT, pageRel));
  const html = fs.readFileSync(path.join(ROOT, pageRel), 'utf8');

  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  if (!scripts.length) throw new Error('No <script src> tags found in ' + pageRel);

  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  const css = sheets.map(rel => fs.readFileSync(path.join(dir, rel), 'utf8')).join('\n');
  const js = scripts.map(rel =>
    '/* ===== ' + rel + ' ===== */\n' + fs.readFileSync(path.join(dir, rel), 'utf8')).join('\n');

  /* NOTE: the replacements below MUST use function form.
     With a string replacement, String.replace interprets $$, $&, $` and $'
     inside it as substitution patterns. Source code is full of those - notably
     `function $$(sel, root)` in core/util.js, which a string replacement
     silently rewrites to `function $(sel, root)`, clobbering $ and deleting $$.
     The page still loads, which is what makes it nasty. Keep these as arrows. */
  let out = html
    .replace(/<link rel="stylesheet" href="[^"]+">\s*/g, '')
    .replace(/<script src="[^"]+"><\/script>\s*/g, '')
    .replace(/<\/head>/, () => '<style>\n' + css + '\n</style>\n</head>')
    .replace(/<\/body>/, () => '<script>\n' + js + '\n</script>\n</body>');

  /* Cross-links between the two pages cannot survive as separate files. */
  (stripLinks || []).forEach(sel => {
    out = out.replace(sel, '');
  });

  fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
  const dest = path.join(ROOT, 'dist', outName);
  fs.writeFileSync(dest, out);
  console.log('Wrote dist/' + outName +
    '  (' + scripts.length + ' scripts, ' + sheets.length + ' stylesheets, ' +
    (out.length / 1024).toFixed(0) + ' KB)');
}

bundle('index.html', 'virtual-tactics.html',
  [/<a class="tb" href="builder\/index\.html"[^>]*>[^<]*<\/a>\s*<span class="divider"><\/span>\s*/]);
bundle('builder/index.html', 'the-forge.html',
  [/<a class="tb" href="\.\.\/index\.html"[^>]*>[^<]*<\/a>\s*/]);

console.log('\nBoth files are self-contained. The Forge still needs you to point it\n' +
  'at your own 5etools data at runtime - no content is bundled.');
