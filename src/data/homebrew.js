/* Virtual Tactics :: data/homebrew.js
   Local storage for user-authored content.

   Homebrew is written in the SAME 5etools schema as everything else, which is
   the whole trick: once saved it is merged into the compendium and every part
   of the app - the character builder's pickers, the Forge, search, conversion
   to statblocks - treats it identically to book content. No special cases.

   Stored in localStorage under its own key, so it survives reloading or
   switching your 5etools data source, and exports as a plain JSON file you can
   share with your table. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;
  var KEY = 'vtactics.homebrew.v1';

  /* Everything the compendium buckets content into. The last six matter for
     the choice tree: a class is not really a class without its subclasses, its
     feature records and the optional features it may pick from, and a book
     converted from a PDF brings all of them at once. Our internal bucket names
     are lower-case with no camel hump; 5etools files use their own spelling,
     which FILE_KEYS maps. */
  var TYPES = ['race', 'subrace', 'class', 'subclass', 'classfeature',
               'subclassfeature', 'background', 'spell', 'item', 'feat',
               'optionalfeature', 'spelllistchange'];

  var FILE_KEYS = {
    race: ['race'], subrace: ['subrace'], 'class': ['class'],
    subclass: ['subclass'], classfeature: ['classFeature', 'classfeature'],
    subclassfeature: ['subclassFeature', 'subclassfeature'],
    background: ['background'], spell: ['spell'],
    item: ['item', 'baseitem'], feat: ['feat'],
    optionalfeature: ['optionalfeature', 'optionalFeature'],
    spelllistchange: ['spelllistchange', 'spellListChange']
  };

  var hb = {
    data: null,

    blank: function () {
      var d = {};
      TYPES.forEach(function (t) { d[t] = []; });
      return d;
    },

    load: function () {
      try {
        var raw = localStorage.getItem(KEY);
        this.data = raw ? JSON.parse(raw) : this.blank();
      } catch (e) {
        this.data = this.blank();
      }
      TYPES.forEach(function (t) { if (!Array.isArray(hb.data[t])) hb.data[t] = []; }.bind(this));
      return this.data;
    },

    save: function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.data));
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e && e.message || e) };
      }
    },

    list: function (type) { return (this.data && this.data[type]) || []; },

    count: function () {
      var n = 0;
      TYPES.forEach(function (t) { n += hb.list(t).length; });
      return n;
    },

    /* Insert or replace by __hbId. */
    upsert: function (type, rec) {
      if (!this.data[type]) this.data[type] = [];
      rec.__hbId = rec.__hbId || U.uid('hb');
      rec.__hb = true;
      var arr = this.data[type];
      var i = arr.findIndex(function (r) { return r.__hbId === rec.__hbId; });
      if (i >= 0) arr[i] = rec; else arr.push(rec);
      var res = this.save();
      this.apply();
      return res.ok ? rec : null;
    },

    remove: function (type, id) {
      this.data[type] = this.list(type).filter(function (r) { return r.__hbId !== id; });
      this.save();
      this.apply();
    },

    get: function (type, id) {
      return this.list(type).find(function (r) { return r.__hbId === id; }) || null;
    },

    /* Push everything into the loaded compendium so the rest of the app sees it. */
    apply: function () {
      if (VT.fivetools && VT.fivetools.setHomebrew) {
        VT.fivetools.setHomebrew(this.data);
      }
    },

    exportFile: function () {
      var payload = { _format: 'vtactics-homebrew', version: 1, created: Date.now(), data: this.data };
      var blob = new Blob([JSON.stringify(payload, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'homebrew.vthb.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    },

    /* Accepts our own export, or a raw 5etools-shaped file ({race:[...]} etc). */
    importJSON: function (text, merge) {
      var parsed = JSON.parse(text);
      var incoming = parsed && parsed.data ? parsed.data : parsed;
      if (!incoming || typeof incoming !== 'object') throw new Error('Not a homebrew file.');

      var added = 0;
      if (!merge) this.data = this.blank();
      TYPES.forEach(function (t) {
        var src = null;
        (FILE_KEYS[t] || [t]).forEach(function (k) {
          if (!src && Array.isArray(incoming[k])) src = incoming[k];
        });
        if (!Array.isArray(src)) return;
        src.forEach(function (r) {
          if (!r) return;
          /* A race's default subrace has no name at all - see baseSubrace in
             charbuild.js - so a nameless record is only junk outside that one
             bucket. */
          if (!r.name && !(t === 'subrace' && r.raceName)) return;
          var copy = U.clone(r);
          copy.__hbId = copy.__hbId || U.uid('hb');
          copy.__hb = true;
          copy.source = copy.source || 'HB';
          hb.data[t] = hb.data[t] || [];
          hb.data[t].push(copy);
          added++;
        });
      });
      if (!added) throw new Error('No recognised entries found in that file.');
      this.save();
      this.apply();
      return added;
    },

    clearAll: function () {
      this.data = this.blank();
      this.save();
      this.apply();
    },

    TYPES: TYPES,
    /* The five you can author by hand in the Homebrew tab. The rest of TYPES
       arrives only by importing a converted book - there is no sensible form
       for "subclass feature #94", but it still has to be stored and merged. */
    AUTHORED: ['race', 'class', 'background', 'spell', 'item'],
    FILE_KEYS: FILE_KEYS,
    KEY: KEY
  };

  VT.homebrew = hb;
})();
