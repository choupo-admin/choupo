# esterification2sector — the fractal `constant/`, wired

A two-sector plant that exists to prove one thing: **data lives with the sector
that owns it**, and a whole-plant run finds it there.

```
Feed (AcOH + EtOH)
      |
  [ REACTION ]    esterification CSTR
      |             kinetics: sectors/REACTION/constant/reactions
  reactorOut
      |
  [ SEPARATION ]  isothermal flash, NRTL
      |  \           ethylAcetate-water pair: sectors/SEPARATION/constant/binaryPairs/
   liquid vapor      ethanol-water:           inherited from the standard library
```

Components are shared across the plant.  The kinetics belong to REACTION and are
never copied to the root.  The `ethylAcetate-water` NRTL pair belongs to
SEPARATION — a *particular* datum, fitted for this separation — while
`ethanol-water` walks up to the standard catalogue.  Three levels of ownership,
one run.

Run it and read the property-provenance block in the log:

```
"i": "ethylAcetate", "j": "water",  "status": "perNode",
"source": "sectors/SEPARATION/constant/binaryPairs/NRTL/ethylAcetate-water.dat"
"i": "ethanol",      "j": "water",  "status": "standard",
"source": ".../data/standards/binaryPairs/NRTL/ethanol-water.dat"
```

That `perNode` is the whole case.  The sector's pair beat the standard library,
and the log says so rather than leaving you to wonder which one it used.

## What it does

Feed 100 kmol/h equimolar acetic acid + ethanol at 360 K.  The CSTR
(`V_R = 0.5 m³`) reaches 34.2 % conversion — a PLACEHOLDER number: the kinetics in
`sectors/REACTION/constant/reactions` are still the pseudo-first-order stand-in,
not the 2nd-order fit this case's own property evidence supports (see
`CLAUDE.md`, "Pending").  The flash at 355 K, 1.013 bar splits
the product into a vapour rich in ethyl acetate (bp 350 K) and ethanol, and a
liquid rich in water and the unconverted acid.  Mass closes exactly:
34.18 + 65.82 = 100.00 kmol/h.

## History

This case shipped for weeks marked `.known-broken`, and it earned the mark
twice over.  Its flash carried `P 1.01325;` with no unit, which is 1.01 **pascal**
— a hard vacuum — so the K-values exploded and everything went to the vapour.
And it was never wired: the sectors existed as thermo regions with the
connections commented out, awaiting a "curation phase" that never ended.

Fixing it surfaced two real engine bugs, both of the same shape — data owned by a
*sector* was invisible from a whole-plant run:

* `reactions ( r1 r2 );` resolved only against the ROOT `constant/reactions`
  (the single `reaction <name>;` form already walked up).
* `binaryPairs` looked only in the leaf UNIT's folder, never at the sector above
  it — so the standard library won silently, which is exactly the outcome this
  case exists to prevent.

The dictionary parser now also warns when a pressure with no unit resolves below
100 Pa.  `P 1.01325;` will never again pass in silence.
