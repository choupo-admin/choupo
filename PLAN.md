# PLAN -- the CML plan: what is scheduled, by horizon (short, medium, long term)

Read at the start of every session (CLAUDE.md section 0, rule 8).  Each row
points at its entry in DEV.md section 4c, the register of record; this file
says only WHEN and IN WHAT ORDER.  Change a row in the same commit as the work
that changes it.  Vítor's private Portuguese view of this plan is
https://claude.ai/artifact/JnokFGgoNMTAWvu9fkgyoQ -- updated FROM this file.

Last reviewed: 2026-10-31, after an audit of every request Vítor made from
2026-10-24 to 2026-10-31 (two independent passes over the session transcript;
24-25 Oct: nothing lost, 10 partial; 26-31 Oct: 3 lost, 8 partial), and after
Vítor's rule 00 (CLAUDE.md): the architect takes every decision; only facts
Vítor alone holds, and each push, wait on him.

Status words: `todo` · `running` · `decide` (the architect's, with a written reason) · `waits-Vitor` (a fact or act only he holds) · `blocked` · `done`.

## Short term (the next hour)

| status | what | ref |
|---|---|---|
| running | Integrate C178 (with Vítor's three rulings) on top of the Node 18 fix to `method_tools.mjs`; then validate it in the site's WASM | C178 |
| running | C185 item 7 (LHHW detailed balance), general choupo-59 on `claude/c185-lhhw-balance` | C185 |
| todo | Check on the site, after its deploy, that the volcanic case is gone and the GUI lesson test fix is live | C182 |

## Medium term (the next day)

Generals in parallel only on disjoint files; the commander integrates one at a
time.  Any golden row that moves goes to Vítor as a list before it is recorded.

| status | what | ref |
|---|---|---|
| todo | thirdBody reactions at rate zero (BatchReactor); ignition01 x3 goldens move -- list to Vítor | C185 item 9 |
| todo | Distillation defects A (fullMESH seeded by an unconverged CMO phase) and B (NewtonND accepts a non-improving step); measure which corpus cases reach the path; a full sweep only with Vítor's written authorisation | C184 A/B |
| todo | Positivity guard off with several ODE units -- AFTER C178 lands (same file) | C185 item 8 |
| todo | Optimiser reads unconverged simulations -- AFTER C178 lands (same file) | C186 item 4 |
| todo | Pressure is not a tear variable: a loop with no pressure-consistent steady state "converges" | C186 item 5 |
| todo | An unconverged bubble temperature is drawn in the T-x-y diagram | C186 item 6 |
| todo | C170's owed fixes: gates must not judge `data/local` or untracked files; `check_workspace_truth` wording; refuse `nu 0; order 1`; records still citing Burcat | C170 |

## Long term (the next seven days)

| status | what | ref |
|---|---|---|
| todo | Verify and fix C187 (1) (the Gibbs review's three open items) and (2) (SpeciationSolver outer convergence) | C187 |
| todo | Views for choupoSolve cases; C149's parallel runs | C187 (5), (6) |
| todo | Distillation P0 (step contract, singular-Jacobian diagnostic naming the stage and equation); P1-P3 as a written proposal for Vítor, no code | C184 |
| todo | Re-run Vítor's DME plant (branch `claude/c184-distillation`) and classify its failure: infeasible spec / thermo data / ill-conditioned / implementation | C184 |
| todo | aceticAcid02: the subcooled-feed q in the simultaneous column branch | C174, C175 |
| todo | Show a props run's `postProcessing/` in the GUI case tree | C183 (1) |
| todo | Owed answer tables: point-by-point reply to the EduTools review; C112 final table | C150, C112 |
| todo | EduTools: actually dispatch C127; quizzes (7 of 66 tools have one); C132; the RTD lesson | C127, C158, C132 |
| todo | Commit the UX-audit deliverables now only in a scratchpad (component inventory, information-architecture map, reuse list, acceptance criteria) | C168 |
| todo | Parity study phase 0 is only on `claude/c160-parity-study`: land it or decide | C160 |
| todo | Check that the details pane is still resizable after the C172 rewrite | C153 |

## The architect's decisions (rule 00; each taken with its written reason in DEV.md 4c)

| status | what | ref |
|---|---|---|
| decide | Sequential cooling: independent / solids retained / solids removed; solid-phase balances; CO2 as a separate boundary condition | C181 |
| decide | Where props operations write their CSV (case root today, or `postProcessing/<op>/`) | C183 (2) |
| decide | Laboratory template for a DSPM-DE fit | C177 |
| decide | Temperature excursion: the excipient and buffer names; whether the Explorer lens stays | C118 stage 3 |
| decide | Registered-trademark wording for the eight guides and the paper | new |
| decide | The reviews owed: C140 lesson (factor stays unwritten, decided), C53/C54, C101, C143, C58 | several |
| decide | Scope of the chemical-network EduTool | C139 |
| decide | Two liquid surfaces: the architecture (today a refusal by name) | C173, C187 (4) |
| decide | The comparison's recommendations (ii)-(viii): which enter the plan | C187 (3) |

## Waits on Vítor (facts and acts only he holds)

| status | what | ref |
|---|---|---|
| waits-Vitor | Each `git push` (asked with the list of commits ready) | rule 00 |
| waits-Vitor | Reactive full MESH and the multi-ion NF dataset: the reference PDFs | C175, C176 |
| waits-Vitor | JOSS: ORCIDs, DOI; whether Pedro Mendes agrees to enter CITATION.cff | C168 (3), C171 |
| waits-Vitor | Was the reply to Tim (MionTec) sent? | C171 |

## Done (kept for one week, then removed)

| status | what | ref |
|---|---|---|
| done | Silica: a neutral dissolution master weighed as an aqueous species; checked in the site's WASM | C179, 571301962 |
| done | Precipitation against temperature as a native view; seen in the site's Studies | C180, b3b25db47 |
| done | JOSS paper sent to Pedro Mendes (paper.md attached) | 2026-10-27 |
| done | Audit of Vítor's requests 24-31 Oct | 2026-10-31 |
| done | C182 on main: the degC view axis, the volcanic case deleted (now a gate fixture), DEV.md C182-C186, five GUI lesson citations re-pointed | C182, 85700dbb8 |
| done | This plan in git (PLAN.md, CLAUDE.md section 0 rule 8) | PLAN.md |
| done | Seven wrong STATUS lines corrected in DEV.md 4c (C140, C173, C174, C118 stage 2, C172, C170 item 6; C178 on its integration) | DEV.md 4c |
| done | The audit's unrecorded items recorded (C187), the comparison's recommendations registered without the name | C187 |
| done | CLAUDE.md section 0: rule 00 (the architect decides), the laptop's measured budget, "the CML plan" | CLAUDE.md |
