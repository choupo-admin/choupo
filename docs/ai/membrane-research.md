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

The process refuses a record whose datasets, fit block or base record changed
after the fit, naming what changed: a stale fit is never used in silence.

## 2. What goes in

* **The feed**, as salts (`NaCl`, `MgSO4`, ...) in mol/m3, each salt a
  component record whose ions are species records.  The models work ion by
  ion: DSPM-DE needs every ion's hydrated **radius** and its free-solution
  diffusivity **D0** (25 C, corrected to the run temperature by
  Stokes-Einstein on the declared water viscosity); the multi-ionic
  polarisation film needs D0.  The catalogue carries the radius for Na, K,
  Ca, Mg, H, OH, Cl and SO4, and D0 for those plus NO3, HCO3, CO3, F, Br,
  NH4, Li, Sr, Ba, H2PO4, HPO4, PO4, Fe(II) and Mn(II) -- the last fourteen
  from the public-domain PHREEQC database, each record citing its line.  An
  ion without the datum is refused by name, never given a default.
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
  mass balances.

## 4. What each transport law assumes

| law | assumes | parameters |
|---|---|---|
| **DSPM-DE** (Bowen and Welfoot 2002) | cylindrical pores of ONE radius; steric hindrance of each ion (Dechadilok-Deen); Donnan exclusion by a CONSTANT volumetric charge; dielectric (Born) exclusion; extended Nernst-Planck inside the pore, solved across the pore length | r_p, A_k/dx, X_d, eps_p (+ A_w for pressure-driven rows); the ions' radii and D0 from the species records |
| **SDEM** (Yaroshchuk, Bruening and Licon Bernal 2013) | solution-diffusion of each ion, coupled by the electric field that zero current imposes; NO fixed charge; constant permeances; ideal dilute solution | one permeance per ion -- calibratable from single-salt tests through the ambipolar salt permeance |
| **solution-diffusion** | each solute crosses independently, J_s = B_s (c_wall - c_p); no coupling (an ion-declared feed then gives a charged permeate, and the run says so) | A_w and one B_s per solute |

The DSPM-DE fit is witnessed on published data (membrane24); the SDEM,
solution-diffusion and constant-rejection fits run through the same machinery
but have no real-data witness yet.

## 5. What the model cannot do

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

## 6. Licence

Choupo is GPL-3.0-or-later: free to use, also commercially; the name is a
trademark.  Your data and your fitted records are yours; a case you
publish carries whatever licence you give it.
