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
