# The electrolyte authoring seams — scope (F3 of the LLM benchmark)

**Status: the authorised slices are BUILT (S1+S2 2026-08-23, S4+S6 the
same night — S4's reproduction found the better truth: not an echoing
diagnostic but a DUPLICATED species row, the declared master's phantom
inventory beside the network's solved value; the collision now refuses
with both remedies and the round-5 pin message names the master).
S3 and S5 [ARCHITECT] await Vítor.  The success criterion (a fresh-agent
re-run of benchmark case D) is measured below.**  Evidence:
[`llm-authoring-benchmark-2026-08-23.md`](llm-authoring-benchmark-2026-08-23.md)
case D — eight rounds to author a NaCl-brine-open-to-CO₂ speciation, with
every round powered by an error message because the kit could not carry it.

The finding that frames this scope: **the engine refused the kit's own
example.**  That is not a documentation hole; it is the declared grammar and
the served grammar having drifted apart — the patch-pile signature Gall's
rollback rule is about.  The treatment is to make them one thing again,
seam by seam, each seam its own slice.

## The seams, in fix order

**S1 (doc, authorised) — a worked speciate case in the kit.**  The
propsDict + thermoPhysPropDict PAIR for exactly case D's system (NaCl brine,
open CO₂, `pitzerHMW`), transcribed from a run that works, with every
required key present and each annotated.  This alone would have cut D's
eight rounds to ~2.

**S2 (doc, authorised) — the undocumented required keys.**  `volatiles (…)`
(equilibrium-level; which dict root, what belongs in it); `pH` marked
REQUIRED in the speciate schema (it is; the schema says optional);
the open-system protocol: every `atmosphere` gas needs its dissolved
species in `totals` as an initial guess, and a family's network activates
only when its MASTER is in the feed — the reachability announcement
("N unreachable from this feed") explained where the grammar is taught.

**S3 (data, curation — [ARCHITECT to review as INTERIM])** —
`species/CO2aq.dat` for the standards catalogue: the open-CO₂ path requires
it and the catalogue ships only the chemistry record.  The benchmark agent
authored a case-local one from NBS/Wagman with primary citations; promoting
it (or a curated equivalent) is a curation act and lands INTERIM for
review like every new record.

**S4 (engine, small — authorised as a truth-surface bug)** — the
`m_CO2aq` DIAGNOSTIC echoes the authored initial guess while the CSV holds
the solved pinned value.  Two numbers, one name, different answers by
surface: the diag must publish the solved row, same as the CSV.  One fix,
one golden check.

**S5 (grammar — [ARCHITECT]) — the seam itself.**  The kit's
`electrolyteGammaPhi` example declares `activityModel { model Pitzer; }`;
a reactive (CO₂-bearing) system REFUSES it ("the REACTIVE
electrolyteGammaPhi slice serves ionic davies").  Options, stated for a
ruling rather than decided here:

  (a) **Teach the split** — the kit documents that a reactive
      electrolyteGammaPhi is davies-only today and shows both shapes.
      Cheapest; leaves the seam, documented.  (This much is doc work and
      will be done under S2 regardless.)
  (b) **Close the seam** — let the reactive slice serve the Pitzer rung
      (the engines exist; the speciate op already runs `pitzerHMW`), so the
      declared grammar and the served grammar coincide.  Real engine work;
      touches the reactive builder's model routing; needs its own witness
      battery.
  (c) **Narrow the grammar** — make the non-reactive example refuse too,
      so one shape serves everywhere.  Rejected here in draft: it removes a
      working capability to buy consistency, which is backwards.

  Recommendation: (a) now (it rides S2), (b) as the named next engine
  slice when the sour-water programme's S4 (H₂S) forces the same routing
  question anyway.  Decision requested.

**S6 (catalogue view, authorised)** — the generated inventory learns the
parameter-pair homes it omits: SRK/PR kij pairs (E could not know what may
be declared), and validity windows (Trange) beside the per-component
property ticks (A ran benzene 16 K outside its Antoine fit and only the
run's advisory said so).

## What is deliberately NOT in scope

No new grammar, no new tier, no meta-machinery.  Every slice above either
moves existing truth to where its reader is (S1, S2, S6), fixes a surface
that lies (S4), curates one record (S3), or asks the architect the one
question the seam poses (S5).  The benchmark re-runs (same protocol, fresh
agents) after S1+S2 land — the measured round-count for case D is the
success criterion, not anyone's impression.

## The measured result (2026-08-23, same night)

A fresh agent, the regenerated kit, the identical request: **GREEN in ONE
round** against the first run's eight.  The agent transcribed Pattern 14
nearly verbatim, reproduced all four stated check numbers exactly
(γ±(NaCl) 0.681, pH 5.584, I 0.500, m_CO2aq 1.257e-5 — the SOLVED value,
post-S4), and reported three residual gaps, all closed the same night:
the `modelSpecies` record shown in full, the `#`-comment inconsistency
(203 `#` comments across the kit's own examples converted to `//`, and
the Comments section now says `#` is not a comment character), and the
no-`0/`-for-props sentence.  S3 and S5 remain the architect's.
