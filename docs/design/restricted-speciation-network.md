# Where does a case say its speciation network is deliberately smaller?

*Design record, 2026-08-02.  Proposal — not built.  Raised by the payment of
DEV.md debt #3, which retired two of the three `constant/electrolyte/` sidecar
legs and could not retire the third.*

---

## 1. The thing that has no home

`tutorials/props/electrolyte/pitzer_seawater_verify` runs on **one** reaction:
water self-ionisation.  The curated catalogue offers it eleven more that its
feed can reach — `CaSO4aq`, `MgSO4aq`, `NaSO4`, `KSO4`, `HSO4`, `CaHSO4`,
`MgOH`, `CaOH`, `HClaq`, `MgSO4_2`, `Na2SO4aq` — and admitting any of them
would make the case **wrong**, not merely different.  The Harvie-Møller-Weare
θ/ψ parameters were fitted to a **non-pairing** major-ion treatment: all the
specific sulfate non-ideality lives in the Pitzer virial and ternary terms.
Solve the pairing reactions *and* apply those terms and the SO₄ interaction is
counted twice, so the computed γ's stop being comparable to the published
seawater Pitzer values — which is the entire purpose of the case.

So the restriction is physics, and the case has to be able to state it.

Today it states it in `constant/electrolyte/speciation.dat` with
`speciationMode replace;` — a file that also has to **restate inline** the one
reaction it keeps, duplicating a curated record.

## 2. Why the per-file merge cannot say it

`records::scanRecordDir` (src/thermo/RecordResolver.H) merges the case's
`constant/chemistry/` over the catalogue **by filename**: a case-local record
*shadows* the catalogue record of the same name, case-only records are
appended.  Shadowing can **change** a record.  It cannot **remove** one, and
there is no empty-file convention — nor should there be (see §5, alternative 4).

## 3. Why "just don't mirror the record" is not a fix

The tempting answer for a sealed case: `sealed true;` makes the runtime read
*only* `constant/chemistry/`, so shipping one record there gives a one-reaction
network with no declaration at all.

It fails on the next `bin/choupo-import`.  That importer's closure is
`reachable_speciation_closure` — a fixed point over the catalogue network
seeded by the case's ions — so it re-installs every reaction the feed can
reach, including all eleven.  The re-import would **silently un-restrict the
physics**, and the failure mode is the worst kind available: a wrong answer
with a green suite and an intact seal.

The restriction has to be something the importer can *read*, not something it
can only fail to notice.

## 4. Proposal (D-R1): the case declares the admitted set

In the block the case already carries:

```
equilibrium
{
    aqueous
    {
        speciation
        {
            networkScope  restricted;              // default: full
            network       ( water-dissociation );  // the admitted records, by name
            reason        "HMW theta/psi were fitted to a NON-pairing major-ion
                           treatment; admitting the sulfate ion pairs would
                           double-count what the ternary terms already carry.";
        }
    }
}
```

Rules, each of which exists because its absence produces a wrong answer:

1. `networkScope` is `full` (default, today's behaviour: every reachable
   curated record) or `restricted`.
2. `restricted` **requires** a non-empty `network ( … )` **and** a non-empty
   `reason`.  A reduced network with no stated reason is a trap for the next
   reader; the reason is the part a student actually needs.
3. Every name in `network ( … )` must resolve to a real record **and** be
   reachable from the feed's masters.  A name that resolves to nothing, or that
   the closure could never activate, **refuses** — a restriction that restricts
   nothing is a false claim about the model.
4. `full` together with a `network ( … )` list **refuses**: two authorities on
   one set.
5. The run **announces** the restriction and quotes the reason, beside the
   existing `[chemistry] closure over the curated network:` line.
6. `bin/choupo-import` intersects its reachability closure with `network ( … )`,
   so the seal mirrors exactly the admitted records.  The manifest then
   *describes* the declaration instead of contradicting it — today it
   hash-verifies twelve chemistry records of which the run uses one.

Cost: a reader in the speciation block, one intersection in the importer, the
announcement, four refusals, one gate.  `pitzer_seawater_verify` converts, its
sidecar goes, and `constant/electrolyte/` leaves the corpus entirely.

Beyond that one case, it buys a teaching move the grammar cannot make today:
*the same brine, with and without ion pairing* becomes a two-line case delta
instead of a hand-copied reaction list.

## 5. Alternatives measured and rejected

1. **Keep the sidecar.**  Cheapest.  Leaves a whole reader path alive for one
   case, and leaves the seal permanently disagreeing with the run.
2. **Delete the unwanted mirrors, rely on sealing.**  Fails on re-import (§3).
3. **An `exclude ( … )` list instead of an admitted list.**  Rejected: an
   exclusion is defined against a moving target.  Curate one new reaction
   tomorrow and every exclusion-list case silently admits it.  The *admitted*
   set is the thing the author actually knows and can defend.
4. **An empty case-local file as a suppression marker.**  Rejected: a silent
   convention, invisible in the log, and indistinguishable from a file that got
   truncated.

## 6. Compatibility note (dev-facing)

Both DWSIM and Aspen treat the reaction set of an electrolyte/chemistry package
as an **explicit enumerated list** the user edits — Aspen's Electrolyte Wizard
generates a set which is then editable in the Chemistry form; DWSIM's reaction
manager holds reaction sets as named lists.  Neither infers the set and neither
offers a subtractive knob.  An admitted-list declaration is therefore the
compatible shape; the only Choupo-specific part is that the *default* stays the
full reachable closure rather than a hand-built list, which is what keeps the
ordinary case free of ceremony.

## 7. Status

**Proposed, awaiting Vítor.**  Until then the `replace` leg stays, runs, and
announces its restriction on every run; `check_electrolyte_sidecars` pins that
it is the *only* surviving use, so a second one cannot appear quietly.
