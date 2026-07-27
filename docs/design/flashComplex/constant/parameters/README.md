# `constant/parameters/` — the pair tables, and the four that are missing

Binary interaction parameters live in **pair tables, indexed by the pair** —
never inside a component record. A pair belongs to neither of its two
components: putting `benzene-ethanol` inside `benzene.dat` makes benzene claim
ethanol's family, and putting it in both gives one value two homes.

This directory is **empty of `.dat` files**, and that is a finding, not an
oversight.

## What the case declares, and what exists

`constant/thermoPhysPropDict` declares `activityModel { molecular NRTL; }`.
The curated catalogue (`data/standards/parameters/NRTL/`) holds exactly two
pairs: `ethanol-water` and `benzene-toluene`. Of the pairs this case reaches:

| pair | phase it prices | status |
|---|---|---|
| `ethanol-water` | aqueous backbone | **curated** — DECHEMA, valid 298–373 K |
| `benzene-ethanol` | organic phase, and ethanol's partition into it | **MISSING** |
| `aceticAcid-water` | aqueous backbone | **MISSING** |
| `benzene-water` | the immiscibility that causes the split | **MISSING** |

The case cannot run until they are curated. That refusal is by name, per
missing pair, with the remedy stated — never a `gamma = 1` fallback that
would silently price a strongly non-ideal backbone as ideal.

## Why `benzene-ethanol` is the one that matters most

It is the only pair that prices the **organic phase**, and ethanol's partition
between the two liquids is the number this case asks the student to read. With
no ternary term and `benzene-water` absent, that partition is already resting
on two independent binaries (see the named gap in `thermoPhysPropDict`);
removing one of the two leaves nothing at all.

## Curation, not runtime

Fitting these is a **curation act** — a reviewable regression against
published VLE/LLE data producing a `binaryInteractionParameters` record with
its `provenance` block, its `validity` domain and its primary citation.
Nothing estimates a pair during a simulation. An estimated value that arrives
without its source is indistinguishable from a measured one the moment it is
written, which is precisely what the provenance block exists to prevent.
