/* Virtual Tactics :: core/store.js
   The single source of truth. One campaign object holds every map, every actor
   template and every custom sprite, so "save" is one JSON blob you can email to
   your table. Autosaves to localStorage; Export writes a .vtcampaign file. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;
  var KEY = 'vtactics.campaign.v1';

  var DEFAULT_SETTINGS = {
    /* Rules toggles - all of these change how combat resolves. */
    highGround: true,      // house rule: attacking from >=5ft above grants advantage
    diagonals: 'uniform',  // 'uniform' (PHB basic, 5ft) | 'alternating' (DMG 5-10-5)
    fallDamage: true,      // 1d6 per 10ft dropped
    opportunity: true,     // opportunity attacks when leaving reach
    cover: true,           // +2 / +5 AC from partial cover
    climbCost: true,       // climbing a 5ft step costs an extra 5ft of movement
    aiForFoes: true,       // foes take their own turns
    gridLines: true,
    animate: true,
    seed: ''
  };

  var store = {
    campaign: null,
    dirty: false,

    /* ---- lifecycle ----------------------------------------------------- */
    blank: function (name) {
      return {
        version: 1,
        name: name || 'New Campaign',
        created: Date.now(),
        maps: [],
        activeMapId: null,
        roster: [],
        sprites: {},
        settings: U.clone(DEFAULT_SETTINGS)
      };
    },

    init: function () {
      var loaded = null;
      try {
        var raw = localStorage.getItem(KEY);
        if (raw) loaded = JSON.parse(raw);
      } catch (e) { console.warn('[store] could not read saved campaign:', e); }
      this.campaign = loaded && loaded.maps ? this.migrate(loaded) : null;
      return this.campaign;
    },

    migrate: function (c) {
      c.settings = Object.assign(U.clone(DEFAULT_SETTINGS), c.settings || {});
      c.sprites = c.sprites || {};
      c.roster = c.roster || [];
      c.maps = c.maps || [];
      return c;
    },

    /* ---- persistence --------------------------------------------------- */
    save: function () {
      try {
        localStorage.setItem(KEY, JSON.stringify(this.campaign));
        this.dirty = false;
        return { ok: true };
      } catch (e) {
        /* Custom sprites are data URLs and localStorage caps around 5MB. */
        var quota = /quota|exceeded/i.test(String(e && e.name) + String(e && e.message));
        return {
          ok: false,
          error: quota
            ? 'Browser storage is full (custom sprites are stored inline). Use Export to save the campaign to a file instead.'
            : String(e && e.message || e)
        };
      }
    },

    autosave: U.debounce(function () { store.save(); }, 1200),

    touch: function () { this.dirty = true; this.autosave(); },

    exportFile: function () {
      var blob = new Blob([JSON.stringify(this.campaign, null, 1)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (this.campaign.name || 'campaign').replace(/[^\w-]+/g, '_') + '.vtcampaign.json';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },

    importJSON: function (text) {
      var data = JSON.parse(text);
      if (!data || !Array.isArray(data.maps)) throw new Error('Not a Virtual Tactics campaign file.');
      this.campaign = this.migrate(data);
      this.save();
      return this.campaign;
    },

    /* ---- accessors ----------------------------------------------------- */
    settings: function () { return this.campaign.settings; },

    activeMap: function () {
      var c = this.campaign;
      if (!c) return null;
      var m = c.maps.find(function (x) { return x.id === c.activeMapId; });
      return m || c.maps[0] || null;
    },

    setActiveMap: function (id) { this.campaign.activeMapId = id; this.touch(); },

    addMap: function (map) {
      this.campaign.maps.push(map);
      this.campaign.activeMapId = map.id;
      this.touch();
      return map;
    },

    removeMap: function (id) {
      var c = this.campaign;
      c.maps = c.maps.filter(function (m) { return m.id !== id; });
      if (c.activeMapId === id) c.activeMapId = c.maps.length ? c.maps[0].id : null;
      this.touch();
    },

    /* ---- sprite library ------------------------------------------------ */
    addSprite: function (sp) {
      sp.id = sp.id || U.uid('spr');
      this.campaign.sprites[sp.id] = sp;
      this.touch();
      return sp;
    },
    getSprite: function (id) { return id ? this.campaign.sprites[id] : null; },
    removeSprite: function (id) { delete this.campaign.sprites[id]; this.touch(); },

    /* ---- roster -------------------------------------------------------- */
    addToRoster: function (actor) {
      actor.id = actor.id || U.uid('tpl');
      this.campaign.roster.push(actor);
      this.touch();
      return actor;
    },
    removeFromRoster: function (id) {
      this.campaign.roster = this.campaign.roster.filter(function (a) { return a.id !== id; });
      this.touch();
    },

    DEFAULT_SETTINGS: DEFAULT_SETTINGS
  };

  VT.store = store;
})();
