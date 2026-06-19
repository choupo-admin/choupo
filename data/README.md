# `data/`

All reference data lives under [`data/standards/`](standards/) — that
directory holds the curated, version-controlled, write-protected
canonical files the simulator loads when a case does not provide local
overrides.

See [`data/standards/README.md`](standards/README.md) for:

- the directory layout (`components/`, `materials/`, `binaryPairs/`),
- the read-only ceremony (how to edit a standards file deliberately),
- how cases override standards via local `<case>/constant/...` files.

For the file format of an individual component, see
[`data/standards/components/`](standards/components/) — each `.dat`
is a self-documenting dict (CAS, MW, Tc, Pc, ω, Tb, Hvap_Tb, Antoine,
Cp polynomials, Vliq).

For binary interaction parameters, see
[`data/standards/binaryPairs/README.md`](standards/binaryPairs/README.md).
