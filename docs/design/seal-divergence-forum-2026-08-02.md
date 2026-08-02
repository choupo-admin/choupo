# Forum — seal divergence: announce or refuse? (2026-08-02)

**Convened by:** Vítor, on the standing §4b decision *"Seal divergence:
announce or refuse?"*, with the instruction *"ve com o forum de
professores e alunos do MIT"* — so this forum seats **both panels**, and
the students are not an audience here: their objection is the one that
decides the question.

**Panels.** Professors: applied phase equilibria (chair), process
systems, and — because this is a claim-making question before it is a
thermodynamics question — the research-integrity chair. Students: a
first-year taking the transport-phenomena course, a masters student
building a thesis chapter on Choupo, and a doctoral student who archives
her own cases.

---

## 1. The measured fact the forum was handed

The runtime hashes every record a sealed manifest claims and reports
which diverged (built 2026-07-31). Before debating whether it should
*refuse*, the panel asked where the announcement GOES. Measured in the
tree this morning:

```
src/applications/choupoSolve/main.cpp:515:    records::verifySeal(verbosity);
src/applications/choupoCtrl/main.cpp:268:    records::verifySeal(verbosity);
src/applications/choupoBatch/main.cpp:222:    records::verifySeal(verbosity);
```

`verifySeal` **returns the divergence count, and all three binaries throw
it away.** `SimulationResult` carries no seal field; the result JSON says
nothing; `grep -i seal` over the emitter comes back empty.

So the announcement is a line on **stderr** — and nothing else.

*Research-integrity chair:* "Then the question as posed is malformed.
'Announce or refuse' presumes the announcement reaches whoever is
misled. It does not. A golden recorded from a diverged run is
byte-indistinguishable from one recorded from a verified run; a report,
a figure, a `converged/` directory — every artefact this project
produces — inherits the release name and not the divergence. The seal
currently makes its strongest claim exactly where nobody can hear the
retraction."

---

## 2. The students speak first (Vítor's instruction, and the right order)

*First-year:* "I changed a number in a component file on purpose. That is
how I found out what the number does. If the simulator had refused to
run, I would have learned that Choupo is fragile, not that Antoine
constants matter. Please do not take that away."

*Masters student:* "But I also copy my case folder into my thesis
appendix and write 'runs on Choupo-2607'. If I edited a record three
weeks earlier and forgot, that sentence is false and **nothing in my
output would have told me**. I am not asking the simulator to stop me. I
am asking it to stop *me quoting it wrongly*."

*Doctoral student:* "Those are different situations and they want
different behaviour, and I do not want the engine guessing which one I am
in. When I archive, I want the run to fail if the bytes moved. When I
teach with the same case, I want it to run. That is a property of **what
I am doing**, not of the case, and certainly not of the engine's taste."

*Professors, on hearing this:* the students have separated the question
better than the agenda did. The refusal is not wrong; it is **not the
engine's to choose**.

---

## 3. What the panel ratifies

**(a) The verdict must reach the ARTEFACT, not the terminal. Ship this
first — it is most of the value.**

The seal becomes a first-class tri-state claim, in the exact shape the
project already uses for its balances (FULL / PARTIAL / UNAVAILABLE with
named reasons, never silent zeros):

* **`verified`** — a manifest exists and every claimed record hashes as
  claimed. The case reproduces the release it names.
* **`diverged`** — a manifest exists and N records do not match. The
  names travel with the verdict.
* **`unsealed`** — no manifest. **No claim is made**, which is not the
  same as passing.

It lands in `SimulationResult`, so it reaches the result JSON, the GUI
and anything derived from a run. A `converged/` directory written by a
diverged run says so in its own provenance.

*Applied phase-equilibria chair:* "This is the same lesson as the
volatility block decided this morning: the fact existed and had nowhere
to live, so it lived in a place no machine could read. There it was a
comment; here it is stderr. Same defect, different pipe."

**(b) The refusal EXISTS, and the CASE declares it.**

```
// constant/propertyManifest
onDivergence  announce;   // default -- the run continues, loudly
onDivergence  refuse;     // archival posture: bytes moved, run stops
```

The default stays `announce`, because the first-year is right: a
glass-box simulator whose files you may not edit is a contradiction.
`refuse` is what the doctoral student writes in the copy she archives.
The engine never infers the posture, which is the one-knob discipline
already settled everywhere else in this project: **the case declares,
the engine obeys and announces.**

**(c) `unsealed` is not `verified`.**

A case with no manifest makes no reproducibility claim, and the verdict
must say exactly that. Reporting "no divergences" for a case that never
sealed anything would be the same class of lie the whole slice exists to
end.

---

## 4. What the panel rejects

* **Refusing by default.** It converts a teaching tool into a cage and
  punishes precisely the exploration the project exists to enable. The
  first-year's objection is decisive.
* **Announcing and stopping there** (today's behaviour). Measured above:
  the announcement does not reach the artefact, so the claim outlives its
  own retraction.
* **Inferring the posture** from context — whether the case looks
  "archival", whether a `converged/` exists, whether the run is
  interactive. Every such rule is the engine guessing at intent, and the
  doctoral student named that as the thing she does not want.
* **Auto-resealing** on divergence. Silently rewriting the manifest to
  match edited files destroys the only evidence that anything moved. It
  is the fabrication pattern this project refuses everywhere else — the
  provenance twin of typing a vapour pressure to make a validation rule
  pass.

---

## 5. Sequencing (Pareto)

Step (a) is the slice: `SimulationResult` gains the verdict, the three
binaries stop discarding the return value, and the emitter writes it.
Step (b) is a one-word case declaration and a refusal path. Step (c) is
free once the verdict is tri-state.

**Gate:** `check_seal_verdict` — a sealed intact case reports `verified`;
an edited record makes the SAME case report `diverged` and names the
record IN THE RESULT (not merely on stderr); a case with no manifest
reports `unsealed` and never `verified`; and with `onDivergence refuse`
the edited case exits nonzero, naming the record. Sabotage-verified.

---

## 6. One-line answer

> Announce **by default** and refuse **when the case says so** — but the
> answer that matters is neither: the verdict has to reach the artefact,
> because today the seal makes its claim in the result and its retraction
> only on the terminal.
