/* Virtual Tactics :: ui/sprites.js
   Custom sprite library. Drop a PNG on the board (or use Import) and it becomes
   a token you can assign to any creature. Single images and 4-row directional
   sheets both work; sheets animate if you tell them how many columns they have.
   Images are stored inline in the campaign file so a saved campaign is one
   self-contained thing you can hand to another player. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util, el = U.el, ui = VT.ui;

  var MAX_DIM = 1024;   // downscale monsters-sized PNGs so the save file stays sane

  /* ---- import ---------------------------------------------------------- */
  function readFile(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) return reject(new Error(file.name + ' is not an image.'));
      var fr = new FileReader();
      fr.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          if (Math.max(w, h) > MAX_DIM) {
            var k = MAX_DIM / Math.max(w, h);
            w = Math.round(w * k); h = Math.round(h * k);
            var c = document.createElement('canvas');
            c.width = w; c.height = h;
            var ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, w, h);
            resolve({ src: c.toDataURL('image/png'), w: w, h: h, name: file.name });
          } else {
            resolve({ src: fr.result, w: w, h: h, name: file.name });
          }
        };
        img.onerror = function () { reject(new Error('Could not decode ' + file.name)); };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  function importFiles(files, onDone) {
    var list = Array.prototype.slice.call(files);
    if (!list.length) return;
    Promise.all(list.map(readFile)).then(function (results) {
      var added = results.map(function (r) {
        return VT.store.addSprite({
          name: r.name.replace(/\.[^.]+$/, ''),
          src: r.src, w: r.w, h: r.h,
          cols: 1, rows: 1, scale: 1, animate: false
        });
      });
      var save = VT.store.save();
      if (!save.ok) {
        ui.logLine('<span class="miss">' + U.esc(save.error) + '</span>');
      }
      ui.logLine('Imported <b>' + added.length + '</b> sprite' + (added.length > 1 ? 's' : '') + '.');
      if (onDone) onDone(added);
    }).catch(function (e) {
      ui.logLine('<span class="miss">' + U.esc(e.message) + '</span>');
    });
  }

  /* ---- library grid ---------------------------------------------------- */
  function tile(rec, selected, onClick) {
    var box = el('div', {
      class: 'swatch' + (selected ? ' sel' : ''),
      style: { height: '76px', background: '#12111a' },
      title: rec.name + ' (' + rec.w + '×' + rec.h + ')',
      onClick: onClick
    }, [el('span', {}, [rec.name])]);
    var im = el('img', {
      src: rec.src,
      style: {
        position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
        objectFit: 'contain', imageRendering: 'pixelated', padding: '4px 4px 14px'
      }
    });
    box.insertBefore(im, box.firstChild);
    return box;
  }

  /* ---- picker ---------------------------------------------------------- */
  function pick(actor, onDone) {
    var body = el('div', {});
    var m;

    function refresh() {
      U.clear(body);
      var sprites = VT.store.campaign.sprites;
      var keys = Object.keys(sprites);

      body.appendChild(el('div', { class: 'btnrow', style: { marginBottom: '10px' } }, [
        ui.btn('Import image…', function () {
          var picker = U.$('#imgPicker');
          picker.value = '';
          picker.onchange = function () { importFiles(picker.files, refresh); };
          picker.click();
        }, 'sm primary'),
        ui.btn('Use generated art', function () {
          actor.spriteId = null;
          VT.store.touch();
          if (onDone) onDone();
          m.close();
        }, 'sm')
      ]));

      if (!keys.length) {
        body.appendChild(el('p', { class: 'hint' }, [
          'No custom sprites yet. Import a PNG, or just drag image files straight onto the board. ',
          'Transparent PNGs look best; anything roughly 32–128 px tall sits nicely on a tile.'
        ]));
      } else {
        body.appendChild(el('div', { class: 'palette', style: { gridTemplateColumns: 'repeat(4,1fr)' } },
          keys.map(function (id) {
            return tile(sprites[id], actor.spriteId === id, function () {
              actor.spriteId = id;
              VT.store.touch();
              refresh();
            });
          })));
      }

      if (actor.spriteId && sprites[actor.spriteId]) {
        var rec = sprites[actor.spriteId];
        body.appendChild(el('div', { class: 'sec-h', style: { margin: '12px -16px 8px' } }, ['Sheet settings']));
        body.appendChild(el('div', { class: 'grid3' }, [
          ui.row('Columns', ui.num(rec.cols || 1, 1, 24, function (v) {
            rec.cols = Math.max(1, v | 0); VT.sprites.dropImage(rec.id); VT.store.touch(); refresh();
          })),
          ui.row('Rows', ui.num(rec.rows || 1, 1, 24, function (v) {
            rec.rows = Math.max(1, v | 0); VT.sprites.dropImage(rec.id); VT.store.touch(); refresh();
          })),
          ui.row('Scale', ui.num(rec.scale || 1, 0.2, 4, function (v) {
            rec.scale = v || 1; VT.store.touch();
          }, 0.1))
        ]));
        body.appendChild(el('div', { class: 'row' }, [
          ui.toggle('Animate columns', !!rec.animate, function (v) { rec.animate = v; VT.store.touch(); }),
          ui.btn('Rename', function () {
            var input = ui.text(rec.name, function (v) { rec.name = v; });
            ui.modal({
              title: 'Rename sprite', body: el('div', {}, [input]),
              buttons: [{ label: 'Done', cls: 'primary', onClick: function () { VT.store.touch(); refresh(); } }]
            });
          }, 'sm'),
          ui.btn('Delete', function () {
            ui.confirm('Delete this sprite? Creatures using it fall back to generated art.', function () {
              var id = rec.id;
              VT.store.removeSprite(id);
              VT.sprites.dropImage(id);
              VT.store.campaign.maps.forEach(function (mp) {
                mp.tokens.forEach(function (t) { if (t.spriteId === id) t.spriteId = null; });
              });
              VT.store.campaign.roster.forEach(function (r) { if (r.spriteId === id) r.spriteId = null; });
              actor.spriteId = null;
              refresh();
            }, 'Delete');
          }, 'sm danger')
        ]));
        body.appendChild(el('p', { class: 'hint' }, [
          'Rows are read as facings in this order: front, left, right, back. ',
          'Leave both at 1 for a plain single-image token.'
        ]));
      }
    }
    refresh();

    m = ui.modal({
      title: 'Sprite for ' + actor.name,
      body: body,
      buttons: [{ label: 'Done', cls: 'primary', onClick: function () { VT.store.touch(); if (onDone) onDone(); } }]
    });
  }

  /* ---- library manager (top bar) --------------------------------------- */
  function manage() {
    var body = el('div', {});
    function refresh() {
      U.clear(body);
      var sprites = VT.store.campaign.sprites;
      var keys = Object.keys(sprites);
      body.appendChild(el('div', { class: 'btnrow', style: { marginBottom: '10px' } }, [
        ui.btn('Import images…', function () {
          var picker = U.$('#imgPicker');
          picker.value = '';
          picker.onchange = function () { importFiles(picker.files, refresh); };
          picker.click();
        }, 'sm primary')
      ]));
      body.appendChild(keys.length
        ? el('div', { class: 'palette' }, keys.map(function (id) {
            return tile(sprites[id], false, function () {
              ui.confirm('Delete "' + U.esc(sprites[id].name) + '"?', function () {
                VT.store.removeSprite(id); VT.sprites.dropImage(id); refresh();
              }, 'Delete');
            });
          }))
        : el('p', { class: 'hint' }, ['Nothing imported yet. Drag PNG files onto the board, or use the button above.']));
      body.appendChild(el('p', { class: 'hint' }, ['Click a sprite to delete it. Assign sprites from a creature’s statblock.']));
    }
    refresh();
    ui.modal({ title: 'Sprite Library', body: body });
  }

  VT.spriteUI = { pick: pick, manage: manage, importFiles: importFiles };
})();
