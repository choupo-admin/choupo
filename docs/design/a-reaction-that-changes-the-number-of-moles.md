# A reaction that changes the number of moles is carried by the full MESH, with the heat of reaction already in the datum

*Commission C231 (DEV.md 4c), decided 2026-11-06 by the architect ("faz o que
for preciso ... de forma elegante").  Kind: ADR.  Status: SHIPPED (a stated
default; nothing in it is validated against a measurement). 

## 1. What was asked, and what was measured first

Vítor's reference case is a rigorous reactive column: 15 equilibrium stages,
a partial condenser, reactive stages 6-10, methanol + isobutene -> MTBE.  The
reaction has Σν = -1.  `DistillationColumn` REFUSED it twice over: `model
simultaneous` holds the internal flows constant (constant molal overflow), so a
mole change has nowhere to go, and `model fullMESH` was refused over any
`reaction {}` since C169 because its rows carried no extent.  Measured, not
supposed: the extent machinery lives in the CMO MESH (`extentOf`, the
homotopy on `lnOffset`); the variable flows and the energy rows live in the
full MESH (`residualF`); C169 refused to join them.

## 2. The decision

The column gains no new solver: **the full MESH gains the extents.**

* One unknown per reactive stage, appended to the unknown vector.  Component
  rows `-= nu_i xi_j`; the stage TOTAL rows `-= Σν xi_j` (the whole of the
  mole change); the equilibrium row is the CMO's, `Σ nu_i ln(gamma_i x_i) -
  ln K_a(T_j)`.
* **No heat-of-reaction term.**  The stage energy rows price on the elements
  (formation) datum -- `H_stream_formation` -- which already holds `Σ nu_i
  h_f,i`.  Adding a term would count the heat twice (sabotage S2 of the gate
  does exactly that).  The price of this elegance is a precondition, checked
  and refused by name: every reacting species needs its formation datum, or
  the sensible-datum fallback would delete the reaction heat in silence.
* **K_a(T) has ONE home, `lnKaAt`**, and four spellings: `Ka`, `Ka298` +
  `dHrxn` (the esterification columns, byte-identical), `lnKa "<formula>"`
  through `core/Formula` (the C67 rule: a law written in the case, parsed once,
  dimension-checked, with a declared validity range whose crossing is
  announced), and `fromRecords true;` -- ln K_a(T) = -Σ nu_i [g_ig,i(T)/RT +
  ln(Psat_i(T)/P0)] from the very records that price the energy rows, so a
  column cannot carry one heat of reaction in its K and another in its energy
  balance.  `fromRecords` announces every ESTIMATED datum it consumes.
* **Specifications.**  With a mole change D is no longer F - B.  The pair
  (`bottomsRate`, `boilupRatio`) makes D an unknown closed by stage 1's total
  balance; (`refluxRatio`, `distillateRate`) keep their rows with B = F + Σν
  Σξ - D - draws.  Any mixture of the two pairs, or the first pair with a
  total condenser or a model other than `fullMESH`, refuses by name.
* **Seed and homotopy, announced.**  The NON-reactive CMO seeds the
  non-reactive full MESH, which seeds the reactive one by the existing
  quotient-floor + K_a continuation.  Nothing is hidden: the steps are printed.

## 3. Alternatives rejected

* *A heat-of-reaction term in the energy rows* (the usual textbook form): it
  needs a second source of the heat of reaction, which is the arity sin; on the
  elements datum it is double counting.
* *A new reactive solver beside the CMO and the full MESH*: three solvers for
  one MESH.
* *A conversion fixed by the case* (the earlier approximation): shows the
  separation and none of the intensification.
* *K_a taken from the reference simulator's results*: forbidden by the
  commission; a value is never read off a result.
* *The kinetic form under the full MESH*: refused by name rather than half
  wired; its rate x catalyst-mass extent and its own continuation live in the
  CMO MESH.

## 4. What the witness shows, and what it does not

`tutorials/steady/distillation/column19_mtbe_reactive_mesh`.  K_a(T) is the
paper's Eq. 15 (Izquierdo et al. 1992, dH = -39100 J/mol, dS = -85.3 J/(mol K),
measured over 313-353 K; the reactive stages run above that, announced); its 21
runs are in the case and the gate recomputes the 4.6 % AAD.  Eq. 14 and Eq. 16
of that paper are NOT used: printed with a rounded constant they sit about 7
times below the paper's own Table IV.  The isobutene formation enthalpy is a
case-local overlay from a measured heat of combustion (Prosen, Maron & Rossini
1951); the catalogue's value is a Joback estimate, and `fromRecords` on it is a
finding the gate prints.  **Nothing here is validated against a measured MTBE
column.**  Gate: `check_reactive_mesh`.
