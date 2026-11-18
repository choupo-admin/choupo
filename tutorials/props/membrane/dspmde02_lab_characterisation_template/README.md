# dspmde02_lab_characterisation_template -- fill one record, get the pore of your membrane

```
runCase tutorials/props/membrane/dspmde02_lab_characterisation_template
```

**What you get.** From one experiment record and a few uncharged-solute runs: the
DSPM-DE pore of YOUR membrane -- r_p and the effective thickness, the pore charge
X_d at each concentration (its isotherm), every number with its 95 % interval, the
computed rejection against the measured one as a function of flux for each
concentration, and ONE point you held out and the pore predicted without seeing it.

**It ships filled with the points of Labban, Liu, Chong & Lienhard (2017)**, so it
is run, not promised (their NF membrane; how every number was read is in
`../labban2017_dspmde_validation`).  Their data are three FEEDS of different
composition rather than three concentrations of one salt: the shape of the record
is the same, the chemistry is not.  Replace the numbers, keep the columns.

## What to measure (step by step)

1. **An uncharged solute, 3-4 pressures.**  Glucose, sucrose or glycerol at a low
   concentration (a few hundred mg/kg, so the osmotic pressure is nil), at the
   highest cross-flow your cell allows, 3 or 4 pressures.  Write, for each, one
   file `constant/experimental/lab_neutral_<name>.dat`: the feed concentration
   (mol/m3), and per pressure the measured **flux** `Jv` (m/s) and the **observed
   rejection** `R_<name>` = 1 - c_permeate / c_feed (a fraction).  Two or three
   solutes of different size (the article used glycerol, glucose, sucrose) fix
   r_p and the thickness; one solute leaves them correlated.  Put the solute's
   Stokes radius and D_inf in `neutralSolutes {}` of the propsDict (the article's
   Table 1 gives them for five solutes; a handbook or the Wilke-Chang/Stokes-Einstein
   value otherwise -- cite it).
2. **A salt at 3 concentrations x 3 pressures at the pH you care about.**  Write
   ONE file, `constant/experimental/lab_salts.dat`, nine rows, in this order:
   concentration 1 at pressures 1, 2, 3; concentration 2 at pressures 1, 2, 3;
   concentration 3 likewise.  Columns:
   * `c_<salt>` -- the feed concentration of each salt, mol/m3 (0 where absent);
   * `dP_applied` -- the pressure you set, Pa (carried, never fitted);
   * `Jv` -- the permeate flux you measured, m/s (1 LMH = 1/3.6e6 m/s);
   * `R_<ion>` -- the OBSERVED rejection of each ion, 1 - c_p / c_feed, a fraction
     (negative is fine and real); write `nan` for an ion you did not analyse at that
     point.  **Measure the multivalent ion**: the charge is identified by it, and a
     record with only Na+ and Cl- leaves X_d unidentifiable (a ±33 mol/m3 interval in a
     trial of this very case).
   Say the temperature once (`T` in the file) and the pH in the header comment.
   Measure each point at a stable flux (several minutes), and a feed sample and a
   permeate sample for each ion at each point.
3. **The pore dielectric constant is DECLARED, not fitted.**  Either run one salt
   (NaCl) at the pH where the rejection is lowest (the isoelectric point: the
   membrane is uncharged there) and fit it as op B of the validation case does,
   or take the literature value for your membrane class.  Write it into
   `constant/assets/Lab.dat` (`poreDielectric`) and say where it came from.
4. **The film.**  Concentration polarisation makes the wall richer than the bulk,
   and the observed rejection is not the pore's.  Declare how you know it, in
   `massTransfer {}` of each operation: your cell's correlation (a stirred cell:
   `model StirredCell;` with its `omega` and `radius`), or the film coefficient
   you measured (`k_film <m/s>;` instead of the block).  Never leave it out: a
   missing film is a missing parameter.

## What each file is

| file | what | you |
|---|---|---|
| `constant/experimental/lab_neutral_*.dat` | the uncharged-solute series | replace |
| `constant/experimental/lab_salts.dat` | the salt record, nine rows | replace |
| `constant/assets/Lab.dat` | the base pore record: the DECLARED eps_p | edit |
| `constant/species/*.dat` | the ions' radius and D_inf | keep, or replace if your ions differ |
| `constant/thermoPhysPropDict` | the components | add your salts / solutes |
| `system/propsDict` | the chain: step 1 pore, step 2 X_d per concentration | edit the numbers, the film, the band |

## Run it, and read it

`runCase <your copy>` -- seconds.  The log prints, per operation:

* the **parameters with 95 % half-widths**, the condition number and the
  correlations (are the data able to tell the parameters apart?);
* the **in-sample** deviation (points of rejection) and, for the held-out point, the
  **held-out deviation** and the verdict against the band `acceptance { maxAAD ... }`
  -- **write your band before you run, with its reason** (the template's 5 points is
  a default, not a rule);
* under `postProcessing/<op>/`: `rejections` (measured and computed rejection
  against flux, one curve per ion), `parity` and `residuals`; the GUI draws them;
* `postProcessing/case/charge_isotherm`: the fitted X_d of each concentration level
  against its concentration.  Read the isotherm off it (a Freundlich form
  X_d = k c^n is a straight line on log-log axes).

Each X_d operation writes a membrane record (`Lab_X_c1`, ...) with its values, their
intervals and the verdict; the first writes `Lab_pore`.  The pore operation must
run first (a copy in the order of the propsDict does).

## The held-out point

The propsDict holds out ONE row (row 5: concentration 2, pressure 2): `fit_X_c2`
fits rows 4 and 6 and the row 5 prediction is judged against your band.  The
rows are named by `discard ( ... )` on the evidence entries -- 1-based row numbers,
announced in the log -- so ONE file serves every operation.  Keep the row order, or
change the lists with it.  Hold out the point you trust least to be an extreme
(the middle pressure of the middle concentration is the kindest choice; the highest
pressure of the highest concentration the hardest).

## Without an uncharged solute

Fit r_p, the thickness and X_d together on the salt record: `parameters` of the
step-2 operations then lists the three paths; expect a large correlation between
r_p and X_d and read the condition number before believing either (the case
`membrane24_fit_then_simulate` shows the partitions that fail).  A neutral solute
is the cheaper experiment.

## What this case found on Labban's data (so you know what to expect)

* r_p 0.495 +- 0.029 nm, effective thickness 3.0 um with a 95 % interval 1.8-9.3
  (the rejection data barely determine it; the pure-water flux does -- measure it);
* X_d: +3.8 +- 1.1 (NaCl+MgCl2), -4.5 +- 4.8 (NaCl+Na2SO4), -74 +- 95 (seawater,
  unidentifiable): the interval tells you which concentration levels to believe;
* the held-out point (row 5) predicted to 3.4 points of rejection: validated against
  the 5-point band.

What this case does NOT do: it gives no pH dependence (one pH per record), no
temperature dependence, and no process (the stage that reads the fitted record is
`membrane24_fit_then_simulate`).
