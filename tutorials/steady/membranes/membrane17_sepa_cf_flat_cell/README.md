# membrane17 -- a laboratory cell a student can build a case for in five lines

**The question.** A student has a Sterlitech SEPA CF cell on the bench
and a coupon of NF270.  How many lines of case does that take?

**Five.**

    module           SEPA_CF;            // the cell
    membrane         NF270_sdem_NaCl;    // the coupon
    transport        SDEM;
    P_permeate       1.0 bar;
    massTransfer     { model SchockMiquel; viscosity 1.0e-3; }

plus the polarisation policy (Geraldes & Afonso 2006 suction correction,
ions coupled at the interface) and a feed.  The cell record
`data/standards/assets/SEPA_CF.dat` (kind `membraneModule`, `format
flatSheetCell`) carries the manual's Table 1: 140 cm2 active area, the
95.3 mm x 1.09 mm slot, 70 ml hold-up, 69 bar and -- the binding limit --
the polypropylene spacer's 82 C.  A cell takes ANY coupon, so the membrane
is the CASE's to declare beside the module (a spiral element is wound with
its own; there `membrane` beside `module` is refused).

**One membrane face.**  In a spiral leaf the channel has membrane on both
sides, so the module reads the leaf width as A/(2L).  A flat cell has the
coupon on its permeate carrier and a steel lid above the channel: ONE face,
W = A/L.  The engine reads the record's `format` and says which it used in
the `[spec]` line -- and the channel LENGTH is not stored anywhere: it is
activeArea / slotWidth = 146.9 mm, derived where it is used (the tree never
stores a derivative).

**The channel height is yours.**  The slot is 1.09 mm deep and shimmed down
to the spacer you install, so the operating channel is a fact about your
stack, not about the cell.  The record's 31 mil (0.787 mm), one of the four
spacers Sterlitech ships, is an EDUCATED DEFAULT marked `origin estimated;
reviewStatus unverified;` and announced on every run: copy the record to
`constant/assets/` and set your own.

**The crossflow is declared, and published.**  The manual (section 5.1)
says spacer channels are usually run at 0.1-0.5 m/s.  `0/feed` states the
arithmetic: channel section = 95.3 mm x 0.787 mm x 0.90 = 6.75e-5 m2, so
0.2 m/s needs 48.6 L/h, and membrane12's feed (0.01 M NaCl + 2e-4 M NaNO3
and NH4Cl) is scaled to it.  The run publishes `u_crossflow_inlet` = 0.200
m/s so the case can be held to the number it claims.

**What the physics does.**  Same coupon and feed as membrane12/14, now on a
real laboratory channel: the four ions polarise at different rates on
their own diffusivities and are coupled by one interface field
(`xi_V_per_m_avg`), NO3- still slips through under the zero-current field
(R_obs ~18 % against ~67 % for Cl-), and the permeate is electroneutral by
construction.  Recovery ~2.5 % -- a cell is a rejection instrument, not a
separator.
