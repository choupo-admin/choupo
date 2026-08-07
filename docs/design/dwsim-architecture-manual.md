# DWSIM architecture — a developer's manual for building Choupo

> **KIND: MANUAL (reference, decides nothing).**  Commissioned by Vítor
> 2026-08-07: *"study the dwsim architecture and make a dev manual that you can
> consult to help developing choupo."*  Level 3.
>
> **Evidence base.**  Everything below was measured from a sparse clone of
> `DanWBR/dwsim` (branch `windows`, 2026-08-07): `DWSIM.Interfaces`,
> `DWSIM.SharedClasses`, `DWSIM.Thermodynamics`, `DWSIM.UnitOperations`,
> `DWSIM.FlowsheetSolver`, `DWSIM.Inspector`, plus DWSIM's own
> `CODE_GUIDE.md`.  Counts come from running the commands, not from reading
> prose about the code.  Where a claim rests on DWSIM's documentation rather
> than its source, it says so.
>
> **Companion records.**  [`dwsim-solids-study.md`](dwsim-solids-study.md)
> (solids, and why DWSIM has one mechanism);
> [`theory-in-class-structure-study.md`](theory-in-class-structure-study.md)
> (how OpenFOAM, Cantera and DWSIM embed theory in classes);
> [`openfoam-study.md`](openfoam-study.md) (phase declaration, refusal
> messages).

---

## 0 · How to use this manual

DWSIM is Choupo's closest peer: an open-source, general-purpose chemical
process simulator, actively maintained, with a real user base and twenty years
of accumulated decisions. It is the best available answer to *"what happens to
a simulator that lives long enough?"*

It is therefore worth reading in **both directions**. Some of what follows is
a pattern to copy. Some is a warning — and the warnings are more valuable,
because they are the shapes Choupo could still grow into, and DWSIM shows what
they cost after twenty years rather than after two.

Go to §3 when adding a unit operation, §4 for thermo, §5 for the solver, §6
for anything the GUI touches. §7 is the single insight worth carrying if you
read nothing else.

---

## 1 · The map

| Assembly | Files | Lines | Project refs |
|---|---:|---:|---:|
| `DWSIM.Interfaces` | 72 | 6 388 | **0** |
| `DWSIM.SharedClasses` | 50 | 10 638 | 10 |
| `DWSIM.Thermodynamics` | 157 | 150 231 | 36 |
| `DWSIM.UnitOperations` | 219 | 133 362 | 44 |
| `DWSIM.FlowsheetSolver` | 10 | 4 213 | 14 |
| `DWSIM.Inspector` | 13 | 1 898 | — |

Roughly 300 000 lines across thermo and unit operations. Choupo is a fraction
of that, and the point of this table is not size — it is the **0** in the
first row against the 44 in the fourth.

DWSIM's design lineage is explicit and worth knowing: its author names
Barrett's paper on CAPE-OPEN-based simulator design as the origin of the class
structure, and the CAPE-OPEN standards as the source of the object vocabulary
(`CODE_GUIDE.md`). Choupo has no equivalent external vocabulary and has
invented its own; that is a deliberate divergence (CAPE-OPEN is on the
rejected list) but it means Choupo carries the whole naming burden alone.

---

## 2 · The five things worth copying

**2.1 A contracts assembly with zero dependencies.**
`DWSIM.Interfaces` has **0** project references. That single fact is what lets
two completely different GUIs — Classic (WinForms) and Cross-Platform
(Eto.Forms) — load the same saved simulation. A pure contracts layer at the
bottom is the pattern; Choupo's `core/` and `result/` occupy that position and
`check_layering` now enforces it.

**2.2 One abstraction, many implementations, selected at run time.**
23 flash algorithms behind one base class; 30 property packages. The
`FlashAlgorithm` base declares five specifications —
`Flash_PT`, `Flash_PH`, `Flash_PS`, `Flash_PV`, `Flash_TV` — and nothing else
about how they are solved. This is the same posture as Choupo's explicit
factories, and it demonstrably scales.

**2.3 The flash takes the property package as an ARGUMENT.**

```vbnet
MustOverride Function Flash_PT(Vz As Double(), P As Double, T As Double,
                               PP As PropertyPackages.PropertyPackage, ...)
```

The algorithm does not own the thermodynamics; it is handed them. That is why
23 algorithms can coexist against 30 packages without a combinatorial mess.
Choupo's `stageK(T, P, z, x, y)` has the same shape and should keep it.

**2.4 A separate solver entity that owns ordering.**
The flowsheet solver is its own assembly, resolves calculation order, calls
each object, and monitors for errors. Choupo's `Flowsheet` does the same job.
Keeping ordering out of the unit operations is right in both.

**2.5 The user may override the calculation order.**
`FlowsheetOptions.CustomCalculationOrder` lets the engineer impose a sequence.
Choupo executes in declared order by contract, which is the same instinct
taken further — the author owns the order, and `validateSequentialPlan`
checks it rather than silently replacing it.

---

## 3 · Adding a unit operation — the anti-pattern, measured

**This is the most important section of this manual.**

`SimulationObjectBaseClass` (`DWSIM.SharedClasses/BaseClass/`, 1 896 lines,
**124 public members**) declares exactly nine `MustOverride` members. Here
they are, complete:

| Member | Concern |
|---|---|
| `GetDisplayName` | presentation |
| `GetDisplayDescription` | presentation |
| `GetIconBitmap` | **presentation** |
| `DisplayEditForm` | **presentation** |
| `UpdateEditForm` | **presentation** |
| `CloseEditForm` | **presentation** |
| `CloneXML` | persistence |
| `CloneJSON` | persistence |
| `MobileCompatible` | platform |

**Not one of them computes anything.** `Calculate` is declared
`Public Overridable`, not `MustOverride`:

```vbnet
Public Overridable Sub Calculate(Optional ByVal args As Object = Nothing)
```

So in DWSIM, **a unit operation that models nothing compiles; a unit operation
without an icon bitmap does not.** Six of the nine mandatory members are
presentation. The compiler enforces the picture and not the physics.

Choupo's contract, for contrast: `type()` and `solve()`. The GUI reads the
result JSON and never touches the unit class.

> **RULE FOR CHOUPO.** When adding anything to `UnitOperation`'s pure-virtual
> set, ask whether it would still be required if the GUI did not exist. If
> not, it belongs somewhere else. The moment `GetIconBitmap` becomes mandatory,
> Choupo has become this — and the day that happens will not feel like a
> mistake, because each individual step here was reasonable.

---

## 4 · Thermodynamics

`PropertyPackage.vb` is **13 940 lines** with 12 `MustOverride` members and 30
subclasses. A new thermodynamic model means a new *package* — a broad subclass
— rather than a new composable layer. The earlier study put it exactly:
**OpenFOAM composes, DWSIM and Choupo subclass.** Choupo is on DWSIM's side of
that line, and should know it.

**The package holds a stream as mutable state and writes into it:**

```vbnet
Me.CurrentMaterialStream.Phases(phaseID).Properties.molarflow = result
Me.CurrentMaterialStream.Phases(phaseID).Properties.density  = result
```

A property package has a *current material stream*; calculation mutates it in
place. Unit operations therefore **clone** their connected streams to do
intermediate work (`CODE_GUIDE.md` says so explicitly). Choupo's
`runSimulation` is a pure function and `ThermoPackage` computes from
`(T, P, z)` arguments — keep that. Mutable-current-object state is what makes
cloning necessary, and cloning is what makes it hard to know which copy is
authoritative.

For the solid-phase treatment, which is genuinely better than Choupo's and is
the reason to read DWSIM at all on thermo, see
[`dwsim-solids-study.md`](dwsim-solids-study.md): one mechanism, chemistry
entering through the activity coefficient.

---

## 5 · The solver — where the topology actually lives

`FlowsheetSolver.GetSolvingList` walks the flowsheet like this:

```vbnet
For Each c As IConnectionPoint In obj.GraphicObject.OutputConnectors
    If c.IsAttached Then
        lists(listidx).Add(c.AttachedConnector.AttachedTo.Name)
```

**The solver traverses the drawing layer to discover the process topology.**
`CODE_GUIDE.md` states this as a design fact rather than an accident: *"To get
information about the connections between flowsheet objects, you must then
look for their graphical representations."* Connectivity is a property of the
picture.

The consequence is that a headless calculation still needs graphic objects to
exist. Choupo puts topology in `flowsheetDict` and state in `0/`, and the GUI
is a reader — that ordering is right, and this is the concrete demonstration
of why.

**Cycle handling.** DWSIM detects loops by counting:

```vbnet
If lists.Count > 10000 Then
    Throw New Exception("Infinite loop detected while obtaining flowsheet
        object calculation order. Please insert recycle blocks where needed.")
```

Ten thousand iterations, then a message telling the user to go and find it.
Choupo's `validateSequentialPlan` names the cycle chain, says which edge
closes it, and prints a paste-ready valid order. **Keep that advantage** — it
is the difference between a diagnosis and a symptom, and it is exactly the
"refusal names its remedy" doctrine paying off.

**The layering violation.** `DWSIM.FlowsheetSolver/FlowsheetSolver.vb:654`
calls `Inspector.Host.GetNewInspectorItem()`; `DWSIM.Inspector` contains
`Window.designer.vb` importing `System.Windows.Forms`. The flowsheet solver
has a compile-time path to a docking-panel GUI toolkit, because a diagnostics
subsystem was allowed to own its own presentation. This is the counter-example
already cited in
[`where-a-finding-record-lives.md`](where-a-finding-record-lives.md), and it
is why Choupo's finding records are neutral data in `core/`.

---

## 6 · "Everyone knows everyone"

`CODE_GUIDE.md` describes the object graph with evident satisfaction, and the
phrase is its own: every simulation object holds a reference to the parent
flowsheet; each has a graphic object which holds an `Owner` back-reference;
the material stream references the property package; the property package
reaches the flowsheet for compound constants; unit operations hold property
package references and clone streams.

It is genuinely convenient, and it is why the assemblies carry 36 and 44
project references. Every one of those edges was added to solve a real
problem. None of them was the mistake; the **absence of a rule about which
direction an edge may point** was.

> **RULE FOR CHOUPO.** `check_layering` exists precisely to prevent this, and
> `PINNED_UP` is currently empty. Whenever a new edge feels necessary, the
> question is not "does this work?" but "which band does this point from, and
> which to?" DWSIM is what twenty years of individually-reasonable edges
> looks like.

---

## 7 · The one insight worth carrying

**The pollution is not uniform, and it follows the picture.**

Compare, in the same codebase, on the same day:

| Abstraction | Mandatory members | Nature |
|---|---|---|
| `SimulationObjectBaseClass` | 9, of which 6 presentation | drawn on a canvas |
| `FlashAlgorithm` | 5 physics + 4 metadata | never drawn |

The flash algorithm base is clean — five thermodynamic specifications and
nothing about how they look. The simulation-object base is dominated by
presentation. **The difference between them is whether the object has an icon.**

Nobody decided that unit operations should be presentation-first. It happened
because the object had a picture, the picture needed an editor, the editor
needed a form, and the form needed to be constructible from the object. Each
step was local and sensible.

For Choupo the practical test is therefore: **does this class have a
picture?** If yes, its abstraction is under pressure that the others are not,
and it needs the layering rule enforced hardest exactly there — which today
means `UnitOperation`, `Flowsheet`, and anything the GUI names.

---

## 8 · What this manual does not cover

Stated plainly, because a manual that implies breadth it lacks is the same
defect as a gate that does.

* **Six assemblies of roughly forty.** Not read: the drawing layer
  (`DWSIM.Drawing.SkiaSharp`), both UIs, `DWSIM.GlobalSettings`, the CAPE-OPEN
  adapters, the dynamics manager, the math libraries beyond a listing.
* **No build, no run.** Nothing here was executed; DWSIM is .NET and the
  claims are static-source claims. Line counts, reference counts and the
  `MustOverride` list are mechanical and reliable; anything about *behaviour*
  is inference from source and is marked where it matters.
* **Not a judgement of DWSIM.** It is a working simulator with users, which
  Choupo is not yet. Every structure criticised above is load-bearing for
  someone. The question this manual answers is what Choupo should do, not
  what DWSIM should have done.
* **The dependency claims are project-level**, from `.vbproj` files. A
  project reference is an upper bound on coupling, not a measure of it —
  36 references does not mean 36 used subsystems.

## Sources

* `DanWBR/dwsim` @ `windows`, sparse clone 2026-08-07 — `CODE_GUIDE.md`,
  `DWSIM.SharedClasses/BaseClass/SimulationObjectBaseClasses.vb`,
  `DWSIM.FlowsheetSolver/FlowsheetSolver.vb`,
  `DWSIM.Thermodynamics/PropertyPackages/PropertyPackage.vb`,
  `DWSIM.Thermodynamics/FlashAlgorithms/BaseFlashAlgorithm.vb`, the `.vbproj`
  reference lists.
* W. Barrett, *Development of a chemical process modeling environment based on
  CAPE-OPEN interface standards and the Microsoft .NET framework* — named by
  DWSIM's author as the origin of its class structure.
* [CAPE-OPEN standards](https://www.colan.org/)
