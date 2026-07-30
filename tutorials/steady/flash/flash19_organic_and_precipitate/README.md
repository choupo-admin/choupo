# flash19 — four phases at once

One isothermal flash at 313.15 K / 1 atm, and **four phases coexist**:

| phase | what is in it |
|---|---|
| vapour | CO₂, water, benzene, ethanol — V/F = 0.0283 |
| aqueous liquid | water + the carbonate speciation network + the dissolved co-solvent |
| organic liquid | benzene-rich (x_benzene = 0.993), 1.27 % of the backbone liquid |
| solid | calcite, 1096 mg/kg of water, at its SI = 0 ceiling |

The three condensed phases leave through **one** bottoms nozzle and are named
inside that stream's `phases {}` block; the vapour is its own stream.

## Why this case exists

Until it was written, the reactive path had been exercised with an organic
liquid (`flash17`) and with a precipitate (`flash16`) — but **never both at
once**. The file format supported it and the solver was believed to; no run
proved it. This is that run, and the joint residual closes to |r| = 6.6e-14.

## The controlled comparison

The feed is `flash16`'s, unchanged, **plus** benzene 2.0 and ethanol
1.0 kmol/h. Same water, same CO₂, same CaCO₃, same T, same P. So the two
cases differ by exactly those two components:

| | flash16 | flash19 |
|---|---|---|
| calcite formed | 729 mg/kg | **1096 mg/kg** |
| pH | 6.020 | 6.107 |
| V/F | 0.0213 | 0.0283 |

Adding a co-solvent pushed half again as much calcite out of solution.

## Read the model's boundary, not just its answer

That number is **not** a mixed-solvent antisolvent calculation, and a student
who reads it as one will be wrong about why.

The ions stay on **Davies with water-referenced molality**: the transfer term
that would price an ion's change of standard state when it moves from water to
a water/ethanol mixture is a *declared gap* in this engine, and the run says so
in its own header. What the model DOES capture is the co-solvent's effect
through the **molecular backbone** — the ethanol enters the UNIFAC mixture that
prices water's activity, and the equilibria that involve water move with it.

So the direction is physical and the mechanism is partial. That is worth more
than a number with no boundary: the case shows exactly where the model stops,
and the gap it names is the next slice of work, not a footnote.

## What to look at when you run it

```
[phases] declared second liquid on the feed: PRESENT  (G/RT single = 0.007248, split = -0.036268)
```
Gibbs **decides** the phase set — the split lowers G/RT, so the organic exists.
The Newton then only solves the set it was handed.

```
PRECIPITATION LEDGER:
    calcite       n = 1.0953e-02 mol/kg = 1096.33 mg/kg   SI -> +0.000
```
A thermodynamic **ceiling**, not a deposition rate: infinite time, no
nucleation barrier.

And in `converged/liquid`, the three condensed phases named, each holding its
own material, with the speciation living inside the aqueous one — because the
ions are there and nowhere else.
