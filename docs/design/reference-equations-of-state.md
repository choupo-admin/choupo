# Reference equations of state -- one Helmholtz kernel, the coefficients as records

DEV.md 4c C333, slice 1 (2026-11-12).  Vitor's order: "equacoes de estado de
alta precisao?! Nos nao podemos implementar isso ja?!"

## 1. What was built

A reference (multiparameter) equation of state is ONE function, the reduced
Helmholtz energy of a pure fluid,

    alpha(delta, tau) = f / (R T) = alpha0(delta, tau) + alphar(delta, tau),
    delta = rho / rho_c,   tau = T_c / T,

and every thermodynamic property is a combination of alpha and its first and
second partial derivatives.  So the whole equation is a short kernel plus a
list of coefficients, and Choupo keeps those two apart:

* **The kernel** -- `src/thermo/equationOfState/HelmholtzEnergy.{H,cpp}`.
  Nine term types, each in its own block with its equation written above
  it and its five analytic derivatives hand-derived (no finite difference
  anywhere): ideal `ln(delta)`, `lead` (a1 + a2 tau), `logTau`, `power`,
  `planckEinstein`; residual `power`, `exponential`, `gaussian` and
  `nonAnalytic` (the critical-region terms of IAPWS-95, with the release's
  Table 5 derivatives).
* **The fluid** -- `ReferenceFluid.{H,cpp}`: the record reader, the
  property relations of R6-95 Table 3 (p, u, h, s, g, cv, cp, w, the
  fugacity coefficient), the density from (T, p) and the saturation.
* **The coefficients** -- records under
  `data/standards/parameters/Helmholtz/<equation>.dat`
  (`recordType helmholtzEquationOfState`), each carrying its primary
  citation, the URL it was read from and the date, the licence sentence of
  the publication, the reducing constants and gas constant, the validity
  window with the publication's own words on extrapolation, its stated
  uncertainty, and the publication's own CHECK VALUES.  Case-local
  `constant/parameters/Helmholtz/` wins through `records::resolveRequired`;
  a sealed case without the record is refused by name.

## 2. The two root searches, stated

* **Density from (T, p).**  Below T_c the isotherm has a vapour branch
  (0, delta_V] and a liquid branch [delta_L, ...), each monotone, found from
  the SPINODALS (the first maximum and the last minimum of p along the
  isotherm).  Between the spinodals a multiparameter equation is not fitted
  to anything and may oscillate through enormous pressures: IAPWS-95 at
  275-300 K swings through +-1e25 Pa there (terms with tau^50).  Crossings
  in that stretch are COUNTED and printed, never returned as roots.  Each
  branch root is a safeguarded Newton inside its bracket.  The stable branch
  is the one psat(T) names; a `branch` declaration takes the other one, said
  as metastable.  Above T_c the isotherm is scanned and every crossing
  refined; the lowest Gibbs energy among the mechanically stable ones is
  taken.  No silent choice: the props op lists every root.
* **Saturation at T** -- the Maxwell criterion (equal p, equal g), a
  safeguarded Newton on p with the Gibbs-Duhem slope 1/rho_L - 1/rho_V,
  inside the bracket the spinodals give.  NO ancillary equation is used, not
  even as a seed: the spinodals bracket the answer.  At T = T_c the curve
  ends at the equation's own critical state.

Two numerical facts were paid for and are written at their sites:
`g (g - 1)` in the exponential term's second derivative is formed as
`g ((d - 1) - c delta^c)` because at delta = 1e-10 the naive form cancels
every digit of c delta^c (it moved C(600 K) in its 8th digit), and the
virial limits are taken at delta = 1e-14, where C is converged to 12 digits
(at 1e-10 it is not, in the 9th).

## 3. Verification

`ReferenceFluid::read` evaluates EVERY check value of the record and refuses
the record on one miss, the rule being half a unit in the last digit the
publication prints.  For IAPWS-95 (R6-95(2018), read from
https://iapws.org/technical-guidance/release/IAPWS-95.download on
2026-11-12; Tables 1 and 2 extracted from the PDF text layer by a parser,
not typed): Table 6 (12 values), Table 7 (44), Table 8 (21), the virial
footnote of Table 3 (B and C at 600 K), the triple-point pressure and h' at
the triple point -- **81 of 81 reproduced**, worst relative deviation
5.0e-7 (h' at the triple point, printed to six digits; every nine-digit
value agrees to better than half a unit in its ninth digit).

`bin/curate/check_reference_eos.py` carries its own implementation (its own
dict reader, term derivatives written through the chain rule rather than
copied, its own spinodal walk and a plain bisection in ln p for the
saturation) and reproduces the same 81 values; it also runs the witness
`tutorials/props/thermo/refEoS01_iapws95_verification` and holds the five
CSV states the engine writes to its recomputation at 1e-9.

Sabotages by hand, 2026-11-12:

* S1, a coefficient: IAPWS95 n_10 changed in its 5th digit -- the engine
  refuses the record (exit 1) and the independent arm fails 48 of 81 values.
  The same coefficient changed in its 14th (last) digit moved no check value
  at all: the published check values carry nine digits and cannot see a
  change of 1e-17 in a term; the record's digits are the release's, read by
  a parser, and that is the only defence for the trailing ones.
* S2, a derivative: the exponential term's a_dd without its -c^2 delta^c
  part -- the engine refuses (Table 6 ar_dd 0.9068 against 0.856063701);
  the independent arm still passes, so the failing arm names the engine.

## 4. How it is reached

* **choupoProps, `referenceEoS`** -- `state { T; p | rho; [branch]; }` or
  `saturation { T; }`; announces the equation, its primary, its window, its
  uncertainty and the check values; at verbosity 3 lists each check value
  and the term-by-term contributions to alpha (the glass box).
* **A flowsheet, through the PureFluidModel factory** --
  `pureFluids { water { method Helmholtz; equation IAPWS95; } }`.  The
  PureFluidModel base (thermo/pureFluid/PureFluidModel.H) is where its own
  header puts "a single self-contained fundamental equation tied to its own
  datum"; the EquationOfState base prices DEPARTURES of a mixture from the
  ideal gas, and a reference equation carries its own ideal-gas part, so it
  was not registered there.  No ThermoPackage or Component change was
  needed.  Measured on a copy of `rankine02_water` with the record mirrored
  into its sealed `constant/`: it runs, and every KPI agrees with the IF97
  run to about 1e-4 relative (boiler duty 47.860 against 47.856 kW,
  condenser pressure 858.82 against 858.59 kPa) -- the size of IF97's own
  departure from IAPWS-95.  It took 2.9 s against 0.03 s: every (T, p) query
  solves a density (and, for a new T, a saturation) from scratch.

## 5. What is NOT done

* **Fluids other than water.**  CO2 (Span & Wagner, J. Phys. Chem. Ref. Data
  25 (1996) 1509) IS readable: NIST serves the article at
  https://srd.nist.gov/JPCRD/jpcrd516.pdf, but as an 88-page SCANNED image
  with no text layer, so its 42 residual terms, ideal part and check values
  must be transcribed from page images and read back against the paper's
  own tables -- not done in this slice, nothing shipped.  N2 (Span et al.
  2000), H2 (Leachman et al. 2009), NH3 (Gao et al. 2020) and CH4
  (Setzmann & Wagner 1991) were not located in a readable primary today;
  nothing shipped for them.  No permissively licensed library's fluid file
  was used, as origin or as cross-check.
* **Mixtures** (GERG-2008) -- its own slice.
* **Phase equilibrium of a mixture inside the flowsheet** -- the
  PureFluidModel route serves a phase EFFECTIVELY PURE in one component
  (x >= 0.999), as IF97 does.
* **Transport properties** (viscosity, conductivity): a reference equation
  of state is thermodynamics only; the base refuses mu/lambda/sigma by name.
* **Speed in a flowsheet**: no (T, p) -> rho cache beyond the saturation and
  spinodal caches per temperature.
* **The melting curve**: the validity window is reported as its published
  box; the release's lower bound is the melting-pressure curve, which the
  kernel does not evaluate (said in the announcement).
