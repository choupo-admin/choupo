/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  openMolecularToolsLesson -- "From molecules to properties: the open tools".

  The task it serves, in one sentence: a student who knows only process
  simulation leaves knowing which open program answers which question about a
  molecule or a mixture, how to run a first example in a browser without
  installing anything, and one thesis idea per tool.

  NOTHING HERE IS FROM MEMORY.  Every licence below was read from the
  project's own LICENSE file or its own site (the `how` of each row names
  which, and the page prints it), on 2026-11-22.  Every code block that says
  "ran" was executed that day in a scratch virtual environment (or a conda
  environment for the programs that PyPI does not carry), with the versions
  the row names.  A block that says "not run" was copied from the project's
  own README or manual and was not executed by the page's author: the page
  says so beside it.

  WHAT IS NOT HERE, AND WHY.  OpenSPGen (a sigma-profile generator built on
  an open quantum-chemistry program and RDKit) was seen only in a search
  result: its paper and repository could not be read on the day, so it has no
  card.  The licence of three programs' project SITES could not be read (the
  site answered with an error or named none); each such card says which
  document the licence was read from instead.

  THE CHOUPO SIDE IS CITED TO THE LINE.  CITATIONS lists every file:line the
  page names and a fragment that line must contain; the test reads each one
  back against the tree.
\*---------------------------------------------------------------------------*/

import type { LessonLimit, LessonStep } from "./lessonStep.js";

// ---- the questions ----------------------------------------------------------

export type OtGroup = "quantum" | "cosmo" | "group" | "simulation" | "cheminformatics" | "reference";

export interface OtGroupRow {
  id: OtGroup;
  question: string;
  answer: string;
}

/** The question a student asks, and the family of tools that answers it. */
export const OT_GROUPS: readonly OtGroupRow[] = [
  {
    id: "quantum",
    question: "What is the shape of this molecule, how does it vibrate, what is its energy, and from that its ideal-gas heat capacity and entropy?",
    answer: "Quantum chemistry, then statistical thermodynamics (rigid rotor, harmonic oscillator).",
  },
  {
    id: "cosmo",
    question: "Without any mixture data, how does this molecule behave in a liquid mixture?",
    answer: "COSMO-type models: a quantum calculation gives a charge surface, the model turns it into activity coefficients.",
  },
  {
    id: "group",
    question: "I have a structure and a mixture: what do group contribution and a molecular equation of state predict?",
    answer: "UNIFAC and PC-SAFT, and the open libraries that run them.",
  },
  {
    id: "simulation",
    question: "Which force-field simulation gives me a coexistence curve, a Henry constant or an adsorption isotherm?",
    answer: "Monte Carlo with a force field, in the Gibbs ensemble or the grand-canonical one.",
  },
  {
    id: "cheminformatics",
    question: "How do I get from a name or a SMILES string to a molecule object I can compute with?",
    answer: "A cheminformatics toolkit.",
  },
  {
    id: "reference",
    question: "What is the accepted value of a property of a well-studied fluid, or the answer of a reacting-flow model?",
    answer: "A reference-fluid library and a kinetics library, used as the other side of a comparison.",
  },
];

// ---- the cards --------------------------------------------------------------

export interface OtCode {
  /** What a student types first (a shell line), when there is one. */
  install: string;
  /** The program, line by line; empty when no pasteable example was verified. */
  lines: readonly string[];
  language: "python" | "shell" | "julia" | "none";
  /** "ran": executed 2026-11-22; "not run": copied from the project's docs. */
  status: "ran" | "not run";
  /** What the code printed, or the document it was copied from. */
  evidence: string;
}

export interface OtCard {
  id: string;
  group: OtGroup;
  name: string;
  computes: string;
  /** SPDX-style identifier as read, or "licence not verified". */
  licence: string;
  /** Which document the licence was read from. */
  licenceHow: string;
  url: string;
  noInstall: string;
  code: OtCode;
  meets: string;
  thesis: string;
}

export const OT_CARDS: readonly OtCard[] = [
  // -- quantum chemistry ------------------------------------------------------
  {
    id: "pyscf",
    group: "quantum",
    name: "PySCF",
    computes: "Hartree-Fock, density functional and post-HF energies, analytic gradients and Hessians, geometry optimisation (with geomeTRIC), implicit-solvent models including COSMO, and a thermochemistry module (harmonic analysis, S, H, G).",
    licence: "Apache-2.0",
    licenceHow: "the LICENSE file in the repository (Apache License 2.0) and the project site's statement 'Distributed on GitHub under the Apache-2.0 license'",
    url: "https://pyscf.org",
    noInstall: "Google Colab: one cell with `!pip install pyscf`.  Pure pip, no compiler.",
    code: {
      install: "pip install pyscf",
      language: "python",
      status: "ran",
      lines: [
        "from pyscf import gto, scf",
        "from pyscf.hessian import thermo",
        "from pyscf.data.nist import HARTREE2J, AVOGADRO",
        "mol = gto.M(atom='O 0 0 0.1173; H 0 0.7572 -0.4692; H 0 -0.7572 -0.4692', basis='def2-svp', verbose=0)",
        "mf = scf.RHF(mol).run()",
        "freq = thermo.harmonic_analysis(mol, mf.Hessian().kernel())",
        "res = thermo.thermo(mf, freq['freq_au'], 298.15, 101325)",
        "print(mf.e_tot, freq['freq_wavenumber'], res['S_tot'][0] * HARTREE2J * AVOGADRO)",
      ],
      evidence: "ran with pyscf 2.15.1: E = -75.96098 Eh, frequencies 1790, 3972 and 4062 cm-1, S = 188.54 J/(mol K) for water at 298.15 K and 101325 Pa (a small basis on a geometry that was not optimised: a first look, not a result to quote).",
    },
    meets: "A molecule's ideal-gas heat capacity and entropy are what a Choupo component record carries as polynomial coefficients and as the formation datum (data/standards/components/ethanol.dat, s_298).  Choupo's gas-species table is read from the NASA Glenn report, public domain (bin/curate/nasa_tp2002_to_choupo.py).  Solvation charges are the input of Choupo's COSMO-SAC (the next two cards).",
    thesis: "Open sigma-profiles end to end: run PySCF's COSMO model for the molecules of one chemical family, turn the surface charges into a 51-point profile on Choupo's grid, and refit the COSMO-SAC constants to that protocol the way Ferrarini et al. did for their GAMESS profiles (Choupo requires each variant's profile protocol word for word).  Test on activity coefficients at infinite dilution.",
  },
  {
    id: "psi4",
    group: "quantum",
    name: "Psi4",
    computes: "Hartree-Fock, DFT, MP2, coupled cluster and SAPT energies, geometry optimisation, harmonic frequencies and a thermochemistry table (zero-point, enthalpy, entropy, Gibbs energy) from a rigid-rotor harmonic-oscillator analysis.",
    licence: "LGPL-3.0",
    licenceHow: "COPYING.LESSER in the repository (GNU Lesser General Public License v3) and the project site's statement 'the truly open-source LGPL3 license'",
    url: "https://psicode.org",
    noInstall: "Google Colab through condacolab: `!pip install -q condacolab`, then `import condacolab; condacolab.install()` (the kernel restarts), then `!mamba install -q -y -c conda-forge psi4`.  Psi4 is distributed through conda, not PyPI.",
    code: {
      install: "conda install -c conda-forge psi4",
      language: "python",
      status: "ran",
      lines: [
        "import psi4",
        "psi4.set_memory('1 GB')",
        "mol = psi4.geometry('O\\nH 1 0.96\\nH 1 0.96 2 104.5')",
        "psi4.optimize('scf/cc-pvdz', molecule=mol)",
        "e, wfn = psi4.frequency('scf/cc-pvdz', molecule=mol, return_wfn=True)",
        "print(e, list(wfn.frequencies().to_array()), psi4.variable('GIBBS FREE ENERGY'))",
      ],
      evidence: "ran in a conda-forge environment: E = -76.02703 Eh, frequencies 1776, 4113 and 4212 cm-1, G = -76.02162 Eh; the thermochemistry table in output.dat lists S = 188.23 J/(mol K) at 298.15 K.  The geometry is the Z-matrix of Psi4's manual water example.",
    },
    meets: "Same bridge as PySCF: the ideal-gas S, H and Cp of a species come from the frequencies by statistical thermodynamics.  Choupo's chemical-kinetics side (CHEMKIN mechanisms) reads species thermodynamics as NASA polynomials, the form such a calculation is fitted to.",
    thesis: "Ideal-gas thermochemistry for species the NASA table leaves out: compute S and Cp(T) for ten of them with a stated method and basis, fit NASA-7 polynomials, and compare with measured Cp where it exists.  Choupo's first tool for this, bin/curate/rrho_thermo.py, does it for nine species of the Miller & Bowman mechanism (rigid rotor, harmonic oscillator, NASA-9 fit; records in data/standards/thermoTables/RRHO-computed/); extending it to other species, and comparing with measured Cp, is the thesis.",
  },
  {
    id: "xtb",
    group: "quantum",
    name: "xtb (GFN2-xTB)",
    computes: "Semi-empirical tight-binding energies and geometries (GFN2-xTB, GFN-FF), fast enough that the example below takes under a second, with a built-in frequency and thermochemistry analysis (`--ohess`) that uses a modified rigid-rotor harmonic-oscillator treatment of the low modes.",
    licence: "LGPL-3.0",
    licenceHow: "COPYING.LESSER in the repository (GNU Lesser General Public License v3); the PyPI package of its Python interface also declares LGPL-3.0-or-later",
    url: "https://xtb-docs.readthedocs.io",
    noInstall: "Google Colab through condacolab (as for Psi4), then `!mamba install -q -y -c conda-forge xtb`; the docs list conda and pre-compiled binaries.  A Python interface is on PyPI: `pip install xtb` (version 22.1 when read) and `pip install tblite`.",
    code: {
      install: "conda install -c conda-forge xtb",
      language: "shell",
      status: "ran",
      lines: [
        "xtb ethanol.xyz --ohess",
      ],
      evidence: "ran on an ethanol structure written by RDKit (see the RDKit card) in 0.4 s: total free energy -11.3416 Eh, and a thermochemistry table at 298.15 K giving S = 269.3 J/(mol K).  One conformer was used.",
    },
    meets: "The catalogue's third-law entropy of ethanol is 281.620 J/(mol K) (data/standards/components/ethanol.dat, `s_298`, a literature value awaiting its primary citation).  The two numbers differ by 12 J/(mol K).  That gap is the question of the thesis below.",
    thesis: "How good is a 0.4 s entropy?  For twenty catalogue molecules compare xtb's S and Cp at 298 K with the catalogue values, then separate the causes: one conformer against a Boltzmann mixture, hindered rotors against harmonic ones, and the method itself.  The answer tells a student when a fast estimate is enough to put in a record's `estimated` slot.",
  },
  // -- COSMO ------------------------------------------------------------------
  {
    id: "cosmosac-choupo",
    group: "cosmo",
    name: "COSMO-SAC in Choupo, and the NIST benchmark code",
    computes: "Activity coefficients of every component of a mixture from the sigma-profile, cavity area and cavity volume of each pure component alone: no binary parameter.  Choupo implements the 2002 equations of Lin and Sandler as the NIST benchmark code of Bell et al. does, plus a variant refitted to open sigma-profiles.",
    licence: "GPL-3.0-or-later (Choupo); MIT / public domain (the NIST code)",
    licenceHow: "Choupo's LICENSE; the NIST code's licence as stated in Choupo's own header of the model (src/thermo/activityCoefficient/CosmoSac.H).  The benchmark's bundled sigma-profile folder is under a narrower licence than its code: academic and non-commercial, by permission, from a profile set computed with a commercial quantum-chemistry program (Bell et al. 2020; the PMC copy of the paper)",
    url: "https://github.com/usnistgov/COSMOSAC",
    noInstall: "Choupo itself runs in the browser (the Explorer and the EduTools run its WASM build); the NIST code is C++ with Python wrappers per its paper.",
    code: {
      install: "runCase tutorials/props/molecular/cosmoSAC03_ethanol_water_predictive",
      language: "shell",
      status: "ran",
      lines: [
        "activityModel { model cosmoSAC; source <setName>; }",
      ],
      evidence: "the line is the model's own selector, quoted from src/thermo/activityCoefficient/CosmoSac.H; the case named in the install row predicts ethanol and water at 1 atm with no binary parameter beside a fitted NRTL pair and measured bubble temperatures.",
    },
    meets: "A sigma-profile is the whole input.  The public catalogue ships the sets of the VT-2005 database as external references only; a student installs a copy they are entitled to with bin/choupo-import-cosmo into the private data/local tier.  The model stops with a named error when a component's profile is not installed.  The shipped witness runs on synthetic teaching profiles, labelled as such, and a second variant runs on the open LVPP profiles (GAMESS, MIT licence).",
    thesis: "Make Choupo's COSMO-SAC open end to end for one family of molecules: the molecule from a SMILES string (RDKit), the surface from an open quantum program (PySCF, for instance), the profile written by bin/curate/lvpp_sigma_profile.py's averaging rule, and the activity coefficients checked against the shipped LVPP variant.  The licence work is half the thesis: say for each file who may redistribute it.",
  },
  {
    id: "opencosmo",
    group: "cosmo",
    name: "openCOSMO-RS",
    computes: "The COSMO-RS model in Python (a prototyping version) and in C++ with Python bindings; a conformer pipeline that turns SMILES strings into the quantum-chemical input; a COSMO-SAC-Phi variant.  Developed at the Institute of Thermal Separation Processes, TU Hamburg.",
    licence: "LGPL-3.0 (repositories); a sentence of the Python repository's README says GPL v2.0",
    licenceHow: "the LICENSE files of openCOSMO-RS_py and openCOSMO-RS_conformer_pipeline (GNU Lesser General Public License v3) and the organisation page's LGPL-3.0 label; the README of openCOSMO-RS_py states GPL v2.0 in one sentence, which disagrees with its own LICENSE file, so read the file and ask the authors before redistributing",
    url: "https://www.tuhh.de/v8/softwares/opencosmo-rs",
    noInstall: "The Python version installs with pip from its repository (see the code block); its examples folder has a Jupyter notebook, cosmors_calculation.ipynb, which a Colab session can open once the quantum-chemical files exist.  Making those files needs a quantum-chemistry program that is not open source (named below).",
    code: {
      install: "pip install git+https://github.com/TUHH-TVT/openCOSMO-RS_py",
      language: "shell",
      status: "not run",
      lines: [
        "python ConformerGenerator.py --structures_file file.inp --cpcm_radii cpcm_radii.inp --n_cores 2",
      ],
      evidence: "copied from the README of openCOSMO-RS_conformer_pipeline, not executed here: the pipeline needs a quantum-chemistry program that is not open source: ORCA 6.1 or newer, free for academic and personal use and under a commercial licence otherwise (the vendor's product page, read 2026-11-22).  The input file is tab-separated: name, SMILES, optional xyz file, charge, optional geometry-optimisation flag (an example row: ethanol, CCO, blank, 0).",
    },
    meets: "A second, independent open implementation to compare Choupo's COSMO-SAC against.  Choupo's model reads only profiles, so profiles produced by this pipeline's quantum step can be converted and read, provided the licence of the quantum program is respected.",
    thesis: "Compare Choupo's LVPP-variant COSMO-SAC and openCOSMO-RS on the activity coefficients at infinite dilution and on one ethanol-water curve, using one set of molecules and stating which differences come from the model (RS against SAC), from the quantum method and from the parameter fit.",
  },
  // -- group contribution and EoS ---------------------------------------------
  {
    id: "choupo-gc",
    group: "group",
    name: "UNIFAC and PC-SAFT in Choupo",
    computes: "Original UNIFAC and modified UNIFAC (Dortmund) activity coefficients from the group counts of each component; PC-SAFT, including association, as a phase-equilibrium model.",
    licence: "GPL-3.0-or-later",
    licenceHow: "the LICENSE file at the root of the Choupo repository (GNU General Public License v3 or later)",
    url: "https://choupo.org",
    noInstall: "Nothing to install: the Explorer and the EduTools run Choupo's WASM build in the browser.",
    code: {
      install: "runCase tutorials/steady/flash/flash20_ethanol_water_pcsaft",
      language: "shell",
      status: "ran",
      lines: [],
      evidence: "the case flashes ethanol and water with predictive PC-SAFT (association, kij = 0) beside a fitted NRTL pair; its sibling unifacDortmund02_butanol_water_gamma_infinity reproduces the 32 values printed in Table XI of Gmehling, Li and Schiller (1993).",
    },
    meets: "A component record carries its groups in the form the open tools below produce: ethanol has CH3, CH2 and OH for original UNIFAC and CH3, CH2 and OH_p for Dortmund (data/standards/components/ethanol.dat).  The Theory Guide sections are the sec:unifac, sec:unifac-dortmund and ch:pcsaft labels.",
    thesis: "Use the three libraries below as independent checks on Choupo: the same mixtures, the same temperatures, and a table of the three answers with the differences traced to parameters, group definitions or numerics.",
  },
  {
    id: "ugropy",
    group: "group",
    name: "ugropy",
    computes: "The UNIFAC (original and Dortmund) subgroups of a molecule from its SMILES string or its name, using RDKit.",
    licence: "MIT",
    licenceHow: "the licence field of the project's PyPI page (The MIT License) and the badge of its README",
    url: "https://pypi.org/project/ugropy/",
    noInstall: "Google Colab: `!pip install ugropy`; its README links a Colab notebook.",
    code: {
      install: "pip install ugropy",
      language: "python",
      status: "ran",
      lines: [
        "from ugropy import Groups",
        "ethanol = Groups('CCO', 'smiles')",
        "print(ethanol.unifac.subgroups)",
        "print(ethanol.dortmund.subgroups)",
      ],
      evidence: "ran with ugropy 3.2.6: {'CH3': 1, 'CH2': 1, 'OH': 1} for original UNIFAC and {'CH3': 1, 'CH2': 1, 'OH (P)': 1} for Dortmund, the same groups Choupo's ethanol record carries.",
    },
    meets: "The groups of ethanol in the catalogue (data/standards/components/ethanol.dat, the `unifac` and `unifacDortmund` lines) equal what ugropy returns for CCO.",
    thesis: "Audit the catalogue's group assignments: run ugropy over every component that carries a `unifac` block (from the SMILES of each), list the disagreements, and decide for each whether the record or the tool is right.  Then use the tool to add groups for components that carry none, flagged as estimated.",
  },
  {
    id: "thermo",
    group: "group",
    name: "thermo (Caleb Bell)",
    computes: "UNIFAC (original and Dortmund) and other activity-coefficient models, cubic equations of state and flash calculations, in Python.",
    licence: "MIT",
    licenceHow: "LICENSE.txt in the repository (MIT License) and the project's documentation page",
    url: "https://thermo.readthedocs.io",
    noInstall: "Google Colab: `!pip install thermo`.",
    code: {
      install: "pip install thermo",
      language: "python",
      status: "ran",
      lines: [
        "from thermo.unifac import UNIFAC, UFIP, UFSG",
        "GE = UNIFAC.from_subgroups(chemgroups=[{1:2, 2:4}, {1:1, 2:1, 18:1}], T=60+273.15,",
        "                           xs=[0.5, 0.5], version=0, interaction_data=UFIP, subgroups=UFSG)",
        "print(GE.gammas())",
      ],
      evidence: "ran with thermo 0.6.1; this is the example of the library's own UNIFAC documentation (n-hexane and 2-butanone, example P05.22a of Poling, Prausnitz and O'Connell), whose docstring gives [1.4276, 1.3647] and notes that the DDBST solution has [1.428, 1.365].",
    },
    meets: "The same model as Choupo's `model UNIFAC;`.  Measured by hand on 2026-11-22 in a scratch case (n-hexane and 2-butanone, 333.15 K, x = 0.5, the catalogue's nHexane and methylEthylKetone records): Choupo gives 1.427602584 and 1.364654501, thermo prints 1.427602584 and 1.364654501, the same to ten digits.  The scratch case stays local and no golden pins those numbers.",
    thesis: "Cross-code verification beyond one point: Choupo's UNIFAC and UNIFAC (Dortmund) against thermo on the 32 gamma-infinity values of Table XI and on a sweep of the catalogue's mixtures and temperatures, reporting the largest difference and its cause.  Agreement at one point proves little; the sweep is the thesis, and a disagreement goes to whichever project is wrong.",
  },
  {
    id: "clapeyron",
    group: "group",
    name: "Clapeyron.jl (and pyclapeyron)",
    computes: "Many equations of state in Julia: cubics, the SAFT family (PC-SAFT, SAFT-VR Mie and others), CPA, activity models including COSMO-SAC, empiric Helmholtz models, electrolytes; saturation, bubble and dew points and critical points (the calls of the example and of the README).",
    licence: "MIT",
    licenceHow: "LICENSE.md in the repository (MIT License, copyright Hon Wa Yew and Pierre Walker); pyclapeyron's wheel carries an MIT licence file too",
    url: "https://clapeyronthermo.github.io/Clapeyron.jl/stable/",
    noInstall: "In Colab, use the Python wrapper: `!pip install pyclapeyron`.  It starts a Julia process through juliacall and installs Clapeyron.jl on first use, which takes several minutes.  In Julia itself: `pkg> add Clapeyron`.",
    code: {
      install: "pip install pyclapeyron",
      language: "python",
      status: "ran",
      lines: [
        "import pyclapeyron as cl",
        "model = cl.PCSAFT('benzene')",
        "Tc, pc, vc = cl.crit_pure(model)",
        "ps, vl, vv = cl.saturation_pressure(model, 0.8 * Tc)",
        "print(Tc, pc, ps)",
      ],
      evidence: "from the first example of pyclapeyron's README, shortened; ran with pyclapeyron 0.1.1 (the first call installs Julia packages and takes minutes): Tc = 572.39 K and pc = 5.537 MPa for benzene, and a saturation pressure of 1.111 MPa at 0.8 Tc.",
    },
    meets: "Choupo's PC-SAFT (with association) and its cubic equations of state are the models to compare against; a SAFT-VR Mie or a CPA model is other models to set beside Choupo's PC-SAFT.",
    thesis: "A PC-SAFT cross-check and a parameter-estimation study: Choupo's PC-SAFT against Clapeyron's on the pure-component saturation lines and on ethanol-water (the flash20 case), then regress the pure-component parameters of one new substance on reference data (CoolProp) in both codes and compare the parameters and the predicted mixture.",
  },
  // -- molecular simulation ---------------------------------------------------
  {
    id: "cassandra",
    group: "simulation",
    name: "Cassandra",
    computes: "Monte Carlo of molecules made of rings, chains or both, with a force field: canonical, isobaric, grand-canonical and Gibbs-ensemble simulations, hence vapour-liquid coexistence (the ensembles are those the repository's README lists as features of version 1.2).",
    licence: "GPL-3.0",
    licenceHow: "the LICENSE file in the repository (GNU General Public License v3) and the GPL-3.0 label on its documentation page; the conda-forge package metadata also says GPL-3.0",
    url: "https://cassandra-mc.readthedocs.io/en/latest/",
    noInstall: "Cassandra is a compiled program: `conda create --name mc -c conda-forge cassandra` installs a binary named cassandra.exe (confirmed by installing it).  No browser-only route was verified; a Colab session with condacolab can run the conda line.",
    code: {
      install: "conda create --name mc -c conda-forge cassandra",
      language: "none",
      status: "not run",
      lines: [],
      evidence: "no pasteable input was verified: Cassandra's inputs are several files (a control file, molecule files, a force field), and the documentation's own 'Cassandra Basics' and workshop materials are the place to start.  The install line is from its documentation page and was executed.",
    },
    meets: "A coexistence curve from a force field is a number a Choupo vapour-pressure record can be compared with, and the density at coexistence is the liquid density a Choupo unit asks the property kernel for.",
    thesis: "Gibbs-ensemble vapour pressure and liquid density of a pure fluid (propane or ethanol) over a temperature range, compared with the catalogue's Antoine and density records and with PC-SAFT's saturation line: where does a force field beat a fitted correlation, and where is it only slower?",
  },
  {
    id: "gomc",
    group: "simulation",
    name: "GOMC",
    computes: "GPU-optimised Monte Carlo in the NVT, NPT, grand-canonical and Gibbs ensembles, for phase equilibria and physical properties of complex fluids, with a CPU and a GPU build.",
    licence: "MIT",
    licenceHow: "License.txt in the repository (permission notice of the MIT type, 'Copyright 2022 GOMC') and the repository page's MIT label",
    url: "https://gomc-wsu.org/",
    noInstall: "The project publishes a manual (https://gomc-wsu.org/Manual/) and an examples repository (GOMC_Examples).  No browser-only route was verified, and GOMC is not on conda-forge under that name (searched 2026-11-22).",
    code: {
      install: "see the manual's build instructions",
      language: "none",
      status: "not run",
      lines: [],
      evidence: "no example was run: the program is built from source or from a release binary, and its inputs are configuration files documented in the manual.",
    },
    meets: "Same meeting point as Cassandra: a coexistence curve to set beside a Choupo record.  Running both programs on the same fluid and force field is a check on the programs, not only on the fluid.",
    thesis: "A Gibbs-ensemble study of a binary (methane and ethane or ethanol and water) in GOMC or Cassandra, compared with Choupo's predictive models at the same temperature (PC-SAFT, UNIFAC, COSMO-SAC) and with measured data where the catalogue has them.",
  },
  {
    id: "raspa",
    group: "simulation",
    name: "RASPA",
    computes: "Molecular simulation of gases, fluids, zeolites, metal-organic frameworks and other nanoporous materials: adsorption isotherms, self- and collective diffusivities, and coexistence properties, by Monte Carlo and molecular dynamics in several ensembles.",
    licence: "MIT",
    licenceHow: "COPYING in the RASPA2 repository (The MIT License); the conda-forge metadata of raspa2 and raspa3 also says MIT",
    url: "https://iraspa.org/raspa/",
    noInstall: "A conda-forge package exists for both RASPA2 and RASPA3 (found by search 2026-11-22; installing and running them was not done).  The site points to the source on GitHub and to a PDF manual.",
    code: {
      install: "conda install -c conda-forge raspa2",
      language: "none",
      status: "not run",
      lines: [],
      evidence: "no pasteable example was verified; the manual and the examples shipped with the source are the starting point.",
    },
    meets: "Choupo's pressure-swing adsorption reads one `adsorptionIsotherm` record per adsorbent and adsorbate pair: a Henry or Langmuir model with q_max, b at 298 K and a heat of adsorption (data/standards/parameters/adsorption/README.md).  Those parameters are what a grand-canonical simulation produces.",
    thesis: "Isotherm records from simulation: CO2 and N2 in zeolite 5A or 13X at three temperatures by grand-canonical Monte Carlo, fitted to the Langmuir record format, compared with the catalogue's records and run through a Choupo PSA case to see how a change in q_max moves the product purity.",
  },
  // -- cheminformatics --------------------------------------------------------
  {
    id: "rdkit",
    group: "cheminformatics",
    name: "RDKit",
    computes: "Molecules from SMILES, formulas and masses, substructure search, and 3D conformers (an embedding followed by a force-field optimisation, as in the example); the glue between a name and every quantum or group-contribution program above.",
    licence: "BSD-3-Clause",
    licenceHow: "license.txt in the repository (BSD 3-Clause License) and the licence field of the PyPI page",
    url: "https://www.rdkit.org/",
    noInstall: "Google Colab: `!pip install rdkit`.",
    code: {
      install: "pip install rdkit",
      language: "python",
      status: "ran",
      lines: [
        "from rdkit import Chem",
        "from rdkit.Chem import AllChem, Descriptors, rdMolDescriptors",
        "m = Chem.AddHs(Chem.MolFromSmiles('CCO'))",
        "print(rdMolDescriptors.CalcMolFormula(m), Descriptors.MolWt(m))",
        "AllChem.EmbedMolecule(m, randomSeed=42); AllChem.MMFFOptimizeMolecule(m)",
        "open('ethanol.xyz', 'w').write(Chem.MolToXYZBlock(m))",
      ],
      evidence: "ran with rdkit 2026.9.2: C2H6O and a molar mass of 46.069 g/mol, the formula and MW of Choupo's ethanol record; the file ethanol.xyz is the input of the xtb and PySCF cards.",
    },
    meets: "Every catalogue record names a formula and a molar mass (data/standards/components/ethanol.dat); RDKit recomputes both from a structure, which is the cheapest identity check for a record.",
    thesis: "A structure-identity audit of the catalogue: assign a SMILES to each component (by hand for the first fifty, by name resolution after), recompute formula and MW, and list every record that disagrees.  The same SMILES then feed ugropy and the quantum programs, so one audit opens three further studies.",
  },
  // -- reference --------------------------------------------------------------
  {
    id: "coolprop",
    group: "reference",
    name: "CoolProp",
    computes: "Thermophysical properties of 136 pure and pseudo-pure fluids by reference equations of state, plus mixtures, incompressibles and psychrometrics; wrappers for several languages (the example uses Python).",
    licence: "MIT",
    licenceHow: "the LICENSE file in the repository (MIT License) and the site's statement that it is free for commercial and academic use",
    url: "http://www.coolprop.org/",
    noInstall: "Google Colab: `!pip install CoolProp`.",
    code: {
      install: "pip install CoolProp",
      language: "python",
      status: "ran",
      lines: [
        "from CoolProp.CoolProp import PropsSI",
        "print(PropsSI('D', 'T', 298.15, 'P', 101325, 'Water'))",
        "print(PropsSI('T', 'P', 101325, 'Q', 0, 'Water'))",
      ],
      evidence: "ran with CoolProp 8.0.0: 997.05 kg/m3 for liquid water at 298.15 K and 1 atm, and a normal boiling point of 373.124 K; the first line is the form of the example on the project's home page.",
    },
    meets: "Choupo already uses it as the other side of a comparison: the hydrogen enthalpy table of the case standardState01_hydrogen_enthalpy_TP is re-computed from CoolProp 8.0.0 and held to the engine.  Choupo's own reference equations of state (water IAPWS-95, CO2, N2, CH4) are the natural first targets.",
    thesis: "A reference audit across the fluids both programs cover: density, enthalpy and saturation pressure over a (T, p) grid against Choupo's Helmholtz equations and against its cubic and PC-SAFT predictions, ranked by deviation, so a student sees which model is trustworthy where.",
  },
  {
    id: "cantera",
    group: "reference",
    name: "Cantera",
    computes: "Thermodynamics, transport, homogeneous kinetics, zero-dimensional reactors (constant volume, constant pressure) and one-dimensional flames, from CHEMKIN-type mechanisms converted to its YAML format (ck2yaml).",
    licence: "BSD-3-Clause",
    licenceHow: "License.txt in the repository (three-clause BSD, copyright Caltech, Sandia and the Cantera Developers); the project's site could not be read for a licence statement on the day",
    url: "https://cantera.org/",
    noInstall: "Google Colab: `!pip install cantera`.",
    code: {
      install: "pip install cantera",
      language: "python",
      status: "ran",
      lines: [
        "import cantera as ct",
        "gas = ct.Solution('h2o2.yaml')",
        "gas.TPX = 1200.0, ct.one_atm, {'H2': 2, 'O2': 1, 'AR': 4}",
        "r = ct.IdealGasConstPressureReactor(gas, clone=False); net = ct.ReactorNet([r]); T0 = r.T; t = 0.0",
        "while r.T < T0 + 400 and t < 1.0: t = net.step()",
        "print('time to T0 + 400 K [s]:', t)",
      ],
      evidence: "ran with cantera 3.2.0: 4.67e-05 s for this hydrogen-oxygen-argon mixture with the h2o2.yaml mechanism shipped with Cantera.  The ignition criterion, a rise of 400 K, is the one Choupo's ignition-delay sensitivity uses.",
    },
    meets: "Choupo's CHEMKIN-line reactors were measured against Cantera 3.2.0: the same mechanism files, constant-volume and constant-pressure, at 1, 10 and 114 atm (docs/reviews/2026-11-21-aramcomech-validation/REPORT.md).  The importer also runs on mechanisms converted by ck2yaml.",
    thesis: "Extend that comparison to a quantity it did not cover: laminar flame speed or a thermal-explosion limit, or the effect of replacing a species' NASA polynomial with one from a statistical-thermodynamics calculation (the Psi4 and PySCF cards) on the ignition delay in both programs.",
  },
];

// ---- the steps --------------------------------------------------------------

export const OT_STEPS: readonly LessonStep[] = [
  {
    n: 1,
    title: "Start from the question, not the program",
    body: "Process simulators start from a component record: critical constants, a vapour-pressure law, parameters.  The programs on this page start one level lower, from the molecule, and produce the numbers a record holds.  Pick the group below that matches what you want to know, then the card.",
  },
  {
    n: 2,
    title: "One chain from a SMILES string to a record",
    body: "A SMILES string becomes a structure (RDKit).  A quantum program turns the structure into energies, frequencies and a charge surface.  Statistical thermodynamics turns frequencies into ideal-gas Cp, S and H; a COSMO-type model turns the charge surface into activity coefficients.  Choupo reads the results as a record.",
    formula: String.raw`S = R\left[\ln\frac{q}{N_{\mathrm{A}}} + 1 + T\left(\frac{\partial \ln q}{\partial T}\right)_{V}\right]`,
    where: [
      { sym: "S", means: "molar entropy of the ideal gas", unit: "J/(mol K)" },
      { sym: "R", means: "gas constant", unit: "J/(mol K)" },
      { sym: "q", means: "molecular partition function in the volume V: the product of the translational, rotational, vibrational and electronic factors the quantum programs evaluate from the structure and the frequencies" },
      { sym: "N_{\mathrm{A}}", means: "Avogadro constant", unit: "1/mol" },
      { sym: "T", means: "temperature", unit: "K" },
      { sym: "V", means: "volume of the gas, held fixed in the derivative" },
    ],
    note: "Heat capacity and enthalpy follow from the same q by differentiating in T.  The programs apply this with a rigid rotor and harmonic oscillators, which is why low-frequency torsions need care.",
  },
  {
    n: 3,
    title: "How to read a card",
    body: "Each card says what the program computes, its licence and how the licence was read, how to try it with no installation, a short example (marked ran or not run), where it meets Choupo, and one thesis idea.  Licences are for you to confirm again before you redistribute anything.",
    note: "A licence line is a fact about a project on the day it was read, not legal advice.",
  },
  {
    n: 4,
    title: "Open does not mean every step is open",
    body: "A program can be open source and need a closed or restricted one beside it: the COSMO-RS pipeline asks for a quantum program that is free only for academic use, and a sigma-profile set can sit under a narrower licence than the code that reads it.  Check each file in the chain, not the headline.",
  },
  {
    n: 5,
    title: "Choosing a thesis",
    body: "The ideas on the cards share a shape: take a number Choupo already holds or a model it already runs, reproduce it with an open tool, and say where the two disagree and why.  A good topic ends in a finding that corrects one program, or a record Choupo can carry.",
  },
];

/** The chain of step 2, as boxes the page draws: tool class and what it hands on. */
export const OT_CHAIN: readonly { id: string; tool: string; hands: string }[] = [
  { id: "smiles", tool: "RDKit", hands: "a structure from a SMILES string" },
  { id: "qm", tool: "xtb, PySCF, Psi4", hands: "geometry, frequencies, a charge surface" },
  { id: "stat", tool: "statistical thermodynamics", hands: "ideal-gas Cp, S, H" },
  { id: "cosmo", tool: "COSMO-SAC, openCOSMO-RS", hands: "activity coefficients" },
  { id: "record", tool: "a Choupo record", hands: "a component or parameter record a flowsheet reads" },
];

export const OT_LIMITS: readonly LessonLimit[] = [
  {
    id: "licences-read-once",
    title: "Licences were read on one day",
    body: "Each licence was read on 2026-11-22 from the project's own file or site, as the card says.  Projects relicense; read the file again before you rely on it.  This is not legal advice.",
  },
  {
    id: "examples-small",
    title: "The examples are first looks",
    body: "They run in seconds on a small molecule and a small basis.  They show that the API is as written, not that the numbers are good enough to quote.  Cards that say not run were copied from the project's documentation and were not executed by the page's author.",
  },
  {
    id: "colab-not-tried",
    title: "The Colab lines were run in a plain environment",
    body: "Every install line was executed in a fresh Python 3.11 virtual environment or a conda-forge environment on 2026-11-22, not inside Google Colab itself.  Colab's Python version and preinstalled packages change, so a pip line that worked here can still need a pin there.",
  },
  {
    id: "no-ranking",
    title: "Not a ranking of programs",
    body: "The page lists programs a student can reach and connect to Choupo.  It does not say which is more accurate for a given molecule, and it leaves out many good programs.",
  },
  {
    id: "thesis-not-vetted",
    title: "Thesis ideas are starting points",
    body: "Each idea names a Choupo capability it connects to and has not been scoped by a supervisor.  Check the size of the work, the data you need and the licences before you commit.",
  },
];

// ---- the claims about Choupo, read back by the test -------------------------

/** Every file:line the page names, with a fragment that line must contain. */
export const CITATIONS: readonly { file: string; line: number; contains: string }[] = [
  { file: "src/thermo/activityCoefficient/CosmoSac.H", line: 18, contains: "implemented in the NIST" },
  { file: "src/thermo/activityCoefficient/CosmoSac.H", line: 19, contains: "usnistgov/COSMOSAC" },
  { file: "src/thermo/activityCoefficient/CosmoSac.H", line: 31, contains: "VT-2005" },
  { file: "src/thermo/activityCoefficient/CosmoSac.H", line: 40, contains: "SYNTHETIC" },
  { file: "src/thermo/activityCoefficient/CosmoSac.H", line: 56, contains: "TWO variants" },
  { file: "bin/curate/lvpp_sigma_profile.py", line: 23, contains: "Licence: MIT" },
  { file: "bin/curate/nasa_tp2002_to_choupo.py", line: 23, contains: "in the public" },
  { file: "bin/choupo-import-cosmo", line: 15, contains: "EXTERNAL REFERENCES" },
  { file: "data/standards/components/ethanol.dat", line: 35, contains: "281.620" },
  { file: "data/standards/components/ethanol.dat", line: 103, contains: "unifac (" },
  { file: "data/standards/components/ethanol.dat", line: 104, contains: "OH_p" },
  { file: "data/standards/parameters/adsorption/README.md", line: 11, contains: "adsorptionIsotherm" },
  { file: "tutorials/props/thermo/standardState01_hydrogen_enthalpy_TP/README.md", line: 42, contains: "CoolProp 8.0.0" },
  { file: "docs/reviews/2026-11-21-aramcomech-validation/REPORT.md", line: 19, contains: "Cantera 3.2.0" },
];

/** Case directories the page names; each must exist and carry a controlDict. */
export const OT_CASES: readonly string[] = [
  "tutorials/props/molecular/cosmoSAC03_ethanol_water_predictive",
  "tutorials/steady/flash/flash20_ethanol_water_pcsaft",
  "tutorials/props/compare/unifacDortmund02_butanol_water_gamma_infinity",
  "tutorials/props/thermo/standardState01_hydrogen_enthalpy_TP",
];

/** Theory Guide labels the page names; each must exist in docs/theoryGuide.tex. */
export const OT_LABELS: readonly string[] = [
  "ch:cosmosac", "sec:unifac", "sec:unifac-dortmund", "ch:pcsaft",
];
