# Verifying the catalogue against a book — Poling App. A, 2026-08-25

*Record of the slice.  Tool: `bin/curate/verify_against_poling.py`.  No gate,
by construction — see §2.  Companion to the same day's dataset check,
[`held-out-pressure.md`](held-out-pressure.md) §5a: same question, one layer
down.*

---

## 1  The question

`data/standards/components/` carries critical constants for 109 substances.
Their headers cite where they came from — mostly a CoolProp cross-check, some
a compilation, a few a primary — and **not one of them had ever been read back
against a published table.**

That is the exact state the 2026-08-25 dataset slice named one layer up: *a
citation says where numbers are supposed to come from, not that anybody
looked.*  The reason it had not been done is banal and worth stating: the
compilation everyone's critical constants descend from is Appendix A of
Poling, Prausnitz & O'Connell, and it is a copyrighted table this repository
cannot hold.

Vítor supplied his own copy.  That makes the check possible without changing
anything about what the repository may contain.

## 2  Why this is a tool and not a gate

The appendix is not in the tree and never will be.  The licence policy
excludes no-grant sources, and this one is published to McGraw-Hill with TRC's
permission, not to us.  So the check cannot run in CI.

By this project's own rule — **a check that cannot run must not pass** — it
therefore must not be a gate.  A `check_poling_*` that skipped when the book
was absent would be permanently green in the only place that matters, which is
precisely the `check_true_ions` shape retired on 2026-08-05.

It is a curation tool.  It prints a report.  What a gate could legitimately
pin, later, is the report's own *conclusions* once a curator has accepted
them — which is a separate decision, and Vítor's.

**Nothing from the appendix enters the tree.**  The script contains no value
from it; the report it writes goes to `data/local/`, the gitignored private
tier, and not to `generated/`, which is committed and would go stale with
nothing able to notice.  Disagreements are printed with both numbers, because
a finding the reader cannot evaluate is not a finding — that is a handful of
values quoted in a verification context, not a copy of a table.

## 3  What was measured

Of 158 records carrying a CAS number, the appendix lists **75**.  Across
those, comparing MW, Tc, Pc, ω, Tb, ΔHvap(Tb) and Vliq:

| band | count | what it means |
|---|---|---|
| reproduces the appendix to its printed precision | **238** | our value *is* theirs — the transcription is faithful, and this says nothing about the measurement |
| differs by less than 1 % | **105** | a different compilation.  Not an error |
| differs by 1 % or more | **37** | a curator's question |

19 liquid-volume comparisons were **not made**: the appendix states Vliq at the
temperature of the measurement (90 K for argon, 78 K for nitrogen) while ours
is at 25 °C.  A volume compared across that is a disagreement about the
temperature, not about the substance.  Neither agreement nor disagreement —
and the report says so by name rather than counting them either way.

### And the sharpest thing in the run is per quantity, not per substance

The totals hide it.  Broken out — the tool computes this table itself, so it
is not a number remembered into prose:

| quantity | reproduces | differs < 1 % | differs ≥ 1 % |
|---|---|---|---|
| MW | 74 | 0 | 0 |
| Tc | 45 | 28 | **0** |
| Pc | 22 | 34 | 15 |
| ω | 40 | 6 | 14 |
| Tb | 35 | 31 | **1** |
| ΔHvap(Tb) | 16 | 4 | 7 |
| Vliq | 6 | 2 | 0 |

**Molecular weight agrees everywhere, and not one critical temperature
disagrees by as much as 1 %.**  Every notable difference is in Pc, ω or
ΔHvap(Tb).

That is what one would predict and it is worth having measured rather than
assumed: Tc and Tb are directly observed and long settled, while Pc is hard to
measure near a critical point, ω is *derived* from a vapour-pressure
correlation (so it carries whichever correlation the compiler used, and is a
parameter of a model as much as a property of a substance), and ΔHvap(Tb) is
commonly derived through Clausius–Clapeyron rather than calorimetry.

The practical consequence for this catalogue: a difference in Tc would be a
transcription error and there are none, whereas a difference in ω is a
question about which correlation each compilation regressed — which is the
sort of thing a curator resolves by reading, never by picking.

**The result answers a question that was open.**  The reserved ruling on
whether a CoolProp cross-check counts as provenance now has evidence beside
it: for the substances both cover, the CoolProp-sourced constants reproduce
the appendix exactly in 238 comparisons.  Whether that *is* provenance stays
Vítor's call; it is no longer a call made without data.

## 4  The three differences worth knowing — and none of them is a defect

* **Helium, Tb.** Ours 4.22 K, the appendix 4.30 K.  The modern value is
  4.222 K.  *The appendix is the outlier here*, and that is worth having on
  record before anyone "corrects" toward it.
* **Neon, ω.** Ours −0.03549, the appendix −0.016.  Modern determinations sit
  near −0.039.  Same direction: ours is the later number.
* **Acetic acid, ω.** Ours 0.4665, the appendix 0.445.  This one is a genuine
  open question rather than an edition gap — acetic acid associates in the
  vapour, and an acentric factor regressed from a vapour pressure it does not
  describe is a fitted parameter of a model, not a property.

So the headline is the opposite of the one a verification exercise usually
produces: **the check found no transcription error, and the disagreements it
did find are mostly ours being newer.**  That is a real outcome and it is
recorded as such — inventing a defect to justify the exercise would be the
same sin as inventing a citation.

## 5  What the tool had to survive, and what it invented before it did

The parse went wrong three times, and every one produced a *plausible
disagreement* rather than an error.  Recording them because the failure mode
generalises to any table read out of a PDF:

**(a) The form feed is not the page.**  Splitting on `\f` orphaned half the
table from its column header and used 209 rows where the table has 440, with
nothing reporting the loss.  Ethanol and water simply were not there.

**(b) A ragged row slides.**  Table B has no redundant column, and CO2's
ΔHvap cell is empty because CO2 sublimes.  An order-preserving fit slid the
earlier columns rightward and the report announced that *CO2's heat of
vaporisation disagrees with the appendix by 106 %* — the number it had picked
up was CO2's **Gibbs energy of formation**, −394.38 kJ/mol.  Closed with a
maximum per-token offset and a physical range per column (a heat of
vaporisation is positive; a dipole moment is not 300).

**(c) The header names the columns; it does not position them.**  pdftotext
lays out each page on its own, and on some pages the header line sits several
characters off its own body.  R-245fa's **critical temperature** of 427 K was
reported as a normal boiling point.  Nothing catches that alone: 427 K is a
plausible boiling point and that row carries no Zc.  Closed by calibrating
each block's column centres **from its own complete rows** — the ones with one
token per column, where the assignment is forced — and dropping a block that
has too few to calibrate rather than falling back to its header.

**The redundant column is what made any of this detectable.**  Table A prints
Zc = PcVc/RTc, so a mis-assignment among Pc, Vc and Tc cannot survive
recomputation; 311 of 393 rows are confirmed that way and 75 were rejected and
counted.  Table B has no such column, so its rows carry no audit and the
report marks every Table B entry `NO — read against the book` **per value, not
per record**: carrying one flag for the whole substance would lend Table A's
confidence to Table B's parse, which is the one thing the split exists to
prevent.

Spot-checked by hand against the page images, independently of the parser:
benzene, ethanol, water, H₂S, CO₂, acetic acid, helium and neon.

## 6  What was deliberately not done

**No value was changed.**  Every difference in §4 is a question for a curator
with the primaries in hand, and data curation is Vítor's.  Editing toward the
appendix would in at least two cases have made the catalogue *older*.

**No `reviewStatus` was flipped.**  The field means a curator has verified the
record; a script agreeing with one compilation is not that, and writing
`checked` off the back of this run would make the mark mean something weaker
everywhere it already appears.

**Tables C and D are not read** (ideal-gas Cp coefficients, Antoine
constants).  They are the obvious next reach and each needs its own audit
argument — Cp coefficients have one available (the appendix prints Cp at 298 K
beside them, a redundant determination of the same kind as Zc), Antoine
constants do not obviously.
