# C207 -- the line list: moved and appended golden rows

Slice rule: no process (solve) number may move; new sizing rows go in with
`--record-append`; each case's change is explained here.

| case | rows moved | rows appended | why |
|---|---|---|---|
| `tutorials/plant/greenAmmoniaPEQ_baseCase` | 0 | 568 | the case now declares `lineDesign {}` (system/layoutDict) and `transport { liquid { viscosity { } } }` (constant/thermoPhysPropDict, read only by the line list, which sizes the three liquid-ammonia lines).  The 568 rows are `layout line:<stream>` rows: 24 lines, each its service, ends, state word and 15 to 30 numbers.  `git diff` of `expected` shows additions only (0 deleted lines). |
| `tutorials/plant/line01_pumped_drum` | new | 32 refs, 141 rows with the layout rows | a new case, recorded once (`bin/runTests --record <case>`; a new golden is a recording decision, not a refresh). |
| `tutorials/batch/plant/apalutamide01_tablets` | 0 | 0 | declares no `lineDesign {}`: the result JSON is byte-for-byte what it was. |
| `tutorials/batch/plant/donepezil01_tablets` | 0 | 0 | same. |
| `tutorials/batch/plant/donepezil02_two_strengths` | 0 | 0 | same. |
| `tutorials/plant/aceticAcid02_plant` | 0 | 0 | same. |
| `tutorials/plant/ammonia02_full_plant` | 0 | 0 | same. |
| `tutorials/plant/swro01_campoDalias` | 0 | 0 | same. |
| `tutorials/steady/economics/economics04_building_royalty_breakeven` | 0 | 0 | same. |

The golden generator in `bin/runTests` gained the `line*` numeric keys of the
line records (one line); no existing layout record carries a key of that
name, so no existing row is produced differently.  The PEQ's solve
numbers (streams, KPIs, closures) are untouched: `--scope` over the nine
cases passes with the existing rows compared as written.
