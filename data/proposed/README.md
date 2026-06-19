# `data/proposed/` — extended catalogue: usable, but review before you rely on it

This is the **extended component tier**: machine-ingested or estimated data for
components beyond the hand-curated [`../standards/`](../standards/) set.  These
files **can be used** — the engine loads them and most carry a working VLE
skeleton (critical constants + a vapour-pressure model) — but they have **not**
been human-curated to the standard of `standards/`, so they ask for **careful
review before you trust them quantitatively** (especially anything
reaction- or energy-critical).

Think of it as a larger, openly-sourced catalogue you can reach for, with the
honesty turned up: every value travels with its provenance, and the solver says
out loud when a result leans on it.

## What you get (and the gaps to watch)

Mostly **VLE skeletons**: scalars (Tc / Pc / ω / Tb / MW) + a vapour-pressure
model (a CoolProp-MIT reference fit, or an Ambrose–Walton corresponding-states
estimate).  Good enough to run flashes and T-x-y diagrams; treat the numbers as
solid-for-screening, not certified.

The usual **gaps are Cp and formation enthalpy** — the original values were
stripped because they came from licence-encumbered compilations (CRC, Perry /
DIPPR, NIST-SRD: not redistributable).  Supply them from a **primary** source or
an **open** estimate (Joback for fluids; a Lastovka estimate or measured data for
solids) when you review a file.  A reaction or energy balance that silently used
a missing formation enthalpy would be wrong — that is the main thing to check.

## The engine is honest about it

Each file carries a machine-readable provenance block:

```
provenance
{
    status  "UNVERIFIED ESTIMATE -- review before relying on it (data/proposed tier)";
    review  { state pending; reviewer student; }
}
```

Because of that `status`, the solver prints a **loud notice** whenever a case
loads one (`[proposed] component '…': review its gaps …`).  A result built on
extended-tier data is reported, never silently presented as standard.

## Resolution precedence (engine)

The loader (`src/thermo/Database.cpp`) resolves a component by name across three
tiers, **lowest → highest**:

```
data/proposed/components/<name>.dat        (this tier — extended, review-before-relying)
   <  data/standards/components/<name>.dat (hand-curated; SHADOWS a proposal of the same name)
   <  <case>/constant/components/<name>.dat (case-local; always wins)
```

So a curated `standards/` entry always wins over a same-named proposal, and a
case-local file always wins over both.  Promote a file you have reviewed into
`standards/` to make it the trusted default.

## Not frozen

Unlike `data/standards/` (write-protected, changed only by ceremony), this tree
is **meant to be churned** — added to, corrected, and emptied as files graduate
to `standards/`.

## Provenance / licence

Open sources only (CoolProp MIT, Sander 2015 CC-BY for Henry, Joback 1987 facts,
IUPAC / PSRK / Wikidata).  Licence-encumbered values (CRC / Perry / DIPPR /
NIST-SRD / Yaws / CC-BY-NC) are **excluded** — if you find one, it is a bug;
strip it.  Cite the **primary** source per value on promotion.  See the root
[`NOTICE`](../../NOTICE).
