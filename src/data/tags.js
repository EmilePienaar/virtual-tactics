/* Virtual Tactics :: data/tags.js
   Parser for 5etools' inline markup and nested `entries` trees.

   Every text field in that dataset is peppered with tags like
     {@atk mw} {@hit 4} to hit, reach 5 ft. {@h}5 ({@damage 1d6+2}) piercing
   and cross-references like {@spell fireball|phb|the fireball spell}, which are
   pipe-separated as {@tag name|source|displayText}.

   Two jobs here:
     render()  - tags to readable text or HTML, for the compendium
     mechanics() - tags to structured numbers, so an action becomes a real
                   {toHit, dmg, dmgType, save, dc} the combat engine can run. */
(function () {
  'use strict';
  var VT = window.VT, U = VT.util;

  /* ---- tag splitting ---------------------------------------------------- */
  /* Tags nest, so a regex alone won't do. Walk the string and match braces. */
  function splitTags(str) {
    var out = [], depth = 0, buf = '', tagBuf = '';
    for (var i = 0; i < str.length; i++) {
      var ch = str[i];
      if (ch === '{' && str[i + 1] === '@') {
        if (depth === 0) { if (buf) { out.push({ text: buf }); buf = ''; } tagBuf = ''; }
        else tagBuf += ch;
        depth++;
        if (depth === 1) { i++; continue; }   // skip the '@'
      } else if (ch === '}' && depth > 0) {
        depth--;
        if (depth === 0) { out.push(parseTag(tagBuf)); tagBuf = ''; }
        else tagBuf += ch;
      } else if (depth > 0) {
        tagBuf += ch;
      } else {
        buf += ch;
      }
    }
    if (buf) out.push({ text: buf });
    if (depth > 0 && tagBuf) out.push({ text: tagBuf });
    return out;
  }

  function parseTag(body) {
    var sp = body.indexOf(' ');
    var name = (sp < 0 ? body : body.slice(0, sp)).toLowerCase();
    var rest = sp < 0 ? '' : body.slice(sp + 1);
    var parts = rest.split('|');
    return { tag: name, parts: parts, raw: rest };
  }

  /* ---- attack type codes ------------------------------------------------ */
  var ATK = {
    mw: 'Melee Weapon Attack', rw: 'Ranged Weapon Attack',
    ms: 'Melee Spell Attack', rs: 'Ranged Spell Attack',
    mp: 'Melee Power Attack', rp: 'Ranged Power Attack',
    m: 'Melee Attack', r: 'Ranged Attack', a: 'Attack', aw: 'Area Weapon Attack'
  };

  /* Lives in srd.js now — kept here as an alias so callers need not care. */
  var SKILL_ABILITY = VT.srd.SKILL_ABILITY;

  /* ---- rendering -------------------------------------------------------- */
  /* mode: 'text' (plain) or 'html' (linkable spans the compendium can click) */
  function renderTag(t, mode) {
    if (t.text != null) return mode === 'html' ? U.esc(t.text) : t.text;
    var p = t.parts, first = p[0] || '';
    function ref(kind) {
      /* {@spell fireball|phb|the fireball} -> prefer explicit display text */
      var shown = p[2] || first;
      if (mode !== 'html') return shown;
      return '<a class="xref" data-kind="' + kind + '" data-name="' + U.esc(first) +
        '" data-source="' + U.esc(p[1] || '') + '">' + U.esc(shown) + '</a>';
    }
    switch (t.tag) {
      /* Formatting tags wrap further markup, so recurse in BOTH modes -
         otherwise nested tags leak out as literal {@i ...} in plain text. */
      case 'b': case 'bold': return mode === 'html' ? '<b>' + render(first, mode) + '</b>' : render(first, mode);
      case 'i': case 'italic': return mode === 'html' ? '<i>' + render(first, mode) + '</i>' : render(first, mode);
      case 'u': case 'underline': return mode === 'html' ? '<u>' + render(first, mode) + '</u>' : render(first, mode);
      case 's': case 'strike': return mode === 'html' ? '<s>' + render(first, mode) + '</s>' : render(first, mode);
      case 'note': return mode === 'html' ? '<i class="note">' + render(first, mode) + '</i>' : render(first, mode);
      case 'atk': case 'atkr': {
        /* "mw,rw" should read "Melee or Ranged Weapon Attack", not
           "Melee Weapon or Ranged Weapon Attack" - factor the shared tail out.
           This is the most common tag in any bestiary, so it is worth getting
           right rather than merely legible. */
        var names = first.split(',').map(function (c) { return ATK[c.trim().toLowerCase()] || c.trim(); });
        if (names.length > 1) {
          var tails = names.map(function (n) { return n.split(' ').slice(1).join(' '); });
          if (tails.every(function (t) { return t === tails[0]; }) && tails[0]) {
            return names.map(function (n) { return n.split(' ')[0]; }).join(' or ') + ' ' + tails[0] + ':';
          }
        }
        return names.join(' or ') + ':';
      }
      case 'h': return mode === 'html' ? '<i>Hit:</i> ' : 'Hit: ';
      case 'hom': return 'Miss: ';
      case 'dc': return 'DC ' + first;
      case 'hit': return (Number(first) >= 0 ? '+' : '') + first;
      case 'd20': return (Number(first) >= 0 ? '+' : '') + first;
      case 'dice': case 'damage': case 'scaledice': case 'scaledamage': case 'autodice': {
        var expr = t.tag === 'scaledice' || t.tag === 'scaledamage' ? (p[2] || first) : first;
        var shown2 = p[1] && t.tag !== 'scaledice' && t.tag !== 'scaledamage' ? p[1] : expr;
        return mode === 'html'
          ? '<span class="roll-tag" data-dice="' + U.esc(expr) + '">' + U.esc(shown2) + '</span>'
          : shown2;
      }
      case 'recharge': return '(Recharge ' + (first ? first + '–6' : '6') + ')';
      case 'chance': return first + ' percent';
      case 'hitYourSpellAttack': case 'hityourspellattack': return 'your spell attack modifier';
      case 'spell': return ref('spell');
      case 'creature': return ref('creature');
      case 'item': return ref('item');
      case 'condition': return ref('condition');
      case 'disease': return ref('condition');
      case 'status': return ref('condition');
      case 'skill': return ref('skill');
      case 'sense': return ref('sense');
      case 'action': return ref('action');
      case 'feat': return ref('feat');
      case 'race': return ref('race');
      case 'class': return ref('class');
      case 'background': return ref('background');
      case 'optfeature': return ref('optionalfeature');
      case 'variantrule': return ref('variantrule');
      case 'table': return ref('table');
      case 'deity': return ref('deity');
      case 'hazard': case 'trap': return ref('hazard');
      case 'object': return ref('object');
      case 'vehicle': return ref('vehicle');
      case 'language': return ref('language');
      case 'reward': return ref('reward');
      case 'psionic': return ref('psionic');
      case 'filter': return p[0];
      case 'quickref': return p[0];
      case 'book': case 'adventure': return p[0];
      case 'homebrew': return p[0] || p[1] || '';
      case '5etools': case 'link': return p[0];
      case 'footnote': return p[0];
      case 'area': return p[1] || p[0];
      case 'classfeature': case 'subclassfeature': return first;
      default: return first || '';
    }
  }

  function render(str, mode) {
    if (str == null) return '';
    if (typeof str !== 'string') return renderEntries(str, mode);
    return splitTags(str).map(function (t) { return renderTag(t, mode); }).join('');
  }

  /* ---- entry trees ------------------------------------------------------ */
  /* 5etools `entries` are a recursive mix of strings and typed objects. */
  function renderEntries(entry, mode, depth) {
    mode = mode || 'html';
    depth = depth || 0;
    if (entry == null) return '';
    if (typeof entry === 'string' || typeof entry === 'number') return render(String(entry), mode);
    if (Array.isArray(entry)) {
      return entry.map(function (e) { return renderEntries(e, mode, depth); }).join(mode === 'html' ? '' : '\n');
    }
    var name = entry.name ? render(entry.name, mode) : '';
    var inner = entry.entries ? renderEntries(entry.entries, mode, depth + 1)
      : entry.entry ? renderEntries(entry.entry, mode, depth + 1) : '';

    if (mode !== 'html') {
      return (name ? name + '. ' : '') + inner;
    }
    switch (entry.type) {
      case 'entries':
      case 'section':
        return (name ? '<div class="e-name">' + name + '</div>' : '') + '<div class="e-body">' + inner + '</div>';
      case 'list':
        return '<ul class="e-list">' + (entry.items || []).map(function (it) {
          return '<li>' + renderEntries(it, mode, depth + 1) + '</li>';
        }).join('') + '</ul>';
      case 'item':
      case 'itemSpell':
      case 'itemSub':
        return '<div class="e-item"><b>' + name + '</b> ' + inner + '</div>';
      case 'table': {
        var head = (entry.colLabels || []).map(function (c) { return '<th>' + render(c, mode) + '</th>'; }).join('');
        var rows = (entry.rows || []).map(function (r) {
          if (r && r.type === 'row') r = r.row || [];
          return '<tr>' + (r || []).map(function (c) { return '<td>' + renderEntries(c, mode, depth + 1) + '</td>'; }).join('') + '</tr>';
        }).join('');
        return '<div class="e-tablewrap"><table class="e-table">' +
          (entry.caption ? '<caption>' + render(entry.caption, mode) + '</caption>' : '') +
          (head ? '<thead><tr>' + head + '</tr></thead>' : '') + '<tbody>' + rows + '</tbody></table></div>';
      }
      case 'inset':
      case 'insetReadaloud':
        return '<div class="e-inset">' + (name ? '<b>' + name + '</b> ' : '') + inner + '</div>';
      case 'quote':
        return '<blockquote class="e-quote">' + inner +
          (entry.by ? '<cite>' + render(entry.by, mode) + '</cite>' : '') + '</blockquote>';
      case 'abilityDc':
        return '<b>Spell save DC</b> = 8 + your proficiency bonus + your ' +
          (entry.attributes || []).join(' or ').toUpperCase() + ' modifier';
      case 'abilityAttackMod':
        return '<b>Spell attack modifier</b> = your proficiency bonus + your ' +
          (entry.attributes || []).join(' or ').toUpperCase() + ' modifier';
      case 'options':
        return '<div class="e-body">' + renderEntries(entry.entries || [], mode, depth) + '</div>';
      case 'image':
        return '';   /* images live outside the data set; skip rather than 404 */
      default:
        return (name ? '<div class="e-name">' + name + '</div>' : '') + '<div class="e-body">' + inner + '</div>';
    }
  }

  function toText(entry) { return renderEntries(entry, 'text').replace(/\s+/g, ' ').trim(); }

  /* ---- mechanics extraction --------------------------------------------- */
  /* Turn a monster action's prose into something combat.js can actually run.
     This is heuristic by necessity - the source data is written for humans -
     but the tags carry the numbers, so the important parts are exact. */
  function mechanics(action, ctx) {
    var text = toText(action.entries || action.entry || '');
    /* Re-scan the RAW text: toText() has already expanded the tags, and the
       numbers we need live inside them. The name is included because recharge
       is conventionally written there ("Fire Breath {@recharge 5}"). */
    var raw = String(action.name || '') + ' ' + rawOf(action);
    var rawTags = splitTags(raw).filter(function (t) { return t.tag; });

    var get = function (n) { return rawTags.find(function (t) { return t.tag === n; }); };
    var all = function (n) { return rawTags.filter(function (t) { return t.tag === n; }); };

    var out = {
      name: render(action.name || 'Action', 'text'),
      kind: 'buff',
      cost: 'action',
      desc: text
    };

    var atk = get('atk') || get('atkr');
    var hit = get('hit');
    var dmgTags = all('damage');
    var dcTag = get('dc');

    if (atk && hit) {
      var code = String(atk.parts[0] || '').toLowerCase();
      var isRanged = /r/.test(code.split(',')[0]) && !/^m/.test(code.split(',')[0]);
      /* "mw,rw" - thrown weapons; treat as melee unless only ranged */
      if (code.indexOf('m') >= 0) isRanged = false;
      out.kind = isRanged ? 'ranged' : 'melee';
      out.toHit = parseInt(hit.parts[0], 10) || 0;

      var reach = raw.match(/reach\s+(\d+)\s*(?:ft|feet)/i);
      var range = raw.match(/range\s+(\d+)\s*\/\s*(\d+)\s*(?:ft|feet)/i) ||
                  raw.match(/range\s+(\d+)\s*(?:ft|feet)/i);
      if (out.kind === 'melee') {
        out.reach = reach ? parseInt(reach[1], 10) : 5;
        if (!reach && range) { out.kind = 'ranged'; }
      }
      if (out.kind === 'ranged') {
        out.range = range
          ? [parseInt(range[1], 10), parseInt(range[2] || range[1], 10)]
          : [reach ? parseInt(reach[1], 10) : 30, reach ? parseInt(reach[1], 10) : 120];
      }
    } else if (dcTag) {
      out.kind = 'save';
      out.dc = parseInt(dcTag.parts[0], 10) || 10;
      var ab = raw.match(/DC\s*\}?\s*\d*\s*\)?\s*(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)/i) ||
               raw.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving throw/i);
      out.save = ab ? ab[1].slice(0, 3).toLowerCase() : 'dex';
      out.half = /half as much damage|half damage/i.test(raw);
      /* Explicit shapes first ("15-foot cone"), then the looser phrasing that
         a lot of statblocks use instead ("each creature within 10 feet"). */
      var aoe = raw.match(/(\d+)[- ]foot[- ](?:radius|sphere|cone|line|cube|square)/i) ||
                raw.match(/(?:each|any|every)\s+creature[^.]{0,48}?within\s+(\d+)\s*(?:ft\.?|feet)/i);
      out.aoe = aoe ? { radius: parseInt(aoe[1], 10) } : null;

      /* A cone or a "within X of it" burst originates on the caster, so the
         aim point is the caster's own square - not some distant target. */
      var selfCentered = /\bcone\b|\bwithin\s+\d+\s*(?:ft\.?|feet)\s+of\s+(?:it|itself|him|her|them|you)\b/i.test(raw) ||
                         /(?:each|any|every)\s+creature[^.]{0,48}?within/i.test(raw);
      var rangeS = raw.match(/range\s+(\d+)/i) || raw.match(/within\s+(\d+)\s*(?:ft\.?|feet)/i);
      if (selfCentered && out.aoe) {
        out.range = [out.aoe.radius, out.aoe.radius];
      } else {
        out.range = [rangeS ? parseInt(rangeS[1], 10) : 30, rangeS ? parseInt(rangeS[1], 10) : 30];
      }
    }

    if (dmgTags.length) {
      /* primary damage, plus any riders ("plus 7 (2d6) fire damage") */
      out.dmg = dmgTags.map(function (d) { return d.parts[0]; }).join('+');
      var typeMatch = raw.match(/\{@damage[^}]+\}\)?\s*([a-z]+(?:\s+[a-z]+)?)\s+damage/i);
      out.dmgType = typeMatch ? typeMatch[1].trim().toLowerCase() : 'bludgeoning';
      if (VT.srd.DAMAGE_TYPES.indexOf(out.dmgType) < 0) {
        var found = VT.srd.DAMAGE_TYPES.find(function (dt) { return raw.toLowerCase().indexOf(dt + ' damage') >= 0; });
        out.dmgType = found || 'bludgeoning';
      }
    } else if (out.kind === 'melee' || out.kind === 'ranged' || out.kind === 'save') {
      out.dmg = '0';
    }

    /* conditions the attack inflicts */
    var cond = rawTags.find(function (t) { return t.tag === 'condition'; });
    if (cond && VT.srd.CONDITIONS[String(cond.parts[0]).toLowerCase()]) {
      out.applies = String(cond.parts[0]).toLowerCase();
    }

    var rech = get('recharge');
    if (rech) out.uses = { max: 1, per: 'rest' };
    if (/\bbonus action\b/i.test(raw)) out.cost = 'bonus';
    if (ctx && ctx.reaction) out.cost = 'reaction';

    return out;
  }

  /* The un-rendered source string of an entry, tags intact. */
  function rawOf(entry) {
    if (entry == null) return '';
    if (typeof entry === 'string') return entry;
    if (Array.isArray(entry)) return entry.map(rawOf).join(' ');
    if (entry.entries) return rawOf(entry.entries);
    if (entry.entry) return rawOf(entry.entry);
    if (entry.items) return rawOf(entry.items);
    return '';
  }

  VT.tags = {
    render: render, renderEntries: renderEntries, toText: toText,
    splitTags: splitTags, mechanics: mechanics, rawOf: rawOf,
    ATK: ATK, SKILL_ABILITY: SKILL_ABILITY
  };
})();
