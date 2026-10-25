# Response to the three-reader review of 2026-10-21 (draft, revision 3)

DRAFT for the authors (DEV.md 4c C126).  The review is
`2026-10-21-reader-review.md` beside this file; the revised paper is
`../paper.md`.  Every number in the paper was read from a run on branch
`claude/c126-papers-revision` (based on origin/main `c11d0354a`,
2026-10-25); the case and field each came from are in the HTML comment
beside it.  Length: about 2000 words including the AI disclosure and
acknowledgements (about 1750 without them).

## Overall verdict -- "show a problem of mine being solved in the first pages"

*Changed.*  The paper is reorganised as the reviewer proposed: after a short
Summary and Statement of need, a section **"Three capabilities, each with
one example"** -- study a process, investigate a model, teach with AI --
built only from features that exist today, each with inputs, results and
the limits of use.  Architecture is kept, shorter, and tied to the tasks it
makes possible (a table of reader questions and answers).

## The engineer designing a plant

*Changed ("Study a process").*  One worked path from a production target to
a decision, on the green-ammonia sequence of the corpus:

* **Feasibility** (`greenAmmonia02_feasibility150bar`): 1180 t/day NH3,
  180.8 kg H2/t, 13.7 MW compression (278 kWh/t), 20.2 MW refrigeration,
  30.9 MW of steam raised; FCI 41.4 MEUR; NPV −493 MEUR at 4.5 EUR/kg H2,
  and the case's own sensitivity shows the hydrogen price decides (NPV
  −25 MEUR at 3.6 EUR/kg).
* **Basic design** (`greenAmmonia03_basicDesign`): three catalyst bed
  volumes (8.95, 18.41, 31.70 m³) and the shell diameter (2.23 m) solved by
  a design specification; heat integration cuts the utility bill from 31.5
  to 6.2 MEUR/year; NPV −341 MEUR.
* **What the user receives**: stream table, unit results and profiles, 32
  specification sheets for 15 units (values with units and design basis,
  assumed values named), balances, utilities, cash flow, a spreadsheet; the
  first law closes to 1.8 kW.

The question "can I compare two configurations?" is answered by the
teaching example (150 against 50 bar), so the two sections do not repeat
each other.

## The engineer doing research

*Changed ("Investigate a model").*  Developed around the reviewer's own
pick: batch electrodialysis (`edbatch01_constant_current`).  The limiting
current is predicted, not declared, by the authors' model (which predicts
the six measured limiting currents of its source paper within +1 to +12 %);
it falls from 643 to 88 A/m² under a fixed 3.5 A and crosses at 1593 s;
demineralisation 86.3 % against 91.4 % by hand; at constant voltage
(`edbatch02`) the current decays 4.37 -> 2.02 A and never reaches the limit.
The paragraph then answers "what no longer needs programming" (tanks and
material balance closed to 1e-15, time integration and recipe, properties,
announcements, plots, reports), "what can be varied" (drive, over-limiting
model, stack record, feed incl. multi-ionic), and the stated limit (the
first law is reported unavailable because the heat is not modelled).
Tutorial paths are kept only as discreet references.

## The professor teaching with AI

*Changed ("Teach with AI").*  The reviewer's five steps, as a **stated
default** (the exercise is Vítor's to choose and he may replace it):
predict the effect of running the ammonia loop at 50 instead of 150 bar;
prepare the two variants with an assistant; run them and identify the
models and assumptions (the 50 bar loop rests on a catalyst hypothesis the
case states); explain and defend (compression 13.7 against 6.5 MW,
refrigeration 20.2 against 31.2 MW, recycle ratio 2.3 against 4.2, FCI
41.4 against 35.2 MEUR); the teacher changes a condition (cheaper
hydrogen) and asks for the response first.  Presented as a possible use
with no claim of measured effectiveness; the positive side (time saved
goes to alternatives and interpretation) is stated.

## "What is taking the place of that explanation" (the table)

*Changed ("Software design").*  Each row of the reviewer's table now has a
direct answer in the paper's own table: browser and local run the same
engine on the same files; a case is a directory that reproduces with its
own sealed records; a model is one class and one line (or a formula in the
case, which also runs in the browser); every value carries its source and
an out-of-range use is announced; 494 indexed cases; every iteration is
printed and a non-converged run writes no solution.

## Trust: which examples work and which show open problems

*Changed.*  The paper now says how a user tells them apart: every run
prints its own three balances, and the twelve steady cases whose first law
does not close print their residual each time they run (they are also
listed by name).  The internal tracking mechanism is no longer described.

## Still open (authors' decisions)

* ORCIDs, affiliations, corresponding author.
* The release the paper cites (the numbers are from the development line;
  they must be re-run on the tag).
* JOSS eligibility (more than six months of public development) -- likely
  not before January 2027, to be confirmed.
* Evidence of research use beyond the authors' own (JOSS requires it).
* The exact tool versions JOSS asks for in the AI disclosure (kept out of
  the tree by the project's rules).
* The teach-with-AI exercise (default taken; replaceable).
