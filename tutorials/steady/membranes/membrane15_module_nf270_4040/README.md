# membrane15 -- the NF270-4040 element as a RECORD

**The question.** What does a student have to type to run a commercial
membrane element, and where do the numbers the data sheet does not print
come from?

**Before this case** a spiral-wound module was typed by hand: `membrane
NF270; area 7.6 m2; length 1 m;` and, inside `massTransfer {}`,
`channelHeight 0.7 mm; spacerPorosity 0.9;` -- five numbers from four
places, and nothing said which were the manufacturer's and which were
guessed.  **Here** one line, `module NF270-4040;`, names the record
`data/standards/assets/NF270-4040.dat` (kind `membraneModule`), which
carries the DuPont FilmTec NF270 Element data sheet's active area (82 ft2,
7.6 m2) and its limits (41 bar, 45 C, 1.0 bar drop, 3.6 m3/h feed, pH
3-10), the membrane the element is wound with (`NF270`), and three values
the sheet does NOT state.

**What the student sees at the top of the log.**  Every run that reads the
record announces its estimates, one line each, with how to verify them:

    [estimate] module 'NF270-4040': `channelHeight` ... is an ESTIMATE, reviewStatus unverified -- 28 mil is the feed spacer DuPont states for its 8-inch SW30HR-380 ...; the NF270-4040 sheet states none ...
    [estimate] module 'NF270-4040': `spacerPorosity` ... -- 0.90 is typical for commercial diamond feed spacers; to be verified by weighing a spacer coupon ...
    [estimate] module 'NF270-4040': `leafLength` ... -- element length 1.016 m per the data sheet includes the end caps; the leaf length is not published ...

They also reach the end-of-run caveat block and the result JSON.  A
record with no estimate prints nothing: silence keeps meaning "nothing was
assumed".  The `[spec]` lines say what channel the record gave, and that
this is a spiral leaf with TWO membrane faces (W = A/(2L)); compare
membrane17, a flat cell with one.

**The limits speak, they do not stop the run.**  Raise the feed pressure in
`0/feed` above 41 bar, or the feed flow above 3.6 m3/h, and the log prints a
`[limit] module 'NF270-4040': feed P ... EXCEEDS the maximum operating
pressure ...` line and continues -- a student may run an element outside
its rating on purpose, and the run then says so.

**The rated test is a measurement, not an assertion.**  The record carries
the sheet's own standard test (2,000 ppm MgSO4, 4.8 bar, 25 C, 15 %
recovery: 9.5 m3/d and > 97 % rejection).  The gate
`bin/curate/check_membrane_modules.py` runs this element at those
conditions through the engine and PRINTS the engine's permeate flow and
rejection beside the sheet's.  The NF270 record's `A_w` is a fit to a
teaching case (its own header says so), so the ratio is a finding written
in `docs/design/a-module-is-a-record.md`, never tuned away.

**This run.**  NaCl 2 g/L at the sheet's rated 4.8 bar and 2.6 m3/h (the
feed the rated test implies: 9.5 m3/d permeate at 15 %); the film and the
friction computed from the record's channel (Schock & Miquel, ~0.28 m/s
crossflow, published as `u_crossflow_inlet`).  Headline: recovery ~20 %,
NaCl rejection ~72 %, ~68 LMH -- the flux is the fitted `A_w`'s, not the
sheet's (see the gate's measurement).

**Try.** Declare `area 7.6 m2;` beside `module` -- the run REFUSES naming
both homes.  Change `module` to a name that does not exist -- the refusal
lists the registered modules (`NF270-4040 SEPA_CF SW30HR-380`).
