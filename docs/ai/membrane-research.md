# Membrane research with Choupo -- a quick start

*For a researcher who has measured rejections on a nanofiltration or reverse
osmosis membrane and wants to fit a transport model to them and use it in a
process -- and for an assistant helping him.  The worked case is
`tutorials/steady/membranes/membrane24_fit_then_simulate`; its README is the
step-by-step "replace these files with your data".*

---

## 1. The path in one picture

    your measurements      constant/experimental/<series>.dat   (one file per feed)
          |  Properties & data mode   (runCase <case> props;   choupoProps)
          v
    the fit                fitParameters, residual kind membrane
          |  writes
          v
    the fitted record      constant/assets/<membrane>.dat       (values, +-, verdict, fingerprints)
          |  read by
          v
    the process            spiralWoundModule  membrane <membrane>;   (runCase <case>;  choupoSolve)
                           batchDiafilter     membrane <membrane>;   (a batch rig;     choupoBatch)

The same membrane record and the same transport law serve both processes:
the spiral module asks the law at every station of its channel, the batch
vessel (`tutorials/batch/membrane/diafilter03_dspmde_batch`, DSPM-DE in
batch concentration) at every instant of its campaign.  The process refuses a record whose datasets, fit block or base record changed
after the fit, naming what changed: a stale fit is never used in silence.

## 2. What goes in

* **The feed**, as salts (`NaCl`, `MgSO4`, ...) in mol/m3, each salt a
  component record whose ions are species records.  The models work ion by
  ion: DSPM-DE needs every ion's hydrated **radius** and its free-solution
  diffusivity **D0** (25 C, corrected to the run temperature by
  Stokes-Einstein on the declared water viscosity); the multi-ionic
  polarisation film needs D0.  The catalogue carries the hydrated radius
  (Nightingale 1959, Table I) for Na, K, Ca, Mg, H, OH, Cl, SO4, NO3, CO3,
  F, Br, I, NH4, Li, Sr, Ba, Fe(II) and Mn(II) -- NOT for HCO3, PO4, HPO4
  or H2PO4, which that table does not list -- and D0 for the first eight
  plus NO3, HCO3, CO3, F, Br, NH4, Li, Sr, Ba, H2PO4, HPO4, PO4, Fe(II)
  and Mn(II), the last fourteen from the public-domain PHREEQC database,
  each record citing its line (I has a radius and no D0).  So DSPM-DE runs
  a feed of any of those ions except HCO3, the phosphates and I.  An ion
  without the datum is refused by name, never given a default.
* **The membrane's parameters**, in a membrane record (`constant/assets/`):
  the water permeability `A_w`; for DSPM-DE a `poreModel {}` (pore radius,
  porosity over thickness A_k/dx, volumetric charge density X_d, pore
  dielectric constant); for SDEM and solution-diffusion a per-ion or
  per-salt `permeabilities {}` block.  A fit starts from a BASE record and
  frees only the values you list.
* **The operating point** of each measured row: the permeate flux `Jv`
  (m/s, imposed; DSPM-DE only) or the transmembrane pressure `dP` (the law
  then closes J_v = A_w (dP - dpi), and a measured `Jv_measured` can be
  fitted too), and the temperature.
* **Which rejection you measured**: `intrinsic` (corrected for
  polarisation) or `observed` (then declare the film coefficient of your
  cell).

## 3. What comes out

* **From the fit:** each free parameter with its 95 % half-width, the
  parameter correlations and the condition number (can the data tell the
  parameters apart?), the residual on the fitted series, the average
  absolute deviation on the HELD-OUT series in points of rejection, and the
  **verdict**:
  `validated` (the held-out series fall within the band you declared before
  the fit), `notValidated` (they do not), `heldOutPerformed` (no band was
  declared, so nothing was judged), `validationRefused` (nothing was held
  out -- no claim).  A parameter that ends on its bound is named
  unidentifiable and no record is written.
* **The record** the process reads, with every value's origin (fitted or
  held at the base record), its uncertainty and the verdict.
* **From the process:** rejections per salt and per ion, permeate and concentrate compositions and flows, the flux and
  polarisation along the element, the pressure drop, and the energy and
  mass balances.  From a batch vessel: the volume, flux and observed
  rejection at every instant, and the campaign's time-averaged rejection
  (section 5).

## 4. What each transport law assumes

| law | assumes | parameters |
|---|---|---|
| **DSPM-DE** (Bowen and Welfoot 2002) | cylindrical pores of ONE radius; steric hindrance of each ion (Dechadilok-Deen); Donnan exclusion by a CONSTANT volumetric charge; dielectric (Born) exclusion; extended Nernst-Planck inside the pore, solved across the pore length | r_p, A_k/dx, X_d, eps_p (+ A_w for pressure-driven rows); the ions' radii and D0 from the species records |
| **SDEM** (Yaroshchuk, Bruening and Licon Bernal 2013) | solution-diffusion of each ion, coupled by the electric field that zero current imposes; NO fixed charge; constant permeances; ideal dilute solution | one permeance per ion -- calibratable from single-salt tests through the ambipolar salt permeance |
| **solution-diffusion** | each solute crosses independently, J_s = B_s (c_wall - c_p); no coupling (an ion-declared feed then gives a charged permeate, and the run says so) | A_w and one B_s per solute |

The DSPM-DE fit is witnessed on published data (membrane24); the SDEM,
solution-diffusion and constant-rejection fits run through the same machinery
but have no real-data witness yet.

## 5. How the rejection is reported

A rejection is always `R = 1 - c_permeate / c_reference`; what changes
between configurations is WHICH permeate and WHICH reference, and a number
quoted without them is not comparable with another.

* **At one point of the membrane** (what the transport law computes, and
  what a fit is fitted to): the **intrinsic** rejection `1 - c_p / c_m`,
  against the concentration at the membrane WALL, and the **observed**
  rejection `1 - c_p / c_b`, against the bulk.  They differ by the
  concentration polarisation of the film (`k_film`, or a mass-transfer
  correlation).  The measured series declare which one they carry
  (`rejection intrinsic | observed`); there is no default.
* **In a spiral-wound stage** (`spiralWoundModule`, `R_obs_<salt>`): a
  SPATIAL average.  The permeate is the MIXED permeate of the whole channel
  -- every station's permeate, collected -- and the reference is the stage's
  INLET feed: `R_obs = 1 - (F_perm,solute / Q_perm) / c_feed,inlet`.  The
  bulk concentrates along the channel and the local rejection moves with
  it, so the stage's number is neither the inlet's nor the outlet's local
  rejection.  A train of elements reports the same for the whole vessel.
* **In a batch campaign** (`batchDiafilter`): a TIME average, published per
  solute at the end of the run beside the instantaneous `R_obs_<solute>`
  of every instant (bulk reference, against the well-mixed retentate):

      c_permPooled_<s>       = (n0 - n) / V_perm
                               the POOLED permeate: everything collected
                               since t = 0, mixed (exact -- no solute enters
                               the vessel, so what left went through)
      c_bMeanPerm_<s>        = INTEGRAL c_b dV_perm / V_perm
                               the retentate's bulk concentration averaged
                               over the campaign, weighted by the permeate
                               rate at each instant (dV_perm = Q_p dt)
      c_bInitial_<s>         = n0 / V0, the charge
      R_avg_<s>              = 1 - c_permPooled / c_bMeanPerm
      R_avgVsInitialFeed_<s> = 1 - c_permPooled / c_bInitial

  `R_avg` is the campaign's rejection of the solution the membrane actually
  saw: it equals the mean of the instantaneous `R_obs` weighted by
  `c_b Q_p`, so it lies between the smallest and the largest of them.
  `R_avgVsInitialFeed` is what a laboratory reports when it analyses the
  collected permeate against the feed it started from; it is a statement
  about the OPERATION, not the membrane -- in concentration mode the
  retentate only gets richer, so it lies BELOW `R_avg` (diafilter03: NaCl
  0.635 against 0.467), and in constant-volume diafiltration a passing
  solute is washed out, so it lies ABOVE it (diafilter01: NaCl 0.873
  against 0.908).  A plain time mean of the bulk, `INTEGRAL c_b dt / t`, is
  NOT published: it weighs an instant at which almost nothing permeates as
  much as one at which most of the permeate is made, and the rejection built
  on it is not a mean of anything the membrane did.  The integral is
  advanced by the same integrator, on the same steps, as the inventory and
  the permeated volume (`BatchDiafilter.cpp`, `odeDerivative` and `kpis`);
  `check_diafiltration` arm (i) rebuilds every one of these from the
  inventory and the trajectory.  Declare `timeStepping adaptive;` in the
  batch case's `controlDict`: without it the vessel is advanced by a fixed
  explicit Euler step and every integral, this one included, is first
  order in `deltaT`.

## 6. What the model cannot do

* **It is fitted per membrane AND per solution type.**  The charge density
  of a real nanofiltration membrane changes with pH and concentration; here
  it is one constant.  A pore fitted on chlorides at 10 mol/m3 describes
  other salts and other concentrations only as far as a held-out series
  shows it does.
* **It predicts rejection trends, not a manufacturer's guarantee.**  Use it
  to rank feeds, plan which experiments discriminate between hypotheses, and
  see which ion limits a separation -- not to promise a permeate quality.
* No fouling, scaling kinetics or cleaning in the steady module; no
  pH-dependent charge; no concentration-dependent permeances; the
  membrane's own parameters do not depend on temperature (the run
  temperature reaches the solution side: viscosity, the D0 correction,
  osmotic and electrostatic terms).
* DSPM-DE takes salts, ion by ion; in the polarisation film a neutral
  solute (boric acid, silica) takes the unit's own diffusivity, not a
  species record's.
* The ion radii and D0 are not fingerprinted by the fit: change one and the
  record is not marked stale -- re-fit yourself.
* In the browser the fit runs and reports its verdict, but the record it
  writes does not yet reach the opened case (DEV.md 4c C157): run the two
  modes with a local build to simulate the process on your own fit.

## 7. Licence

Choupo is GPL-3.0-or-later: free to use, also commercially; the name is a
trademark.  Your data and your fitted records are yours; a case you
publish carries whatever licence you give it.
