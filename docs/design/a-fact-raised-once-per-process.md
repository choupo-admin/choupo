# A fact raised once per process, in a block that describes one pass

*Kind: ADR.  Status: SHIPPED 2026-09-27 (DEV.md §5, the A4 remainder).
Slice date 2026-09-27.*

---

## 1. The defect

Under an outer driver, `choupoSolve` prints ONE end-of-run caveat block and
says which pass it describes: the representative pass where the driver has
one, otherwise the LAST (`docs/design/three-silences-at-exit-zero.md`).  The
advisory log is cleared at the top of every pass (`runSimulation` in
`src/applications/choupoSolve/main.cpp`), so the block holds exactly that
pass's entries.

Some advisories were not raised by every pass that needed them.  A record
that is unreviewed (`reviewStatus interim`), read from the local tier, or
declared synthetic prints its console line ONCE PER PROCESS -- a sweep
reloads every record on every pass, and forty identical `[unreviewed]` lines
are read by nobody.  But the sites put their `AdvisoryLog::add` INSIDE that
once-per-process latch.  The per-pass clear then erased the fact from every
pass after the first, and nothing ever put it back.

MEASURED at `08957a55e`, `cavett01_recycle_train` (seven of its records are
interim imports):

| run | `[unreviewed]` lines at their site | `UNVERIFIED DATA` in the block |
|---|---|---|
| direct | 7 | 7 |
| 2-point `sweep` whose last point is the design point | 7 | **none** |

The last pass consumed exactly the seven records the direct run consumed.
The block, which claims to describe that pass, said nothing about them.  This
is the state `core/AdvisorySummary.H` forbids in its own words: silence must
mean "nothing raised", never "raised somewhere else".

The same loss had just been measured on the dynamic side: a per-pass reset in
the dynamic driver made `ctrl20_bode_cstr`'s block say "none raised" about a
run on the synthetic component `compA`, and the reset was reverted in favour
of a block that called itself a UNION.

## 2. The rule

**The log is per pass; the console line may be per process.**  These are two
different questions -- *does this pass's answer rest on this record?* and
*has the reader already been shown this sentence?* -- and they had one latch
between them.  They now have two, both in ONE home, `core/Advisory.H`:

```cpp
bool AdvisoryLog::addAnnouncedOnce(const std::string& key,
                                   category, severity, locus, message);
```

* The FIRST raise of `key` in a pass records the entry exactly as `add()`
  would (same deduplication, same `where`/`status` stamping, same promotion
  rule).  Later raises of the same key in the SAME pass change nothing --
  which is what the old in-latch `add()` did inside its one pass, so a
  single-pass run records the same list, in the same order, as before.
* It returns true only when the key is new to the PROCESS and the entry was
  new to the log.  The caller prints its console line on that answer, so the
  line still appears once per run.
* `clear()` resets the per-pass key set and keeps the process key set.  That
  is the whole partition, in one sentence a student can check against the
  source.

A site that repeats its console line per pass, or never gates it, keeps
calling plain `add()`.  What must not exist is an `add()` behind a
process-lifetime latch of the site's own: the log cannot see such a latch,
and the fact then belongs to whichever pass happened to come first.

## 3. The sites

Every `add()` that sat behind a process-lifetime latch, found by scanning for
it (the scan is now gate arm (h), §6), not by recollection:

| site | key | shape before |
|---|---|---|
| `src/thermo/Database.cpp` `[local]` | `proposed:<name>` | add inside `if (announceOnce)` |
| `src/thermo/Database.cpp` `[synthetic]` | `synthetic:<name>` | add inside `if (announceOnce)` |
| `src/thermo/Database.cpp` `[unreviewed]` | `interim:<name>` | add inside `if (announceOnce)` |
| `src/thermo/electrolyte/IonTransport.H` `[estimate]` D0 | `estimateD0:<species>` | add inside `announceOnce &&` |
| `src/thermo/henrysLaw/HenrysLaw.cpp` Trange | `henryTrange:<pair>:<side>` | `if (!announceOnce) return;` then add |
| `src/unitOperations/heatTransfer/HeatExchanger.cpp` H gap | `hxHgap:<s0>+<s1>` | `announceOnce && add` |

Two of the six carry a STATE-DEPENDENT sentence (the Henry temperature, the
exchanger's gap).  For those the key rule is what makes the fix possible at
all: moving a plain `add()` out of the latch would have recorded a new entry
at every temperature a Newton visited.  With the key, each pass records the
FIRST extrapolated evaluation it makes -- the old behaviour, now once per
pass instead of once per process.  `HenrysLaw` keeps its early exit before
building the sentence (`AdvisoryLog::passHas`), because a Henry constant is
asked for on every K evaluation.

Enumerated and NOT converted, with the reason each is outside this defect:
the other `announceOnce` users in `Database.cpp` (`[shadowed]`,
`[overlay]`, `[unmarked]`), `ThermoPackage.cpp` (`[henry]`),
`SaltFromCatalogue.H`, `RegistryScan.cpp` and `ThermoPackageBuilder.cpp`
print a console line and raise no advisory, so there is no fact for a pass to
lose.  The `static bool announced` latches in `ThermoPackage.cpp` are console
lines too; the one in `DistillationColumn.cpp` sits beside an `add()` it does
not gate.  Member latches (`announced_` on `PolynomialCp`, `RowlinsonBondi`,
`VaporPressureModel`, `SolidPhase`, `ReactiveVLE`, `SDEM`) live on objects
rebuilt every pass, so they reset with the pass; the one process-lifetime
object that carried such a sentence, a `HenrysLaw` held by
`HenrysLawRegistry`, is the Henry row above.

## 4. The dynamic driver

With the facts re-recorded per pass, the partition the dynamic driver had to
revert falls out: `src/dynamicDriver/DynamicDriver.cpp` clears the advisory
log and the divergence record at the top of every outer pass, exactly where
`runSimulation` does, and the header now names the pass in `choupoSolve`'s
words (`the REPRESENTATIVE pass` / `the LAST pass only`) instead of calling
itself a UNION.  The representative pass is read from its OWN record
(`driver->finalResult().advisories`), not from the log, because an integer
enumeration keeps the best value's replay, which need not be the last pass
the driver made.  `ctrl20_bode_cstr` keeps `compA` in its last-pass block;
`ctrl16_williams_otto_optimal` still reports "none raised"; both output trees
are byte-identical to the parent build.

## 5. Rejected alternatives

1. **Keep the process-scoped entries across `clear()`** (a "sticky" flag on
   an entry).  Rejected: an entry kept across the clear describes the pass
   that RAISED it, not the pass the block describes.  The Henry and exchanger
   sentences are state-dependent -- a temperature, a gap -- so a sticky entry
   would carry pass 1's number into the block of pass N, and a record that
   pass N did not consume at all would still be listed.  That is the union
   the contract rules out, entered by a side door.
2. **Re-read the named pass's records after the run** (walk the package the
   pass built and re-announce).  Rejected: a second route to the same facts,
   and only the sites know which records they consumed -- a re-reader would
   have to rebuild that knowledge, which is a second home for it.
3. **Clear only the latches, so every pass re-prints its console lines.**
   Rejected: it is the noise the latch exists to prevent (a sweep of forty
   points printing forty `[unreviewed]` blocks), and the reason the latch was
   introduced in the first place.
4. **Move each `add()` out of its latch and leave the log unchanged.**
   Rejected for the two state-dependent sites (§3) -- it records one entry per
   distinct temperature a Newton visits -- and, for the rest, because it
   leaves the rule in six places instead of one.  The key-in-the-log design
   puts the rule where the partition is.
5. **A second log for process-scoped facts.**  Rejected by the brief and on
   its merits: two sinks for one kind of record is the arity sin, and the
   block, the JSON and the GUI would each have to learn to merge them.

## 6. What proves it, and what does not

`check_caveat_surface` gained three arms:

* **(f)** runs `cavett01` directly and under a 2-point sweep (in a scratch
  copy; its last point is the design point) and requires the swept block to
  list every unverified record the direct run lists.
* **(g)** runs `ctrl20_bode_cstr` under `choupoCtrl` (a sweep over a
  synthetic component) and requires `the LAST pass only` and `compA`.
* **(h)** scans every `src/**/*.{cpp,H}` for an `AdvisoryLog::instance().add(`
  governed by an `announceOnce(` latch (in the `if` condition, its statement,
  or -- for `if (!announceOnce(...)) return;` -- the rest of the block).  It
  carries a probe: the three shapes that were in the tree must be flagged and
  the replacement must not.

By-hand sabotages, each restored and rebuilt:

| # | sabotage | caught by |
|---|---|---|
| S1 | `Database.cpp` interim site back inside its `announceOnce` latch | (f) "lists 0 of the 7"; (h) names `Database.cpp` |
| S2 | the synthetic site back to `announceOnce && add` | (g) "does not list it"; (h) names `Database.cpp` |
| S3 | `addAnnouncedOnce` returns before recording when the key is not new to the process | (f) and (g); (h) passes, as it must -- the shape at the sites is correct and the loss is in the log |

NOT covered, said plainly:

* Arm (h) sees `announceOnce(` latches.  A process-lifetime latch spelled
  another way (`static bool`, a `std::once_flag`, a static set with another
  name) is outside it; §3 enumerates today's, by reading.
* Arm (g) cannot see a MISSING per-pass clear in the dynamic driver: with the
  clear removed the block becomes the union again, and on `ctrl20` the union
  and the last pass both hold exactly `compA`.  The header would then lie.
* `choupoSolve`'s representative block reads the LOG after the reports, not
  the representative pass's own record, because the reports and the
  optimisation driver's own post-processing chain raise advisories that must
  be in the block.  For `optim06_integer_stages` (integer enumeration) the
  best value's replay is not the last pass, so the block describes the last
  enumerated value's replay.  Measured on `optim06` (the corpus's only
  enumeration): the four advisories the best replay's own record carries are
  the four the block lists, beside one raised by the reports, so today the two
  readings agree.  Named here, not fixed -- it is a different defect, and the
  dynamic driver (§4) already reads the representative record.
* The console line is still printed once per PROCESS.  A reader of a swept
  log meets `[unreviewed]` near the first pass and the entry again in the
  block; that is the intended split, not a gap.

## 7. Blast radius, measured

Every `choupoSolve` case with an `outerDict` (24) was run on a build of the
parent commit and on this one, each in a scratch copy: every output file
(801 in all, `converged/` included), every result-JSON key other than
`advisories`, and the log modulo the directory name are byte-identical in 23
of 24.  The 24th, `ammoniaStaged04_kinetic` (a `designSpec`), gains three
Henry-extrapolation advisories in its representative pass's JSON and block --
facts that pass raised and the old latch had spent on an earlier pass.  No
golden row reads `advisories`, so no row moves.  The two `choupoCtrl`
outer cases change only their scope line.  Single-pass runs are unchanged by
construction (§2), and `cavett01` run directly is byte-identical.
