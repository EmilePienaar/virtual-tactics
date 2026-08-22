/* Virtual Tactics :: ui/editor.js
   The Map tab. Paint terrain, sculpt elevation, drop props, place tokens.
   Strokes are snapshotted for undo, so sculpting a hillside is safe to
   experiment with. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, ui = VT.ui, G = VT.gmap;

  var editor = {
    tool: 'paint',
    terrain: 'grass',
    prop: 'tree',
    brush: 1,
    level: 0,
    team: 'foe',
    templateId: null,
    undo: [],
    _stroke: null
  };

  /* ---- undo ------------------------------------------------------------ */
  function snapshot(map) {
    return { id: map.id, tiles: JSON.stringify(map.tiles), tokens: JSON.stringify(map.tokens), w: map.w, h: map.h };
  }
  function beginStroke(map) { editor._stroke = snapshot(map); }
  function endStroke(map) {
    if (!editor._stroke) return;
    if (editor._stroke.tiles !== JSON.stringify(map.tiles) ||
        editor._stroke.tokens !== JSON.stringify(map.tokens)) {
      editor.undo.push(editor._stroke);
      if (editor.undo.length > 40) editor.undo.shift();
      VT.store.touch();
    }
    editor._stroke = null;
  }
  function undoLast(map) {
    var s = editor.undo.pop();
    if (!s || s.id !== map.id) return false;
    map.tiles = JSON.parse(s.tiles);
    map.tokens = JSON.parse(s.tokens);
    map.w = s.w; map.h = s.h;
    VT.store.touch();
    return true;
  }

  /* ---- painting -------------------------------------------------------- */
  function brushTiles(map, cx, cy) {
    var out = [], r = editor.brush - 1;
    for (var y = cy - r; y <= cy + r; y++) {
      for (var x = cx - r; x <= cx + r; x++) {
        if (!G.inB(map, x, y)) continue;
        if (editor.brush > 2 && U.gridDist(x, y, cx, cy) > r) continue;
        out.push({ x: x, y: y });
      }
    }
    return out;
  }

  /* alt = right mouse button / shift: the tool's inverse */
  function applyAt(map, cx, cy, alt) {
    var touched = false;
    brushTiles(map, cx, cy).forEach(function (p) {
      var t = G.at(map, p.x, p.y);
      if (!t) return;
      switch (editor.tool) {
        case 'paint':
          if (t.t !== editor.terrain) { t.t = editor.terrain; touched = true; }
          break;
        case 'raise': {
          var d = alt ? -1 : 1;
          var ne = U.clamp(t.e + d, 0, 12);
          if (ne !== t.e) { t.e = ne; touched = true; }
          break;
        }
        case 'level':
          if (t.e !== editor.level) { t.e = editor.level; touched = true; }
          break;
        case 'prop':
          if (alt) { if (t.p) { t.p = null; touched = true; } }
          else if (t.p !== editor.prop) { t.p = editor.prop; touched = true; }
          break;
        case 'erase':
          if (t.p) { t.p = null; touched = true; }
          var tok = G.anyTokenAt(map, p.x, p.y);
          if (tok) { map.tokens = map.tokens.filter(function (a) { return a.id !== tok.id; }); touched = true; }
          break;
      }
    });
    if (editor.tool === 'token') touched = placeToken(map, cx, cy, alt) || touched;
    return touched;
  }

  function placeToken(map, x, y, alt) {
    var existing = G.anyTokenAt(map, x, y);
    if (alt) {
      if (!existing) return false;
      map.tokens = map.tokens.filter(function (a) { return a.id !== existing.id; });
      return true;
    }
    if (existing) return false;
    if (!G.standable(map, x, y)) return false;
    var tpl = VT.store.campaign.roster.find(function (r) { return r.id === editor.templateId; });
    if (!tpl) { ui.logLine('<span class="miss">Pick a roster entry first (Roster tab).</span>'); return false; }
    var tok = VT.actor.instance(tpl, { x: x, y: y, team: editor.team });
    /* unique name for repeats: Goblin, Goblin 2, Goblin 3 ... */
    var same = map.tokens.filter(function (a) { return a.templateId === tpl.id; }).length;
    if (same) tok.name = tpl.name + ' ' + (same + 1);
    map.tokens.push(tok);
    return true;
  }

  /* ---- panel ----------------------------------------------------------- */
  function toolBtn(label, tool, title) {
    return el('button', {
      class: 'btn sm' + (editor.tool === tool ? ' on' : ''),
      title: title || '',
      onClick: function () { editor.tool = tool; VT.app.renderSide(); }
    }, [label]);
  }

  function render(container, map) {
    U.clear(container);
    var c = VT.store.campaign;

    /* --- map management --- */
    container.appendChild(ui.section('Map', map ? map.w + ' × ' + map.h : '', [
      map ? ui.row('Name', ui.text(map.name, function (v) { map.name = v; VT.store.touch(); VT.app.renderTitle(); })) : null,
      map ? ui.row('Width', ui.num(map.w, 4, 64, U.debounce(function (v) {
        G.resize(map, v, map.h); VT.store.touch(); VT.app.fit(); VT.app.renderSide();
      }, 400))) : null,
      map ? ui.row('Height', ui.num(map.h, 4, 64, U.debounce(function (v) {
        G.resize(map, map.w, v); VT.store.touch(); VT.app.fit(); VT.app.renderSide();
      }, 400))) : null,
      map ? ui.row('Light', ui.select(Object.keys(G.AMBIENCE).map(function (k) {
        return { value: k, label: G.AMBIENCE[k].name };
      }), map.ambience, function (v) { map.ambience = v; VT.store.touch(); })) : null,
      el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        ui.btn('New Map', newMapDialog, 'sm primary'),
        map ? ui.btn('Duplicate', function () {
          var copy = U.clone(map);
          copy.id = U.uid('map'); copy.name = map.name + ' (copy)';
          VT.store.addMap(copy); VT.app.fit(); VT.app.renderSide();
        }, 'sm') : null,
        map ? ui.btn('Delete', function () {
          ui.confirm('Delete "' + U.esc(map.name) + '" and everything on it?', function () {
            VT.store.removeMap(map.id); VT.app.fit(); VT.app.renderSide();
          }, 'Delete');
        }, 'sm danger') : null
      ]),
      c.maps.length > 1 ? el('div', { class: 'list', style: { marginTop: '8px' } },
        c.maps.map(function (m) {
          return el('div', {
            class: 'listitem' + (map && m.id === map.id ? ' sel' : ''),
            onClick: function () { VT.store.setActiveMap(m.id); VT.app.fit(); VT.app.renderSide(); }
          }, [el('div', { class: 't' }, [
            el('div', { class: 'n' }, [m.name]),
            el('div', { class: 's' }, [m.w + '×' + m.h + ' · ' + m.tokens.length + ' tokens'])
          ])]);
        })) : null
    ]));

    if (!map) return;

    /* --- tools --- */
    container.appendChild(ui.section('Tool', 'brush ' + editor.brush, [
      el('div', { class: 'btnrow' }, [
        toolBtn('Terrain', 'paint', 'Paint the tile surface'),
        toolBtn('Raise', 'raise', 'Left click raises, right click lowers'),
        toolBtn('Flatten', 'level', 'Set tiles to a fixed height'),
        toolBtn('Props', 'prop', 'Place scenery; right click removes'),
        toolBtn('Token', 'token', 'Place the selected roster entry'),
        toolBtn('Erase', 'erase', 'Clear props and tokens')
      ]),
      el('div', { class: 'row', style: { marginTop: '8px' } }, [
        el('label', {}, ['Brush']),
        el('input', {
          type: 'range', min: 1, max: 5, value: editor.brush,
          onInput: function (e) { editor.brush = parseInt(e.target.value, 10); VT.app.renderSide(); }
        })
      ]),
      editor.tool === 'level' ? ui.row('Height', el('input', {
        type: 'range', min: 0, max: 12, value: editor.level,
        onInput: function (e) { editor.level = parseInt(e.target.value, 10); VT.app.renderSide(); }
      })) : null,
      editor.tool === 'level' ? el('div', { class: 'muted' }, [editor.level * 5 + ' ft above the floor']) : null,
      el('div', { class: 'btnrow', style: { marginTop: '8px' } }, [
        ui.btn('Undo', function () { if (undoLast(map)) VT.app.renderSide(); }, 'sm', 'Ctrl+Z'),
        ui.btn('Fill terrain', function () {
          beginStroke(map);
          map.tiles.forEach(function (t) { t.t = editor.terrain; });
          endStroke(map);
        }, 'sm'),
        ui.btn('Flatten all', function () {
          beginStroke(map);
          map.tiles.forEach(function (t) { t.e = 0; });
          endStroke(map);
        }, 'sm'),
        ui.btn('Rolling hills', function () {
          beginStroke(map);
          G.softHills(map, 3, 3);
          endStroke(map);
        }, 'sm')
      ])
    ]));

    /* --- terrain palette --- */
    if (editor.tool === 'paint' || editor.tool === 'level' || editor.tool === 'raise') {
      container.appendChild(ui.section('Terrain', G.TERRAIN[editor.terrain].name, [
        el('div', { class: 'palette' }, G.TERRAIN_ORDER.map(function (k) {
          var def = G.TERRAIN[k];
          var sw = el('div', {
            class: 'swatch' + (editor.terrain === k ? ' sel' : ''),
            title: def.name + (def.cost > 1 ? ' · difficult terrain' : '') + (def.hazard ? ' · ' + def.hazard + ' damage' : ''),
            onClick: function () { editor.terrain = k; editor.tool = editor.tool === 'paint' ? 'paint' : editor.tool; VT.app.renderSide(); }
          }, [el('span', {}, [def.name])]);
          sw.insertBefore(VT.tileart.preview(k, 56), sw.firstChild);
          return sw;
        }))
      ]));
    }

    /* --- prop palette --- */
    if (editor.tool === 'prop') {
      container.appendChild(ui.section('Scenery', G.PROPS[editor.prop].name, [
        el('div', { class: 'palette' }, G.PROP_ORDER.map(function (k) {
          var def = G.PROPS[k];
          return el('div', {
            class: 'swatch' + (editor.prop === k ? ' sel' : ''),
            title: def.name + (def.blocks ? ' · blocks movement' : '') + (def.cover ? ' · ' + (def.cover === 'three' ? '3/4' : 'half') + ' cover' : ''),
            onClick: function () { editor.prop = k; VT.app.renderSide(); }
          }, [
            el('div', { style: { position: 'absolute', inset: '0', background: def.color, opacity: .55 } }),
            el('span', {}, [def.name])
          ]);
        })),
        el('p', { class: 'hint' }, ['Right-click a tile to remove scenery.'])
      ]));
    }

    /* --- token placement --- */
    if (editor.tool === 'token') {
      container.appendChild(ui.section('Place token', '', [
        ui.row('Side', ui.select([
          { value: 'party', label: 'Party' }, { value: 'foe', label: 'Enemy' }, { value: 'neutral', label: 'Neutral' }
        ], editor.team, function (v) { editor.team = v; })),
        el('div', { class: 'list' }, VT.store.campaign.roster.length
          ? VT.store.campaign.roster.map(function (r) {
            var item = el('div', {
              class: 'listitem' + (editor.templateId === r.id ? ' sel' : ''),
              onClick: function () { editor.templateId = r.id; VT.app.renderSide(); }
            }, [
              el('div', { class: 't' }, [
                el('div', { class: 'n' }, [r.name]),
                el('div', { class: 's' }, [(r.className || r.cr ? (r.className || 'CR ' + r.cr) : '') + ' · AC ' + r.ac + ' · ' + r.hpMax + ' hp'])
              ])
            ]);
            item.insertBefore(VT.actor.portrait(r, 26, 32), item.firstChild);
            return item;
          })
          : [el('div', { class: 'muted' }, ['Roster is empty — add heroes and monsters in the Roster tab.'])]),
        el('p', { class: 'hint' }, ['Click the board to place. Right-click a token to remove it.'])
      ]));
    }

    /* --- on the board --- */
    container.appendChild(ui.section('On this map', map.tokens.length + ' tokens', [
      map.tokens.length ? el('div', { class: 'list' }, map.tokens.map(function (t) {
        var item = el('div', {
          class: 'listitem',
          onClick: function () { VT.app.selectActor(t); VT.app.focusOn(t); }
        }, [
          el('div', { class: 't' }, [
            el('div', { class: 'n', style: { color: VT.sprites.TEAM_COLOR[t.team] } }, [t.name]),
            el('div', { class: 's' }, ['(' + t.x + ',' + t.y + ') · ' + t.hp + '/' + t.hpMax + ' hp'])
          ]),
          ui.btn('×', function (e) {
            e.stopPropagation();
            map.tokens = map.tokens.filter(function (a) { return a.id !== t.id; });
            VT.store.touch(); VT.app.renderSide();
          }, 'sm danger')
        ]);
        item.insertBefore(VT.actor.portrait(t, 26, 32), item.firstChild);
        return item;
      })) : el('div', { class: 'muted' }, ['Nothing placed yet.']),
      map.tokens.length ? ui.btn('Clear all tokens', function () {
        ui.confirm('Remove every token from this map?', function () {
          beginStroke(map); map.tokens = []; endStroke(map); VT.app.renderSide();
        }, 'Clear');
      }, 'sm danger full') : null
    ]));
  }

  /* ---- new map dialog --------------------------------------------------- */
  function newMapDialog() {
    var name = 'New Field', w = 20, h = 20, gen = 'plain';
    var body = el('div', {}, [
      ui.row('Name', ui.text(name, function (v) { name = v; })),
      el('div', { class: 'grid2' }, [
        ui.row('Width', ui.num(w, 4, 64, function (v) { w = v; })),
        ui.row('Height', ui.num(h, 4, 64, function (v) { h = v; }))
      ]),
      ui.row('Preset', ui.select([
        { value: 'plain', label: 'Open field' },
        { value: 'arena', label: 'Colosseum' },
        { value: 'canyon', label: 'Red canyon (chasms)' },
        { value: 'ruins', label: 'Sunken ruins' },
        { value: 'crypt', label: 'Forgotten crypt' },
        { value: 'volcano', label: 'Ashfall ridge (lava)' },
        { value: 'keep', label: 'Castle approach' },
        { value: 'blank', label: 'Blank slate' }
      ], gen, function (v) { gen = v; })),
      el('p', { class: 'hint' }, ['Presets are just a starting point — every tile stays editable.'])
    ]);
    ui.modal({
      title: 'New Map',
      body: body,
      buttons: [
        { label: 'Cancel' },
        { label: 'Create', cls: 'primary', onClick: function () {
          var m = gen === 'blank' ? G.create(w, h, {}) : G.GENERATORS[gen](w, h);
          m.name = name || m.name;
          VT.store.addMap(m);
          VT.app.fit();
          VT.app.renderSide();
        } }
      ]
    });
  }

  VT.editor = Object.assign(editor, {
    render: render, applyAt: applyAt, beginStroke: beginStroke, endStroke: endStroke,
    undoLast: undoLast, newMapDialog: newMapDialog
  });
})();
