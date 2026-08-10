# Post-consolidation roadmap — sequencing, and the two items still ahead

> **KIND: SCOPE · STATUS: RECORDED 2026-08-10 (directive from Vítor).**
> Items 1, 2 and the sealing decision are ADRs of their own and are DECIDED;
> what follows is the sequence that binds them and the two items that are
> deliberately **roadmap, not sprint**.  Nothing here authorises
> implementation.

---

## 0. Positioning, because it decides what is worth building

CHOUPO's position is **reproducibility infrastructure for thermodynamic and
process calculation**, not "another open-source simulator".

> **The opponent is the black box in the Methods section, not DWSIM.**

That sentence is load-bearing for prioritisation: it is why provenance
outranks breadth, why an honest disagreement is an asset rather than an
embarrassment, and why showcases — including the electrolyte and brine
cases — **prove composition of the machinery and do not carry the
positioning.**

## 1. The sequence (non-negotiable)

```
provenance contract + data sealing   (fixed IN the properties consolidation)
        ↓
evidence taxonomy in choupoProps
        ↓
ThermoML pilot  (narrow)
        ↓
anchors with PRE-DECLARED accuracy envelopes
        ↓
reproducible permalinks
        ↓
showcases
```

Each arrow is a real dependency, not a preference. The two that are easiest
to get wrong: the provenance contract must be fixed **during** the
consolidation because retrofitting it across five phase families,
electrolytes, reactions and the activity models costs several times what
stating it once costs; and permalinks are last because a permalink that
seals an unprovenanced result over an untagged catalogue promises something
it cannot deliver.

**Decided already** (see the ADRs): `numerical-provenance-contract.md`,
`property-evidence-taxonomy.md`, `reproducible-permalink-sealing.md`.

## 2. ThermoML → evidence pipeline (ROADMAP)

**Explicitly NOT a bulk import.** The pilot is pure-component properties and
binary VLE/LLE over **10–20 chosen systems**.

Pipeline: discover datasets → **split fit / held-out** → fit
NRTL/Wilson/UNIQUAC → predict the held-out set → publish the comparison
(validation AAD per model) → full provenance preserved throughout.

**The mandatory rule, and the reason this depends on the evidence
taxonomy:**

> The same dataset must never serve as both fitting evidence and
> independent validation — and that distinction must be **machine-enforced,
> not conventional**.

Convention fails silently here: nobody notices a model validated against
its own training data, and the resulting AAD looks excellent. The taxonomy
makes it detectable because a `fitted` parameter records the dataset it was
fitted against, so a validation run can refuse a dataset that appears in its
own parameters' provenance.

## 3. Executable scientific anchors (ROADMAP; mechanism partly built)

Each anchor states, as data rather than prose:

```
primary source · exact datum · CHOUPO result · deviation
              · experimental uncertainty · model used · assessment
```

**Assessment taxonomy:** `AGREES` · `MODEL-LIMITED` · `DATA-LIMITED` ·
`UNEXPLAINED-DISAGREEMENT`.

**The anti-rationalisation rule** — the part that makes the taxonomy worth
anything:

> `MODEL-LIMITED` is valid ONLY if the model's expected accuracy envelope
> was **pre-declared** (documented per model class, with its source, before
> the anchor runs).  A post-hoc explanation is not `MODEL-LIMITED`; it is
> `UNEXPLAINED` until the envelope is declared.

Without it, "model-limited" becomes the universal excuse and the taxonomy
degenerates into a way of passing. With it, the project must state in
advance what each model class is expected to achieve — which is the
falsifiable claim.

`UNEXPLAINED-DISAGREEMENT` is a **CI gate failure**. Honest disagreements
(Davies vs Pitzer vs experiment is the live example — `davies01_band_edge`
measures exactly that) are **kept and diagnosed, never hidden**.

**Partly built already:** the `anchor` golden row (2026-08-10) carries a
published value that `--record` may never refresh, and fails naming the
cited number. What it does NOT yet carry: uncertainty, the assessment tag,
or the pre-declared envelope. Those are this item's work, not a retrofit of
the row's meaning.

## 4. Showcases (LAST)

Few, and brutal. They demonstrate that independently validated pieces stay
correct **when composed**. They are evidence about the machinery — they do
not carry the positioning, and adding more of them does not substitute for
any item above.

## 5. What this record does not do

It authorises nothing. Items 3 and 4 are roadmap; item 5's surface is
roadmap. The three ADRs decide contracts that bind work already in flight,
and that is the whole of the current obligation.
