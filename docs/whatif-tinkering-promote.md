<!--
  Design record — tinkering + promote-to-variable in the Properties box.
  Forum verdict 2026-06-21, CORRECTED by Vítor: tinker FIRST (free, transient,
  loud), promote-to-save SECOND. Free direct editing is the default and the
  pedagogical point ("if the student touches nothing, it is just AI"); the
  forum had it backwards (declare-first). Anti-Aspen guard = LOUD amber badge +
  transient overlay + visible diff + reset; the file stays the truth until an
  explicit save. Status: Slice A (transient tinkering) in build on feat/variable-knobs.
  CC BY-SA 4.0 (docs); code excerpts GPL-3.0-or-later.
-->

# Tinkering + promote-to-variable in the Properties box — design verdict

> **Vítor''s correction to the forum (the governing decision):** the student must
> be able to grab any number and change it DIRECTLY, with no declare-a-variable
> step first. Free transient tinkering is the DEFAULT; promotion to a declared
> `variables{}` knob is the OPTIONAL step to PERSIST/parametrize. Tinker first,
> promote to save. Forcing declaration first kills the tinkering, and tinkering
> is the learning — "if not, it is just AI."

This is a synthesis task, not a code task. I have everything I need in the context. Let me deliver the verdict.

---

# In-place editing in the Properties box — the verdict

## 1. THE VERDICT

**Allow it — but route it, don't pour it.** The Properties box stays a readout; it never becomes a live form that mutates a buried literal in `flowsheetDict`. The one editing verb it gains is **"promote to variable knob"**: you click the number you're curious about (`refluxRatio 2.0`), name it, give it a value (± an optional sweep envelope), and Choupo does a single legible dict rewrite — `refluxRatio 2.0;` → `refluxRatio $reflux;` plus a `variables { reflux { value 2.0; … } }` entry. From that instant the number is a *declared knob*, turned in the Properties box (single point) or swept in the What-if (a range), and it still lives on disk where any student or LLM can read it. The mental model is one sentence: **the GUI may turn knobs the dict declares; it may never invent a value the dict doesn't state — only the dict can expand the set of editable things.** Vítor's instinct ("grab the number, try values") is right and pedagogically valuable; his mechanism (a live-editable grid) is the one mechanism that silently recreates Aspen's divergence between the running value and the file. Promotion satisfies the instinct while making the file *more* truthful, not less — and it teaches the lesson that matters: the difference between the problem's **data** and its **degrees of freedom**.

## 2. THE LINE

**Editable in the GUI (via promotion to a `$knob`, never raw):**
- Feed scalars — F, T, P (each → `$feedF`, `$feedT`, `$feedP`).
- Continuous unit scalars — `refluxRatio`, `distillateRate`, duties, `P`. The textbook knobs.

**Promotable but CONSTRAINT-BOUND (the knob carries its bound or refuses):**
- `feedStage` — promotes only with `max $nStages` written in; a value violating `feedStage ≤ nStages` is *refused with a message*, never silently clamped (silent clamp is a named bug-class in this repo, `Flowsheet.cpp:1543`).
- Feed composition — **never a single editable mole fraction.** A scalar knob on one `z_i` of a Σ=1 vector is the single most dangerous widget in this design; promoting `benzene` yields a *constrained* `$zBenzene` with the complement absorbing the balance under a stated rule. No silent renormalize.

**Never editable in the GUI (file/LLM only):**
- `nStages` — this is a **structural** edit (reallocates MESH arrays, re-places the feed, re-seeds profiles), not a value perturbation. The box may *display* it, never knob-ify it.
- Topology — adding/removing an inlet, outlet, duty, side-draw, repiping. That is authoring the flowsheet.

**The guardrail against silent dict-divergence (THE invariant):** *the GUI never holds a value that differs from disk.* What the panel shows and what the file says are the same bytes — or the edit hasn't been committed and **the case wears a loud, persistent "modified — not saved to disk" badge** (on the case and on the `variables{}` block) from the first promotion. There is no in-memory shadow value masquerading as the truth. The box showing a number the file doesn't have is exactly the failure state we forbid; the badge is what makes it impossible to *not notice*.

## 3. HOW IT FEELS

**Feed stream.** You click `T = 370 K` in the Properties box. It's display-only — so you hit **"Promote to knob."** A small inline form: name `feedT` (prefilled), value `370 K`, optional envelope (prefilled `min 340 / max 380 / intervals 8`, editable, *skippable* for a one-shot). Confirm → the dict rewrites to `T $feedT;` + a `variables{}` entry, and the case goes **amber: "modified — not saved."** Now `feedT` shows in the box as a **knob** (a range control, not a bare field), and you can set it to 355 and Run. **Coupling-aware refusal fires here:** because `feedQuality 1.0;` asserts saturated vapour, promoting `feedT` alone surfaces `feedQuality` as coupled — *"feed T is coupled to feedQuality; promoting T alone makes the feed's thermal state contradict q=1. Declare both, or neither."* That refusal is the feature, not friction — it teaches the DOF instead of hiding it. **Save to dict…** (explicit, named, diff-previewed) clears the amber. **Reset** / reload snaps back to the file. Both live on the case-level banner, not buried per-field.

**Distillation column (column01: `nStages 15`, `feedStage 8`, `refluxRatio 2.0`, `distillateRate 50`, two duties).** `refluxRatio` is the poster child: promote → `$reflux`, set 2.6, Run, watch reboiler duty and top purity move — or sweep it in What-if for the purity-vs-reflux curve. `feedStage` promotes *with* `max $nStages`; spinning it past 15 refuses aloud. `nStages` shows but offers **no** promote — it's structural. The duties and the `outputs ( distillate bottoms )` topology are not box-editable at all. Crucially, every promoted knob lands in **one reviewable `variables{}` list** — the single audit surface where "I've turned three knobs, does the column still have the DOF to honour them?" is *visible in one place*. A scattered per-field grid could never give you that; over-specification (two duties + reflux) would slip through silently.

## 4. RELATION TO `variables{}` — ONE model, not two

**In-place editing is the on-ramp to `variables{}`, and turning a knob is the N=1 twin of the What-if sweep — the same act at two cardinalities.** This is the single coherent model:

- **Set a knob** (Properties box, single point) and **sweep a knob** (What-if, a range → table/curve/contour) are the *same gesture* on the *same declared variable*. A knob is a knob whether you set it once or sweep it. Both transient, both never auto-written, both bounded by what the dict declared.
- **Promotion is the bridge** that turns a transient urge ("I want to wiggle THIS number") into a declared knob with a home. It is the *only* gesture by which a GUI action reaches disk.

I reject the three rival framings deliberately: **not** a transient-only in-memory override of a literal (that's the Aspen divergence wearing a number-input); **not** the standalone v0.1.0 raw-scalar edit-then-download (**retire it** — it's a second on-disk write path that produces a *different file from the same gesture* than promotion does, which is precisely the two-models confusion we're killing); **not** rejecting in-place entirely (Vítor's "grab a number" instinct is correct and the on-ramp serves it honestly). One write model results: **transient = turn a declared knob; persistent = promote to a declared knob; raw scalar overwrite from the GUI does not exist.** And promotion is itself transient-in-memory until the explicit download — hence the mandatory "modified, not saved" badge, so a promoted `$reflux` that lives only in RAM can't masquerade as on-disk and vanish on reload.

## 5. BUILD PLAN

**Smallest first increment — reuse almost everything:**

1. **Promote-to-variable, scalar-only, the continuous knobs first** (`refluxRatio`, feed T/P/F). This is the whole MVP.
   - **Reuse:** `collectVariableKnobs` already reads `variables{}` and feeds the What-if — the promoted knob is What-if-ready for free. The What-if's **clone + override + no-save discipline** is exactly the transient contract the Properties-box knob needs (set one value, run, reset) — N=1 mode of the same overlay, same code path, *not* a parallel mechanism. The **stream-display fix** (T/P were showing 0; now converts unit-bearing scalar strings to SI for display) is the readout the promote affordance attaches to. The **safe scalar-writer** does the `literal → $name` rewrite + diff preview. The `.cho` marker already legitimately carries GUI-only state (layout JSON) — the "modified, not saved" flag rides the same channel.
   - **New (small):** the inline promote form (name + value + optional envelope, prefilled); the dict-rewrite that *appends* the `variables{}` entry and swaps the literal; the case-level **amber "modified — not saved"** badge + Save/Reset.

2. **Constraint-aware promotion** — `feedStage` writes `max $nStages`; coupling check surfaces `feedQuality` when promoting `feedT`; refuse-with-message instead of clamp. Reuses the bounds-report-when-binding machinery from the bounds/init work.

3. **Composition as a constrained vector knob** (`$zBenzene` + complement rule) — last, because it's the sharpest. Until then, composition is display-only.

**Explicitly NOT built:** any editable field on the parent canvas/selection card that mutates a raw literal; `nStages`/topology promotion; auto-renormalize; the raw edit-then-download path (retired).

## 6. HONEST CHECK

**Still Choupo, not Aspen — yes, and by a clear test.** Aspen's sin is that after you type a value, nobody can point to the source of truth: the state lives in an opaque session, the file (if any) and the running model diverge, and the student clicks-and-runs blind. Our model fails that sin on every axis: every value you can change in the GUI corresponds to a `$`-named line you can point at on disk; the only write is a legible declaration a student would be proud to read back; the file decides what is even adjustable, and the GUI cannot expand that set. The amber badge makes "you've departed from disk" a loud, reversible, ever-present fact — the opposite of Aspen's three-identical-looking-cells (saved input / edited-not-run / converged result). This is see-then-decide applied to the student's own keystroke.

**The one risk to watch: promotion that authors a `$variable` which makes the dict physically incoherent.** A one-click promote of `feedT` that leaves `feedQuality 1.0;` stranded has just minted the exact "valid-syntax, incoherent-physics" bug we warned against — now with a `$` in front of it, which makes it look *blessed* because the variables panel advertises correctness. The guardrail's necessary twin: **the GUI never authors a `$variable` that makes the dict it writes incoherent — a promote that can't honour a known coupling (feed T↔q) or bound (`feedStage ≤ nStages`) refuses and explains.** On a teaching tool that refusal isn't a limitation; it's the lesson. Watch this one in code review on every new promotable field.
