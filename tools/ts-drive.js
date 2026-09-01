/* Drive a symbiote running inside TaleSpire, from outside TaleSpire.

     node tools/ts-drive.js targets
     node tools/ts-drive.js eval "VT.fivetools.get('item').length"
     node tools/ts-drive.js eval "doThing(); return summary"
     node tools/ts-drive.js eval --file check.js
     node tools/ts-drive.js console
     node tools/ts-drive.js errors

   A single expression is evaluated and printed. Several statements need an
   explicit `return`, because they are run as a function body - without one you
   get `undefined`, which looks like a failure and is not. A promise is awaited.

   WHY THIS WORKS
   --------------
   TaleSpire renders symbiotes in Vuplex 3D WebView, which is Chromium, and it
   starts with remote debugging switched on. Its own log says so:

     [3D WebView] Enabling remote debugging for Windows on port 8080.

   That is an ordinary Chrome DevTools Protocol endpoint, so anything that
   speaks CDP can inspect and drive the symbiote's page - read its state, run
   JavaScript in it, click its buttons - while the game is running.

   The alternative was testing symbiote changes by describing them and asking
   someone to click through the game and report back. This closes that loop:
   the same checks that run against the dev server can run against the real
   thing, in the real embedded browser, with the real TS API present.

   WHAT IT CANNOT DO
   -----------------
   Only the web content. The port reaches the symbiote panel, not the game:
   there is no moving a mini, opening a board or clicking TaleSpire's own UI
   from here. Get the symbiote open on screen first, then this can drive it.

   Zero dependencies - Node 22 has both fetch and WebSocket built in. */
'use strict';

const fs = require('fs');

const PORT = (() => {
  const i = process.argv.indexOf('--port');
  return i > 0 ? Number(process.argv[i + 1]) : 8080;
})();

const WANT = (() => {
  const i = process.argv.indexOf('--target');
  return i > 0 ? process.argv[i + 1] : null;
})();

function die(msg, code) {
  console.error(msg);
  process.exit(code == null ? 1 : code);
}

async function targets() {
  let res;
  try {
    res = await fetch('http://127.0.0.1:' + PORT + '/json/list', { signal: AbortSignal.timeout(4000) });
  } catch (e) {
    die('Nothing is listening on port ' + PORT + '.\n\n' +
        '  - Is TaleSpire running?\n' +
        '  - Is a symbiote open? The page only appears once it has been shown.\n' +
        '  - If TaleSpire reported a different port in its log, pass --port N.\n\n' +
        'The log is at:\n' +
        '  %AppData%\\..\\LocalLow\\BouncyRock Entertainment\\TaleSpire\\Player.log\n' +
        '  (search it for "remote debugging")');
  }
  const list = await res.json();
  return list.filter(t => t.type === 'page' || t.webSocketDebuggerUrl);
}

/* The symbiote we mean, when not told which. Prefers ours by URL, because the
   game may have other web content open at the same time. */
function pick(list) {
  if (WANT) {
    const hit = list.find(t => t.id === WANT || (t.url || '').includes(WANT) ||
                               (t.title || '').includes(WANT));
    if (!hit) die('No target matching "' + WANT + '".\nRun `targets` to see what is open.');
    return hit;
  }
  const ours = list.filter(t => /tale-sheet|tale-shop|sheet\.html|shop\.html/i.test(t.url || ''));
  if (ours.length === 1) return ours[0];
  if (ours.length > 1) {
    die('More than one of our symbiotes is open:\n' +
        ours.map(t => '  ' + t.id + '  ' + t.url).join('\n') +
        '\nPick one with --target <id or url fragment>.');
  }
  if (!list.length) die('Nothing inspectable is open. Show a symbiote panel first.');
  if (list.length === 1) return list[0];
  die('Could not tell which page is the symbiote:\n' +
      list.map(t => '  ' + t.id + '  ' + (t.url || '')).join('\n') +
      '\nPick one with --target <id or url fragment>.');
}

/* A CDP session over one target's socket. */
function connect(target) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let next = 1;
    const waiting = new Map();
    const listeners = [];

    ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && waiting.has(msg.id)) {
        const { ok, fail } = waiting.get(msg.id);
        waiting.delete(msg.id);
        msg.error ? fail(new Error(msg.error.message || JSON.stringify(msg.error))) : ok(msg.result);
      } else if (msg.method) {
        listeners.forEach(fn => fn(msg));
      }
    });
    ws.addEventListener('error', () => reject(new Error('Could not open the debug socket.')));
    ws.addEventListener('open', () => resolve({
      send(method, params) {
        const id = next++;
        return new Promise((ok, fail) => {
          waiting.set(id, { ok, fail });
          ws.send(JSON.stringify({ id, method, params: params || {} }));
        });
      },
      on(fn) { listeners.push(fn); },
      close() { ws.close(); }
    }));
  });
}

/* Runtime.evaluate, with the awkward bits handled: a thrown exception comes
   back as a result rather than a rejection, and a promise has to be waited on
   explicitly or you get {} back for every async check. */
async function evaluate(session, expression) {
  const r = await session.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    allowUnsafeEvalBlockedByCSP: true,
    userGesture: true
  });
  if (r.exceptionDetails) {
    const e = r.exceptionDetails;
    const desc = (e.exception && (e.exception.description || e.exception.value)) || e.text;
    throw new Error(String(desc));
  }
  return r.result && ('value' in r.result ? r.result.value : r.result.description);
}

function show(v) {
  if (v === undefined) { console.log('undefined'); return; }
  console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 1));
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\* ?/, ''));
    return;
  }

  const list = await targets();

  if (cmd === 'targets') {
    if (!list.length) { console.log('Nothing inspectable is open.'); return; }
    for (const t of list) {
      console.log(t.id + '  ' + (t.title || '(untitled)') + '\n    ' + (t.url || ''));
    }
    return;
  }

  const target = pick(list);
  const session = await connect(target);

  try {
    if (cmd === 'eval') {
      let expr;
      const fi = process.argv.indexOf('--file');
      if (fi > 0) expr = fs.readFileSync(process.argv[fi + 1], 'utf8');
      else {
        expr = process.argv.slice(3).filter(a =>
          a !== '--port' && a !== '--target' && a !== String(PORT) && a !== WANT).join(' ');
      }
      if (!expr.trim()) die('Nothing to evaluate. Pass an expression or --file <path>.');
      /* Wrapped so a bare statement block and a bare expression both work. */
      show(await evaluate(session, '(function(){ return (' + expr + '); })()')
        .catch(() => evaluate(session, '(function(){ ' + expr + ' })()')));
      return;
    }

    if (cmd === 'console' || cmd === 'errors') {
      const onlyErrors = cmd === 'errors';
      await session.send('Runtime.enable');
      await session.send('Log.enable');
      console.log('Watching ' + (target.url || target.id) + ' - Ctrl+C to stop.');
      session.on(msg => {
        if (msg.method === 'Runtime.consoleAPICalled') {
          const t = msg.params.type;
          if (onlyErrors && t !== 'error' && t !== 'warning') return;
          const text = (msg.params.args || [])
            .map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
          console.log('[' + t + '] ' + text);
        } else if (msg.method === 'Runtime.exceptionThrown') {
          const d = msg.params.exceptionDetails;
          console.log('[uncaught] ' + ((d.exception && d.exception.description) || d.text));
        } else if (msg.method === 'Log.entryAdded') {
          const e = msg.params.entry;
          if (onlyErrors && e.level !== 'error' && e.level !== 'warning') return;
          console.log('[' + e.level + '] ' + e.text + (e.url ? '  (' + e.url + ')' : ''));
        }
      });
      await new Promise(() => {});      /* until Ctrl+C */
    }

    die('Unknown command "' + cmd + '". Try: targets, eval, console, errors.');
  } finally {
    if (cmd !== 'console' && cmd !== 'errors') session.close();
  }
}

main().catch(e => die(String(e && e.message || e)));
