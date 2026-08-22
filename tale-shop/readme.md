# Tale Shop

A shop window for TaleSpire. The GM keeps a shelf of reusable shops — stocked
from their own 5etools item data at real list prices — and opens one for the
party to browse and buy from.

Every shop has a shopkeeper: a generated portrait in the game's own pixel style,
with a name and a greeting. Swap in your own image, reroll the face, or write
their line yourself.

Shops can also be built at a desk in **Shopsmith** (`shopsmith/index.html`) and
imported here as JSON.

## GM

**Shops** — your shelf. Make one from a template (General Store, Blacksmith,
Fletcher, Alchemist, Magic Emporium, Inn & Tavern, Stable, Temple, or Empty),
then **Open to party** and everyone sees it live. Shops are saved per campaign
and reusable; duplicate one to make a variant.

**Edit** — rename it, name the keeper, write a blurb, set a price multiplier, and
change the stock: quantities, prices, remove things, add anything from your item
data, or invent a custom item. Quantity `-1` means unlimited. Players only ever
see the adjusted price, never your margin.

**Setup** — connect your 5etools data, and define the currency.

## Players

The open shop appears automatically. Browse the goods, pick a quantity, press
**Buy**. Stock lives on the GM's copy, so two players cannot both take the last
potion — your purchase is applied there and the window updates for everyone.

Your purchases are listed under **Purchases**.

## Currency

Standard D&D coins by default (pp / gp / ep / sp / cp). Rename them or change
their values in Setup for another setting; prices convert automatically because
everything is stored as an integer count of the base unit.

## One deliberate limitation

Buying does **not** deduct your coin. A symbiote cannot reach another symbiote's
storage, so Tale Shop tells you the price and Tale Sheet's **Spend** button does
the deduction. Both understand the same coin format, so `12 gp 5 sp` pastes
straight across.

## Treasure hoards

A hoard is a shop with nothing to pay. Make an empty one and stock it by hand,
or roll one off the treasure tables by challenge rating — coins, gems, art
objects and magic items, straight from the book's own d100 tables.

Players open it like a shop and **Take** instead of Buy. Whatever they take
comes back as a short code on the **Purchases** tab: press **Copy**, open Tale
Sheet, and paste it into *Collect from Tale Shop* under Inventory. Items and
coin land in the right places.

Give it a name and a tagline of your own. Its picture is chosen by what it is
worth — a skull and a spilled purse, a strongbox, a heap of coin, or a dragon's
bed — and you can override that from the hoard panel.

**Splitting the coin.** Set how many ways and press *Hand it out*. Each share
becomes its own code. Anyone with Tale Shop open gets theirs on the Purchases
tab automatically; every share is also listed for you to copy, so you can paste
one into chat for whoever is not looking. Nothing is lost to rounding, and the
codes stay in the panel until you clear them.

Hoards built in Shopsmith import here unchanged.
