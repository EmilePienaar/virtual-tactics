#!/usr/bin/env node
/* Equipment tables out of a PDF, using BOTH extractions of it.
 *
 * Neither `pdftotext` mode gives a usable table on its own:
 *
 *   -layout   keeps one name per line, but the name column is shifted down
 *             relative to the data columns by however many sub-headings the
 *             name column carries, so the rows do not line up.
 *
 *   default   is column-major: every name, then every cost, then every damage
 *             die. The data columns are clean runs, but the names run together
 *             with no delimiter - "Light hammer Mace" could be two names or
 *             three, and nothing in the text says which.
 *
 * So take the names from the layout run (one per line, positionally sliced at
 * the second column) and the data from the column-major run (split by shape,
 * since a cost is "<n> <unit>" and a weight is "<n> lb."), then require every
 * column to be the SAME LENGTH as the name list. Nothing is emitted for a
 * table whose columns disagree: a weapon quietly wearing the next weapon's
 * damage die is worse than a weapon that never arrived.
 */
'use strict';
const fs = require('fs');

const DASH = /^[─—–-]$/;
const isDash = s => DASH.test(String(s).trim());

/* ==== names, from the layout extraction ================================== */
/* The header row names the columns; the x position of the second column is
   where the name column stops. */
function namesFromLayout(layout, heading, secondCol, stopRe) {
  /* Split on CRLF as well as LF. A stray \r left on the end of a line is not
     matched by `.` in a regex, so the `.*$` in the column cut below would
     never reach the end of the string and would silently never fire. */
  const lines = layout.split(/\r?\n/);
  /* The heading appears in prose too ("ARMOR AND SHIELDS"), so the header row
     is the one that also carries the second column's label to its right. */
  const at = lines.findIndex(l =>
    l.trim().startsWith(heading) && l.indexOf(secondCol) > heading.length);
  if (at < 0) return null;

  const names = [];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (stopRe && stopRe.test(line)) break;
    if (/^\s*$/.test(line)) continue;
    if (/^\s*\d{1,3}\s*$/.test(line)) continue;              // page number
    /* Cut where the data begins: two or more spaces followed by a number or a
       dash. Slicing at a fixed column is a hair's breadth from taking the
       first digit of the cost along with the name. */
    /* Two cuts: a gap before a number or dash (the usual column boundary),
       and any very wide gap, which catches a properties list that wrapped onto
       the next line and landed in the name column - "Blowgun*    two-handed". */
    const name = line
      .replace(/\s{2,}[\d\u2500\u2014\u2013\u00bc\u00bd\u00be].*$/, '')
      .replace(/\s{6,}.*$/, '')
      .trim();
    if (!name) continue;
    if (/^\*/.test(name)) break;                              // footnote
    names.push(name);
  }
  return names;
}

/* ==== data columns, from the column-major extraction ===================== */
function runsAfter(raw, heading, count) {
  /* The heading has to be a line of its own. "ARMOR" appears inside "ARMOR AND
     SHIELDS" and "ARMOR DAMAGE (SETTING RULE)" pages before the actual table,
     and anchoring on the first substring hit reads prose as though it were
     columns. */
  const lines = raw.split(/\r?\n/);
  /* A heading also appears on the contents page, where the only thing under it
     is a page number. The real table is the occurrence whose next few lines
     actually carry prices, so take the first one that does. */
  const hits = [];
  lines.forEach((l, i) => { if (l.trim() === heading) hits.push(i); });
  if (!hits.length) return null;
  let at = hits[0];
  for (const cand of hits) {
    const peek = lines.slice(cand + 1, cand + 8).join(' ');
    if (/[\d,]+\s*(?:cr|bits?|gp|sp)\b/.test(peek)) { at = cand; break; }
  }
  return lines.slice(at + 1).map(l => l.trim()).filter(Boolean).slice(0, count || 40);
}

/* Each splitter returns null unless the run is CHARACTERISTICALLY its column.
   Without that test a lone "─" - which is a legal value in every column -
   makes the cost run look like the start of the damage column, and the whole
   table slides by one. So a run must contain at least one token only its own
   column can produce, and the values it yields must account for most of it. */
function split(run, valueRe, signatureRe) {
  if (!signatureRe.test(run)) return null;
  const out = [];
  let matched = 0, m;
  const re = new RegExp(valueRe.source, 'g');
  while ((m = re.exec(run))) { out.push(m[1].replace(/\s+/g, ' ')); matched += m[0].length; }
  if (!out.length) return null;
  const solid = run.replace(/\s/g, '').length;
  if (matched < solid * 0.75) return null;      // mostly something else
  return out;
}

const splitCosts = run =>
  split(run, /([\d,]+\s*(?:bits?|cr|sp|gp|cp|ep|pp)|[─—–])/, /[\d,]\s*(?:bits?|cr|sp|gp)\b/);

const splitWeights = run =>
  split(run, /(\d+(?:\.\d+)?\s*lb\.|[¼½¾]\s*lb\.|[─—–])/, /lb\./);

/* A few weapons deal a flat point rather than a die - the blowgun's "1
   piercing", an unarmed strike's "1 bludgeoning". Miss those and every later
   row in the column shifts up by one. */
const splitDamage = run =>
  split(run, /(\d*d\d+\s+[a-z]+|\d\s+(?:bludgeoning|piercing|slashing)|[─—–])/, /\dd\d/);

const splitAC = run =>
  split(run, /(\d+\s*\+\s*Dex(?:\s*\(max\.\s*\d+\))?|\d+|[─—–])/, /\+\s*Dex|^\s*\d+(\s+\d+)*\s*$/);

const splitStrength = run => split(run, /(Str\s*\d+|[─—–])/, /Str\s*\d/);

const splitStealth = run => split(run, /(Disadvantage|[─—–])/i, /Disadvantage/i);

/* Properties run together and a single weapon's list contains commas. A comma
   continues the current weapon; a property word without one starts the next. */
const PROP = /^(light|heavy|finesse|finess|reach|loading|special|two-handed|double|vicious|ammunition|thrown|versatile)\b/i;
function splitProperties(run) {
  /* Like the other columns this needs a signature, or it accepts anything -
     including the run of weapon NAMES, where "Light hammer" reads as the
     property "light". In the table every property is lower-case, while a name
     ("Club*") and the prose that follows the table ("Double. Wielding a...")
     both start with a capital. So the run must OPEN with a lower-case
     property word. */
  const first = run.trim().split(/\s+/)[0] || '';
  if (!/^[a-z─—–]/.test(first) || !PROP.test(run.trim())) return null;
  const words = run.split(/\s+/);
  const out = [];
  let cur = [];
  const flush = () => { out.push(cur.join(' ').replace(/,\s*$/, '')); cur = []; };
  for (const w of words) {
    if (isDash(w)) { if (cur.length) flush(); out.push(''); continue; }
    const continues = cur.length && /,$/.test(cur[cur.length - 1]);
    if (PROP.test(w) && cur.length && !continues) flush();
    cur.push(w);
  }
  if (cur.length) flush();
  return out;
}

/* ==== assembling ========================================================= */
function gather(raw, heading, splitter, want, limit) {
  const runs = runsAfter(raw, heading, limit || 60) || [];
  const out = [];
  for (const run of runs) {
    if (out.length >= want) break;
    const vals = splitter(run);
    if (!vals) continue;
    vals.forEach(v => out.push(v));
  }
  return out.length === want ? out : out.slice(0, want);
}


/* Read a table's columns from its runs.
 *
 * Two things make this harder than walking the runs in order:
 *
 *   - The columns INTERLEAVE. In the armour table the runs go strength,
 *     strength, strength, strength, stealth, weight, stealth, weight - the
 *     book prints each category's block of every column before moving on. So
 *     a run that the current column rejects must stay available to the others
 *     rather than being consumed and lost.
 *
 *   - One run can hold two columns at once. In the martial ranged block the
 *     PDF put a cost and a damage die on the same line, "50 cr 1d8 piercing",
 *     which is not wholly either column. That run is split at the boundary.
 *
 * So: for each run, offer it to every column that still wants values, in table
 * order, and give it to the first that accepts the whole run. A run of nothing
 * but dashes is legal in several columns and goes to the earliest one still
 * unfilled, which is what makes the order matter. Returns null unless every
 * column ends up exactly full, so a table is either right or refused.
 */
function readColumns(runs, specs, want) {
  const vals = {};
  specs.forEach(sp => { vals[sp.key] = []; });
  const needs = sp => vals[sp.key].length < want;
  const give = (sp, list) => {
    for (const x of list) if (vals[sp.key].length < want) vals[sp.key].push(x);
  };

  for (const run of runs) {
    if (specs.every(sp => !needs(sp))) break;

    let placed = false;
    for (const sp of specs) {
      if (!needs(sp)) continue;
      const v = sp.split(run);
      if (v) { give(sp, v); placed = true; break; }
    }
    if (placed) continue;

    /* a run of dashes belongs to the earliest column still being filled */
    if (/^[\u2500\u2014\u2013\s]+$/.test(run)) {
      const sp = specs.find(needs);
      if (sp) { give(sp, run.trim().split(/\s+/).map(() => '\u2014')); continue; }
    }

    /* two columns sharing one line: split at the first boundary that leaves
       both halves wholly acceptable to two different columns */
    const words = run.split(/\s+/);
    for (let cut = 1; cut < words.length && !placed; cut++) {
      const head = words.slice(0, cut).join(' ');
      const tail = words.slice(cut).join(' ');
      for (const a of specs) {
        if (!needs(a) || placed) continue;
        const av = a.split(head);
        if (!av) continue;
        for (const b of specs) {
          if (b === a || !needs(b)) continue;
          const bv = b.split(tail);
          if (!bv) continue;
          give(a, av); give(b, bv);
          placed = true;
          break;
        }
      }
    }
  }

  for (const sp of specs) if (vals[sp.key].length !== want) return null;
  return vals;
}


/* ==== two-up tables ======================================================
   The gear, tool and trade-good tables are printed twice across the page:
   "Adventuring Gear  Cost  Weight  |  Item  Cost  Weight". Each half is its
   own table, so the page is sliced down the middle and the halves read one
   after the other.

   Their name columns also carry category rows - "Alchemical Items",
   "Arcane Focus" - which have no price of their own and must not become items.
   Those are named in the side-car, because a category and an item look exactly
   alike once the layout is gone. */
function namesTwoUp(layout, headerRe, subheads, stopRe) {
  const lines = layout.split(/\r?\n/);
  const at = lines.findIndex(l => headerRe.test(l));
  if (at < 0) return null;

  const header = lines[at];
  /* the second half starts at the second column label */
  const firstCost = header.indexOf('Cost');
  const mid = header.indexOf('Cost', firstCost + 4);
  const split = mid < 0 ? header.length : header.lastIndexOf('  ', mid - 20) + 2;

  const skip = new Set((subheads || []).map(x => x.toLowerCase()));
  const halves = [[], []];
  for (let i = at + 1; i < lines.length; i++) {
    const line = lines[i];
    if (stopRe && stopRe.test(line)) break;
    [line.slice(0, split), line.slice(split)].forEach((seg, half) => {
      if (!seg.trim()) return;
      if (/^\s*\d{1,3}\s*$/.test(seg)) return;
      const name = seg
        .replace(/\s{2,}[\d\u2500\u2014\u2013\u00bc\u00bd\u00be].*$/, '')
        .replace(/\s{6,}.*$/, '')
        .trim();
      if (!name || name.toLowerCase() === 'item') return;
      if (skip.has(name.toLowerCase())) return;
      halves[half].push(name);
    });
  }
  return halves[0].concat(halves[1]);
}

module.exports = {
  namesFromLayout, namesTwoUp, runsAfter, gather, readColumns,
  splitCosts, splitWeights, splitDamage, splitAC, splitStrength,
  splitStealth, splitProperties, isDash
};
