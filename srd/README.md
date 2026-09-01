# Bundled SRD

The free rules, in 5etools JSON shape, so the apps do something useful before
anyone has pointed them at a data folder.

**This folder ships empty in the source tree.** Drop an SRD data set in, list
its files in `index.json`, and every build picks it up. Nothing else changes.

## Why this folder may carry content when `data/` may not

The SRD is shareable; published book content is not. The builds bundle no data
set and never will — see *The line on content* in `docs/state-of-things.md`.
This folder and `homebrew/` are the two deliberate exceptions, and this one is
narrower: only put SRD-licensed material here.

## Layout

`index.json` maps a record kind to the files that hold it, relative to this
folder:

```json
{
  "item":       ["data/items.json", "data/items-base.json"],
  "race":       ["data/races.json"],
  "background": ["data/backgrounds.json"],
  "spell":      ["data/spells/spells-srd.json"],
  "creature":   ["data/bestiary/bestiary-srd.json"],
  "class":      ["data/class/class-fighter.json"]
}
```

The kinds are the same ones `ARRAY_KEYS` in `src/data/fivetools.js` knows
about: `item`, `race`, `background`, `spell`, `creature`, `class`, `feat`,
`optionalfeature`, `condition`, `action`, `language`, `skill`, `sense`,
`deity`, `variantrule`. A partial set is fine — list only what you have.

The files themselves are ordinary 5etools files: `{"spell": [...]}`,
`{"item": [...], "baseitem": [...]}`, and so on. They are read by the same
loader as any other source, so anything a data folder can express, this can.

## How it behaves at runtime

It is a **floor, never a ceiling**. `fivetools.loadAll()` layers it in last,
with de-duplication on:

- A record the user's own data already provided **wins**; the SRD copy is
  skipped. Loading a data set that already contains the SRD does not give you
  two Fireballs.
- Identity is `kind + name + source`, so the 2014 and 2024 Fighter stay two
  different classes — only a genuine duplicate is dropped.
- An empty or missing folder is the normal case and costs one failed fetch.
