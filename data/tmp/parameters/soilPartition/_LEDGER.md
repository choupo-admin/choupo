# `parameters/soilPartition/` — organic-carbon partition records

PRIVATE tier (`data/tmp/`, gitignored). Created **2026-07-24** by
`agent:henry` (phase 4). Envelope: [`../../RECORD_SPEC.md`](../../RECORD_SPEC.md).

## The one record

| solute | sorbent | property | value | source | status |
|---|---|---|---|---|---|
| PFBS | unspecified soil organic carbon | `logKoc` | **1.2 – 2.7** (a range) | ITRC PFAS guidance | `flagged` |

Moved verbatim from
[`../../components/_CLEANUP_hormones_pfas_volatiles.md`](../../components/_CLEANUP_hormones_pfas_volatiles.md)
section 2 ("awaiting a home"). Still a **range**; it has **not** been collapsed
to a midpoint, following the `TfusRange` / `fusionData { determinations }`
convention the component cleanup introduced.

## Why a new family, and not `parameters/partition/`

The task allowed either `parameters/partition/` with
`recordType organicCarbonPartition`, or a family of its own. **Its own family
was chosen**, for four reasons:

1. **The partition family already ruled it out, explicitly and in writing.**
   [`../partition/_LEDGER.md`](../partition/_LEDGER.md), "Deliberately NOT
   emitted", last row: *"logKoc (PFBS 1.2-2.7) — **Organic-carbon** partition —
   a different system (soil organic matter, not octanol). Out of this family's
   scope; belongs in its own record type if ever needed."* Filing it there now
   would either contradict a sibling ledger or force an edit to a family this
   pass does not own. The ledger already told us where it goes.

2. **The second phase is not a substance.** Every record in `partition/` names
   two *defined* phases — 1-octanol and water — so the coefficient is a property
   of a chemical system. "Soil organic carbon" is an operational normalisation
   over a heterogeneous, sample-specific natural material. Choupo's data
   doctrine already treats sample-specific solid behaviour as belonging with the
   *sample*, not with the compound (`feedback_solid_data_sample_specific`), and
   `Koc` is precisely that: a number whose second participant changes with every
   soil. Mixing it into the octanol-water family would make that family's
   `participants ( <solute> octanol water )` invariant untrue.

3. **The quantity is not the same kind of thing.** `logKow` records in
   `partition/` are single values with a stated chemical form; this is a range,
   with no temperature, no pH and no stated sorbent. Grouping them invites the
   exact substitution error the record guards against.

4. **Nothing in the engine consumes it.** There is no soil phase and no unit
   operation that reads a `Koc`. Keeping it in a clearly separate, clearly
   labelled family makes that visible instead of letting it sit among
   descriptors that *are* headed for use.

## Why it was kept at all

PFBS's component file reduced to **identity only** in phase 3 (everything
staged for it turned out to be potassium-salt data). This range is the only
mobility descriptor staged for the compound. Deleting it would have destroyed
the citation without gaining anything; recording it in its own family, flagged,
with an explicit "the engine does not consume this" block, loses nothing and
claims nothing.

## Promotion verdict

**Not promotable, and probably never promotable as a process property.**

- it is a range, not a value;
- no primary, no temperature, no pH, no stated sorbent;
- `Koc` presumes hydrophobic partitioning into organic matter, which is exactly
  what an anionic perfluoroalkyl sulfonate does **not** do — the same objection
  that made the partition family refuse to write a `logKow` for PFBS at all;
- the ITRC licence terms have **not** been verified for redistribution (ITRC
  guidance is published for free public use, but that is not the same as a
  grant). Verify before any promotion — flagged in the record's `licence` field
  and in [`../../_LEGAL_SWEEP.md`](../../_LEGAL_SWEEP.md) as an unverified,
  not-excluded source.

If a future adsorption or soil-transport capability ever needs it, the correct
act is to curate a **measured isotherm on a named sorbent**
(`data/standards/assets/`, `kind adsorbent`), not to promote this number.
