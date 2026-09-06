# A tool that reported what it could not see, and a result that did not say it was old

**Kind:** ADR · **Status:** SHIPPED · **Date:** 2026-09-06

Three things landed together because one afternoon produced all three: an
instrument that filed a blank page as an observation, a result that went on
being drawn after the case under it moved, and a rule about how the commander
of this repository is expected to work.  They are recorded in one place
because separating them would hide what they have in common — **a claim made
where there was no evidence for it.**

---

## 1. `bin/drive-app` reported what it could not see

### What happened

Vítor opened `https://www.choupo.org/app/?case=steady/flash/flash01_benzene_toluene`
in his own browser.  The flowsheet drew, the teal *Run flowsheet* control was
there, the run completed — *LATEST RUN LOADED*, *Solved in 2 iterations with 3
advisories*.  **The app is fine.**

`bin/drive-app`, pointed at the same URL from this container, reported for all
four cases it drove:

```
  - steady/flash/flash01_benzene_toluene: no run control (absent)
    engine requests: 0  (0 inside the prefix)
```

### The cause, measured

Chromium in this container cannot reach that host: the navigation dies with
`net::ERR_CONNECTION_RESET` (the agent proxy).  `curl` reaches it — the proxy
serves curl and not the browser — which is exactly what made the failure look
like a finding rather than a blockage.  `driveApp.mjs` navigated, slept 4 s,
and evaluated `document.querySelectorAll('button')`.  On a blank document that
finds nothing, and the tool **pushed a finding**.

Reproduced before the fix (exit 1, one finding, zero engine requests); the
transcript above is that run.

### The rule

This project already says **a check that cannot run must not PASS** (the
`bin/buildSite`/`check_true_ions` pair, 2026-08-05).  The mirror image is just
as bad and had never been written down: **it must not FAIL either.  It must
REFUSE.**  A tool that converts its own blindness into a defect report about
its subject manufactures work and, worse, teaches its reader that its findings
are noise.

`drive-app` already had exit 2 — *REFUSED (could not honestly run)* — and did
not use it here.

### What was built

**A POSITIVE SENTINEL, checked before anything is judged.**  Not the absence
of an error (a blank page has no errors either) but the app's own chrome in
the rendered DOM: `#root` with children (React mounted) **and** the CHOUPO
wordmark in the body text (this app and not somebody's error page).  The
version badge — `Choupo-dev · <commit>`, the element in Vítor's screenshot —
is **reported when present but not required**: it waits on a
`wasm/version.json` fetch that a partial mirror may not carry, and a sentinel
that can be absent on a working app is a false refusal waiting to happen.

Absent the sentinel, `requireBootedApp` raises the existing `Refusal` path:
exit 2, **no findings**, naming the URL, what Chromium said about that
navigation, and what the document did contain.  `Page.lastNavigationError` was
added to `cdp.mjs` (additive; nothing else reads it) because only the browser
knows the difference between *the app failed to render* and *the page never
arrived* — and handing the reader a network remedy for a rendering failure
sends them to fix a route that works.  The header now states the operating
condition in one line: **it must be run from a network that can reach the
target, or it refuses.**

### Two things found while proving it

**(a) The mirror could not mirror the delivered app at all.**  `--mirror`
resolved every reference against the app's PREFIX.  That is right for a frozen
`/vYYMM/app/` copy, which carries its own assets underneath itself; it is wrong
for `/app/`, where one origin serves the landing and the app with `/assets`,
`/wasm`, `/workers`, `/docs` at the SITE ROOT (the shape `bin/runSite` builds).
Measured: `[mirror] 0 file(s); 11 not on the host`, and the drive then refused
— correctly — against an empty document.  A reference is now kept as a path
from the ORIGIN and one that does not say where it lives is tried in both
homes.  After the fix: `[mirror] 81 file(s); 0 not on the host`, and the app
booted.

**(b) The frozen-shell check accused the innocent.**  With the mirror working,
22 findings appeared of the form *request OUTSIDE the app prefix:
`/assets/index-*.js`* — every one of them correct behaviour for the layout
being driven.  The frozen-shell defect of 2026-09-02 is a claim about a
FROZEN copy: a release at `/vYYMM/app/` must carry its own engine, and a
request leaving it is the shell-around-the-dev-engine bug.  The development
app at `/app/` is a different layout on purpose.  The check is now a finding
only under a versioned prefix; elsewhere the same requests are REPORTED, with
the reason, in one line.  *A gate that accuses the innocent teaches the reader
to ignore it* (the dryer slice, 2026-09-04).

### Both branches proved, by running them

| branch | command | result |
|---|---|---|
| REFUSAL | `bin/drive-app --base https://www.choupo.org/app/ --case steady/flash/flash01_benzene_toluene` | **exit 2**, no findings, names `net::ERR_CONNECTION_RESET`, the URL and the mirror remedy |
| DRIVE | `bin/drive-app --mirror https://www.choupo.org/app/ /tmp/appmirror --case …` then `--serve /tmp/appmirror --prefix /app/` | `app booted:`, run landed, 10 views walked, **5 engine requests** incl. `choupoSolve.wasm`, **1 finding** |

The one finding is genuine and is left as one, not fixed here: the Literature
view fetches `/__thermoml/index.json` — a local dev-bridge endpoint — and logs
a 404 on a statically served copy.  That is the tool doing its job.

### Not done, deliberately

No gate.  `drive-app` needs a browser and a served copy; the copy that matters
is on a host CI cannot reach, and a gate that skips when it cannot run is a
permanently-green gate exactly where it matters (the Poling precedent, and
DEV.md §4's *no new gates* for September).  It stays a TOOL, run from
`RELEASING.md`'s freeze step.

---

## 2. A stale result is DIMMED, and the count is on the button

### The question and the decision

Vítor's screenshot shows the flowsheet AFTER a run with the Run control
looking exactly as it did before, and he asked whether a stale result should
be annotated or dimmed.  **DECIDED: dimmed, with the count of pending edits on
the Run control.**  In a teaching tool an annotated stale number is still read
as a number; dimming forces the eye to stop.

### What the GUI already knew, and what it did not

It knew about EDITS: the transient scratch overlay (`case/scratch.ts`) is an
in-memory set of knobs a student has grabbed, and `Run` applies it.  It knew
nothing about STALENESS — the overlay is *not* cleared by a run, so a non-zero
edit count means "there are knobs", never "the drawn answer is out of date",
and the case files themselves can change under an unmoved overlay.  **The
comparison did not exist.**

### What was built — and what it is not

`gui/src/case/staleness.ts`: a **fingerprint** of the declared case (the
parsed dicts, the case-local files, the scratch overlay applied on top),
stamped on the result when a run completes and compared with the fingerprint
of what is declared now.

Said plainly, in the module's own header and here: **it is a fingerprint, not
a dependency analysis.**  It cannot tell which numbers a given edit actually
invalidates, so it dims **ALL of them or NONE**.  Changing a reflux ratio and
changing a costing coefficient are the same event to it.  A per-value
staleness claim would be a claim about a dependency graph this project does
not have, and inventing one is worse than dimming a number that happened to
survive the edit.

Three exclusions, all deliberate, and the second was found by asking what an
ordinary session actually does to the files:

* **`rawFiles`** — the same content again as text, comments included.  A
  comment is not physics; hashing it would make every re-read of an unchanged
  file a false alarm.
* **The `.cho` marker.**  It is the GUI's home for the saved canvas layout,
  and the canvas AUTO-SAVES it 600 ms after every node drag.  On a local case
  the bridge watches the folder, so that write comes straight back into the
  store as fresh `caseFiles` — and hashing it would have dimmed a perfectly
  current result because somebody moved a box.  Caught by reading the write
  path, not by a test; the test came after.
* **What the RUN adds on the way to the solver** — the display preset spliced
  into `controlDict`, and a drilled sector's boundary state frozen from the
  previous run.  Neither is a declaration a student made.  The stamp is taken
  from `tinkered`, the same object the comparison fingerprints later.

**Absence means no claim.**  With no result, or with a result nobody stamped
(a drilled-in tab inherits its parent's), the verdict is *not stale*.

### Where it shows

* **The canvas** dims its EDGES and only its edges: a stream's colour is its
  solved phase and its thickness is its solved flow, so the pipes ARE the
  result, while the unit boxes and the wiring are the declaration.
* **A result workspace** (Streams, Reports, Plots, Variables, Log, Pinch)
  dims whole — the whole body is the run.  That list got ONE home,
  `ui/workspaces.RESULT_WORKSPACES`; `store.ts` had been carrying its own copy
  for a different question (which workspace must not be restored on a fresh
  boot), and a third copy would have been the arity sin on a fact about this
  app's own surfaces.
* **The Run control** reads `Run flowsheet (2 pending edits)`, and — when the
  files changed under an unmoved overlay — `Run flowsheet (case changed)`.
  The count is of EDITS, never of stale numbers.  The badge beside it turns
  from teal *Latest run loaded* to orange *Result is stale*.

### Tests

`gui/tests/staleness.test.ts` (13): key-order stability, the `rawFiles` and
`.cho` exclusions, the dict-scalar and `0/`-state movements, the two no-claim states,
the edit count including *stale with ZERO pending edits* as a real state, and
three source arms — the one home of `RESULT_WORKSPACES`, both dimming classes
actually defined in the stylesheet (a class no rule matches dims nothing while
every test passes), and the stamp being taken from `tinkered`.

### Found on the way, and fixed

`tutorials/steady/distillation/column16_declared_interior` declares
`tier tutorial;` — it is on the first path a student meets — and its
`README.md` used markdown links, which the app's lesson renderer refuses.  So
`gui/tests/firstPath.test.ts` was **already failing at HEAD** and that
README would not render in the app at all.  The two links are now plain code
spans, and nothing else in the file moved.

**One line of README costs three commits' worth of derived artefacts**, and
that is worth knowing before touching one: a tutorial README is quoted in the
GENERATED `docs/tutorialsGuide-<category>.tex`, which is in turn rendered into
the COMMITTED `docs/tutorialsGuide.pdf`.  Both gates fired in turn -- first
`gen_tutorials_guide --check`, then `check_guide_pdf_fresh` -- each on a
separate full suite run, which is the chain working exactly as designed and
also the reason a "trivial" prose fix is not trivial here.  Regenerated and
rebuilt (`bin/curate/gen_tutorials_guide.py`, `make -C docs tutorialsGuide.pdf`)
and both committed with the source that moved.

A note on the SUITE this exposed, said plainly: at HEAD `bin/runTests` was
green while `bin/runTests --gui` was NOT -- the full suite does not run the
app's vitest, so a first-path README the app cannot render is invisible to it.
That is the documented division of the two paths, not a defect in either; it
is recorded here because it is how a broken first-path README reached `main`.

---

## 3. The operating model, in `CLAUDE.md` §10

Vítor, twice on 2026-09-06 and the second time sharply: *"coordenares os
generais e estares sempre disponível para refletires sozinho e comigo!!!!  Por
isso nas tuas regras!"*  Written into `CLAUDE.md` §10, short: the commander
dispatches written briefs and, **while they run, REFLECTS rather than polls**
— reads the tree, looks for the pattern across recent defects, brings findings
and proposals.  *A status line is not a contribution.*  With the corollaries
this session paid for: never edit `bin/runTests`, `src/` or `gui/` while a
suite runs (a general's per-file staging sweeps in an unstaged edit of yours);
one general owns the tree at a time; a commit lands only on FAIL 0; and a
background suite is launched under the harness's own supervision, because a
plain `nohup … &` from a tool call was killed twice in one day, losing two
30-minute runs.

The fleet doctrine itself (what goes to a general, the written rules they get,
NO YES-MEN) stays DEV.md's; §10 carries the commander's own half only.

---

## 4. The shape these share, which outlasts any of them

Five things went wrong on the way, and four are the same shape: **a surface
reached a conclusion without checking that its input had arrived.**
`drive-app` judged a document that never loaded.  `--mirror` served a
directory into which it had fetched zero files, and mentioned it in a line
nobody had to read.  The GUI drew a result without ever asking whether it
still belonged to the case.  And — this one is the commander's own — this
session recounted the decision index with a hand-rolled regex, got
102/68/32/2, rewrote the index's prose around that, and
`check_decision_index` REFUSED: its regex is looser than mine and its count
(114 / 68 / 46) was right all along.  *A hand-rolled recount is itself a
hand-maintained derived fact.*  The gate that already recounts is the
authority, and the prose it reads must keep the SHAPE it reads.

The engine has had the answer since 2026-05-30 — **refuse by name when the
datum is absent** — and what today shows is that the doctrine had never
crossed into the TOOLS or the GUI.

Noticed next door, measured, and deliberately left alone (September's rule,
and it is not wrong today): `bin/checkSitePublished` returns **1** — its
"not current" code — for a site carrying no build stamp at all, while its own
prose says *"nothing can be concluded"*.  It already has an exit 2 for two
other could-not-run states.  That is the same conflation `drive-app` had, one
notch softer, and it is stated here rather than fixed.

## 5. What was deliberately NOT done

* **No gate**, for either half — see §1.  The staleness half is covered by
  `gui/tests`, which `bin/runTests --gui` runs.
* **No per-value staleness.**  Named here rather than implied: the honest
  version of "which numbers did this edit invalidate" needs a dependency graph
  from declaration to reported value, and the numerical-provenance contract
  (2026-08-10) is exactly that, unimplemented.  When it exists, this module is
  the surface that would consume it.
* **The Literature view's 404** on a statically served copy: reported by the
  tool, left as a finding.
* **`PropsView`'s own run does not stamp.**  A props result therefore never
  reads as stale.  That is the no-claim default working as designed, not
  coverage — said here so nobody reads the absence of dimming as evidence of
  freshness.
* **The `EMPTY?` Variables view** the drive reports on `flash01` (317
  characters): observed, not judged, and not chased.
