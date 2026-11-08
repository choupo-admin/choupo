# A rate law written in the case is carried by the full MESH, its extent computed per stage

*Commission C233 (DEV.md 4c), decided 2026-11-06 by the architect.  Kind: ADR.
Status: SHIPPED (a stated default; the witness is not validated against a
measurement).*

## 1. What was asked, and what was measured first

C231 gave the full MESH an equilibrium extent per reactive stage and refused
`kinetics {}` there by name.  Without a rate-limited form the MTBE column cannot
be held against a pilot column.  The CMO MESH already had a kinetic mode (extent
= rate x catalyst mass, a continuation in the mass); the full MESH takes the same
extent through the same rows.  The law to hold it against, Rehfinger & Hoffmann
(Chem. Eng. Sci. 45 (1990) 1605), does NOT fit the native `rateAt`: forward
order -1 in methanol and a reverse leg in a_MeOH^-2.

## 2. The decision

* **The law is read by the reaction factory.**  `reaction { kinetics { model
  expression; catalystMass <kg>; ... } }`: the column removes its own two keys
  (`model`, `catalystMass`) from a copy of the block and hands the rest to
  `ReactionRate::New` as `type expression` (DEV.md C67: the numbers live in the
  case).  The native words `pseudoHomogeneous` and `adsorption` are untouched.
* **`a[i]` joins the state a law may read.**  `RateState` carries the activities
  and `RateOffer::activities` says who supplies them; only the column does.  A
  cstr/pfr/batch/dynamic law that reads `a[i]` refuses by name.  The activity is
  the PACKAGE's gamma_i x_i at the stage's own T and x, not a model of the law.
* **The extent is computed, not an unknown.**  xi_j = r(T_j, x_j, gamma_j) m_cat,j
  on each reactive stage, catalyst spread equally (as the CMO does); the rows are
  the C231 rows (component `-nu_i xi`, total `-Sum(nu) xi`) and still carry NO
  heat term (the energy rows price on the elements datum).  The unknown vector is
  the equilibrium form's without the extents.
* **The mass enters by an announced continuation** on s in (0, 1] (0.01, then x3
  while the Newton converges, bisected when it does not, floor 1e-4); the column
  is NOT converged unless s = 1 is reached.  The seed is the announced
  non-reactive full MESH.
* **The pole is the law's, not the engine's.**  The Rehfinger law diverges as
  a_MeOH -> 0.  No floor is hidden: a trial where the law has no value is an
  `InfeasibleTrial`, announced once after the search, and the Newton shortens its
  step; a floor, if a case wants one, is written in its law with `max(...)`.
* `model simultaneous` still refuses Sum nu != 0, naming `fullMESH`.

## 3. Alternatives rejected

* *Extending `rateAt` with a signed order and a reverse a^-2*: it hard-codes one
  paper's form into `src/`, which the C67 rule forbids.
* *A floor on a_MeOH in the engine*: an invisible crutch; the answer would depend
  on a number nobody declared.
* *The extent as an unknown with a rate-balance row*: more unknowns, no gain; the
  rate is an explicit function of the stage state.

## 4. What the witness shows, and what it does not

`column20_mtbe_kinetic_mesh`: column19's problem with Rehfinger & Hoffmann's law
(Eq. 12 rate, Eq. 15 k, Eq. 6 K_a, K_a(298.15) = 300.5 of Table 4 -- the value k
and E were fitted with; Eq. 6 with 284 is the better thermodynamics, 5.8 % lower).
The catalyst mass (220 kg) is ILLUSTRATIVE.  MEASURED: the reactive stages run
methanol-lean (x_MeOH 0.05-0.18, below the 0.3 the paper says its model
under-predicts), the methanol conversion is about 9 %, and the mass continuation
converges up to about 270 kg and stops near 300 kg.  Activities there are UNIQUAC,
here UNIFAC.  No effectiveness factor.  **The proof of the machinery is a limit**
(`check_kinetic_mesh` (a)): a mass-action law on column19's own K_a converges on
column19's equilibrium as the mass grows (conversion 27.8, 72.3, 96.5, 99.2 % at
100, 1e3, 1e4, 1e6 kg against 99.2 %).  Nothing here is validated against a
measured MTBE column.  Gate: `check_kinetic_mesh`.
