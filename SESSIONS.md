# SESSIONS -- the board two sessions read before they push

Choupo is worked on by more than one assistant session at a time (Vitor,
2026-11-10: one on his laptop, one in the cloud while he travels).  `PLAN.md`
says what is planned; this file says WHO HOLDS WHAT RIGHT NOW, so that two
sessions do not edit the same files or integrate on top of each other.

Rules:
1. Read this file after every `git pull` and before every push.
2. Before starting a slice, add a row under your own session: the branch, the
   paths you will edit, the date.  Remove the row in the commit that lands it.
3. Edit ONLY your own section.  Two sessions that each touch their own
   section never conflict in a merge.
4. A path held by the other session is not edited.  If you need it, write one
   line under "Requests to the other session" and work on something else.
5. Push: `git pull --rebase origin main`, then the validation the change
   reaches, then push.  Never force-push `main`.
6. `DEV.md`, `PLAN.md` and `BRAIN.md` are shared: keep each edit to the rows
   of your own commission, and rebase before pushing them.
7. The coordinating session is the laptop one (CLAUDE.md rule 00).  A
   disagreement about scope is written here and decided there.

## Laptop session (coordinator)

| branch | holds (do not edit) | since |
|---|---|---|
| c280-fit-objective | `src/propertyOps/Fit*`, every `fitParameters` tutorial case | 2026-11-10 |
| c272-typical-train | `src/postProcessing/layout/`, `tutorials/plant/swro01_campoDalias` | 2026-11-10 |
| c268-utilities-block | `tutorials/plant/greenAmmoniaPEQ_baseCase` | 2026-11-10 |
| c266-walk-stage2 | `docs/audits/2026-11-10-student-walk-stage2.md` (report only) | 2026-11-10 |

## Cloud session

| branch | holds (do not edit) | since |
|---|---|---|

## Requests to the other session

(one line each, dated, signed "laptop" or "cloud"; delete when answered)
