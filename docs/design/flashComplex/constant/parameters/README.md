# `constant/parameters/` — empty on purpose, and what that costs

Binary interaction parameters live in **pair tables, indexed by the pair** —
never inside a component record. A pair belongs to neither of its two
components: putting `benzene-ethanol` inside `benzene.dat` makes benzene claim
ethanol's family, and putting it in both gives one value two homes.

This directory holds **no `.dat` files**, and the reason is not the one an
earlier version of this file gave.

## What actually happened

The case declared `activityModel { molecular NRTL; }` and could not run: of the
four pairs its backbone reaches, exactly one is in the public catalogue.

| pair | phase it prices | NRTL status |
|---|---|---|
| `ethanol-water` | aqueous backbone | curated — DECHEMA, valid 298–373 K |
| `benzene-ethanol` | organic phase, ethanol's partition into it | **missing** |
| `aceticAcid-water` | aqueous backbone | **missing** |
| `benzene-water` | the immiscibility that causes the split | **missing** |

Three missing pairs is a curation debt. `benzene-water` is not: **there is no
miscible mixture to regress.** A pair table for two liquids that do not mix has
no data behind it, and waiting for one is waiting forever.

So the model changed (Vítor, 2026-07-27): the molecular backbone is **UNIFAC**.
Group contribution *predicts* the immiscibility a missing pair would silently
price as ideal — and a silently ideal water–benzene is exactly the answer this
case exists to refuse. It is an estimate, and the run says so on every line.

## What UNIFAC needs, and where it is

Not a pair table: **group** tables. `R_k/Q_k` per subgroup and the main-group
`a_mn` interaction matrix, read once from

    data/standards/parameters/UNIFAC/groups.dat
    data/standards/parameters/UNIFAC/interactions.dat

and each molecule's own decomposition (`groups { unifac ( { group ACH; count
6; } … ); }`), which is a property of that molecule and rides in its component
record. That is why this directory stays empty: **UNIFAC has nothing
pair-shaped to put in it.** A component with no decomposition is a loud error
with the remedy printed — never an announced `gamma = 1`, which would turn a
group-contribution model into "ideal for whoever lacks data".

## The self-containment gap, named

Three parts of this case's data closure are **not** mirrored into `constant/`:
the two UNIFAC group tables above, the `groups { unifac … }` decompositions
(they sit in `data/standards/components/*.dat`, not in the copies here), and
the versioned `conventions/` profiles the gas–liquid records name. So the case
is not sealed, and `chemistry/README.md`'s claim that this tree is "exactly as
`bin/choupo-import` would materialise a sealed closure" is true of the
reactions and false of the whole.

Sealing was attempted (2026-07-28) and the importer refused, for a reason worth
recording because it is not laziness:

    bin/choupo-import docs/design/flashComplex --adopt-local <each authored record>
    -> validation FAILED: the staged sealed case does not run with the
       catalogue hidden (exit 2)
    -> ERROR: Component 'CaCO3': no 'vaporPressure' block.

Unsealed, `constant/components/CaCO3.dat` is an **overlay** and the standards
base underneath supplies `role nonvolatile;` — the key that tells the engine
calcite has no vapour pressure to look for. Sealed, the case's own file becomes
the base, and it may not carry that key: `role` is a property of the
**(component, phase) pair**, not of the substance, and `check_record_form`
makes writing it fatal in a design record — which is where the new form is
supposed to be shown.

The blocker is therefore precise, and it is not a missing file: **this case
cannot be sealed until the (component, phase) role migration runs**
(property-architecture 6b.3). A field in the wrong place, in the one tree whose
job is to show the right one. Re-run the command above the day it lands.

## Curation, not runtime

Fitting a pair is a **curation act** — a reviewable regression against
published VLE/LLE data producing a `binaryInteractionParameters` record with
its `provenance` block, its `validity` domain and its primary citation.
Nothing estimates a pair during a simulation. An estimated value that arrives
without its source is indistinguishable from a measured one the moment it is
written, which is precisely what the provenance block exists to prevent.
UNIFAC does not dodge that rule; it satisfies it by being an estimate that
never pretends to be anything else.
