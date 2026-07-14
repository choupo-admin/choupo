# Adsorbents — intrinsic material identity

Each `<adsorbent>.dat` here carries the INTRINSIC identity of one adsorbent
material only: name, material class, packed bulk density (+ provenance).
Shipped: `zeolite5A`, `activatedCarbon` (BPL), `zeolite13X`.

**Adsorption equilibrium does NOT live here.** It is (adsorbent × adsorbate)
PAIR data — one curated record per pair under
`data/standards/parameters/adsorption/equilibria/<adsorbent>/<species>.dat`,
each declaring `model` (henry | langmuir), `parameters{}`, `tRef`,
`loadingBasis`, `pressureBasis`, `quality` and `provenance{}`.
Migrated 1:1 from the previously embedded `isotherms{}` blocks on 2026-07-12
(numbers unchanged).  Those historical parameter sets are explicitly
`quality teachingOnly` with `origin assumed`: their cited books/papers are the
basis for the old teaching values, not a reproducible regression of those
three numbers.  Every use raises a structured provenance warning; replace them
with a sample-specific measured/regressed record before design use.  The engine
REFUSES an adsorbent file that still embeds an `isotherms{}` block, and
`bin/curate/check_adsorption_tree.py` gates the layout and quality contract —
no dual reader.

A component with no equilibrium record adsorbs nothing → it reports fully to
the raffinate (light product), mirroring "a membrane with no B_s,i is
perfectly rejected".
