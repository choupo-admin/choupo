# PLAN -- what is scheduled, by horizon

Read at the start of every session (CLAUDE.md section 0, rule 8).  Each row
points at its entry in DEV.md section 4c, the register of record; this file
says only WHEN and IN WHAT ORDER.  Change a row in the same commit as the work
that changes it.  Vítor's private Portuguese view of this plan is
https://claude.ai/artifact/JnokFGgoNMTAWvu9fkgyoQ -- updated FROM this file.

Last reviewed: 2026-10-31, after an audit of every request Vítor made from
2026-10-24 to 2026-10-31 (two independent passes over the session transcript;
24-25 Oct: nothing lost, 10 partial; 26-31 Oct: 3 lost, 8 partial).

Status words: `todo` · `running` · `waits-Vitor` · `blocked` · `done`.

## Short term (the next hour)

| status | what | ref |
|---|---|---|
| todo | Correct seven wrong STATUS lines in DEV.md 4c: C140 (Cadotte landed), C173 (merged and re-recorded), C174 (merged), C118 stage 2 (lens on main), C172 (status bar removed), C170 item 6 (C127 was never dispatched), C178 (built on its branch) | DEV.md 4c |
| todo | Record what the audit found unrecorded: the three "not established" items of the 2026-10-26 Gibbs review (DirectMin gamma ordering and NV=0 by penalty, the gas-EOS loop capped at 30 passes; LL converged on Nelder-Mead stopping and the VLLE advisory; `Kvec_phases` on a phi-phi package and liquid-to-solid `s_formation`); SpeciationSolver outer convergence not requiring the inner Newton; the comparison with an open-source flowsheet simulator delivered on 2026-10-26 only as a private page (report into the repo where the doctrine allows the name, its recommendations registered); the two-liquid-surface architecture call into 4b; views for choupoSolve cases; the parallel runs C149 still promises | C173, C149, new |
| todo | Integrate C178 (with Vítor's three rulings) and validate it in the site's WASM | C178 |
| todo | Check on the site, after its deploy, that the volcanic case is gone and the GUI lesson test fix is live | C182 |

## Medium term (the next day)

Generals in parallel only on disjoint files; the commander integrates one at a
time.  Any golden row that moves goes to Vítor as a list before it is recorded.

| status | what | ref |
|---|---|---|
| todo | thirdBody reactions at rate zero (BatchReactor); ignition01 x3 goldens move -- list to Vítor | C185 item 9 |
| todo | LHHW reversible rate reaches a shifted equilibrium (RateLaw); list of LHHW cases that move | C185 item 7 |
| todo | Distillation defects A (fullMESH seeded by an unconverged CMO phase) and B (NewtonND accepts a non-improving step); measure which corpus cases reach the path; a full sweep only with Vítor's written authorisation | C184 A/B |
| todo | Positivity guard off with several ODE units -- AFTER C178 lands (same file) | C185 item 8 |
| todo | Optimiser reads unconverged simulations -- AFTER C178 lands (same file) | C186 item 4 |
| todo | Pressure is not a tear variable: a loop with no pressure-consistent steady state "converges" | C186 item 5 |
| todo | An unconverged bubble temperature is drawn in the T-x-y diagram | C186 item 6 |
| todo | C170's owed fixes: gates must not judge `data/local` or untracked files; `check_workspace_truth` wording; refuse `nu 0; order 1`; records still citing Burcat | C170 |

## Long term (the next seven days)

| status | what | ref |
|---|---|---|
| todo | Distillation P0 (step contract, singular-Jacobian diagnostic naming the stage and equation); P1-P3 as a written proposal for Vítor, no code | C184 |
| todo | Re-run Vítor's DME plant (branch `claude/c184-distillation`) and classify its failure: infeasible spec / thermo data / ill-conditioned / implementation | C184 |
| todo | aceticAcid02: the subcooled-feed q in the simultaneous column branch | C174, C175 |
| todo | Show a props run's `postProcessing/` in the GUI case tree | C183 (1) |
| todo | Owed answer tables: point-by-point reply to the EduTools review; C112 final table | C150, C112 |
| todo | EduTools: actually dispatch C127; quizzes (7 of 66 tools have one); C132; the RTD lesson | C127, C158, C132 |
| todo | Commit the UX-audit deliverables now only in a scratchpad (component inventory, information-architecture map, reuse list, acceptance criteria) | C168 |
| todo | Parity study phase 0 is only on `claude/c160-parity-study`: land it or decide | C160 |
| todo | Check that the details pane is still resizable after the C172 rewrite | C153 |

## Waits on Vítor

| status | what | ref |
|---|---|---|
| waits-Vitor | Sequential cooling: discuss the architecture (independent / solids retained / solids removed; solid-phase balances; CO2 as a separate boundary condition) | C181 |
| waits-Vitor | Where props operations write their CSV (case root today, or `postProcessing/<op>/`) | C183 (2) |
| waits-Vitor | Laboratory template for a DSPM-DE fit (deferred to "next week", which has come) | C177 |
| waits-Vitor | Reactive full MESH and the multi-ion NF dataset: credit is available, the reference PDFs are needed | C175, C176 |
| waits-Vitor | Temperature excursion: the excipient and buffer names; whether the Explorer lens stays | C118 stage 3 |
| waits-Vitor | JOSS: authors, ORCIDs, DOI; whether Pedro Mendes enters CITATION.cff | C168 (3), C171 |
| waits-Vitor | Registered-trademark wording for the eight guides and the paper | new |
| waits-Vitor | His pending reviews: C140 (IP lesson, Cadotte steps), C53/C54, C101, C143, C58 | several |
| waits-Vitor | Scope of the chemical-network EduTool (never put to him) | C139 |
| waits-Vitor | Two liquid surfaces: architecture decision (today only a refusal by name) | C173 |
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
