# Heuristics as a third kind: teaching the choice, not the construction

*Ruling 2026-08-18, on Vítor's report: students cannot choose a control
structure for a distillation column — or for any unit — among the several
defensible ways of doing it, and "o aluno tem de se sentir satisfeito depois de
vir ao choupo.org".*

## 1. It is a THIRD KIND, and saying so is the whole ruling

The settled placement criterion is *method-construction → EduTools;
property-surface → Explorer*. A heuristic selection aid is **neither**. It does
not construct an answer from a diagram and it does not show what a substance
is: it helps a reader **choose between defensible alternatives**.

Forcing it into either box would corrupt the criterion that keeps the boundary
legible — and that criterion is doing real work: it is what settled the g_mix
tangent into Explore and what moved McCabe-Thiele out of it.

So the third kind is NAMED — a registry `kind: "selection"` beside
`kind: "construction"` — and it lives inside the EduTools surface for now. **It
does not get a third top-level surface.** One-tab-one-thing has just been
settled, and a new building for one tenant is how a shell acquires rooms nobody
visits. If selection tools grow to several and start needing their own chrome,
they will have earned it; today naming the kind is enough to keep the criterion
honest.

## 2. A heuristic is a RECORD, never a paragraph in a component

The same rule the whole engine runs on: *zero physics in TypeScript* becomes
**zero heuristics in TypeScript**. A heuristic is curated data and carries:

* the **claim**, in one sentence;
* a **primary citation** with page — the aggregator's arrangement is never the
  source;
* the **validity domain** — the conditions under which it was asserted;
* **what it does NOT cover**, and where known, a **counter-case**.

**An uncited heuristic is REFUSED.** This is not pedantry, it is the project's
own hardest-won rule: inventing a citation turns *unsourced* into *falsely
sourced*, which no reader and no gate can detect afterwards. A rule of thumb
with an author's name beside it is a claim a student can go and check; the same
sentence without one is folklore rendered in an authoritative font, and the
authoritative font is the dangerous half.

## 3. The tool DISPLAYS disagreement; it never resolves it

Experienced engineers disagree about control structures, and the textbooks
disagree in print. The tool therefore shows, for each candidate structure, what
each cited heuristic says about it — **including where two sources conflict** —
and never collapses that into a single recommendation through a weighting
nobody published.

This is the pedagogy, not a limitation of it. Students do not fail because they
cannot recall a list; they fail because they do not know **when a rule
applies**. A tool that hands down one answer teaches the list. A tool that
shows two authorities disagreeing, with the conditions each assumed, teaches
the judgement — and the judgement is what the experienced engineer actually
has.

## 3a. CORRECTION, same day: the question is PLACEMENT, not dynamics

The first draft of §4 aimed at a dynamic witness.  Vítor corrected the aim:
*"não era isso que eu te estava a pedir ... era sobre conhecimento geral da
estratégia e colocação dos instrumentos"*.

That is a different question and a much better one, because **instrument
placement is a DRAWING question, not a time question**.  Where the level, flow
and pressure measurements sit, which streams carry control valves, and above
all **which tray the temperature is measured on** — none of that needs a
transient.  It needs a cross-section with the instruments on it.

And the sharpest of those has a COMPUTABLE answer today, which makes it the
real Layer 2: **tray selection for temperature control**.  The classical
criteria — the steepest slope of the temperature profile, and the largest
sensitivity to the manipulated variable — read off a profile the rigorous MESH
column ALREADY writes per stage (`reports/.../profile.csv`, the same file
`check_stage_identity` reads a stage temperature back from).  A slope over an
existing column, not new physics.

So the student's actual question — *"where do I put the sensor, and why that
tray?"* — is answerable now, on their own column, with the heuristic and the
number side by side.  That is the satisfying answer, and it was reachable while
this document was pointing at a year-long engine slice.

**The lesson for the next ruling, and it is mine:** the owner reports a
DIFFICULTY, and the architect's first job is to find the smallest object that
dissolves it — not the most complete one.  Aiming at the dynamic witness was
aiming at the most convincing possible demonstration, which is not the same as
the thing that was asked for, and it would have deferred a buildable answer
behind an unbuildable one.

## 3b. THE HOME ALREADY EXISTED — and the rule that keeps it honest

Vítor, same day: *"Não havia um guide para explicar rules of thumb no projeto
de engenharia química?  O Process Design Heuristics?  O Design Guide?  Aí
podiam ficar as heurísticas de controlo de vários equipamentos!"*

He is right, and the answer is better than a plan: **`docs/designGuide.tex`
already IS that guide** — 2397 lines, 25 sections, with
`\section{Process control & instrumentation heuristics}` already carrying the
pairing table (level on the OUTflow; pressure on the vapour outlet; throughput
on the feed valve; column composition on a SENSITIVE TRAY TEMPERATURE rather
than direct analysis) and `\section{Equipment selection at a glance}` beside
it.  The defect was never that it did not exist.  **The defect was that the app
could not open it**, along with the Explorer and Tutorials guides — three
manuals that shipped and were reachable from nowhere until the guide list got
one home.

So: the Design Guide is the HOME for design and control heuristics in PROSE.
The selection tool renders RECORDS.  Neither restates the other — the same
separation the EduTools Guide keeps from the Theory Guide.

### A GUIDE IS SIGNED; A RECORD IS CITED

This is the ruling, and it resolves a contradiction §2 would otherwise create.
§2 says an uncited heuristic is refused.  The Design Guide states dozens of
heuristics and carries, across 2397 lines, roughly sixteen source mentions and
no per-claim citation.  Applying §2 to it would either freeze a good document
behind a retro-citation campaign or expose §2 as a rule nobody follows.

Neither, because the two artefacts are not the same kind of claim:

* A **guide** carries an AUTHOR on its title page.  Someone answers for it, and
  authored engineering judgement is a legitimate provenance for prose a reader
  meets as guidance.  "Vítor Geraldes says this" is a real and checkable
  attribution.
* A **record** has no author line.  It travels into a tool, renders beside a
  computed number, and reads as institutional fact — "Choupo states this".
  Nothing on screen tells the student whose judgement it was.  That is exactly
  the condition under which folklore becomes indistinguishable from a sourced
  claim, so a record must carry the citation the rendering cannot.

The corollary that keeps them from drifting apart: **a record should POINT at
the guide's section where the guide already says it**, rather than restate the
sentence.  A record whose text duplicates a guide paragraph is a second home,
and the day they disagree neither is marked stale.

The retro-citation of the Design Guide is therefore NOT demanded here.  It is
named as a standing want: per-claim sources would make the guide stronger, and
nothing about this ruling stops that work happening later.

## 4. Three layers, and only two can be built today

This is where Choupo can do something a wiki cannot, and where the honest
accounting matters.

**Layer 1 — the cited heuristics.** Pure curation. Buildable now.

**Layer 2 — the computable diagnostic, on the reader's own column.** Where a
heuristic has a computable counterpart, the engine must supply it, so the rule
of thumb stops being an assertion and becomes checkable. For distillation
control the counterpart is the **steady-state gain matrix and its RGA**:
perturb each candidate manipulated variable, read the controlled compositions
off the rigorous MESH column the corpus already has, and the pairing heuristics
("avoid a negative relative gain", "pair where it is nearest one") acquire a
number for THIS column. That is finite differences over an existing solver, not
new physics. Buildable now, and it is the differentiator.

**Layer 3 — the dynamic witness, and it CANNOT be built today.**  Note after
§3a that this layer is NOT what was asked for; it is the demonstration that
would settle a pairing argument, and it stays named as a want rather than a
requirement. The lesson
that would actually settle the question is watching the rejected pairing fail
on a disturbance. It is unavailable: **the corpus has no column under control
and the engine has no dynamic column at all** — `choupoCtrl`'s dynamic tier is
`DynamicCSTR` and nothing else (verified, not assumed). A dynamic distillation
column is a major engine slice, not a tool slice.

It is named here rather than implied, because the temptation is to fake it with
a plausible-looking response curve, and a fabricated transient would be exactly
the falsely-sourced failure one layer up: a picture that teaches a specific
wrong thing with confidence.

## 5. What the student gets on the first day, and why it satisfies

Opening the tool on a canonical column, they see: the candidate structures
named as the literature names them; what each cited authority says about each,
with the disagreements visible; the RGA computed from that column's own gains;
and, stated plainly, that the dynamic confirmation is not yet available here
and why.

That is a genuine answer to "how do I choose", and the last clause is part of
why it is genuine. A student who leaves knowing which rules exist, who said
them, where they conflict, and what their own column's numbers say has gained
the thing they came for. A student handed one confident recommendation has
gained a rule they will misapply the first time the conditions differ.

## 5a. The cross-section, and where the animation actually needs dynamics

Vítor also proposed, separately: a test column in EduTools where the student
manipulates the different control forms, "e até podia visualizar o líquido nos
tanques a subir e a descer na coluna representado tudo em cross-section".

Split it, because the two halves have very different costs:

* **The cross-section with the instruments and loops drawn on it, and the
  control structure switchable** — buildable now.  It is a diagram over a
  steady column, which is exactly what a P&ID is.  Switching structure moves
  which measurement drives which valve; the drawing carries the lesson.
* **Levels rising and falling** — needs dynamics, because a level that moves is
  an accumulation term.  It is the honest boundary between the two halves: a
  drawn level is a state, an animated one is an integration.

Deliberately NOT a way around it: animating the levels off a plausible-looking
made-up trajectory.  A moving picture is far more persuasive than a static one,
which is precisely why a fabricated one is worse.

## 6. Scope beyond distillation

The kind generalises — reactor selection, separation-train sequencing,
adsorbent choice (the request that opened this line of work) — but the
STRUCTURE must be identical each time: cited claims, visible disagreement, a
computed diagnostic where one exists, and a named absence where none does.
Distillation control goes first because the disagreement is real, the
literature is strong, and Layer 2 exists for it.

## 7. Rejected

* **A third top-level surface** — §1.
* **A recommendation engine that scores structures** — §3. A weighting nobody
  published, presented as a verdict, is the worst possible artefact for a
  reader who cannot yet judge it.
* **Uncited rules of thumb, however true they sound** — §2.
* **A fabricated dynamic response** standing in for Layer 3 — §4.
* **Filing this under `construction`** to avoid adding a kind — that is the
  criterion being bent by the first case that does not fit it, which is how a
  boundary stops meaning anything.

## Status

Ruled, not built. Nothing changes on account of this document; it exists so the
first selection tool is not free to answer these questions its own way.
