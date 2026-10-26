# dspmde01_water_treatment_salts — a real water's salts through the DSPM-DE pore

```
runCase tutorials/props/membrane/dspmde01_water_treatment_salts
```

## What it shows

A water-treatment feed carries more than sodium chloride: nitrate,
fluoride, bromide, carbonate, ammonium, calcium, magnesium and sulfate.  A
case feeds them as **salts** — each a component record with an ion map
(`dissociatesTo`) — and the DSPM-DE pore works **ion by ion**: every ion
needs its hydrated radius (steric partition and hindrance) and its
free-solution diffusivity D0 (diffusion and convection in the pore).

This case proves that path end to end from the standard catalogue.  Its
salts are the standard records `NaCl`, `NaNO3`, `NaF`, `KBr`, `Na2CO3`,
`NH4Cl`, `calciumNitrate` (Ca(NO3)2), `KNO3`, `MgCl2`, `NaBr` and `MgSO4`
(sealed into `constant/components/` by `bin/choupo-import`, so the case is
self-contained), and every ion resolves:

* its **hydrated radius** from Nightingale, J. Phys. Chem. 63 (1959) 1381,
  Table I (column r_H, 25 °C), read back against the primary page;
* its **D0** from the public-domain USGS PHREEQC database `phreeqc.dat`,
  the 25 °C `Dw` of its `-dw` line.

Each species record (`constant/species/<ion>.dat`) cites its page, table,
database line and file hash in its own `transport { provenance {} }` block.

Three operations, each a `poreTransport` bench at an IMPOSED permeate flux
(J_v = 1e-6, 5e-6, 2e-5 m/s), ideal activities, no polarisation:

| op | pore | feed (mol/m3) | ions |
|----|------|---------------|------|
| `monovalentWater` | NanoFiltran's example | NaCl 5, NaNO3 1, NaF 0.5, KBr 0.5, NH4Cl 0.5 | Na K NH4 Cl NO3 F Br |
| `mixedWater` | NF270_dspmde | the same + Na2CO3 0.5 | + CO3 |
| `hardWater`  | NF270_dspmde | Ca(NO3)2 2, KNO3 2, MgCl2 1, NaBr 1, MgSO4 1 | Ca Mg K Na NO3 Cl Br SO4 |

Each publishes, per J_v and per ion, the bulk, wall and permeate
concentrations and the observed and real rejections.  At 2e-5 m/s, for
example, `mixedWater` rejects CO3-- at 0.99985 and NO3- at 0.741, and
`hardWater` rejects SO4-- at 0.99989 against Cl- at 0.778 and Br- at
0.767 -- the divalent co-ion held back by the negative pore, as NF does.

### Why two pores — a pore and its ion radii are one convention

NanoFiltran's worked-example pore (r_p = 0.40 nm) was set against
NanoFiltran's own ion database, whose radii are **Stokes** radii (Na+ 1.84,
Cl- 1.21, SO4-- 2.31 Å — `nanofiltran_geraldesAlves2008/constant/species/`).
The catalogue's radii are Nightingale's **hydrated** radii (Na+ 3.58, Cl-
3.32, SO4-- 3.79 Å), and against them a 0.40 nm pore nearly closes:
λ = r/r_p is 0.83-0.90 for the monovalent ions (so `monovalentWater`
rejects everything above 0.999), 0.95 for SO4--, 0.985 for CO3-- and above
1 for Ca++ (1.03) and Mg++ (1.07).  Measured on 2026-10-26: on that pore
Na2CO3 (alone or in this water) and MgSO4 + NaCl do **not** converge (the
solved pore refuses, naming the stalled continuation), and MgCl2 or
Ca(NO3)2 alone are refused because no cation can enter.  So the waters with
divalent ions run on the catalogue's `NF270_dspmde`, whose 0.60 nm pore its
record states is the value consistent with the hydrated-radius tier.  The
lesson for a researcher: fit the pore with the SAME radius convention the
simulation will read — the fit in `membrane24_fit_then_simulate` does.

## What it is NOT

* **Not a validation.**  No number here is a measurement.  The pores are
  NanoFiltran's worked example (`constant/assets/NanoFiltranExample.dat`:
  X = −30 mol/m3, r_p = 0.4 nm, 2.5 µm, ε_p = 60), which describes no real
  membrane, and the catalogue's NF270 archetype (`NF270_dspmde`: r_p 0.6 nm,
  X = −5 mol/m3), whose pore is set, not fitted to this water.  For a real
  membrane, fit its pore to your own rejections first:
  `tutorials/steady/membranes/membrane24_fit_then_simulate` is the template,
  and `docs/ai/membrane-research.md` says what goes in and what comes out.
* **No carbonate chemistry.**  `Na2CO3` is taken fully dissociated into
  2 Na+ + CO3--; nothing here speciates it, so the feed stands for a high-pH
  water.  At a natural pH most of the carbonate is bicarbonate — see below.

## What still refuses, and why

**Bicarbonate (HCO3-), phosphate (PO4---) and the hydrogen phosphates
(HPO4--, H2PO4-)** have a PHREEQC D0 but **no hydrated radius**: Nightingale's
Table I does not list them.  A Stokes radius computed from D0 is a different
convention from the hydrated radius every DSPM-DE pore is fitted against,
and writing one under the same key would shift every steric hindrance
silently — so the catalogue stores none, and DSPM-DE **refuses** such an
ion by name (DEV.md 4c C161).  `NaHCO3` in this feed would stop the run with
that refusal.  The multi-ionic polarisation film and the electrodialysis
units read D0 alone and do accept these ions.
