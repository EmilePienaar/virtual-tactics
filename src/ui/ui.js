/* Virtual Tactics :: ui/ui.js
   Shared DOM widgets: sections, modals, the combat log, the initiative strip
   and the FFT-style action menu. Panels (editor / sheet / sprites) build on
   these so every tab looks like it belongs to the same program. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el;

  var logBody = null, initStrip = null, actionMenu = null, tooltipEl = null, floaters = null;

  function boot() {
    logBody = U.$('#logBody');
    initStrip = U.$('#initStrip');
    actionMenu = U.$('#actionMenu');
    tooltipEl = U.$('#tooltip');
    floaters = U.$('#floaters');
  }

  /* ---- building blocks ------------------------------------------------- */
  function section(title, right, children) {
    var head = el('div', { class: 'sec-h' }, [title]);
    if (right) head.appendChild(el('span', { class: 'sh-right' }, [right]));
    return el('div', { class: 'sec' }, [head, el('div', { class: 'sec-b' }, children)]);
  }

  function row(label, control, wide) {
    return el('div', { class: 'row' + (wide ? ' wide' : '') }, [
      label ? el('label', {}, [label]) : null,
      control
    ]);
  }

  function num(value, min, max, onChange, step) {
    return el('input', {
      type: 'number', value: value, min: min, max: max, step: step || 1,
      onInput: function (e) { onChange(parseFloat(e.target.value)); }
    });
  }
  function text(value, onChange, placeholder) {
    return el('input', {
      type: 'text', value: value == null ? '' : value, placeholder: placeholder || '',
      onInput: function (e) { onChange(e.target.value); }
    });
  }
  function select(options, value, onChange) {
    var s = el('select', {
      onChange: function (e) { onChange(e.target.value); }
    }, options.map(function (o) {
      var v = typeof o === 'string' ? o : o.value;
      var l = typeof o === 'string' ? U.cap(o) : o.label;
      return el('option', { value: v, selected: v === value }, [l]);
    }));
    s.value = value;
    return s;
  }
  function btn(label, onClick, cls, title) {
    return el('button', { class: 'btn ' + (cls || ''), onClick: onClick, title: title || '' }, [label]);
  }
  function toggle(label, value, onChange) {
    var b = el('button', { class: 'btn sm ' + (value ? 'on' : ''), onClick: function () {
      value = !value; b.className = 'btn sm ' + (value ? 'on' : ''); onChange(value);
    } }, [label]);
    return b;
  }

  /* ---- modal ----------------------------------------------------------- */
  function modal(opts) {
    var root = U.$('#modalRoot');
    U.clear(root);
    var box = el('div', { class: 'modal' }, [
      el('h3', {}, [opts.title || '']),
      el('div', { class: 'body' }, opts.body ? [opts.body] : []),
      el('div', { class: 'foot' }, (opts.buttons || [{ label: 'Close' }]).map(function (b) {
        return btn(b.label, function () {
          if (!b.onClick || b.onClick() !== false) close();
        }, b.cls);
      }))
    ]);
    var bg = el('div', { class: 'modal-bg', onClick: function (e) { if (e.target === bg && opts.dismissable !== false) close(); } }, [box]);
    root.appendChild(bg);
    function close() { U.clear(root); }
    return { close: close, box: box };
  }

  function confirm(message, onYes, yesLabel) {
    modal({
      title: 'Confirm',
      body: el('div', {}, [message]),
      buttons: [
        { label: 'Cancel' },
        { label: yesLabel || 'Confirm', cls: 'primary danger', onClick: onYes }
      ]
    });
  }

  /* ---- log ------------------------------------------------------------- */
  function logLine(html, cls) {
    if (!logBody) return;
    var line = el('div', { class: 'le ' + (cls || ''), html: html });
    logBody.appendChild(line);
    while (logBody.children.length > 400) logBody.removeChild(logBody.firstChild);
    logBody.scrollTop = logBody.scrollHeight;
  }
  function clearLog() { if (logBody) U.clear(logBody); }

  /* ---- floating combat text ------------------------------------------- */
  function floater(screenPos, textStr, color) {
    if (!floaters) return;
    var f = el('div', { class: 'floater', style: { left: screenPos.x + 'px', top: screenPos.y + 'px', color: color || '#fff' } }, [textStr]);
    floaters.appendChild(f);
    setTimeout(function () { f.remove(); }, 1200);
  }

  /* ---- tooltip --------------------------------------------------------- */
  function showTip(html, x, y) {
    if (!tooltipEl) return;
    tooltipEl.innerHTML = html;
    tooltipEl.classList.remove('hidden');
    var r = tooltipEl.getBoundingClientRect();
    var left = Math.min(x + 14, window.innerWidth - r.width - 8);
    var top = Math.min(y + 16, window.innerHeight - r.height - 8);
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';
  }
  function hideTip() { if (tooltipEl) tooltipEl.classList.add('hidden'); }

  /* ---- initiative strip ------------------------------------------------ */
  function renderInitiative(map, onPick) {
    if (!initStrip) return;
    var C = VT.combat;
    if (!C.active) { initStrip.classList.add('hidden'); return; }
    initStrip.classList.remove('hidden');
    U.clear(initStrip);
    var cur = C.current();
    C.order.forEach(function (id) {
      var a = C.byId(id);
      if (!a) return;
      var card = el('div', {
        class: 'init-card' + (cur && cur.id === id ? ' current' : '') + (a.hp <= 0 ? ' dead' : ''),
        onClick: function () { onPick(a); },
        onMouseenter: function (e) {
          showTip('<b>' + U.esc(a.name) + '</b><br>AC ' + a.ac + ' &middot; HP ' + a.hp + '/' + a.hpMax +
            (a.conditions && a.conditions.length ? '<br>' + a.conditions.join(', ') : ''), e.clientX, e.clientY);
        },
        onMouseleave: hideTip
      });
      card.appendChild(el('span', { class: 'tag', style: { background: VT.sprites.TEAM_COLOR[a.team] } }));
      card.appendChild(el('span', { class: 'ini' }, [String(a.initiative)]));
      card.appendChild(VT.actor.portrait(a, 52, 42));
      card.appendChild(el('div', { class: 'nm', title: a.name }, [a.name]));
      var bar = el('div', { class: 'hpbar' });
      var frac = U.clamp(a.hp / Math.max(1, a.hpMax), 0, 1);
      bar.appendChild(el('i', { style: { width: (frac * 100) + '%', background: frac > .5 ? '#78b06a' : frac > .25 ? '#d8b25c' : '#c9605a' } }));
      card.appendChild(bar);
      initStrip.appendChild(card);
    });
  }

  /* ---- action menu ----------------------------------------------------- */
  function actionItem(label, key, onClick, disabled, tip) {
    var b = el('button', {
      class: 'act', disabled: disabled ? true : null,
      onClick: onClick,
      onMouseenter: tip ? function (e) { showTip(tip, e.clientX, e.clientY); } : null,
      onMouseleave: tip ? hideTip : null
    }, [label]);
    if (key) b.appendChild(el('span', { class: 'k' }, [key]));
    return b;
  }

  function renderActionMenu(actor, ctx) {
    if (!actionMenu) return;
    if (!actor || !VT.combat.active || actor.hp <= 0) { actionMenu.classList.add('hidden'); return; }
    actionMenu.classList.remove('hidden');
    U.clear(actionMenu);

    var A = VT.actor;
    var canAct = A.canAct(actor);

    actionMenu.appendChild(actionItem(
      'Move  ' + Math.round(actor.moveLeft) + 'ft', 'M',
      function () { ctx.onMove(); }, actor.moveLeft <= 0 || !canAct,
      'Click a highlighted tile. Blue = safe, orange = you will drop and land prone, red = hazard.'
    ));

    (actor.actions || []).forEach(function (act, i) {
      var used = (act.cost === 'action' && actor.actionUsed) || (act.cost === 'bonus' && actor.bonusUsed);
      var left = A.usesLeft(actor, act);
      var label = act.name + (act.uses ? '  (' + left + ')' : '');
      var tipParts = [
        '<b>' + U.esc(act.name) + '</b>',
        act.kind === 'melee' ? 'Melee, reach ' + (act.reach || 5) + ' ft'
          : act.kind === 'ranged' ? 'Ranged ' + act.range[0] + '/' + act.range[1] + ' ft'
          : act.kind === 'save' ? 'DC ' + act.dc + ' ' + String(act.save).toUpperCase() +
            (act.aoe ? ', ' + act.aoe.radius + ' ft radius' : '')
          : act.kind === 'heal' ? 'Healing' : 'Effect',
        act.dmg && act.dmg !== '0' ? (act.kind === 'heal' ? 'Restores ' : 'Damage ') + act.dmg +
          (act.dmgType ? ' ' + act.dmgType : '') : null,
        act.cost === 'bonus' ? '<i>Bonus action</i>' : null
      ].filter(Boolean);
      actionMenu.appendChild(actionItem(label, String(i + 1),
        function () { ctx.onAction(act); },
        used || left <= 0 || act.cost === 'reaction' || !canAct,
        tipParts.join('<br>')));
    });

    if (A.hasCond(actor, 'prone')) {
      actionMenu.appendChild(actionItem('Stand Up', 'S', function () { ctx.onStand(); },
        actor.moveLeft < Math.ceil(A.speedOf(actor) / 2)));
    }
    actionMenu.appendChild(actionItem('Dash', 'D', function () { ctx.onDash(); }, actor.actionUsed || !canAct,
      'Action: gain your speed again in movement.'));
    actionMenu.appendChild(actionItem('Dodge', 'V', function () { ctx.onDodge(); }, actor.actionUsed || !canAct,
      'Action: attacks against you have disadvantage until your next turn.'));
    actionMenu.appendChild(actionItem('Disengage', 'X', function () { ctx.onDisengage(); }, actor.actionUsed || !canAct,
      'Action: moving out of reach provokes no opportunity attacks.'));
    actionMenu.appendChild(actionItem('End Turn', 'Space', function () { ctx.onEnd(); }, false));
  }

  function hideActionMenu() { if (actionMenu) actionMenu.classList.add('hidden'); }

  VT.ui = {
    boot: boot, section: section, row: row, num: num, text: text, select: select,
    btn: btn, toggle: toggle, modal: modal, confirm: confirm,
    logLine: logLine, clearLog: clearLog, floater: floater,
    showTip: showTip, hideTip: hideTip,
    renderInitiative: renderInitiative, renderActionMenu: renderActionMenu,
    hideActionMenu: hideActionMenu
  };
})();
