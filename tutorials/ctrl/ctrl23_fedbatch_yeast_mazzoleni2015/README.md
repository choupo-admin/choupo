# ctrl23_fedbatch_yeast_mazzoleni2015 — a yeast fed-batch from a published model

An aerobic fed-batch of *Saccharomyces cerevisiae* CEN.PK113-7D on glucose:
17 h of batch on 20 g/l, then an exponential feed of 500 g/l glucose at
0.16 1/h until 49 h.  The model is the one of Mazzoleni et al. 2015
(*Microb. Cell Fact.* 14:109, doi 10.1186/s12934-015-0295-4, CC BY 4.0): seven
mass balances, eight rate laws, every parameter printed.  **Nothing is fitted
here**: the numbers are the paper's Table 3 and Table 4 (CEN.PK113-7D column).
Run it: `runCase tutorials/ctrl/ctrl23_fedbatch_yeast_mazzoleni2015` (it runs
under `choupoCtrl`, about a minute and a half).

## What was read, and what was not

READ, in the full text: Eq 1-7 (the seven balances), Table 1 (rate laws),
Table 2 (auxiliary equations), Table 3 (initial values and feed set-up),
Table 4 (all parameters, four strains), the Methods on the CEN.PK cultures
(1 l of initial medium, 2 % w/v glucose, 50 % w/v glucose feed, pH 5, DOT 30 %)
and Fig 4 as an image.  NOT read: the data behind the figures (only plots exist),
the paper's other strains' runs, the supplementary material.

Why this run: CEN.PK113-7D (Fig 4) reaches the highest cell density of the
paper (about 100 g/l), where the inhibitor feedback it is about acts, and it is
the paper's own new experiment with mass, glucose and ethanol measured.

## How the engine carries it

| paper | here |
|---|---|
| seven pools in grams (G, P, E, C_M, R, I, D) | seven **mass-unit pseudo-components** (MW = 1 g/mol, so 1 kmol = 1 kg and kmol/m³ = g/l) |
| rate laws, Table 1 + Table 2 | eight `kinetics { type expression; }` reactions in `constant/reactions`, each parameter with its table reference |
| the efficiencies η < 1 lose mass | the lost part is the named component `lostMass`, so mass closes |
| exponential feed F0 exp(μ(t − t_F)) | a `Signal` `staircase` on the vessel's inflow, 64 steps of half an hour, each the EXACT MEAN of the exponential over its step |
| V(t) | `dynamicCSTR` with `volumeMode variable` and zero outflow: the volume follows the inventory |

**`batchReactor` could not carry this**: it has no continuous feed and its
volume is a number it keeps while a recipe `transfer` adds liquid, so every
c = n/V would be wrong.  The variable-volume `dynamicCSTR` under `choupoCtrl`
is the engine's fed-batch vessel.  No engine code was added.

Table 2 prints V(t) = M_F/(c_F y_R) exp(μ(t − t_F)), which is the volume of
FEED entered (14.6 ml at t_F), not the volume of the vessel (1 l by the
Methods).  The case uses V = V₀ + (M_F/(c_F y_R))(exp(μ(t − t_F)) − 1), which
is what the staircase integrates to; it is declared in the header.  Two other
readings are declared in `constant/reactions`: ρ (secretion) is printed in
1/h but is a dimensionless fraction, and the death switch d is written as a ramp
of 0.001 g/l around τ (the expression grammar has no comparison).  The
temperature (303.15 K) is an assumption: the paper states 30 °C only for its
plate counts; it affects only the density of water, because the model is
isothermal and the pseudo-components share one formation datum.

## What to look at

1. **The diauxic batch.**  Glucose is gone at 14 h, ethanol peaks at about
   9.5 g/l near 12.5 h and is consumed by 21 h (`trajectory.csv`).
2. **The feed.**  After 17 h glucose stays near 0.01 g/l: the yeast takes
   what is fed and the biomass follows the feed, up to about 90 g/l at 40.5 h.
3. **The overflow.**  After 40 h the glycolysis products pile up, ethanol is
   made and glucose accumulates; dead cells appear after 41 h.  At 49 h the
   vessel holds 183.6 g<!--golden: kpi reactor n_ethanolMass_final *1000--> of ethanol,
   493.7 g<!--golden: kpi reactor n_glucoseMass_final *1000--> of glucose and
   60.9 g<!--golden: kpi reactor n_deadCells_final *1000--> of dead cells in
   3.436 l<!--golden: kpi reactor volume_final *1000-->.
4. **The mass balance closes** (1.6e-14 relative; the energy ledger 3e-14).
   The paper does not track the mass its efficiencies lose; here it is
   340.8 g<!--golden: kpi reactor n_lostMass_final *1000--> of `lostMass` at 49 h, 27.5 % of all the
   solute, so the case shows what the model leaves untold.  The solutes in
   the vessel equal the 20 g charged plus the glucose fed (500 g/l × the fed
   volume): 1.2376 kg against 1.2382 kg (0.05 %), the difference being the volume the
   pseudo-components are given (1e-9 m³/mol, a total of 1.2 ml).

## Against the paper's Fig 4 — information, not an anchor

Read off the image by eye (about ±5 g/l, ±1 h), the paper's model curves and
this run agree: microbial mass (P + C_M + R + D)/V peaks at about 90 g/l near 40 h
in both (here 90.1 g/l at 40.5 h) and falls to about 65 g/l at 49 h (here
63.3); glucose is near zero until about 41 h and reaches about 145 g/l at 49 h
(here 143.7); the batch ethanol peak is about 9–10 g/l (here 9.5) and the
final ethanol plateau about 52 g/l (here 53.4).  The measured glucose at 49 h
(about 105 g/l) is below the model line in the paper itself.  The paper's
R² are 0.991, 0.885 and 0.934 for mass, glucose, ethanol; they are the paper's
fit, not a check of this run, and no number of the figure is pinned.  The golden
pins the run.

## What the engine lacks for this class of case

* an **exponential feed as a signal**: the staircase is a 64-row literal, and
  its entries are independent numbers, so the feed rate μ or the start time
  cannot be an optimisation variable;
* a biomass **component with an elemental formula** and an oxygen balance (no
  O₂, kLa, OUR or metabolic heat: the paper has none, and the case is
  isothermal by construction);
* the **element balance** of the run is unavailable (the pseudo-components
  have no formula); mass and energy close.

## Not done: the optimal feed profile

`outerDict` works over `choupoCtrl` (ctrl16 shapes `Schedule` values), not over
`choupoBatch`; it could shape the staircase values here.  It was not built:
one run costs about 90 s, so an optimisation over even four segments is hours
and a golden for it would be a heavy item in every sweep.  An `exponential`
signal (two parameters, μ and F₀) would make the one- or two-variable problem
the brief names, and is the missing piece.

`system/postDict` declares two figures: `culture` (the cell pools) and `medium`
(glucose, ethanol and the volume).
