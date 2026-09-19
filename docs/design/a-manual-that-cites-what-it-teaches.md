# A manual that cites what it teaches

*2026-09-19.  The campaign that
[`the-order-a-reader-meets-a-reference.md`](the-order-a-reader-meets-a-reference.md)
§4 measured and deliberately did not start.  Pedro Mendes, co-author and
curator of the guides, reviewed the `Choupo-2608` Theory Guide and raised one
**Major** point; this is the first pass at it, and it is a first pass by
design — the gate that makes the remaining debt visible and ratcheting matters
more than any number of chapters closed in one sitting.*

---

## 1. The point, and why it lands

> *"falta de referências bibliográficas.  No espírito glass-box, acho que
> todas as equações, hipóteses físico-químicas e dados deviam ser
> referenciados sistematicamente.  Na versão atual, acontece esporadicamente."*

He is right, and what makes it sting is that **this project already enforces
exactly that everywhere except the guides.**  A data record cites a primary
source per value (`check_source_licence`, `check_species_citation`).  A
correlation is an OBJECT carrying a citation, a validity window and a
verification anchor — *"a correlation whose source is a comment is one the
reader cannot check"*.  Every EduTool lesson symbol needs a mechanically
verified `file:line` citation into the engine (`check_lesson_symbols`, waiver
dict kept EMPTY).  The manuals had none of it, and a manual is the one
artefact in this tree with no compiler behind it.

## 1a. The size of the debt was understated by a third, and the count is now measured

[`the-order-a-reader-meets-a-reference.md`](the-order-a-reader-meets-a-reference.md)
§4.2 sized the debt as **79 sections, 56 carrying a numbered equation, 44 of
those citing nothing**.  Re-measured here as the gate's first act, over the
same file at the same commit: **92 numbered sections, 81 carrying a numbered
equation, and 58 of those citing nothing.**

The headline figures of that record reproduce EXACTLY — 534 numbered equation
environments, 105 `\cite` commands, 83 `\bibitem`s, 6 uncited, 0 dangling —
so this is not a different file or a different definition of an equation.  It
is the section walk alone, and the debt it reports is a third larger than
recorded.

One structural fact makes that easy to do and worth writing down: **the
bibliography sits in the MIDDLE of this manual, not at the end.**  Part VIII
(*Dynamic simulation and process control*) follows `\end{thebibliography}`,
and ten numbered sections live there — the PID chapter among them.  Any scan
that stops at the bibliography loses them.

The number is not carried in prose here.  It is what
`check_theory_citations --seed` measures, and the gate's claim line prints it
on every run.

## 2. The rule that bound the whole slice

**NEVER INVENT A CITATION.**  A citation entered the guide only when its full
reference ALREADY EXISTED IN THIS REPOSITORY — in a `src/` header or
`citation()` string, in a record's `source` field, in a case file, or in
another guide's bibliography — and had been READ there.  The `file:line` it
came from is recorded in the commit that carried it.

Where the guide teaches an equation whose source nobody in this tree has
stated, that is a FINDING and not a task: §5 lists them, uncited.  *Inventing
a citation converts `unsourced` into `falsely sourced`, which no reader and no
gate can detect.  A visible gap is strictly better than an invisible
falsehood.*

**A HALF-REFERENCE DRESSED AS A FULL ONE IS THE SAME DEFECT ONE NOTCH DOWN.**
For Dittus & Boelter and for Gnielinski the tree states an author, a year and
a TRANSCRIPTION ROUTE (Incropera & DeWitt, by equation number) and no journal.
Those entries say so in their own text and name the route.  For Lapple, Barth,
Leith & Licht, Muschelknautz, Merkel and Linnhoff the tree states an author
and a year and NOTHING ELSE — no journal, no volume, no route — so no entry
was written at all.  The line between the two is whether the tree records a
place a reader could go.

## 3. What moved

Forty-eight `\cite` commands, thirty-two new `\bibitem`s, four commits.  Every
reference was a MOVE: §4.3 of the sizing record predicted that for roughly
half a 47-work sample the citation already existed in `src/` while the guide
named the author in prose and cited nothing, and that held for every work
carried here.

**Twenty chapters that cited NOTHING now cite what they teach**, taking the
debt from 58 of 81 equation-bearing chapters to 38 — measured by diffing the
uncited set against `1b1634f27`, not counted by hand:

| chapter | numbered eqs | what it now cites |
|---|---|---|
| From component data to integral properties | 19 | Poling, Prausnitz & O'Connell |
| Fugacity and the vapour phase | 15 | Soave, Peng & Robinson |
| Liquid-liquid equilibrium by Gibbs minimisation | 9 | Michelsen |
| Adsorption: isotherms, LDF uptake, the fixed bed | 9 | Langmuir |
| Vapour pressure: Clausius-Clapeyron to Antoine | 8 | Watson |
| Phase changer: the dome-crossing boiler / condenser | 7 | Nusselt, Rohsenow, Zuber, IAPWS R7-97 |
| Viscosity | 6 | Andrade, Vogel, Chung, Neufeld, Svehla, Hirschfelder, ChemSep, RPP |
| Closing a recycle: Newton on the tear stream | 6 | Wegstein |
| Gas-solid separation: cyclone, bag filter, splitter | 6 | Iozia & Leith, Dirgo & Leith |
| Pneumatic conveying | 5 | Yang |
| Heat exchanger DESIGN | 5 | Gnielinski, Kern, Blasius, Incropera & DeWitt |
| Newton-Raphson, n dimensions | 5 | Golub & Van Loan |
| Thermal conductivity | 4 | Eucken, Svehla, Chapman & Cowling, ChemSep, RPP |
| Mixture rules | 4 | Wilke, Wassiljewa, Mason & Saxena, RPP |
| Diffusivity | 3 | Fuller, RPP |
| PC-SAFT | 3 | Gross & Sadowski (2001 and 2002) |
| COSMO-SAC | 3 | Lin & Sandler |
| Gas absorption and stripping | 3 | Henley & Seader |
| Shortcut distillation: Fenske–Underwood–Gilliland | 3 | Fenske, Underwood, Gilliland |
| Rigorous distillation by simultaneous MESH Newton | 2 | Curtis, Powell & Reid |


**THE PHASE-CHANGER CHAPTER IS PEDRO'S POINT IN ONE PARAGRAPH.**  It ended
with a paragraph headed *"Primary references"* naming five works — Smith, Van
Ness & Abbott; IAPWS R7-97; Nusselt (1916); Rohsenow (1952); Zuber (1959) — in
PROSE, with no `\cite`, therefore no bibliography entry and no number a reader
could follow.  The references were not missing.  They were not *citations*.

**THE SIX UNCITED ENTRIES ARE ALL CITED, AND FIVE OF THEM TOLD US WHERE.**
`gen_theory_bibliography` reported six `\bibitem`s cited nowhere and named
them on its claim line, leaving the cite-or-drop decision to Pedro and Vítor.
No search was needed: `Strathmann2004` names `\ref{eq:ed-nernst}` and
`\ref{eq:ed-rpair}` in its own text, `BardFaulkner2001` names
`\ref{eq:ed-faraday}`, `GVL` names the Gauss elimination in `NewtonND`,
`Watson` names the heat-of-vaporisation correlation, `HenleySeader` names the
equilibrium-stage chapters.  **A `\ref` from the bibliography into the body
with no `\cite` coming back is a one-way pointer**, and the entry was already
carrying the claim the citation makes.  The sixth, `Michelsen`, was placed on
the body's own evidence — the LLE chapter already read *"Michelsen (1982)
turned this geometric statement into a one-number criterion"* beside
`src/solver/StabilityTest.cpp`.

**A THIRD PLACE A CITATION CAN ALREADY LIVE.**  The sizing measurement looked
in `src/` and in the guides.  `Dirgo & Leith (1985), Aerosol Sci. Technol. 4,
401` — the attribution of the only MEASURED cyclone data in the tree — is in
neither: it is in a TUTORIAL's `flowsheetDict` header, on the case that
validates the cyclone models against it.

## 4. The gate

`bin/curate/check_theory_citations.py`, wired into `bin/runTests`.  Read-only,
about two seconds, four arms, all ratcheting from pin lists measured by
`--seed` and never typed.

* **C1 — chapter coverage.**  A numbered `\section` carrying a numbered
  equation environment carries a `\cite`.  38 pinned, two-sided ratchet: a
  debt that grows fails, a debt that closes fails asking for its pin back, a
  pin whose chapter no longer exists fails as stale.
* **C2 — no dangling, no orphan.**  Dangling is a hard refusal; orphans are
  pinned (**empty today**, which is itself a measurement).
* **C3 — the engine's own citations reach the guide.**  A surname the engine
  cites in the project's `Surname, A. B. (YYYY)` form and the guide names in
  prose must appear in a `\bibitem`.  **Empty today.**
* **C4 — an eponymous registered model has a source.**  A factory key carrying
  an engine-cited surname and named anywhere in the guide — including inside a
  `\code{}` or a listing, which C3's prose scan does not reach — must resolve.
  **Empty today.**

**PER CHAPTER AND NEVER PER EQUATION.**  Nothing mechanical separates an
equation that needs a citation (a correlation) from one that does not (a
derivation step, a definition, a restatement of the first law).  A
per-equation arm would accuse the innocent, and *a gate that accuses the
innocent teaches the reader to ignore it.*

**A SEEDER WHOSE OUTPUT CANNOT BE PASTED BACK IS A MEASUREMENT NOBODY CAN
INSTALL.**  `--seed` printed an empty pin list as `KNOWN_ORPHAN = {`/`}`,
which in Python is an empty **dict**, not an empty set — pasted back, the
next `now - pinned` raises `TypeError` and the gate dies instead of passing.
Three of the four lists are empty today, so the first maintainer to re-seed
would have hit it.  It prints `set()`.

### 4.1  The trap it was warned about before it was written

A `\cite{}` in this manual **spans lines**:

```
Langmuir--Hinshelwood--Hougen--Watson (LHHW) form \cite{Langmuir1918,
Hinshelwood1940, HougenWatson1943}.
```

opening on line 13760 and closing on 13761.  Every scan in the gate reads the
file as ONE STRING with DOTALL and strips whitespace inside the braces.  This
is the project's own recurring shape — *a pattern anchored where its subject
does not live is a check that cannot fire* (the 2026-09-03 dossier-grammar
slice).  It was MEASURED rather than argued: a line-anchored scan of the
**unsabotaged** tree reports `Langmuir1918`, `Hinshelwood1940` and
`HougenWatson1943` as orphans, so arm C2 would have been crying wolf from the
day it was written, and its one true positive (sabotage S6) would have been
indistinguishable from its three standing false ones.

### 4.2  Sabotages — nine by hand, two not as predicted

The full table is in the gate's own docstring.  The three worth repeating:

* **S2 survived its first attempt, and the gate was right.**  The probe
  `\cite` went on the line ABOVE `\section{Ideal mixing}`, which belongs to
  the previous chapter.  *A probe placed one line early tests nothing.*
* **S7 fired one arm where three were predicted, and the reason is a real
  property.**  Deleting the `Chung1988` entry fires C2 alone.  C3's pattern
  anchors on the author ADJACENT TO THE YEAR, so for `Chung, T.-H., Ajlan, M.,
  Lee, L. L. and Starling, K. E. (1988)` the surname it carries is
  **Starling**, not Chung.  Recorded in the blind-spot list rather than
  patched: a looser bare surname+year matcher yields junk such as
  `Coefficients 2012` and would accuse the innocent.  **C3 is a floor on the
  engine's citations reaching the guide, never a census of them.**
* **S8 is deliberately not a failure.**  Disarming C3 and C4 makes the gate
  PASS with a claim line reading *"0 of 0 engine-cited surnames"* — a visibly
  empty claim rather than a false full one (the `check_wasm_dialect` S2
  lesson).  The counts are on the claim line for exactly this reason.

### 4.3  What the gate says it cannot see

On its own claim line, because a claim that implies more than it checks is the
defect this project keeps paying for: whether a citation is **true** of the
equation beside it; whether an equation **needs** one; **the hypotheses**
(Pedro's word was *hipóteses físico-químicas*, and a stated modelling
assumption is prose — that half of his point is NOT addressed here and is not
claimed to be); the 534 equation environments individually; and the other
seven guides, which carry no bibliography at all.

## 5. Equations whose source nobody in this tree has stated

The deliverable this campaign most owes its reader.  Each of these is named by
the guide, and in most cases implemented by the engine, with **no citable
reference anywhere in this repository** — not a journal, not a volume, not a
transcription route.  Nothing was written for any of them.

**THE BRIEF'S FLAGSHIP EXAMPLE WAS NOT ON THIS LIST, AND FINDING OUT WHY IS
THE MOST USEFUL THING THIS SECTION DID.**  *Shortcut distillation:
Fenske–Underwood–Gilliland* — the chapter that names three people in its own
title and cited none of them — was written down here as having **zero
bibliographic occurrences in the whole repository**, on a search of `src/`.
That was wrong.  A repository-wide search found all three, in full, in
[`docs/ai/unit-ops.md`](../ai/unit-ops.md):639 — *Fenske, Ind. Eng. Chem. 24
(1932) 482; Underwood, Chem. Eng. Prog. 44 (1948) 603; Gilliland, Ind. Eng.
Chem. 32 (1940) 1220* — the file `bin/llmctx` ships to an assistant authoring
cases.  **So the citation home a measurement does not look at is the citation
home that does not reach the guide.**  Four now: `src/`, a record's `source`
field, a case file's header, and the case-authoring AI docs.  All three are
cited; `ch:fug` is out of the C1 pin list.

| work | where the guide teaches it | what the tree records |
|---|---|---|
| **Molokanov** | the Gilliland stage-count fit, `ShortcutColumn.cpp:261` | the name, in a comment, and nothing else |
| **Kirkbride** | the feed-stage correlation, same file | the name, in a comment |
| **Lapple** (1951) | `ch:cyclone`, the default cyclone model | author + year, `Lapple.H:32` |
| **Leith & Licht** (1972) | same chapter | author + year, `LeithLicht.H:32` |
| **Barth** (1956) | same chapter | author + year, `Barth.H:32` |
| **Muschelknautz** | same chapter, called "the gold standard" | a registered model key; no year, no reference |
| **Shepherd–Lapple** | the cyclone inlet-loss form | the name only |
| **Merkel** (1925) | `ch:coolingTower`, the whole chapter | author + year, `CoolingTower.H:33` |
| **Linnhoff & Flower** (1978), **Linnhoff & Hindmarsh** (1983) | `ch:pinch` (7 numbered eqs) | author + year, `PinchPass.{H,cpp}` and the programme scope record |
| **Sutherland** | `ch:viscosity`, taught as theory | NOTHING.  The guide says in the same breath that Choupo does not implement it, because no record carries the constant |
| **Sieder–Tate** | taught beside Dittus–Boelter as one of two "workhorses" | NOTHING, and no such model is registered.  Already recorded in the sizing measurement |
| **Smith, Van Ness & Abbott** | the phase-changer's "Primary references" paragraph | the surname appears nowhere in `src/` |
| **Ranz–Marshall**, **Friedman–Marshall** | `ch:drying-overview` | `RotaryAtomizer.H:40` cites *Marshall (1954), AIChE Monograph 2* for the rotary-wheel $d_{32}$, which is a different correlation from either of these |
| **Grunberg–Nissan**, **Filippov**, **Vignes**, **Maxwell–Stefan**, **LeBas** | `ch:mixture-rules`, `ch:diffusivity` | named in prose; Vignes is the only one the engine implements, and none carries a reference |
| **Sato–Riedel**, **Wilke–Chang** | cited here to `RPP` | deliberately NOT promoted to a primary: `SatoRiedel.H:83` says in its own words that Reid/Prausnitz/Poling is *"the ROUTE this code was transcribed from; its primary attributions were not re-read here and are not restated."*  Citing a route as a route is honest; promoting it is not |

**Every one of these is a curation act and none is an assistant's.**  Finding
a primary for **Merkel** would close `ch:coolingTower` on its own, and one for
**Linnhoff & Flower** would close `ch:pinch` (7 numbered equations); the
cyclone family would close `ch:cyclone`'s remaining sub-model prose.  Until
somebody reads those papers, the honest state is the one printed here.

## 6. What was NOT done

* **38 chapters still owe a citation.**  They are pinned, named, and the
  ratchet stops the number growing.  This was always going to be a partial
  pass: a half-done campaign under a ratcheting gate is a project that
  improves; a rushed whole campaign with unverified citations is a manual
  nobody can trust.
* **No hypothesis is gated.**  Half of Pedro's sentence is untouched and the
  gate says so.
* **No `\ref` gate** (§3.1 of the sizing record), and no `check_theory_citations`
  arm over the other seven guides.
* **No golden touched, and nothing outside `docs/`, `bin/curate/` and one
  `bin/runTests` block moved.**  A manual has no goldens; this was verified by
  the diff rather than assumed.
* **`theoryGuide-STIFF-METHODS.pdf` in the `v2608` tag** stays RESERVED for
  Vítor, unchanged from the sizing record's §5.
