# Four decisions that are Vítor's — 2026-08-03

**Status: PROPOSAL ONLY.  Nothing here is implemented, and nothing will be
until you rule.**  Written at the end of the week's seven doctrine slices,
which surfaced four questions the code cannot settle on its own.  Each
section states the question, WHAT IS MEASURABLY TRUE TODAY (not what I
expect), the options with their cost and risk, and a recommendation you can
overrule in one line.

Companion records: `basis-reconciliation-spike.md` §8 (decisions 1–3),
`computational-seal-migration.md` §3 (decision 4).

---

## 1. Does a unit that does NOT preserve composition carry the block?

**The question.**  The basis spike's transport contract fires for a
composition-preserving unit — one material in, one out, F and z untouched
(the heater/pump class).  A SPLITTER divides matter: two outlets, each a
fraction of the inlet.  Its inlet's speciation block is extensive (kmol/s
per species), so carrying it unchanged to both outlets would double the
ions.

**True today.**  The contract refuses to fire: the composition test
(`F` equal AND `z` equal) fails for a splitter, so its outlets simply get
no block, and the post-solve pass re-derives one with the global package.
For a splitter under a molecular override, that re-derivation is the silent
respeciation the spike names — but nobody has written such a case, so the
situation is latent, not live.

**Options.**

| | What it does | Cost | Risk |
|---|---|---|---|
| **A. Scale the block by the split fraction** | each outlet gets its inlet's block × its own F ratio | ~20 lines; needs the unit to declare it splits rather than transforms | a split is exactly linear in extensive amounts, so the arithmetic is safe — but "which units may claim it" becomes a new classification, and a wrong claim is a wrong answer |
| **B. Refuse by name** | a non-preserving unit under a foreign world stops the run, naming the gap | ~10 lines | refuses a case that has a physically sensible answer; the author must split upstream of the boundary |
| **C. Leave latent** | nothing until a real case needs it | 0 | the silent respeciation stays reachable, and the next person meets it as a wrong number rather than a refusal |

**Recommendation: B now, A when a case asks for it.**  B converts a latent
wrong answer into a named refusal for the cost of ten lines, which is the
project's own posture (explicit refusal over an incomplete model).  A is
correct arithmetic but introduces a per-unit claim, and a claim nobody
exercises is a claim nobody tests.

---

## 2. Should the post-solve reporting pass stamp an origin of its own?

**The question.**  A block a unit solved is stamped `origin
"solved:<unit>"`; one it carried, `origin "transported:<unit>"`.  The
post-solve pass — which decorates every liquid stream that has no block,
including the INLETS — stamps nothing.

**True today.**  Those blocks carry an empty origin, which reads as
"provenance unstated".  Every pre-spike stream file in the corpus is also
unstamped, so absence currently means two different things: "written before
the spike" and "written by the reporting pass".

**Options.**

| | What it does | Cost | Risk |
|---|---|---|---|
| **A. Stamp `reported:<pass>`** | absence then means only "pre-spike" | ~5 lines + every converged/ file in the corpus gains a line | none to the answer (converged/ files are not golden-compared); it does move ~300 files the next time each case runs |
| **B. Leave blank, document the two meanings** | the doc carries the ambiguity | 0 | a reader cannot tell a reported block from an old one without checking the file's age |

**Recommendation: A.**  The whole point of `origin` is that a reader can
tell where a decomposition came from; leaving the most common producer
anonymous keeps the field half-built.  It is five lines and touches no KPI.

---

## 3. Should R1 (charge) and R3 (unknown species) refuse BY NAME?

**The question.**  Both refuse today — but through the `m = A n` collapse
check, which reports "the block does not collapse back" whatever the cause.
A charge-imbalanced block and a mistyped total get the same message.

**True today.**  Measured, not assumed: all three of R1, R2, R3 produce the
identical collapse message.  Naming charge needs the species-charge surface
at the READER; `SpeciationSolver::chargeOf` exists but lives on the
speciator, which the stream reader does not hold — and the complete-
dissociation path has no speciator at all.

**Options.**

| | What it does | Cost | Risk |
|---|---|---|---|
| **A. Name them** | a charge check before the collapse check, and an id check before both | ~40 lines + a charge accessor reachable from the reader (a real dependency, threading the package's species table into `StreamStateIO`) | the dependency is the risk: the reader is deliberately thin, and widening it for a diagnostic inverts that |
| **B. Leave the net, document it** | the collapse catches everything; the message names the symptom, not the cause | 0 | a student debugging a hand-written block is told what broke but not why |

**Recommendation: B, revisited if it bites.**  The collapse net is not
leaky — it catches every case; it is only unspecific.  Widening the
reader's dependencies for a better error message is the kind of trade this
project usually declines, and no one has yet hit it in practice.

---

## 4. The 435 drifted seal origins — selective re-seal, or none?

**The question.**  435 sealed records' catalogue origins have evolved since
their cases were imported.  The standing policy (DEV.md debt #4) is NO MASS
RESEAL: seals preserve case history, and a case is re-sealed only when that
case is genuinely revised.  The computationalSeal migration now CLASSIFIES
the drift, so the policy can be re-examined with data instead of instinct.

**True today, measured.**

* Every one of the 435 is classified **COMPUTATIONAL** — the parsed content
  moved, not just comments.  So the classifier does not license a
  "cosmetic, ignore it" bulk answer.
* But the drift is **ADDITIVE**, not corrective.  The `git log` of the
  drifted records is this week's own work: the PC-SAFT association blocks
  (`water`, `ethanol`), the VT-2005 licence separation, the
  `aqueousSpeciation` facts the SystemClassifier contract requires.  No
  curated VALUE was corrected under a sealed case's feet.
* **Probe (n = 1, and stated as n = 1):** re-importing
  `flash02_ethanol_water` — whose `water.dat` origin drifted — installed
  the newer records, changed the record SET not at all, and the case's
  golden still passes.  The only content delta is an added
  `aqueousSpeciation none;` fact that this case's world never reads.

**Options.**

| | What it does | Cost | Risk |
|---|---|---|---|
| **A. Keep the policy; do nothing** | the 435 stay; the gate keeps reporting them | 0 | the report stays 435 lines long and stops being read — a warning nobody reads is a warning that has failed |
| **B. Measured selective re-seal** | re-import ONLY cases where a re-seal demonstrably changes nothing (golden still passes), leaving the rest listed | a scripted sweep + one suite run; each re-seal is a commit-visible diff | low, IF the criterion is "the golden is unmoved" — and a case whose golden DOES move is exactly the one you want to look at by hand |
| **C. Re-seal everything** | one bulk commit | cheap to run | rewrites ~300 manifests in one stroke and destroys the distinction between "provenance refreshed" and "physics reviewed" — the sin the migration was written to avoid |

**Recommendation: B, with the criterion stated up front.**  Not because
re-sealing is good hygiene, but because it is the only option that turns
the 435 into a SHORT list: after B, whatever still drifts is a case where
the catalogue's evolution actually reaches the answer — which is a curation
finding worth your time, and is currently buried in 435 lines of noise.
C is explicitly rejected for the reason the seal migration exists.

**What B would need from you before it runs:** whether "the golden is
unmoved" is a sufficient criterion, or whether you want the re-seal
restricted further (e.g. only cases whose drifted records are ADDITIVE by
the canonical diff, which is checkable).

---

## The one-line answers I need

1. splitter/foreign world → **refuse by name** / scale the block / leave latent
2. post-solve origin → **stamp `reported:`** / leave blank
3. R1+R3 by name → name them / **leave the collapse net**
4. seal drift → keep policy / **measured selective re-seal** / re-seal all

---

## Resolution — 2026-08-03, second opinion received

The counsel answered all four and amended three of them.  What follows is
the ruling as received, and where each stands.

**A — seal drift: my recommendation was REJECTED.**  "Do not re-seal, not
even selectively, merely because the goldens do not change."  (Translated from
the Portuguese original: *"Não re-selar, nem sequer selectivamente, apenas
porque os goldens não mudam."*)  The reasoning
I could not refute is that `same golden` does not imply `same sealed
artifact`: the seal asserts *this case contains exactly the data imported
and accepted at that historical moment*, and refreshing it changes the
provenance, the documentary state, the catalogue version reproduced, and
potentially future behaviour if a new feature starts consuming the newly
added blocks.  My criterion confused output stability with continuity of
historical identity.  **The 435 are not the problem; the REPORT is.**  The
fix is aggregation by severity class, two distinct KPIs
(`sealedReproducibilityFailures` vs `catalogDivergenceCount`) so "435
differences" can never read as "435 broken cases", and expanding only the
classes that need a human.  Re-sealing stays legitimate for exactly three
reasons: the case was scientifically reviewed, a new pedagogical version
is wanted deliberately, or a format migration with a verifiable
transformation that PRESERVES the previous artefact.  **Status: to build
(report restructure).**

**B — the transported equilibrium: my recommendation was INSUFFICIENT.**
`solvedAtT` makes the datum traceable, not valid.  The amounts are a
material inventory and travel; the equilibrium is a relation to a state
and does not.  **Status: BUILT** — `equilibriumValidHere`, pH withheld
rather than inherited, staleness decided from moved T/P rather than
assumed for anything transported, announced, gated (C4b), sabotage-
verified.  See `basis-reconciliation-spike.md` §9.

**C — the splitter: my recommendation was REJECTED.**  "Recusar parece-me
prudência excessiva."  A proportional split of an extensive inventory is
exact algebra, not a thermodynamic hypothesis; the engine already knows
the fractions; refusing forces the author to restructure a flowsheet
around an artificial incapacity, and — worse — leaving the post-solve pass
to re-derive is the worst of the three options, since it replaces known
arithmetic with a model-dependent answer.  The argument "untested code" is
answered by writing the witnesses, not by preferring an equally untested
refusal.  The contract must key on a DECLARED CAPABILITY
(`materialMapping proportionalExtensiveSplit`), never on a class name.
**Status: to build.**

**The two I considered settled: both confirmed**, with one refinement — the
post-solve stamp must distinguish `producedBy` from the unit that
physically solved the chemistry, so a serialising pass never appears to
have performed an equilibrium.
