# The problem solved is not always the problem posed

**Status: RULED 2026-08-11 (Vítor: "GO on `problemDivergence` + mandatory prior
authorisation of approximations").  SHIPPED the same day for the two downgrades
the agent test actually produced.  Gate: `check_problem_divergence`.**

---

## 1. What happened

An end-to-end agent test was given a normal chemical-engineering request and
told to build, run and repair a Choupo case using only the public interfaces.
It got to a converged acetone process.  It got there by downgrading the physics
twice:

* a rigorous `distillationColumn` replaced by a `shortcutColumn` (FUG), because
  a component lacked a `liquidHeatCapacity` the rigorous column needs;
* a declared NRTL liquid run as **ideal** on two binary pairs, because no
  parameters existed for them.

Both downgrades were declared — **in comments the agent chose to write**.
Nothing in the result JSON, the KPIs or `converged/` carried either.  The
distillate still read 99.55 mol% acetone, and a reader six months later would
have had no way to know what that number was an answer to.

The agent behaved well.  That is the point: honesty was left to the author's
discretion, and discretion is not a contract.

---

## 2. The distinction being protected

> An **advisory** says the answer is qualified.
> A **divergence** says the answer is to a **different question**.

"Antoine extrapolated 3 K beyond its declared range" leaves the question
unchanged; the number is still the answer to what was asked, with a stated
caveat.  "Your declared NRTL pair ran as ideal" does not — the case describes
one problem and the engine solved another.

**They must not share a channel.**  A run emitting nine extrapolation warnings
makes the tenth line invisible, and one of them is not a warning at all.  So
this is *not* `AdvisoryLog` with a new severity: it is a separate record, on a
separate surface, printed **above** the caveats and emitted **above** the KPIs.

---

## 3. The contract, inverted

Until 2026-08-11 the order was: the downgrade happened, and declaring it was
optional afterwards.  Now:

| | |
|---|---|
| an approximation the case **authorised** | runs, and is **RECORDED** |
| an approximation **nobody authorised** | **REFUSED**, with the way out |

Authorisation is the presence of a delimited block — the same mechanism
`approximations { idealMolecularVLE { … } }` already used, extended rather than
duplicated:

```
approximations
{
    idealBinaryPair
    {
        pairs  ( acetone-water isopropanol-water );
        reason "no curated parameters; ideal accepted pending curation";
    }
}
```

### Two kinds, and they are different

* **SUBSTITUTION** — the engine would otherwise deliver something other than
  what was requested.  Refused unless authorised: the author asked for one
  thing and would silently receive another.
* **DECLARED APPROXIMATION** — the author chose an approximate model knowingly
  (an FUG shortcut column).  **Not refused**: it is what was asked for.  But
  recorded, because a stream table cannot show that the column was a shortcut,
  and FUG's own assumptions — constant relative volatility, no azeotrope
  representable — may be exactly what the process turns on.

That is why `Divergence` carries a `kind` rather than being a refusal list.
Both are divergences from the rigorous problem and a reader needs to see both;
only one of them is anybody's mistake.

---

## 4. Where the authorisation lives, and why

**Top level of the thermophysical system, beside `idealMolecularVLE`.**  Not
inside `activityModel {}`.

That placement is not economy, it is meaning: *the authorisation is a statement
about the CASE, not about the model*.  An author writing "ideal is acceptable
for this pair" is making a scientific concession about their problem.  Filing
it inside `activityModel {}` would record a scientific concession as a
configuration parameter of an object, and would give one decision two homes in
the grammar.

### The problem this created was PROPAGATION, not grammar

An activity model's constructor receives only the `activityModel` sub-dict and
can never see the top level.  Six call sites construct activity models.
Threading a parameter through all six would have spread the decision; letting
each re-parse the block would have given the parse six homes and let them
drift.

So the block is parsed **once**, at `buildV2Dispatch` — the single dispatch
every v2 formulation passes through — and consulted from
`ApproximationAuthorisation`.  Same shape as `readIdentity()` /
`readAqueousMapping()`: one parse, several callers, never a second copy of the
parse.

**The first version put the parse in the wrong place** and it is worth
recording why.  It sat beside the existing `idealMolecularVLE` reader, which is
inside the *reactive electrolyte* branch.  A parse reachable on one formulation
out of five leaves the other four in the NotRead state — and NotRead means "may
not refuse".  The authorisation would have been silently unenforceable on
exactly the molecular cases the contract exists for.

---

## 5. The ordering hazard, and what the sabotage found

A run-scoped record consulted by a constructor is only safe if *"nobody read
the case yet"* is distinguishable from *"the case authorises nothing"*.
Collapsing those two would let a construction path that runs before the read
produce a refusal the author cannot escape — a false refusal, which is the
exact defect this slice exists to remove.  So the state is tri-valued:
**NotRead** (may not refuse) · **Read-empty** (must refuse) · **Read-listed**.

**Then sabotage S1 forced the NotRead branch on, and the gate stayed green.**

No probe and no corpus path reaches NotRead: with the parse at
`buildV2Dispatch`, `wasRead()` is always true by the time an activity model is
constructed.  The tri-valued state is therefore a construction-**order** guard,
not an observed need — and its branch silently converted a refusal into a
recorded substitution where nobody could see it.

Writing that sabotage up as a pass would have been a false claim about
coverage.  Instead:

* the branch now **announces itself as an engine defect** (`[divergence] … the
  case-level approximations block was NEVER READ on this construction path …
  this is a DEFECT in the construction order, not an authorised approximation`)
  and stamps its divergences `UNEXAMINED`;
* gate arm **A8** asserts no witness reaches it;
* sabotage **S4** (bypassing the ONE parse) proves A8 fires, and A8 is the only
  arm of six that names the *cause* rather than the symptom.

*A guard nobody can see fire is indistinguishable from no guard.*

---

## 6. The four surfaces

| surface | where | why there |
|---|---|---|
| human block | **above** the ASSUMPTIONS AND CAVEATS block | a reader must learn which problem was solved before reading how well it was solved |
| result JSON | `"problemDivergence"`, **above** `"kpis"` | a consumer that reads the numbers first would learn only afterwards that they answer a different question |
| `converged/problemDivergence` | a dict record in the state directory | `converged/` is the disk truth a drill-in materialises a child `0/` from; a child inheriting numbers without the statement of which problem produced them inherits a falsehood |
| the GUI results band | **above** the solver-advisories band, same screen | a GUI reader who never opens the log is the reader most likely to take a number at face value.  The GUI **renders** the engine's verdict — `kind`, `requested`, `solved` are the engine's words — and computes none of its own (philosophy §3c) |

The first three are written **always**, empty included.  Silence must mean "nothing
diverged", never "the block did not run" — the same rule the caveat surface
follows, for the same reason.  The `converged/` record is invisible to the
0/-completeness validator, which reads bodies (`looksLikeStreamState`), not
names.  The GUI band is the one exception to "always": it appears only when
non-empty, because the "silence is a real answer" line is the run log's job and
repeating it on every result screen would be noise where it is not news.

---

## 7. What the corpus turned out to be hiding

**Two cases out of ~480**, and they are not the same kind of finding.

### `crystalliser09_KHT_KCl_series` — a defensible approximation, undeclared

Its rectifier overrides the activity model to NRTL so the ethanol–water
azeotrope is represented, and in that world its two salts have no binary pair.
The flowsheetDict said so, in a comment:

> *"the salts, with no NRTL pair, stay ideal and nonvolatile → the bottoms"*

That comment is exactly right — both salts leave in the bottoms and take no
part in the VLE the column solves — and it was the only record of it anywhere.
The case now carries the authorisation as a machine-readable block with the
author's reasoning, and the five substitutions ride the result.

### `esterification2sector` — a known-poor approximation, undeclared

Four of its six binary pairs resolve; the two **acetic-acid** pairs did not,
and ran ideal.  Acetic acid + water is strongly non-ideal and acetic acid
associates in the vapour (Choupo models that dimerisation elsewhere — flash13),
so ideal is a *known-poor* approximation here, not a benign one.  Nothing said
so anywhere.

The case teaches WHERE A PAIR RECORD LIVES (the fractal `constant/` walk-up),
not acetic-acid VLE, so the pairs were not curated to close it — inventing
values would convert *unsourced* into *falsely sourced*, which no reader and no
gate can detect.  Its authorisation block states plainly that no separation
number it reports is a physical claim, and that the answer is **expected to
move** the day the pairs are curated.

*This is the whole value of the contract in one case.*  The engine cannot judge
whether ideal is acceptable — but it can force somebody to say, in writing,
beside the number, that the question was changed.

### Neither golden moved

The substitutions were already happening; only their declaration is new.  That
is the expected outcome for every case this contract touches — a moved golden
would mean the physics changed, and the physics did not.

---

## 8. What is deliberately NOT covered

* **Only two downgrade families are wired**: `shortcutColumn`, and the three
  pair-parameter activity models (NRTL, UNIQUAC, Wilson).  Vítor's instruction
  was explicit — *"focus first on the two real downgrades found by the agent
  test, not on discovering every possible approximation in Choupo"*.  Any other
  downgrade is UNCOVERED, and the gate says so rather than implying coverage
  with a green line.
* **Whether an authorised approximation is scientifically acceptable** is the
  author's judgement.  The engine demands a `reason` and publishes it; it does
  not grade it.
* **The refusal decision has ONE home** (`resolveIdealPairSubstitution`), for
  the obvious reason: three transcriptions of one refusal would be the arity
  sin committed inside the machinery built to enforce it.

---

## 9. Two things found on the way

`check_ctrl_balance` scanned the **whole** run output for the substring
`"diverge"` to detect an unclean seal re-stamp.  It went red the day this
slice's block started printing *"No divergence declared or imposed"* on a clean
run — a gate reading a clean run as a dirty seal.  Every seal message is
prefixed `[seal]`, and the check is now taken on those lines only.

*A gate matching a bare English word against a whole log is claiming the word
belongs to it.*

---

And, from running the GUI suite for the fourth surface: the GUI's unit table
knew `%` but not `percent`, while the engine's (`src/core/Units.cpp`) has
carried both spellings all along.  **Three curation tutorials could not be
OPENED in the GUI at all** — `props/curation/curate01…03` write `maxAAD 0.1
percent;` and were skipped at index time with a parse error, which reads to a
student as *"this case is broken"*.  One word, added in `gui/src/dict/units.ts`.

Two tables for one vocabulary is the arity sin, and this is the second time
that pair has drifted.  Until they share a source, a spelling added to one
belongs in the other **in the same commit**.
