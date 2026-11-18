# labban2017_dspmde_validation -- parameters from simple feeds, complex feeds predicted

```
runCase tutorials/props/membrane/labban2017_dspmde_validation
```

**The question.** Can the DSPM-DE pore of a membrane be fitted on the SIMPLE
feeds (uncharged solutes, one salt at its isoelectric point) and then PREDICT a
salt mixture and seawater it never saw?  The data are those of Labban, Liu,
Chong & Lienhard, *J. Membr. Sci.* 521 (2017) 18-32, doi:10.1016/j.memsci.2016.08.062
(a low-pressure layer-by-layer NF hollow fibre, 0.3 m/s cross-flow, 1-4 bar).
The acceptance bands were declared in the propsDict and committed BEFORE any fit
of this case was run (git history: the commit "C176: Labban 2017 validation case
-- data transcribed ... and the acceptance bands declared" precedes the first
result).

## What was read, where, and how

Everything below was READ ON THE PAGE IMAGES (the accepted manuscript for the
figures, both versions for the tables; the tables agree).  A **table** value is
exact; a **figure** value is digitised from a 400 dpi render, centroid of each
marker, with the reading uncertainty stated.  Page numbers are the accepted
manuscript's / the journal's.

| value | source | page (ms / journal) | read from |
|---|---|---|---|
| radius and D_inf of glycerol, glucose, sucrose (0.260/0.365/0.471 nm; 0.950/0.690/0.520 x 1e-9 m2/s) | Table 1 | 15 / 24 | table |
| radius and D_inf of Na, Ca, Mg, Cl, SO4 (0.184/0.309/0.347/0.121/0.230 nm; 1.33/0.792/0.706/2.03/1.06 x 1e-9) | Table 2 | 16 / 24 | table |
| rejection of glycerol 11, 15, 19.5, 29 %; glucose 74, 77, 83, 83 %; sucrose 93, 94, 93, 92 % at 1-4 bar | Table 3 | 17 / 24 | table |
| flux of those points: 2.873, 5.984, 9.082, 12.18 x 1e-6 m/s | Fig. 8 abscissas | 22 / 26 | **figure, +-0.02e-6** |
| pure-water line, 10.30 LMH/bar (2.862e-6 m/s/bar), used for NaCl's flux | Fig. 6 | 19 / 25 | **figure** (the caption says "around 10 LMH/bar") |
| NaCl 1000 mg/kg at pH 7: rejection 0.135, 0.196, 0.241 at 1, 2, 3 bar | Fig. 7 (up-triangles) | 20 / 25 | **figure, +-0.004** |
| feeds (mg/kg): NaCl+MgCl2 Na 398.6 Mg 254.2 Cl 1351; NaCl+Na2SO4 Na 718.7 SO4 678.2 Cl 606; seawater Na 11122 Ca 382 Mg 1394 SO4 2136 Cl 20300 | Table 6 | 21 / 25 | table |
| NaCl+MgCl2 rejections (%) Na -7.6 -1.7 1.6, Mg 99.1 99.2 99.0, Cl 51.0 49.0 51.0; flux 12.0 19.2 26.4 LMH, at 2, 3, 4 bar | Table 7 | 21 / 26 | table |
| NaCl+Na2SO4: Na 37.8 39.4 39.4, SO4 94.5 94.5 93.8, Cl -9.0 -7.0 -6.0; flux 14.2 23.1 31.6 LMH | Table 8 | 21 / 26 | table |
| seawater: Na -1.4 -0.6 1.17, Ca 54.5 71.1 78.9, Mg 83.4 90.6 93.6, SO4 82.7 85.4 86.8, Cl 11 13 15; flux 1.4 3.9 6.0 LMH | Table 9 | 22 / 26 | table |
| the article's parameters: r_p 0.5 nm, effective thickness 1.33 um, eps_p 41.3 | Table 5 | 20 / 25 | table |
| the article's X_d: +2.83 (NaCl+MgCl2), -1.92 (NaCl+Na2SO4), -27 (seawater) mol/m3 | Section 4.1.4 | 21 / 26 | text |
| bulk dielectric 80.4; hollow fibre 1.0 / 1.4 mm, 25 cm, 0.3 m/s, Re ~ 400 | text | 17, 13-14 | text |

The pH-8 and the other pH symbols of Fig. 7 were read too and are not used.  At
1 bar the pH-7 and pH-8 symbols overlap in one star: its centre (0.135) is read
for pH 7.

**Not in the article, assumed here (each stated where it enters):** the
temperature (298.15 K); the density (1 kg/L, mg/kg -> mol/m3); the salts of a
feed from the measured cations and sulfate (the article measured them by
ICP-OES; chloride follows by electroneutrality) with the catalogue species'
molar masses; NaCl's flux in Fig. 7 equal to the pure-water line of Fig. 6, which
ignores the salt's osmotic back-pressure (~0.1 bar at 1 bar, so the flux is up
to ~10 % high there).

## The chain, and the bands (declared first)

| op | free | on | band (declared before) | result |
|---|---|---|---|---|
| A `fit_pore_uncharged` | r_p, A_k/dx | glycerol, glucose, sucrose (12 points) | none (a characterisation) | r_p = 0.495 +- 0.029 nm; A_k/dx = 3.3e5 +- 2.2e5 1/m, i.e. thickness 3.0 um (95 % interval 1.8-9.3); in-sample 4.07 points |
| B `fit_eps_NaCl_pH7` | eps_p | NaCl, pH 7, X_d = 0 (3 points) | none | eps_p = 53.5 +- 8.8; in-sample 1.80 points |
| C `fit_X_mix1` | X_d | NaCl+MgCl2, 2 and 4 bar; 3 bar held out | 5 points | X_d = +3.87 +- 1.32; held out **1.87 points: validated** |
| C `fit_X_mix2` | X_d | NaCl+Na2SO4, 2 and 4 bar; 3 bar held out | 5 points | X_d = -4.48 +- 4.78; held out **3.36 points: validated** |
| C `fit_X_sw` | X_d | seawater, 2 and 4 bar; 3 bar held out | 5 points | X_d = -74 +- 130; held out **11.74 points: not validated** |
| D `predict_X0_mix1` | none | pore of A and B, X_d = 0 | 10 points | 3 pressures 3.91 points (3 bar alone 3.61): **validated** |
| D `predict_X0_mix2` | none | same | 10 points | 3 pressures 9.29 (3 bar 8.66): **validated, narrowly** |
| D `predict_X0_sw` | none | same | 10 points | 3 pressures 13.21 (3 bar 12.78): **not validated** (expected, written before the run) |
| E `paper_mix1/2/sw` | none | the article's own Table 5 and X_d | none | 8.69, 7.63, 16.16 points (3 pressures) |

The engine's verdict on D and E is on the 3-bar rows alone (the roles are
mechanics: the 2 and 4 bar rows are `role fit` with no free parameter, so they are
scored, not tuned); the three-pressure means above are computed from the run's
in-sample and held-out numbers, weighted by their term counts.

## What it says

* **The pore radius is recovered.** The three uncharged solutes alone give
  r_p = 0.495 nm against the article's 0.5 (anchored in the golden at 2 %).
* **The effective thickness is NOT determined by rejection data**: 3.0 um with a
  95 % interval of 1.8-9.3 um (correlation with r_p -0.88).  The article gets
  1.33 um from the pure-water permeability through Hagen-Poiseuille, and with the
  fitted r_p that route gives r_p^2 / (8 mu Lp) = 1.2 um -- outside the rejection
  fit's interval.  The two routes disagree by a factor 2.5 and the rejection
  rows cannot arbitrate; the flux is the information.
* **eps_p = 53.5 +- 8.8 against the article's 41.3**: inside 1.4 sigma, from three
  digitised points whose flux is itself an assumption.
* **The charge is the feed's, as the article says.** X_d of the two hard waters
  (+3.87, -4.48) has the sign and the size of the article's (+2.83, -1.92) and
  each is inside the other's interval; seawater's (-74 +- 130 against -27) is
  fitted but meaningless -- the interval spans the sign.
* **Two mixtures are predicted inside the 5-point band with a charge fitted on
  two of three pressures; seawater is not**, and no charge rescues it (X_d = 0:
  13.2; the fitted -74: 11.9; the article's -27: 16.2).  At an ionic strength of about
  0.7 mol/L the model's partition (Davies at the feed face only, a single
  dielectric constant) is the likely limit; this was not isolated.
* **The article's own parameters do not reproduce the article's rejections in
  this engine** (case E): Na+ in NaCl+MgCl2 comes out at +4.5 % against the
  measured -7.6 % and the article's modelled negative rejection; seawater's
  Ca2+ at 85 % against 54.5 % at 2 bar.  The article reports up to 12 % relative
  deviation for the multivalent ions.  Candidate causes, none measured: the
  film (a hollow-fibre correlation expressed here through `StirredCell`, equal
  term by term to the article's Eq. 13 -- see the propsDict header), the
  temperature and density the article does not state, its Davies (b = 0.3) and
  the way it applies it on both faces, and the digitised flux of the neutral
  points.  A code-to-code comparison against the article's own program would be
  needed to separate them; the article's source is not available here.

## What was built for this case

The law had no neutral solute: DSPM-DE decomposed salts into ions and refused
anything else.  `transportParameters { neutralSolutes { glucose { radius ...; D0
...; } } }` now takes an uncharged component through the closed form of Bowen,
Mohammad & Hilal (1997) Eq. 28 beside the ion pore (Theory Guide,
`sec:dspmde-neutral`).  Imposed `Jv` only.  The neutral law was checked against an
independent recomputation of Eqs. 28-29 and the film (Python, written apart from the
engine) at the fitted pore: glucose at 5.984e-6 m/s 0.796902, glycerol at 2.873e-6
0.120785, sucrose at 12.18e-6 0.993143, equal to the engine's to every printed digit.  The existing DSPM-DE cases (membrane10,
11, 20, 22, 23, 24, diafilter02/03, dspmde01, nanofiltran) are byte-identical in
their goldens.

## Files

`constant/experimental/labban2017_*.dat` (one series per feed, each header says
what was read from where), `constant/species/` (the article's Stokes-radius ions,
case-local variations of the catalogue records), `constant/assets/LbLC.dat`
(the base record, no fitted number) and the records the fits write
(`LbLC_pore`, `LbLC_eps`, `LbLC_X_*`) and the article's own (`LbLC_paper_*`).
`postProcessing/<op>/` holds, per operation, the measured and computed rejection
against flux, the parity plot and the residuals the GUI draws.
