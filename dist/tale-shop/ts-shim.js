/* Virtual Tactics :: TaleSpire API shim — DEVELOPMENT ONLY.

   Inside TaleSpire this file installs nothing: the real TS object is injected
   after DOMContentLoaded and `hasInitialized` fires, so sheet.js boots against
   the real API and never calls installTSShim().

   Opened in a plain browser, `hasInitialized` never arrives, sheet.js times out
   and installs this instead. It is a genuine emulation rather than a stub -
   dice actually roll, results come back through onRollResults in the real
   payload shape, and evaluateDiceResultsGroup does the real arithmetic - so the
   advantage/disadvantage handling is exercised for real during development. */
(function () {
  'use strict';

  function uid(p) { return p + '_' + Math.random().toString(36).slice(2, 10); }

  /* The shim reads the real manifest so it can fail the way TaleSpire fails.
     Without an api.interop.id, TS.sync.send rejects every call with
     symbioteManifestMissingInteropId - and a symbiote missing one works
     perfectly on one machine and not at all between two, which is precisely
     the bug you do not want to find at the table. */
  var interopId = null, manifestRead = false;
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'manifest.json', false);      /* sync: settled before boot */
    xhr.send(null);
    if (xhr.status >= 200 && xhr.status < 400) {
      var m = JSON.parse(xhr.responseText);
      interopId = m && m.api && m.api.interop && m.api.interop.id || null;
      manifestRead = true;
    }
  } catch (e) { /* served from somewhere without it; do not block development */ }

  /* Build the nested result tree TaleSpire returns for a roll string. */
  function resultTreeFor(rollStr) {
    var terms = window.VT.dice.parse(rollStr);
    if (!terms) return { value: 0 };
    var operands = [];
    terms.forEach(function (t) {
      if (t.n) {
        var results = [];
        for (var i = 0; i < t.n; i++) results.push(1 + Math.floor(Math.random() * t.s));
        operands.push({ kind: 'd' + t.s, results: results, __sign: t.sign });
      } else {
        operands.push({ value: t.flat, __sign: t.sign });
      }
    });
    if (operands.length === 1 && operands[0].__sign > 0) return operands[0];
    /* TaleSpire nests as operations; mirror that with a single +/- chain. */
    return { operator: '+', operands: operands };
  }

  function evaluateNode(node) {
    if (node == null) return 0;
    if (node.operator) {
      return (node.operands || []).reduce(function (sum, o) {
        var v = evaluateNode(o);
        return sum + ((o.__sign != null ? o.__sign : 1) < 0 ? -v : v);
      }, 0);
    }
    if (node.results) return node.results.reduce(function (a, b) { return a + b; }, 0);
    if (node.value != null) return node.value;
    return 0;
  }

  function installTSShim() {
    if (window.TS && window.TS.__real !== false) { /* fall through and replace */ }
    var store = {
      campaign: 'vtactics.ts-shim.campaign',
      global: 'vtactics.ts-shim.global'
    };
    function blobApi(key) {
      return {
        getBlob: function () { return Promise.resolve(localStorage.getItem(key) || ''); },
        setBlob: function (s) { localStorage.setItem(key, s); return Promise.resolve(); },
        deleteBlob: function () { localStorage.removeItem(key); return Promise.resolve(); }
      };
    }

    var TS = {
      __shim: true,
      debug: { log: function (m) { console.log('[TS.debug]', m); return Promise.resolve(); } },

      localStorage: { campaign: blobApi(store.campaign), global: blobApi(store.global) },

      dice: {
        isValidRollString: function (s) {
          return Promise.resolve(!window.VT.dice.roll(s).invalid);
        },
        makeRollDescriptors: function (s) {
          return Promise.resolve([{ name: 'Roll', roll: s }]);
        },
        evaluateDiceResultsGroup: function (group) {
          return Promise.resolve(evaluateNode(group && group.result));
        },
        sendDiceResult: function (groups, rollId) {
          console.log('[TS.dice.sendDiceResult]', rollId, groups.map(function (g) {
            return g.name + ' = ' + evaluateNode(g.result);
          }));
          return Promise.resolve(rollId);
        },
        putDiceInTray: function (descriptors, quiet) {
          var rollId = uid('roll');
          var groups = descriptors.map(function (d) {
            return { name: d.name, result: resultTreeFor(d.roll) };
          });
          /* Real TaleSpire waits for the player to throw the dice; emulate the
             asynchronous return so timing bugs surface in development too. */
          setTimeout(function () {
            if (typeof window.onRollResults === 'function') {
              window.onRollResults({
                kind: 'rollResults',
                payload: {
                  rollId: rollId, clientId: 'shim-client',
                  resultsGroups: groups, gmOnly: false, quiet: !!quiet
                }
              });
            }
          }, 260);
          return Promise.resolve(rollId);
        }
      },

      chat: {
        send: function (msg) { console.log('[TS.chat.send]', msg); return Promise.resolve(); },
        multiSend: function (msg) { console.log('[TS.chat.multiSend]', msg); return Promise.resolve(); },
        sendAsCreature: function (msg) { console.log('[TS.chat.sendAsCreature]', msg); return Promise.resolve(); }
      },

      players: {
        whoAmI: function () { return Promise.resolve({ id: 'shim-player', name: 'Dev Player' }); },
        isMe: function (id) { return Promise.resolve(id === 'shim-player'); },
        getPlayersInThisBoard: function () {
          return Promise.resolve([{ id: 'shim-player', name: 'Dev Player' }]);
        },
        getMoreInfo: function (ids) {
          return Promise.resolve((ids || []).map(function (i) {
            return { id: i.id || i, name: 'Dev Player' };
          }));
        }
      },

      /* Cross-client sync. Real broadcasts come back to the sender too, so the
         echo here is faithful - it is exactly the case that needs filtering. */
      sync: {
        /* TaleSpire refuses anything over 500 characters and drops the whole
           message. The shim used to accept any length, which is exactly why a
           real 3,853-character shop broadcast reached the table before anyone
           noticed it could not fit. Fail here the way the real thing does. */
        send: function (str, target) {
          if (manifestRead && !interopId) {
            var noId = new Error('symbioteManifestMissingInteropId');
            console.warn('[TS.sync.send REJECTED] no api.interop.id in manifest.json');
            return Promise.reject(noId);
          }
          if (typeof str === 'string' && str.length > 500) {
            var err = new Error('string too long: max length is 500, length was ' + str.length);
            console.warn('[TS.sync.send REJECTED]', err.message);
            return Promise.reject(err);
          }
          setTimeout(function () {
            if (typeof window.onSyncMessage === 'function') {
              window.onSyncMessage({
                kind: 'syncMessageReceived',
                payload: { str: str, fromClient: { id: 'shim-client' } }
              });
            }
          }, 10);
          console.log('[TS.sync.send ->' + target + ']', str.slice(0, 160));
          return Promise.resolve();
        },
        multiSend: function (str, ids) { return TS.sync.send(str, ids.join(',')); },
        getClientsConnected: function () { return Promise.resolve([{ id: 'shim-client' }]); }
      },

      clients: {
        whoAmI: function () { return Promise.resolve({ id: 'shim-client' }); },
        isMe: function (id) { return Promise.resolve(id === 'shim-client'); },
        getClientsInThisBoard: function () {
          return Promise.resolve([{ id: 'shim-client' }, { id: 'shim-other' }]);
        },
        getMoreInfo: function (ids) {
          return Promise.resolve((ids || []).map(function (i) {
            var id = i.id || i;
            return {
              id: id,
              /* ?mode=gm on the URL runs the dev harness as the GM. Outside
                 TaleSpire there is no real role to read, and testing the GM
                 half otherwise means editing this file. */
              clientMode: id === 'shim-client'
                ? (window.__shimMode ||
                   (/[?&]mode=gm/.test(location.search) ? 'gm' : 'player'))
                : 'player',
              player: { id: 'p_' + id, name: id === 'shim-client' ? 'Dev Player' : 'Other Player' }
            };
          }));
        }
      },

      creatures: {
        getSelectedCreatures: function () { return Promise.resolve([{ id: 'shim-creature' }]); },
        getMoreInfo: function (ids) {
          return Promise.resolve((ids || []).map(function (i) {
            return {
              id: i.id || i, name: 'Selected Mini',
              hp: { name: 'HP', value: 24, max: 32 }, stats: []
            };
          }));
        }
      },

      symbiote: {
        getIfThisSymbioteIsVisible: function () { return Promise.resolve(true); },
        sendNotification: function (t, b) { console.log('[TS.notify]', t, b); return Promise.resolve(); }
      }
    };

    window.TS = TS;

    /* Development handles: flip client role, and inject a message as if it came
       from another player's client so the GM view can be exercised solo. */
    window.__shimSetMode = function (mode) { window.__shimMode = mode; };
    window.__shimInject = function (fromId, obj) {
      if (typeof window.onSyncMessage === 'function') {
        window.onSyncMessage({
          kind: 'syncMessageReceived',
          payload: { str: JSON.stringify(obj), fromClient: { id: fromId } }
        });
      }
    };
    return TS;
  }

  window.installTSShim = installTSShim;
})();
