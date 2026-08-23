# The LLM-authoring benchmark — five fresh agents, the kit alone

**Date:** 2026-08-23.  **Commissioned by Vítor**, on the constitution's
stance that students will interact with Choupo THROUGH LLMs: the assistant
assembles the case, the student reads a glass box.  The authoring surface is
therefore `bin/llmctx` (the `docs/ai/` kit, 8144 lines at this run), and the
question this benchmark asks is Gall's: **does that surface work, or is it a
pile of patches that a rollback should replace?**

## Protocol

Five FRESH agents (no session memory, no repo knowledge), each given one
typical student request and these hard rules: the ONLY documentation they may
read is the generated `llmctx` kit; tutorials/, docs/, src/, CLAUDE.md and
DEV.md are forbidden even when stuck; they may execute the solvers,
`choupo-init0` and `choupo-lint`; up to 8 author-run-fix rounds.  Deliverable:
every error verbatim, every fix attributed to a kit section or declared as a
guess, and the list of what the kit lacked.

The decision rule was fixed BEFORE the results, so it could not be bent to
them: 1–2 rounds → the surface works, fix the named doc holes; stuck on
GRAMMAR the kit does explain → that is the patch pile, and Gall's rollback
applies to that grammar.

## Scoreboard

| Case | Request | Verdict | Rounds |
|---|---|---|---|
| A | benzene–toluene isothermal flash | GREEN | 2 |
| B | ethanol–water column, 12 trays (azeotropic, NRTL) | GREEN | **1** |
| C | esterification conversion reactor | GREEN | **1** (material) |
| E | natural-gas flash, 60 bar, SRK φ-φ | GREEN | 2 |
| D | NaCl brine open to atmospheric CO₂ (speciation) | GREEN | **8** |

Physics quality where green: B's distillate 79.4 mol% EtOH (below the
azeotrope), balances exact; E's single-dense-phase verdict independently
cross-checked by the agent via TPD; D's final γ±(NaCl) = 0.681 at 0.5 m — the
literature value on the nose.

## The verdict at the crossroads

**The molecular authoring surface WORKS.**  Four of five requests — including
the azeotropic column, historically the hardest to converge — landed in 1–2
rounds, with the agents citing kit sections for nearly every decision and
`pitfalls.md` steering them correctly around the known traps.  No rollback is
indicated there; what it needs is the specific hole-list below.

**The electrolyte authoring surface is where the patches show.**  Case D took
8 rounds, and not because the agent was weak: THREE required keys are in no
document (`volatiles (…)`, `pH` on speciate, the `CO2aq` totals guess an open
system demands), the kit's own `electrolyteGammaPhi` example is REFUSED by
the engine for a reactive system ("serves ionic davies"), a record the open-CO₂
path requires (`species/CO2aq.dat`) is absent from the standards catalogue,
and the reachability semantics ("60 unreachable from this feed") are nowhere
explained.  An engine that refuses its own kit's example is the signature of
a grammar that accreted seams — this slice of the surface earns the Gall
treatment: not more documentation force, but a pass that makes the DECLARED
grammar and the SERVED grammar one thing again.

## Findings, ranked by pain

**F1 — exit 0 with the phases mislabelled (hit independently by A and E).**
`dict-syntax.md`'s producedStreams table says `isothermalFlash → vapor,
liquid`; the engine emits **liquid, vapor**; `unit-ops.md` has it right.  The
section that TEACHES the positional rule is the one that is wrong, the
mistake is silent (the kit itself warns "the engine does not warn"), and
lint cannot see it.  *Fix: the table; consider a lint arm that flags a VL
unit whose first output is named like a vapour.*

**F2 — two SPURIOUS "ENERGY BALANCE FAILED" banners on correctly-authored
cases.**  (C) `conversionReactor` hard-stamps its outlet `phase gas;`,
undocumented, so a liquid-phase esterification shows a 919 kW "unexplained"
residual that is exactly the latent heat of the stamp; (E) an all-vapour feed
left unpinned is priced vf = 0 and manufactures a −11 kW residual, and the
`phase gas;` remedy exists but no pitfall connects it.  A red FAILED banner
on a perfect case teaches a student to distrust the simulator, not the
stamp.  *Fix: engine-side wording/attribution for C's class (the residual is
explainable and should say so), a pitfall each; C's stamp itself is a
modelling-posture question for Vítor.*

**F3 — the electrolyte D-list (one campaign, one slice each):** the missing
worked speciate example (propsDict + thermoPhysPropDict pair); `volatiles`;
`pH` required (schema says optional); the open-CO₂ protocol (gas-species
totals guess + the master that activates the network); the kit example vs
`davies` refusal; `species/CO2aq.dat` curated into standards (a data gap);
the `m_CO2aq` diagnostic echoing the authored guess where the CSV holds the
solved value (a truth-surface bug); reachability explained.

**F4 — the reactions-library grammar is never shown** (C guessed it from a
reactive-distillation snippet and got lucky).  Referenced ~10 times, shown
never.  *Fix: one worked `constant/reactions` example in unit-ops.md.*

**F5 — small but universal:** direct binary invocation (`choupoSolve
<caseDir>`) undocumented (all five agents guessed it); `choupo-lint` was REPORTED (B)
as printing a completeness ERROR at exit 0 — **refuted on verification**:
both the flash and B's own column shape exit 2 with the ERROR; the agent
mis-captured the code, and the auditor rule (nothing lands unverified) is
why this line is a refutation and not a fix; component inventory lacks validity windows (A ran benzene 16 K outside
its Antoine range and only the run said so); no SRK/PR kij pair inventory in
the catalogue (E); `CH4`-not-`methane` and the role-solute-as-EoS-component
doubt (E); `nStages` semantics buried (B); unsealed-is-fine never stated
(A, C leaned on a buried clause).

## What the benchmark says about the ambition

The constitution's bet — LLM assembles, student reads — is CLOSER than the
day's pessimism suggested: four surfaces of five already converge in a round
or two, and the remedy-bearing refusals are exactly what makes the loop
converge (D's eight rounds were POWERED by error text; the kit failed, the
refusals carried it).  The glass box held its end everywhere: balances,
advisories, and profiles let every agent VERIFY instead of trust.  The work
this buys is concrete and finite: F1 and F4 are afternoon fixes, F2 is one
engine-posture decision plus wording, F3 is the one real campaign, and F5 is
a checklist.  Nothing here calls for rolling back the engine; one slice of
grammar (the electrolyte authoring seams) calls for being made one thing
again rather than documented harder.

Agent reports (verbatim, with every error and attribution) are preserved in
the session transcripts; this record carries everything actionable.
