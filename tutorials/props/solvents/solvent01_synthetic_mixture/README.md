# solvent01 — DIDACTIC EXAMPLE WITH SYNTHETIC PARAMETERS: a blend closer than either of its parts

Two fictitious solvents A and B and a fictitious polymer P between them, so
the Hansen distance along the A/B line has its minimum at 50:50 by volume —
by construction, and checkable by hand.  **Nothing here is a real substance**;
the engine says so on every run (`[synthetic] component 'solventA' is NOT a
real substance`), and the records carry `provenance { source synthetic; }`.

## The arithmetic

All values in MPa^0.5 (the records store Pa^0.5, 1000 times larger):

```
solventA   dD 16   dP  2   dH  4
solventB   dD 16   dP 10   dH 12
polymerP   dD 17   dP  6   dH  8     R0 4
```

Hansen's distance, with the factor 4 on the dispersion term (his 1967
thesis, Eq. 8.2), along the line at volume fraction s of B:

```
delta_mix(s) = (16, 2 + 8 s, 4 + 8 s)
Ra^2(s)      = 4 (16 - 17)^2 + (8 s - 4)^2 + (8 s - 4)^2 = 4 + 2 (8 s - 4)^2
```

so Ra = 6.000 at either pure end (RED = 1.5, outside the sphere) and Ra =
2.000 at s = 0.5 (RED = 0.5, inside).  The dispersion offset of 1 keeps the
minimum from being a degenerate zero.  The two solvents have the same molar
volume, so the volume, mole and mass bases coincide here; the conversion is
exercised on the real case (`solvent02`).

## What the run prints

```
point                 s_volume phi_solv phi_solv      dD      dP      dH       Ra     RED  phase
solventA              0.000    1.0000   0.0000     16.00    2.00    4.00    6.000   1.500  pure
solventA+solventB     0.050    0.9500   0.0500     16.00    2.40    4.40    5.470   1.367  notVerified
...
solventA+solventB     0.500    0.5000   0.5000     16.00    6.00    8.00    2.000   0.500  notVerified
...
solventB              1.000    0.0000   1.0000     16.00   10.00   12.00    6.000   1.500  pure

minimum Ra = 2.000 MPa^0.5 at solventA+solventB (s = 0.500 volume fraction of solventB, phi_solventB = 0.5000), RED = 0.500 -- inside the solute's sphere
```

## Why every blend says `notVerified`

The package declares an **ideal** liquid, and gamma = 1 has no excess Gibbs
energy: it can never demix, so a stability test on it would say "one liquid"
about every pair ever asked.  The op marks every blend point `notVerified`
rather than claim a verification the model cannot give — the honest third
outcome of the phase check (the other two, `homogeneous` and `twoPhase`, are
live on `solvent02` under UNIFAC).  The pure ends carry `pure`: one
component, nothing to split.

## What is stated on the run, every time

* the mixture rule is the **volume-fraction average** of each parameter — an
  approximation (no excess volume; each solvent keeps its own split);
* the parameters are **held constant at their reference temperature**
  (`Tref 298.15 K` on every record); no correction exists in the engine, and
  the declared `T` decides the phase check alone;
* **Ra is an affinity, not a solubility**: no saturation concentration is
  published.

## Golden

`expected` pins the minimum (`Ra_min_MPa05` 2, `s_at_min` 0.5, `RED_min` 0.5),
the pure ends (6), the phase-word counts (2 pure, 19 notVerified) and CSV
cells along the line.  `check_hansen_mixture` rebuilds every cell from the
records and holds the minimum to the hand arithmetic above.
