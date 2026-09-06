# A default nobody declared, and a banner that was accidentally true

*Design record — Choupo.  Task #92, the SAFE half.  2026-09-06.*

**Status: SHIPPED.  No number moved and no golden moved; that is the slice's
own constraint and it is proved below, not asserted.**

---

## 1. The question a student cannot answer

A student hands in a final-year project and the jury asks where a wall
thickness came from.  They open the specification sheet, and it says

```
sizing
{
    V_R                     7.6882 m3;
    L_over_D                [0 0 0 0 0] 3;
    t_wall                  0.0053421 m;
}
```

Three of those four numbers were declared by the case.  One of them —
`L_over_D` — may have been declared by the case, or may have been supplied by
`VesselSize.cpp` because nobody said anything, and **the page reads identically
either way**.  Two more inputs decided that `t_wall` and appear on no page at
all: `corrosionAllow` and `jointEfficiency`, consumed and never published.

That is the defect.  Not a wrong number — a number whose *authorship* is
invisible, on the one surface this project built for auditing.

## 2. What was measured, before anything was written

Every count below comes from a command run on 2026-09-06 against commit
`312af3298`, and each was re-measured rather than inherited from the brief.

```
grep -rn "lookupScalarOrDefault\|lookupOrDefault" src/postProcessing/   →  32 sites
    EconomicsPass 15 · Guthrie 4 · VesselSize 3 · StirredTank 3
    SprayDryerSize 2 · PinchPass 2 · CostingPass 2 · CompressorSize 1
```

Four findings, in order of how badly they read:

1. **`CostingPass.cpp` printed the price index by re-reading the dict with its
   OWN defaults** (`year` 2026.0, `cepci` 820.0) while `Guthrie.cpp` read the
   same two keys with **its** own and did the pricing.  The literals agreed, so
   the banner was **accidentally true**.  Change either copy and the console
   states one CEPCI above a table costed with another, at exit 0 — and that
   banner is exactly what `check_cost_provenance` teaches a student to defend
   the total with.
2. **`Guthrie.H` carried the same four literals a THIRD time**, as in-class
   member initialisers, beside a constructor that assigns all four
   unconditionally.  Dead the whole time, and invisible to every output.
3. **`StirredTank.cpp` defaults `L_over_D` to 2.5 and `VesselSize.cpp` to
   3.0** — same key, same question, different silent answer.
   `corrosionAllow` (0.003) and `jointEfficiency` (1.0) are duplicated
   literals across those same two files.
4. **`refuseOnMissingPrice` is a POLICY carried as a float**
   (`lookupScalarOrDefault(..., 1.0) != 0.0`): a decision — refuse, or report
   zero revenue — sitting behind a numeric comparison with a silent default.

And a fifth, found by running the corpus rather than reading it: **every one of
the 8 costing cases declares all four price-index keys**, so the Guthrie
default path had never been exercised, which is precisely why nobody had looked
at it.  Three vessels DO take a sizing default in a shipped case:
`ammonia02_full_plant`'s `converter` (220 bar) takes `jointEfficiency`, and its
`separator` (220 bar) and `letdown` (25 bar) take both `corrosionAllow` and
`jointEfficiency`.  A pressure vessel's corrosion allowance, assumed in silence.

## 3. The rule adopted

> **A default that is USED is announced; a value that is DECLARED announces
> nothing; and the surface a reader audits from says which.**

Three halves, and the third is the one that makes the first two worth having.

* **ANNOUNCED ON USE.**  Each default rides `AdvisoryLog` — the CatalystPellet
  precedent — so it reaches its own site, the end-of-run `ASSUMPTIONS AND
  CAVEATS` block and the result JSON.  A warning printed only at its site a
  thousand lines above the answer has been delivered and not received.
* **SILENCE KEEPS MEANING "NOTHING WAS ASSUMED."**  A case that declares the
  key produces byte-identical output to before this slice.  This is not
  politeness; an announcement that fires on everything is the failure mode the
  end-of-run block exists to prevent, and it *looks* more thorough.
* **THE SHEET SAYS WHICH.**  `design/<...>/<equipmentTag>` grows an
  `assumed ( ... )` list, written ONLY when something was assumed, so its
  absence is the positive statement — the same reading `(not stated)` gives a
  missing basis.

And the banner rule, taken straight from the 2026-09-05 first law:

> **The header DRAWS what the model published.  If the model publishes no
> price index, the header says so and computes nothing in its place.**

A fallback computation would be the second home under another name — which is
exactly the path that made the GUI show a 372.5 kW first-law violation on a run
the engine closed at 34.4 kW.

## 4. What was built

| where | what |
|---|---|
| `src/postProcessing/sizing/DesignDefaults.{H,cpp}` | NEW.  The ONE home for a design constant more than one sizer asks for: the value, its unit, and the word that says it is an assumption.  `valueOr()` returns the declared value silently, or the default announced *and* marked on the record. |
| `src/core/ResultRecords.H` | `EquipmentSizing::assumed` + `assume()` — the one door, extended where the door is, never at the printers. |
| `src/postProcessing/sizing/{StirredTank,VesselSize}.cpp` | Six `lookupScalarOrDefault` literals replaced by the one home.  The record is now built FIRST, because it is what remembers. |
| `src/postProcessing/costing/CostingModel.H` | `pricingFactors()` — what this model will actually price with.  Base returns empty: a model that says nothing claims nothing. |
| `src/postProcessing/costing/Guthrie.{H,cpp}` | The four price constants in one table, announced on use; the dead in-class initialisers deleted. |
| `src/postProcessing/CostingPass.cpp` | The header draws `pricingFactors()`; the two dict re-reads are gone. |
| `src/postProcessing/EconomicsPass.cpp` | `refuseOnMissingPriceOf()` — the policy says whose it is. |
| `src/io/DesignSheetWriter.cpp` | The sheet's `assumed ( ... )` list. |
| `src/postProcessing/SizingPass.cpp` | An `assumed:` line beside the `basis:` line, where a reader already looks. |

13 of the 32 sites: 6 sizer, 4 Guthrie, 2 in `CostingPass` that are no longer
dict reads at all, and `refuseOnMissingPrice`.

## 5. What was deliberately NOT done — and this is the substantive half

**No value was chosen.  No golden moved.  That was the constraint, and the
places it bit are named here rather than quietly worked around.**

* **THE 2.5 / 3.0 RECONCILIATION IS RESERVED FOR VÍTOR.**  `StirredTank`
  assumes L/D = 2.5, `VesselSize` assumes 3.0, for the same key asking the same
  question.  The one home carries **both**, with the fact that they disagree
  written where a reader meets it, and each sizer names the one it asks for.
  Picking one changes D, H, `t_wall`, weight and therefore the capital cost of
  every un-declaring vessel in the corpus — a scientific change riding on a
  structural one.  A one-home refactor that quietly picks a winner is worse
  than the duplication it replaces, because the duplication is at least visible.
* **THE 14 REMAINING `EconomicsPass` DEFAULTS ARE A CAMPAIGN, MEASURED AND
  STOPPED.**  `projectLife` 10, `discountRate` 0.10, `taxRate` 0.21,
  `depreciableLife` 9, `salvageFraction` 0, `workingCapital` 0.15,
  `streamFactor` 0.90, `siteFactor` 0.50, `contingencyFee` 1.18, `N_np` 7,
  `estimateClass` 4, `constructionPeriod` 1 (this one already announces when it
  is declared and unmodelled), `langFactor` 3.63, `operatorAnnualHours` 1960.
  Announcing all fourteen on every economics run is a wall of text, and the
  reader who meets fourteen identical sentences reads none of them — which is
  the summary block's own failure mode, arriving by a different road.  Whether
  a DCF's financial assumptions should be announced individually, grouped as
  one "these were not declared" line, or REFUSED outright, is a decision about
  what an appraisal is for.  Not taken here.
* **5 more single-reader defaults are named and not wired**: `SprayDryerSize`
  (`targetSize` 0.0 — a sentinel meaning "no design inversion requested", which
  is a different kind of thing; `residenceFactor` 3.0), `CompressorSize`
  (`pressureDesign` 1.0 — a vessel silently designed at atmospheric),
  `PinchPass` (`dTmin` 10.0, `latentWidth` 1.0).  Each has exactly one reader,
  so none is an arity defect; each is a candidate for the announce rule, and
  `CompressorSize`'s is the one worth doing next.
* **`refuseOnMissingPrice` STAYS A NUMBER.**  Six shipped postDicts write
  `refuseOnMissingPrice 1;`, two case READMEs and
  `docs/tutorialsGuide-steady.tex` document `0` and `1`.  Spelling it as a word
  is a grammar change to authored cases and to published prose — reserved.  So
  is its neighbour: a value that is neither 0 nor 1 is read as "refuse" today,
  and whether that should refuse by name is a question about the grammar.
* **No new sizing content.**  `corrosionAllow` and `jointEfficiency` are still
  consumed without being published as sizing values, so the sheet NAMES them
  and does not VALUE them (the advisory and the caveat block carry the value).
  Publishing them would add sizing keys, which adds columns to `sizing.csv` and
  rows to every `equipment` golden — new content wearing a structural slice's
  clothes.
* **The `assumed` list is NOT in the result JSON**, deliberately.  A published
  block no golden kind can read arrives unpinned
  ([`which-result-blocks-a-golden-can-read.md`](which-result-blocks-a-golden-can-read.md)),
  and a new word-valued golden kind is its own slice.  The FACT still reaches
  the JSON — through the advisory channel, which is where "what this run
  assumed" belongs.

## 6. Rejected alternatives

* **Reconciling L/D to a single value in the one home.**  Rejected above: it is
  a curation decision and it moves goldens.  The home records the disagreement
  instead, which is the honest shape of an unmade decision.
* **Writing the assumed values into the sheet as a second `assumed { }` block
  with numbers.**  Rejected: `L_over_D` is already in `sizing { }` five lines
  up, so the file would state one number twice — the arity sin, committed by
  the slice that exists to close it.  A list of KEYS costs the value of the two
  unpublished inputs and buys a file that cannot drift against itself.
* **Keeping the banner and having it read the model's dict directly.**
  Rejected: it is still a second reader of one fact, one indirection further
  away.  The model publishes; the pass draws.
* **A `defaults {}` block in `postDict` that a case could set globally.**
  Rejected outright: it makes the assumption easier to make and no easier to
  see, which is the opposite of the goal.
* **Announcing the four Guthrie constants only when they differ from what the
  case declared elsewhere.**  Rejected: a conditional announcement whose
  condition nobody can state is a heuristic, and heuristics rot.  The condition
  here is one sentence — *the case did not declare it* — and that is the whole
  rule.
* **A new gate script.**  Rejected: `check_cost_provenance` already builds the
  sizing + costing + design + economics probe and already carries the claim
  "this total can be defended".  Whether the constants it recomputes from were
  CHOSEN is the same claim, one layer down.

## 7. Proof that no number moved

Asserting it is not enough, so it was measured on both sides of the change.
For each of the 9 corpus cases that declare a `sizing {}` pass, the run's full
stdout, its stderr, and every file under `design/`, `reports/` and `converged/`
were captured before the first edit and again after the last.

* **8 of 9 cases: stdout, stderr and every artefact byte-identical.**
* **`ammonia02_full_plant`: the ONLY difference is additions** — six
  `[assumed]` lines, three `assumed:` lines beside the sizing basis, five new
  entries in the caveat block, five new advisories in the result JSON, and an
  `assumed ( ... )` list on three of its specification sheets.  Its
  `sizing.csv`, `costs.csv`, `massBalance_byUnit.csv`, every `converged/` file
  and every number on every sheet are unchanged.
* The full `bin/runTests` corpus then ran to **PASS 590 / FAIL 0 /
  KNOWN-BROKEN 0 / EXPECTED-FAIL 6** (the six are the tree's existing
  deliberate refusals).

That `ammonia02` is the one case that changed is not a coincidence: it is the
only shipped case that takes any of these defaults, which is the finding in
§2 turned into evidence.

## 8. The gate

`check_cost_provenance` gains six arms — (j) the header states the index that
priced, (k) a SOURCE arm on the arity, (l) a default that is used is announced
on all three surfaces, (m) a declared value is announced nowhere, (n) the sheet
says which, (o) the policy says whose it is — and its probe was changed in two
ways that are themselves load-bearing: it declares `cepci 861`, which is NOT
the engine default (it declared 820 before, so a hard-coded header and a
correct one were indistinguishable), and it stops declaring `jointEfficiency`
so a default is actually taken.

**A LIMIT STATED RATHER THAN HIDDEN.**  Arm (k) is a SOURCE arm because no
output arm can separate a header that re-reads the dict from one that draws the
model: when the case declares the key both find the same number, and when it
does not, both fall back to literals that agree.  *That agreement is the
defect.*  A structural claim is checked structurally, and the OK line says so.

Eight by-hand sabotages under `bin/curate/destructive_session.py`'s journal
(never by the gate — a gate that patches a source and rebuilds the engine is
the 2026-08-18 tree-poisoning shape).  None survived.  Every observed line is
written into the gate's docstring; two are worth repeating here:

* **S16** made the announcement UNCONDITIONAL — it fires even on a declared
  value, with the value itself unchanged so no number moves.  Arms (m) twice
  and (n) once.  This is the negative's own test, and it is the sabotage most
  worth having, because the broken version looks *more* diligent than the
  correct one.
* **S17** restored the four dead in-class initialisers in `Guthrie.H`.  It
  changes no output whatsoever, because they were never read.  Only a source
  arm can see a second home that nothing consumes — and a second home nothing
  consumes is exactly the one that will be consumed by mistake later.

And one limit the sabotages found in the gate itself: **S12 and S13 produce the
identical sentence.**  Arm (n) sees one absence — the sheet has no `assumed`
list — and cannot tell "the record lost the mark" from "the writer stopped
writing it".  It names both causes at once, which is honest but is not two
arms.

## 9. What the suite caught that no reading would have

`check_std_includes` failed the first full run:

```
FAIL  std-include-gate
  src/postProcessing/costing/Guthrie.H uses std::map< without #include <map>
  src/postProcessing/costing/Guthrie.cpp uses std::map< without #include <map>
```

`pricingFactors()` returns a `std::map` from a header that leaned on
`CostingModel.H` happening to include one.  **g++ lends a transitively
included declaration and emscripten's libc++ does not** — the exact split that
left www.choupo.org serving a three-commit-stale bundle on 2026-08-27, and the
exact reason CLAUDE.md's rule is that a green native suite says nothing about
the site.  It compiled natively, ran the whole corpus, and would have died in
`make wasm`.  Two `#include <map>` lines; caught by a gate, not by a reader,
and worth writing down because it arrived on the first header this slice
added.

## 10. A finding, reported and not fixed

The costing banner prints `Method:  Guthrie` on all eight corpus cases, and
every one of those cases declares `method Turton;`.  `Guthrie::type()` returns
the class's own word, not the registered name the author wrote.  The
2026-09-03 ruling is that **the registered name is `Turton`** and `Guthrie`
survives as an announced alias — so the header names the model by a word the
ruling demoted, on cases that used the promoted one.  No number depends on it.
It is named here rather than changed, because it moves console output on every
costing case and the alias rule is Vítor's.
