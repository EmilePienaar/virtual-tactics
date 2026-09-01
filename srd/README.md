# Bundled SRD

The free rules, so the apps do something useful before anyone has pointed them
at a data folder. Generated — do not hand-edit `data/`.

## Regenerating

```
node tools/extract-srd.js "<path to a 5etools data folder>"
```

The folder is the one containing `items.json`, `bestiary/` and `class/`.

## Where this content comes from, and why that is allowed

Every record in a 5etools data set carries an `srd` flag saying whether it is
part of the System Reference Document — the subset released under the Open
Game License. `extract-srd.js` copies **only** flagged records. That flag is
the licence boundary, and the filter is the whole program: there is no mode in
which it copies a book.

`srd: true` means the record is included under its own name. `srd: "Some Name"`
means it is included under a *different* name, because the printed one is
Product Identity — Bigby's Hand is SRD content, "Bigby" is not. Those records
are renamed to the string, with the original kept on `__srdFrom` so the class
spell lists (which key by the printed name) still resolve.

A record keeps its original `source` — `PHB`, `DMG`, `MM` — rather than being
restamped as `SRD`. Cross-references depend on it: a `classFeature` finds its
class by `classSource`, a subclass by `classSource` + `subclassSource`, and
rewriting one side without the other silently empties a character's feature
list. 5etools keeps the original source beside the flag, and so do we.

Only the 2014 SRD (the `srd` flag) is taken. 5etools also carries `srd52` for
the 2024 SRD; mixing the two would produce a half-2014, half-2024 compendium
with two of several hundred things.

## What is here

Roughly 1,800 records: base and magic items, races and subraces, spells with
their class lists, the twelve classes with one archetype each, the monster and
NPC bestiary, conditions, languages, senses, skills, deities and feats.

## How it behaves at runtime

It is a **floor, never a ceiling**. `fivetools.loadAll()` layers it in last,
after the user's own source, with de-duplication on:

- A record the user's data already provides **wins**; the SRD copy is skipped.
  Loading a set that already contains the SRD does not give you two Fireballs.
- The layer de-duplicates by `kind + name`, not by source, precisely so a PHB
  Fireball suppresses the SRD one instead of sitting beside it.
- An empty or missing folder is the normal case and costs one failed fetch.

## Licence

This is Open Game Content under the Open Game License v1.0a. `OGL.txt` is the
licence and must travel with the data — the build copies it. Do not remove it.
