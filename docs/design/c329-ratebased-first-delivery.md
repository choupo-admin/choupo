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

(First pass:) Chan & Fair (1984) was NOT in the folder, and neither Perry 9ed nor Treybal
3ed prints its equations (Perry 14-50 only discusses it).  It was added later and is implemented: section 9.

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

## 7. Schulz et al. 2018 (step 4)

First pass: stopped (no structured-packing PDF).  Second pass (2026-11-12,
the PDFs added): see section 11.

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

## 9. Second pass (2026-11-12): two more tray-efficiency models

Built: `efficiency { model ChanFair; }` and `efficiency { model SyedaChuang;
holePitch <m>; }` beside AIChE (TrayEfficiency.{H,cpp}; the header carries
every equation number and page).  Witness cases, sealed, goldens recorded:
`trayEfficiency05_chanFair_yanagi14`, `trayEfficiency06_syedaChuang_yanagi14`,
`trayEfficiency07_syedaChuang_yanagi08` (34 kPa).  The full matrix -- both
models on all four Yanagi cases -- was run from scratch copies of cases 01-04
with only the model word (and the pitch) changed; the tables below are that
matrix, read against the same digitised and tabulated points as section 5.

**IN-SAMPLE, both.**  Chan & Fair 1984 Table I (p. 816) lists Yanagi & Sakata
1982 (14 %: 34.5 kPa at two weir heights, 165 kPa, 1138 kPa) and Sakata &
Yanagi 1979 (8 %: 165, 34.5, 27.6, 1138, 2068, 2758 kPa) in the data bank
the model was regressed on; p. 818 says the 14 % pressure runs (165 and 1138
kPa) did NOT fit and are plotted apart (Fig. 3).  Syeda, Afacan & Chuang's
one constant, C'' = 0.16, was fitted (p. 273) to "seven sets of FRI data
(Sakata and Yanagi, 1979; Yanagi and Sakata, 1982)" -- these trays.  Garcia
& Fair 2000 part 1 Table 3 lists the same FRI sets (ref 31: 8 % at 27.6,
165, 1138, 2068, 2758 kPa; ref 32: 14 % at 34 kPa x2 weirs, 165, 1138 kPa).
So every comparison in this section is in-sample for the correlation, though
nothing was fitted here.

**Garcia & Fair 2000 part 2 (ie0000966.pdf) is NOT implementable from the
folder**: p. 1819 says the zone equations "are presented in detail in the
above-cited reference [Prado & Fair, IECR 29 (1990) 1031] or in the
dissertation of Prado"; part 2 prints only the modified parameters (Eqs
5-17).  Needed: Prado & Fair 1990.

**Syeda: the readings.**  The thesis (NQ82172, pp. 123, 125, Eqs 5.26 and
5.31; OCR + page render) prints Eqs 28 and 33 exactly as the paper.
Implemented: Eq 28 WITH t_GLB, Eq 33 with h_w^0.5 -- the reasons are the
papers' own statements and dimensions, not data (TrayEfficiency.H).  The
as-printed form was run too: mean error at 34 kPa 14 % +5.9 pts, 34 kPa 8 %
+14.9, 165 kPa 14 % +40.9 (predicted 131.7 % at Fs 0.26), 165 kPa 8 % +23.8;
its efficiency FALLS from weeping to flood, the opposite of the trend the
paper describes.

### Overall tray efficiency, mean / max error (points), nothing fitted here
| tray, P | AIChE | ChanFair | SyedaChuang |
|---|---|---|---|
| 14 %, 34 kPa | +2.7 / 14.3 | +18.8 / 21.7 | -8.9 / 12.6 |
| 8 %, 34 kPa | -0.3 / 32.8 | +8.2 / 18.8 | -12.7 / 17.9 |
| 14 %, 165 kPa | +21.4 / 41.7 | +29.0 / 36.7 | -10.3 / 17.2 |
| 8 %, 165 kPa | +10.2 / 17.8 | +18.6 / 24.2 | -19.9 / 26.4 |

### The open-area effect, 14 % -> 8 % at equal F-factor (pts)
| P | Fs | measured | AIChE | ChanFair | SyedaChuang |
|---|---|---|---|---|---|
| 34 kPa | 1.2 | +10.0 | -0.1 | +1.1 | +5.8 |
| 34 kPa | 1.4 | +10.8 | -0.2 | -0.2 | +6.2 |
| 34 kPa | 1.6 | +8.1 | -0.6 | -1.0 | +6.2 |
| 34 kPa | 1.8 | +5.0 | -1.8 | -3.0 | +5.1 |
| 34 kPa | 2.0 | +3.4 | -6.5 | -10.4 | +0.1 |
| 165 kPa | 0.6 | +20.3 | +0.0 | +3.9 | +2.8 |
| 165 kPa | 0.8 | +8.9 | -0.0 | +2.9 | +4.2 |
| 165 kPa | 1.0 | +4.1 | -0.1 | +1.3 | +5.3 |
| 165 kPa | 1.2 | +5.1 | -0.4 | -0.5 | +5.9 |
| 165 kPa | 1.4 | +8.0 | -1.5 | -2.0 | +5.7 |
| 165 kPa | 1.6 | +9.7 | -6.3 | -7.9 | +2.2 |

**SyedaChuang predicts the measured SIGN across the range (+2 to +6 pts
against +3 to +11, smaller in size), ChanFair only at low load (f < ~0.5,
where its k_V a_i rises with f and the 8 % tray's f is larger), AIChE never.**
SyedaChuang sees the open area through the hole velocity (large-bubble
size) and the spray interfacial area (F^-0.3); and it is in-sample on these
very trays.  All three put the 8 % tray at 165 kPa beyond the model's flood
above Fs ~1.7, where it was measured at 93-96 %.

### Secondary point (8 % tray, 165 kPa)
Sakata & Yanagi 1979 as quoted by Sun, Yu, Yuan & Liu, Chem. Eng. Sci. 62
(2007) 1839, p. 1846 -- SECONDARY: liquid 30.66 m3/h, vapour 5.75 kg/s,
measured overall tray efficiency 89.4 %.  At rho_V 4.8 (Yanagi Table II)
on the 1.131 m2 tower, Fs = 5.75/(1.131 x 4.8^0.5) = 2.32.  Digitised Fig. 12
(8 %, 165 kPa): 90.2 % at Fs 2.30, 64.5 % at 2.42 -- consistent with 89.4 %
at 2.32 at the knee.  Every model here predicts that tray flooded at Fs 2.32.

### Van Sinderen, Wijn & Zanting 2003 (026387603321158249.pdf)
Read, not implemented.  Its entrainment and maximum-vapour relations come
from a 0.20 m x 0.20 m air-water column: the ejection-velocity distribution
and layer densities are fitted on one system (sigma 72 mN/m, rho_G 1.2), and
the paper compares with FRI data qualitatively ("differences owing to the
difference in scale").  It cannot replace Fair's median psi for
cyclohexane/n-heptane at 165 kPa (sigma 13.5 mN/m, rho_G 4.8) without a
property scaling the paper does not establish; at most it is a qualitative
check of the liquid-height effect.

'''
## 10. Full tables of the second pass

(ChanFair, then SyedaChuang as implemented; the as-printed SyedaChuang
summary is in section 9.)

#### ChanFair

##### 34 kPa, 14 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 1.007 | 63.3 | 85.0 | +21.7 | 0.43 | Fig. 12, digitised |
| 1.440 | 71.1 | 90.0 | +18.9 | 0.61 | Fig. 12, digitised |
| 1.472 | 70.8 | 90.1 | +19.3 | 0.63 | Table III run 628 |
| 1.825 | 74.3 | 89.4 | +15.1 | 0.78 | Fig. 12, digitised |
| 2.030 | 67.5 | 86.4 | +18.9 | 0.87 | Fig. 12, digitised |
| 2.305 | 41.3 | out of sweep | - | - | Fig. 12, digitised |
| 2.356 | 41.1 | out of sweep | - | - | Table III run 625 |
max |error| 21.7 pts, mean error +18.8 pts, mean |error| 18.8 pts over 5 points


##### 34 kPa, 08 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.477 | 48.5 | 67.3 | +18.8 | 0.23 | Fig. 12, digitised |
| 0.706 | 68.1 | 79.0 | +10.9 | 0.33 | Fig. 12, digitised |
| 1.047 | 73.5 | 87.8 | +14.3 | 0.49 | Fig. 12, digitised |
| 1.430 | 81.8 | 89.7 | +7.9 | 0.67 | Fig. 12, digitised |
| 1.840 | 78.8 | 85.3 | +6.5 | 0.87 | Fig. 12, digitised |
| 1.970 | 73.5 | 78.8 | +5.3 | 0.93 | Fig. 12, digitised |
| 2.100 | 66.6 | 60.7 | -5.9 | 1.00 | Fig. 12, digitised |
| 2.160 | 52.6 | out of sweep | - | - | Fig. 12, digitised |
max |error| 18.8 pts, mean error +8.2 pts, mean |error| 9.9 pts over 7 points


##### 165 kPa, 14 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.260 | 29.4 | 59.2 | +29.8 | 0.13 | Fig. 12, digitised |
| 0.533 | 51.3 | 88.0 | +36.7 | 0.27 | Fig. 12, digitised |
| 0.814 | 72.9 | 103.1 | +30.2 | 0.42 | Fig. 12, digitised |
| 1.053 | 82.7 | 108.2 | +25.5 | 0.54 | Fig. 12, digitised |
| 1.528 | 84.3 | 106.9 | +22.6 | 0.79 | Fig. 12, digitised |
| 2.123 | 84.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.362 | 74.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.649 | 58.0 | out of sweep | - | - | Fig. 12, digitised |
max |error| 36.7 pts, mean error +29.0 pts, mean |error| 29.0 pts over 5 points


##### 165 kPa, 08 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.525 | 75.2 | 91.6 | +16.4 | 0.30 | Fig. 12, digitised |
| 0.734 | 79.4 | 103.1 | +23.7 | 0.42 | Fig. 12, digitised |
| 1.007 | 84.8 | 109.0 | +24.2 | 0.57 | Fig. 12, digitised |
| 1.496 | 93.6 | 103.7 | +10.1 | 0.85 | Fig. 12, digitised |
| 1.934 | 95.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.199 | 91.9 | out of sweep | - | - | Fig. 12, digitised |
| 2.301 | 90.2 | out of sweep | - | - | Fig. 12, digitised |
| 2.416 | 64.5 | out of sweep | - | - | Fig. 12, digitised |
max |error| 24.2 pts, mean error +18.6 pts, mean |error| 18.6 pts over 4 points


#### SyedaChuang (implemented readings)

##### 34 kPa, 14 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 1.007 | 63.3 | 57.3 | -6.0 | 0.43 | Fig. 12, digitised |
| 1.440 | 71.1 | 61.8 | -9.3 | 0.62 | Fig. 12, digitised |
| 1.472 | 70.8 | 61.9 | -8.9 | 0.63 | Table III run 628 |
| 1.825 | 74.3 | 61.7 | -12.6 | 0.78 | Fig. 12, digitised |
| 2.030 | 67.5 | 59.6 | -7.9 | 0.87 | Fig. 12, digitised |
| 2.305 | 41.3 | out of sweep | - | - | Fig. 12, digitised |
| 2.356 | 41.1 | out of sweep | - | - | Table III run 625 |
max |error| 12.6 pts, mean error -8.9 pts, mean |error| 8.9 pts over 5 points


##### 34 kPa, 08 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.477 | 48.5 | 41.4 | -7.1 | 0.23 | Fig. 12, digitised |
| 0.706 | 68.1 | 52.9 | -15.2 | 0.33 | Fig. 12, digitised |
| 1.047 | 73.5 | 63.2 | -10.3 | 0.50 | Fig. 12, digitised |
| 1.430 | 81.8 | 68.0 | -13.8 | 0.68 | Fig. 12, digitised |
| 1.840 | 78.8 | 66.1 | -12.7 | 0.87 | Fig. 12, digitised |
| 1.970 | 73.5 | 61.6 | -11.9 | 0.93 | Fig. 12, digitised |
| 2.100 | 66.6 | 48.7 | -17.9 | 1.00 | Fig. 12, digitised |
| 2.160 | 52.6 | out of sweep | - | - | Fig. 12, digitised |
max |error| 17.9 pts, mean error -12.7 pts, mean |error| 12.7 pts over 7 points


##### 165 kPa, 14 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.260 | 29.4 | 27.5 | -1.9 | 0.14 | Fig. 12, digitised |
| 0.533 | 51.3 | 47.1 | -4.2 | 0.28 | Fig. 12, digitised |
| 0.814 | 72.9 | 59.5 | -13.4 | 0.42 | Fig. 12, digitised |
| 1.053 | 82.7 | 65.5 | -17.2 | 0.55 | Fig. 12, digitised |
| 1.528 | 84.3 | 69.3 | -15.0 | 0.79 | Fig. 12, digitised |
| 2.123 | 84.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.362 | 74.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.649 | 58.0 | out of sweep | - | - | Fig. 12, digitised |
max |error| 17.2 pts, mean error -10.3 pts, mean |error| 10.3 pts over 5 points


##### 165 kPa, 08 % tray: overall tray efficiency vs F-factor
| Fs | measured E_o % | predicted E_o % | error (pts) | flood approach | source |
|---|---|---|---|---|---|
| 0.525 | 75.2 | 48.8 | -26.4 | 0.30 | Fig. 12, digitised |
| 0.734 | 79.4 | 60.4 | -19.0 | 0.42 | Fig. 12, digitised |
| 1.007 | 84.8 | 70.0 | -14.8 | 0.58 | Fig. 12, digitised |
| 1.496 | 93.6 | 74.2 | -19.4 | 0.86 | Fig. 12, digitised |
| 1.934 | 95.6 | out of sweep | - | - | Fig. 12, digitised |
| 2.199 | 91.9 | out of sweep | - | - | Fig. 12, digitised |
| 2.301 | 90.2 | out of sweep | - | - | Fig. 12, digitised |
| 2.416 | 64.5 | out of sweep | - | - | Fig. 12, digitised |
max |error| 26.4 pts, mean error -19.9 pts, mean |error| 19.9 pts over 4 points


## 11. Schulz et al. 2018 -- the packed bed (second pass)

**Billet & Schultes 1999 (026387699526520.pdf) has no constants for this
packing**: Table 2b (p. 502) gives Montz B1-200, B2-300, C1-200, C2-200 and
no gauze packing at all.  So the packed section is Rocha, Bravo & Fair:
hydraulics IECR 32 (1993) 641 Eqs 20-29 (pp. 646-647; flooding at 1025 Pa/m,
p. 649), mass transfer IECR 35 (1996) 1660 Eqs 5-17 with the GAUZE area of Eq
14 (p. 1665).  Built: `PackingRBF.{H,cpp}` and
`DistillationColumn::solveTotalRefluxPacked` (`packing {}` under `model
totalReflux;`): dy/dz = (y*(x = y) - y)/H_OG integrated up the bed (midpoint,
100 segments), the pressure falling by the bed's own drop, the bottom
pressure found by bisection so that the TOP is the declared pressure.

Inputs (Schulz section 2 and Table 1): D 1.22 m, bed 2.2 m, a_p 478
(installed), eps 0.92, 60 deg, top 0.10 / 0.02 bar, liquid viscosity 0.391 /
0.539 mPa s.  ESTIMATED: the corrugation side S = 9 mm (Schulz does not
print it; Sulzer BX's, RBF 1993 Table IV) -- HETP scales roughly with it.
ASSUMED: reboiler liquid 0.20 / 0.17 p-xylene (bed-mean near Table 1's 0.54
/ 0.49).  Checks against Table 1: alpha 1.241 vs 1.240 (0.10 bar); u_L at
F 1.5 4.0 vs 4.18 m3/(m2 h).  Abscissa: the bed-mean F-factor.

DIGITISATION (Fig. 2b): the figure is a 1098 x 347 raster at 180 ppi
(pdfimages); frame by pixel scan (x 613-1039 = F 0-4, y 291-10.5 = HETP
0-0.6 m / dp 0-12 mbar/m); markers read on a 4x enlargement; about +-0.03
in F, +-0.005 m in HETP, +-0.1 mbar/m.  All points "digitised".

NOTHING FITTED at 0.10 bar (RBF has no per-packing constant to fit), so
0.02 bar is a prediction exactly as 0.10 bar is.

IN-SAMPLE OR NOT: RBF 1996 Table 2 holds Sulzer BX with o-/p-xylenes at
0.021, 0.39, 1.0 bar (Sakata 1972) -- same system, same gauze class, not this
packing, not these runs.

### Measured vs predicted

#### 0.10 bar: HETP and pressure drop vs F-factor (bed mean)
| F_G | HETP measured m | HETP predicted m | error % | dp/dz measured mbar/m | predicted | error % |
|---|---|---|---|---|---|---|
| 0.42 | 0.125 | 0.099 | -21 | 0.13 | 0.14 | 7 |
| 0.56 | 0.133 | 0.108 | -19 | 0.24 | 0.21 | -11 |
| 0.69 | 0.140 | 0.116 | -17 | 0.26 | 0.30 | 17 |
| 1.03 | 0.156 | 0.134 | -14 | 0.39 | 0.60 | 55 |
| 1.37 | 0.171 | 0.150 | -12 | 0.49 | 1.02 | 108 |
| 1.72 | 0.187 | 0.164 | -12 | 0.64 | 1.57 | 145 |
| 2.04 | 0.203 | 0.177 | -13 | 0.94 | 2.21 | 135 |
| 2.69 | 0.220 | 0.202 | -8 | 1.71 | 4.04 | 136 |
| 3.00 | 0.247 | 0.214 | -13 | 2.50 | 5.25 | 110 |
| 3.30 | 0.295 | beyond the model flood | beyond the model flood | 3.47 | beyond the model flood | beyond the model flood |
| 3.58 | 0.535 | beyond the model flood | beyond the model flood | 5.13 | beyond the model flood | beyond the model flood |
HETP: mean -14 %, max |21| % over 9; dp: mean +78 %, max |145| % over 9
model hydraulic flood beyond F_G (bed mean) = 3.08

#### 0.02 bar: HETP and pressure drop vs F-factor (bed mean)
| F_G | HETP measured m | HETP predicted m | error % | dp/dz measured mbar/m | predicted | error % |
|---|---|---|---|---|---|---|
| 0.58 | 0.120 | 0.091 | -24 | 0.40 | 0.31 | -23 |
| 0.86 | 0.126 | 0.102 | -19 | 0.45 | 0.55 | 22 |
| 1.13 | 0.133 | 0.112 | -16 | 0.58 | 0.86 | 48 |
| 1.40 | 0.142 | 0.121 | -15 | 0.72 | 1.21 | 68 |
| 2.04 | 0.173 | 0.140 | -19 | 1.43 | 2.34 | 64 |
| 2.60 | 0.245 | 0.156 | -36 | 1.99 | 3.71 | 86 |
| 3.12 | 0.263 | 0.172 | -35 | 2.84 | 5.41 | 90 |
| 3.53 | 0.479 | beyond the model flood | beyond the model flood | 4.24 | beyond the model flood | beyond the model flood |
HETP: mean -23 %, max |36| % over 7; dp: mean +51 %, max |90| % over 7
model hydraulic flood beyond F_G (bed mean) = 3.14

### What the model gets
* HETP: low by 8-24 % at 0.10 bar (mean -14 %) and 15-36 % at 0.02 bar
  (mean -23 %).  The PRESSURE EFFECT in the preloading region has the right
  sign and size: at F 1.4, measured 0.142 (0.02) vs ~0.170 (0.10), -17 %;
  predicted 0.121 vs 0.150, -19 %.
* Pressure drop: over-predicted, +78 % mean at 0.10 bar (up to +145 %),
  +51 % at 0.02; the sign of the pressure effect (higher at 0.02 bar at
  equal F) is right.  RBF's dry and irrigated constants come from
  sheet-metal Flexipac / Gempak air-water data (part 1, Table II); no gauze.
* Flooding, by the authors' criterion: Schulz separates the EFFICIENCY
  flood (HETP leaves the curve: F ~3.3-3.5 at 0.10 bar at ~3.5 mbar/m, a
  little lower at 0.02 bar at < 3 mbar/m) from the HYDRAULIC flood (loss of
  operability, "close to or above 10 mbar/m").  The model has no
  efficiency-flood mechanism (its HETP rises smoothly); its hydraulic flood
  (no holdup with g_eff > 0 below 1025 Pa/m) arrives at a bed-mean F of
  3.08 (0.10 bar) and 3.14 (0.02 bar), at a computed 5-6 mbar/m -- i.e. near
  the measured efficiency flood, below the measured hydraulic flood.  The
  "anomaly" Schulz reports (no capacity gain at 0.02 bar) is reproduced in
  the sense that the model also puts both floods at nearly the same F.

## 12. Third pass (2026-11-12)

### Zuiderweg 1982 -- the Syeda readings checked against the primary
* Eq 33 (clear liquid): Zuiderweg, Chem. Eng. Sci. 37 (1982) 1441, Eq (8),
  p. 1443, prints the Hofhuis equation h_l = 0.6 H_w^0.5 p^0.25 (FP/b)^0.25
  (25 < H_w < 100 mm).  The reading implemented (h_w^0.5) is CONFIRMED; the
  Syeda paper and thesis dropped the exponent.  No code change.
* Eq 28 (t_GLB): Zuiderweg does not contain the break-up equation (it is
  Syeda's own); the reading stays on the paper's own statements (section 9).
* Zuiderweg's spray / mixed-regime interfacial areas (pp. 1460-1461, Figs
  35-36) were derived from the FRI performance data (Sakata & Yanagi): an
  efficiency model built on them is in-sample on these trays.  Recorded in
  TrayEfficiency.H; not implemented.

### Garcia & Fair 2000 + Prado & Fair 1990 -- NOT done in this pass
Prado & Fair, IECR 29 (1990) 1031, carries the zone equations (its Eqs 1-62:
jet zone, large/small-bubble zones, residence times, the air-water bubble
correlations) that Garcia & Fair part 2 modifies (its Eqs 5-17).  The text
layer of Prado & Fair garbles most equations, so each has to be read off a
page render, about 40 of them; the model was deferred so that the Delft
packing model, the one Schulz compares against, could be completed and
validated in this pass.  Completeness of the pair was not assessed
equation by equation.  In-sample status is already known from Garcia & Fair
part 1 Table 3: the Yanagi (14 %) and Sakata (8 %) FRI trays are in its
database.

### Delft model for the Schulz bed
Built: `packing { model Delft; corrugationBase; corrugationHeight;
elementHeight; holeFraction; }` (PackingDelft.{H,cpp}), the working
equations of Fair, Seibert, Behrens, Saraber & Olujic, IECR 39 (2000) 1788,
Table 2 (Eqs 1-16) and Table 4 (Eqs 30-55), for Olujic, Kamerbeek & de
Graauw 1999.  One reading: the sign inside psi (Eq 43) is not legible; taken
as minus (the chord).  Cases `packing03_schulz_delft_0p10bar`,
`packing04_schulz_delft_0p02bar`, the same bed integration as packing01/02.

ESTIMATED GEOMETRY: Schulz does not print the corrugation dimensions.  Base
b = 11.5 mm, height h = 6.1 mm: the Montz B1-400 base/height ratio (Fair et
al. 2000 Table 1) scaled so that a_p = 4 s/(b h) returns the installed 478.
Element height 0.169 m = 2.2 m / 13 layers (Schulz).  Omega = 0
(unperforated).  For RochaBravoFair the side S = 9 mm (Sulzer BX) is the
estimate; the B1-400-shaped estimate would give s = 8.4 mm.


#### 0.10 bar: HETP and pressure drop vs F-factor (bed mean)
| F_G | HETP measured m | HETP predicted m | error % | dp/dz measured mbar/m | predicted | error % |
|---|---|---|---|---|---|---|
| 0.42 | 0.125 | 0.137 | 10 | 0.13 | 0.05 | -58 |
| 0.56 | 0.133 | 0.141 | 6 | 0.24 | 0.09 | -64 |
| 0.69 | 0.140 | 0.145 | 4 | 0.26 | 0.12 | -53 |
| 1.03 | 0.156 | 0.158 | 2 | 0.39 | 0.24 | -37 |
| 1.37 | 0.171 | 0.171 | -0 | 0.49 | 0.41 | -17 |
| 1.72 | 0.187 | 0.181 | -3 | 0.64 | 0.61 | -4 |
| 2.04 | 0.203 | 0.189 | -7 | 0.94 | 0.97 | 3 |
| 2.69 | 0.220 | 0.203 | -8 | 1.71 | 3.41 | 99 |
| 3.00 | 0.247 | 0.209 | -16 | 2.50 | 5.53 | 121 |
| 3.30 | 0.295 | 0.213 | -28 | 3.47 | 8.47 | 144 |
| 3.58 | 0.535 | beyond the model flood | beyond the model flood | 5.13 | beyond the model flood | beyond the model flood |
HETP: mean -4 %, max |28| % over 10; dp: mean +13 %, max |144| % over 10
model hydraulic flood beyond F_G (bed mean) = 3.33

#### 0.02 bar: HETP and pressure drop vs F-factor (bed mean)
| F_G | HETP measured m | HETP predicted m | error % | dp/dz measured mbar/m | predicted | error % |
|---|---|---|---|---|---|---|
| 0.58 | 0.120 | 0.152 | 26 | 0.40 | 0.12 | -71 |
| 0.86 | 0.126 | 0.146 | 16 | 0.45 | 0.22 | -52 |
| 1.13 | 0.133 | 0.148 | 11 | 0.58 | 0.34 | -41 |
| 1.40 | 0.142 | 0.152 | 7 | 0.72 | 0.49 | -32 |
| 2.04 | 0.173 | 0.164 | -5 | 1.43 | 0.94 | -34 |
| 2.60 | 0.245 | 0.175 | -29 | 1.99 | 1.99 | 0 |
| 3.12 | 0.263 | 0.184 | -30 | 2.84 | 4.34 | 53 |
| 3.53 | 0.479 | 0.192 | -60 | 4.24 | 7.17 | 69 |
HETP: mean -8 %, max |60| % over 8; dp: mean -14 %, max |71| % over 8
model hydraulic flood beyond F_G (bed mean) = 3.83


### Both packing models side by side (errors, measured as the reference)
| P | region | RBF HETP | RBF dp/dz | Delft HETP | Delft dp/dz |
|---|---|---|---|---|---|
| 0.10 bar | preloading (F <= 2.04, 7 pts) | mean -15 %, max 21 % | mean +65 %, max 145 % | mean +2 %, max 10 % | mean -33 %, max 64 % |
| 0.10 bar | all points in range | mean -14 %, max 21 % (9) | mean +78 %, max 145 % (9) | mean -4 %, max 28 % (10) | mean +13 %, max 144 % (10) |
| 0.02 bar | preloading (F <= 2.04, 5 pts) | mean -19 %, max 24 % | mean +36 %, max 68 % | mean +11 %, max 26 % | mean -46 %, max 71 % |
| 0.02 bar | all points in range | mean -23 %, max 36 % (7) | mean +51 %, max 90 % (7) | mean -8 %, max 60 % (8) | mean -14 %, max 71 % (8) |

Reading against Schulz's own Delft evaluation (p. 766-767): the Delft model
here follows the 0.10 bar HETP closely in the preloading region (+2 % mean)
and under-predicts the preloading pressure drop at low load, as Schulz
describe for 0.02 bar; it does not see the efficiency departure (HETP stays
smooth to F 3.3, -28 % there); its pressure drop reaches the 10.25 mbar/m
flooding value at a bed-mean F of about 3.3 (0.10 bar) and 3.8 (0.02 bar) --
a HIGHER capacity at 0.02 bar, which is exactly the expectation Schulz say
their 0.02 bar data contradict.  The pressure effect on HETP in the
preloading region: Delft at F 1.4 gives 0.152 (0.02 bar) vs 0.171 (0.10
bar), -11 %; measured -17 %; RBF -19 %.
