/* Shopsmith :: the desk-sized shop editor.

   Same shop model as the Tale Shop symbiote (src/data/shops.js), so a shop
   built here exports as JSON that Tale Shop imports unchanged. Building shops
   on a full screen with a keyboard is simply nicer than doing it in a narrow
   in-game panel; the symbiote is for running them at the table. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, FT = VT.fivetools,
      COIN = VT.coin, SHOPS = VT.shops;

  var KEY = 'vtactics.shopsmith.v1';

  var S = { mode: 'shops', shops: [], selectedId: null, currency: null };
  var work, side, srcBadge;

  /* ==== boot ============================================================= */
  function boot() {
    work = U.$('#bwork');
    side = U.$('#bside');
    srcBadge = U.$('#srcBadge');
    load();

    U.$$('.mode-btn').forEach(function (b) {
      b.onclick = function () { setMode(b.dataset.mode); };
    });
    U.$('#btnSource').onclick = sourceDialog;
    U.$('#btnExport').onclick = exportShops;
    U.$('#btnImport').onclick = importShops;

    FT.loadCache()
      .then(function () { return FT.reconnectDirectory(); })
      .then(function (fs) {
        updateBadge();
        setMode('shops');
        if (!FT.loaded && fs && fs.ok) {
          srcBadge.textContent = 'reading "' + fs.name + '"…';
          return FT.loadAll(function () {}).then(function (st) {
            if (st.records) { FT.saveCache(); updateBadge(); render(); }
          }).catch(function () {});
        }
        if (!FT.loaded) sourceDialog();
      });
  }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY) || '{}');
      S.shops = (d.shops || []).map(SHOPS.normalise);
      S.currency = d.currency || null;
      S.selectedId = d.selectedId || (S.shops[0] && S.shops[0].id) || null;
    } catch (e) { S.shops = []; }
  }
  var saveSoon = U.debounce(function () {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        shops: S.shops, currency: S.currency, selectedId: S.selectedId
      }));
    } catch (e) {
      alert('Could not save: browser storage is full. Export your shops to a file.');
    }
  }, 350);
  function save() { saveSoon(); }

  function sys() { return S.currency || COIN.DND; }
  function money(n) { return COIN.formatShort(n, sys()); }
  function selected() { return S.shops.find(function (s) { return s.id === S.selectedId; }) || null; }

  function updateBadge() {
    if (!FT.loaded) {
      srcBadge.className = 'src-badge warn';
      srcBadge.textContent = 'no source';
      return;
    }
    srcBadge.className = 'src-badge ok';
    srcBadge.title = FT.rememberedName() ? 'Folder: ' + FT.rememberedName() : '';
    srcBadge.textContent = (FT.get('item') || []).length + ' items · ' +
      Object.keys(FT.sources).length + ' sources';
  }

  function setMode(m) {
    S.mode = m;
    U.$$('.mode-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
    render();
  }

  /* ==== render =========================================================== */
  function render() {
    U.clear(work); U.clear(side);
    ({ shops: renderShops, edit: renderEdit, preview: renderPreview }[S.mode] || renderShops)();
    renderSide();
  }

  function keeperPortrait(shop, size) {
    size = size || 64;
    if (shop.keeperImage) {
      return el('img', { src: shop.keeperImage, class: 'keeper-img',
        style: { width: size + 'px', height: Math.round(size * 1.2) + 'px' } });
    }
    var spr = VT.spriteart.get(shop.keeperSpec || SHOPS.keeperSpec(shop));
    var c = document.createElement('canvas');
    c.width = size; c.height = Math.round(size * 1.2);
    c.className = 'keeper-img';
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var k = Math.min(c.width / spr.width, c.height / spr.height);
    ctx.drawImage(spr, (c.width - spr.width * k) / 2, c.height - spr.height * k,
      spr.width * k, spr.height * k);
    return c;
  }

  /* ---- shelf ---- */
  function renderShops() {
    work.appendChild(el('h2', { class: 'step' }, ['Your shops']));
    work.appendChild(el('p', { class: 'step-sub' }, [
      S.shops.length + ' saved here. Export them as one file and import it in Tale Shop.'
    ]));

    if (!FT.loaded) {
      work.appendChild(el('div', { class: 'warn-box' }, [
        'No item data connected — new shops will be empty. Use Data Source above.'
      ]));
    }

    work.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Shelf']),
      S.shops.length ? el('div', { class: 'shoplist' }, S.shops.map(function (shop) {
        return el('div', {
          class: 'shopcard' + (S.selectedId === shop.id ? ' sel' : ''),
          onClick: function () { S.selectedId = shop.id; save(); setMode('edit'); }
        }, [
          el('div', { class: 'keeper-row' }, [
            shop.free ? SHOPS.hoardArt(shop, 44, sys()) : keeperPortrait(shop, 44),
            el('div', { class: 'grow' }, [
              el('div', { class: 'nm' }, [shop.name]),
              el('div', { class: 'keep' }, [
                shop.free
                  ? tierLabel(shop) + ' · ' + shop.items.length + ' to take' +
                    (SHOPS.hoardWorth(shop, sys())
                      ? ' · about ' + money(SHOPS.hoardWorth(shop, sys())) : '')
                  : (shop.keeperName ? shop.keeperName + ', ' : '') + shop.keeper +
                    ' · ' + shop.items.length + ' goods' +
                    (shop.markup !== 100 ? ' · ' + shop.markup + '% prices' : '')
              ])
            ]),
            el('button', { class: 'btn sm', title: 'Duplicate', onClick: function (e) {
              e.stopPropagation();
              var copy = U.clone(shop);
              copy.id = U.uid('shop'); copy.name = shop.name + ' (copy)';
              copy.items.forEach(function (g) { g.id = U.uid('g'); });
              S.shops.push(copy); save(); render();
            } }, ['⧉']),
            el('button', { class: 'btn sm', title: 'Export just this shop', onClick: function (e) {
              e.stopPropagation(); download([shop], shop.name);
            } }, ['⤓']),
            el('button', { class: 'btn sm danger', onClick: function (e) {
              e.stopPropagation();
              S.shops = S.shops.filter(function (x) { return x.id !== shop.id; });
              if (S.selectedId === shop.id) S.selectedId = S.shops[0] ? S.shops[0].id : null;
              save(); render();
            } }, ['×'])
          ])
        ]);
      })) : el('div', { class: 'muted' }, ['None yet — pick a template below.'])
    ]));

    work.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['New shop from a template']),
      el('p', { class: 'tiny', style: { marginTop: 0 } }, [
        'Stocked from your own item data at list prices. Everything stays editable.'
      ]),
      el('div', { class: 'tmplgrid' }, SHOPS.TEMPLATES.map(function (t) {
        return el('button', { class: 'tmpl', onClick: function () {
          var shop = SHOPS.makeShop(t);
          S.shops.push(shop);
          S.selectedId = shop.id;
          save(); setMode('edit');
        } }, [
          el('div', { class: 'tn' }, [t.name]),
          el('div', { class: 'td' }, [t.blurb])
        ]);
      }))
    ]));

    /* Treasure. A hoard is the same object with nothing to pay, so it exports
       and imports through exactly the same file as a shop. */
    var hoards = el('div', { class: 'panel' }, [
      el('h3', {}, ['New treasure hoard']),
      el('p', { class: 'tiny', style: { marginTop: 0 } }, [
        'A reward rather than a shop: the party opens it, sees what is inside and ' +
        'takes it for nothing. Fill it by hand, or roll it off your own treasure tables.'
      ])
    ]);
    var hrow = el('div', { class: 'btnrow' }, [
      btn('Empty hoard', function () {
        var h = SHOPS.makeHoard('Treasure');
        S.shops.push(h); S.selectedId = h.id;
        save(); setMode('edit');
      }, 'sm primary')
    ]);
    if (VT.loot && VT.loot.available()) {
      VT.loot.hoardBands().forEach(function (band) {
        hrow.appendChild(btn('Roll ' + band.name.replace(/^Challenge\s*/, 'CR '), function () {
          var h = SHOPS.makeHoard(band.name + ' hoard');
          fillFromLoot(h, band);
          S.shops.push(h); S.selectedId = h.id;
          save(); setMode('edit');
        }, 'sm'));
      });
    } else {
      hoards.appendChild(el('div', { class: 'muted' }, [
        'Connect your data source above to roll treasure from the tables in it.'
      ]));
    }
    hoards.appendChild(hrow);
    work.appendChild(hoards);
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
    return rolled;
  }

  function tierLabel(shop) {
    var key = SHOPS.hoardTier(shop, sys());
    var t = SHOPS.HOARD_TIERS.find(function (x) { return x.key === key; });
    return t ? t.label : 'Treasure';
  }

  /* ---- edit ---- */
  function renderEdit() {
    var shop = selected();
    if (!shop) {
      work.appendChild(el('div', { class: 'warn-box' }, ['No shop selected — pick one on the Shops tab.']));
      return;
    }

    work.appendChild(el('h2', { class: 'step' }, [shop.name]));
    work.appendChild(el('p', { class: 'step-sub' }, ['Everything here is editable.']));

    if (shop.free) { hoardHead(shop); renderStock(shop); return; }

    /* keeper */
    var keeper = el('div', { class: 'panel' }, [el('h3', {}, ['The shopkeeper'])]);
    keeper.appendChild(el('div', { class: 'keeper-row' }, [
      keeperPortrait(shop, 80),
      el('div', { class: 'grow' }, [
        row('Shop name', text(shop.name, function (v) { shop.name = v; save(); renderSide(); })),
        row('Keeper', text(shop.keeperName, function (v) { shop.keeperName = v; save(); renderSide(); })),
        row('Role', text(shop.keeper, function (v) { shop.keeper = v; save(); renderSide(); })),
        el('div', { class: 'btnrow' }, [
          btn('New face', function () {
            shop.keeperImage = null;
            shop.keeperName = SHOPS.randomKeeperName();
            shop.keeperSpec = VT.spriteart.autoSpec(shop.keeperName + Math.random(),
              Object.assign({ kind: 'humanoid' }, SHOPS.templateByKey(shop.templateKey).look || {}));
            save(); render();
          }, 'sm'),
          btn('Upload image…', function () { pickImage(shop); }, 'sm'),
          shop.keeperImage ? btn('Remove image', function () {
            shop.keeperImage = null; save(); render();
          }, 'sm danger') : null
        ])
      ])
    ]));
    keeper.appendChild(row('Greeting', el('textarea', {
      rows: 2, value: shop.greeting || '',
      placeholder: 'What they say when the party walks in',
      onInput: function (e) { shop.greeting = e.target.value; save(); renderSide(); }
    }), true));
    keeper.appendChild(row('Blurb', el('textarea', {
      rows: 2, value: shop.description || '',
      onInput: function (e) { shop.description = e.target.value; save(); renderSide(); }
    }), true));
    keeper.appendChild(row('Prices %', num(shop.markup, 10, 500, function (v) {
      shop.markup = Math.max(10, v | 0); save(); render();
    }, 5)));
    keeper.appendChild(el('p', { class: 'hint' }, [
      '100% is list price. Players only ever see the adjusted number.'
    ]));
    work.appendChild(keeper);
    renderStock(shop);
  }

  /* The name, tagline, picture and coin of a hoard. There is nobody behind the
     counter and nothing to pay, so the keeper and the markup are replaced by
     the one thing a pile of treasure does have: a look and a purse. */
  function hoardHead(shop) {
    var box = el('div', { class: 'panel' }, [el('h3', {}, ['The hoard'])]);

    var pickers = el('div', { class: 'grow' }, [
      row('Reward name', text(shop.name, function (v) {
        shop.name = v; save(); renderSide();
      })),
      el('div', { class: 'hint' }, [
        'Worth about ' + money(SHOPS.hoardWorth(shop, sys())) +
        ' · the picture follows the value unless you choose one.'
      ])
    ]);
    var tiers = el('div', { class: 'btnrow' }, [
      btn('Automatic', function () { shop.tier = null; save(); render(); },
        'sm' + (shop.tier ? '' : ' primary'))
    ]);
    SHOPS.HOARD_TIERS.forEach(function (t) {
      tiers.appendChild(el('button', {
        class: 'btn sm' + (shop.tier === t.key ? ' primary' : ''),
        title: t.label,
        onClick: function () { shop.tier = t.key; save(); render(); }
      }, [t.label]));
    });
    pickers.appendChild(tiers);
    box.appendChild(el('div', { class: 'keeper-row' }, [SHOPS.hoardArt(shop, 80, sys()), pickers]));

    box.appendChild(row('Tagline', el('textarea', {
      rows: 2, value: shop.greeting || '',
      placeholder: 'What the party sees as it opens - "The lid gives with a crack of old resin."',
      onInput: function (e) { shop.greeting = e.target.value; save(); renderSide(); }
    }), true));
    box.appendChild(row('Blurb', el('textarea', {
      rows: 2, value: shop.description || '',
      placeholder: 'Anything more they notice on a closer look',
      onInput: function (e) { shop.description = e.target.value; save(); renderSide(); }
    }), true));

    /* loose coin */
    var purse = el('div', { class: 'btnrow' });
    COIN.denoms(sys()).forEach(function (d) {
      purse.appendChild(el('label', { class: 'coinbox' }, [
        el('span', { class: 'muted' }, [d.key]),
        num((shop.coins || {})[d.key] || 0, 0, 999999, function (v) {
          shop.coins = shop.coins || {};
          shop.coins[d.key] = Math.max(0, v | 0);
          save(); renderSide();
        })
      ]));
    });
    box.appendChild(row('Loose coin', purse, true));

    if (VT.loot && VT.loot.available()) {
      var reroll = el('div', { class: 'btnrow' });
      VT.loot.hoardBands().forEach(function (band) {
        reroll.appendChild(btn(band.name.replace(/^Challenge\s*/, 'CR '), function () {
          fillFromLoot(shop, band); save(); render();
        }, 'sm'));
      });
      box.appendChild(row('Reroll from', reroll, true));
      if (shop.rolledFrom) {
        box.appendChild(el('p', { class: 'hint' }, [
          'Rolled from ' + shop.rolledFrom + ' (' + (shop.rollNote || '') + '). ' +
          'Rerolling replaces everything in it.'
        ]));
      }
    }
    work.appendChild(box);
  }

  function renderStock(shop) {
    var unpriced = 0;
    var tbody = el('tbody');
    shop.items.forEach(function (g, i) {
      if (!g.price) unpriced++;
      tbody.appendChild(el('tr', { class: g.price ? '' : 'unpriced' }, [
        el('td', {}, [text(g.name, function (v) { g.name = v; save(); })]),
        el('td', { class: 'muted', style: { fontSize: '10px' } }, [g.source || '—']),
        el('td', {}, [shop.free
          ? el('span', { class: 'muted' }, ['free'])
          : text(money(g.price), function (v) {
              var n = COIN.parse(v, sys());
              if (n) { g.price = n; save(); renderSide(); }
            })]),
        el('td', {}, [num(g.qty, -1, 9999, function (v) { g.qty = v | 0; save(); })]),
        el('td', { class: 'muted', style: { fontSize: '10px' } }, [g.note || '']),
        el('td', {}, [btn('×', function () { shop.items.splice(i, 1); save(); render(); }, 'sm danger')])
      ]));
    });
    work.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, [(shop.free ? 'Contents ' : 'Stock ') + '— ' + shop.items.length]),
      el('div', { style: { overflowX: 'auto' } }, [
        el('table', { class: 'goods' }, [
          el('thead', {}, [el('tr', {}, [
            el('th', {}, ['Item']), el('th', {}, ['Book']), el('th', {}, ['Price']),
            el('th', {}, ['Qty']), el('th', {}, ['Note']), el('th', {}, [''])
          ])]),
          tbody
        ])
      ]),
      el('p', { class: 'hint' }, [
        shop.free
          ? 'Quantity −1 means there is enough for everyone. Nothing here costs anything.'
          : 'Quantity −1 is unlimited. Prices accept "12 gp", "5sp", or a bare copper number.' +
            (unpriced ? '  ' + unpriced + (unpriced === 1 ? ' item has' : ' items have') +
              ' no price — the books do not list one.' : '')
      ])
    ]));

    /* add goods */
    var add = el('div', { class: 'panel' }, [
      el('h3', {}, [shop.free ? 'Add treasure' : 'Add goods'])
    ]);
    if (FT.loaded) {
      var q = '', results = el('div', { class: 'pickscroll' });
      var all = FT.get('item');
      function draw() {
        U.clear(results);
        var list = q ? FT.search(q, ['item'], 300) : all;
        var grid = el('div', { class: 'pickgrid' });
        list.slice(0, 60).forEach(function (it) {
          var est = COIN.estimatePrice(it);
          grid.appendChild(el('button', { class: 'pick', onClick: function () {
            shop.items.push(SHOPS.goodFromItem(it));
            save(); render();
          } }, [
            el('span', { class: 'src' }, [it.source || '']),
            el('div', { class: 'pn' }, [it.name]),
            el('div', { class: 'ps' }, [
              (est.price ? money(est.price) : 'no listed price') +
              (est.estimated ? ' · est.' : '')
            ])
          ]));
        });
        results.appendChild(grid);
      }
      draw();
      add.appendChild(el('div', { class: 'searchbar', style: { marginBottom: '8px' } }, [
        el('input', { type: 'text', placeholder: 'search ' + all.length + ' items…',
          onInput: U.debounce(function (e) { q = e.target.value.toLowerCase(); draw(); }, 120) })
      ]));
      add.appendChild(results);
    }
    var cn = '', cp = '', cq = 1, cnote = '';
    add.appendChild(el('div', { class: 'grid3', style: { marginTop: '10px' } }, [
      row('Custom item', text('', function (v) { cn = v; })),
      row('Price', text('', function (v) { cp = v; }, '25 gp')),
      row('Qty', num(1, -1, 999, function (v) { cq = v | 0; }))
    ]));
    add.appendChild(el('div', { class: 'row' }, [
      text('', function (v) { cnote = v; }, 'note (optional)'),
      btn('Add custom', function () {
        if (!cn.trim()) return;
        shop.items.push({ id: U.uid('g'), name: cn.trim(), source: 'HB',
                          price: COIN.parse(cp, sys()), qty: cq, note: cnote.trim() });
        save(); render();
      }, 'primary')
    ]));
    work.appendChild(add);
  }

  /* ---- player view ---- */
  function renderPreview() {
    var shop = selected();
    if (!shop) {
      work.appendChild(el('div', { class: 'warn-box' }, ['No shop selected.']));
      return;
    }
    var pub = SHOPS.publicShop(shop);
    work.appendChild(el('h2', { class: 'step' }, ['Player view']));
    work.appendChild(el('p', { class: 'step-sub' }, [
      'Exactly what the party sees in Tale Shop — the same public shop object they receive.'
    ]));

    var head = el('div', { class: 'panel' }, [
      el('div', { class: 'keeper-row' }, [
        pub.free ? SHOPS.hoardArt(shop, 88, sys()) : keeperPortrait(shop, 88),
        el('div', { class: 'grow' }, [
          el('div', { style: { fontFamily: 'var(--serif)', fontSize: '19px', color: 'var(--gold)' } }, [pub.name]),
          el('div', { class: 'keep' }, [
            pub.free ? tierLabel(shop)
                     : (pub.keeperName ? pub.keeperName + ', ' : '') + pub.keeper
          ])
        ])
      ])
    ]);
    if (pub.greeting) {
      head.appendChild(el('div', { class: 'greeting' }, [
        pub.free ? pub.greeting : '“' + pub.greeting + '”'
      ]));
    }
    if (pub.description) head.appendChild(el('p', { class: 'hint' }, [pub.description]));
    work.appendChild(head);

    var tbody = el('tbody');
    pub.items.forEach(function (g) {
      tbody.appendChild(el('tr', { class: g.qty === 0 ? 'unpriced' : '' }, [
        el('td', {}, [g.name]),
        el('td', { class: 'muted', style: { fontSize: '10px' } }, [g.note || '']),
        el('td', { style: { color: 'var(--gold)', fontFamily: 'var(--mono)' } }, [
          pub.free ? 'free' : money(g.price)
        ]),
        el('td', { class: 'muted' }, [g.qty < 0 ? '∞' : String(g.qty)])
      ]));
    });
    work.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, [(pub.free ? 'Treasure ' : 'Goods ') + '— ' + pub.items.length]),
      el('table', { class: 'goods' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', {}, ['Item']), el('th', {}, ['Note']), el('th', {}, ['Price']), el('th', {}, ['Stock'])
        ])]),
        tbody
      ])
    ]));
  }

  /* ---- side rail ---- */
  function renderSide() {
    U.clear(side);
    var shop = selected();
    if (!shop) return;
    var total = shop.items.reduce(function (n, g) { return n + SHOPS.shownPrice(shop, g); }, 0);
    side.appendChild(el('div', { class: 'sec' }, [
      el('div', { class: 'sec-h' }, ['At a glance']),
      el('div', { class: 'sec-b' }, [
        el('div', { class: 'keeper-row' }, [
          shop.free ? SHOPS.hoardArt(shop, 56, sys()) : keeperPortrait(shop, 56),
          el('div', { class: 'grow' }, [
            el('div', { style: { fontFamily: 'var(--serif)', fontSize: '15px' } }, [shop.name]),
            el('div', { class: 'muted' }, [
              shop.free ? tierLabel(shop) : (shop.keeperName || '') + ', ' + shop.keeper
            ])
          ])
        ]),
        shop.greeting ? el('div', { class: 'greeting' }, [
          shop.free ? shop.greeting : '“' + shop.greeting + '”'
        ]) : null,
        el('div', { class: 'statline' }, [
          el('span', {}, [shop.free ? 'Things in it' : 'Goods']),
          el('b', {}, [String(shop.items.length)])
        ]),
        shop.free ? null : el('div', { class: 'statline' }, [
          el('span', {}, ['Price multiplier']), el('b', {}, [shop.markup + '%'])
        ]),
        el('div', { class: 'statline' }, [
          el('span', {}, [shop.free ? 'Worth about' : 'Shelf value']),
          el('b', {}, [money(shop.free ? SHOPS.hoardWorth(shop, sys()) : total)])
        ]),
        el('div', { class: 'btnrow', style: { marginTop: '10px' } }, [
          btn('Export this shop', function () { download([shop], shop.name); }, 'sm primary')
        ])
      ])
    ]));
  }

  /* ==== import / export ================================================== */
  function download(shops, label) {
    var blob = new Blob([JSON.stringify(SHOPS.exportPayload(shops, S.currency), null, 1)],
      { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = String(label || 'shops').replace(/[^\w-]+/g, '_') + '.taleshop.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }
  function exportShops() {
    if (!S.shops.length) { alert('No shops to export yet.'); return; }
    download(S.shops, 'shops');
  }
  function importShops() {
    var picker = U.$('#jsonPicker');
    picker.value = '';
    picker.onchange = function () {
      var f = picker.files[0]; if (!f) return;
      f.text().then(function (t) {
        try {
          var res = SHOPS.importPayload(t);
          res.shops.forEach(function (sh) { S.shops.push(sh); });
          if (res.currency) S.currency = res.currency;
          S.selectedId = S.shops[S.shops.length - 1].id;
          save(); setMode('shops');
        } catch (e) { alert('Import failed: ' + e.message); }
      });
    };
    picker.click();
  }

  function pickImage(shop) {
    var picker = U.$('#imgPicker');
    picker.value = '';
    picker.onchange = function () {
      var f = picker.files[0];
      if (!f || !/^image\//.test(f.type)) return;
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          /* Hard downscale: the portrait travels inline inside every sync
             message, so a 4 MB photo would be a problem for the whole table. */
          var max = 256, k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          shop.keeperImage = c.toDataURL('image/png');
          save(); render();
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    };
    picker.click();
  }

  /* ==== data source ====================================================== */
  function sourceDialog() {
    var body = el('div', {});
    var status = el('div', {}), progress = el('div', {});
    body.appendChild(el('p', { class: 'step-sub' }, [
      'Shopsmith reads item data from your own 5etools folder. Nothing is bundled.'
    ]));
    if (location.protocol === 'file:') {
      body.appendChild(el('div', { class: 'warn-box', html:
        '<b>Opened from a file:// path.</b> Browsers block the remembered-folder API there. ' +
        'Run <code>node tools/serve.js</code> and use <code>http://localhost:5173</code>.' }));
    }
    body.appendChild(el('div', { class: 'panel' }, [
      el('h3', {}, ['Folder']),
      el('div', { class: 'btnrow' }, [
        FT.supportsFS() ? btn('Choose folder & remember…', function () {
          FT.pickDirectory().then(function (h) {
            status.innerHTML = '';
            status.appendChild(el('div', { class: 'ok-box' }, ['Reading “' + h.name + '”…']));
            runLoad();
          }).catch(function (e) {
            if (e && e.name !== 'AbortError') {
              status.innerHTML = '';
              status.appendChild(el('div', { class: 'err-box' }, [String(e.message || e)]));
            }
          });
        }, 'sm primary') : null,
        btn('One-time pick…', function () {
          var picker = U.$('#dirPicker');
          picker.value = '';
          picker.onchange = function () {
            if (!picker.files.length) return;
            if (!FT.useFolder(picker.files)) {
              status.innerHTML = '';
              status.appendChild(el('div', { class: 'err-box' }, ['No JSON under a data/ folder there.']));
              return;
            }
            runLoad();
          };
          picker.click();
        }, 'sm')
      ])
    ]));
    body.appendChild(status);
    body.appendChild(progress);

    function runLoad() {
      U.clear(progress);
      var bar = el('i', { style: { width: '4%' } });
      var lab = el('div', { class: 'tiny' }, ['starting…']);
      progress.appendChild(el('div', { class: 'progress' }, [bar]));
      progress.appendChild(lab);
      var seen = 0;
      FT.loadAll(function (p) {
        seen = Math.max(seen, p.files);
        bar.style.width = Math.min(96, 4 + seen * 0.55) + '%';
        lab.textContent = p.phase + ' — ' + p.files + ' files, ' + p.records + ' records';
      }).then(function (st) {
        bar.style.width = '100%';
        if (!st.records) {
          status.innerHTML = '';
          status.appendChild(el('div', { class: 'err-box' }, ['Loaded nothing from there.']));
          return;
        }
        FT.saveCache();
        updateBadge();
        render();
        status.innerHTML = '';
        status.appendChild(el('div', { class: 'ok-box' }, [
          'Loaded ' + st.records + ' records — ' + (FT.get('item') || []).length + ' items.'
        ]));
      }).catch(function (e) {
        status.innerHTML = '';
        status.appendChild(el('div', { class: 'err-box' }, ['Load failed: ' + (e && e.message || e)]));
      });
    }

    modal('Data Source', body);
  }

  /* ==== widgets ========================================================== */
  function row(label, ctrl, wide) {
    return el('div', { class: 'row' + (wide ? ' wide' : '') }, [el('label', {}, [label]), ctrl]);
  }
  function text(v, cb, ph) {
    return el('input', { type: 'text', value: v == null ? '' : v, placeholder: ph || '',
      onInput: function (e) { cb(e.target.value); } });
  }
  function num(v, min, max, cb, step) {
    return el('input', { type: 'number', value: v, min: min, max: max, step: step || 1,
      onInput: function (e) { cb(parseFloat(e.target.value) || 0); } });
  }
  function btn(label, fn, cls) {
    return el('button', { class: 'btn ' + (cls || ''), onClick: fn }, [label]);
  }
  function modal(title, body) {
    var root = U.$('#modalRoot');
    U.clear(root);
    var box = el('div', { class: 'modal' }, [
      el('h3', {}, [title]),
      el('div', { class: 'body' }, [body]),
      el('div', { class: 'foot' }, [btn('Close', function () { U.clear(root); }, 'primary')])
    ]);
    var bg = el('div', { class: 'modal-bg', onClick: function (e) { if (e.target === bg) U.clear(root); } }, [box]);
    root.appendChild(bg);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
