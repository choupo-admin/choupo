# Basis-reconciliation spike — the two-unit chain (ratified 2026-08-03)

**Status: DESIGN (this document translates the ratified spike spec into
the concrete Choupo shape).  Implementation follows this record slice by
slice; MASS MIGRATION of the corpus is authorised ONLY after every gate
criterion below passes and at least one gate has been sabotage-verified.**

Authority chain: CLAUDE.md `[ROADMAP]` ("general basis reconciliation —
build via a vertical spike end-to-end through all layers BEFORE any mass
migration") + the ratified second-opinion round of 2026-08-03, item 7
(the two-unit chain, the minimal-not-coincidental case, the 10 criteria,
the named refusals, the identity second witness).

## 1. What the spike IS

One case, two units, one model boundary:

    apparent FEED
      → unit 1 (SPECIATING: an electrolyte flash that resolves the
        chemistry)
      → intermediate stream CARRYING BOTH BASES AS STATE (apparent
        components + the solved species decomposition, with origin)
      → unit 2 (a DIFFERENT thermo model via per-unit `thermo {}`,
        TRANSPORTING: it may change T/P/flow bookkeeping but must NOT
        silently re-run chemistry — the species state crosses the model
        boundary as matter, not as a question re-asked)
      → reports (element + charge conservation read ACROSS the chain).

Today the `speciation {}` block is REPORT-ONLY (SpeciationBlock.H: "the
state stays on the component basis; nothing reads it back").  The spike
promotes it, for exactly this chain, to CARRIED STATE with an `origin`
mark — while the apparent components remain the flowsheet state (the
TWO-BASES doctrine is not reopened: the spike adds carriage and
verification, not a new solver variable).

## 2. The witness chemistry (minimal, cannot pass by coincidence)

Per the ratified minimum: at least one neutral molecular volatile, one
cation, one anion, one aqueous molecular species in equilibrium, one
pass-through spectator.  Concretely:

    water          solvent
    NaCl           dissociating salt        → Na+, Cl-   (cation+anion)
    CO2            gas with aqueous network → CO2aq/HCO3- (equilibrium)
    ethanol        neutral molecular volatile (nonionising, classified)
    N2             pass-through spectator (aqueousSpeciation none)

Why not fewer: with only NaCl the charge balance closes by symmetry
(one cation, one anion, equal totals) and a sign error is invisible;
the CO2 network makes pH real; ethanol exercises the molecular backbone
across the boundary; N2 proves the spectator is carried untouched (its
row must be BIT-IDENTICAL across the chain).

Witness case: `tutorials/steady/electrolyte/basis01_two_unit_chain`
(unit 1 electrolyte flash; unit 2 heater under a per-unit molecular
`thermo {}` override).  The IDENTITY SECOND WITNESS (ratified): the
same case with unit 2 under the SAME global model — the carried species
state must be byte-identical to the first witness's intermediate stream
(carriage cannot depend on the boundary being interesting).

## 3. The ten gate criteria, concretely

 1. ELEMENT conservation: per-element closure across the chain,
    computed on BOTH bases independently (components via formula;
    species via the same `ElementComposition` parser) — they must agree
    with each other and close against the feed.
 2. CHARGE conservation: Σ z·n over the species state at every stream
    the package resolves; NO silent correction — an imbalance is a
    refusal (never renormalised).
 3. SINGLE AUTHORITY: the apparent components remain the solver state;
    the carried species block is verified `m = A n` against the
    declared bridges on EVERY read (the existing reader check), and
    nothing derived re-enters the solver.
 4. NO IMPLICIT RESPECIATION: unit 2 must not re-run chemistry.  The
    intermediate block carries `origin` (which unit solved it); after
    unit 2 the block's origin says TRANSPORTED-BY, and a unit that
    would need to respeciate (its model resolves ions differently)
    must either declare it or refuse — never silently overwrite.
 5. SERIALIZATION ROUND-TRIP: the stream file carries the block with
    ids/quantities/basis/network/origin/pH; write→read→write is
    byte-stable (0/ and converged/ both).
 6. DETERMINISM incl. container-order independence: two runs, and a
    run with the components declared in a different order, produce the
    same species rows (sorted-by-id serialization; values equal).
 7. GLASS-BOX TRACE: at verbosity ≥ 3 the chain prints, per boundary,
    what was carried, what was verified (m = A n, charge, elements)
    and what each unit did to the block (solved / transported).
 8. NEGATIVE TESTS — the named refusals (§4), each fired through the
    real reader/solver path.
 9. ZERO LATERAL IMPACT: a molecular case gains NOTHING (no empty
    speciation pretence — the existing doctrine), and the whole
    remaining corpus is byte-identical (the regression suite is the
    proof).
10. IDENTITY SECOND WITNESS: §2 — same chain, boundary removed,
    carried state identical.

## 4. The named refusals (negative battery)

 R1  charge-imbalanced species state in a stream file → refused naming
     the imbalance [kmol/s of charge], never corrected.
 R2  `m = A n` closure broken (species rows do not collapse onto the
     apparent material through the declared bridges) → refused (exists
     today in the reader; the spike keeps it firing on CARRIED state).
 R3  a species id no declared bridge answers to → refused by name.
 R4  a block with no `network`/`basis`/`origin` mark → refused (a
     decomposition that cannot say what it is, is not one).
 R5  unit 2's model boundary would CHANGE the resolved species set
     (speciation flip) → hard refusal at the boundary (the
     model-boundary audit rule already names this; the spike extends it
     to carried blocks).
 R6  element mismatch BETWEEN the two bases of one stream → refused
     (the writer/reader corollary: a writer whose output the reader
     refuses is a bug in both).
 R7  an EMPTY speciation block on a stream of a molecular-only case →
     refused (one basis is its whole structure — the pretence ban).

## 5. Slices (each ends green + committed)

 S1  Carriage: `origin` field on `ProcessStream::Speciation`;
     stream-file writer/reader round-trip incl. origin (criteria 5, 6
     partial; refusals R1–R4 at the reader).
 S2  The chain: witness case + unit-2 transport contract (criteria 1,
     2, 3, 4, 7; refusals R5–R7).
 S3  The gate: `check_basis_spike.py` — all ten criteria + the
     refusal battery, at least one sabotage-verified.  DEV.md/CLAUDE.md
     registration.  ONLY THEN may a mass-migration proposal be written
     (a separate decision, Vítor's).

## 6. Deliberately OUT (this spike)

Species-basis solver variables (the apparent basis stays the state);
any corpus migration; new grammar beyond the stream-file `speciation`
block's `origin` entry; batch/ctrl carriage (steady first, the pattern
generalises later).

## 7. Implementation notes (S1 done; the S2 seam, located)

S1 SHIPPED (commit 921ba8b9): `origin` on `ProcessStream::Speciation`,
reader stores a verified block back on the stream (carriage), writer
emits species rows in canonical sorted order (round-trip byte-stable,
container-order independent).

THE S2 SEAM.  The post-solve pass (`Flowsheet.cpp` ~3268, "Stream
SPECIATION (post-solve)") speciates every liquid stream lacking a block
using the GLOBAL package, guarded by `if (s.speciation) continue;`.
That guard is exactly where the transport contract lands:

* a unit that SOLVES chemistry (IsothermalFlash liquid outlet) stamps
  `origin = "solved:<unit>"`;
* a unit under a per-unit `thermo {}` override whose world does NOT
  resolve the case chemistry, whose inlet carries a block, and which
  preserves composition (heater/pump class: one material in, one out,
  z unchanged) attaches the INLET's block to its outlet with
  `origin = "transported:<unit>"` — because TODAY the post-solve pass
  would re-derive that outlet's block with the GLOBAL package, which is
  precisely the silent respeciation across a model boundary the spike
  names (the unit's own world is molecular; the block it outputs must
  be carried matter, not a question re-asked in a world the unit is not
  running);
* R5 fires when the override's world WOULD resolve a DIFFERENT species
  set (its own chemistry declaration) — refuse at the boundary, never
  overwrite;
* the post-solve `continue` guard then keeps transported blocks intact
  (already true — non-null skips).

Witness base: clone flash19's package (CO2/CaCO3/water/benzene/ethanol
— network equilibrium + Ca cation + carbonate anion + two molecular
volatiles, organic declared) and ADD the N2 pass-through spectator
(`aqueousSpeciation none`; its row and its apparent flow must be
bit-identical across the chain).  Chain: electrolyte flash →
heater with per-unit molecular `thermo {}` override → outlet; the
identity second witness is the same chain with the override removed.
