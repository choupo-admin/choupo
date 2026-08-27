# temperature02_engineers_ladder — the range a chemical engineer actually works in

Eight rungs, from liquid hydrogen to boiling water, **checked by the engine
rather than quoted at you**.

```
runCase tutorials/props/thermo/temperature02_engineers_ladder
```

---

## What it asks

At the temperature each substance's record calls its normal boiling point,
what does its **vapour-pressure correlation** say the pressure is?

It should be one atmosphere — that is what a normal boiling point *means*.  How
close it lands measures the record, and the answer is published rather than
assumed.

| rung | T [K] | Psat computed | what it is in a plant |
|---|---|---|---|
| H₂ | 20.39 | 1.005 atm | colder than anything a plant routinely does |
| Ne | 27.10 | 0.998 atm | neon |
| N₂ | 77.35 | 1.000 atm | air separation — the commonest cryogen on a site |
| Ar | 87.30 | 1.003 atm | the air-separation side draw |
| O₂ | 90.17 | 0.986 atm | air separation |
| CH₄ | 111.66 | 0.997 atm | **LNG** — a whole industry built around one temperature |
| C₂H₄ | 169.42 | 0.996 atm | cryogenic ethylene |
| **H₂O** | **373.15** | **1.026 atm** | water — the anchor everybody has a feel for |

## The finding, and it is the one worth carrying away

**The substance every engineer trusts most is the worst rung on the ladder.**

Water's Antoine fit declares `Trange (273 373)`.  Its normal boiling point is
373.15 K.  **The fit stops 0.15 K before the temperature everybody uses it at**,
and evaluated there it returns 1.026 atm instead of 1.000 — 2.6 % out, on the
one substance whose boiling point every reader could recite.

The run says so without being asked:

```
[psat] component 'water': Antoine evaluated at T = 373.15 K,
       OUTSIDE its declared Trange (273 373).
```

Seven cryogens the reader has no intuition for land inside 1.4 %.  The familiar
one does not.  Familiarity is not accuracy, and a declared validity range is
worth more than a feeling.

## What this case is NOT

* **Not a claim that these are the right numbers.**  It checks each record
  against its own definition of a normal boiling point.  A record can be
  self-consistent and still wrong about the world; that is a different question
  and needs measured data, which is `docs/architecture/verification-and-validation.md`.
* **Not the metrology ladder.**  ITS-90 is realised on TRIPLE points of gases
  and FREEZING points of metals, chosen for reproducibility.  This ladder is
  boiling points at one atmosphere, chosen because they are what a plant
  distils at.  Two different ladders, picked for two different reasons, and
  conflating them is a mistake worth naming.
* **The upper end is missing.**  Reformers, crackers, furnaces and flares run
  from about 1100 K to 2300 K, and none of these eight substances reaches
  there.  What defines and measures a temperature up there is a different
  instrument (radiation, not resistance) and this case does not go there.

## Why it verifies a pressure rather than solving for a temperature

Asking for `T_bubble` at 1 atm is the more direct question and it does not work
here: `BubblePoint::compute` carries its own initial guess and does not
converge at 20 K.  That gap is already on record
(`docs/design/held-out-pressure.md`).  Verifying the pressure at a declared
temperature asks the same physics of the same correlation, and is robust — so
that is what runs, said plainly rather than papered over.
