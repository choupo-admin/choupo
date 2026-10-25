---
title: 'Choupo: an open-source chemical process simulator for education and research'
tags:
  - chemical engineering
  - process simulation
  - process design
  - engineering education
  - membranes
  - electrodialysis
  - C++
authors:
  - name: Vítor Geraldes
    # orcid: TODO (authors) -- real ORCID
    affiliation: 1
    # corresponding: true   # TODO (authors) -- choose the corresponding author
  - name: Pedro Mendes
    # orcid: TODO (authors)
    affiliation: 1
  - name: Miguel Rodrigues
    # orcid: TODO (authors)
    affiliation: 1
affiliations:
  # TODO (authors): the real affiliation(s), one entry per institution, with
  # its ROR identifier (top-level organisation only), and each author's index.
  - name: 'TODO (authors): affiliation'
    index: 1
date: 25 October 2026
bibliography: paper.bib
---

<!--
paper/joss/paper.md -- the Journal of Open Source Software submission for
Choupo (DEV.md 4c C126).  Prose: CC BY-SA 4.0.

REVISION 3 (2026-10-25), from the three-reader review kept at
reviews/2026-10-21-reader-review.md: reorganised around three capabilities,
each with ONE demonstrated example.  The answer to the review, point by
point: reviews/2026-10-25-response-to-reviewers.md.

EVIDENCE.  Every number below was READ FROM A RUN on the tree of branch
claude/c126-papers-revision (origin/main c11d0354a, 2026-10-25): `make all`,
each case copied to a scratch directory and run with the binary its
controlDict names.  The case and the field each number was read from are in
the comment beside it.  Counts: generated/releaseInventory.json at
3e5d03c52.

THE TEACH-WITH-AI EXERCISE is the reviewer's five steps, taken as a STATED
DEFAULT; Vitor may replace it with his own (the pedagogy is his).

NAMING.  check_doctrine admits paper/joss/ for the one open reference
simulator (DWSIM); every closed one stays banned.

Build:  pandoc paper.md --citeproc --pdf-engine=pdflatex -o paper.pdf
(or the JOSS preview, the openjournals/inara image).
-->

# Summary

Choupo is an open-source chemical process simulator for teaching and for
research. A user describes a plant -- feeds, unit operations, their
connections and specifications -- in plain-text files, and Choupo computes
its mass and energy balances, phase and chemical equilibria, recycles,
equipment sizes, costs and cash flow. It covers 52 unit operations, from
flashes, reactors and distillation columns to crystallisers, dryers,
nanofiltration modules and electrodialysis stacks, steady and transient.
The same C++17 engine runs on a local machine and, compiled to
WebAssembly, in a web browser at <https://www.choupo.org>, where the
tutorials can be opened and run.

Every run states what it did: the data and their sources, the models and
assumptions, each Newton iteration, every extrapolation, and three
conservation balances (mass, atoms, energy) computed after the solve. An
input the engine cannot honour -- an unknown model name, a missing unit, an
over-specified stream -- is refused by name with the remedy.

# Statement of need

A process simulator is usually met as a source of converged numbers. Choupo
is for the reader who also needs to see why those numbers came out: the
student who must defend a design, the researcher who inserts a new
transport law into a plant and must know which results it moved, and the
teacher who wants students to argue from a simulation an AI assistant may
have prepared for them. The three sections that follow show one example of
each use, built only from features the software has today.

# Three capabilities, each with one example

## Study a process: green ammonia, from feasibility to basic design

The tutorial corpus carries a 1200 t/day green-ammonia plant (bought hydrogen
and nitrogen compressed into a high-pressure synthesis loop)
through three stages of design, each a case that runs alone.

*Feasibility* (`tutorials/plant/greenAmmonia02_feasibility150bar`): one
Gibbs converter 5 K short of equilibrium, exchangers represented by their
duties, each duty assigned to the cheapest utility that can serve it. The
run returns 1180 t/day of ammonia, 180.8 kg of hydrogen per tonne,
13.7 MW of compression (278 kWh/t), 20.2 MW of refrigeration and 30.9 MW
of steam raised in the converter; a fixed capital of 41.4 MEUR on
bare-module correlations [@turton2018] and a cash flow whose net present
value is -493 MEUR at a hydrogen price of 4.5 EUR/kg. The economic
sensitivity the case declares answers the obvious question: the hydrogen
price decides, and at 3.6 EUR/kg the NPV is -25 MEUR.

*Basic design* (`tutorials/plant/greenAmmonia03_basicDesign`): the converter
becomes three adiabatic catalyst beds on a published rate law, with two
inter-bed coolers, inside one pressure shell, and every exchanger is
designed. A design specification solves the three bed volumes (8.95,
18.41 and 31.70 m^3^) and the shell diameter (2.23 m), so that the largest
bed pressure drop equals its allowance. Heat integration cuts the utility
bill from 31.5 to 6.2 MEUR/year, and the NPV improves to -341 MEUR.

Each run returns files: the stream table, each unit's results and
profiles, one specification sheet per sized item (32 for 15 units here,
each value with its unit and design basis, and the values the engine had
to assume named), the balances, the utilities, the cash flow and a
spreadsheet of all of it. The first law closes to 1.8 kW in both cases. A
further case lays the plant out on a plot plan the browser draws in 3D.

<!-- ga02_150 run: kpis.computed NH3_t_day 1180.346, H2_specific_kg_t
180.761, W_compression_kW 13670, W_specific_kWh_t 277.95,
Q_refrigeration_kW 20243.9, Q_steam_kW 30949.4; economics FCI 41384793,
NPV -493073826 (H2 base 4.5 EUR/kg: postDict sensitivity +/-20 % -> 3.6 /
5.4), sens_price_H2Feed_NPV_low -24575764; C_UT 31497424;
globalEnergyBoundary residual 1.752 kW.  ga03 run: CONVERTER.Bed1/2/3.V_R
8.951 18.4115 31.6971, $D_converter 2.2283 ("DesignSpec Result",
largestOf dP_over_allowable = 1.00005), C_UT 6214465, NPV -340927004,
residual 1.758 kW; 32 files under design/, 15 unit folders.  The layout:
tutorials/plant/greenAmmoniaPEQ_baseCase (system/layoutDict). -->

## Investigate a model: a limiting current that falls while you watch

A researcher's model becomes part of a process. The batch electrodialysis
rig of `tutorials/batch/electrodialysis/edbatch01_constant_current`
recirculates 5 L of brine through a bench stack at a constant 3.5 A. The
stack's limiting current is not a declared number: it is predicted from
the ion diffusivities and the diluate composition by the authors' own
model [@geraldes2010], which predicts the six measured limiting currents
of that paper's multi-ionic table within +1 to +12 %. As the diluate
depletes, the limiting current falls under the fixed current, from 643 to
88 A/m², and crosses it at 1593 s. The run shows the consequence: 86.3 %
demineralisation against the 91.4 % a hand calculation at the initial
current predicts, at 1.95 kWh per m^3^ treated. The sister case at a constant
4 V (`edbatch02_constant_voltage`) never reaches the limit, because the
current decays with the diluate's conductivity, from 4.37 to 2.02 A, and
demineralises 61.6 %.

What the researcher did not program is the rest: the two tanks and their
material balance (closed to 10^-15^), the time integration and its recipe,
the stream properties, the announcement of every estimated stack
parameter, the plots and reports. The case file varies the drive, the
over-limiting model, the stack record and the feed, multi-ionic included
(`edbatch03_multiionic_split`). The run states its limits: the heat the
electrical work becomes is not modelled, so the campaign's first law is
reported as unavailable rather than closed.

<!-- edbatch01 run: i_lim_initial 643.0407, i_lim_final 88.2631,
t_overLimiting_s 1593, demin_actual 0.86274, demin_ideal 0.91413,
specificEnergy_kWh_per_m3 1.946; header "material closure 1.4e-15".
edbatch02 run: I_initial 4.3653, I_final 2.0183, overLimitingReached 0,
demin_actual 0.61591.  ed04 run: i_lim 37.60 41.53 48.16 74.96 82.79 95.92
A/m2 vs measured 34.3 37.6 42.9 71.2 81.9 93.5 (README; Table 4 of
Geraldes & Afonso 2010). -->

## Teach with AI: a five-step exercise

An AI assistant can now write a Choupo case from a sentence; the
repository ships a short reference it is given first (`AGENTS.md`,
`docs/ai/`). The exercise below uses that, as a possible use: its
effectiveness has not been measured.

1. *Predict.* The student is asked what happens to the green-ammonia
   plant if the synthesis loop runs at 50 bar instead of 150 bar, and
   writes the prediction down.
2. *Prepare.* With an AI assistant, the student prepares the two cases
   (the corpus carries both: `greenAmmonia02_feasibility150bar` and
   `greenAmmonia02_feasibility50bar`).
3. *Run and identify.* The student runs both and reads from the files and
   the log which models and assumptions each used -- among them that the
   50 bar loop rests on a catalyst hypothesis, which the case says.
4. *Explain and defend.* The runs give compression 13.7 against 6.5 MW,
   refrigeration 20.2 against 31.2 MW, a recycle ratio of 2.3 against
   4.2 (less ammonia per pass), and a fixed capital of 41.4 against
   35.2 MEUR; the student explains each difference and defends one option.
5. *Anticipate.* The teacher changes a condition -- a 20 % cheaper
   hydrogen, say -- and asks for the response before it is run.

Steps 1, 4 and 5 are the student's; the engine makes everything the
assistant did in 2 and 3 checkable. Time saved in preparation can go to
comparing more alternatives and to interpretation.

<!-- ga02_150 vs ga02_50 runs: W_compression_kW 13670 / 6548;
Q_refrigeration_kW 20243.9 / 31228.9; recycle_ratio 2.275 / 4.179;
y_NH3_converter 0.197 / 0.151; FCI 41384793 / 35153707.  The catalyst
hypothesis: greenAmmonia02_feasibility50bar description ("resting on a
catalyst ...").  The five steps: the reader review's (point "The professor
teaching with AI"), a stated default for Vitor to keep or replace. -->

# State of the field

Open-source tools cover parts of this space. IDAES [@lee2021] writes
process models as equations for optimisation, inspectable from Python;
CoolProp [@bell2014] and Cantera [@cantera] are property and kinetics
libraries used inside other programs; DWSIM [@dwsim] is a mature flowsheet
simulator with a graphical editor and a far broader catalogue than
Choupo's. A companion article compares Choupo with DWSIM on five of its
sample cases [@choupo_cace]. Choupo is a separate program because three
requirements constrain its whole code base: the text files are the
complete problem, and the browser draws what the engine published, on the
OpenFOAM [@weller1998] / ParaView [@ahrens2005] pattern; one
dependency-free C++ core runs locally and in the browser; and units,
refusals and per-value data sources are enforced where every input is
read. Choupo is an independent project, not affiliated with, endorsed by
or sponsored by OpenCFD Ltd or the OpenFOAM Foundation, and no OpenFOAM
source code was adapted or reused in it.

# Software design

| what a user asks | what the design gives |
|---|---|
| Can I start in the browser and continue locally? | The browser runs the same compiled engine on the same case files. |
| Can I hand in, compare and reproduce a case? | A case is a directory of text files; every tutorial carries the property records it uses, with checksums, so it answers the same on any machine. |
| Which model of mine can I add? | A unit operation or a rate law is one class and one explicit registration line, compiled locally; a rate law can also be written as a formula in the case file and runs in the browser. |
| Do the data suit my conditions? | Each value carries its source; a correlation used outside its declared range is announced in the log and repeated at the end of the run. |
| Is there an example close to my problem? | 494 runnable cases, indexed by discipline. |
| Why did a calculation fail? | Each Newton iteration and residual is printed; a non-converged steady run writes no solution directory. |

A case has `system/` (topology, solvers, drivers), `constant/` (models
and data) and `0/` (one file per stream). The engine has three layers -- a
simulator core that maps a flowsheet to a solution, an outer driver that
calls it repeatedly (sweeps, design specifications, optimisation), and a
post-processor that sizes, costs and lays out
(\autoref{fig:architecture}).

![The three layers of the engine between the case files and the results; dashed layers are optional.\label{fig:architecture}](architecture.png){ width=100% }

The choices have costs. Explicit registration makes the origin of every
model one readable function, but adding a model means recompiling. The
browser only displays and runs, so a case is prepared in a text editor or
by an assistant, not on a canvas. A user's own C++ is compiled only
locally.

Correctness is checked rather than assumed. The test suite runs every
tutorial, screens for NaN and infinity, and compares the 477 cases that
carry a recorded answer with it -- which shows an answer has not moved,
not that it is right. Automated checks read the three balances of every
steady case; the twelve steady cases whose first law does not close are
listed by name with their residual, and each of them prints its residual
when it runs, so a user can tell a working example from an open problem. A
named subset of cases is compared with published measurements.

# Research impact statement

Choupo is public under GPL-3.0-or-later at
<https://github.com/choupo-admin/choupo>; the browser application runs at
<https://www.choupo.org>. The latest release is `Choupo-2608`; the numbers
in this paper are from the development line.
<!-- TODO (authors): cite the release the paper is submitted with and
re-run the numbers on it (Vitor's decision). -->
It offers 52 unit operations, a curated catalogue of 604 components and
276 mixture-parameter records, and 494 runnable cases.

The research use is the authors' work on membranes and electrodialysis:
besides the electrodialysis models above, Choupo solves the Donnan--steric
pore model of nanofiltration as the authors' program NanoFiltran does
(agreeing with it to 8 × 10^-7^ on 35 problems), fits it to measured
rejections with a held-out verdict
(`tutorials/steady/membranes/membrane24_fit_then_simulate`), and carries
the authors' multi-ionic polarisation model [@geraldes2007]. Other cases
are anchored to independent published results: the Williams--Otto reactor
[@williams1960], the IAPWS-IF97 verification tables [@wagner2000], the
Hamer--Wu activity coefficients [@hamer1972] and a measured calcite pH
[@plummer1982]. No classroom evaluation has been made and no pedagogical
effect is claimed; no external publication has yet used Choupo.
<!-- TODO (authors): name the research problem these cases now serve
(project, data set or manuscript in preparation). JOSS requires evidence
of research use, not a promise of it.  NanoFiltran: check_nanofiltran_
reference claim (7.9e-7 relative, 35 rows). -->

# AI usage disclosure

Generative AI was used in the software, its documentation and this paper.
The tool was Anthropic's Claude Code, an agentic coding assistant, running
models of the Claude Opus and Claude Fable families.
<!-- TODO (authors): JOSS asks for tool versions; add them at submission
(the repository's own rules keep exact model identifiers out of the tree). -->
Vítor Geraldes conceived and architected Choupo and directs its
development. Substantial parts of the implementation, documentation and
tutorial corpus were produced with Claude Code's assistance, and this paper
was drafted and revised with it from the project's runs and records.
Agents work under written briefs on separate branches; architecture,
pedagogical scope and a recorded list of reserved decisions belong to Vítor
Geraldes, and work is validated before integration by the checks described
above. The published project is human-curated, reviewed, corrected and
maintained by Vítor Geraldes and Pedro Mendes. The authors affirm that human
team members reviewed, modified and validated the AI-generated content and
made the primary architectural and design decisions.
<!-- TODO (authors): JOSS treats an inaccurate disclosure as an ethical
violation.  Confirm that this paragraph is accurate as written. -->

# Acknowledgements

Funding and institutional support: none to declare.
<!-- TODO (authors): confirm, or name any financial support.  At
submission, declare the parallel manuscript (Computers & Chemical
Engineering) as JOSS asks. -->
*Choupo* is a registered trade mark of TalentGround Lda.; the trade mark
is not licensed by the software licence. OPENFOAM® is a registered trade
mark of OpenCFD Limited, producer and distributor of the OpenFOAM software
via www.openfoam.com. This offering is not approved or endorsed by OpenCFD
Limited, producer and distributor of the OpenFOAM software via
www.openfoam.com, and owner of the OPENFOAM® and OpenCFD® trade marks.

# References
