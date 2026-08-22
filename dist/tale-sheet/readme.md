# Tale Sheet

A 5e character sheet that builds from **your own 5etools data** and rolls
everything through TaleSpire's real dice tray.

## What it does

- **Build** characters in-game from your 5etools folder — race, subrace, class,
  subclass, background, point-buy abilities, gear and spells.
- **Roll everything** into the dice tray: ability checks, saving throws, all 18
  skills, attacks, damage, initiative and death saves. Advantage and
  disadvantage roll two sets and publish only the winning one.
- **See your class features** — everything you have earned, by level, with the
  printed text one tap away. Ability Score Improvements are a real choice.
- **Manage play**: HP, temporary HP, conditions, limited-use abilities, and
  rests — a short rest spends hit dice, which roll in the tray and heal you.
- **Edit anything by hand** in the Edit tab: HP, AC, hit dice, ability scores,
  coin, inventory. Nothing is recalculated behind your back.
- **Track coin** — platinum through copper. Spend and Earn take "12 gp 5 sp" and
  refuse what you cannot afford; the Edit tab has per-denomination fields.
- **Import** a character exported from the Forge, or a whole `.vtcampaign` file.

Characters are saved in this campaign's symbiote storage, so they follow the
campaign rather than the machine.

## Setting up your data

Two options in the **Setup** tab:

1. **Choose data folder** — pick your 5etools folder in the dialog.
2. **Use bundled ./data** — drop your 5etools `data` folder next to this
   symbiote's files. No dialog, survives restarts.

The sheet works fine without any data connected; you just cannot build new
characters in-game, only import them.

## Notes

- Dice always land in the tray, so the whole table sees them.
- Board state is read-only for symbiotes, so linking a mini shows its HP beside
  your sheet but cannot write HP back to the token.
- "Post results to chat" is off by default.

## Choices and multiclassing

The **Edit** tab carries the full choice tree — subclass, fighting style,
invocations, metamagic, maneuvers, infusions, feats, skills, cantrips and
prepared spells — read from your own books, with prerequisites enforced and
explained. Picks become real numbers: Defense is +1 AC, Archery is +2 to hit
with ranged weapons, a cantrip becomes a rollable attack.

Multiclassing lives there too. Each class has its own level and subclass, spell
slots come from one combined caster level, and warlock pact slots stay separate
and come back on a short rest.

