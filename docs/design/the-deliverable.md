# The deliverable

*Leg 5 of the student walkthrough, 2026-08-27.*

## 1. The test

Leg 4 asked whether a student can say where a number came from.  Leg 5 asks
the more basic question that comes right after it: **can they get the numbers
out?**  A final-year project ends in a report and a presentation, not in a
terminal.

So: run the case, and see what is on disk afterwards.

## 2. What was there

Balances, and nothing else.

```
reports/balances/massBalance.csv
reports/balances/massBalance_byUnit.csv
reports/balances/elementBalance.csv
reports/balances/energyBalance_byUnit.csv
reports/balances/globalEnergyBoundary.csv
```

Sizing and costing had run.  They printed their tables to the screen and left
**no file at all** — so the equipment list and the capital cost, the two things
a project report is built around, existed only in terminal scrollback.

Twelve report kinds are registered, including `streamTable`, `design`,
`economics` and `spreadsheet`.  Three run by default (the balances, by the
2026-08-02 ruling: conservation is the curriculum).  The rest need declaring,
and nothing on the run's output says they exist.

## 3. What was measured before anything was changed

How many corpus cases declare each report:

| report | cases |
|---|---|
| `streamTable` | 74 |
| `profiles` | 26 |
| `spreadsheet` | 23 |
| `utilities` | 6 |
| `utilityAllocation` | 4 |
| `computed` | 3 |
| `energyStreams` | 1 |
| **`design`** | **0** |
| **`economics`** | **0** |

**The two reports a final-year project needs most are the two nobody has ever
run.**  That is why what follows had survived: an unexercised path is one
nobody can find.

## 4. Three defects, and the first is an arity violation

**(a) `DesignReport` re-ran the sizing.**  It called
`PostProcessor::New("sizing", dict)` and executed the whole sizing pass again
out of the REPORT's own dict.  So the equipment list had to be declared
**twice** — once in `system/postDict`, once in `controlDict`'s `reports {}`
block — with nothing keeping the two copies equal.  Worse, the re-run
overwrote the `sizings` the costing pass had already consumed.

`EconomicsReport` had the identical shape: it re-ran the costing pass, so
`method`, `cepci`, `cepci2001` and `usdToEur` each needed two homes.

Both are pure serialisers now.  They write out what `result` already holds and
refuse, naming the remedy, when it is empty.  This is what the architecture
already said a report is — *"engine-owned, GUI only draws"*, and `PostProcessor`
is *"pure post-processing"*.  A report reaching down to recompute inverts that.

The first symptom a student meets is what put me on to it:

```
ERROR: Dictionary 'design': missing dict-list entry 'units'
```

— asking for a list they had already written, in another file, ten lines away.

**(b) One failing report killed every report after it, silently.**  The chain
was `for (auto& [rep, opts] : chain) rep->run(opts, rctx);` with no guard.  In
the probe, `design` threw, and `economics` and `spreadsheet` never ran — with
nothing saying they had not.  *"Never reached" reading as "produced nothing"*
is absence read as a result, one layer out from where leg 4 found it.

Each report is caught by name now, the chain continues, and the count is
stated at the end and raised on `AdvisoryLog` — because a reader who scrolled
past one red line must still learn something is missing.  A report is
post-processing over an answer already computed and already written; its
failure cannot invalidate the solution, and must not pretend to.

**(c) The artefacts could not be defended.**  Leg 4 made the console tables
traceable.  The CSVs — the files that actually go into the report — still
carried bare numbers.  Solving it on the screen only is half a fix.

`sizing.csv` gained a `basis` column (`drum V = Q*tau`), so the design
*argument* travels with the volume.  `costs.csv` gained the correlation, its
size driver, the coefficients, both module factors, both CEPCI values and the
exchange rate — enough to redo the arithmetic from the file alone:

```
recomputed 166,652.66   vs   file 166,652.66
```

## 5. What the student has now

```
reports/streams/streamTable.csv     8 streams, roles, T, P, vf, x_i
reports/design/sizing.csv           equipment, material, BASIS, D, H, t_wall, weight
reports/economics/costs.csv         costs + every factor needed to reproduce them
reports/report.ods                  8 sheets, coloured
reports/balances/*.csv              the three conservation reports
```

## 6. NOT done, said plainly

* **The twelve reports are still undiscoverable.**  Nothing in a run's output
  says which kinds exist, so a student gets them by reading another case's
  `controlDict` — which is how I found the syntax myself.  Making them
  discoverable is a real slice and is not this one.
* **`design` and `economics` still run by declaration only.**  Whether they
  should join the three default reports is a corpus-wide behaviour change
  (every case that sizes would start writing files) and is reserved.
  **The stated cost was PAID on 2026-09-04, by another route:** every case that
  sizes now writes `design/<SECTOR>/<unit>/<tag>` specification sheets, because
  those ride the `sizing {}` PASS in `postDict` and not the `reports {}` block.
  What stays reserved is narrower than this sentence reads -- whether the two
  REPORT KINDS join the three defaults.  Record:
  [`the-specification-sheet-a-project-is-audited-from.md`](the-specification-sheet-a-project-is-audited-from.md).
* The `reports {}` grammar is `kind { }`, and writing `kind;` refuses with a
  message that says what is wrong and **not what is right** — the same defect
  the missing-key hint closed for dictionaries.  Not fixed here.
* No golden row reads the `basis` word.  `check_cost_provenance` is all that
  stands behind it.
* **THE EXIT CODE, and this one is a live question rather than a deferral.**
  Before the guard, an uncaught report exception propagated and the run exited
  non-zero.  With it, the chain continues and the run exits **0** even though a
  requested artefact is missing.  The solution really is unaffected — that is
  the whole argument for continuing — but *"you asked for four files, got
  three, and the run reports success"* is absence read as success, which is the
  pattern this walkthrough exists to find.  No corpus case has a failing
  report (measured: the full suite before this change reported none), so
  nothing moves either way today.  The likely right answer is to keep running
  every report AND fail the run at the end when any of them did not produce
  what was asked for; it is written down here rather than done in the same
  breath, because it changes what a green suite MEANS and deserves its own
  verification.

Gate: `check_cost_provenance`, arms (f) (g) (h), sabotage-verified S7-S9 —
and its own defect recorded there: the new arms were first written AFTER the
`finally` that deletes the probe directory, so they checked an empty directory
and blamed the engine.
