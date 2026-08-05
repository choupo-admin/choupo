# Where a finding record lives — D7, and what DWSIM shows about it

> **KIND: ADR · STATUS: DECIDED and IMPLEMENTED 2026-08-05.**  Delegated by
> Vítor ("this is so complex that you should care of it. If necessary see how
> dwsim deals with it").  The DWSIM evidence below was read from a clone, not
> recalled.

---

## 1. The question

A **finding record** — a model-boundary ΔH, a component-coverage flag, a
utility allocation — has two natural homes, and that is the whole difficulty:

* the **engine produces** it, during the solve;
* the **result carries** it, afterwards, out to reports and the GUI.

Choupo had filed all eight of them with the result, in
`result/SimulationResult.H`. That is band 2. So nothing below band 2 could
*name* a diagnostic it computes itself.

The visible symptom was one include:

```
src/unitOperations/flowsheet/Flowsheet.cpp
    #include "reporting/ModelBoundaryAudit.H"
```

The solver reaching up into the reporting layer — the last upward edge in the
subsystem graph, and the last unaccepted cycle. It could not be paid by moving
the audit down, because the audit returns `ModelBoundaryFinding`, which lived
above it.

## 2. What DWSIM does, both halves

Read from `DanWBR/dwsim` at depth 1, 2026-08-05.

**The pattern — `DWSIM.Interfaces` has zero project references.** Not few:
none. It is a pure contracts assembly at the bottom that everything depends on
and that depends on nothing. Choupo's equivalent is `core`, and `FlatUnit`
had already been moved there hours earlier for exactly this reason.

**The warning — and it is the more useful half.** `DWSIM.FlowsheetSolver`
references `DWSIM.Inspector`, and calls into it from inside the solve:

```vb
' DWSIM.FlowsheetSolver/FlowsheetSolver.vb
Dim IObj As Inspector.InspectorItem = Inspector.Host.GetNewInspectorItem()
Inspector.Host.CheckAndAdd(IObj, "", "SolveFlowsheet", "Solver Call", ...)
```

That is precisely Choupo's D7 edge: a solver reaching into a diagnostics
subsystem. And `DWSIM.Inspector` holds the collector (`Host`, `InspectorItem`)
**in the same assembly as its window** — `Window.vb`, `Imports
System.Windows.Forms` — and references `DWSIM.Controls.DockPanel` and
`DWSIM.ExtensionMethods.Eto`.

**So DWSIM's flowsheet solver has a compile-time path to a docking-panel GUI
toolkit.** Nobody chose that. The diagnostics subsystem was allowed to own its
own *presentation*, the solver had to reach the subsystem to record anything,
and the GUI came along by transitivity.

That is the mature form of the defect Choupo had, in a project that is older,
larger and in every other respect competently built. It is the argument against
"just let the solver include the audit, it is only a diagnostic."

## 3. The ruling

**A finding record is neutral data and belongs at the bottom.  A diagnostic
subsystem never owns its own presentation.**

Implemented as:

1. **`core/ResultRecords.H`** — the eight records (`EquipmentSizing`,
   `EnergyWire`, `CostBreakdown`, `UtilityAllocation`, `ComponentCoverage`,
   `ModelBoundaryFinding`, `CashFlowYear`, `EconomicsSummary`). Every one was
   checked to be scalars, ints, bools, strings and maps — no stream, no thermo
   package, no unit operation. `SimulationResult.H` keeps only
   `SimulationResult` itself, which genuinely needs `ProcessStream`,
   `SaturationCurves` and `UnitProfile`.

2. **`ModelBoundaryAudit.H` moved to `unitOperations/flowsheet/`**, beside its
   only consumer. §3 of `module-boundaries.md` had said it *splits* —
   computation down, formatting stays. Measurement contradicted the assumption
   that ruling rested on: **both** halves have exactly one caller, `Flowsheet`,
   and nothing in `reporting/` calls either. It was never a shared helper being
   pulled two ways; it was a file in the wrong subsystem.

   Which side it falls on was already decided by Choupo's own credo — the
   engine computes and announces during the run, reporting draws afterwards
   from `result.modelBoundaries`. Filing the audit under `reporting/` was the
   original misplacement.

## 4. What it bought

`unitOperations → reporting` is gone, and with it the last upward edge.

`check_layering` now **asserts I17** instead of bounding it: `PINNED_UP` is
empty, so any upward edge fails with nothing to excuse it. I18 is asserted up
to one **accepted** cycle, `solver ↔ thermo` (ruling §7.3) — kept in the pin
list, not silently tolerated, so the stale-pin arm still covers it. An
acceptance that outlives its subject is a licence.

Four sabotages, each confirmed to exit 1: a new upward edge, a runtime
subsystem reading a tool, the accepted cycle disappearing (stale pin), and a
new subsystem with no declared band.

## 5. What this does NOT settle

* It does not say where a *future* record goes if one genuinely needs a stream
  or a thermo package. All eight happened to be pure; a record that is not
  would be a different question, and the honest answer would probably be that
  it is not a finding record.
* It does not touch the GUI's reading of these records — the JSON surface is
  unchanged, and so is every golden.
