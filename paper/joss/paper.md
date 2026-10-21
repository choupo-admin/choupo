---
title: 'Choupo: an open-source chemical process simulator for education and research'
tags:
  - chemical engineering
  - process simulation
  - thermodynamics
  - engineering education
  - membranes
  - C++
  - WebAssembly
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
date: 21 October 2026
bibliography: paper.bib
---

<!--
paper/joss/paper.md -- the Journal of Open Source Software submission for
Choupo (DEV.md 4c C126), adapted from the white paper
paper/whitepaper/whitepaper.tex.  Prose: CC BY-SA 4.0.

EVIDENCE.  Counts are read from generated files, never typed from memory:
generated/releaseInventory.json and generated/gateManifest.json at commit
aaccb336b (2026-10-21); generated/methodTools.json at ae796ee20.  Engine
claims follow the white paper, whose source carries a file:line, gate or
commit for each.  Re-read every number against the release this paper cites
before submission.

NAMING.  check_doctrine bans the names of other process simulators outside
its exempt trees; paper/whitepaper/ and paper/joss/ may name the one open
reference simulator (DWSIM), every closed one stays banned.

Build:  pandoc paper.md --citeproc --pdf-engine=pdflatex -o paper.pdf
(or the JOSS preview, the openjournals/inara image).
-->

# Summary

Choupo is an open-source chemical process simulator for teaching and for
research. It computes mass and energy balances, phase and chemical
equilibria, and the behaviour of unit operations -- flashes, reactors,
distillation columns, heat exchangers, crystallisers, dryers, membranes,
electrodialysis stacks -- alone or connected into plants with recycles. It
is written in C++17 with no external library and runs both natively and,
compiled to WebAssembly from the same source, in a web browser.

Choupo is a *glass-box* simulator in a sense a user can check. The data a
calculation used and where each value came from, the parameters and
whether they lie inside their evidence, and the results with their
conservation balances are written in plain-text files. The equations are
in readable source and in a theory guide; the numerical work -- each unit
as it is solved, its $K$-values, every Newton iteration and residual -- is
printed in the run log at the default verbosity, and every extrapolation,
estimate and default the run used is repeated at its end. A case is a
directory of text dictionaries in which every dimensional value carries
its unit; a word the engine does not know, or an input that over-specifies
a problem, is refused by name with the remedy rather than replaced by a
default.

# Statement of need

A student of process simulation usually meets converged numbers first.
Whether a missing interaction parameter was taken as zero, whether a
vapour pressure was evaluated outside its fitted range, whether a recycle
converged or merely stopped, is information most tools hold but rarely
put in front of the student. Choupo was written for the reader who must
see these things, because seeing them is the course.

The same transparency serves research where general-purpose simulators
offer few models: nanofiltration and reverse osmosis, electrodialysis,
aqueous electrolyte chemistry, and detailed solids operations. A
researcher adds a transport law or a unit operation by writing one class
and one registration line, and the balances, reports and browser
front-end apply to it unchanged.

AI agents now prepare and run simulations from a sentence. Choupo keeps
that work open to inspection: an agent's case files are text a student
reads, the data it found carry source and licence, a fit declares its
acceptance band before it runs, and the log shows what was computed and
what was assumed. The repository ships a short reference for agents
(`AGENTS.md`, `docs/ai/`). The audience is undergraduate and graduate
chemical engineering, and researchers who need a calculation they can
inspect.

# State of the field

Open-source tools cover much of this space, and do some of it far better
than Choupo. IDAES [@lee2021] builds equation-oriented process models for
optimisation on an algebraic modelling layer; CoolProp [@bell2014] and
Cantera [@cantera] are accurate property and kinetics libraries used inside
other programs; DWSIM [@dwsim] is a mature flowsheet simulator with a broad
unit-operation and property catalogue and a graphical editor in which the
case is built. A companion white paper [@choupo_whitepaper] compares Choupo
with DWSIM on five of its distributed sample cases.

Choupo is a separate program rather than an extension of one of these
because three of its requirements constrain the whole code base rather
than one module. (i) The text dictionaries are the complete
representation of a problem: the browser front-end runs the engine and
draws what it published, on the OpenFOAM [@weller1998] / ParaView
[@ahrens2005] pattern, and never edits or completes a case; a tool whose
case lives in a graphical document or a scripting session cannot make
that guarantee. (ii) One dependency-free C++ core must run both on a
student's machine and, unchanged, in a browser through WebAssembly.
(iii) Refusal by name, mandatory units and per-value provenance are
enforced where every dictionary and data record is read, so that no model
can silently default; this has to hold in the parser and the loaders, not
in a plug-in. Choupo is an independent project, not affiliated with,
endorsed by or sponsored by OpenCFD Ltd or the OpenFOAM Foundation, and no
OpenFOAM source code was adapted or reused in it.

# Software design

A case is a directory: `system/` says how (control, flowsheet topology,
solver options, an optional outer driver and post-processing),
`constant/` says with what (the thermophysical system, reactions, local
data), and `0/` holds the complete initial state, one file per stream.
`P 1 bar;` and `F 100 kmol/h;` are converted to SI on reading, and a value
with the wrong dimensions is refused with both dimension sets printed. The
steady solution is written to `converged/` in the layout of `0/`, only
when the run converged, so a converged directory renamed `0/` restarts
the case.

The engine has three layers (\autoref{fig:architecture}): a simulator core
that maps one flowsheet to one solution as a pure function; an optional
outer driver (sweeps, design specifications, optimisation, parameter
estimation) that calls it repeatedly; and an optional post-processor chain
(sizing, costing, plant layout, reports). Five binaries partition the
problem classes -- steady state, batch campaigns, time-integrated plants,
the same with control loops, and a property bench -- while numerical
strategies (Newton and Wegstein [@wegstein1958] on declared recycle tears,
Nelder--Mead [@nelder1965], Levenberg--Marquardt [@marquardt1963],
Michelsen's stability test [@michelsen1982], explicit and Rosenbrock
integrators) coexist inside each and are chosen in the case. The
thermodynamics include activity models [@renon1968; @fredenslund1975;
@lin2002], cubic and PC-SAFT equations of state [@peng1976; @gross2001],
aqueous electrolytes [@pitzer1973] and IAPWS-IF97 steam [@wagner2000].

![The three layers of the engine between the case dictionaries and the results; dashed layers are optional.\label{fig:architecture}](architecture.png){ width=100% }

The choices have costs. Every model type is registered by one explicit
line in a `registerBuiltins()` function, with no self-registration macro:
the origin of every model is one readable function, but adding a model
means recompiling. The browser front-end only displays, so the case must
be prepared in a text editor or by an agent, not on a canvas. The shared
core removes a second implementation for the browser, but a user's own C++
unit operation or rate law can be compiled only on a local installation;
in the browser a rate law can still be written as a formula in the case.

Correctness is checked rather than assumed. The test suite runs every
tutorial case with a guard against NaN and infinity, and compares the 465
that carry a recorded reference answer with it; a pass means "has not
moved", not "is right", so a reference is re-recorded only after the moved
values are listed with their reasons for human review. Every steady run
writes three balances by default -- total mass, atoms per element and
energy at the plant boundary -- and automated checks read them on every
steady case; plants known not to close are listed by name with their
measured residual, and the check fails if such a residual grows or
shrinks without the list being updated. A defect that escaped becomes a
new check, which is confirmed to fail when the defect is reintroduced; it
protects the conditions it exercises, not the whole class of error. A
named subset of cases is anchored to independent published results.
\autoref{fig:gui} shows the browser front-end on a sectored plant.

![The browser front-end on `tutorials/plant/greenAmmonia03_basicDesign`, run in the page by the WebAssembly build. Streams are coloured by temperature; slashed wires are the recycle tears.\label{fig:gui}](gui_flowsheet.png){ width=100% }

# Research impact statement

Choupo is public under GPL-3.0-or-later at
<https://github.com/choupo-admin/choupo>, with the browser application at
<https://www.choupo.org>. The latest release is `Choupo-2608`; the counts
below are from the development line at the submission commit.
<!-- TODO (authors): cite the release the paper is submitted with and
regenerate the counts from generated/releaseInventory.json at that tag. -->
It offers 52 unit-operation models, a curated catalogue of 604 components
and 276 mixture-parameter records, and 482 runnable tutorial cases.

The research use is the authors' work on membranes and electrodialysis.
Choupo carries the authors' own published models as unit operations: the
multi-ionic concentration-polarisation model of @geraldes2007, reproduced
against that paper's Table 1
(`tutorials/props/membrane/polarisation01_geraldes_afonso_table1`), and
the limiting current of an electrodialysis stack predicted from the ion
diffusivities of @geraldes2010, within +1 to +12 % of its Table 4
(`tutorials/steady/electrodialysis/ed04_limiting_current_multiionic`),
which in a batch run shows the limiting current falling as the diluate
depletes (`tutorials/batch/electrodialysis/edbatch01_constant_current`).
A solution-diffusion-electromigration law for nanofiltration is held to
the calculated lines of @fdl2021 in the trace limit those lines assume
(`tutorials/steady/membranes/membrane12_sdem_nf270_nacl_traces`); this is
verification against another calculation, not validation against the
measured points. Each case runs with one command and ships its reference
answer.
<!-- TODO (authors): name the research problem these cases now serve
(project, data set or manuscript in preparation). JOSS requires evidence
of research use, not a promise of it. -->

Other cases are anchored to independent published results: the
Williams--Otto reactor [@williams1960], the IAPWS-IF97 verification
tables [@wagner2000], the Hamer--Wu activity coefficients [@hamer1972], a
measured calcite pH [@plummer1982] and the Cavett recycle train
[@cavett1963]. The five comparison cases with DWSIM are in
`benchmarks/dwsim/`, each with its inputs, commands and a README stating
the findings on both sides. No classroom evaluation has been made and no
pedagogical effect is claimed; no external publication has yet used
Choupo.

# AI usage disclosure

Generative AI was used in the software, its documentation and this paper.
The tool was Anthropic's Claude Code, an agentic coding assistant, running
models of the Claude Opus and Claude Fable families.
<!-- TODO (authors): JOSS asks for tool versions; add them at submission
(the repository's own rules keep exact model identifiers out of the tree). -->
Vítor Geraldes conceived and architected Choupo and directs its
development. Substantial parts of the implementation, documentation and
tutorial corpus were produced with Claude Code's assistance -- code
generation and refactoring, test scaffolding, documentation and tutorial
drafting -- and this paper was drafted with it. Agents work under written
briefs on separate branches; architecture, pedagogical scope and a
recorded list of reserved decisions belong to Vítor Geraldes, and routine
technical steps inside an agreed scope are delegated and validated before
integration by the checks described above. The published project is
human-curated, reviewed, corrected and maintained by Vítor Geraldes and
Pedro Mendes. The authors affirm that human team members reviewed,
modified and validated the AI-generated content and made the primary
architectural and design decisions.
<!-- TODO (authors): JOSS requires that humans "thoroughly reviewed,
modified, and validated ALL AI-generated content", and treats an
inaccurate disclosure as an ethical violation.  Confirm that this
sentence is accurate as written, or amend it to what is true, before
submission. -->

# Acknowledgements

Funding and institutional support: none to declare.
<!-- TODO (authors): confirm, or name any financial support.  At
submission, declare the parallel manuscript (Computers & Chemical
Engineering) as JOSS asks. -->
*Choupo* is a registered trade mark of TalentGround Lda.; the trade mark
is not licensed by the software licence. The documentation is licensed
under CC BY-SA 4.0. OPENFOAM® is a registered trade mark of OpenCFD
Limited, producer and distributor of the OpenFOAM software via
www.openfoam.com. This offering is not approved or endorsed by OpenCFD
Limited, producer and distributor of the OpenFOAM software via
www.openfoam.com, and owner of the OPENFOAM® and OpenCFD® trade marks.

# References
