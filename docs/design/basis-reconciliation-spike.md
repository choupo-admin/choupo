# Basis-reconciliation spike — the two-unit chain (ratified 2026-08-03)

**Status: SPIKE COMPLETE 2026-08-03 (S1 + S2 + S3 built, gate
sabotage-verified twice).  MASS MIGRATION REMAINS UNAUTHORISED — it is a
separate decision, Vítor's, and §8 states what the spike learned that a
migration proposal must answer first.**

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

AS BUILT (the sour-water system — this paragraph was rewritten to the
chemistry that shipped; the first draft proposed NaCl and could not
work, for the reason stated below):

    water          solvent
    NH3            the CATION route  → NH4+   (its declared bridge)
    CO2            the ANION route   → HCO3-/CO3--, and the AQUEOUS
                   MOLECULAR species CO2aq, in equilibrium
    ethanol        nonionising CONDENSABLE → Raoult backbone, NO row
    N2             nonionising NONCONDENSABLE → Henry rung, a NEUTRAL row

**Why a dissolving SALT could not fill the ionic roles.**  The first
draft used NaCl (or CaCO3).  A dissolved salt is nonvolatile and has no
route through the ideal-gas reference, so the downstream molecular world
cannot price its enthalpy at all — the engine refuses, correctly, and
there is no chain left to witness.  Carrying the ionic roles on
MOLECULAR components (NH3, CO2) keeps the boundary crossable while still
putting a genuine cation and a genuine anion in the block.

Why not fewer components: cation and anion come from DIFFERENT
components in DIFFERENT amounts, so Σ z·n is a real test rather than a
symmetry; the carbonate+ammonia networks make the pH solved rather than
constant; and the two nonionising components differ from each other by
reference rung, which is what makes `aqueousSpeciation none` legible as
a statement about charge and not about presence.

Witness case: `tutorials/steady/thermo/basis01_two_unit_chain` (unit 1
electrolyte flash; unit 2 heater under a per-unit molecular `thermo {}`
override).

THE IDENTITY SECOND WITNESS, as built.  The ratified wording asked for
"the same case with unit 2 under the same global model" and for the
carried state to be identical.  Measured, the OUTLET is NOT identical
and should not be: with no boundary the global world CAN re-solve the
chemistry at the outlet temperature, and does.  The invariant that
actually holds — and the one the gate asserts — is that the
INTERMEDIATE stream is unchanged: what unit 2 is cannot reach back and
change what unit 1 solved.  The differing outlet is the boundary being
visible, not a failure.

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

---

## 8. BUILT (2026-08-03) — what the spike settled, and what it exposed

**Shipped.**  S1 carriage (`origin` on the block, the reader STORES a
verified block instead of only checking it, species rows written in
canonical sorted order — commit 921ba8b9).  S2a the unit seam
(`solved:<unit>` stamping; the transport contract for a
composition-preserving unit whose local world resolves no chemistry —
fbedeca3).  S2b the witness chain + `solvedT` (712c5376).  S3 the gate
`bin/curate/check_basis_spike.py`, wired into runTests.

**The witness.**  `tutorials/steady/thermo/basis01_two_unit_chain`:
sour water (NH3 / CO2 / water / ethanol / N2), an electrolyte flash that
SOLVES, a heater under a molecular `thermo {}` override that TRANSPORTS.
Charge closes at 6.5e-11 kmol/h on both ends; the rows are bit-identical
across the boundary.

**Three things the spike exposed that were not in the ratified list.**

1. **A carried equilibrium must say what state it was solved at.**  The
   heater's outlet is at 332.23 K carrying a block solved at 313.15 K.
   `origin "transported:…"` says it was carried but not from where, so
   the two temperatures sat on one file with nothing marking that they
   disagree.  `Speciation::solvedT` → `solvedAtT` on the file.
2. **`aqueousSpeciation none` is a statement about CHARGE, not presence.**
   Ethanol (condensable, Raoult backbone) gets no species row; N2
   (permanent gas, Henry rung) gets a neutral one.  The witness carries
   both so the distinction is visible rather than explained.
3. **The importer and the runtime read different declarations.**  A
   mineral-bearing component's ion bridge lives in its own
   `solidPhases.*.dissolutionReaction.masters` — where the runtime looks
   — while `bin/choupo-import` looked only at
   `aqueousSpeciation`/`aqueousMapping`.  flash19, a shipped and passing
   tutorial, could not be re-sealed from scratch.  Fixed; the
   from-scratch closure now matches its shipped manifest record for
   record.

**The refusal battery, measured rather than assumed.**  R2 (broken
`m = A n`) refuses by name.  R4 (a block declaring no `network` or no
`basis`) refuses by name — BUILT with the gate; it did not refuse
before.  R1 (charge imbalance) and R3 (an unknown species id) DO refuse,
but through the collapse net, not by their own name.  **Named gap:**
naming them needs the species-charge surface at the reader
(`SpeciationSolver::chargeOf` is not on the reader's side today), which
is a dependency and not a line — deliberately not smuggled in here.
R5 (a boundary that would CHANGE the resolved species set) is NOT built:
the transport contract fires only where the local world resolves
*nothing*, so the case R5 governs cannot arise yet; building the refusal
before the situation exists would be a guard over an empty road.

**What a mass-migration proposal must answer first** (open, for Vítor):
(a) is carrying an upstream equilibrium across a boundary the right
default for every unit class, or only for composition-preserving ones —
a splitter divides matter and the block would have to divide with it;
(b) should the post-solve reporting pass stamp an origin of its own
rather than leaving it blank; (c) R1/R3 naming, per the gap above.

---

## 9. AMENDED 2026-08-03 (counsel) — the equilibrium claim does not travel

§8 recorded `solvedT` as the fix for a block carried to a temperature it
was not solved at.  A second opinion rejected that as sufficient, and it
was right:

> An equilibrium is not a composition.  It is a RELATION between a
> composition and a thermodynamic state.  A composition solved at 313 K
> does not become the equilibrium composition at 332 K by being carried
> there with a note saying where it came from.  Stamping the provenance
> makes the datum traceable; it does not make it valid.

The defect was live, not theoretical: `converged/warmBrine` published
`pH 8.830137823` — solved at 313.15 K — beside `T 332.2309713 K`, as if it
were the pH of that stream.

**As amended.**  The two claims are separated and only one travels.  The
AMOUNTS are a material inventory and stand (the transport conserved every
species exactly).  The EQUILIBRIUM is a claim about a state, and it dies
when the state moves: the block carries `equilibriumValidHere false`, both
temperatures, and NO pH — withheld, never inherited.  Every other
equilibrium-derived quantity (activities, saturation indices, conditional
constants) falls under the same rule as it is added.

**Staleness is DECIDED, not assumed.**  The block goes stale because a
state variable the equilibrium depends on actually moved — T or P compared
against `solvedT`/`solvedP`.  A pump carrying the same brine at constant T
and P across the same model boundary leaves the equilibrium intact and its
pH reported.  The boundary alone invalidates nothing; the change of state
does.  (This is the counsel's own invalidation policy, applied precisely
rather than as a blanket rule for "anything transported".)

Gate: `check_basis_spike` C4b — the transported block must declare itself
invalid and must NOT publish a pH, the SOLVED block must still publish
one (so the invalidation cannot fire where the state did not move), and
the withholding must be announced.  Sabotage-verified: inheriting the
claim fails two probes by name.

Decision 3 of `open-decisions-2026-08-03.md` is unaffected; decisions 1 and
4 are superseded by that document's own amendment (see its §Resolution).
