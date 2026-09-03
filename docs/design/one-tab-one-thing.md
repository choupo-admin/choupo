# One tab, one thing: the hub, the case, the tools

*Status: DECIDED 2026-08-17 by Vítor, in his own words: "este tab tem que ficar
sempre aberto e pode-se voltar cá sempre que quisermos!  Quando se abre um
flowsheet, abre um tab novo.  E idem para o Explore e para os EduTools.  Fica
tudo muito mais claro, e o flowsheet fica com um menu mais generoso só para
ele no topo."  No implementation started.  This record supersedes the
navigation half of `modes-and-views-in-the-top-row.md` — see §6.*

---

## 1. What it is

Four kinds of tab, each one thing, each with an address that IS that thing:

| tab | address | carries |
|---|---|---|
| **hub** | `/app/` | the welcome screen: tutorials, open case, recent, the first steps |
| **case** | `/app/?case=<path>` (+ the view) | one case, and ONLY its views |
| **explore** | `/app/?workspace=explore…` | property surfaces |
| **tools** | `/app/?workspace=methods&tool=<id>` | the twelve EduTools |

The hub stays open.  Opening a case, Explore or a tool opens a NEW tab; you
come back to the hub by clicking its tab, the way you come back to anything
else in a browser.

## 2. Why this is better than the menu rule it replaces

This morning's record split the top row into MODES and VIEWS and made the
distinction a rendering rule inside one strip.  **Vítor's proposal makes the
same distinction STRUCTURAL**: a mode is a tab, a view is a menu item.  Nobody
has to be taught the difference, and no label has to carry it — the browser
already shows it, in the one control every user on earth already understands.

Three things fall out that the menu rule only mitigated:

* **The row stops fighting for width.**  A case tab's menu carries its ten
  views and nothing else.  The 833 px row that could not fit a phone was 833
  px because it was doing two jobs; it now does one.
* **The `Pinch` ambiguity gets a home.**  A case tab's `Pinch` VIEW and a tool
  tab's `Pinch composite curves` stop being visual peers in one strip.  They
  are in different tabs because they are different claims — one recomputes in
  the browser from KPIs, the other reads what the engine wrote.
* **The address bar starts telling the truth.**  `docs/ai/gui-credo.md` calls
  it a shareable bookmark of what is on screen; today nine of the ten case
  views cannot be reached by URL, so that sentence is false.  One tab per
  thing makes it true, and makes it testable.

## 3. AMENDED THE SAME DAY — the tools do not talk to the flowsheet at all

The first version of this section solved a problem this project no longer has.
It said: ten of the twelve tools read the open case's run through a
`Classroom | Current run` toggle, so a tool tab must be GIVEN the case in its
address and re-solve it.

**Vítor ruled otherwise, and the ruling is the simpler architecture:** *"Eu
quero que o EduTools seja independente do flowsheet!  Não têm de comunicar!
Aquilo é para apoiar as aulas!"*

So the coupling goes.  A tool is fed by its OWN sealed witness tutorial, which
it already clones and solves in the browser, and by nothing else.  Its address
is `?workspace=methods&tool=<id>` — no `?case=`, no re-solve of a foreign
case, no shared state, no provenance to disambiguate.

### Why this is right and not merely simpler

A teaching instrument that changes behaviour depending on what happens to be
open in another tab is **not stable**.  In a lecture the professor needs the
tool to show the same thing to everyone, and a student following the same URL
a week later needs the same figure.  Coupling made the tool's answer depend on
a state its own address does not name — which is the property this project
refuses everywhere else it appears.

It also removes an ambiguity rather than housing it: a tool's `Pinch composite
curves` is now unambiguously the classroom construction, and a case tab's
`Pinch` view is unambiguously that case's.  Nothing has to explain which is
which.

### What is lost, said once

The moment the pedagogy lens described — a student's `recovery_KPI` beside
their own `Kremser(A, N)`, with the reason for the gap attached — stops being
automatic.  The student reads their KPI and types it into the tool.  That is
work moved from the machine to the learner, and there is a real argument that
this is where it belongs.

### And it settles the menu question the panel could not

The three-lens panel kept EduTools in the case menu on ONE decisive fact:
those ten tools read the loaded run, so the in-app entry was the only way to
point a tool at the student's own result.  **That fact no longer holds**, so
the argument expires with it: with the tools independent and living in their
own tab with their own chooser, an EduTools entry in a case tab's menu is a
plain duplicate.  Vítor's original instinct — *"não gosto de ver o EduTools e
Explore quando abro o flowsheet"* — was right, and the panel's counter rested
on a coupling he has now removed by decision.

## 4. What this requires before it can ship

* **The tools tab needs its own chooser.**  `MethodsWorkspace` renders no tool
  list — the 252 px rail was deleted on 2026-08-16 because the top-bar
  dropdown replaced it.  If the tools live in their own tab, that tab must be
  able to change tool without the app's workspace menu.  This is not a new
  requirement invented here: it is the third falsifier written into
  `modes-and-views-in-the-top-row.md` §7.5 an hour before this decision, and
  this proposal fires it exactly as predicted.
* **The case views must be deep-linkable.**  `bootWorkspace()` honours only
  `explore`, `methods`, `control`.  A case tab whose view cannot be addressed
  cannot be a tab in this scheme.
* **Every "open" affordance must open a tab, consistently.**  The hub's cards,
  the landing page's cards, and any in-app link to a mode.  A mixture — some
  navigating in place, some opening a tab — is worse than either, and the
  landing already shipped that defect once today (`target="choupo-app"` ate a
  student's converged run).

## 5. What it must NOT do

* **Not open a tab per view.**  Streams and Flowsheet are views OF one case
  and belong in one tab; a tab per view is the same category error one level
  down.
* **Not lose the hub's state on return.**  The hub tab stays as it was; that
  is the point of it staying open.
* **Not require a tab.**  A deep link handed to a student must still work in
  a single tab with nothing else open — the scheme is about what CHOUPO opens,
  never about what the reader must already have.
* **Not fork the tool.**  One tool, one implementation, fed by an address.
  A "standalone tool" variant beside an "in-app" one would be two homes for
  the same view over the same physics.

## 6. What it supersedes, and what survives

`modes-and-views-in-the-top-row.md` decided that modes stay visible in the row
while views collapse.  **The navigation half of that record is superseded**:
with modes in their own tabs there are no modes in the row to keep visible.

What SURVIVES from it, and is load-bearing here:

* the mode/view DISTINCTION itself, and its definition — this record makes it
  structural rather than discarding it;
* §4b as amended: the collapse decision is a MEASUREMENT (`fitsRow`), not a
  breakpoint and never the pointer.  A case tab's menu is shorter but a phone
  is still a phone;
* §7.3's finding that the row's confusion was an honesty problem, not a
  tidiness one.  This record is the stronger answer to the same problem.

## 7. What would falsify it

If a real teaching moment needs a tool and its case **visible at the same
time on one screen**, tabs are the wrong container and a split view is the
right one.  The test is concrete and should be run before the work is called
done: watch someone compare `recovery_KPI` with `Kremser(A, N)` and see
whether they alt-tab or whether they want both in view.  If they want both,
this record is wrong and the pop-out model already in the credo is the answer.

---

## 8. The Compounds tab (2026-09-03) — the rule applied one level down

*Vítor: "Eu ainda não estou satisfeito com o explorer.  Eu acho que a landing
page deve permitir escolher os compostos.  Depois tem de haver um botão que
quando clicar abre outro tab onde se faz a exploração das propriedades.  Isso
deixa o painel direito da landing page para mostrar a info de cada componente
selecionado."*  Built the same day.

### 8.1 The same argument as §2, one level down

§2 split the top ROW because it was doing two jobs and could not fit a phone.
The Explore workspace was doing two jobs in one BODY, and the credo says so in
its own words: the NO-REBLOAT invariant (`docs/ai/gui-credo.md` §3) declares
*"the plot is the ONE primary surface"* and gives the catalogue a foldable
rail — `PANELS.exploreRail`, default 240 px, maximum 460.  A rail is the right
shape for a set you are assembling and the wrong shape for several hundred
substances in a family tree, which is what the catalogue became on
2026-09-03 when the tree landed.  So the catalogue is a tab:

| tab | address | carries |
|---|---|---|
| **the explorer's landing** | `/app/?workspace=explore` | the catalogue, and one record at a time |
| **property surfaces** | `/app/?workspace=properties[&components=…]` | the plots |

*(Amended within the hour, on the owner's clarification — see §8.7.  The first
build put the catalogue on `?workspace=compounds` and left `?workspace=explore`
on the plots, which meant entering the Explorer still landed on the screen the
change was made to fix.)*

Neither tab lost anything: Explore keeps its own compound rail, because
changing the set while plotting is the normal act and bouncing tabs for it
would be worse than the crowding this fixes.

### 8.2 THE AMENDMENT: a door, not a gate

The ask, taken literally, builds the thing `gui-credo.md` §5 forbids by name —
a *"setup wizard / modal property selector / first-step dialog"*.  A pair of
tabs where the second is reachable only through the first is STEP 1 and STEP
2 however it is drawn.  What keeps it a pair of doors is structural, not a
promise in a header:

* both are listed on the hub, side by side (`MODE_TABS`), and the site's own
  landing links **Explore** directly;
* the property surfaces keep a door of their own on the hub, and its address
  names no components, so they open with an empty set — pinned in
  `gui/tests/compoundsTab.test.ts`;
* the hand-over button is **enabled with an empty selection** (it then opens
  Explore empty).  A disabled button would teach "choose first", which is the
  wizard by another route.

### 8.3 The hand-over is a LINK, and that is §3's rule again

§3 freed the EduTools from the flowsheet because *a tab whose answer depends
on state its own address does not name is not stable*.  The same rule decides
how a selection crosses here: `?workspace=properties&components=water,ethanol`,
one home for the format (`gui/src/ui/explore/selectionLink.ts`), no shared
store and no `localStorage`.  It also buys the thing the credo says an address
should be and mostly is not — an exploration a professor can paste into a
lecture, and a reload that keeps it.

A name the catalogue cannot resolve is **dropped from the set and said aloud**
in its own alert, never silently: a shared link makes a typo, or a case-local
component that exists only inside somebody's case, the likely failure — and
plotting two of the three components a URL asked for, quietly, is exactly the
kind of answer-to-a-different-question this project refuses elsewhere.

### 8.4 What the screenshot found that the tests could not

The first build drew the SET twice on one screen — the browser's own `SET`
footer on the left, and a chip row this tab added on the right.  Two homes for
one fact, in pixels.  The header now says what the right panel is *showing*
("reading …"), which is a different question and the one its reader has.
Nothing but driving the page in a browser would have reported it; the suite
was green across both versions.

### 8.5 Not done, and named — CLOSED the same day (2026-09-03)

The catalogue column shipped as a fixed 420 px.  `panelContract` would give it
a drag handle in three lines, but the same contract also gives a FOLD, and
folding away the one thing a tab exists to show is a trap rather than a
feature.  Resize-without-fold looked like a change to the contract rather than
to a call site, and it was not taken here.

**That reading was wrong, and the owner reported the consequence within hours:
"o painel da esquerda não dá para mudar a largura."**  The fold is OPT-IN —
`contentMin: 0` disables the measured auto-collapse and omitting `shortcut`
binds no key — so the panel takes the drag, the arrow keys, the double-click
reset and the remembered width while nothing folds it.  It is
`PANELS.catalogueBrowser` (min 260, max 620, default 420), the first registry
entry with a size and deliberately no fold key, and `tests/panelContract.test.ts`
carries that as the declared `NO_FOLD` category.

This section is kept rather than deleted: it is the record of a deferral whose
stated reason did not survive contact with the contract it was deferring to.
It also outlived the fix by three commits, contradicting `gui-credo.md` and a
doc-comment in `CompoundCatalogue.tsx` at the same time — three homes for one
stale claim, found by an audit and not by anyone re-reading them.

### 8.6 The phone, and a clean overflow check that would have lied

Driven at 390×844 with the chunk warm, the first two-column build put **103
elements outside the viewport**, the hand-over button among them, its right
edge 215 px past the screen: a fixed 420-px catalogue column beside a flexible
one leaves the second column nothing on a 390-px phone.

The measurement worth keeping is not the number but the INSTRUMENT: this
page's `scrollWidth` read 390, exactly equal to `innerWidth`, because the
container clips rather than scrolls.  The horizontal-overflow test that
cleared the landing page the same morning would have called this page clean
while its primary action sat off-screen and unreachable — *clipped is not
absent, and a page that cannot scroll to its own content passes an overflow
check by failing worse.*  Count the elements whose right edge is past the
viewport, not the document's scroll width.

Fixed by stacking: on a narrow viewport the two columns become two rows
(catalogue 45 %, the hand-over bar, then the record), through
`methods/methodsChrome.useNarrowViewport` — the one home for the posture
question, which reads the pointer as well as the width.  Re-measured: 0
elements off-screen, the button's right edge at 376 px.

*A first attempt to measure this reported the page BLANK at 390 px, which was
false: the dev server compiles a lazy chunk on demand and the probe had waited
4.5 s.  Warming the chunk at desk width first is why the real defect was
found rather than a phantom one reported.*

### 8.7 The address the owner calls the landing

Shipped, and corrected the same hour.  The first build reasoned about
bookmarks — `?workspace=explore` was an existing deep-link contract, so the
catalogue took a new key and the plots kept theirs.  That is defensible about
URLs and wrong about the ASK: the owner's word for `?workspace=explore` is
*"a landing do explorer"*, said while pointing at that screen, so leaving the
plots there meant entering the Explorer still landed on the surface the change
existed to replace.  A URL contract worth protecting is not worth protecting
by not doing the thing.

The map now:

| address | opens | why |
|---|---|---|
| `?workspace=explore` | the landing | the owner's own name for it |
| `?workspace=compounds` | the landing | alias — the address the first build shipped |
| `?workspace=properties[&components=…]` | the surfaces | canonical |
| `?workspace=explore&components=…` | the surfaces | LEGACY, and not mere politeness: an address that NAMES COMPONENTS is asking to plot them, so routing it to the landing would drop the request the URL carries |

Two doors stay on the hub — **Explore** (the landing) and **Property
surfaces** — so §8.2 survives the move: neither is reachable only through the
other.

### 8.8 The instrument's OTHER half, and a false alarm it cost

Half a rule is not a rule.  "Count the elements past the viewport edge" caught
the catalogue's real defect and then, an hour later, produced a **false alarm**
about the property surfaces: 68 elements past the edge, reported here and to
the owner as the next thing to fix.  It was not a defect.  Those 68 were 67
children of ONE toolbar, and that toolbar sits in a box with
`overflow-x: auto` — it SCROLLS, which is precisely the shape the NO-REBLOAT
invariant demands (one row, never two).  Re-measured with the ancestor walk:
**0 unreachable** on the property surfaces; **101** on the catalogue before its
fix and **0** after, the same tool answering both.  So the rule, whole:

> An element past the viewport edge is a defect only when NO ancestor between
> it and the viewport can be scrolled to bring it into view.  `scrollWidth`
> lies about a clipping container; a raw edge count lies about a scrolling one.

**The instrument already existed, and that is the finding.**
`gui/tools/checkGui/occlusion.mjs` has carried `clippedBy` and
`OFFSCREEN_PROBE` for weeks — the ancestor walk, the axis, and a docstring
recording that this module's own first false finding was of exactly this
family.  A second, cruder home for a question the tree had already answered
carefully is the arity sin committed against oneself, and it cost a wrong
claim rather than only duplicated work.  **Reach for `checkGui` before writing
a probe.**

### 8.9 The same blind spot, one container in — and I nearly "fixed" the app for it

Widening the walk paid on its first run, and then charged for the lesson
twice.  The new `property-surfaces` page reported **2 COVERED** at desk width:
two compound-family headers, *Nitrogen compounds (41)* and *Sulfur compounds
(24)*, each "blocked by" a piece of the rail's own SET block.  I diagnosed a
squeezed flex child, added `flexShrink: 0`, re-ran — **and the finding did not
move.**

The geometry said why, and it was not the app: the tree's scroll viewport ends
at y=791; the two buttons are at y=793 and y=849, two pixels past its fold,
with 2002 px of content in a 624 px box.  Scrolling the tree by 1378 px moves
them to y=−585.  They are reachable; the SET block is simply what is painted
in that region of the SCREEN.

So the occlusion arm had the same shape of blind spot the crude probe of §8.8
had — one container in.  It already skips a control whose centre leaves the
WINDOW, saying exactly the right thing about it ("`elementFromPoint` is not
defined there, so this is NOT evidence either way").  A control whose centre
leaves its own SCROLLABLE BOX while staying inside the window was not skipped,
and the hit test then answered with the next panel down.  `scrolledPastFold`
now puts those in the same non-evidence pile, which the second arm resolves by
scrolling and re-asking rather than by assuming.

**The app change was reverted.**  A fix justified by a wrong story does not
get to stay because it is harmless: it would have stood as evidence for a
defect that was never there, and the next reader would have believed it.

Two rules, and the second is the one that keeps costing:

> A hit test asked outside the asker's own visible box is not evidence — at
> any level of nesting.  The viewport is only the outermost box.

> When an instrument reports a defect, reproduce the DEFECT before repairing
> what the instrument blamed.  Both times here the report was true as a
> measurement and false as a conclusion, and both times the cheapest check —
> can a user reach it? — was one scroll away.

What the harness could NOT have said, because it was not looking: its walk
covered ONE workspace (EduTools) in its default state — a limit it names in
its own header, beside the sentence *"the owner found it on his own phone.
The harness could not."*  That happened again here.  So the walk now opens the
explorer's landing and the property surfaces too; both are standalone pages,
so neither meets the React-Flow shape the exposure arm refuses, and the
landing reports a reach of 31 against a tool page's 1.
