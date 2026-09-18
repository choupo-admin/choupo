# ed03 — the stack is a RECORD, and the crossflow velocity is DERIVED

The same NaCl chemistry as `ed01_nacl_desalination` (0.1 mol/kg diluate
against a 0.5 mol/kg concentrate, Neosepta CMX/AMX), run through a stack the
case **names** instead of typing:

```
operation
{
    stack             EUR2C-7P18;
    current           2.0;
    xi                0.9;
    E_electrodes      1.5;
}
```

`EUR2C-7P18` is a `kind edStack` record in `data/standards/assets/` — the
bench unit of Geraldes & Afonso, *J. Membr. Sci.* **360** (2010) 499–508.

## What the record replaced

| was typed in `operation` | now comes from the record |
|---|---|
| `membrane CMX_AMX;` | `membranes CMX_AMX;` |
| `N_cellpairs 100;` | `cellPairs 7;` |
| `membraneArea 0.2 m2;` | `activeArea 0.140 m2;` (see below) |
| `channelThickness 0.5 mm;` | `channelHeight 0.77 mm;` |
| `channelLength 0.4 m;` | `channelLength 0.175 m;` |
| **`linearVelocity 0.05 m/s;`** | **nothing — it is derived** |
| — | `channelWidth`, `spacerPorosity`, `spacerType`, `hydraulicPasses` |
| — | `massTransfer { … }`, `limits { … }`, `provenance { … }` |

Declaring any of the left-hand keys **beside** `stack` refuses by name.

## 1. The velocity was never an operating knob

It was a **second home**.  The unit already receives the diluate flow on its
inlet stream; the crossflow velocity is that flow divided by the section of
the channels running side by side.  Nothing checked the two against each
other, and the velocity is what sets the mass-transfer coefficient and
therefore the limiting current — so a typo in a velocity moved an answer
silently.  The run now prints the arithmetic:

```
  Crossflow velocity, DERIVED from the diluate flow (it is no longer declared):
      channels in parallel     7.0000   = 7 cell pairs / 1 hydraulic pass
      Q_diluate                4.86111e-05 m3/s   (175.00 L/h)
      u = Q/(n W h)            0.079112 m/s  SUPERFICIAL (empty channel section 6.14460e-04 m2)
      u/porosity               0.087902 m/s  interstitial (spacer porosity 0.900)
      flow path length         0.1750 m   = channelLength x passes
```

175 L/h is one of the paper's own three flow rates, and 0.0791 m/s is its own
0.080 m/s for that flow (section 3.3).  **The correlation in this record was
fitted on the SUPERFICIAL velocity**, which the record declares
(`velocityBasis superficial;`) rather than leaving to a reader to guess; the
interstitial value is printed beside it so the two are never confused.

Change the feed flow and the velocity, the Reynolds number, the Sherwood
number and the limiting current all follow.  That is the exercise.

## 2. Vítor's rule on the active area, printed as arithmetic

> *the active area is the CELL-PAIR area; a stack of 50 m² has 50 m² of
> anionic membrane AND 50 m² of cationic membrane.*

```
      declared activeArea      0.140000 m2  (the whole stack, per cell pair summed)
      -> per cell pair         0.020000 m2   (activeArea / 7 cell pairs)
      -> per membrane KIND     0.140000 m2   (that much CEM and that much AEM)
      -> total membrane area   0.280000 m2   (2 x activeArea)
      geometric footprint W*L  0.019950 m2   (a SECOND fact the source states, not a derivative)
```

Only `activeArea` is stored.  The record is **refused** if it also declares
`areaPerCellPair`, `areaPerMembrane`, `totalMembraneArea` or `membraneArea`.
The footprint W·L is not a derivative either way: the paper states *both* the
channel dimensions and the effective mass-transfer area, and they differ by
0.25 %.  The engine announces a disagreement above 5 %.

## 3. Four estimates, each announced with how to verify it

The paper states the spacer thickness but no porosity; it **postulates** the
Schmidt exponent 1/3 rather than fitting it; and it states no stack limits at
all.  Each of those four values carries `origin estimated; reviewStatus
unverified;` and a note, and each prints on **every** run that reads it —

```
  [estimate] stack 'EUR2C-7P18': `massTransfer.c` = 0.33 (SI) is an ESTIMATE, reviewStatus
  unverified -- the paper POSTULATES the Schmidt exponent 1/3 (section 3.4) rather than
  fitting it; a and b ARE fitted to this stack's NaCl data.  To be verified by regressing
  c from limiting-current data over solutions of materially different effective
  diffusivity at fixed Re
```

— and reaches the end-of-run caveat block.  A run that reads no estimate says
nothing, so the silence keeps meaning *nothing was assumed*.

## 4. The limiting current is predicted, and reduces where it should

The stack no longer reads a transport number to get `i_lim`.  It computes
D_eff, the film, the limiting transport number of every ion at each membrane
and both membranes' limiting current (Geraldes & Afonso Eqs. A13, 1, 12/13,
15).  NaCl is a **single salt**, so the run also prints the classical Eq. 16
beside the general Eq. 15:

```
  single salt: Eq. 16 gives 643.0407 A/m2 against Eq. 15's 643.0407 A/m2 -- the reduction, seen
```

and it prints the membrane record's own declared `t_cu = 0.98` beside the
computed numbers, saying plainly that this model reads none of it.  Neither
value overrides the other.

## 5. What a bench stack actually does in one pass

2.7 % of the sodium, at 100 A/m² on seven cell pairs.  That is not a defect:
a real bench run **recirculates** the diluate through a tank for minutes.
That batch arrangement is not modelled — see the "not in this slice" section
of `docs/design/a-stack-is-a-record-and-its-limiting-current-is-predicted.md`.
