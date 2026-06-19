# Choupo — Web GUI

Browser front-end for the Choupo simulator.  React + Mantine +
React Flow + Plotly; loads the C++ solver as a WebAssembly module
running in a Web Worker, with an offline mock fallback.  GPL-3.0-or-later.

For project-wide context and the full Emscripten quirk list, see
[`../CLAUDE.md`](../CLAUDE.md) §12 (GUI) and §13 (WASM build).

---

## Stack

| Layer | Choice |
|---|---|
| Build           | Vite 5, TypeScript 5 strict |
| UI              | React 18, Mantine v7, `@tabler/icons-react` |
| Flowsheet       | React Flow (`@xyflow/react` v12) |
| Plots           | Plotly basic-dist-min (lazy-loaded chunk) |
| State           | Zustand |
| Solver — WASM   | Emscripten 3.1.6 (apt) ⇒ ES module loaded in a `type:'module'` Worker |
| Solver — Mock   | Deterministic local fallback when no WASM is built |
| Tests           | Vitest (124 dict round-trip + JSON round-trip + parser tests) |

All dependencies are GPL-3.0-or-later-compatible — no Redis ≥ 7.4 (SSPL), no
MongoDB, no HashiCorp BSL.

---

## Phase status (2026-05-16)

| Phase | What | Status |
|---|---|---|
| **0** | JSON schemas + bidirectional dict ↔ JSON TS library; round-trip test on every dict file in `../tutorials/` | ✓ |
| **1** | App shell — top bar, palette, React Flow canvas, property panel, output panel, dark theme; loads `process01_reactor_flash` from hardcoded TS strings | ✓ |
| **1.3** | Plots tab — composition bar chart, T-x-y diagram, convergence semilog, all themed and lazy-chunked | ✓ |
| **1.5a** | WASM solver running in a Web Worker; AbortSignal cancel + Stop button; fallback to `MockAdapter` if `.wasm` missing | ✓ |
| 1.5b | C++ emits a structured JSON results block so Plots / Streams populate from a real solver run | ⏳ |
| 2 | Property editors generated from JSON schemas; palette drag-to-add; save/load case as `.tar.gz` | ⏳ |
| 3 | VTK.js 3D viewer (ParaView bridge for Vítor's research codes) | ⏳ |
| 4 | Backend (FastAPI + Postgres + Valkey queue + S3, multi-tenant); a `RemoteAdapter` shares the UI with `WasmAdapter` | ⏳ |
| 5 | Auth (Keycloak / institutional SSO), K8s deploy, multi-universidade hosting | ⏳ |

---

## Layout

```
gui/
├── package.json   tsconfig.json   vite.config.ts   postcss.config.cjs
├── vitest.config.ts   index.html
├── public/
│   ├── wasm/choupoSolve.{js,wasm}    built by `make wasm` (gitignored)
│   └── workers/solverWorker.js            UMD→ESM bridge + MEMFS + exit hooks
├── schemas/                              JSON Schemas — one per dict type
├── src/
│   ├── main.tsx  App.tsx  theme.ts
│   ├── adapters/
│   │   ├── SolverAdapter.ts          interface + RunResult shape
│   │   ├── WasmAdapter.ts            main-thread side; cancellable via AbortSignal
│   │   ├── MockAdapter.ts            fallback when WASM not built
│   │   ├── wasmModule.ts             availability probe (HEAD + content-type)
│   │   └── index.ts                  resolveAdapter() factory
│   ├── dict/                         TS port of src/core/Dictionary (faithful round-trip)
│   ├── case/{load,toGraph,types}.ts  case JSON ↔ React Flow graph
│   ├── state/store.ts                Zustand store
│   ├── cases/process01.ts            hardcoded dict text for the demo case
│   └── ui/                           AppShell, TopBar, Palette, FlowCanvas,
│                                     UnitNode, StreamTerminal, PropertyPanel,
│                                     OutputPanel, PlotsPanel, StreamsTable,
│                                     plotting/{plotly,Composition,Txy,Convergence}
└── tests/                            roundtrip + json + parser tests
```

---

## Commands

```bash
cd gui
npm install
npm run dev          # Vite dev server, default :5173
npm test             # vitest run (124 tests)
npm run typecheck    # strict TS check
npm run build        # production bundle (main ~155 KB gz, plots lazy ~380 KB gz)
```

---

## Building the WASM solver (for the WASM badge to light up)

From the project root:

```bash
sudo apt install emscripten          # one-off — 3.1.6 on Ubuntu 24.04 is enough
cd ..
make wasm                            # → gui/public/wasm/choupoSolve.{js,wasm}
```

After `make wasm`, the GUI auto-detects the build at the next Run click
(no page reload needed — the probe re-checks each time).  The badge in
the top bar shows **WASM** when the real solver is active, **MOCK**
otherwise.

The Emscripten 3.1.6 build has several quirks that the worker and
Makefile work around (UMD output, stripped runtime methods under `-O2`,
suppressed `onExit` with `NO_EXIT_RUNTIME=1`, Vite's public-dir guard,
…).  All workarounds are documented in [`../CLAUDE.md`](../CLAUDE.md)
§13 — read it before touching `make/wasm.mk` or
`public/workers/solverWorker.js`.

---

## Adapter pattern

```
┌──────── UI ────────┐    ┌─── SolverAdapter ───┐   ┌─── solver ───┐
│ TopBar  Run/Stop   │ ──▶│ run(case, onChunk,  │──▶│ WASM / Mock  │
│ AbortController    │    │     signal) → Promise│   │ (or remote)  │
└────────────────────┘    └──────────────────────┘   └──────────────┘
```

All adapters implement:

```ts
interface SolverAdapter {
  run(
    caseFiles: CaseFiles,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<RunResult>;
}
```

`resolveAdapter('wasm')` probes `/wasm/choupoSolve.js` (`HEAD` +
`Content-Type` check, because Vite's SPA fallback serves HTML for
unknown paths) and returns `WasmAdapter` if the build is present,
`MockAdapter` otherwise — with a Mantine notification explaining the
fallback.

The TopBar's **Run** button:

1. Calls `resolveAdapter('wasm')`.
2. Creates an `AbortController` and passes its `signal` into
   `adapter.run(...)`.
3. Renders the button as red **Stop** while running.  Clicking Stop
   aborts the signal — `WasmAdapter` `terminate()`s its worker;
   `MockAdapter` breaks the streaming loop.

---

## Dict round-trip invariant

The library in `src/dict/` is a faithful port of the C++ parser /
serializer in `../src/core/Dictionary.{H,cpp}`.  The test suite parses
**every** dict file under `../tutorials/` and asserts

```ts
parse(serialize(parse(text))) ≡ parse(text)
```

(structural AST equality, not byte-level).  When you add a new
tutorial, the regression discovers it automatically — no allow-list to
maintain.
