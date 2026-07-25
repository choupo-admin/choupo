# `src/curation/` — engine-backed tools that read the catalogue for humans

Code here **uses the engine's own parsers and resolvers** (`Dictionary`,
`records::scanRecordDir`, the registries) but is **never on a solve path**.
That is the whole charter, and it exists for two reasons:

1. **One parser.**  A catalogue view written in Python or TypeScript would
   re-interpret the `.dat` grammar and drift from the engine.  Building it here
   means the view sees exactly what the solver sees — the same records, the
   same precedence (`inline / case-local / snapshot > standards > local`), the
   same sealing semantics.  Downstream tooling formats the JSON emitted here;
   it never re-reads the grammar.

2. **A checkable boundary.**  Navigation metadata
   (`metadata/aqueous-navigation.dat`) must never reach a solver — otherwise a
   taxonomy edit could change a result, and a sealed case could drift on a
   documentation change.  `bin/curate/check_aqueous_navigation.py` enforces
   that by scanning the runtime directories (`src/thermo`, `src/unitOperations`,
   `src/solver`, …) for any reader.  Keeping the view builder OUT of those
   directories keeps that rule absolute — no whitelist, no exception list to
   rot.

So the test for "does it belong here?" is: *does a `choupoSolve` / `choupoBatch`
/ `choupoCtrl` run ever call it?*  If yes, it belongs in the runtime tree.  If
it only answers questions a human asked, it belongs here.

Current contents:

| file | what it answers |
|---|---|
| `AqueousGraph.{H,cpp}` | the aqueous species–reaction graph, and the chemical-family views drawn from it (`choupoProps --aqueous-graph`, `--family <name>`) |
