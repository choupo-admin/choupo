# C329 first delivery -- total reflux, a sieve-tray efficiency computed from the internals, and FRI data

*Design record, 2026-11-12, written by a general on branch `c329-ratebased-1`
for the architect.  Every number below was printed by this worktree's binary
(cases under `tutorials/steady/distillation/`), or read off the paper at the
table / figure named.  Commission: DEV.md 4c C329 (the bullet in the
C318-C331 block) and the PLAN.md rows tagged C329.*

## 1. What was built

| piece | where | what it is |
|---|---|---|
| total reflux | `DistillationColumn::solveTotalReflux`, `src/unitOperations/distillation/DistillationColumn.cpp:4912`; dispatch `:1326` | `model totalReflux;` -- no feed, no products; marched up from the reboiler, every stage energy balance solved |
| computed tray efficiency | `src/unitOperations/distillation/TrayEfficiency.{H,cpp}` (`evaluate`, `.cpp:63`) | `efficiency { model AIChE; }` beside the declared `murphreeEfficiency` (still the default) |
| open-area flood correction | `TrayHydraulics::holeAreaFloodFactor`, `TrayHydraulics.cpp:133` | Perry 9ed p. 14-36: x0.9 at A_h/A_a = 0.08, x0.8 at 0.06; exactly 1 at >= 0.10, so every existing column is unchanged |
| Bolles-Fair tray pressure drop | `TrayHydraulics.cpp:360` (`pressureDropModel BollesFair;`) | Perry 9ed Eqs 14-100..14-109: h_d + beta (h_w + h_ow); Sinnott stays the default |
| cases | `totalReflux01_c6c7_yanagiRun628`, `trayEfficiency01_yanagi14`, `trayEfficiency02_yanagi08`, `trayEfficiency03_yanagi14_165kPa`, `trayEfficiency04_yanagi08_165kPa` | sealed, goldens recorded by name |

## 2. Total reflux: the degrees of freedom

Per stage the unknowns are x (c), y (c), T, L, V -- 2c + 3 -- and the
equations are c component balances, c equilibrium (or Murphree) relations,
two summations and one energy balance -- 2c + 3.  With no stream crossing
the column boundary, the c component balances summed over the stages read
0 = 0: c equations are dependent.  The two duties and the column's energy
balance add two unknowns and one equation.  What is left open is c numbers:
how much of each component circulates.  A test column fixes them by its
charge and its tray hold-up; a steady stage model has no hold-up, so it
cannot.  The specification that closes it is therefore

* the boil-up (1 number: `boilupRate`, or `fFactor` on the tower area), and
* the liquid composition at one point (c - 1 numbers: `specifiedAt reboiler;
  composition {...}` -- what a test report gives, Yanagi & Sakata Table III
  "reboiler liquid").

On every cut the component balances give V_{j+1} = L_j and y_{j+1} = x_j
exactly (no CMO), and the energy crossing every cut equals Q_reboiler, so
V_j = Q_R / (h_V(y_j, T_j) - h_L(y_j, T_bubble(y_j))).  The column is solved
by one march up from the reboiler; with a computed efficiency the march is
repeated on the previous march's efficiencies until they move by < 1e-10
(8 marches on trayEfficiency01 at its recorded point, Fs 1.3).  The first law closes by two independent
envelopes (reboiler vs condenser): gap 2.3e-13 kW on totalReflux01, published
as a `verified` closure.

Witness: `totalReflux01_c6c7_yanagiRun628` (run 628 conditions, IDEAL trays).
Its own check: ideal trays give `overallTrayEfficiency` 1.010 (not 1 only
because alpha varies over the trays; alpha_mean 1.900 against Table II's
1.84).

Not modelled (said in the output): the pressure drop is not fed back (every
stage at the top pressure); the composition can be fixed only at the
reboiler; the reflux returns saturated.

## 3. The efficiency model, and its sources

All from PDFs in `~/Choupo-Literature`:

* AIChE Bubble-Tray Manual sieve-tray transfer units, SI, Treybal 3ed p. 183
  Eqs 6.61-6.64; clear liquid Treybal Eq 6.38 (p. 172); point efficiency Eqs
  6.51-6.52; eddy diffusion along the liquid path Eqs 6.57-6.59.  Treybal's
  Illustration 6.4 is reproduced by the equations as printed (N_tG 0.956, N_tL
  4.70, D_E 0.0101, E_MG 0.716) -- which is how the printed q/Z (Z = length of
  travel) was checked.  Perry 9ed Eq 13-77 (p. 13-38) prints Q_L/W with W the
  weir length: an OPEN discrepancy (~20 % in that term on this tray), recorded,
  not resolved, and not chosen by comparison with data.
* Entrainment: Colburn (Perry 9ed Eq 14-98) with Fair's 1996 median psi
  (Eq 14-99) at the tray's approach to flood from the existing Fair/Lygeros
  rating.
* Transport from the engine: Chung (vapour viscosity), Fuller (vapour
  diffusivity; diffusion volumes added to the cases' own component records
  from Poling 5ed Table 11-1 -- the standards records carry none), Wilke-Chang
  at infinite dilution both ways combined linearly (Poling 5ed Eq 11-10.2,
  thermodynamic factor 1), Rackett, Brock-Bird.  The liquid viscosity is the
  paper's own Table II average (the package has no liquid-viscosity record for
  these two components).
* Binary only, one E_MV per tray: for a binary the two components' Murphree
  efficiencies are identical (y and y* both sum to one), so per-component vs
  averaged is moot; a multicomponent mixture is refused by name.

Chan & Fair (1984) is NOT in the folder, and neither Perry 9ed nor Treybal
3ed prints its equations (Perry 14-50 only discusses it), so it was not used.

## 4. Yanagi & Sakata 1982 -- what the paper holds

* i200019a029.pdf and yanagi1982.pdf in the folder are the same file (md5
  92dc00f56c8acb79df4ee0d798dfae8b).
* The 14 % tray: Table I (geometry), Table II (average properties), Table
  III (four runs at 34 kPa, two with an efficiency: run 628 70.8 %, run 625
  41.1 %).  Everything else is in figures.
* The 8 % tray data are NOT tabulated in this paper.  Its tables are in the
  companion, Sakata & Yanagi, IChemE Symp. Ser. 56 (1979) 3.2/21 -- not in
  the folder.  This paper reproduces the 8 % efficiency and pressure-drop
  POINTS in Figures 12 and 13 beside the 14 % ones.
* Systems: cyclohexane/n-heptane at 34 and 165 kPa, isobutane/n-butane at
  1138 kPa.  The butane system was not built in this delivery (it needs an
  EoS vapour at 11 bar).
* Fs is "based on the cross-sectional area of the tower" (Nomenclature);
  E_o is the Fenske slope of ln(x/(1-x)) per tray over ln alpha.  The case
  KPI `overallTrayEfficiency` is that definition.

DIGITISATION (Figures 12 and 13): the page rasterised at 400 dpi with
pdftoppm; the plot frame located by a pixel scan of the axis lines (Fig. 12
x 2090-2919 px = Fs 0-3, y 1456-2350 px = 180-20 %; Fig. 13 log-log, x
2031-2978 px = 0.01-5 m/s, y 2648-3608 px = 5-0.01 kPa); a labelled grid
drawn over a 3x enlargement; marker centres read by eye.  Uncertainty about
+-0.02 in Fs and +-1 point in E_o; +-5 % in dP.  Cross-check against the
two TABULATED runs: Fig. 13 at u 1.428 m/s reads 0.411 kPa where Table III
run 628 gives 0.393 kPa at u 1.451 m/s; Fig. 12 at Fs 2.305 reads 41.3 %
where run 625 gives 41.1 % at Fs 2.356.  Every digitised point is marked
"digitised" below.

## 5. Measured vs predicted -- nothing fitted

The reboiler liquid is 0.29 for every point (an ASSUMPTION: only two runs
publish it, 0.284 and 0.294).  "out of sweep" = beyond the model's own
entrainment flood (Fair's psi reaches 1), i.e. the model predicts the tray
has flooded there and the measurement says it has not.

### 34 kPa, 14 % tray: overall tray efficiency vs F-factor (trayEfficiency01_yanagi14)
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 1.007 | 63.3 | 77.6 | +14.3 | 0.43 | Fig. 12, digitised |
| 1.440 | 71.1 | 74.0 | +2.9 | 0.62 | Fig. 12, digitised |
| 1.472 | 70.8 | 73.8 | +3.0 | 0.63 | Table III run 628 |
| 1.825 | 74.3 | 69.6 | -4.7 | 0.78 | Fig. 12, digitised |
| 2.030 | 67.5 | 65.4 | -2.1 | 0.87 | Fig. 12, digitised |
| 2.305 | 41.3 | out of sweep | - | - | Fig. 12, digitised |
| 2.356 | 41.1 | out of sweep | - | - | Table III run 625 |

max |error| 14.3 pts, mean error +2.7 pts, mean |error| 5.4 pts over 5 points.

### 34 kPa, 8 % tray (trayEfficiency02_yanagi08)
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.477 | 48.5 | 81.3 | +32.8 | 0.23 | Fig. 12, digitised |
| 0.706 | 68.1 | 79.8 | +11.7 | 0.33 | Fig. 12, digitised |
| 1.047 | 73.5 | 77.3 | +3.8 | 0.49 | Fig. 12, digitised |
| 1.430 | 81.8 | 73.9 | -7.9 | 0.68 | Fig. 12, digitised |
| 1.840 | 78.8 | 66.9 | -11.9 | 0.87 | Fig. 12, digitised |
| 1.970 | 73.5 | 61.4 | -12.1 | 0.93 | Fig. 12, digitised |
| 2.100 | 66.6 | 48.1 | -18.5 | 1.00 | Fig. 12, digitised |
| 2.160 | 52.6 | out of sweep | - | - | Fig. 12, digitised |

max |error| 32.8 pts, mean error -0.3 pts, mean |error| 14.1 pts over 7 points.

### 165 kPa, 14 % tray (trayEfficiency03_yanagi14_165kPa)
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.260 | 29.4 | below sweep | - | - | Fig. 12, digitised |
| 0.533 | 51.3 | 93.0 | +41.7 | 0.27 | Fig. 12, digitised |
| 0.814 | 72.9 | 94.5 | +21.6 | 0.42 | Fig. 12, digitised |
| 1.053 | 82.7 | 95.3 | +12.6 | 0.54 | Fig. 12, digitised |
| 1.528 | 84.3 | 94.1 | +9.8 | 0.79 | Fig. 12, digitised |
| 2.123 | 84.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.362 | 74.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.649 | 58.0 | out of sweep | - | - | Fig. 12, digitised |

max |error| 41.7 pts, mean error +21.4 pts over 4 points.

### 165 kPa, 8 % tray (trayEfficiency04_yanagi08_165kPa)
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.525 | 75.2 | 93.0 | +17.8 | 0.30 | Fig. 12, digitised |
| 0.734 | 79.4 | 94.1 | +14.7 | 0.42 | Fig. 12, digitised |
| 1.007 | 84.8 | 95.0 | +10.2 | 0.57 | Fig. 12, digitised |
| 1.496 | 93.6 | 91.6 | -2.0 | 0.85 | Fig. 12, digitised |
| 1.934-2.416 | 95.6, 91.9, 90.2, 64.5 | out of sweep | - | - | Fig. 12, digitised |

max |error| 17.8 pts, mean error +10.2 pts over 4 points.

### The open-area prediction: 14 % -> 8 % at equal F-factor, nothing refitted
| P | Fs | measured E_o(8 %) - E_o(14 %), pts | predicted, pts |
|---|---|---|---|
| 34 kPa | 1.2 | +10.0 | -0.1 |
| 34 kPa | 1.4 | +10.8 | -0.2 |
| 34 kPa | 1.6 | +8.1 | -0.6 |
| 34 kPa | 1.8 | +5.0 | -1.8 |
| 34 kPa | 2.0 | +3.4 | -6.5 |
| 165 kPa | 0.6 | +20.3 | +0.0 |
| 165 kPa | 1.0 | +4.1 | -0.1 |
| 165 kPa | 1.4 | +8.0 | -1.5 |
| 165 kPa | 1.6 | +9.7 | -6.3 |
| 165 kPa | 1.8-2.0 | +10.6, +10.1 | beyond the model's flood |

**The model gets the SIGN of the open-area effect wrong.**  The AIChE
transfer units carry no hole area, so away from flood the two trays are
predicted equal (within 0.2 pts); near flood the 8 % tray floods earlier
(Perry's x0.9 capacity correction) and so loses MORE to entrainment.  The
measurement says the 8 % tray is about 10 % (relative) better across the
normal range (Yanagi & Sakata p. 716; Perry 9ed Fig. 14-44 reprints it).
Formulation (a) with the AIChE correlation cannot do demonstration A for
efficiency; it can for pressure drop and flooding (below).

### Pressure drop per tray vs superficial velocity (Bolles-Fair)
| P, tray | u m/s | measured kPa | predicted kPa | error % | source |
|---|---|---|---|---|---|
| 34, 14 % | 0.873 | 0.312 | 0.322 | +3 | Fig. 13, digitised |
| 34, 14 % | 1.428 | 0.411 | 0.430 | +5 | Fig. 13, digitised |
| 34, 14 % | 1.451 | 0.393 | 0.437 | +11 | Table III run 628 |
| 34, 14 % | 1.738 | 0.491 | 0.524 | +7 | Fig. 13, digitised |
| 34, 14 % | 1.887 | 0.596 | 0.577 | -3 | Fig. 13, digitised |
| 34, 14 % | 2.137 | 0.860 | 0.679 | -21 | Fig. 13, digitised |
| 34, 8 % | 0.717 | 0.367 | 0.374 | +2 | Fig. 13, digitised |
| 34, 8 % | 1.063 | 0.468 | 0.569 | +22 | Fig. 13, digitised |
| 34, 8 % | 1.418 | 0.679 | 0.864 | +27 | Fig. 13, digitised |
| 34, 8 % | 1.738 | 1.034 | 1.212 | +17 | Fig. 13, digitised |
| 34, 8 % | 1.844 | 1.235 | 1.345 | +9 | Fig. 13, digitised |
| 34, 8 % | 1.918 | 1.476 | 1.445 | -2 | Fig. 13, digitised |
| 165, 14 % | 0.384 | 0.338 | 0.346 | +2 | Fig. 13, digitised |
| 165, 14 % | 0.480 | 0.353 | 0.374 | +6 | Fig. 13, digitised |
| 165, 14 % | 0.680 | 0.465 | 0.465 | +0 | Fig. 13, digitised |
| 165, 8 % | 0.239 | 0.373 | 0.326 | -13 | Fig. 13, digitised |
| 165, 8 % | 0.337 | 0.418 | 0.394 | -6 | Fig. 13, digitised |
| 165, 8 % | 0.460 | 0.546 | 0.526 | -4 | Fig. 13, digitised |
| 165, 8 % | 0.694 | 0.851 | 0.911 | +7 | Fig. 13, digitised |

14 %: max 21 %, mean +2 % over 9 points; 8 %: max 27 %, mean +6 % over 10.
The open-area effect on pressure drop has the right sign and roughly the
right size (34 kPa, u ~ 1.42: measured 0.411 -> 0.679 kPa, predicted 0.430
-> 0.864).  WHAT WAS CHOSEN AFTER SEEING DATA: the route.  The default
(Sinnott, unchanged) gives 0.79 kPa on run 628 against 0.393 measured
(`totalReflux01`); Bolles-Fair was then implemented from Perry and declared
in the four efficiency cases.  No constant inside either was touched.

### Capacity
The model floods (psi = 1) at Fs ~1.95 on the 14 % tray at 165 kPa, where
the measured efficiency is still 84.6 % at Fs 2.12 and the tray operates to
2.65: Fair/Lygeros under-predicts this tray's capacity by about 25 % at 165
kPa.  At 34 kPa the model reaches Fs 2.3 before psi = 1, close to the
measured fall-off (41 % at 2.31-2.36).

## 6. In sample or not (C300 vocabulary)

Nothing is fitted; every point above is HELD OUT.  The AIChE correlations
come from the AIChE research programme of the 1950s; Perry 9ed p. 13-38
notes FRI data were then available to FRI members only, so these FRI points
are outside the correlation's own sample.  Fair's flooding chart and
entrainment correlation were built on data that include FRI's; whether these
particular runs were among them cannot be read from the folder.  Zuiderweg
(1982) -- not used -- fitted his interfacial area to these very FRI data
(Klemola & Ilme 1996, p. 4581), so a Zuiderweg comparison would be in-sample.

## 7. Schulz et al. 2018 (step 4) -- STOPPED

The paper (128.pdf) gives its HETP and dP only as Figure 2 and 3 curves and
a property table (Table 1).  The brief's condition for the packed-section
model is a published structured-packing correlation whose PDF is in the
folder.  None is: Billet & Schultes 1999 (Trans IChemE 77A), Rocha, Bravo &
Fair 1993/1996 (IECR 32:641, 35:1660), the Delft model the paper itself uses
(Fair et al. IECR 39 (2000) 1788; Olujic et al. CABEQ 18 (2004) 89) and
Verschoof et al. IECR 38 (1999) 3663 (loading point) are all absent.  Perry
9ed Table 5-24 transcribes the Rocha-Bravo-Fair mass-transfer relations; it
was not used because the brief asks for the primary PDF.  Needed to proceed:
the Delft-model papers (they are what Schulz compares against) or Rocha-
Bravo-Fair 1996.

## 8. Open

* The efficiency side of demonstration A needs a correlation that sees the
  open area (Zuiderweg 1982 does -- through the froth/spray regime and A_h/A_b
  -- but it is in-sample on FRI; Chan & Fair 1984 through the fractional
  approach to flood).  Neither PDF is in the folder.
* The 165 kPa over-prediction (+10 to +40 pts) matches Perry 14-50's warning
  that fundamental methods give 80-100 % on columns >= 1.2 m where real trays
  run near 60-85 %, which it attributes to under-predicted liquid backmixing.
* The low-load fall-off (weeping) is not modelled.
* The Treybal-vs-Perry q/Z vs Q_L/W reading of the AIChE N_G.
* Pressure profile not fed back into the total-reflux march.
* `efficiency { model AIChE; }` is implemented only under `model totalReflux;`
  (the Wang-Henke path keeps the declared E_MV).
