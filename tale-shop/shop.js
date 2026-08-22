/* Tale Shop :: a GM-run shop window for TaleSpire.

   The GM keeps a shelf of reusable shops, stocked from their own 5etools item
   data at real list prices, and opens one for the party to browse. Players see
   the same window live: stock, prices, and what they have bought.

   Stock stays authoritative on the GM's copy — a player's "Buy" is a request
   that the GM's shop applies and re-broadcasts, so two players cannot both take
   the last potion. Coin is deliberately NOT deducted here: a symbiote cannot
   reach another symbiote's storage, so Tale Shop reports the price and Tale
   Sheet's Spend button does the deduction. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, FT = VT.fivetools, COIN = VT.coin;

  var PROTO = 'vtshop1';

  var S = {
    tab: 'shops',
    shops: [], editingId: null, openShopId: null,
    isGM: false, myClientId: null, myName: 'Player',
    liveShop: null,          // players: the shop currently open to them
    receipts: [],
    currency: null,          // custom coin system, or null for D&D standard
    live: false
  };

  var view, tabsBar, toastHost;

  /* The shop model lives in src/data/shops.js so the browser-based Shopsmith
     builds byte-identical shops — an export from one has to drop straight into
     the other. */
  var SHOPS = VT.shops;
  var TEMPLATES = SHOPS.TEMPLATES;
  var isMagic = SHOPS.isMagic;
  var defaultQty = SHOPS.defaultQty;
  var shortNote = SHOPS.shortNote;
  function makeShop(t) { return SHOPS.makeShop(t); }
  function shownPrice(shop, item) { return SHOPS.shownPrice(shop, item); }
  function publicShop(shop) { return SHOPS.publicShop(shop); }

  /* ==== boot ============================================================= */
  var booted = false;

  window.onStateChangeEvent = function (msg) {
    if (msg && msg.kind === 'hasInitialized' && !booted) boot(true);
  };
  setTimeout(function () { if (!booted) boot(false); }, 1800);

  function boot(live) {
    if (booted) return;
    booted = true;
    S.live = !!live;
    view = document.getElementById('view');
    tabsBar = document.getElementById('tabs');
    toastHost = document.getElementById('toast');
    if (!live && typeof window.installTSShim === 'function') window.installTSShim();

    Promise.all([
      loadState(),
      FT.loadCache().catch(function () { return null; }),
      initRole()
    ]).then(function () {
      render();
      autoConnectData();
      if (!S.isGM) syncSend({ p: PROTO, t: 'poll' });   // ask if a shop is open
      if (!live) toast('Running outside TaleSpire — sync is simulated locally.', 'err');
    });
  }

  function initRole() {
    if (!TS.clients || !TS.clients.whoAmI) return Promise.resolve();
    return TS.clients.whoAmI().then(function (me) {
      S.myClientId = me && me.id;
      return TS.clients.getMoreInfo([me.id]);
    }).then(function (info) {
      var c = info && info[0];
      if (c) {
        S.isGM = c.clientMode === 'gm';
        S.myName = (c.player && c.player.name) || 'Player';
      }
    }).catch(function () {});
  }

  function autoConnectData() {
    if (FT.loaded) return;
    FT.reconnectDirectory().then(function (r) {
      if (r && r.ok) return quietLoad();
      var base = new URL('.', window.location.href).href.replace(/\/$/, '');
      FT.useUrl(base);
      return quietLoad();
    }).catch(function () {});
  }
  function quietLoad() {
    return FT.loadAll(function () {}).then(function (stats) {
      if (!stats.records) return;
      FT.saveCache();
      toast('Loaded ' + stats.records + ' records', 'ok');
      render();
    }).catch(function () {});
  }

  /* ==== persistence ====================================================== */
  function loadState() {
    return TS.localStorage.campaign.getBlob().then(function (raw) {
      var d = {};
      try { d = JSON.parse(raw || '{}'); } catch (e) { d = {}; }
      S.shops = (Array.isArray(d.shops) ? d.shops : []).map(SHOPS.normalise);
      S.openShopId = d.openShopId || null;
      S.currency = d.currency || null;
      /* Receipts used to be plain strings; keep old ones readable. */
      S.receipts = (Array.isArray(d.receipts) ? d.receipts : []).map(function (r) {
        return typeof r === 'string' ? { text: r } : r;
      });
      S.splitCodes = d.splitCodes || null;
    }).catch(function () {});
  }

  var saveSoon = U.debounce(function () {
    TS.localStorage.campaign.setBlob(JSON.stringify({
      v: 1, shops: S.shops, openShopId: S.openShopId,
      currency: S.currency, receipts: S.receipts.slice(-40),
      splitCodes: S.splitCodes
    })).catch(function (e) { toast('Could not save: ' + (e && e.cause || e), 'err'); });
  }, 400);
  function save() { saveSoon(); }

  /* ==== helpers ========================================================== */
  function sys() { return S.currency || COIN.DND; }
  function money(base) { return COIN.formatShort(base, sys()); }
  function toast(msg, cls) {
    if (!toastHost) return;
    var n = el('div', { class: 'toast-msg ' + (cls || ''), text: msg });
    toastHost.appendChild(n);
    setTimeout(function () { n.remove(); }, 4200);
  }
  function shopById(id) { return S.shops.find(function (s) { return s.id === id; }) || null; }

  /* The shopkeeper's face: a custom image if the GM supplied one, otherwise the
     same procedural pixel art the game draws creatures with. */
  function keeperPortrait(shop, size) {
    size = size || 56;
    if (shop.keeperImage) {
      return el('img', { src: shop.keeperImage, class: 'keeper-img',
        style: { width: size + 'px', height: (size * 1.2) + 'px' } });
    }
    var spr = VT.spriteart.get(shop.keeperSpec || SHOPS.keeperSpec(shop));
    var c = document.createElement('canvas');
    c.width = size; c.height = Math.round(size * 1.2);
    c.className = 'keeper-img';
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var scale = Math.min(c.width / spr.width, c.height / spr.height);
    var w = spr.width * scale, h = spr.height * scale;
    ctx.drawImage(spr, (c.width - w) / 2, c.height - h, w, h);
    return c;
  }

  /* ==== sync ============================================================= */
  /* Frame it. TaleSpire refuses any single payload over 500 characters, and a
     shop or a mirrored sheet is far bigger than that, so VT.sync cuts the
     message up and the other side puts it back together. */
  function syncSend(obj) {
    if (!TS.sync || !TS.sync.send) return;
    VT.sync.send(TS.sync, JSON.stringify(obj), 'board', function (e) {
      TS.debug.log('sync failed: ' + describeErr(e));
    });
  }

  /* TaleSpire hands back errors in more than one shape; print whichever of
     them actually says something rather than logging "undefined". */
  function describeErr(e) {
    if (!e) return 'unknown';
    return String(e.cause || e.message || e.error || e);
  }

  function broadcastOpenShop() {
    var shop = shopById(S.openShopId);
    if (!shop) { syncSend({ p: PROTO, t: 'close' }); return; }
    syncSend({ p: PROTO, t: 'shop', shop: publicShop(shop), currency: S.currency || null });
  }

  window.onSyncMessage = function (evt) {
    if (!evt || !evt.payload) return;
    var from = evt.payload.fromClient && evt.payload.fromClient.id;
    /* Long messages arrive in frames; this returns null until the last one
       lands, then the whole payload at once. */
    var whole = VT.sync.receive(evt.payload.str, from);
    if (whole == null) return;
    var msg;
    try { msg = JSON.parse(whole); } catch (e) { return; }
    if (!msg || msg.p !== PROTO) return;

    TS.clients.isMe(from).then(function (isMe) {
      if (isMe) return;                       // broadcasts echo back to us

      if (msg.t === 'shop' && !S.isGM) {
        var isNew = !S.liveShop || S.liveShop.id !== msg.shop.id;
        S.liveShop = msg.shop;
        if (msg.currency) S.currency = msg.currency;
        render();
        if (isNew) {
          toast('“' + msg.shop.name + '” is open', 'ok');
          notifyIfHidden('A shop is open', msg.shop.name);
        }
        return;
      }
      if (msg.t === 'close' && !S.isGM) {
        S.liveShop = null; render();
        return;
      }
      if (msg.t === 'poll' && S.isGM) { broadcastOpenShop(); return; }
      if (msg.t === 'buy' && S.isGM) { handlePurchase(msg, from); return; }
      if (msg.t === 'receipt' && !S.isGM && msg.to === S.myClientId) {
        S.receipts.push({ text: msg.text, loot: msg.loot || null, at: Date.now() });
        save(); render();
        toast(msg.text, 'ok');
      }
    }).catch(function () {});
  };

  window.onClientEvent = function (evt) {
    if (!evt) return;
    if (evt.kind === 'clientModeChanged' || evt.kind === 'clientJoinedBoard') {
      initRole().then(function () {
        render();
        if (S.isGM) broadcastOpenShop(); else syncSend({ p: PROTO, t: 'poll' });
      });
    }
  };

  /* The GM's copy owns the stock, so two buyers cannot take the same last item. */
  function handlePurchase(msg, fromClient) {
    var shop = shopById(msg.shopId);
    if (!shop) return;
    /* the loose coin in a hoard is claimed as a whole */
    if (msg.itemId === '__coins') {
      if (!shop.free || !shop.coins || !Object.keys(shop.coins).length) return;
      var taken = U.clone(shop.coins);
      shop.coins = {};
      save(); broadcastOpenShop(); render();
      syncSend({ p: PROTO, t: 'receipt', to: fromClient,
                 text: 'Took the coin from ' + shop.name,
                 loot: SHOPS.lootCode({ from: shop.name, coins: taken }) });
      var cline = (msg.buyer || 'A player') + ' took the coin: ' +
        Object.keys(taken).map(function (k) { return taken[k] + ' ' + k; }).join(', ');
      toast(cline, 'ok');
      postChat(cline);
      return;
    }

    var good = shop.items.find(function (g) { return g.id === msg.itemId; });
    if (!good) return;
    var want = Math.max(1, msg.qty | 0);
    if (good.qty >= 0 && good.qty < want) {
      syncSend({ p: PROTO, t: 'receipt', to: fromClient,
                 text: 'Only ' + good.qty + ' × ' + good.name + ' left.' });
      broadcastOpenShop();
      return;
    }
    if (good.qty >= 0) good.qty -= want;
    var total = shownPrice(shop, good) * want;
    var verb = shop.free ? ' took ' : ' bought ';
    var line = (msg.buyer || 'A player') + verb + want + ' × ' + good.name +
               (shop.free ? '' : ' for ' + COIN.format(total, sys()));

    save();
    broadcastOpenShop();
    render();
    toast(line, 'ok');

    /* The receipt carries a loot code the buyer copies into Tale Sheet. Sent
       within Tale Shop, so it needs nothing of the sheet at all. */
    syncSend({ p: PROTO, t: 'receipt', to: fromClient,
               text: shop.free
                 ? 'Took ' + want + ' × ' + good.name
                 : 'Bought ' + want + ' × ' + good.name + ' — pay ' + COIN.format(total, sys()),
               loot: SHOPS.lootCode({ from: shop.name,
                 items: [{ name: good.name, qty: want, note: good.note || '' }] }) });
    postChat(line);
  }

  function postChat(text) {
    if (!TS.players || !TS.chat) return;
    TS.players.getPlayersInThisBoard().then(function (players) {
      var ids = (players || []).map(function (p) { return p.id; });
      if (ids.length) TS.chat.multiSend(text, ids).catch(function () {});
    }).catch(function () {});
  }

  function notifyIfHidden(title, body) {
    if (!TS.symbiote || !TS.symbiote.getIfThisSymbioteIsVisible) return;
    TS.symbiote.getIfThisSymbioteIsVisible().then(function (vis) {
      if (!vis) TS.symbiote.sendNotification(title, String(body || ''));
    }).catch(function () {});
  }

  /* ==== render =========================================================== */
  function render() {
    document.getElementById('barTitle').textContent = S.isGM ? 'TALE SHOP — GM' : 'TALE SHOP';
    var badge = document.getElementById('roleBadge');
    badge.className = 'badge' + (S.isGM ? ' gm' : (S.liveShop ? ' open' : ''));
    badge.textContent = S.isGM
      ? (S.openShopId ? 'open: ' + (shopById(S.openShopId) || {}).name : S.shops.length + ' shops')
      : (S.liveShop ? 'browsing' : 'no shop open');

    var tabs = S.isGM
      ? [['shops', 'Shops'], ['edit', 'Edit'], ['preview', 'Preview'], ['setup', 'Setup']]
      : [['browse', 'Shop'], ['receipts', 'Purchases']];
    if (!tabs.some(function (t) { return t[0] === S.tab; })) S.tab = tabs[0][0];
    U.clear(tabsBar);
    tabs.forEach(function (t) {
      tabsBar.appendChild(el('button', {
        class: 'tab' + (S.tab === t[0] ? ' on' : ''),
        onClick: function () { S.tab = t[0]; render(); }
      }, [t[1]]));
    });

    U.clear(view);
    ({ shops: renderShops, edit: renderEdit, setup: renderSetup, preview: renderPreview,
       browse: renderBrowse, receipts: renderReceipts }[S.tab] || renderShops)();
  }

  function tierLabel(shop) {
    var key = VT.shops.hoardTier(shop, sys());
    var t = VT.shops.HOARD_TIERS.find(function (x) { return x.key === key; });
    return t ? t.label : 'Treasure';
  }

  /* ---- GM: shop shelf ---- */
  function renderShops() {
    if (!FT.loaded) {
      view.appendChild(el('div', { class: 'warn' }, [
        'No 5etools data connected — new shops would be empty. Connect it in Setup, ' +
        'or build a shop by hand from the Empty Shop template.'
      ]));
    }

    var shelf = el('div', { class: 'card' }, [
      el('h3', {}, ['Your shops — ' + S.shops.length])
    ]);
    if (!S.shops.length) shelf.appendChild(el('div', { class: 'muted' }, ['None yet.']));
    S.shops.forEach(function (shop) {
      var isOpen = S.openShopId === shop.id;
      var card = el('div', { class: 'shopcard' + (isOpen ? ' live' : '') }, [
        el('div', { class: 'keeper-row' }, [
          shop.free ? SHOPS.hoardArt(shop, 42, sys()) : keeperPortrait(shop, 42),
          el('div', { class: 'grow' }, [
            el('div', { class: 'nm' }, [shop.name]),
            el('div', { class: 'keep' }, [
              shop.free
                ? tierLabel(shop) + ' · ' + shop.items.length + ' to take' +
                  (VT.shops.hoardWorth(shop, sys())
                    ? ' · about ' + COIN.format(VT.shops.hoardWorth(shop, sys()), sys()) : '')
                : (shop.keeperName ? shop.keeperName + ', ' : '') + shop.keeper +
                  ' · ' + shop.items.length + ' goods' +
                  (shop.markup !== 100 ? ' · ' + shop.markup + '% prices' : '')
            ])
          ])
        ]),
        el('div', { class: 'btnrow', style: { marginTop: '7px' } }, [
          el('button', { class: 'btn sm ' + (isOpen ? 'danger' : 'primary'), onClick: function () {
            S.openShopId = isOpen ? null : shop.id;
            save(); broadcastOpenShop(); render();
            toast(isOpen ? 'Closed “' + shop.name + '”' : 'Opened “' + shop.name + '” to the party', 'ok');
          } }, [isOpen ? 'Close' : 'Open to party']),
          el('button', { class: 'btn sm', onClick: function () {
            S.editingId = shop.id; S.tab = 'edit'; render();
          } }, ['Edit']),
          el('button', { class: 'btn sm', title: 'Duplicate', onClick: function () {
            var copy = U.clone(shop);
            copy.id = U.uid('shop'); copy.name = shop.name + ' (copy)';
            copy.items.forEach(function (g) { g.id = U.uid('g'); });
            S.shops.push(copy); save(); render();
          } }, ['⧉']),
          el('button', { class: 'btn sm danger', onClick: function () {
            S.shops = S.shops.filter(function (x) { return x.id !== shop.id; });
            if (S.openShopId === shop.id) { S.openShopId = null; broadcastOpenShop(); }
            save(); render();
          } }, ['×'])
        ])
      ]);
      shelf.appendChild(card);
    });
    view.appendChild(shelf);

    /* new from template */
    var tpl = el('div', { class: 'card' }, [
      el('h3', {}, ['New shop from a template']),
      el('p', { class: 'muted', style: { marginTop: 0 } }, [
        'Stocked from your own item data at list prices. Everything is editable afterwards.'
      ]),
      el('div', { class: 'tmplgrid' }, TEMPLATES.map(function (t) {
        return el('button', { class: 'tmpl', onClick: function () {
          var shop = makeShop(t);
          S.shops.push(shop);
          S.editingId = shop.id;
          S.tab = 'edit';
          save(); render();
          toast('Created “' + shop.name + '” with ' + shop.items.length + ' goods', 'ok');
        } }, [
          el('div', { class: 'tn' }, [t.name]),
          el('div', { class: 'td' }, [t.blurb])
        ]);
      }))
    ]);
    view.appendChild(tpl);

    /* treasure */
    var tre = el('div', { class: 'card' }, [
      el('h3', {}, ['New treasure hoard']),
      el('p', { class: 'muted', style: { marginTop: 0 } }, [
        'A hoard is a shop with nothing to pay: the party opens it, sees what is ' +
        'inside and takes it. Stock it by hand, or roll it off the tables in the book.'
      ])
    ]);
    var hoardRow = el('div', { class: 'row' });
    hoardRow.appendChild(el('button', { class: 'btn sm primary', onClick: function () {
      var h = VT.shops.makeHoard('Treasure');
      S.shops.push(h);
      S.editingId = h.id; S.tab = 'edit';
      save(); render();
      toast('Empty hoard created', 'ok');
    } }, ['Empty hoard']));

    if (VT.loot.available()) {
      VT.loot.hoardBands().forEach(function (band) {
        hoardRow.appendChild(el('button', { class: 'btn sm', onClick: function () {
          var h = VT.shops.makeHoard(band.name + ' hoard');
          fillFromLoot(h, band);
          S.shops.push(h);
          S.editingId = h.id; S.tab = 'edit';
          save(); render();
        } }, ['Roll ' + band.name.replace(/^Challenge\s*/, 'CR ')]));
      });
    } else {
      tre.appendChild(el('div', { class: 'muted' }, [
        'Connect your 5etools data to roll treasure from the tables.'
      ]));
    }
    tre.appendChild(hoardRow);
    view.appendChild(tre);
  }

  /* Everything about a hoard that a shop does not have: its picture, the coin
     in it, and handing that coin round the table. */
  function hoardPanel(shop) {
    var card = el('div', { class: 'card' }, [el('h3', {}, ['The hoard'])]);

    var tierRow = el('div', { class: 'keeper-row' });
    tierRow.appendChild(VT.shops.hoardArt(shop, 64, sys()));
    var pickers = el('div', { class: 'grow' });
    pickers.appendChild(el('div', { class: 'muted' }, [
      'Worth about ' + COIN.format(VT.shops.hoardWorth(shop, sys()), sys()) +
      ' — the picture follows the value unless you pick one.'
    ]));
    var row = el('div', { class: 'row' });
    row.appendChild(el('button', {
      class: 'btn sm' + (shop.tier ? '' : ' on'),
      onClick: function () { shop.tier = null; save(); render(); }
    }, ['Automatic']));
    VT.shops.HOARD_TIERS.forEach(function (t) {
      row.appendChild(el('button', {
        class: 'btn sm' + (shop.tier === t.key ? ' on' : ''),
        title: t.label,
        onClick: function () { shop.tier = t.key; save(); render(); broadcastOpenShop(); }
      }, [t.key]));
    });
    pickers.appendChild(row);
    tierRow.appendChild(pickers);
    card.appendChild(tierRow);

    /* coin in the hoard */
    var purse = el('div', { class: 'row', style: { marginTop: '10px' } });
    COIN.denoms(sys()).forEach(function (d) {
      purse.appendChild(el('label', { class: 'coinbox' }, [
        el('span', { class: 'sub' }, [d.key]),
        el('input', { type: 'number', min: 0, value: (shop.coins || {})[d.key] || 0,
          onInput: function (e) {
            shop.coins = shop.coins || {};
            shop.coins[d.key] = Math.max(0, parseInt(e.target.value, 10) || 0);
            save(); broadcastOpenShop();
          } })
      ]));
    });
    card.appendChild(el('div', { class: 'muted' }, ['Loose coin']));
    card.appendChild(purse);

    /* splitting it */
    var ways = 4;
    var touched = false;
    var waysIn = el('input', { type: 'number', min: 1, max: 12, value: 4,
      style: { width: '64px' },
      onInput: function (e) {
        touched = true;
        ways = Math.max(1, parseInt(e.target.value, 10) || 1);
      } });
    /* Default to however many other people are at the table, since that is
       almost always the answer. Left alone if the GM has already typed one. */
    TS.clients.getClientsInThisBoard().then(function (all) {
      var n = (all || []).length - 1;
      if (touched || n < 1) return;
      ways = n; waysIn.value = String(n); showSplit();
    }).catch(function () {});
    var preview = el('div', { class: 'muted' });
    function showSplit() {
      var r = VT.shops.splitCoins(shop.coins || {}, ways, sys());
      preview.textContent = r.total
        ? 'Each gets ' + COIN.format(r.each, sys()) +
          (r.remainder ? ', and ' + r.remainder + ' over goes one each to the first ' +
           r.remainder + '.' : '.')
        : 'No coin in this hoard.';
    }
    showSplit();
    waysIn.addEventListener('input', showSplit);
    card.appendChild(el('div', { class: 'row', style: { marginTop: '8px' } }, [
      el('span', { class: 'sub' }, ['Split between']), waysIn,
      el('button', { class: 'btn sm primary', onClick: function () {
        splitToParty(shop, ways);
      } }, ['Hand it out'])
    ]));
    card.appendChild(preview);
    card.appendChild(el('p', { class: 'muted' }, [
      'Each share becomes a code the player pastes into Tale Sheet. Anyone with ' +
      'Tale Shop open gets theirs automatically; the rest you copy and hand over.'
    ]));

    /* whatever the last split produced, still here to copy */
    var sc = S.splitCodes;
    if (sc && sc.shopId === shop.id && sc.codes && sc.codes.length) {
      var done = el('div', { class: 'card' }, [
        el('h3', {}, ['Shares to hand out']),
        el('div', { class: 'muted' }, [
          'From ' + sc.from + '. These stay here until you clear them, so nothing ' +
          'is lost if you close the panel.'
        ])
      ]);
      sc.codes.forEach(function (c) {
        done.appendChild(copyBox(c.code,
          'Share ' + c.n + ' — ' + c.label + (c.sentTo ? ' (sent to the panel)' : '')));
      });
      done.appendChild(el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn sm danger', onClick: function () {
          S.splitCodes = null; save(); render();
        } }, ['Clear'])
      ]));
      card.appendChild(done);
    }
    return card;
  }

  /* Divide the coin into shares and turn each into a loot code. Anyone in Tale
     Shop gets theirs as a receipt straight away; every share is also listed for
     the GM to copy, so a player who is not looking at the panel can be handed
     one in chat instead. */
  function splitToParty(shop, ways) {
    var r = VT.shops.splitCoins(shop.coins || {}, ways, sys());
    if (!r.total) { toast('No coin to split', 'err'); return; }

    var codes = r.shares.map(function (share, i) {
      return { n: i + 1,
               label: COIN.format(share.base, sys()),
               code: SHOPS.lootCode({ from: shop.name, coins: share.purse }) };
    });

    TS.clients.getClientsInThisBoard().then(function (all) {
      var others = (all || []).map(function (c) { return c.id || c; })
        .filter(function (id) { return id !== S.myClientId; });

      var sent = 0;
      codes.forEach(function (c, i) {
        var to = others[i];
        if (!to) return;
        c.sentTo = to;
        syncSend({ p: PROTO, t: 'receipt', to: to,
                   text: 'Your share of ' + shop.name + ' — ' + c.label,
                   loot: c.code });
        sent++;
      });
      finish(sent);
    }).catch(function () { finish(0); });

    function finish(sent) {
      shop.coins = {};
      S.splitCodes = { shopId: shop.id, from: shop.name, at: Date.now(), codes: codes };
      save(); broadcastOpenShop(); render();

      var line = 'Split ' + COIN.format(r.total, sys()) + ' ' + ways + ' ways  —  ' +
                 COIN.format(r.each, sys()) + ' each';
      toast(sent
        ? line + '. ' + sent + ' sent to the panel; the rest are below to copy.'
        : line + '. Copy each share below and hand it out.', 'ok');
      postChat(line);
    }
  }

  /* Roll a band's treasure into a hoard, replacing whatever was there. */
  function fillFromLoot(hoard, band) {
    var rolled = VT.loot.rollHoard(0, { band: band });
    hoard.coins = rolled.coins || {};
    hoard.items = VT.loot.toRewardItems(rolled).map(function (r) {
      return { id: r.id, name: r.name, source: r.source || null, note: r.note || '',
               price: 0, qty: r.qty };
    });
    hoard.rolledFrom = band.name;
    hoard.rollNote = 'd100 = ' + rolled.roll;
    toast(band.name + ': ' + hoard.items.length + ' things', 'ok');
    return rolled;
  }

  /* ---- GM: edit one shop ---- */
  function renderEdit() {
    var shop = shopById(S.editingId) || S.shops[0];
    if (!shop) {
      view.appendChild(el('div', { class: 'warn' }, ['No shop selected — make one on the Shops tab.']));
      return;
    }
    S.editingId = shop.id;

    var head = el('div', { class: 'card' }, [el('h3', {}, [shop.free ? 'Reward' : 'Shop'])]);
    head.appendChild(labelled('Name', textInput(shop.name, function (v) {
      shop.name = v; save(); broadcastOpenShop();
    })));

    /* A hoard has nobody behind the counter, so the keeper, their portrait and
       the price markup are all meaningless. It gets a tagline instead: one line
       read out as the party opens it. */
    if (shop.free) {
      head.appendChild(labelled('Tagline', el('textarea', {
        rows: 2, value: shop.greeting || '',
        placeholder: 'What the party sees — "The lid gives with a crack of old resin."',
        onInput: function (e) { shop.greeting = e.target.value; save(); broadcastOpenShop(); }
      })));
      head.appendChild(labelled('Blurb', el('textarea', {
        rows: 2, value: shop.description || '',
        placeholder: 'Anything more they notice on a closer look',
        onInput: function (e) { shop.description = e.target.value; save(); broadcastOpenShop(); }
      })));
      head.appendChild(el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn sm ' + (S.openShopId === shop.id ? 'danger' : 'primary'),
          onClick: function () {
            S.openShopId = S.openShopId === shop.id ? null : shop.id;
            save(); broadcastOpenShop(); render();
          } }, [S.openShopId === shop.id ? 'Close to party' : 'Show the party'])
      ]));
      view.appendChild(head);
      view.appendChild(hoardPanel(shop));
      renderStock(shop);
      return;
    }

    head.appendChild(labelled('Role', textInput(shop.keeper, function (v) { shop.keeper = v; save(); })));
    head.appendChild(labelled('Keeper', textInput(shop.keeperName, function (v) {
      shop.keeperName = v; save();
    })));
    head.appendChild(labelled('Greeting', el('textarea', {
      rows: 2, value: shop.greeting || '', placeholder: 'What they say when the party walks in',
      onInput: function (e) { shop.greeting = e.target.value; save(); }
    })));
    /* the shopkeeper's portrait */
    var portraitBox = el('div', { class: 'keeper-row' }, [
      keeperPortrait(shop, 60),
      el('div', { class: 'grow' }, [
        el('div', { class: 'btnrow' }, [
          el('button', { class: 'btn sm', title: 'Generate a different face',
            onClick: function () {
              shop.keeperImage = null;
              shop.keeperName = SHOPS.randomKeeperName();
              shop.keeperSpec = VT.spriteart.autoSpec(shop.keeperName + Math.random(),
                Object.assign({ kind: 'humanoid' }, SHOPS.templateByKey(shop.templateKey).look || {}));
              save(); render();
            } }, ['New face']),
          el('button', { class: 'btn sm', onClick: function () { pickKeeperImage(shop); } }, ['Upload image…']),
          shop.keeperImage ? el('button', { class: 'btn sm danger', onClick: function () {
            shop.keeperImage = null; save(); render();
          } }, ['Remove image']) : null
        ]),
        el('div', { class: 'muted', style: { marginTop: '4px' } }, [
          shop.keeperImage ? 'Custom image' : 'Generated portrait'
        ])
      ])
    ]);
    head.appendChild(portraitBox);

    head.appendChild(labelled('Blurb', el('textarea', {
      rows: 2, value: shop.description || '',
      onInput: function (e) { shop.description = e.target.value; save(); }
    })));
    head.appendChild(labelled('Prices %', numInput(shop.markup, 10, 500, function (v) {
      shop.markup = Math.max(10, v | 0); save(); render();
    }, 5)));
    head.appendChild(el('p', { class: 'muted' }, [
      '100% is list price. Players only ever see the adjusted number.'
    ]));
    head.appendChild(el('div', { class: 'btnrow' }, [
      el('button', { class: 'btn sm ' + (S.openShopId === shop.id ? 'danger' : 'primary'), onClick: function () {
        S.openShopId = S.openShopId === shop.id ? null : shop.id;
        save(); broadcastOpenShop(); render();
      } }, [S.openShopId === shop.id ? 'Close to party' : 'Open to party'])
    ]));
    view.appendChild(head);
    renderStock(shop);
  }

  /* The list of things on offer, and the search for adding more. A hoard and a
     shop stock themselves the same way; only the price column differs. */
  function renderStock(shop) {
    var stock = el('div', { class: 'card' }, [
      el('h3', {}, [(shop.free ? 'Contents — ' : 'Stock — ') + shop.items.length])
    ]);
    var unpriced = 0;
    shop.items.forEach(function (g, i) {
      if (!g.price) unpriced++;
      stock.appendChild(el('div', { class: 'good' + (g.price ? '' : ' out') }, [
        el('span', { class: 'gname' }, [
          g.name,
          el('span', { class: 'sub' }, [(g.source ? g.source + ' · ' : '') +
            (g.note || '') + (g.price ? '' : (g.note ? ' · ' : '') + 'no price set')])
        ]),
        numInput(g.qty, -1, 999, function (v) { g.qty = v | 0; save(); }),
        shop.free ? el('span', { class: 'price free' }, ['free'])
                  : textInput(money(g.price), function (v) {
                      var n = COIN.parse(v, sys());
                      if (n) { g.price = n; save(); }
                    }),
        el('button', { class: 'btn sm danger', onClick: function () {
          shop.items.splice(i, 1); save(); render();
        } }, ['×'])
      ]));
    });
    stock.appendChild(el('p', { class: 'muted' }, [
      shop.free
        ? 'Quantity −1 means there is enough for everyone. Nothing here costs anything.'
        : 'Quantity −1 means unlimited. Prices accept "12 gp", "5sp", or a bare copper number.' +
          (unpriced ? '  ' + unpriced + (unpriced === 1 ? ' item has' : ' items have') +
            ' no price — the books do not list one for them.' : '')
    ]));
    view.appendChild(stock);

    /* add goods */
    var add = el('div', { class: 'card' }, [el('h3', {}, ['Add goods'])]);
    if (FT.loaded) {
      /* Deliberately a search box over a short result list rather than one
         <select> holding every item in your books: a native dropdown that long
         misbehaves inside the embedded webview, and is unusable in a narrow
         panel even when it does open. */
      var q = '';
      var results = el('div', { class: 'goods', style: { maxHeight: '190px', overflowY: 'auto' } });
      var all = FT.get('item');

      function drawResults() {
        U.clear(results);
        var list = q ? FT.search(q, ['item'], 300) : all;
        var shown = list.slice(0, 40);
        shown.forEach(function (it) {
          var est = COIN.estimatePrice(it);
          results.appendChild(el('div', { class: 'good' }, [
            el('span', { class: 'gname' }, [
              it.name,
              el('span', { class: 'sub' }, [(it.source || '') + (est.estimated ? ' · est.' : '')])
            ]),
            el('span', { class: 'price' }, [est.price ? money(est.price) : '—']),
            el('button', { class: 'btn sm', onClick: function () {
              shop.items.push({ id: U.uid('g'), name: it.name, source: it.source || null,
                                price: est.price, estimated: est.estimated,
                                qty: defaultQty(it), note: shortNote(it) });
              save(); render();
              /* ~11% of items carry no price and no usable rarity - artifacts,
                 and magic items the books list as "unknown". Say so rather than
                 quietly shelving something at nothing. */
              if (!est.price) toast('Added ' + it.name + ' — no listed price, set one', 'err');
              else toast('Added ' + it.name + (est.estimated ? ' (estimated price)' : ''), 'ok');
            } }, ['+'])
          ]));
        });
        if (!shown.length) results.appendChild(el('div', { class: 'muted', style: { padding: '6px' } }, ['No matches.']));
        countLine.textContent = 'showing ' + shown.length + ' of ' + list.length;
      }

      var countLine = el('div', { class: 'muted' });
      add.appendChild(el('div', { class: 'row' }, [
        el('input', { type: 'text', placeholder: 'search ' + all.length + ' items…',
          onInput: U.debounce(function (e) { q = e.target.value.toLowerCase(); drawResults(); }, 120) })
      ]));
      add.appendChild(results);
      add.appendChild(countLine);
      drawResults();
    }

    /* custom item */
    var cn = '', cp = '', cq = 1;
    add.appendChild(el('div', { class: 'row', style: { marginTop: '8px' } }, [
      textInput('', function (v) { cn = v; }, 'Custom item name'),
      textInput('', function (v) { cp = v; }, 'price')
    ]));
    add.appendChild(el('div', { class: 'row' }, [
      numInput(1, -1, 999, function (v) { cq = v | 0; }),
      el('button', { class: 'btn sm primary', onClick: function () {
        if (!cn.trim()) { toast('Give it a name', 'err'); return; }
        shop.items.push({ id: U.uid('g'), name: cn.trim(), source: 'HB',
                          price: COIN.parse(cp, sys()), qty: cq, note: '' });
        save(); render();
        toast('Added ' + cn.trim(), 'ok');
      } }, ['Add custom'])
    ]));
    view.appendChild(add);
  }

  /* Keeper portraits are stored inline in the shop, so an exported shop still
     has its face when it lands in someone else's campaign. Downscaled hard for
     that reason — a 4 MB photo would bloat every sync message. */
  function pickKeeperImage(shop) {
    var picker = document.getElementById('imgPicker');
    picker.value = '';
    picker.onchange = function () {
      var f = picker.files[0];
      if (!f || !/^image\//.test(f.type)) { toast('Pick an image file', 'err'); return; }
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var max = 256;
          var k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          shop.keeperImage = c.toDataURL('image/png');
          save(); render();
          toast('Portrait set', 'ok');
        };
        img.onerror = function () { toast('Could not read that image', 'err'); };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    };
    picker.click();
  }

  /* ---- GM: setup ---- */
  function renderSetup() {
    var box = el('div', { class: 'card' }, [el('h3', {}, ['5etools data'])]);
    box.appendChild(el('div', { class: FT.loaded ? 'ok' : 'warn' }, [
      FT.loaded ? FT.stats.records + ' records loaded · ' + FT.get('item').length + ' items available'
                : 'Not connected — templates cannot stock themselves without item data.'
    ]));
    var progress = el('div', {});
    box.appendChild(progress);
    box.appendChild(el('div', { class: 'btnrow' }, [
      FT.supportsFS() ? el('button', { class: 'btn sm primary', onClick: function () {
        FT.pickDirectory().then(function (h) {
          showBox(progress, 'ok', 'Reading “' + h.name + '” — remembered for next time.');
          runLoad(progress);
        }).catch(function (e) { if (e && e.name !== 'AbortError') showBox(progress, 'err', String(e.message || e)); });
      } }, [FT.rememberedName() ? 'Reconnect / change folder…' : 'Choose folder & remember…']) : null,
      el('button', { class: 'btn sm', onClick: function () {
        var picker = document.getElementById('dirPicker');
        picker.value = '';
        picker.onchange = function () {
          if (!picker.files.length) return;
          if (!FT.useFolder(picker.files)) { showBox(progress, 'err', 'No JSON under a data/ folder there.'); return; }
          runLoad(progress);
        };
        picker.click();
      } }, ['One-time pick…']),
      el('button', { class: 'btn sm', onClick: function () {
        FT.useUrl(new URL('.', location.href).href.replace(/\/$/, ''));
        runLoad(progress);
      } }, ['Use bundled ./data'])
    ]));
    view.appendChild(box);

    /* currency */
    var cur = el('div', { class: 'card' }, [
      el('h3', {}, ['Currency']),
      el('p', { class: 'muted', style: { marginTop: 0 } }, [
        'Standard D&D coins by default. Rename them or change their values for another ' +
        'setting — prices convert automatically, since everything is stored in the base unit.'
      ])
    ]);
    var s = sys();
    var working = U.clone(S.currency || COIN.DND);
    cur.appendChild(el('div', { class: 'coinsys' }, [
      el('div', { class: 'muted' }, ['Name']),
      el('div', { class: 'muted' }, ['Code']),
      el('div', { class: 'muted' }, ['Worth'])
    ]));
    working.denoms.forEach(function (d) {
      cur.appendChild(el('div', { class: 'coinsys' }, [
        textInput(d.name, function (v) { d.name = v; }),
        textInput(d.key, function (v) { d.key = v.trim() || d.key; }),
        numInput(d.inBase, 1, 1000000, function (v) { d.inBase = Math.max(1, v | 0); })
      ]));
    });
    cur.appendChild(el('div', { class: 'btnrow' }, [
      el('button', { class: 'btn sm primary', onClick: function () {
        working.id = 'custom';
        working.name = 'Custom';
        working.base = working.denoms.slice().sort(function (a, b) { return a.inBase - b.inBase; })[0].key;
        S.currency = working;
        save(); broadcastOpenShop(); render();
        toast('Currency updated — ' + COIN.format(12345, S.currency), 'ok');
      } }, ['Apply']),
      el('button', { class: 'btn sm', onClick: function () {
        S.currency = null; save(); broadcastOpenShop(); render();
      } }, ['Reset to D&D'])
    ]));
    cur.appendChild(el('p', { class: 'muted' }, [
      'Example: 12,345 base units reads as ' + COIN.format(12345, s) + '.'
    ]));
    view.appendChild(cur);

    view.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, ['Storage']),
      el('div', { class: 'muted' }, [S.shops.length + ' shops saved in this campaign.']),
      el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        el('button', { class: 'btn sm', onClick: function () {
          var blob = new Blob([JSON.stringify(SHOPS.exportPayload(S.shops, S.currency), null, 1)],
            { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob); a.download = 'shops.taleshop.json';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
        } }, ['Export shops']),
        el('button', { class: 'btn sm', onClick: function () {
          var picker = document.getElementById('jsonPicker');
          picker.value = '';
          picker.onchange = function () {
            var f = picker.files[0]; if (!f) return;
            f.text().then(function (t) {
              try {
                /* Shared with Shopsmith, so a file built there arrives with its
                   ids freshened and its defaults filled in the same way. */
                var got = SHOPS.importPayload(t);
                got.shops.forEach(function (sh) { S.shops.push(sh); });
                if (got.currency) S.currency = got.currency;
                save(); render();
                var hoards = got.shops.filter(function (sh) { return sh.free; }).length;
                toast('Imported ' + got.shops.length +
                      (hoards ? ' (' + hoards + ' of them treasure)' : ' shops'), 'ok');
              } catch (e) { toast('Import failed: ' + e.message, 'err'); }
            });
          };
          picker.click();
        } }, ['Import shops']),
        el('button', { class: 'btn sm danger', onClick: function () {
          S.shops = []; S.openShopId = null; save(); broadcastOpenShop(); render();
        } }, ['Delete all'])
      ])
    ]));
  }

  /* ---- GM: see exactly what the party sees ---- */
  function renderPreview() {
    var shop = shopById(S.openShopId);
    if (!shop) {
      var pick = shopById(S.editingId) || S.shops[0];
      view.appendChild(el('div', { class: 'warn' }, [
        'No shop is open to the party. This previews whichever shop you open — ' +
        (pick ? 'showing “' + pick.name + '” as it would appear.' : 'make a shop first.')
      ]));
      if (!pick) return;
      shop = pick;
    }
    view.appendChild(el('div', { class: 'muted', style: { textAlign: 'center', marginBottom: '8px' } }, [
      '↓ exactly what a player sees ↓'
    ]));
    renderBrowse(publicShop(shop), true);
  }

  /* ---- player: browse ----
     Also used by the GM's Preview tab, fed the same public shop object the
     players actually receive — so the preview cannot drift from the real thing. */
  function renderBrowse(forceShop, readOnly) {
    var shop = forceShop || S.liveShop;
    if (!shop) {
      view.appendChild(el('div', { class: 'card' }, [
        el('h3', {}, ['Nothing open']),
        el('div', { class: 'muted' }, [
          'When the GM opens a shop it appears here automatically.'
        ]),
        el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
          el('button', { class: 'btn sm', onClick: function () {
            syncSend({ p: PROTO, t: 'poll' });
            toast('Asked the GM what is open');
          } }, ['Check again'])
        ])
      ]));
      return;
    }

    var header = el('div', { class: 'card' }, [
      el('div', { class: 'keeper-row' }, [
        shop.free ? SHOPS.hoardArt(shop, 64, sys()) : keeperPortrait(shop, 64),
        el('div', { class: 'grow' }, [
          el('div', { class: 'nm', style: { fontFamily: 'var(--serif)', fontSize: '17px', color: 'var(--gold)' } }, [shop.name]),
          el('div', { class: 'keep' }, [
            shop.free ? tierLabel(shop)
                      : (shop.keeperName ? shop.keeperName + ', ' : '') + shop.keeper
          ])
        ])
      ])
    ]);
    if (shop.greeting) {
      header.appendChild(el('div', { class: 'greeting' }, [
        shop.free ? shop.greeting : '\u201c' + shop.greeting + '\u201d'
      ]));
    }
    if (shop.description) {
      header.appendChild(el('p', { class: 'muted', style: { marginTop: '6px' } }, [shop.description]));
    }
    view.appendChild(header);

    var goods = el('div', { class: 'card' }, [el('h3', {}, [(shop.free ? 'Treasure' : 'Goods') + ' — ' + shop.items.length])]);
    shop.items.forEach(function (g) {
      var out = g.qty === 0;
      var qty = 1;
      var qtyIn = el('input', { type: 'number', value: 1, min: 1,
        onInput: function (e) { qty = Math.max(1, parseInt(e.target.value, 10) || 1); } });
      goods.appendChild(el('div', { class: 'good' + (out ? ' out' : '') }, [
        el('span', { class: 'gname' }, [
          g.name,
          el('span', { class: 'sub' }, [(g.note || '') + (g.source ? (g.note ? ' · ' : '') + g.source : '')])
        ]),
        shop.free ? el('span', { class: 'price free' }, ['free'])
                  : el('span', { class: 'price' }, [money(g.price)]),
        el('span', { class: 'stock' }, [g.qty < 0 ? '∞' : String(g.qty)]),
        out ? null : qtyIn,
        out ? el('span', { class: 'muted' }, [shop.free ? 'taken' : 'sold out'])
            : readOnly ? el('span', { class: 'muted' }, [shop.free ? 'take' : 'buy'])
            : el('button', { class: 'btn sm primary', onClick: function () {
                syncSend({ p: PROTO, t: 'buy', shopId: shop.id, itemId: g.id,
                           qty: qty, buyer: S.myName });
                toast((shop.free ? 'Taking ' : 'Asked to buy ') + qty + ' × ' + g.name);
              } }, [shop.free ? 'Take' : 'Buy'])
      ]));
    });
    view.appendChild(goods);

    /* loose coin in a hoard */
    if (shop.free && shop.coins && Object.keys(shop.coins).length) {
      var cbox = el('div', { class: 'card' }, [el('h3', {}, ['Coin'])]);
      cbox.appendChild(el('div', { class: 'muted' }, [
        Object.keys(shop.coins).map(function (k) { return shop.coins[k] + ' ' + k; }).join(', ')
      ]));
      cbox.appendChild(el('button', { class: 'btn sm', onClick: function () {
        syncSend({ p: PROTO, t: 'buy', shopId: shop.id, itemId: '__coins',
                   qty: 1, buyer: S.myName });
        toast('Claiming the coin');
      } }, ['Take the coin']));
      view.appendChild(cbox);
    }

    view.appendChild(el('p', { class: 'muted', style: { textAlign: 'center' } }, [
      shop.free
        ? 'Taking something sends it straight to your Tale Sheet inventory.'
        : 'Buying here reserves the goods with the GM. The coin is yours to deduct in Tale Sheet.'
    ]));
  }

  /* ---- player: receipts ---- */
  function renderReceipts() {
    var box = el('div', { class: 'card' }, [el('h3', {}, ['Purchases — ' + S.receipts.length])]);
    if (!S.receipts.length) box.appendChild(el('div', { class: 'muted' }, ['Nothing bought yet.']));
    else box.appendChild(el('p', { class: 'muted', style: { marginTop: 0 } }, [
      'Copy a code, open Tale Sheet, and paste it into the box under Inventory.'
    ]));
    S.receipts.slice().reverse().forEach(function (r) {
      var line = typeof r === 'string' ? r : r.text;
      box.appendChild(el('div', { class: 'receipt' }, [line]));
      if (r && r.loot) {
        box.appendChild(copyBox(r.loot, 'Paste this into Tale Sheet to collect it'));
      }
    });
    if (S.receipts.length) {
      box.appendChild(el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        el('button', { class: 'btn sm danger', onClick: function () {
          S.receipts = []; save(); render();
        } }, ['Clear'])
      ]));
    }
    view.appendChild(box);
  }

  /* A copyable code. The clipboard API is not always granted inside the
     embedded webview, so this falls back to selecting the text and letting the
     old execCommand path take it - and if even that fails the text is on
     screen, selected, ready for Ctrl+C. */
  function copyBox(code, label) {
    var ta = el('textarea', { class: 'lootcode', rows: 2, readonly: true, value: code });
    var btn = el('button', { class: 'btn sm primary' }, ['Copy']);
    btn.addEventListener('click', function () {
      ta.focus(); ta.select(); ta.setSelectionRange(0, code.length);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      if (ok) { flash('Copied'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code)
          .then(function () { flash('Copied'); })
          .catch(function () { flash('Press Ctrl+C', 'err'); });
      } else { flash('Press Ctrl+C', 'err'); }
    });
    function flash(msg, cls) {
      btn.textContent = msg;
      toast(msg === 'Copied' ? 'Copied — paste it into Tale Sheet' : msg, cls || 'ok');
      setTimeout(function () { btn.textContent = 'Copy'; }, 1400);
    }
    return el('div', { class: 'lootbox' }, [
      label ? el('div', { class: 'muted' }, [label]) : null,
      ta,
      el('div', { class: 'btnrow' }, [btn])
    ]);
  }

  /* ==== small widgets ==================================================== */
  function labelled(t, ctrl) { return el('div', { class: 'row' }, [el('label', {}, [t]), ctrl]); }
  function textInput(v, cb, ph) {
    return el('input', { type: 'text', value: v == null ? '' : v, placeholder: ph || '',
      onInput: function (e) { cb(e.target.value); } });
  }
  function numInput(v, min, max, cb, step) {
    return el('input', { type: 'number', value: v, min: min, max: max, step: step || 1,
      onInput: function (e) { cb(parseFloat(e.target.value) || 0); } });
  }
  function showBox(host, cls, msg) { U.clear(host); host.appendChild(el('div', { class: cls }, [msg])); }

  function runLoad(progress) {
    U.clear(progress);
    var bar = el('i', { style: { width: '4%' } });
    var lab = el('div', { class: 'muted' }, ['starting…']);
    progress.appendChild(el('div', { class: 'progress' }, [bar]));
    progress.appendChild(lab);
    var seen = 0;
    FT.loadAll(function (p) {
      seen = Math.max(seen, p.files);
      bar.style.width = Math.min(96, 4 + seen * 0.55) + '%';
      lab.textContent = p.phase + ' — ' + p.files + ' files, ' + p.records + ' records';
    }).then(function (stats) {
      bar.style.width = '100%';
      if (!stats.records) { showBox(progress, 'err', 'Loaded nothing from there.'); return; }
      FT.saveCache();
      toast('Loaded ' + stats.records + ' records', 'ok');
      render();
    }).catch(function (e) { showBox(progress, 'err', 'Load failed: ' + (e && e.message || e)); });
  }

  /* dev handle so the GM view can be exercised in a browser */
  window.__shopState = S;
})();
