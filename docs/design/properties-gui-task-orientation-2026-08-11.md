# The Properties GUI, assessed against task-orientation

**Date:** 2026-08-11 · **Status:** assessment only — no GUI change made, none
proposed for immediate execution beyond §7 (one small, bounded item).

Vítor relayed an external UX critique arguing that Choupo's Properties surface
is organised around *thermodynamic machinery* rather than around *what the user
wants to do*, and recommending a task-oriented first screen ("What do you want
to do?"), a "Components & Experimental Data" centre, MEASURED / FITTED /
VALIDATED / ESTIMATED / MISSING status badges, and a START-HERE page in the
Property Guide.

The instruction was: **assess the actual GUI against that principle before
changing anything.** This is that assessment, answering the six questions asked.

The short version: **the critique's prescription is largely already built, and
its diagnosis is mostly wrong about the two workspaces we have — but it is
exactly right about the one thing neither of them does.** The gap is not
task-orientation. It is that *a component is not an inspectable object
anywhere in the GUI*.

---

## 1. What the user actually sees after clicking "Explore properties"

`site/index.html:321` sends the visitor to `/app/?workspace=explore`, which
mounts `ExploreWorkspace` (`gui/src/ui/ExploreWorkspace.tsx`).

Initial state is `selected = []` (line 308), and the empty-state branch at line
1096 renders:

* the **compound browser open on the left rail** — search box, three role chips
  (all / VLE / nonvolatile), and the catalogue grouped under sticky headers
  *Volatiles (VLE-able)* · *Electrolytes / ions* · *Permanent gases* ·
  *Non-volatile / fragments*, with a *Recently used* group on top;
* a centred panel: **"Property Explorer"**, then *"Pick one or more compounds
  from the browser on the left to compare their pure-component properties
  (Psat, Cp, …) or a mixture scalar (Z, v_molar, …). Pick exactly two VLE-able
  compounds for a binary T-x-y diagram."*;
* a tip: *"try benzene + toluene, or ethanol + water."*

There is no model picker on this screen. There is no equation. The first thing
asked for is a **substance**.

## 2. Clicks to inspect a known component

**There is no number of clicks that does this.** No component-detail view
exists in the GUI. `grep` for a component inspector returns nothing;
`CompoundBrowser`'s row handler is `on ? onRemove : add` — clicking a component
*selects it into the set*, it does not open it.

What a student can learn about a component today is inferred, never read:

| surface | what it tells you | where |
|---|---|---|
| role badges | `nonvol`, `frag`, `local`, `override` | browser row |
| group placement | volatile / electrolyte / permanent gas | sticky sub-header |
| lens gating | *"needs exactly 2 VLE-able components"* | disabled lens + reason |
| coverage table | ✓/✗ per capability: criticals · Psat · Vliq · Cp_ig · ΔGf | Props workspace, **open case only** |

The coverage table (`ThermoView.tsx`, `ComponentCoverageTable`) is the closest
thing that exists, and it is genuinely good — it is ChatGPT's "status badge"
idea, already built, already the *first, default* pill of the Props workspace.
But it is reachable only with a case open, it covers only that case's
components, and it reports **presence, not provenance**: a ✓ means *the record
has an Antoine block*, never *that block was fitted to 40 measured points and
validated against 18 held out*.

**This is the real hole, and it is the one the critique found.**

## 3. Clicks to calculate a basic property

**One.**

Defaults are `plotType = "scan"`, `property = "Psat"`, `axisVar = "T"`,
`tFrom/tTo = 290/380 K`. There is **no Plot button** — line 1529: *"No Plot
button — the view recomputes live on any change."* Clicking `water` in the
browser produces P<sub>sat</sub>(T) for water immediately, computed by the same
`choupoProps` op an authored case would run, through WASM.

Changing the property is one more click; changing the lens is one more.

## 4. Is the first decision a task or a thermodynamic model?

**A task — and before that, a substance.** The 13 lenses in `PLOT_TYPES` are
named by outcome, not by machinery:

> Property vs T/P · Pure phase diagram (P-T) · Binary boiling envelope (T-x-y) ·
> γ(x) · McCabe-Thiele (distillation) · Binary flash (x-y + lever rule) ·
> Binary LLE (g_mix + tangent) · Ternary boiling surface · Ternary solubility
> (LLE) · Psychrometric chart · Scaling (SI vs recovery) · Equilibrium map
> (Gibbs) · Steam tables (IF97)

Each carries `min`/`max` component counts and a `why` string, so an unavailable
lens is **disabled with a true reason** ("needs exactly 2 VLE-able components")
rather than hidden. The model pickers (γ, EoS, transport correlation) are
toolbar menu-buttons that appear *only for the lenses where they move the
curve*, and they are entered **after** the set and the lens.

There is also already a **"What unlocks next"** line under the set chips
(line 525), written deliberately as *"a structural fact (not a
recommendation)… States teaching ('two VLE compounds HAVE a McCabe diagram'),
never a black-box 'recommended' nudge."*

So the flow is `substance → outcome → (model, if it matters)`. That is the
task-oriented ordering the critique asks for, and the "never a recommended
badge" discipline it also asks for is stated in the source in those words.

**The critique's premise does not survive contact with the code.** It is a fair
description of a conventional simulator's property dialog; it is not a
description of this one.

## 5. Can the structure support a task-oriented landing screen without major work?

**Yes — the hard part is already done, twice over.**

* `WorkspaceKey` (`store.ts:158`) is a flat union and `AppShell` a flat switch;
  a new workspace is one union member, one `MenuBar` row, one `Suspense` arm.
* The Explore empty state *is already a landing screen* — a centred panel in a
  branch of one component, with the browser beside it. Turning it into a task
  menu is editing that one `<Stack>`, not restructuring anything.
* The lens table already carries everything a task menu needs: label, arity,
  eligibility predicate, and a human reason for ineligibility.

Nothing here requires architectural work. Which is also the argument for **not**
doing it: a task-menu landing screen would be re-stating, in a modal-shaped
form, an ordering the current screen already enforces — and it would insert a
click in front of the one-click path measured in §3. The credo's "see, then
decide" is served better by the live curve than by a menu of intentions.

## 6. The smallest GUI change that makes the September workflow intuitive

Not a landing screen. **Make the component an inspectable object, and let the
curation dossier fill it.**

The ThermoML/curation campaign (`bin/choupo-thermoml`, `bin/choupo-curate`,
`src/propertyOps/{EvidencePartition,CurationDossier}`) produces exactly the
facts the coverage table cannot currently state. The dossier already knows, per
property, per component:

* how many experimental points, from which DOIs;
* which datasets were declared **fit** and which **held out** — and the
  partition fingerprint proving the declaration preceded the fit;
* the held-out AAD, and the verdict:
  `validated` · `notValidated` · `heldOutPerformed` · `validationRefused` ·
  `notClaimed`.

That is a strictly richer version of MEASURED / FITTED / VALIDATED / ESTIMATED /
MISSING, and — unlike a badge scheme invented for the UI — **every level of it
is already an engine-computed fact with one home**, so the GUI would be drawing,
not deciding. That is the credo's own division of labour.

The smallest change with the largest teaching return, in order:

1. **A component detail pop-out.** Click selects (unchanged); *double*-click
   opens the component — the credo's existing single/double convention, no new
   vocabulary. Contents: identity, the coverage row it already computes, the
   model actually resolved per property, provenance marks the engine already
   emits (`[local]`, `[estimate]`, `[unreviewed]`), and the raw `.dat`.
   This alone answers §2, which today has no answer at any click count.
2. **A quality axis on the coverage cell.** The grid (row = component, column =
   capability) exists; today the cell is ✓/✗. Make it carry the dossier verdict
   where one exists. No new layout, no new navigation — one cell renderer.
3. **The dossier as a pop-out panel** on that detail view: fit points vs
   held-out points, the AAD, the acceptance band that was declared *before* the
   fit. A student seeing "validated against 18 points nobody fitted, AAD 0.6 %"
   has learned the lesson the whole partition contract exists to teach.

Items 1–2 are the September-critical pair. Item 3 lands with the campaign.

## 7. One defect found while reading (unrelated to the above)

`CompoundBrowser` still ships a full **`data/proposed/`** tier UI — an orange
`proposed` badge, a collapsible "PROPOSED — review before relying" section, and
two tooltips describing the tier's semantics — and `catalogue.ts` imports
`virtual:proposed-component-catalogue` to populate it.

**That tier was retired 2026-07-13** (`CLAUDE.md` §7: *"the public `proposed`
tier was RETIRED … do NOT reintroduce it"*). `data/proposed/` does not exist;
the glob resolves empty, so the section never renders and no user has ever seen
it. It is dead code making a claim about the data architecture that the data
architecture contradicts — the same class of defect as the documentation slice
of 2026-08-09, in TypeScript instead of prose.

Purely subtractive; not done here, because the instruction was assessment only.

---

## What this assessment concludes

The critique was worth taking seriously and is worth thanking for, because it
found the right hole from the wrong map. Choupo's Properties GUI is *already*
task-first, outcome-named, one-click-to-a-curve, and explicitly non-prescriptive
about models. What it lacks is not orientation but **an object**: the component
itself is the only thing in the property workflow you cannot open, and
everything the curation campaign is building is a fact *about a component* with
nowhere to be displayed.

Build the object. The badges follow from the dossier; the landing screen is not
needed.
