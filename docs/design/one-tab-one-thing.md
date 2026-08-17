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

## 3. The hard consequence, stated before anything is built

**Separate browser tabs do not share a JavaScript store.**  Ten of the twelve
tools read the open case's run — every `*Tool.tsx` carries a
`Classroom | Current run` toggle over `useStore(s => s.runResult)`.  A tool
opened in its own tab has an empty store and can only ever be *Classroom*:
someone else's absorber, not the student's.

That is the whole pedagogy of those ten tools, so it cannot be lost.  **The
tool tab must be GIVEN the case and solve it itself**:
`/app/?case=<path>&workspace=methods&tool=kremser`.  The solve is WebAssembly
in that tab, like every other solve Choupo does; a tutorial case is seconds.

Two properties this buys, and they are the argument for it over the
alternative:

* the tool tab becomes **shareable**.  A professor sends the URL and the
  student sees the same comparison — which is exactly the thing the credo
  promises and does not currently deliver;
* there is **one mechanism**, not two.  A tool is fed by a case in its
  address, whether that case came from the hub, from a case tab, or from a
  link in a lecture.

**Rejected: synchronising state across tabs** (BroadcastChannel, a shared
`localStorage` run).  It makes one tab's answer depend on another tab's
lifetime, invisibly; it fails silently when the other tab is closed; and it
would mean a tool showing a run whose provenance is not in its own address.
A number on screen must be traceable to the address that produced it.

**A named cost, not hidden:** opening a bound tool re-solves the case, so the
tool tab's run is a *re-run*, not the identical object the case tab holds.
For a deterministic solver these agree, and where they would not, the fact
that each tab states its own case and settings is the honest form.

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
