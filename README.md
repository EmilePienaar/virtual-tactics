# Virtual Tactics

A set of D&D 5e tools for our table: two **TaleSpire symbiotes** — a character
sheet and a shop/treasure window — and **The Forge**, a browser app for building
characters.

Everything runs in a browser. There is nothing to install, no account, no server,
and nothing phones home.

---

## What you'll be using

| | What it is | Where |
| --- | --- | --- |
| **Tale Sheet** | Your character sheet, inside TaleSpire. Rolls go through the real dice tray. | TaleSpire symbiote |
| **Tale Shop** | The GM's shop window and treasure hoards. Hands you a code you paste into your sheet. | TaleSpire symbiote |
| **The Forge** | Build and level characters in a browser, then send them to your sheet. | `dist/the-forge.html` |

There are two extras you can ignore unless you want them: an isometric battle map
(`dist/virtual-tactics.html`) and **Shopsmith** (`shopsmith/index.html`), a
desk-sized shop editor for the GM.

---

## First: your own 5e data

**These tools ship with no game content.** They're an empty frame — they read a
**5etools-format data folder** that you point them at, and they only ever read
what you give them.

You need a copy of that data on your own machine. Everything below assumes you
have one, in a folder with a `data/` directory inside it.

The sheet works without it — you just can't *build* new characters in-game, only
import ones made elsewhere.

---

## Installing the symbiotes

**1. Get the files.** On the GitHub page, click the green **Code** button →
**Download ZIP**, and unzip it somewhere.

**2. Copy two folders.** Inside `dist/` you'll find `tale-sheet` and `tale-shop`.
Copy both into your TaleSpire symbiotes folder:

```
C:\Users\<your name>\AppData\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes\
```

> Quickest way there: press `Win+R`, paste
> `%AppData%\..\LocalLow\BouncyRock Entertainment\TaleSpire\Symbiotes`, press Enter.

**3. Add your data.** Copy your 5etools `data` folder *inside* each of those two
folders, so you end up with `Symbiotes\tale-sheet\data\`. This is the easiest
option by far — the symbiote finds it on its own and never asks you anything.

*(If you'd rather not duplicate it, open the symbiote's **Setup** tab and use
**Choose folder & remember…** instead. It's one click the first time and none
after that.)*

**4. Restart TaleSpire** and add the symbiotes from the symbiote menu.

That's it. Your characters are saved in the TaleSpire campaign, so they follow the
campaign rather than your PC.

---

## Tale Sheet — your character

Open the **Build** tab and walk through it: race, class, subclass, level, ability
scores, background, gear, spells. Everything your class lets you choose — fighting
styles, invocations, metamagic, maneuvers, feats, cantrips, prepared spells — is
on the **Choices** step. Multiclassing is supported.

Already have a character from the Forge? **Setup → Import** takes its file.

Day to day:

- **Rolling** — tap any skill, save, attack or damage and the dice go into
  TaleSpire's tray like any other roll. Advantage and disadvantage roll two and
  keep the right one. There's a **Crit** toggle that doubles damage dice.
- **Levelling** — the Edit tab re-derives HP, proficiency and attack bonuses from
  your original build, and keeps your damage taken, conditions and anything you
  added by hand.
- **Resources** — spell slots, Ki, Rage, Bardic Inspiration, Channel Divinity,
  Superiority Dice, Lay on Hands, Action Surge. Short and long rests restore the
  right ones; a short rest lets you spend hit dice, which roll in the tray.
- **Death saves** are tracked as you roll them — three and three, judged on the
  face of the die, so a natural 20 puts you back up.
- **Coin and inventory** — a purse that takes "12 gp 5 sp" and refuses what you
  can't afford, and somewhere to put what you buy.
- **Everything is editable by hand.** HP, AC, ability scores, spell DC — type over
  any of it and nothing recalculates behind your back.

If you're running the game, the **Party** tab shows everyone's HP, AC and
conditions live, and lets you apply damage or ask a specific player for a saving
throw — which rolls on *their* machine, in *their* tray.

---

## Tale Shop — shops and treasure

**GM:** build a shop from a template (General Store, Blacksmith, Alchemist, Magic
Emporium and so on) and it stocks itself from your item data at book prices. Set a
price multiplier, edit the stock, then **Open to party**.

For treasure, make a **hoard** — a shop with nothing to pay. Roll one straight off
the treasure tables by challenge rating, or stock it by hand. Give it a name and a
tagline; it draws its own picture based on what it's worth, from a skull and a
spilled purse up to a dragon's bed.

Loose coin can be **split between the party** — set how many ways and press *Hand
it out*. Each share becomes its own code: anyone with Tale Shop open gets theirs
on the Purchases tab, and every share is listed for you to copy and paste into
chat for whoever isn't looking. Nothing is lost to rounding.

**Players:** the open shop appears on its own. Browse, pick a quantity, and press
**Buy** (or **Take**, in a hoard). What you took comes back as a short code on the
**Purchases** tab — press **Copy**, then paste it into Tale Sheet under
*Inventory → Collect from Tale Shop*. Items and coin go to the right places, and
the code can be pasted into chat if someone missed it.

Stock lives on the GM's copy, so two people can't both take the last potion.

---

## The Forge — building characters in a browser

The Forge is the same character builder as the sheet's, with a full screen and a
keyboard. It also holds a searchable compendium of everything in your data, and a
**Roster** tab for levelling and editing anything you've made.

Export a character from the Forge and import it in Tale Sheet.

**Easiest way to run it:** open `dist/the-forge.html` by double-clicking. It's one
self-contained file — you can copy it anywhere, and it works offline.

The one catch: opened that way, your browser may ask you to re-pick your data
folder each time. If that annoys you, run it from a local address instead — you'll
need [Node.js](https://nodejs.org):

```bash
node tools/serve.js
```

Then open <http://localhost:5173/builder/index.html>. Now the folder is remembered
and it loads straight in.

---

## If something goes wrong

**"It keeps asking me to pick my data folder."** You're opening the page as a file
rather than an address. Use `node tools/serve.js` and the `http://localhost:5173`
link above — that's the whole fix. (For symbiotes, put the `data` folder inside
the symbiote's folder as in step 3.)

**"It says it can't read my folder."** Pick the folder that *contains* `data/`, or
`data/` itself — not one above them.

**"The symbiote doesn't appear in TaleSpire."** Check the folder went in whole —
`Symbiotes\tale-sheet\manifest.json` should exist — and restart TaleSpire.

**"Nothing arrives in my sheet when I take an item."** Nothing is sent directly —
copy the code from Tale Shop's **Purchases** tab and paste it into Tale Sheet
under *Inventory → Collect from Tale Shop*.

**"TaleSpire refuses to load the symbiote."** Make sure you are on the current
build. An older one declared a cross-symbiote interop id that TaleSpire does not
always accept, and it would refuse the whole symbiote because of it.

---

## For whoever maintains this

Rebuild after changing anything in `src/`, `tale-sheet/`, `tale-shop/` or
`builder/`:

```bash
node tools/build-symbiote.js
```

```bash
node tools/build-single.js
```

The first writes `dist/tale-sheet/` and `dist/tale-shop/`; the second writes
`dist/the-forge.html` and `dist/virtual-tactics.html`. Commit `dist/` so nobody
else needs Node at all.

There's no build step otherwise — plain `<script>` tags and one `window.VT`
namespace, deliberately, so it runs from a plain file with no toolchain.

Longer explanations of how each piece works live in
[docs/design-notes.md](docs/design-notes.md).

---

## A note on source books

The SRD is Creative Commons and freely shareable. **Published book content is
not** — in 2024 Wizards issued takedowns against the 5etools mirrors on exactly
that basis.

So these tools bundle no data at all, on purpose. Handing someone
`the-forge.html` or a symbiote folder gives them the tool, not the books; they
supply their own data, same as you. Keep it that way and everyone stays on the
right side of the line. If you want something you *can* hand to anyone, point it
at SRD data in the same format — everything above still works.
