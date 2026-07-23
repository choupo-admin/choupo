# Stream-state directories, fractal sectors & topological drill-in

**Status: RATIFIED 2026-07-06. This is the constitutional spine of the Choupo
case. Do NOT reopen the ontology unless a concrete case proves the contract
fails.** Origin: the stream-state-directory proposal + the external architecture
review (`ansGPT2`), adopted with amendments R1/R3.

The resulting Choupo model is no longer merely "OpenFOAM-like": it is a **fractal
process graph** with **complete persistent state per current domain**,
**topology-derived stream roles**, **sector drill-in by domain restriction**,
**physical equipment design as a later realisation of process state**, and
**economics as aggregation over designed equipment**.

---

## 0. THE INVARIANT (the essence — do not implement by resemblance)

**A physical stream is a NAMED GRAPH EDGE with ONE stable identity. Its role is
INFERRED from topology. A unit port (`from`/`to`) is an ENDPOINT, never an
identity.** (External correction 2026-07-06 — "stop half-implementing": the `0/`
directory is the *visible* part; THIS is the essential part. Leaving `boundary{}`
and anonymous connections preserves the old ambiguity under a new folder.)

**Named connections — the connection KEY is the stream ID is the state filename:**
```
connections
{
    liquor  { from BRINE/liquor;      to EXTRACTION/liquor; }   // stream ID: liquor
    hotAir  { from HOTAIR/hotAir;     to FINISHING/hotAir;  }
    product { from FINISHING/product;                       }
}
```
`stream ID = liquor`; `state file = 0/BRINE/liquor`; producer port `BRINE/liquor`,
consumer port `EXTRACTION/liquor` are merely endpoints — no competing identity.

**Role is inferred from the edge SHAPE in the current domain — `boundary{}` is
DELETED (duplicate truth) from root, sectors and nested sub-flowsheets:**

| edge shape        | role     | meaning of `0/<stream>` |
|-------------------|----------|-------------------------|
| `to` only         | inlet    | fixed external input in this domain |
| `from` + `to`     | internal | initial state / guess |
| `from` only       | outlet   | initial state, then calculated output |

**The FINISHING lesson (why this is not theoretical):** `{ from dryer/drySolid;
to product }` + `{ from recoverer/product; to fines }` used a PORT name (`product`)
as a stream identity. The physical streams are `product` (from dryer/drySolid),
`fines` (from recoverer/product), `cleanAir`, `humidExhaust` — so
`0/FINISHING/drySolid` must NOT exist (drySolid is a dryer PORT) and
`0/FINISHING/fines` MUST exist. The edge NAME resolves it; the port cannot.

**Refined flowsheetDict scope (do not over-redesign):** `flowsheetDict` =
graph topology + immutable unit declaration (type / model / operation config).
It NEVER carries stream state. `0/` = process state. `solverDict` = numerics.

**Build order (no more partial compliance):** (1) named-edge grammar (from/to
stay endpoint ports); (2) migrate ALL flowsheetDicts (no mixed anonymous/named);
(3) delete every `boundary{}`, infer role from edge shape; (4) rename state files
so edge IDs == `0/` filenames (fix FINISHING: drop drySolid, add fines); (5) hard
READ-TIME validator (graph stream IDs == `0/` IDs; missing/orphan = FATAL; no
solver code infers identity from endpoint names); (6) drill-in role-flip tests;
(7) ONLY THEN converged/ writer + corpus migration.

---

## 1. The state model — per-stream files, not `streams {}`

A stream's STATE lives in its OWN file on disk, OpenFOAM-style — never buried
inside `flowsheetDict`. The composed flowsheet declares the TOPOLOGY (units +
links); the state directories carry the NUMBERS.

```
lithiumBrinePlant/
├── system/           how the problem is organised and solved
│   ├── controlDict
│   ├── flowsheetDict     global domain assembly (units + inter-sector links)
│   ├── solverDict        tears, convergence, numerics
│   ├── designDict        [optional] process-unit -> physical-equipment mapping
│   └── economicsDict     [optional] economic-analysis configuration
├── constant/         model + data that do not change during execution
│   ├── thermoPhysPropDict   the declared thermophysical system (v2)
│   ├── propertyManifest     the sealed record registry (sha256 per record)
│   ├── components/          sealed / case-local component records
│   ├── reactions/
│   ├── designBasis/      [optional] materials, margins, pressureRules, corrosion, equipment/
│   └── economicBasis/    [optional] currency, costIndex, utilities, labour, locationFactors, finance
├── BRINE/ EXTRACTION/ …  SECTORS: each a local subgraph + optional model overrides
│   ├── system/flowsheetDict   the sector's own subgraph
│   ├── system/solverDict       [optional override]
│   └── constant/thermoPhysPropDict (+ propertyManifest)   the sector's THERMO WORLD (e.g. Pitzer, NRTL)
├── 0/                COMPLETE INITIAL STREAM STATE  (one file per stream)
│   ├── BRINE/brineFeed  BRINE/naclMotherLiquor  BRINE/liRichBrine  …
│   └── EXTRACTION/organicFeed  EXTRACTION/raffinate  EXTRACTION/loadedOrganic  …
├── converged/        CONVERGED STEADY STATE       (same tree as 0/)
├── iterations/       [optional] numerical history  000001/ 000002/ …   NEVER physical time
├── 0.01/ 0.02/ …     PHYSICAL TRANSIENT TIME snapshots
├── design/           PHYSICAL EQUIPMENT REALISATION  (BRINE/EV-101/{design,geometry,rating} …)
├── economics/        COST & VALUE  (equipment/ · sectors/ · plant)
└── postProcessing/   reports/ plots/ pinch/ comparisons/
```

### Directory semantic contract

| Directory | Meaning |
|---|---|
| `system/` | How the problem is organised and solved. |
| `constant/` | Model and data that do not change during execution. |
| `BRINE/`, `EXTRACTION/`, … | Process subdomains / sectors: a local subgraph + optional model overrides. |
| `0/` | **Complete** initial stream state over the composed flowsheet. |
| `converged/` | Converged steady state. |
| `iterations/` | Optional numerical history. **Never** physical time. |
| `0.01/`, `0.02/`, … | Physical transient-time snapshots. |
| `design/` | Physical equipment realisation derived from process state + design basis. |
| `economics/` | Equipment, sector and plant cost/value results. |
| `postProcessing/` | Derived reporting and presentation outputs. |

---

## 2. The rules to freeze

### 2.1 The graph is fractal
The root `flowsheetDict` assembles SECTORS and inter-sector links only. Internal
sector topology stays in the sector subgraph — never duplicated at the root.

### 2.2 Completeness contract — every declared stream exists in `0/`
> **N streams in the composed graph  ==  N stream-state files in `0/`.**

Missing files AND orphan files are **FATAL for `choupoSolve`**. There is no
partial state.

### 2.3 Stream role is inferred from TOPOLOGY (no mini-language)
```
no producer + consumer   -> inlet
producer   + consumer    -> internal
producer   + no consumer -> outlet
```
No `fixed true`, `guess true`, `coupled true`, or boundary-condition
mini-language at this level. *(This supersedes the old
`information-follows-streams` boundary flags for state; topology is the truth.)*

### 2.4 Inter-sector streams are stored ONCE
```
BRINE -- liRichBrine --> EXTRACTION
   state file:  0/BRINE/liRichBrine          (NOT also 0/EXTRACTION/liRichBrine)
```
**Ownership:** an internal or inter-sector stream belongs to its PRODUCING
sector; an external inlet belongs to its CONSUMING sector; an external outlet
belongs to its PRODUCING sector.

### 2.5 `choupo-init0` is explicit (R1 — amended)
The author supplies **domain inlets + any cycle-breaking seeds the graph
requires** (a recycle tear's initial state does NOT generally follow from the
feeds — feed propagation is honest only on an ACYCLIC graph). `choupo-init0`
then propagates from those states and MATERIALISES every remaining stream file
in `0/`.
```
incomplete 0/  +  choupo-init0   ->  allowed preparation step (announced, persisted)
incomplete 0/  +  choupoSolve    ->  FATAL
choupo-init0 never overwrites an authored file unless --force is explicit
```
Glass-box: generation is explicit, announced, inspectable, persisted to disk.
The solver never invents hidden stream states in memory.

### 2.6 Drill-in changes the DOMAIN, not the stream
```
global plant:            BRINE -> liRichBrine -> EXTRACTION      role: internal
drilled EXTRACTION:               liRichBrine -> EXTRACTION      role: INLET
```
The role flips automatically because the producer (BRINE) LEFT the current
domain. The child `0/` is materialised from an **explicit persisted parent
state — `converged/` by default** (R3). The drilled sub-case is then
reproducible from disk alone; Run reads its `0/`, Reset discards no truth.

*This is the clean replacement for the volatile in-memory drill-in feed
injection (inherited-result / `&feeds=` / run-time freeze). Those were
band-aids for a missing persisted-state model; they are retired once drill-in
materialises a child `0/` from the parent `converged/`.*

### 2.7 Drill-in source (R3 — amended): `converged/` default, never silent "latest"
```
default:              --from converged
explicit alternatives:  --from 12.5   --from iterations/000042   --from <persisted state>
```
"latest" is ambiguous exactly where reproducibility matters most (latest
transient? latest iteration? latest state before abort?). If `converged/` does
not exist, **FAIL clearly and require an explicit `--from`**. No unconverged
state is ever selected silently.

### 2.8 Process unit is NOT physical equipment
A flowsheet unit is a MATHEMATICAL/process operation; design equipment is a
PHYSICAL object. One process unit may realise MANY physical items (a column
model → shell + condenser + reboiler + reflux drum + pumps). `system/designDict`
maps process models → equipment; `design/` stores the calculated equipment
results.

### 2.9 Economics depends on physical design
```
flowsheet -> process state -> equipment design -> equipment cost
          -> sector economics -> plant economics
```
Do NOT compute plant CAPEX from a mathematical unit block before the physical
geometry, materials and pressure rating are designed. *(Consistent with the
price-data doctrine: market data lives in `constant/economicBasis`, dated+cited.)*

---

## 3. Stream-state grammar (AMENDED 2026-07-06, `streams_spec_response`)

**Choupo accepts SEVERAL canonical, mutually-exclusive material-flow
specifications. Every DIMENSIONAL scalar carries its unit and is converted to SI
on read. The runtime normalises all accepted forms to ONE internal state
representation; the writer emits ONE deterministic form.** (Supersedes the earlier
"canonical componentFlows grammar" — that name overclaimed canonicality, hid the
basis, and blurred overall material vs phase-resolved state.)

**Two orthogonal axes.**

**(A) Material — choose exactly ONE form (a second form in one file is FATAL):**
```
componentMolarFlows { water 86 kmol/h;  NaCl 12 kmol/h; }          // A: component molar
molarFlow 100 kmol/h;  moleFractions { water 0.86; NaCl 0.12; }    // B: total molar + x
componentMassFlows  { water 1549.3 kg/h; NaCl 701.3 kg/h; }        // C: component mass
massFlow 2335.4 kg/h;  massFractions { water 0.6634; NaCl 0.3003; } // D: total mass + w
```
The parser identifies the form from the keywords — no basis/representation
bureaucracy. Fractions that do not close (Σ≠1) are FATAL. Mass forms convert via
the component `MW`. `componentFlows` is a LEGACY alias (fluid-only) accepted on
read, never written.

**(B) Thermodynamic closure — exactly ONE PAIR of independent state variables**
(an OpenFOAM inlet-patch analogy: one role, several valid ways to impose it):

| pair | keywords | resolves |
|------|----------|----------|
| TP  | `T` + `P` | general equilibrium (implemented) |
| PH  | `P` + `molarEnthalpy`/`massEnthalpy` | flash (recognised; resolution deferred) |
| PS  | `P` + `molarEntropy`/`massEntropy` | flash (deferred) |
| TQ  | `T` + `vaporFraction` | saturation (deferred) |
| PQ  | `P` + `vaporFraction` | saturation (deferred) |
| resolved | `T` + `P` + `phases{}` | machine-written snapshot / drill-in |

Enthalpy/entropy use EXPLICIT keywords (`molarEnthalpy -12.5 kJ/mol;`), never bare
`H`/`S`. **THREE top-level state variables over-specify → FATAL; ONE
under-specifies → FATAL** (both name what was found and the legal pairs). A
zero-flow guess may keep `T`/`P` as numerical seeds.

**The phase is a RESULT, not stored state** (settled 2026-07-09, the Claude+ChatGPT
design forum + Vítor's Tc rule; `memory/phase-is-result-2026-07-09`). `(T, P, z)`
fix the phase; the file **NEVER** carries a decorative `vaporFraction 0/1`. The
FILE READER does no thermodynamics — it reads only **pins**:

| pin | keyword | meaning |
|-----|---------|---------|
| two-phase split | `vaporFraction q;` (0<q<1) | a saturation SPLIT `T`,`P` alone do not fix |
| phase intent | `phase gas\|liquid;` | this feed enters as gas / liquid (a boundary spec) — the legible replacement for a `vaporFraction 0/1` a reader once needed |

Absent a pin, **PHASE RESOLUTION happens in the resolver, after unit setup**, in two
layers: **layer 1** — the *Tc screen* (Vítor's rule: only speak of vapour when
`T < Tc` of the mixture): a non-pinned stream whose `T` exceeds **every present
component's `Tc`** cannot form a liquid → permanent gas / supercritical single phase,
`vf=1`, cheap and thermo-context-independent; **layer 2** (deferred) — a TP/flash in
the *consuming unit's* effective thermo world, for sub-critical ambiguity. `phase gas`
is exactly for the gap the Tc screen cannot close — a gas mixture holding a
sub-critical species (steam in a WGS gas). `vaporFraction` keeps its one precise job
= `n_vapour / (n_vapour + Σ n_liquid)` (solids excluded); a resolved snapshot puts it
under `derived{}`. *(A pure-component TP on its coexistence manifold is genuinely
non-unique; the flash must detect the degeneracy and FATAL asking for TQ/PQ/PH — not
silently pick a split.)*

**Overall material ≠ phase-resolved.** `componentMolarFlows` is the OVERALL
material (all phases). When multiphase, a `phases { … }` block DECOMPOSES it and
must **sum back to the overall exactly** (validated on read). A resolved snapshot:
```
componentMolarFlows { water 99.5 kmol/h;  Li2CO3 0.5 kmol/h; }     // overall
T 363.15 K;  P 1 bar;
phases {
    liquid { componentMolarFlows { water 99.5 kmol/h;  Li2CO3 0.193098487 kmol/h; } }
    solid  { componentMolarFlows {                     Li2CO3 0.306901513 kmol/h; } }
}
derived { vaporFraction 0;  molarEnthalpy -280.9 kJ/mol; }   // diagnostics, NOT constraints
```
Retires the ambiguous `componentFlows`+`solidFlows` pair (where `componentFlows`
silently meant the *non-solid* portion).

**Role decides the file's meaning (topology, §2.3).** An INLET's `0/` file is a
boundary specification — an AUTHORED material form + one closure, no `derived{}`.
An INTERNAL/OUTLET file is an initial guess the solver may overwrite — a
machine-written snapshot with `derived{}`. Same directory; role inferred from the
graph; no `fixed`/`guess` tag. `converged/` and physical-time dirs are always
resolved snapshots. The writer NEVER rewrites a user-authored `0/` to normalise
style. **Empty `componentMolarFlows {}` = explicit zero total flow; a missing
material block = UNSPECIFIED = error.**

---

## 4. Migration — COMPLETE (the dual reader is history)

The corpus migration finished 2026-07-10 and the transitional dual reader was
then removed.  Today the rule is simpler and absolute: `0/` is the ONLY home
of steady stream state.  A `streams {}` block authored in any flowsheetDict —
root or nested sub-flowsheet — is REFUSED loudly with a pointer to the `0/`
grammar and `bin/choupo-init0`; there is no fallback and no merge.  The
negative-parity gate (`bin/curate/check_v2_refusals.py`) keeps both refusals
executable.

---

## 5. Build order (ratified)

1. **`0/` reader + strict completeness validator** — read per-stream state
   files, infer roles from the composed graph, validate exact graph/file
   correspondence. Legacy fallback ONLY when `0/` is absent.
2. **`choupo-init0`** — generate internal states by explicit propagation from
   authored inlets + required cycle-breaking seeds. Never silently overwrite.
   *(BUILT 2026-07-09: `bin/choupo-init0` → `choupoSolve -init0`.  Propagation =
   mixed-inlet estimate per unit, flow split evenly across outputs — a GUESS the
   solver overwrites, persisted + announced.  Every inlet must be authored; an
   unseeded recycle is FATAL naming the seed; a legacy `streams{}` case migrates
   in one shot UNLESS it carries a `$variable` reference — that is an outer
   driver's handle on the stream, and a numeric `0/` file would sever it, so the
   tool refuses loudly.  Verified: a case whose generated estimates replace the
   authored internals converges to the identical result hash.)*
3. **Migrate `lithiumBrinePlant` first** — the proof-of-concept for sectors,
   complete `0/`, inter-sector ownership and drill-in.
4. **`converged/` writer** — write the full steady solution; `iterations/` only
   as optional numerical history.
5. **Topological drill-in** — materialise a standalone sector sub-case from an
   explicit parent persisted state; default source `converged/`.
6. **Corpus migration** — migrate tutorials incrementally behind the dual
   reader; remove legacy support last.
7. **Design + economics layers** — only after the state model is stable, add
   `designBasis/`+`design/` and `economicBasis/`+`economics/` WITHOUT
   contaminating the stream-state directories.

---

## 6. Final recommendation (ratified)

> **Freeze the macro-architecture. Implement the state model first. Do not
> reopen the ontology unless a concrete case proves the contract fails.**

The immediate coding target is the `0/` reader, exact completeness validation,
and the strict new-world/legacy precedence rule.
