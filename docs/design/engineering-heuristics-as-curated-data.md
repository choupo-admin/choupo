# Engineering heuristics as curated data, and a map that shows them disagree

*Status: PROPOSED 2026-08-17.  Format decided, no implementation started.
Raised by Vítor: "eu acho que era bom ter rules of thumb, com mapas de
interação de heurísticas para adsorventes e outras coisas típicas de
engenharia química.  Eu sei que os meus alunos têm dificuldade em escolher
algumas coisas óbvias por terem falta de experiência."*

---

## 1. The objection that was raised, and why it was the wrong one

The first response to this request was to reframe it: compute a working
capacity from the curated isotherms and rank on that, keep heuristics out.
That was wrong, and the reason it was wrong is worth stating because it
generalises.

A rule of thumb is not a guess.  It is **compressed experience with an
author, a date and a domain of validity** — which is exactly what a
correlation is, and this project already ships correlations with primary
citations, validity windows and provenance marks.  Nothing about a heuristic
is less legitimate than an Antoine fit; what would be illegitimate is an
*anonymous* heuristic, with no source and no boundary, presented as though it
were computed.

Those are two different objects and the first response treated them as one.
The design below keeps heuristics and computations apart **structurally**, and
then admits both.

## 2. What the students actually lack, and what a book cannot give them

Knowing that a rule exists is the easy half; it is printed in Douglas, Seader
& Henley, Walas, Turton and Sinnott & Towler.  The hard half — the one
experience supplies and a table does not — is **what to do when two rules
point in different directions**, which is what happens in every real
selection.

So the deliverable is not a lookup.  It is a map of which rules FIRE on the
problem the student declared, which of them AGREE, and which of them
CONTRADICT each other, with the names of the people who wrote them.

**The load-bearing rule: the map shows, it never fuses.**  There is no score
that blends heuristics into a single recommendation.  A collapsed
contradiction is the one thing that would make this worse than not existing:
it would hand a student a confident answer assembled from an argument they
never saw, which is precisely the deficit it is meant to repair.  Where two
cited authorities disagree, the student sees them disagree.

## 3. The record

A heuristic is a **curated datum**, filed and reviewed like every other, not
an `if` buried in TypeScript.  House grammar throughout — a plain-text dict
with `provenance {}`, as `data/standards/parameters/adsorption/equilibria/`
already uses.

```
recordType      designHeuristic;
domain          adsorbentSelection;

statement       "Use a zeolite when the adsorbate is polar or quadrupolar and
                 the feed is dry; the cation field is what does the work.";

appliesWhen                     // machine-readable, so the map can FIRE it
{
    adsorbate.polarity    ( polar quadrupolar );
    feed.waterActivity    { max 0.01; }
}

recommends
{
    adsorbentClass  zeolite;
    strength        strong;     // strong | qualified | weak -- the CLAIM's force,
                                // never a weight to be summed
}

validity        "Fails where water is present at all: water outcompetes the
                 adsorbate on the cation sites, and the rule inverts.";

conflictsWith   ( regeneration-cost-favours-carbon );   // NAMED, never inferred

source
{
    author  "Yang, R. T.";
    year    1987;
    title   "Gas Separation by Adsorption Processes";
    locator "ch. 2";
}

provenance
{
    origin    citedHeuristic;
    curation  "transcribed <date>; wording is a paraphrase, not a quotation";
}
```

Four fields carry the design:

* **`appliesWhen` is declared, not coded.**  A rule that fires by a condition
  written in its own record can be read, reviewed and argued with by someone
  who does not read C++ or TypeScript.  This is the same reason the case
  declares its chemistry instead of a unit constructing it.
* **`validity` states where the rule FAILS.**  A heuristic without its
  boundary is the anonymous kind.  A record whose validity is empty must say
  so explicitly rather than omit the key — the `Trange unknown;` posture.
* **`conflictsWith` is NAMED, never inferred.**  Two rules recommending
  different classes are not necessarily in conflict; they may be answering
  different questions.  A machine cannot tell, so a machine does not decide.
* **`strength` is the force of the CLAIM, not a weight.**  It is displayed;
  it is never summed, multiplied or compared across rules to produce a
  ranking.  Naming it `strength` rather than `weight` is deliberate.

## 4. Where it lives, and why the separation is a directory

`data/standards/heuristics/<domain>/<rule-name>.dat`, a new top-level home
beside `components/`, `species/`, `chemistry/`, `parameters/`, `conventions/`,
`assets/`, `mixtures/` and `utilities/`.

A new directory needs a reason, and it is this: **the boundary between what
Choupo computes and what Choupo advises should be enforced by the layout, not
by a convention someone has to remember.**  A heuristic cannot end up inside
`parameters/` and be read by a thermodynamic model, because it is not there to
be read.  The project already uses this move — `AnalysisReconciler` includes
nothing from `thermo/` so that it *cannot* name a speciation solver, and a
gate reads that off the object file.  Same idea, one layer out.

## 5. The two columns, side by side and never blended

For adsorbent selection the engine has real physics to contribute: the
catalogue carries Langmuir isotherms with isosteric heats for **three
adsorbents (activated carbon, zeolite 13X, zeolite 5A) over five adsorbates
(CO2, CH4, N2, H2, O2)**.  From those, the **working capacity** between the
declared adsorption and regeneration conditions is a computation, not a
rule — Δq = q(p_ads, T_ads) − q(p_reg, T_reg), off the same isotherm the
engine uses in PSA and TSA.

So the tool shows two columns that are visibly different kinds of thing:

| | what it is | where it comes from |
|---|---|---|
| **computed** | working capacity, and the regeneration duty implied by dH_ads | the curated isotherm, evaluated |
| **advised** | which rules fire, agreeing and conflicting | the heuristic records, cited |

They are never combined into one number.  A student may well find that the
computation and the rules point different ways — that is a finding worth
having, not a defect to be smoothed.

**And the tool must say how thin the catalogue is.**  Three adsorbents is not
a survey.  A "selection" tool over three candidates that does not say so
implies a completeness it does not have; it reports what it compared and names
what it did not.

## 6. What is deliberately refused

* **No invented heuristic.**  A rule with no traceable source is not
  transcribed, however sensible it sounds.  Inventing a citation converts
  *unsourced* into *falsely sourced*, which no reader can detect — the same
  ruling that left eighteen missing citations pinned rather than filled.
* **No blended score**, per §2.  This is the one that will be asked for.
* **No rule that fires on a condition the case cannot declare.**  If
  `appliesWhen` needs a fact the case has no way to state, the gap is in the
  case grammar and is a finding, not something to paper over with a default.
* **No silent precedence.**  If two rules conflict, neither wins.  There is no
  ordering, no seniority by author, no "most recent wins".

## 7. First slice

One domain, done properly, with the citations right: **adsorbent selection**,
because it is the one where the engine can already put a computed column
beside the advised one.  Ten to fifteen rules, each transcribed from a named
source with its page, each with its validity, and the conflicts between them
named by hand.

Sequencing rules for separation trains (Douglas, Seader & Henley), reactor
choice, and materials of construction are the obvious next domains — and each
of them is a curation act, not a GUI feature.  The tool is a view; the work is
the records.
