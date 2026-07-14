<!--
  Choupo — GUI internals + WASM build (DEV reference).
  The stack/phase/layout/adapter detail (was CLAUDE.md §12) and the
  WebAssembly build + Emscripten quirks (was CLAUDE.md §13). Relocated from
  CLAUDE.md 2026-06-06 to keep CLAUDE.md under its session-load budget.
  Audience: dev (same as CLAUDE.md). For the GUI DESIGN stance + the three
  questions to ask before any UI change, read docs/ai/gui-credo.md (the SSOT).
-->

# GUI internals + WASM build

The browser front-end for Choupo (`gui/`).  Separate from the C++ core but
shares the same licence (GPL-3.0-or-later).  The GUI is a **runner and visualiser,
NOT an editor** — cases are authored as plain-text dicts on disk.  Before
proposing ANY GUI change, read [`docs/ai/gui-credo.md`](ai/gui-credo.md) — the
single source of truth for GUI design (founding principles, deliberate
adaptations vs ParaView, consolidated patterns, anti-patterns, vocabulary,
roadmap, and the three questions to ask first).

---

## 1. Stack

| Layer | Choice |
|---|---|
| Build | Vite 5, TypeScript 5 strict |
| UI | React 18, Mantine v7, @tabler/icons-react |
| Flowsheet canvas | React Flow (`@xyflow/react` v12) |
| Plots | Plotly.js basic-dist-min (lazy-loaded chunk) |
| State | Zustand |
| Tests | Vitest |
| Solver execution | Web Worker hosting Emscripten WASM (`WasmAdapter`); falls back to `MockAdapter` if `.wasm` is missing |

All deps audited GPL-3.0-or-later-compatible (permissive only --- no SSPL,
no BSL, no copyleft).

An earlier prototype of editable property forms was reverted in commit
cbfe14d's neighbourhood — the operation schemas under `gui/schemas/operations/`
now drive read-only labels, units, and help tooltips, not input forms.

---

## 2. Phase status (2026-05-16)

| Phase | Deliverable | Status |
|---|---|---|
| 0 | JSON schemas + bidirectional dict↔JSON TS library; 152 round-trip tests on every dict file in `tutorials/` | ✓ |
| 1 | App shell (top bar, palette, canvas, property panel, output panel), mock solver, dark cyan theme | ✓ |
| 1.3 | Plots tab (Composition bar / T-x-y / Convergence semilog) via Plotly + lazy chunk; Streams table | ✓ |
| 1.5a | WASM solver in Web Worker; Stop button (AbortSignal); HEAD-probe fallback to Mock | ✓ |
| 1.5b | Classic menu bar (File / Tutorials / View / Run / Help); all 18 tutorials bundled via `import.meta.glob`; read-only property panel driven by operation schemas | ✓ |
| ~~2~~ | ~~Editable property forms; palette drag-to-add; save/load case as `.tar.gz`~~ | **dropped** — see design stance |
| 1.5c | C++ emits structured JSON summary so Plots/Streams populate from real solver (not just mock) | ⏳ |
| 2 | Live file watcher: edits to `tutorials/<name>/...` re-load the GUI (Vite HMR already does this in `npm run dev`; preview mode needs a rebuild) | ⏳ |
| 3 | VTK.js 3D viewer (bridge to Vítor's ParaView pipelines for membrane domain) | ⏳ |
| 4 | Backend (FastAPI + Postgres + Valkey queue + S3/MinIO, multi-tenant); `RemoteAdapter` shares UI with `WasmAdapter` | ⏳ |
| 5 | Auth (Keycloak / institutional SSO), K8s deploy, multi-universidade hosting | ⏳ |

---

## 3. Layout

```
gui/
├── package.json   tsconfig.json   vite.config.ts   postcss.config.cjs   vitest.config.ts
├── index.html
├── public/
│   ├── wasm/choupo{Solve,Batch,Ctrl}.{js,wasm}   built by `make wasm`  (gitignored)
│   └── workers/solverWorker.js            UMD→ESM bridge, MEMFS, exit hooks
├── schemas/                                JSON Schema draft 2020-12 — one per dict type
├── src/
│   ├── main.tsx  App.tsx  theme.ts
│   ├── adapters/
│   │   ├── SolverAdapter.ts          interface + RunResult (log + streams + convergence + txy)
│   │   ├── WasmAdapter.ts            main-thread side, AbortSignal cancel
│   │   ├── MockAdapter.ts            fallback (used when WASM not built)
│   │   ├── wasmModule.ts             availability probe (HEAD + content-type check)
│   │   └── index.ts                  resolveAdapter() factory
│   ├── dict/                         TS port of `src/core/Dictionary.{H,cpp}` (faithful, round-trip)
│   ├── case/{toGraph,types}.ts       case JSON ↔ React Flow graph
│   ├── case/operationSchemas.ts      read-only metadata helper for the Property panel
│   ├── state/store.ts                Zustand store (case, log, runResult, runStatus, panels)
│   ├── cases/tutorials.ts            import.meta.glob over../../../tutorials/*
│   └── ui/                           AppShell, MenuBar, TopBar, Palette, FlowCanvas,
│                                     UnitNode, StreamTerminal, PropertyPanel, OutputPanel,
│                                     PlotsPanel, StreamsTable,
│                                     plotting/{plotly,Composition,Txy,Convergence}
└── tests/                            roundtrip + json + parser tests (152 total)
```

### Commands

```bash
cd gui
npm install
npm run dev        # Vite dev server :5173
npm test           # vitest run (round-trip on all tutorials)
npm run typecheck  # strict TS
npm run build      # production bundle (main ~350 KB gz, plotly chunk ~380 KB gz lazy, PropsView ~9 KB gz lazy)
```

---

## 4. Adapter pattern

Both `WasmAdapter` and `MockAdapter` (and future `RemoteAdapter`) implement:

```ts
interface SolverAdapter {
  run(caseFiles: CaseFiles,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<RunResult>;
}
```

`resolveAdapter('wasm')` probes `/wasm/choupoSolve.js` (HEAD + `Content-Type`
check, because Vite's SPA fallback serves HTML for unknown paths) and returns
the WASM adapter if available, Mock otherwise (with a Mantine notification
explaining `make wasm` is needed).  The TopBar's Run button passes an
`AbortSignal`; the Stop button aborts it, which terminates the worker (WASM) or
breaks the streaming loop (Mock).

### Dict round-trip invariant

The GUI's `gui/src/dict/` is a port of the C++ parser/serializer.  The test
suite parses **every** dict file under `tutorials/` and asserts
`parse(serialize(parse(text))) === parse(text)` (structural AST equality).  When
adding new tutorials, the test discovers them automatically.

---

## 5. WebAssembly build (`make wasm`) — Emscripten quirks

The WASM solver is the same C++ as the native binary, compiled with Emscripten
and embedded into the GUI's `public/wasm/` for the worker to load.  The
apt-installed Emscripten (3.1.6 on Ubuntu 24.04) has several minifier/runtime
quirks that cost us most of a session to discover.  All workarounds are encoded
in `make/wasm.mk` and `gui/public/workers/solverWorker.js` — **do not remove**
without re-validating.

### Quirks documented

* **Auto-run of `main()` is silently skipped under `MODULARIZE=1`.**
  Read the generated `doRun()` in `choupoSolve.js`: it calls `initRuntime`,
  resolves the ready Promise, fires `onRuntimeInitialized`, and fires `postRun`.
  There is no `callMain` invocation, no matter what `INVOKE_RUN` is set to.
  Symptom is brutal: the factory resolves, `postRun` fires immediately, no
  banner, no `_main` ever ran.  An earlier note suggested `INVOKE_RUN=1
  (default)` and auto-run; that was wrong for `MODULARIZE=1`.
  **Workaround:** export an explicit C wrapper from
  `src/applications/choupoSolve/wasmEntry.cpp`:
  ```cpp
  extern "C" EMSCRIPTEN_KEEPALIVE int run_case(const char* dir) {
      char arg0[] = "choupoSolve";
      char* argv[] = { arg0, const_cast<char*>(dir), nullptr };
      return main(2, argv);
  }
  ```
  list it in `EXPORTED_FUNCTIONS=['_run_case',...]` plus
  `EXPORTED_RUNTIME_METHODS=['FS','ccall','cwrap']`, and the worker calls
  `Module.ccall('run_case', 'number', ['string'], ['/case'])` after the factory
  resolves.  Setting `INVOKE_RUN=0` is fine — the documented minifier-strip of
  `callMain` only bites if you also try to call `callMain` from JS, which we no
  longer do.

* **`callMain` referenced as a bare identifier `ReferenceError`s.**
  The Emscripten minifier strips `function callMain` while keeping
  `Module["callMain"]=callMain;`, so `import`ing the glue throws
  `ReferenceError: callMain is not defined`.  Triggers if you set
  `noInitialRun: true` in the factory options OR list `callMain` in
  `EXPORTED_RUNTIME_METHODS`.  **Workaround:** don't.  Use the `run_case`
  wrapper above; never touch `callMain`.

* **`NO_EXIT_RUNTIME=1` makes the worker hang.**  `onExit` never fires because
  `keepRuntimeAlive()` returns true; the solver completes, never signals done.
  **Workaround:** use the default `EXIT_RUNTIME=1`.  We terminate the worker per
  run anyway, so tearing down on exit is harmless.  `postRun` is also registered
  as a backup completion signal.

* **`ENV` is stripped under `-O2`** despite being whitelisted in
  `EXPORTED_RUNTIME_METHODS=['FS','ENV']`.  Setting `Module.ENV[...]` throws
  `ReferenceError: ENV is not defined`.  **Workaround:** don't rely on `ENV` at
  all.  Embed the curated reference tree at `/data/standards/` (`--embed-file
  data/standards@/data/standards`) so `main.cpp`'s fallback
  (`fs::exists(launchCwd / "data" / "standards" / "components")`) finds it
  without needing `CHOUPO_HOME`.  `FS`, `ccall`, and `cwrap` are safe (heavily
  used internally; never stripped).

* **UMD glue, not ES module.**  This Emscripten emits `module.exports` / AMD
  `define` / `exports[name]` UMD, **no** `export default`.  Imported as an ES
  module from a blob, all three UMD branches are dead and the namespace is empty.
  **Workaround:** in the worker, `fetch` the glue as text, append
  `export default createOpenProcessSolve;`, then `import` the resulting blob URL.
  Override `locateFile` so the `.wasm` sidecar resolves to
  `/wasm/choupoSolve.wasm` (the blob URL has no sidecar).

* **Vite forbids `import("/wasm/…")` from `src/`** (the public-dir guard fires
  even on dynamic imports).  **Workaround:** the solver worker lives in
  `gui/public/workers/solverWorker.js` (NOT in `src/`).  Vite serves it as a raw
  static file, and the worker's `import()` of the glue goes straight through the
  browser fetcher, untouched by Vite.

### Build targets

```makefile
make wasm-gui                   # the GUI bundle: ALL FOUR binaries
                                #   (choupoSolve + choupoProps + choupoBatch + choupoCtrl)
make wasm-steady-props          # FAST: just choupoSolve + choupoProps (the common src/ edit)
make wasm-solve                 # steady-state binary alone (choupoSolve)
make wasm                       # release -O2, build ALL FOUR binaries (same set as wasm-gui)
make wasm WASM_MODE=debug       # -O0 -g3, assertions on
make wasm-clean                 # remove artifacts
```

**`make wasm-gui` now builds all FOUR binaries.**  The GUI dispatches by
`controlDict.application`, so a transient case (`ctrl03` / `batch04`) needs
choupoCtrl / choupoBatch present in `gui/public/wasm/` to run in-browser and
offer the **time scrubber** (the holdup state per written instant).  The four:
choupoSolve (steady flowsheets), choupoProps (the PropsView — property scans /
fits), choupoBatch (batch + recipes), choupoCtrl (dynamic + control).  When you
only touched choupoSolve / choupoProps and the dynamic binaries are already
current, `make wasm-steady-props` is the fast path.  The build is
concurrency-fragile (two concurrent `make wasm*` clobber `gui/public/wasm/` ---
never run two at once; the four binaries build sequentially within one target).

**IMPORTANT — rebuild WASM after adding/changing a unit op.**  The GUI runs the
WASM build, which is SEPARATE from the native binary.  A new built-in (absorber,
heatExchanger, shortcutColumn, …) only appears in the browser after `make wasm`.
Symptom of a stale `.wasm`: the GUI errors `UnitOperation::New: unknown type
'<yourType>'` even though the native `choupoSolve` runs it fine.  Dependency
tracking on `make wasm` is coarse — if it says "Nothing to be done", force it
with `make wasm-clean && make wasm`.

**WASM is all-in-one static (no.so).**  The native build produces a shared
`libchoupo.so` that every binary links dynamically against; the WASM build
embeds the engine sources directly into each `.wasm`.  Same sources, two link
strategies.

**Note:** `make wasm` / `make wasm-gui` produce four `.js`/`.wasm` pairs in
`gui/public/wasm/`, one per binary (`choupoSolve`, `choupoProps`, `choupoBatch`,
`choupoCtrl`).  Each has a uniquely-named factory function (`createChoupoSolve`
/ `createChoupoProps` / `createChoupoBatch` / `createChoupoCtrl`) so they can
coexist in the same worker scope without clobbering globals.  The worker reads
the case's `controlDict.application` field (via `selectBinary` in
`WasmAdapter.ts`) and loads the matching binary.  Each `src/applications/<bin>/`
has a `wasmEntry.cpp` exporting `run_case(const char*)` that forwards to that
binary's `main()`.

### Transient cases — the time scrubber

A dynamic run (`choupoBatch` / `choupoCtrl`) with `solutionControl { write true; }`
drops OpenFOAM-style real-time INSTANT directories at the case root: each written
physical time `<t>/` carries `internalState` (the holdup truth — mole inventory,
T, V, conversion) and, for continuous units, `streams` (the instantaneous outlet
face).  In WASM these land in MEMFS.  The flow:

1. `solverWorker.js` walks `/case` after the run and harvests every
   `<t>/internalState` + `<t>/streams` (where `<t>` is an all-digit dir),
   posting them on the `instants` channel.
2. `WasmAdapter` parses them with `parseDynamicInstants` (`gui/src/case/
   dynamicInstants.ts`) — reusing the engine's OWN dict tokenizer (`parse` +
   `toJson`), never a regex — into `RunResult.instants`.
3. `PlotsPanel` adds a **Scrubber** view (`TimeScrubber.tsx`): a slider over the
   written times shows each unit's holdup card (T, V, inventory, extras + outlet
   face) and a marked T(t) line, defaulting to this view when `instants` exist.

`trajectory.csv` is still written + plotted (the **Trajectory** view); the
scrubber is the richer per-instant state on top of it.

`make` with no target builds the NATIVE binaries (`.DEFAULT_GOAL := all`, set
before the includes -- otherwise the first rule in `make/wasm.mk` would win).
The WASM build is always an explicit target: `make wasm-gui`.

### How to resume a debugging session

```bash
cd /path/to/Choupo

# 1. Native first — confirms the case still solves
./choupoSolve tutorials/steady/flowsheets/process01_reactor_flash

# 2. Rebuild WASM (after any change to src/)
make wasm

# 3. GUI dev server (and Firefox window in one shot)
bin/runGui              # boots devGui + opens Firefox at the URL
bin/runGui --kill       # stops everything (and reaps orphan Vites)
bin/runGui --no-browser # only the dev server, no Firefox

# `bin/runGui` delegates to `bin/devGui` for the orphan-cleanup and
# polling-fallback dance, then waits for the server to be reachable, then
# opens Firefox in a new window.  Re-runs are idempotent.
#
# In browser: Ctrl+Shift+R (full reload, esp. after rebuilding worker or .wasm).
# Click Run.  Badge should read WASM; log should stream the same output as the
# native run.  Stop button cancels mid-solve.
```

---

## 6. Property Explorer (`gui/src/ui/ExploreWorkspace.tsx`)

A visualiser scratchpad over `choupoProps` (gui-credo §3): browse the standard
catalogue, build a SET, pick a plot type, SEE the curve — reimplements ZERO
physics; every number comes from a synthesized transient `choupoProps` case run
through the WASM adapter.

- **Reactive, no Plot button.** A `useEffect` re-runs on any spec change
  (debounced 300 ms); a run-sequence ref discards stale results and an
  `AbortController` cancels the previous in-flight WASM run.
- **`case/exploreSynth.ts`** turns the picks (components, models, axis, ternary
  mode) into a `propsDict` + `thermoPackage` — identical in shape to an authored
  case.  Pure; no physics.
- **Pure vs mixture** — a per-component property (`Psat`, `Cp_liquid`) is one
  curve per compound, composition hidden; mixture scalars carry an equimolar
  badge.  Mode is derived from the property (correct-by-construction).
- **Plot types** — `Property vs T/P`, `Binary boiling envelope (T-x-y)`,
  `γ(x)`, `Ternary boiling surface (T_bubble)`, `Ternary solubility (LLE)`;
  gated disabled-with-reason by set size + VLE-ability + (LLE) UNIFAC-group
  availability.
- **LLE via UNIFAC** — `case/unifacGroups.ts` holds standard subgroup
  decompositions; exploreSynth emits a VLLE `phases` block (vapour + two UNIFAC
  liquids) so the solubility map needs NO fitted pairs.  `case/pairsCatalogue.ts`
  (build-time glob of the NRTL/Wilson pair `.dat`) drives the "pair found /
  absent → ideal" note.
- **Parallel ternary** — `case/ternaryParallel.ts`: the heavy ternary is split
  into `N = cores − 2` shards (`shard { k; n }` in the engine op), run across N
  WASM workers concurrently (each `adapter.run` spawns its own worker), and the
  partial CSVs merged (`mergeTernaryCsvs`, tie-line ids offset per shard).
- **Rendering** — `plotting/CsvAutoPlot.tsx` dispatches by CSV header;
  `plotting/TernaryPlot.tsx` projects barycentric (x1,x2,x3) onto a 2-D triangle
  (plotly-basic has no `scatterternary`) and draws either a scalar surface or a
  phase map + tie-lines.

Engine side (the ops it drives) → `docs/developerGuide.tex` §"Property
operations"; the theory of the diagrams → `docs/theoryGuide.tex` §"Ternary phase
diagrams".
