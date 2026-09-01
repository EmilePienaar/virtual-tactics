/* Virtual Tactics :: data/fivetools.js
   Reads a 5etools-format data set and indexes it for search.

   Two ingest paths, because they fail in different ways:

     URL    - point at a self-hosted instance ("http://localhost:8080"). Fast,
              but the instance must send CORS headers, and most docker/nginx
              setups do not by default. We detect that and say so plainly
              instead of showing a generic network error.

     FOLDER - pick your local `data/` directory in a file dialog. No network, no
              CORS, works offline. Slower to load once, then cached.

   This module never ships any content of its own; it only reads what you point
   it at. Parsed results are cached in IndexedDB so the second load is instant. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* Fallback list for instances without data/bestiary/index.json. Misses are
     skipped silently, so an over-long list costs nothing but a few 404s. */
  var FALLBACK_BESTIARY = ['mm', 'phb', 'dmg', 'vgm', 'mtf', 'xge', 'ggr', 'skt', 'toa',
    'wdh', 'wdmm', 'brw', 'erlw', 'egw', 'idrotf', 'tce', 'vrgr', 'mpmm', 'sac',
    'cos', 'hotdq', 'rot', 'pota', 'oota', 'llk', 'gos', 'bgdia', 'mot', 'crcotn',
    'jttrc', 'wbtw', 'dsotdq', 'kftgv', 'bam', 'sais', 'phb24', 'mm25', 'dmg24'];
  var FALLBACK_SPELLS = ['phb', 'xge', 'tce', 'scag', 'ggr', 'ai', 'egw', 'idrotf',
    'ftd', 'scc', 'aag', 'bmt', 'phb24'];

  var FLAT_FILES = {
    item: ['items.json', 'items-base.json'],
    race: ['races.json'],
    background: ['backgrounds.json'],
    feat: ['feats.json'],
    optionalfeature: ['optionalfeatures.json'],
    condition: ['conditionsdiseases.json'],
    action: ['actions.json'],
    language: ['languages.json'],
    sense: ['senses.json'],
    skill: ['skills.json'],
    variantrule: ['variantrules.json'],
    deity: ['deities.json'],
    object: ['objects.json'],
    vehicle: ['vehicles.json'],
    reward: ['rewards.json'],
    psionic: ['psionics.json'],
    table: ['tables.json'],
    hazard: ['trapshazards.json'],
    magicvariant: ['magicvariants.json'],
    book: ['books.json'],
    adventure: ['adventures.json']
  };

  /* Which array key inside each JSON file holds the records. */
  var ARRAY_KEYS = {
    item: ['item', 'baseitem'], race: ['race', 'subrace'], background: ['background'],
    feat: ['feat'], optionalfeature: ['optionalfeature'],
    condition: ['condition', 'disease', 'status'], action: ['action'],
    language: ['language'], sense: ['sense'], skill: ['skill'],
    variantrule: ['variantrule'], deity: ['deity'], object: ['object'],
    vehicle: ['vehicle'], reward: ['reward'], psionic: ['psionic'],
    table: ['table'], hazard: ['trap', 'hazard'], magicvariant: ['magicvariant'],
    book: ['book'], adventure: ['adventure'],
    creature: ['monster'], spell: ['spell'], class: ['class', 'subclass', 'classFeature', 'subclassFeature']
  };

  var ft = {
    mode: null,          // 'url' | 'folder'
    baseUrl: '',
    files: null,         // path -> File, in folder mode
    db: {},              // kind -> [records]
    seen: {},            // kind|name|source -> 1, for an exact duplicate
    seenNames: {},       // kind|name -> 1, for a fallback layer that fills gaps only
    index: {},           // kind -> Map(lowername -> record[])
    sources: {},         // source code -> count
    dirName: null,       // name of a remembered directory handle, if any
    cachedAt: null,
    homebrew: {},        // user content, merged in after every load
    homebrewCount: 0,
    loaded: false,
    loading: false,
    stats: { files: 0, records: 0, failed: [] }
  };

  /* ---- low level fetch --------------------------------------------------- */
  function normBase(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (!url) return '';
    /* Accept any scheme (TaleSpire may serve a symbiote over file:// or its own)
       and leave relative paths alone; only bare hostnames get a scheme added. */
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
    if (url.charAt(0) === '.' || url.charAt(0) === '/') return url;
    return 'http://' + url;
  }

  function readJSON(relPath) {
    if (ft.mode === 'fs') {
      return fsResolve(relPath)
        .then(function (f) { return f.text(); })
        .then(JSON.parse)
        .catch(function (e) {
          /* a missing file is normal (we probe optional sources) */
          throw new Error(/NotFound|not be found/i.test(String(e && e.name) + String(e && e.message))
            ? 'missing' : (e && e.message) || 'read failed');
        });
    }
    if (ft.mode === 'folder') {
      var f = ft.files[relPath] || ft.files[relPath.replace(/^data\//, '')];
      if (!f) return Promise.reject(new Error('missing'));
      return f.text().then(JSON.parse);
    }
    return fetch(ft.baseUrl + '/' + relPath, { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  /* ---- connection check -------------------------------------------------- */
  /* Distinguishes "wrong URL" from "CORS blocked", which look identical to
     fetch() but need completely different fixes from the user. */
  function testUrl(url) {
    var base = normBase(url);
    if (!base) return Promise.resolve({ ok: false, reason: 'Enter a URL first.' });
    return fetch(base + '/data/backgrounds.json', { mode: 'cors', credentials: 'omit' })
      .then(function (r) {
        if (!r.ok) return { ok: false, reason: 'Reached the server but got HTTP ' + r.status + ' for /data/backgrounds.json. Is this the site root?' };
        return r.json().then(function () { return { ok: true, base: base }; });
      })
      .catch(function () {
        /* A no-cors probe that succeeds means the server is up and it's CORS. */
        return fetch(base + '/data/backgrounds.json', { mode: 'no-cors' })
          .then(function () {
            return { ok: false, cors: true, reason:
              'The server is reachable but is not sending CORS headers, so the browser blocks reading it. ' +
              'Either add "Access-Control-Allow-Origin: *" to that server, or use the Folder option instead.' };
          })
          .catch(function () {
            return { ok: false, reason: 'Could not reach ' + base + '. Check the address and that the instance is running.' };
          });
      });
  }

  /* ---- loading ----------------------------------------------------------- */
  /* One record's identity, for telling a genuine duplicate from two records
     that merely share a name.

     The source is part of it on purpose: the 2014 and 2024 Fighter are both
     called "Fighter" and are different classes, and collapsing them would rob
     a character of half their features. Two records with the same name AND the
     same printing, in the same bucket, are the same thing arriving twice -
     which is exactly what happens when someone whose own data set already
     contains the SRD then also gets the bundled copy.

     5etools stores a race's default subrace with no name at all, so those are
     keyed by the race they belong to instead; keyed by name they would all
     collide with each other and only the first race would keep its bonuses.

     `loose` drops the source from the key, which is the right question for a
     FALLBACK layer: the bundled SRD exists so that someone with no data has a
     Fireball, and someone who already has one - from any book - does not need
     the SRD's as well. Using the strict key there would put "Fireball (PHB)"
     and "Fireball (SRD)" side by side in every picker, which is the
     duplication this is meant to prevent. */
  function identityOf(kind, r, loose) {
    if (!r) return null;
    var name = String(r.name == null ? '' : r.name).toLowerCase();
    if (!name && kind === 'subrace' && r.raceName) {
      name = '__base:' + String(r.raceName).toLowerCase();
    }
    if (!name) return null;
    if (loose) return kind + '|' + name;
    return kind + '|' + name + '|' + String(r.source == null ? '' : r.source).toLowerCase();
  }

  /* opts.dedupe skips records already present. Off for the primary load, which
     starts from an empty db and should keep whatever the source contains; on
     when a second source is LAYERED over the first, where the whole point is
     that the overlap is not doubled. */
  function add(kind, records, sourceFile, noStats, opts) {
    if (!records || !records.length) return 0;
    ft.db[kind] = ft.db[kind] || [];
    var dedupe = !!(opts && opts.dedupe);
    var kept = 0;
    records.forEach(function (r) {
      if (!r) return;
      if (dedupe) {
        var loose = dedupe === 'name';
        var id = identityOf(kind, r, loose);
        if (id) {
          var book = loose ? ft.seenNames : ft.seen;
          if (book[id]) return;
          book[id] = 1;
          /* keep both indexes true, whichever one did the deciding */
          var other = identityOf(kind, r, !loose);
          if (other) (loose ? ft.seen : ft.seenNames)[other] = 1;
        }
      }
      if (sourceFile && /items-base\.json$/.test(sourceFile)) r.__baseItem = true;
      if (!r.name) {
        /* Almost everything is keyed by name, so a nameless record is noise -
           with one real exception. 5etools stores a race's DEFAULT subrace
           with no name at all, and that is the only place the standard
           Human's +1 to every ability score is written down. Keep those,
           flagged, and drop the rest. */
        if (kind !== 'subrace' || !r.raceName) return;
        r.__base = true;
        r.name = '';
      }
      r.__kind = kind;
      r.__file = sourceFile;
      ft.db[kind].push(r);
      kept++;
      if (r.source) ft.sources[r.source] = (ft.sources[r.source] || 0) + 1;
    });
    if (!noStats) ft.stats.records += kept;
    return kept;
  }

  /* Rebuild the identity index from whatever is in the db right now. Called
     before layering a second source in, so the layer knows what it is allowed
     to add. Cheap enough to do outright rather than maintain incrementally,
     and being derived from the db means it cannot drift out of step with it. */
  function reindexSeen() {
    ft.seen = {}; ft.seenNames = {};
    Object.keys(ft.db).forEach(function (kind) {
      (ft.db[kind] || []).forEach(function (r) {
        var id = identityOf(kind, r);
        if (id) ft.seen[id] = 1;
        var nm = identityOf(kind, r, true);
        if (nm) ft.seenNames[nm] = 1;
      });
    });
    return ft.seen;
  }

  function ingestFile(kind, json, path, dedupe) {
    var keys = ARRAY_KEYS[kind] || [kind];
    var opts = dedupe ? { dedupe: true } : null;
    var n = 0;
    keys.forEach(function (k) {
      if (Array.isArray(json[k])) n += add(kindFor(kind, k), json[k], path, false, opts);
    });
    /* Some files nest everything under a single unexpected key; take arrays of
       objects-with-names as a last resort so odd sources still land. */
    if (!n) {
      Object.keys(json).forEach(function (k) {
        if (Array.isArray(json[k]) && json[k].length && json[k][0] && json[k][0].name) {
          n += add(kind, json[k], path, false, opts);
        }
      });
    }
    return n;
  }

  /* subclass / classFeature live in class files but deserve their own bucket */
  /* Which array a record came from matters for exactly one thing: magic
     variants apply to BASE items only. "+1 Armor" makes "+1 Plate Armor" from
     the plain plate in items-base.json - never from an Animated Shield, which
     is already magic. Losing that distinction generates nonsense like
     "+1 Armor of Invulnerability". */
  function kindFor(fileKind, arrayKey) {
    if (fileKind === 'class') {
      if (arrayKey === 'subclass') return 'subclass';
      if (arrayKey === 'classFeature') return 'classfeature';
      if (arrayKey === 'subclassFeature') return 'subclassfeature';
      return 'class';
    }
    if (fileKind === 'race' && arrayKey === 'subrace') return 'subrace';
    if (fileKind === 'item' && arrayKey === 'baseitem') return 'item';
    return fileKind;
  }

  function tryLoad(kind, path, onProgress) {
    return readJSON(path)
      .then(function (json) {
        ft.stats.files++;
        var n = ingestFile(kind, json, path);
        if (onProgress) onProgress(path, n);
        return n;
      })
      .catch(function (e) {
        if (String(e.message) !== 'missing' && !/HTTP 404/.test(String(e.message))) {
          ft.stats.failed.push(path + ': ' + e.message);
        }
        return 0;
      });
  }

  /* Resolve a folder index (bestiary/spells/class) or fall back to guessing. */
  function resolveIndexed(kind, folder, prefix, fallbackCodes, onProgress) {
    return readJSON('data/' + folder + '/index.json')
      .then(function (idx) {
        var files = Object.keys(idx).map(function (src) { return idx[src]; });
        return files;
      })
      .catch(function () {
        if (ft.mode === 'fs') {
          return fsList('data/' + folder).then(function (names) {
            return names.filter(function (n) { return n.indexOf(prefix) === 0; });
          });
        }
        if (ft.mode === 'folder') {
          /* We already have the whole listing - just take what's there. */
          return Object.keys(ft.files)
            .filter(function (p) { return p.indexOf('data/' + folder + '/' + prefix) === 0 && /\.json$/.test(p); })
            .map(function (p) { return p.split('/').pop(); });
        }
        return fallbackCodes.map(function (c) { return prefix + c + '.json'; });
      })
      .then(function (files) {
        return runLimited(files.filter(function (f) { return f.indexOf('fluff') < 0 && f !== 'index.json'; }), 6,
          function (f) { return tryLoad(kind, 'data/' + folder + '/' + f, onProgress); });
      });
  }

  /* Bounded concurrency - a full bestiary is 100+ files and unbounded fetch
     storms make some self-hosted servers drop connections. */
  function runLimited(items, limit, fn) {
    var i = 0, active = 0, done = 0, total = items.length;
    return new Promise(function (resolve) {
      if (!total) return resolve();
      function next() {
        while (active < limit && i < total) {
          active++;
          fn(items[i++]).then(function () {
            active--; done++;
            if (done === total) resolve(); else next();
          });
        }
      }
      next();
    });
  }

  function loadAll(onProgress) {
    if (ft.loading) return Promise.reject(new Error('Already loading.'));
    ft.loading = true;

    /* Loading is atomic: a probe that finds nothing (a wrong folder, a missing
       bundled data/) must not destroy the compendium already in memory. */
    var prev = {
      db: ft.db, index: ft.index, sources: ft.sources, stats: ft.stats,
      seen: ft.seen, seenNames: ft.seenNames,
      loaded: ft.loaded, mode: ft.mode, baseUrl: ft.baseUrl, dirName: ft.dirName,
      spellLists: ft.spellLists, loot: ft.loot
    };
    function rollback() {
      ft.db = prev.db; ft.index = prev.index; ft.sources = prev.sources;
      ft.stats = prev.stats; ft.loaded = prev.loaded;
      ft.seen = prev.seen || {}; ft.seenNames = prev.seenNames || {};
      ft.mode = prev.mode; ft.baseUrl = prev.baseUrl; ft.dirName = prev.dirName;
      ft.spellLists = prev.spellLists;
      ft.loot = prev.loot;
      /* hbBundled is deliberately untouched: it came from beside the app, not
         from the source being rolled back, and losing it here would make a
         failed data load silently drop a supplement that is still present. */
      mergeHomebrew();
    }

    ft.db = {}; ft.index = {}; ft.sources = {}; ft.seen = {}; ft.seenNames = {};
    ft.stats = { files: 0, records: 0, failed: [] };
    var report = function (label) { if (onProgress) onProgress({ phase: label, files: ft.stats.files, records: ft.stats.records }); };

    var flat = [];
    Object.keys(FLAT_FILES).forEach(function (kind) {
      FLAT_FILES[kind].forEach(function (f) { flat.push({ kind: kind, path: 'data/' + f }); });
    });

    return runLimited(flat, 6, function (job) {
      return tryLoad(job.kind, job.path, function () { report('core data'); });
    })
      .then(function () { report('bestiary'); return resolveIndexed('creature', 'bestiary', 'bestiary-', FALLBACK_BESTIARY, function () { report('bestiary'); }); })
      .then(function () { report('spells'); return resolveIndexed('spell', 'spells', 'spells-', FALLBACK_SPELLS, function () { report('spells'); }); })
      .then(function () { report('classes'); return loadClasses(function () { report('classes'); }); })
      .then(function () { report('spell lists'); return loadSpellLists(); })
      .then(function () { report('treasure'); return loadLoot(); })
      .then(function () {
        report('magic items');
        var n = buildVariants();
        if (n) ft.stats.variants = n;
      })
      .then(function () { report('homebrew'); return loadFolderHomebrew(); })
      /* The bundled SRD goes on LAST and only fills gaps. Someone whose own
         data set already contains the SRD keeps their copy; someone whose does
         not gets the free rules underneath it. Either way nothing appears
         twice. */
      .then(function () { report('SRD'); return layerBundledSrd(); })
      .then(function () {
        var stats = ft.stats;
        if (!stats.records) {
          /* nothing found - put back whatever we had */
          rollback();
          ft.loading = false;
          report('done');
          return stats;
        }
        buildIndex();
        applyHomebrew();
        ft.loaded = true;
        ft.loading = false;
        report('done');
        return stats;
      })
      .catch(function (e) { rollback(); ft.loading = false; throw e; });
  }

  /* ---- the bundled SRD ---------------------------------------------------
     The free rules, shipped beside the app in srd/, so the tools do something
     useful before anyone has pointed them at a data folder. It is the only
     game content that travels with a build, and it travels because the SRD is
     the one set that may be shared - see the note on source books in the
     README.

     Two rules make this safe to have:

       - It is a FLOOR, never a ceiling. It is layered after everything else
         with dedupe on, so a record the user's own data already provided wins
         and the SRD copy is skipped. Load your own PHB and you do not end up
         with two Fireballs.
       - Absent is fine. No srd/ folder is the normal state of a source
         checkout, and everything carries on exactly as before.

     Same shape as a data folder - srd/data/... - so it is read by the ordinary
     loader rather than a second parser that would drift from it. */
  function srdBases() {
    /* A symbiote has srd/ beside it; the Forge is served from builder/ and the
       single-file build from dist/, so for those it is one level up. */
    return [appBase() + 'srd/', appBase() + '../srd/'];
  }

  function layerBundledSrd() {
    reindexSeen();
    var prevMode = ft.mode, prevBase = ft.baseUrl, prevFiles = ft.files;

    function tryBase(i) {
      if (i >= srdBases().length) return Promise.resolve(0);
      var base = srdBases()[i];
      return fetch(base + 'index.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
        .then(function (idx) { return readSrdFrom(base, idx); })
        .catch(function () { return tryBase(i + 1); });
    }

    return tryBase(0)
      .then(function (n) {
        ft.mode = prevMode; ft.baseUrl = prevBase; ft.files = prevFiles;
        if (n) ft.stats.srd = n;
        return n;
      })
      .catch(function () {
        ft.mode = prevMode; ft.baseUrl = prevBase; ft.files = prevFiles;
        return 0;
      });
  }

  /* srd/index.json is {kind: [file, ...]} relative to the srd/ folder, so a
     partial SRD - items only, say - is a legitimate thing to ship. */
  function readSrdFrom(base, idx) {
    var jobs = [];
    Object.keys(idx || {}).forEach(function (kind) {
      (idx[kind] || []).forEach(function (file) { jobs.push({ kind: kind, file: file }); });
    });
    if (!jobs.length) return 0;

    var added = 0;
    return runLimited(jobs, 6, function (job) {
      return fetch(base + job.file, { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error('missing'); return r.json(); })
        .then(function (json) { added += ingestFile(job.kind, json, 'srd/' + job.file, 'name'); })
        .catch(function () {});
    }).then(function () { return added; });
  }

  /* Which classes may learn a given spell is not stored on the spell. It lives
     in data/spells/sources.json as SOURCE -> spell name -> {class, subclass,
     race}. Without it there is no way to offer a bard their own spell list, so
     it is worth the extra fetch. A missing file is not fatal: spell choices
     simply fall back to "every spell of that level". */
  /* Treasure tables. Not name-indexed like the rest: the file is a handful of
     arrays whose meaning comes from which key they sit under, so it is kept
     whole rather than flattened into the compendium. */
  function loadLoot() {
    return readJSON('data/loot.json')
      .then(function (json) { ft.loot = json || null; return json; })
      .catch(function () { ft.loot = null; return null; });
  }

  function loadSpellLists() {
    return readJSON('data/spells/sources.json')
      .then(function (json) {
        var map = {};                       // 'name|source' -> [{name, source}]
        Object.keys(json).forEach(function (src) {
          var bySpell = json[src] || {};
          Object.keys(bySpell).forEach(function (spellName) {
            var rec = bySpell[spellName] || {};
            var list = [];
            (rec.class || []).forEach(function (c) { list.push(c); });
            /* A subclass grant (a domain spell) still means the class can cast
               it, but only through that subclass - keep them apart. */
            var subs = [];
            (rec.subclass || []).forEach(function (c) {
              if (c.class) subs.push({ name: c.class.name, source: c.class.source, subclass: c.subclass });
            });
            map[low(spellName) + '|' + low(src)] = { cls: list, sub: subs };
          });
        });
        ft.spellLists = map;
        return map;
      })
      .catch(function () { ft.spellLists = null; return null; });
  }

  function low(v) { return String(v || '').toLowerCase(); }

  /* Every spell the given class can learn, at any level.

     Three sources have to agree: data/spells/sources.json for the books, a
     spell record's own classes.fromClassList (which is how a converted
     supplement says who may cast what), and any spelllistchange record, which
     is how a setting REMOVES a spell from a list - Athasian clerics lose
     Create Food and Water, because Athas has no water to spare. */
  function spellsForClass(className, classSource) {
    var all = get('spell');
    var cn = low(className);

    var gone = {};
    (get('spelllistchange') || []).forEach(function (c) {
      if (low(c.className) !== cn) return;
      (c.removed || []).forEach(function (r) { gone[low(r.name)] = c.source || 'homebrew'; });
    });

    var list = all.filter(function (sp) {
      if (gone[low(sp.name)]) return false;
      /* a record that names its own classes is self-describing */
      var own = sp.classes && sp.classes.fromClassList;
      if (own && own.some(function (c) { return low(c.name) === cn; })) return true;
      if (!ft.spellLists) return !own;
      var e = ft.spellLists[low(sp.name) + '|' + low(sp.source)];
      if (!e) return false;
      return e.cls.some(function (c) { return low(c.name) === cn; });
    });
    list.__removed = Object.keys(gone).length;
    return list;
  }

  /* What a setting changed about a class's spell list, for the UI to say so. */
  function spellListChanges(className) {
    var cn = low(className);
    return (get('spelllistchange') || []).filter(function (c) {
      return low(c.className) === cn;
    });
  }

  function loadClasses(onProgress) {
    return readJSON('data/class/index.json')
      .then(function (idx) { return Object.keys(idx).map(function (k) { return idx[k]; }); })
      .catch(function () {
        if (ft.mode === 'fs') {
          return fsList('data/class').then(function (names) {
            return names.filter(function (n) { return n.indexOf('class-') === 0; });
          });
        }
        if (ft.mode === 'folder') {
          return Object.keys(ft.files)
            .filter(function (p) { return /^data\/class\/class-.*\.json$/.test(p); })
            .map(function (p) { return p.split('/').pop(); });
        }
        return ['class-artificer.json', 'class-barbarian.json', 'class-bard.json', 'class-cleric.json',
          'class-druid.json', 'class-fighter.json', 'class-monk.json', 'class-paladin.json',
          'class-ranger.json', 'class-rogue.json', 'class-sorcerer.json', 'class-warlock.json',
          'class-wizard.json'];
      })
      .then(function (files) {
        return runLimited(files.filter(function (f) { return f.indexOf('fluff') < 0 && f !== 'index.json' && f !== 'foundry.json'; }),
          5, function (f) { return tryLoad('class', 'data/class/' + f, onProgress); });
      });
  }


  /* ---- magic variants ----------------------------------------------------
     "+1 Plate Armor" is not a record. 5etools stores 214 `magicvariant`
     templates - "+1 Armor", "+2 Weapon", "Adamantine Armor" - each with a
     `requires` that says which base items it applies to and an `inherits` of
     the fields it overlays. The concrete items are generated, which is why a
     search for "+1 breastplate" finds nothing until you do it.

     Generating them turns 25 base armours and 37 base weapons into the several
     hundred magic ones a table actually shops for. Kept behind a flag because
     it multiplies the item count and not every table wants it. */
  function matchesRequirement(base, req) {
    return Object.keys(req).every(function (k) {
      var want = req[k], have = base[k];
      if (k === 'type') return String(have || '').split('|')[0] === String(want).split('|')[0];
      if (typeof want === 'boolean') return !!have === want;
      if (Array.isArray(want)) return want.indexOf(have) >= 0;
      return have === want;
    });
  }

  function variantApplies(base, mv) {
    var reqs = mv.requires || [];
    if (!reqs.length) return false;
    if (!reqs.some(function (r) { return matchesRequirement(base, r); })) return false;
    if (mv.excludes && matchesRequirement(base, mv.excludes)) return false;
    return true;
  }

  function buildVariants() {
    var bases = (ft.db.item || []).filter(function (i) {
      if (i.__variant) return false;
      /* a base item: plain gear, not something already enchanted */
      if (i.__baseItem) return true;
      return !i.reqAttune && (!i.rarity || i.rarity === 'none');
    });
    var variants = ft.db.magicvariant || [];
    if (!variants.length) return 0;

    var made = [], seen = {};
    variants.forEach(function (mv) {
      var inh = mv.inherits || {};
      bases.forEach(function (base) {
        if (!variantApplies(base, mv)) return;
        var name = (inh.namePrefix || '') + base.name + (inh.nameSuffix || '');
        /* Two printings of the same base give the same variant name twice. */
        var key = low(name);
        if (seen[key]) return;
        seen[key] = 1;

        var out = JSON.parse(JSON.stringify(base));
        Object.keys(inh).forEach(function (k) {
          if (k === 'namePrefix' || k === 'nameSuffix') return;
          out[k] = JSON.parse(JSON.stringify(inh[k]));
        });
        out.name = name;
        out.__variant = true;
        out.__baseItem = base.name;
        /* A +N bonus is written as a string the item's own text substitutes.
           Fold it into the numbers so the sheet can use it without parsing. */
        if (inh.bonusAc) out.ac = (base.ac || 10) + (parseInt(inh.bonusAc, 10) || 0);
        if (inh.bonusWeapon) out.bonusWeapon = inh.bonusWeapon;
        made.push(out);
      });
    });
    if (made.length) add('item', made, 'magicvariant', true);
    return made.length;
  }

  /* ---- homebrew ----------------------------------------------------------- */
  /* User content is held separately from the loaded book data and re-merged
     after every load, so reloading or switching your source never wipes it.

     There are three ways in, kept apart so none can erase another:

       stored   what this browser saved (the Forge's Homebrew tab)
       folder   a homebrew/ directory inside the data source itself
       bundled  a homebrew/ directory beside the app's own files

     `folder` is the one that matters when a table shares a data folder: drop a
     converted supplement next to your 5etools data and every app pointed there
     gets it, with nothing to import per machine.

     `bundled` covers what folder cannot. It is read relative to the app rather
     than the data source, so a supplement travels with the download and is
     there before anyone has connected anything. It needs no directory picker
     and no filesystem API, which matters on Linux and in any browser without
     showDirectoryPicker - fetching a file sitting next to the page is the one
     thing that works everywhere. */
  var hbStored = {}, hbFolder = {}, hbBundled = {};

  function setHomebrew(map) {
    hbStored = map || {};
    mergeHomebrew();
  }

  function setFolderHomebrew(map) {
    hbFolder = map || {};
    mergeHomebrew();
  }

  function setBundledHomebrew(map) {
    hbBundled = map || {};
    mergeHomebrew();
  }

  function mergeHomebrew() {
    var out = {};
    [hbBundled, hbFolder, hbStored].forEach(function (src) {
      Object.keys(src || {}).forEach(function (kind) {
        out[kind] = (out[kind] || []).concat(src[kind] || []);
      });
    });
    ft.homebrew = out;
    applyHomebrew();
  }

  /* Read every .json in the data source's homebrew/ directory. A file may be
     our own export ({data:{...}}) or a raw 5etools-shaped one; both are just
     kind -> records once unwrapped. Absent directory is the normal case. */
  var HB_KEYS = {
    race: ['race'], subrace: ['subrace'], 'class': ['class'], subclass: ['subclass'],
    classfeature: ['classFeature', 'classfeature'],
    subclassfeature: ['subclassFeature', 'subclassfeature'],
    background: ['background'], spell: ['spell'], item: ['item', 'baseitem'],
    feat: ['feat'], optionalfeature: ['optionalfeature', 'optionalFeature'],
    creature: ['monster'], spelllistchange: ['spelllistchange', 'spellListChange']
  };

  /* Pull every record out of one homebrew file into `map`, returning how many.
     A file may be our own export ({data:{...}}) or a raw 5etools-shaped one. */
  function collectHomebrew(json, map) {
    var incoming = (json && json.data) ? json.data : json;
    if (!incoming || typeof incoming !== 'object') return 0;
    var records = 0;
    Object.keys(HB_KEYS).forEach(function (kind) {
      HB_KEYS[kind].forEach(function (key) {
        if (!Array.isArray(incoming[key])) return;
        incoming[key].forEach(function (r) {
          if (!r || (!r.name && !(kind === 'subrace' && r.raceName))) return;
          var c = JSON.parse(JSON.stringify(r));
          c.__hb = true;
          c.source = c.source || 'HB';
          (map[kind] = map[kind] || []).push(c);
          records++;
        });
      });
    });
    return records;
  }

  function loadFolderHomebrew() {
    return listHomebrewFiles()
      .then(function (names) {
        if (!names.length) { setFolderHomebrew({}); return { files: 0, records: 0 }; }
        var map = {}, records = 0;
        return runLimited(names, 4, function (name) {
          return readJSON('homebrew/' + name)
            .then(function (json) { records += collectHomebrew(json, map); })
            .catch(function () {});
        }).then(function () {
          setFolderHomebrew(map);
          return { files: names.length, records: records };
        });
      })
      .catch(function () { setFolderHomebrew({}); return { files: 0, records: 0 }; });
  }

  /* Where the app's own files live, whatever scheme served the page. */
  function appBase() {
    try { return new URL('.', window.location.href).href; } catch (e) { return './'; }
  }

  /* Read homebrew/ from beside the app rather than from the data source.

     There is no directory listing over http, so homebrew/index.json names the
     files - 5etools' own convention, and the same one the folder loader falls
     back to. A missing index is the normal case and stays silent: most installs
     ship no bundled homebrew at all. */
  var bundledOnce = null;

  /* Safe to call from every boot path - the work happens once and later calls
     get the same promise. Deliberately independent of loadAll: this content
     sits beside the app, not beside the data, so it must survive a data source
     that is missing, empty or still being chosen. */
  function loadBundledHomebrew(force) {
    if (bundledOnce && !force) return bundledOnce;
    bundledOnce = reallyLoadBundledHomebrew();
    return bundledOnce;
  }

  function reallyLoadBundledHomebrew() {
    /* A symbiote has homebrew/ right beside it. The Forge is served out of
       builder/, and the single-file build out of dist/, so for those it is one
       level up. Try the app's own directory first, then its parent, and use
       whichever has an index - checking two places costs one failed fetch and
       saves explaining which layout you have. */
    var bases = [appBase(), appBase() + '../'];

    function grab(base, rel) {
      return fetch(base + rel, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('missing');
        return r.json();
      });
    }

    function tryBase(i) {
      if (i >= bases.length) return Promise.resolve(null);
      return grab(bases[i], 'homebrew/index.json')
        .then(function (idx) { return { base: bases[i], idx: idx }; })
        .catch(function () { return tryBase(i + 1); });
    }

    return tryBase(0)
      .then(function (found) {
        if (!found) { setBundledHomebrew({}); return { files: 0, records: 0 }; }
        var idx = found.idx;
        var names = Array.isArray(idx) ? idx
          : (idx && Array.isArray(idx.toImport)) ? idx.toImport : [];
        if (!names.length) { setBundledHomebrew({}); return { files: 0, records: 0 }; }
        var map = {}, records = 0, read = 0;
        return runLimited(names, 4, function (name) {
          return grab(found.base, 'homebrew/' + name)
            .then(function (json) { records += collectHomebrew(json, map); read++; })
            .catch(function () {});
        }).then(function () {
          setBundledHomebrew(map);
          ft.bundledHomebrew = { files: read, records: records, from: found.base + 'homebrew/' };
          return ft.bundledHomebrew;
        });
      })
      .catch(function () {
        setBundledHomebrew({});
        ft.bundledHomebrew = { files: 0, records: 0 };
        return { files: 0, records: 0 };
      });
  }

  function listHomebrewFiles() {
    if (ft.mode === 'fs') {
      return fsList('homebrew').then(function (n) { return n; }).catch(function () { return []; });
    }
    if (ft.mode === 'folder') {
      return Promise.resolve(Object.keys(ft.files)
        .filter(function (p) { return /(^|\/)homebrew\/[^/]+\.json$/i.test(p); })
        .map(function (p) { return p.split('/').pop(); }));
    }
    /* Over http there is no directory listing, so an index names the files.
       5etools already has this convention - homebrew/index.json with a
       "toImport" array - so use theirs rather than inventing a second one. */
    return readJSON('homebrew/index.json')
      .then(function (idx) {
        if (Array.isArray(idx)) return idx;
        if (idx && Array.isArray(idx.toImport)) return idx.toImport;
        return Object.keys(idx || {})
          .filter(function (k) { return typeof idx[k] === 'string'; })
          .map(function (k) { return idx[k]; });
      })
      .catch(function () { return []; });
  }

  function applyHomebrew() {
    /* drop anything previously merged, then re-add from the authoritative copy */
    Object.keys(ft.db).forEach(function (kind) {
      ft.db[kind] = ft.db[kind].filter(function (r) { return !r.__hb; });
    });
    var total = 0;
    Object.keys(ft.homebrew || {}).forEach(function (kind) {
      var recs = (ft.homebrew[kind] || []).map(function (r) {
        var c = JSON.parse(JSON.stringify(r));
        c.__hb = true;
        return c;
      });
      if (recs.length) { add(kind, recs, 'homebrew', true); total += recs.length; }
    });
    ft.homebrewCount = total;
    /* Recount rather than increment: applyHomebrew runs on every edit, and an
       incrementing tally would climb forever. */
    ft.sources = {};
    Object.keys(ft.db).forEach(function (kind) {
      ft.db[kind].forEach(function (r) {
        if (r.source) ft.sources[r.source] = (ft.sources[r.source] || 0) + 1;
      });
    });
    buildIndex();
    return total;
  }

  /* ---- indexing / search -------------------------------------------------- */
  function buildIndex() {
    ft.index = {};
    Object.keys(ft.db).forEach(function (kind) {
      var map = new Map();
      ft.db[kind].forEach(function (r) {
        var k = String(r.name).toLowerCase();
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
      });
      ft.index[kind] = map;
      ft.db[kind].sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    });
  }

  function byName(kind, name, source) {
    var map = ft.index[kind];
    if (!map) return null;
    var hits = map.get(String(name).toLowerCase());
    if (!hits) return null;
    if (source) {
      var exact = hits.find(function (r) { return String(r.source).toLowerCase() === String(source).toLowerCase(); });
      if (exact) return exact;
    }
    return hits[0];
  }

  function get(kind) { return ft.db[kind] || []; }

  function search(query, kinds, limit) {
    var q = String(query || '').trim().toLowerCase();
    kinds = kinds && kinds.length ? kinds : Object.keys(ft.db);
    var out = [];
    kinds.forEach(function (kind) {
      (ft.db[kind] || []).forEach(function (r) {
        if (!q) { out.push(r); return; }
        var n = String(r.name).toLowerCase();
        var i = n.indexOf(q);
        if (i >= 0) { r.__score = (i === 0 ? 0 : 1) + n.length / 200; out.push(r); }
      });
    });
    out.sort(function (a, b) {
      var d = (a.__score || 0) - (b.__score || 0);
      return d || (a.name < b.name ? -1 : 1);
    });
    return out.slice(0, limit || 200);
  }

  /* ---- persistence -------------------------------------------------------- */
  /* The full data set is far too big for localStorage, so cache in IndexedDB. */
  var DB_NAME = 'vtactics-compendium', STORE = 'blobs';
  function idb() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function idbPut(key, value) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(STORE, 'readonly');
        var r = tx.objectStore(STORE).get(key);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function saveCache() {
    var clean = {};
    Object.keys(ft.db).forEach(function (k) {
      clean[k] = ft.db[k].filter(function (r) { return !r.__hb; });
    });
    return idbPut('db', { db: clean, sources: ft.sources, stats: ft.stats, at: Date.now(),
                          spellLists: ft.spellLists || null,
                          loot: ft.loot || null,
                          folderHomebrew: hbFolder,
                          bundledHomebrew: hbBundled,
                          mode: ft.mode, base: ft.baseUrl, dirName: ft.dirName || null })
      .then(function () { return true; })
      .catch(function () { return false; });
  }
  function loadCache() {
    return idbGet('db').then(function (rec) {
      if (!rec || !rec.db) return null;
      ft.db = rec.db; ft.sources = rec.sources || {}; ft.stats = rec.stats || ft.stats;
      ft.spellLists = rec.spellLists || null;
      ft.loot = rec.loot || null;
      hbFolder = rec.folderHomebrew || {};
      hbBundled = rec.bundledHomebrew || {};
      ft.mode = rec.mode; ft.baseUrl = rec.base || '';
      ft.dirName = rec.dirName || null;
      ft.cachedAt = rec.at || null;
      buildIndex();
      /* merge, not apply: the cache has just restored the folder half, and
         applyHomebrew alone would re-merge a stale ft.homebrew without it. */
      mergeHomebrew();
      ft.loaded = true;
      return rec;
    }).catch(function () { return null; });
  }
  function clearCache() {
    return idbPut('db', null).then(function () { ft.db = {}; ft.index = {}; ft.loaded = false; return true; });
  }

  /* ---- remembered folder (File System Access) ----------------------------
     A browser is never given the absolute path of a picked folder, and could
     not open one from a string anyway - so "remember the path" is impossible
     in the literal sense. What IS possible: showDirectoryPicker() returns a
     directory HANDLE, handles are structured-cloneable, and storing one in
     IndexedDB lets us re-open the same folder on a later visit. If the
     permission is still granted we read it with no dialog at all; if the
     browser has downgraded it to "prompt", it costs one click - never
     navigating the folder tree again.

     Requires a secure context: https:// or http://localhost. NOT file://. */
  var fsRoot = null;         // FileSystemDirectoryHandle when mode === 'fs'
  var fsHasDataChild = null; // did the user pick the site root, or data/ itself?

  function supportsFS() {
    return typeof window.showDirectoryPicker === 'function' && window.isSecureContext;
  }

  function useDirectory(handle) {
    ft.mode = 'fs';
    fsRoot = handle;
    fsHasDataChild = null;
    ft.files = null;
    ft.baseUrl = '';
    ft.dirName = handle && handle.name;
  }

  function pickDirectory() {
    if (!supportsFS()) return Promise.reject(new Error('unsupported'));
    return window.showDirectoryPicker({ id: 'vtactics-5etools', mode: 'read' })
      .then(function (handle) {
        useDirectory(handle);
        return idbPut('dirHandle', handle)
          .catch(function () { /* handle still usable this session */ })
          .then(function () { return handle; });
      });
  }

  /* opts.prompt = true allows the one-click re-grant; without it we only
     reconnect silently, so boot never throws a dialog at the user. */
  function reconnectDirectory(opts) {
    if (!supportsFS()) return Promise.resolve({ ok: false, reason: 'unsupported' });
    return idbGet('dirHandle').then(function (handle) {
      if (!handle || !handle.queryPermission) return { ok: false, reason: 'none' };
      return handle.queryPermission({ mode: 'read' }).then(function (perm) {
        if (perm === 'granted') { useDirectory(handle); return { ok: true, name: handle.name }; }
        if (!opts || !opts.prompt) return { ok: false, reason: 'prompt', name: handle.name };
        return handle.requestPermission({ mode: 'read' }).then(function (p2) {
          if (p2 !== 'granted') return { ok: false, reason: 'denied', name: handle.name };
          useDirectory(handle);
          return { ok: true, name: handle.name };
        });
      });
    }).catch(function () { return { ok: false, reason: 'none' }; });
  }

  function forgetDirectory() {
    fsRoot = null;
    ft.dirName = null;
    return idbPut('dirHandle', null).catch(function () {});
  }

  function rememberedName() { return ft.dirName || null; }

  /* Resolve "data/bestiary/x.json" inside the picked directory. */
  function fsResolve(relPath) {
    var parts = String(relPath).split('/').filter(Boolean);
    var probe = fsHasDataChild === null
      ? fsRoot.getDirectoryHandle('data').then(function () { fsHasDataChild = true; })
          .catch(function () { fsHasDataChild = false; })
      : Promise.resolve();

    return probe.then(function () {
      if (!fsHasDataChild && parts[0] === 'data') parts = parts.slice(1);
      var chain = Promise.resolve(fsRoot);
      for (var i = 0; i < parts.length - 1; i++) {
        (function (name) {
          chain = chain.then(function (dir) { return dir.getDirectoryHandle(name); });
        })(parts[i]);
      }
      return chain.then(function (dir) { return dir.getFileHandle(parts[parts.length - 1]); })
        .then(function (fh) { return fh.getFile(); });
    });
  }

  /* Directory listing, for data sets with no index.json to guide us. */
  function fsList(relDir) {
    var parts = String(relDir).split('/').filter(Boolean);
    if (fsHasDataChild === false && parts[0] === 'data') parts = parts.slice(1);
    var chain = Promise.resolve(fsRoot);
    parts.forEach(function (name) {
      chain = chain.then(function (dir) { return dir.getDirectoryHandle(name); });
    });
    return chain.then(function (dir) {
      var names = [];
      if (!dir.values) return names;
      var it = dir.values();
      function step() {
        return it.next().then(function (r) {
          if (r.done) return names;
          var h = r.value;
          if (h.kind === 'file' && /\.json$/i.test(h.name)) names.push(h.name);
          return step();
        });
      }
      return step();
    }).catch(function () { return []; });
  }

  /* ---- setup -------------------------------------------------------------- */
  function useUrl(url) { ft.mode = 'url'; ft.baseUrl = normBase(url); ft.files = null; fsRoot = null; }
  /* Normalise whatever the directory picker hands us to "data/<rest>" keys.
     Three shapes have to work:
       site root picked     5etools/data/bestiary/x.json -> data/bestiary/x.json
       data folder picked   data/bestiary/x.json         -> data/bestiary/x.json
       renamed data folder  5e-json/bestiary/x.json      -> data/bestiary/x.json
     The match must be on a PATH SEGMENT: a plain indexOf("data/") also hits the
     tail of a folder named "5etools-data", which silently mangles every key. */
  function folderKey(rawPath) {
    var p = String(rawPath).replace(/\\/g, '/').replace(/^\.\//, '');
    var m = p.match(/(?:^|\/)(data\/.+)$/);
    if (m) return m[1];
    /* No data/ segment: assume the picked folder IS the data dir, so drop its
       own name (always the first segment of webkitRelativePath) and re-prefix. */
    var parts = p.split('/');
    if (parts.length > 1) return 'data/' + parts.slice(1).join('/');
    return 'data/' + parts[0];
  }

  function useFolder(fileList) {
    ft.mode = 'folder';
    ft.files = {};
    Array.prototype.slice.call(fileList).forEach(function (f) {
      if (!/\.json$/i.test(f.name)) return;      // skip img/, js/, css/ entirely
      ft.files[folderKey(f.webkitRelativePath || f.name)] = f;
    });
    return Object.keys(ft.files).length;
  }

  function summary() {
    return Object.keys(ft.db).map(function (k) {
      return { kind: k, count: ft.db[k].length };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  VT.fivetools = Object.assign(ft, {
    useUrl: useUrl, useFolder: useFolder, folderKey: folderKey, testUrl: testUrl, normBase: normBase,
    supportsFS: supportsFS, pickDirectory: pickDirectory, reconnectDirectory: reconnectDirectory,
    forgetDirectory: forgetDirectory, rememberedName: rememberedName, useDirectory: useDirectory,
    loadAll: loadAll, get: get, byName: byName, search: search, summary: summary,
    saveCache: saveCache, loadCache: loadCache, clearCache: clearCache,
    setHomebrew: setHomebrew, applyHomebrew: applyHomebrew,
    setFolderHomebrew: setFolderHomebrew, loadFolderHomebrew: loadFolderHomebrew,
    loadBundledHomebrew: loadBundledHomebrew,
    folderHomebrewCount: function () {
      return Object.keys(hbFolder).reduce(function (n, k) { return n + hbFolder[k].length; }, 0);
    },
    spellsForClass: spellsForClass, spellListChanges: spellListChanges,
    buildVariants: buildVariants,
    layerBundledSrd: layerBundledSrd, reindexSeen: reindexSeen, identityOf: identityOf,
    ARRAY_KEYS: ARRAY_KEYS
  });
})();
