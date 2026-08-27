# The key nobody read, one layer out: postDict

*Record of a defect found while walking the corpus as a student, 2026-08-27.*

## 1. What happened

Leg 4 of the student walkthrough is the one that decides whether the student
passes: sizing, costing, and the defence — whether they can say where each
number came from when the jury asks.  A knockout drum was sized and priced:

```
  unit          equipment       F_M     F_P     C_purchased   C_bare_mod    C_total_mod
  knockout      vessel          3.05    1.00    18104         141231        166653
```

The `system/postDict` that produced it declared:

```
costing
{
    method  Guthrie;
    targetYearCEPCI  800.0;
}
```

The run printed `CEPCI: 820.0`.

`targetYearCEPCI` is not a key.  The model reads `cepci`.  The declaration
parsed cleanly, sat in the dict, was never consulted, and the plant was priced
at the default index — **2.5 % of the capital cost, on a number the author
believed they had set, with nothing anywhere saying otherwise.**

Exit 0.  A defensible-looking table.  The student stands up and defends a
capital cost computed at an index they did not choose.

## 2. Why the existing machinery did not catch it

`src/core/DictAudit` exists precisely for this.  It was built on 2026-08-14
(commit `700672a24`) after the same failure one layer in — `murphreeEficiency`
parsing, never being read, and the column running ideal-tray.  Its diagnosis is
already the good one: it matches the unread key against the keys the CODE asked
for and did not find, by edit distance, so there is no hand-kept list of legal
names to drift.

It was wired at **exactly one site**: each unit's `operation {}` sub-dict, in
`Flowsheet.cpp`.  Its own header states the scope and the reason:

> SCOPE.  Only NUMERIC/parameter dicts a unit operation reads — the place where
> a silent default changes an answer.  Not the whole file: a case dict
> legitimately carries keys for other readers (the GUI's layout, an outer
> driver's block), and a diagnostic that cries about those trains the author to
> ignore it.

That reasoning is right, and it does not reach `postDict`.  **`postDict` is a
pure parameter file**: every key in it belongs to the pass named immediately
above it, there is no other reader, and a silent default there changes an
answer exactly as it does in `operation {}`.  It was not excluded by the scope
argument; it was simply outside the one place the call was made.

## 3. What was built

Three parts, each small.

**(a) `Dictionary::childDictsUnnoted()`** — enumerate the sub-dictionary
children (a `{...}` entry, and every member of a `( {...} {...} )` list)
without consulting anything.

This is deliberately NOT written in terms of `subDict()` / `lookupDictList()`.
Those call `note()`.  An auditor walking the tree to ask *"what did nobody
read?"* would mark every block it visited as read on the way in, and then
report that nothing was unread.  **A check that erases its own subject is worse
than no check** — the `check_true_ions` shape, reached by a third road.

**(b) `dictAudit::auditTree()`** — audit a dict and its sub-dictionary tree,
`where` naming the dotted path (`postDict sizing units[0].designRules`), so a
finding names the block the author can find in their own file.

A block that is itself unread is REPORTED and NOT descended into.  *"The whole
`designRules {}` block did nothing"* is one true line; six lines about its keys
would bury it and imply six separate mistakes.

**(c) The menu, where edit distance has nothing to say.**  `targetYearCEPCI` is
not a misspelling of `cepci`; it is a different word, and no distance threshold
should ever connect them.  A bare *"this key did nothing"* leaves the author
with a complaint and no move.  So when no near miss is reachable, the finding
carries the keys the block's reader asked for and did not find, printed **once
per block**:

```
[dict]   postDict costing: `targetYearCEPCI`
[dict]     this block's reader looked for and did not find: cepci cepci2001 usdToEur year
[dict]     -- if one of those is what you meant, it is the name to write.
```

Same shape as the vessel-sizing refusal listing the KPIs the unit publishes,
and as the costing factory listing its registered methods: **name the choice,
not only the absence.**

## 4. Where it is called, and why there

One call site, in `choupoSolve`'s `main.cpp`, **after** the post chain has run.

- *After the chain*, because the passes read at construction AND at run.
- *Once for the whole tree*, because the outer drivers rebuild their chain per
  evaluation from this same `DictPtr`: the reads accumulate on these objects,
  so one audit at the end sees them all, where auditing inside `buildChain`
  would repeat itself once per sweep point.

## 5. It announces; it does not refuse

Unchanged from the 2026-08-14 posture, and for the same measured reason: the
corpus is the evidence for whether the corpus can take a refusal.  Turning the
warning into a refusal is one line once the number is known.  Guessing the
number and refusing is how a teaching tool becomes one that will not run.

The corpus count is reported in §7 below.

## 6. What this does NOT cover, said plainly

- **`choupoBatch` / `choupoCtrl` / `choupoProps`** — the wiring is in
  `choupoSolve` only, because `postDict` is a steady-path file.  A batch
  campaign's dicts are not audited by this slice.
- **`controlDict`, `flowsheetDict` above the `operation {}` blocks,
  `solverDict`, `outerDict`, `postDict`'s siblings in the case** — all still
  outside.  `solverDict` in particular is a parameter file of the same kind and
  is the obvious next candidate; it is not done here because it was not
  measured here.
- **A key read by the WRONG reader.** The audit answers "did anybody read
  this?", not "did the intended reader read this?".  A key that two blocks
  could plausibly own, written in the wrong one but read by the other, passes.

## 7. Corpus measurement, and the three things it found

Nine tutorial cases carry a `postDict`.  On the first run of the audit over
all nine, **six were clean and three had findings — seven in total, across
three distinct keys**:

| key | where | what it turned out to be |
|---|---|---|
| `method` (in `economics {}`) | 3 cases | **decorative** — the pass is hardcoded DCF and read nothing |
| `constructionPeriod` | 3 cases | **read by nothing in the whole tree** |
| `langFactor` | 1 case | honest: that case's economics pass refuses on missing prices and never reaches the read |

Two were closed the same day, and neither moved a number.

**`method`.**  Three cases declare `method discountedCashFlow;`; nothing read
it.  The pass is hardcoded DCF, so the key parsed, sat there, and the author
believed they had *selected* something.  It is read now, and any other value
refuses by name.  There is one method and every case names it, so no answer
moves — but a key that does not exist now says so.

**`constructionPeriod`, and this one is the sharper find.**  Zero occurrences
in `src/`.  The cash-flow timeline hardcodes one year — its own comment says
so: *"Year 0 = construction (-FCI and -WC at startup are both placed at t=0
here for a 1-year construction)"*.

**`ammonia02_full_plant` declares `constructionPeriod 2;`**, deliberately,
beside `projectLife 15`.  Its published NPV of €196.5 M is therefore
discounted over a ONE-year construction while its own `postDict` says two —
a shipped case whose answer does not match its declaration, silently, since
the key was written.

It is read now, and a value other than 1 is **ANNOUNCED**, on the console and
in the end-of-run caveat block, saying exactly what the DCF did instead.  The
NPV does not move.

### The mistake I made here, because it is the slice's own subject

The first version of this fix **refused** anything but 1, and this section
claimed *"all three cases that declare it declare 1, so every published NPV is
right by coincidence"*.

Both were wrong, and wrong the same way.  I measured the three cases the audit
had **flagged** and generalised to the nine that exist — an inference recorded
as a measurement, which is the sin this whole record is about.  Nine carry a
`postDict`; six declare `constructionPeriod`; one of those declares 2.

Then I verified the fix by re-running the three flagged cases and reading
"zero `[dict]` findings" as success.  **A crashed run prints zero findings
too.**  Absence read as affirmation — inside the machinery built against
absence being read as affirmation.  `ammonia02` had been failing outright and
I recorded it as clean.

The refusal was also the wrong instrument even had the corpus allowed it.  A
case declaring 2 has an author who meant 2; refusing is my judgement
overriding theirs, and implementing a real multi-year draw-down MOVES a
published NPV, which is a scientific decision and is reserved.  Announcing
states the gap beside the answer and moves nothing — what this project does
with every other declared-but-unmodelled fact.

`langFactor` is left as it is: the audit is reporting the truth about that
run.  Its economics pass refuses on missing prices before reaching line 403,
and the audit names exactly the two keys the aborted pass never reached — the
other sixteen were read before the refusal.  Precision, not noise.

After the two fixes the corpus stands at **one finding, and it is a true
one** — plus one shipped case now announcing that its declared construction
period is not the one it was costed on.

### The fourth thing, found by the probes rather than the corpus

A misspelled **required** sub-block never reaches the audit: `subDict()`
throws first.  It threw `missing sub-dictionary 'designRules'` — true, and
silent about the `designRuls` sitting three lines above in the same dict.
*The evidence was in hand and unread.*

`Dictionary::missingKeyHint_()` now suffixes all four missing-key failures
(`entryValue`, `lookupScalar`, `lookupWord`, `subDict`) with what the dict
declares and, when one is within a typo's distance, which one:

```
ERROR: Dictionary 'units[0]': missing sub-dictionary 'designRules'
  This dict declares: unitName type material designRuls
  Did you mean `designRuls`?  The code asked for `designRules`, and that is the closest name here.
```

It uses `dictAudit::editDistance` rather than a second copy — two edit
distances that could disagree is one more than this project keeps.  This is
the mirror of the audit: the audit matches an *unread* key against the keys
the code asked for; this matches an *asked-for* key against the keys present.

## 8. The second finding, not fixed here

The costing model is registered as `Guthrie` and its correlations are
**Turton's** — `K1/K2/K3` from Appendix A, `B1 = 2.25, B2 = 1.82` from the
bare-module table, 2001 USD, CEPCI-scaled.  The header says so
("Guthrie (1969) / Turton (4th ed., Appendix A)"); the printed table says only
`Method: Guthrie`.

A student asked *"where does the bare-module factor 7.80 come from?"* has to
find `2.25 + 1.82 x 3.05` in the source, and the word on their own output
points at the wrong author.  Guthrie is the ancestor of the method — he
invented the module-factor approach — and Turton is where every number in the
file comes from.

This is a naming and attribution question, not a numerical one: no value moves
whatever is decided.  **Renaming a registered factory key is a corpus-wide
change and an attribution ruling, so it is recorded here and reserved for
Vitor**, alongside the narrower question of whether the costing table should
print its basis (2001 USD, CEPCI 397 -> target, USD->EUR rate) beside the
total, so that four hidden decisions stop hiding behind one number.


## 9. The process lesson, paid for in a killed suite

`bin/runTests` was edited while a full run of it was in flight — to wire in a
new gate.  **Bash reads a script incrementally from a held file offset**, so
rewriting it under a live run makes that run execute torn bytes.

The run was killed and repeated, which cost forty minutes.  The interesting
part is what it printed first:

```
FAIL  component-name-hint-gate
check_component_name_hint: FAILED
  - a case whose component names are all correct no longer reproduces its
    golden -- the lookup's happy path must never touch the new search
```

That gate shells out to `bin/runTests <case>` and reads the tally.  It got no
tally, because the harness it invoked had been rewritten mid-flight — and it
reported **a moved answer**, sending the reader to `Database.cpp`, where
nothing was wrong.  On a quiet machine with a fresh build the gate passes.

`check_friction_correlations` had already paid for exactly this once, in its
own sabotage run, and had grown a local fix: a list of phrases the harness
prints when it declines.  `check_component_name_hint` had grown a different
half of the same fix.  **Both were lists of the reasons ALREADY SEEN**, so a
new way to produce no verdict read as a moved answer again.

`bin/curate/runtests_verdict.py` is the one home now, and its claim is
**positive**: *moved* is asserted only when the harness printed a verdict line
for that case.  Anything else is `could-not-run`, with the harness's own
output carried back so the caller says WHY instead of guessing.

*A check that cannot run must not pass — and must not fail with a false reason
either.  Diagnosing a cause the evidence does not establish is worse than
reporting nothing, because it sends the next reader to the wrong file.*

Converted: `check_component_name_hint`, `check_friction_correlations`.  The
other ~17 gates that shell out to `bin/runTests` still carry their own
readers; they are not converted here, and this is said rather than implied.
