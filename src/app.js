/* Virtual Tactics :: app.js
   Boot, input, the play-mode state machine, and the frame loop. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, ui = VT.ui, G = VT.gmap, P = VT.path, C = VT.combat, A = VT.actor;

  var app = {
    mode: 'play',            // play | map | roster
    phase: 'idle',           // idle | move | target
    selected: null,
    pendingAction: null,
    hover: null,
    range: null,
    path: null,
    targets: null,
    aoe: null,
    aiRunning: false
  };

  var canvas, cam, renderer, side, stageWrap;
  var drag = null, spaceDown = false, lastT = 0;

  /* ==== boot ============================================================ */
  function boot() {
    ui.boot();
    canvas = U.$('#stage');
    side = U.$('#side');
    stageWrap = U.$('#stageWrap');

    var campaign = VT.store.init();
    if (!campaign) {
      VT.store.campaign = starterCampaign();
      VT.store.save();
      ui.logLine('Welcome. A starter party and a battlefield are ready — press <b>Roll Initiative</b>.', 'turn');
    } else {
      ui.logLine('Campaign <b>' + U.esc(campaign.name) + '</b> loaded.', 'turn');
    }
    VT.dice.setSeed(VT.store.settings().seed);

    cam = new VT.Camera();
    renderer = new VT.Renderer(canvas, cam);
    app.cam = cam; app.renderer = renderer;

    wireTopBar();
    wireModes();
    wireCanvas();
    wireKeys();
    wireBus();

    window.addEventListener('resize', function () { renderer.resize(); });
    /* A window resize event isn't enough: the stage also changes size when the
       page is first laid out (e.g. opened in a background tab, where it starts
       at zero) or when panels appear. Track the element itself. */
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        var r = stageWrap.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        var was = cam.vw;
        renderer.resize();
        if (was < 2) fit();
      });
      ro.observe(stageWrap);
    }
    renderer.resize();
    fit();
    setMode('play');
    renderTitle();
    requestAnimationFrame(frame);
  }

  /* ==== starter content ================================================= */
  function starterCampaign() {
    var c = VT.store.blank('Sword Coast Skirmish');
    VT.store.campaign = c;

    ['fighter', 'rogue', 'wizard', 'cleric'].forEach(function (k) {
      var a = A.fromClass(k, null, 3);
      c.roster.push(a);
    });
    ['goblin', 'wolf', 'orc', 'skeleton', 'ogre', 'bandit', 'spider', 'wight'].forEach(function (k) {
      c.roster.push(A.fromMonster(k));
    });

    var map = G.GENERATORS.ruins(20, 20);
    map.name = 'Sunken Ruins';
    c.maps.push(map);
    c.activeMapId = map.id;

    /* put the party at one end and a warband at the other */
    var heroes = c.roster.filter(function (r) { return r.team === 'party'; });
    heroes.forEach(function (r, i) {
      var spot = findOpen(map, 2 + i, 16);
      if (spot) map.tokens.push(A.instance(r, { x: spot.x, y: spot.y, team: 'party', fx: 1, fy: -1 }));
    });
    /* Spread wide rather than clumped - a huddled warband just eats one
       Fireball, and the first fight should actually be a fight. */
    var band = ['ogre', 'orc', 'goblin', 'goblin', 'goblin', 'wolf', 'wolf'];
    var spots = [[10, 2], [14, 4], [17, 2], [6, 3], [17, 8], [12, 6], [15, 11]];
    band.forEach(function (k, i) {
      var tpl = c.roster.find(function (r) { return r.monsterKey === k; });
      if (!tpl) return;
      var spot = findOpen(map, spots[i][0], spots[i][1]);
      if (!spot) return;
      var tok = A.instance(tpl, { x: spot.x, y: spot.y, team: 'foe', fx: -1, fy: 1 });
      var same = map.tokens.filter(function (t) { return t.templateId === tpl.id; }).length;
      if (same) tok.name = tpl.name + ' ' + (same + 1);
      map.tokens.push(tok);
    });
    return c;
  }

  function findOpen(map, x, y) {
    for (var r = 0; r < 8; r++) {
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        var nx = x + dx, ny = y + dy;
        if (!G.inB(map, nx, ny)) continue;
        if (!G.standable(map, nx, ny)) continue;
        if (G.anyTokenAt(map, nx, ny)) continue;
        return { x: nx, y: ny };
      }
    }
    return null;
  }

  /* ==== wiring ========================================================== */
  function wireTopBar() {
    U.$('#btnRotL').onclick = function () { cam.rotate(-1, map()); };
    U.$('#btnRotR').onclick = function () { cam.rotate(1, map()); };
    U.$('#btnCenter').onclick = function () { fit(); };
    U.$('#btnSave').onclick = function () {
      var r = VT.store.save();
      ui.logLine(r.ok ? 'Campaign saved to this browser.' : '<span class="miss">' + U.esc(r.error) + '</span>');
    };
    U.$('#btnExport').onclick = function () { VT.store.exportFile(); ui.logLine('Campaign exported.'); };
    U.$('#btnImport').onclick = function () {
      var picker = U.$('#filePicker');
      picker.value = '';
      picker.onchange = function () {
        var f = picker.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () {
          try {
            VT.store.importJSON(fr.result);
            C.end();
            app.selected = null;
            fit(); renderSide(); renderTitle();
            ui.logLine('Loaded <b>' + U.esc(VT.store.campaign.name) + '</b>.', 'turn');
          } catch (e) {
            ui.logLine('<span class="miss">Import failed: ' + U.esc(e.message) + '</span>');
          }
        };
        fr.readAsText(f);
      };
      picker.click();
    };
    U.$('#btnSettings').onclick = settingsDialog;
  }

  function wireModes() {
    U.$$('.mode-btn').forEach(function (b) {
      b.onclick = function () { setMode(b.dataset.mode); };
    });
  }

  function setMode(m) {
    app.mode = m;
    U.$$('.mode-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.mode === m); });
    if (m !== 'play') { app.phase = 'idle'; app.range = null; app.targets = null; }
    renderSide();
    updateHint();
  }

  function wireBus() {
    VT.bus.on('log', function (html, cls) { ui.logLine(html, cls); });
    VT.bus.on('update', function () { renderSide(); });
    VT.bus.on('floater', function (actor, text, color) {
      if (!map() || !renderer) return;
      ui.floater(renderer.tokenScreen(map(), actor), text, color);
    });
    VT.bus.on('turn', onTurn);
  }

  /* ==== turn flow ======================================================= */
  function onTurn(actor) {
    app.phase = 'idle';
    app.range = null; app.targets = null; app.aoe = null; app.path = null;
    app.pendingAction = null;
    if (!actor) { ui.hideActionMenu(); renderSide(); return; }

    app.selected = actor;
    focusOn(actor);

    var aiControlled = actor.team === 'foe' && VT.store.settings().aiForFoes;
    if (aiControlled) {
      ui.hideActionMenu();
      app.aiRunning = true;
      renderSide();
      setTimeout(function () {
        VT.ai.takeTurn(actor, function () {
          app.aiRunning = false;
          if (C.active) C.endTurn();
        });
      }, 420);
    } else {
      showMovement(actor);
      renderSide();
    }
  }

  function endTurn() {
    if (app.aiRunning || C.busy) return;
    C.endTurn();
  }

  /* A creature is yours to drive unless the AI has been handed the foes. */
  function isManual(actor) {
    return !!actor && !(actor.team === 'foe' && VT.store.settings().aiForFoes);
  }

  function showMovement(actor) {
    if (!actor || actor.hp <= 0 || !A.canAct(actor)) { app.phase = 'idle'; app.range = null; return; }
    app.phase = 'move';
    app.pendingAction = null;
    app.targets = null;
    app.range = P.reachable(map(), actor, actor.moveLeft);
    updateHint();
  }

  function beginTargeting(action) {
    var actor = C.current();
    if (!actor || !isManual(actor) || app.aiRunning || C.busy) return;
    app.selected = actor;
    app.pendingAction = action;
    app.phase = 'target';
    app.range = null;
    app.targets = C.targetsFor(actor, action);
    if (!app.targets.length) {
      ui.logLine('<span class="miss">Nothing in range for ' + U.esc(action.name) + '.</span>');
      showMovement(actor);
      return;
    }
    updateHint();
  }

  function cancelPhase() {
    var actor = C.active ? C.current() : null;
    if (app.phase === 'target' && actor) showMovement(actor);
    else { app.phase = 'idle'; app.range = null; app.targets = null; app.aoe = null; }
    app.pendingAction = null;
    updateHint();
  }

  /* ==== canvas input ==================================================== */
  function wireCanvas() {
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('mousedown', function (e) {
      canvas.focus();
      var pos = local(e);
      if (e.button === 1 || spaceDown || e.altKey) {
        drag = { pan: true, x: e.clientX, y: e.clientY };
        return;
      }
      var tile = renderer.pick(map(), pos.x, pos.y);
      if (!tile) return;

      if (app.mode === 'map') {
        VT.editor.beginStroke(map());
        drag = { paint: true, alt: e.button === 2, last: null };
        paintAt(tile, e.button === 2);
      } else {
        if (e.button === 2) { cancelPhase(); return; }
        clickPlay(tile);
      }
    });

    window.addEventListener('mousemove', function (e) {
      if (drag && drag.pan) {
        cam.panBy(e.clientX - drag.x, e.clientY - drag.y);
        drag.x = e.clientX; drag.y = e.clientY;
        return;
      }
      if (e.target !== canvas && !drag) { app.hover = null; return; }
      var pos = local(e);
      var tile = renderer.pick(map(), pos.x, pos.y);
      app.hover = tile;
      if (drag && drag.paint && tile) paintAt(tile, drag.alt);
      if (!drag) hoverFeedback(tile, e);
    });

    window.addEventListener('mouseup', function () {
      if (drag && drag.paint) { VT.editor.endStroke(map()); renderSide(); }
      drag = null;
    });

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var pos = local(e);
      cam.zoomAt(pos.x, pos.y, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    /* drag & drop sprite import */
    ['dragenter', 'dragover'].forEach(function (ev) {
      stageWrap.addEventListener(ev, function (e) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    });
    stageWrap.addEventListener('drop', function (e) {
      e.preventDefault();
      var files = e.dataTransfer.files;
      if (files && files.length) {
        VT.spriteUI.importFiles(files, function (added) {
          if (added && added.length && app.selected) {
            app.selected.spriteId = added[0].id;
            VT.store.touch();
            ui.logLine('Assigned <b>' + U.esc(added[0].name) + '</b> to ' + U.esc(app.selected.name) + '.');
            renderSide();
          }
        });
      }
    });
  }

  function local(e) {
    var r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function paintAt(tile, alt) {
    if (drag && drag.last && drag.last.x === tile.x && drag.last.y === tile.y) return;
    if (drag) drag.last = { x: tile.x, y: tile.y };
    if (VT.editor.applyAt(map(), tile.x, tile.y, alt)) VT.store.touch();
  }

  function hoverFeedback(tile, e) {
    app.path = null;
    app.aoe = null;
    if (!tile) { ui.hideTip(); return; }
    var m = map();

    if (app.mode === 'play' && app.phase === 'move' && app.range && app.range.has(tile.x + ',' + tile.y)) {
      app.path = P.pathTo(app.range, tile.x, tile.y);
      var node = app.range.get(tile.x + ',' + tile.y);
      ui.showTip(node.cost + ' ft' + (node.fall ? '<br><b>you will drop and land prone</b>' : '') +
        (node.danger ? '<br><b>hazardous ground</b>' : ''), e.clientX, e.clientY);
      return;
    }

    if (app.mode === 'play' && app.phase === 'target' && app.pendingAction) {
      var legal = (app.targets || []).some(function (t) { return t.x === tile.x && t.y === tile.y; });
      if (legal) {
        if (app.pendingAction.aoe) app.aoe = C.aoeTiles(app.pendingAction, tile.x, tile.y);
        var target = G.tokenAt(m, tile.x, tile.y);
        var actor = C.current();
        if (target && actor && (app.pendingAction.kind === 'melee' || app.pendingAction.kind === 'ranged')) {
          var pv = C.preview(actor, target, app.pendingAction);
          if (pv && !pv.blocked) {
            ui.showTip('<b>' + U.esc(target.name) + '</b><br>' + pv.chance + '% to hit vs AC ' + pv.ac +
              '<br>~' + pv.avg + ' damage' +
              (pv.adv > 0 ? '<br><b>advantage</b>' : pv.adv < 0 ? '<br><b>disadvantage</b>' : '') +
              (pv.why.length ? '<br><span style="opacity:.7">' + U.esc(pv.why.join(', ')) + '</span>' : ''),
              e.clientX, e.clientY);
            return;
          }
        }
      }
    }

    var tok = G.anyTokenAt(m, tile.x, tile.y);
    var t = G.at(m, tile.x, tile.y);
    var ter = G.TERRAIN[t.t];
    var lines = [];
    if (tok) lines.push('<b>' + U.esc(tok.name) + '</b> — ' + tok.hp + '/' + tok.hpMax + ' hp, AC ' + tok.ac);
    lines.push(ter.name + ' · ' + (t.e * 5) + ' ft' + (ter.cost > 1 ? ' · difficult' : ''));
    if (t.p) lines.push(G.PROPS[t.p].name);
    ui.showTip(lines.join('<br>'), e.clientX, e.clientY);
  }

  /* ==== play clicks ===================================================== */
  function clickPlay(tile) {
    var m = map();
    var tok = G.anyTokenAt(m, tile.x, tile.y);
    var actor = C.active ? C.current() : null;
    /* Deliberately independent of what is *selected*: inspecting another
       creature must never take away the active creature's own turn. */
    var isMyTurn = actor && isManual(actor) && !app.aiRunning && !C.busy;

    if (app.phase === 'target' && app.pendingAction && isMyTurn) {
      var legal = (app.targets || []).some(function (t) { return t.x === tile.x && t.y === tile.y; });
      if (!legal) { ui.logLine('<span class="miss">Out of range or out of sight.</span>'); return; }
      var res = C.performAction(actor, app.pendingAction, tile.x, tile.y);
      if (res && res.error) ui.logLine('<span class="miss">' + U.esc(res.error) + '</span>');
      showMovement(actor);
      renderSide();
      return;
    }

    if (app.phase === 'move' && isMyTurn && app.range && app.range.has(tile.x + ',' + tile.y) && !tok) {
      var path = P.pathTo(app.range, tile.x, tile.y);
      app.range = null; app.path = null;
      C.moveAlong(actor, path, function () {
        showMovement(actor);
        renderSide();
      });
      return;
    }

    if (tok) {
      selectActor(tok);
      if (C.active && actor && tok.id === actor.id) showMovement(actor);
      return;
    }
    /* Clicking bare ground clears the inspector, but leaves an active turn
       (and its movement overlay) exactly as it was. */
    app.selected = C.active ? actor : null;
    if (!C.active) { app.range = null; app.phase = 'idle'; }
    renderSide();
  }

  function selectActor(a) {
    app.selected = a;
    if (!C.active) { app.range = null; app.phase = 'idle'; }
    renderSide();
  }

  /* ==== keyboard ======================================================== */
  function wireKeys() {
    window.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.code === 'Space') { spaceDown = true; }
      var actor = C.active ? C.current() : null;
      var mine = actor && !app.aiRunning && !C.busy && isManual(actor);

      switch (e.key.toLowerCase()) {
        case 'q': cam.rotate(-1, map()); e.preventDefault(); break;
        case 'e': cam.rotate(1, map()); e.preventDefault(); break;
        case 'escape': cancelPhase(); break;
        case 'm': if (mine) { showMovement(actor); renderSide(); } break;
        case 'd': if (mine && C.dash(actor)) { showMovement(actor); renderSide(); } break;
        case 'v': if (mine && C.dodge(actor)) renderSide(); break;
        case 'x': if (mine && C.disengage(actor)) renderSide(); break;
        case 's': if (mine && C.standUp(actor)) { showMovement(actor); renderSide(); } break;
        case 'z':
          if ((e.ctrlKey || e.metaKey) && app.mode === 'map') {
            if (VT.editor.undoLast(map())) renderSide();
            e.preventDefault();
          }
          break;
        case 'home': fit(); break;
      }
      if (e.code === 'Space') {
        if (mine) { endTurn(); }
        e.preventDefault();
      }
      if (/^[1-9]$/.test(e.key) && mine) {
        var act = (actor.actions || [])[parseInt(e.key, 10) - 1];
        if (act) beginTargeting(act);
      }
    });
    window.addEventListener('keyup', function (e) { if (e.code === 'Space') spaceDown = false; });
  }

  /* ==== side panel ====================================================== */
  function renderSide() {
    if (!side) return;
    var m = map();
    if (app.mode === 'map') VT.editor.render(side, m);
    else if (app.mode === 'roster') VT.sheet.renderRoster(side);
    else VT.sheet.renderPlay(side, m, app.selected);

    ui.renderInitiative(m, function (a) { selectActor(a); focusOn(a); });

    var actor = C.active ? C.current() : null;
    if (app.mode === 'play' && actor && isManual(actor) && !app.aiRunning) {
      ui.renderActionMenu(actor, {
        onMove: function () { showMovement(actor); renderSide(); },
        onAction: function (act) { beginTargeting(act); renderSide(); },
        onDash: function () { if (C.dash(actor)) { showMovement(actor); renderSide(); } },
        onDodge: function () { if (C.dodge(actor)) renderSide(); },
        onDisengage: function () { if (C.disengage(actor)) renderSide(); },
        onStand: function () { if (C.standUp(actor)) { showMovement(actor); renderSide(); } },
        onEnd: function () { endTurn(); }
      });
    } else {
      ui.hideActionMenu();
    }
    updateHint();
  }

  function updateHint() {
    var h = U.$('#stageHint');
    if (!h) return;
    var bits = [];
    if (app.mode === 'map') {
      bits.push('LMB paint · RMB erase · MMB/Space drag to pan · wheel zoom · Q/E rotate · Ctrl+Z undo');
    } else if (app.phase === 'target') {
      bits.push('Choose a target — RMB or Esc to cancel');
    } else if (app.phase === 'move') {
      bits.push('Click a lit tile to move · 1-9 actions · Space ends turn · Q/E rotate');
    } else {
      bits.push('Click a creature to inspect · MMB/Space drag to pan · wheel zoom · Q/E rotate');
    }
    h.textContent = bits.join('');
  }

  function renderTitle() {
    var c = VT.store.campaign;
    document.title = (c ? c.name : 'Virtual Tactics') + ' — Virtual Tactics';
  }

  /* ==== settings ======================================================== */
  function settingsDialog() {
    var s = VT.store.settings();
    var body = el('div', {});
    function line(label, key, help) {
      return el('div', { class: 'row wide', style: { alignItems: 'flex-start' } }, [
        ui.toggle(label, s[key], function (v) { s[key] = v; VT.store.touch(); VT.bus.emit('repaint'); }),
        el('div', { class: 'muted', style: { flex: 1 } }, [help])
      ]);
    }
    body.appendChild(el('div', { class: 'sec-h', style: { margin: '0 -16px 8px' } }, ['House rules']));
    body.appendChild(line('High ground', 'highGround', 'Attacking from at least 5 ft above grants advantage. A tactics-game flavour, not a 5e rule.'));
    body.appendChild(line('Cover', 'cover', 'Scenery and terrain between attacker and target grant +2 or +5 AC.'));
    body.appendChild(line('Opportunity attacks', 'opportunity', 'Leaving an enemy’s reach provokes a free melee swing.'));
    body.appendChild(line('Falling damage', 'fallDamage', 'Dropping more than 10 ft deals 1d6 per 10 ft and knocks you prone.'));
    body.appendChild(line('Climb costs', 'climbCost', 'Scrambling up a 5 ft step costs an extra 5 ft of movement.'));
    body.appendChild(ui.row('Diagonals', ui.select([
      { value: 'uniform', label: 'Every square is 5 ft (PHB)' },
      { value: 'alternating', label: 'Diagonals 5/10/5 (DMG variant)' }
    ], s.diagonals, function (v) { s.diagonals = v; VT.store.touch(); })));

    body.appendChild(el('div', { class: 'sec-h', style: { margin: '12px -16px 8px' } }, ['Table']));
    body.appendChild(line('Foes act on their own', 'aiForFoes', 'Turn off to move every enemy by hand.'));
    body.appendChild(line('Grid lines', 'gridLines', 'Outline every tile.'));
    body.appendChild(line('Animation', 'animate', 'Smooth camera and token movement.'));
    body.appendChild(ui.row('Dice seed', ui.text(s.seed, function (v) {
      s.seed = v; VT.dice.setSeed(v); VT.store.touch();
    }, 'blank = truly random')));
    body.appendChild(el('p', { class: 'hint' }, [
      'A seed makes every roll reproducible — handy for testing an encounter, or for replaying a session exactly.'
    ]));

    body.appendChild(el('div', { class: 'sec-h', style: { margin: '12px -16px 8px' } }, ['Campaign']));
    body.appendChild(el('div', { class: 'btnrow' }, [
      ui.btn('Sprite library…', function () { VT.spriteUI.manage(); }, 'sm'),
      ui.btn('Export file', function () { VT.store.exportFile(); }, 'sm'),
      ui.btn('Start fresh', function () {
        ui.confirm('Discard this campaign and start a new one? Export first if you want to keep it.', function () {
          VT.store.campaign = starterCampaign();
          VT.store.save();
          C.end(); app.selected = null;
          fit(); renderSide(); renderTitle();
        }, 'Discard');
      }, 'sm danger')
    ]));

    ui.modal({ title: 'Settings', body: body, buttons: [{ label: 'Done', cls: 'primary' }] });
  }

  /* ==== frame =========================================================== */
  function frame(t) {
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0);
    lastT = t;
    var m = map();
    if (m) {
      cam.update(dt);
      C.update(dt);
      renderer.draw(m, {
        hover: app.hover,
        selected: app.selected,
        current: C.active ? C.current() : null,
        range: app.mode === 'play' ? app.range : null,
        path: app.path,
        targets: app.mode === 'play' ? app.targets : null,
        aoe: app.aoe,
        fx: C.fx
      }, dt);
    }
    requestAnimationFrame(frame);
  }

  /* ==== helpers ========================================================= */
  function map() { return VT.store.campaign ? VT.store.activeMap() : null; }
  function fit() { var m = map(); if (m) cam.fitMap(m, 90); }
  function focusOn(a) {
    var m = map();
    if (m && a) cam.focusTile(m, a.x, a.y, G.elev(m, a.x, a.y));
  }

  VT.app = Object.assign(app, {
    boot: boot, setMode: setMode, renderSide: renderSide, renderTitle: renderTitle,
    selectActor: selectActor, focusOn: focusOn, fit: fit, endTurn: endTurn,
    beginTargeting: beginTargeting, showMovement: showMovement, map: map
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
