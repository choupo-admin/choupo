# membrane16 -- the SW30HR-380 seawater element as a RECORD

**The question.** membrane01 runs "an SW30HR-style element, 35 m2, 1 m
channel, k_film 5e-5 m/s".  What changes when the element is named
instead of typed?

**Compare with membrane01.**  Same membrane record (`SW30HR`, the
solution-diffusion fit), the same seawater-class feed (32 g/L NaCl here --
the data sheet's own test salinity -- against membrane01's 35 g/L), the
same 55 bar.  membrane01 types `area 35 m2; length 1 m;` and a CONSTANT
`k_film 5e-5`.  Here `module SW30HR-380;` reads the record
`data/standards/assets/SW30HR-380.dat`: 380 ft2 (35 m2), the **28 mil feed
spacer the sheet states** (a data-sheet fact on this element, where the
NF270-4040 sheet states none), and two ESTIMATES the sheet does not give
(spacer porosity 0.90, leaf length 0.95 m) -- each announced on every run
with how to verify it.  The film is then COMPUTED (Schock & Miquel on the
record's channel, ~0.32 m/s crossflow) instead of declared, and the
polarisation index `Gamma_NaCl_avg` says what the film did.

**What the student sees.**  Two `[estimate]` lines (not three: the spacer
is measured here), the `[spec]` channel lines (W = A/(2L) = 18.4 m of leaf
width in one 8-inch element), the record's rated test printed beside the
result (32,000 ppm NaCl, 55 bar, 8 %: 26 m3/d, 99.7 %), and the KPIs.
Headline: NaCl rejection ~99.84 %, recovery ~16 %, ~62 LMH.  The sheet's
own point is 26 m3/d over 35 m2 = 31 LMH: the engine's `A_w` (a fit to
membrane01's teaching envelope) is about twice the sheet's -- the gate
`check_membrane_modules` runs the rated test and prints that ratio as a
measurement (see `docs/design/a-module-is-a-record.md`).

**The limits.**  83 bar, 45 C, 1.0 bar drop per element, pH 2-11; the
sheet states no maximum feed flow for this element, so none is declared
and none is checked -- an absent limit is absent, never a zero.  Set
`P 90 bar;` in `0/feed` to see the `[limit]` line; the run continues.

**Try.** `elements 6;` beside `module` -- a six-element pressure vessel of
this record (the count is not geometry, so it is allowed); the per-element
pressure drop is checked against the sheet's 1.0 bar.
