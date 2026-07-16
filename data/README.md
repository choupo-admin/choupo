# `data/`

Curated reference data lives under [`data/standards/`](standards/) — that
directory holds the version-controlled, write-protected canonical files the
simulator loads when a case does not provide local overrides.

A sibling [`data/local/`](local/) is the **private, gitignored** working tier:
the runtime reads it when present (announced `[local] UNVERIFIED`), it fills
gaps but never shadows a curated `standards` entry, and the public repo ships it
empty. The old public `proposed/` tier was retired 2026-07-13.

See [`data/standards/README.md`](standards/README.md) for:

- the full directory layout (components/, species/, chemistry/, parameters/,
  methods/, parameters/, materials/, membranes/, utilities/, … — one file
  per datum),
- the read-only ceremony (how to edit a standards file deliberately),
- how cases override standards via local `<case>/constant/...` files.

For the file format of an individual component, see
[`data/standards/components/`](standards/components/) — each `.dat`
is a self-documenting dict (CAS, MW, Tc, Pc, ω, Tb, Hvap_Tb, Antoine,
Cp polynomials, Vliq).

For binary interaction parameters, see
[`data/standards/parameters/README.md`](standards/parameters/README.md).
