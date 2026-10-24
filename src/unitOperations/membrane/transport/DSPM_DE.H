/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Class
    Choupo::membrane::DSPM_DE

Description
    The charge-aware Donnan-Steric-Pore Model with Dielectric Exclusion
    (DSPM-DE) for nanofiltration -- a sibling of SolutionDiffusion in the
    membrane::TransportModel factory, selected with `transport DSPM-DE;`.

    PRIMARY references (cited per relation in the .cpp):
      * Bowen, Mohammad & Hilal, "Characterisation of nanofiltration
        membranes for predictive purposes -- use of salt, uncharged solutes
        and atomic force microscopy", J. Membr. Sci. 126 (1997) 91-105.
        (the steric / Donnan extended Nernst-Planck pore model -- DSPM).
      * Bowen & Welfoot, "Modelling the performance of membrane
        nanofiltration -- critical assessment and model development",
        Chem. Eng. Sci. 57 (2002) 1121-1137.  (adds DIELECTRIC EXCLUSION
        -- the Born partition term and the pore-dielectric eps_p -- giving
        DSPM-DE).
      * Deen, "Hindered transport of large molecules in liquid-filled
        pores", AIChE J. 33 (1987) 1409-1425.  (the hydrodynamic hindrance
        factors K_d (diffusive) and K_c (convective) from lambda = r_i/r_p).
      * Dechadilok & Deen, "Hindrance factors for diffusion and convection
        in pores", Ind. Eng. Chem. Res. 45 (2006) 6953-6959.  (the
        cross-section-averaged fits this law evaluates: K_d = H/Phi, K_c).

    THE MODEL, per ion i across the pore axial coordinate x in [0, dx]:

      extended Nernst-Planck flux (constant along x at steady state):
        j_i = -K_d,i D_i dc_i/dx
              - (z_i c_i D_i K_d,i F / RT) dpsi/dx
              + K_c,i c_i J_v                                       (1)

      interfacial PARTITION at each face (feed|pore and pore|permeate),
      the three exclusion mechanisms multiplied (Bowen-Welfoot Eq. 7):
        c_pore,i / (gamma_i c_bulk,i)
            = Phi_S,i * exp(-z_i F dpsi_Donnan / RT) * exp(-dW_i / kT)  (2)
        Phi_S,i = (1 - lambda_i)^2                       (steric)
        Born:  dW_i = (z_i^2 e^2 / 8 pi eps0 r_i)(1/eps_p - 1/eps_b)    (3)
      an ion with lambda_i >= 1 is EXCLUDED (Phi_S = 0): no pore unknown,
      permeate 0; it stays in the film, where it counts in the wall's
      electroneutrality and osmotic pressure (pore::PoreWall::excluded,
      DEV.md 4c C145 -- carried in the pore at the partition 1e-15 the
      Newton could not step), announced once per unit

      pore ELECTRONEUTRALITY, at every point of the pore:
        sum_i z_i c_pore,i + X_d = 0                                (4)

      ZERO NET CURRENT through the pore:
        sum_i z_i j_i = 0                                           (5)

    THE PORE IS SOLVED -- and the header says what is solved.  This header
    used to list (4) and (5) as "the physics solved" while the code solved
    neither along the pore (corrected 2026-10-22, DEV.md 4c C138).

      `poreSolver` absent, or `transportParameters { poreSolver { method
      finiteDifference; nodes <n>; } }`: (1)-(5) SOLVED, all at once -- the
      ENP discretised on n nodes across the pore (the default node count
      stated and announced when undeclared; the grid below), (4) at
      every node, (5), the partitions (2)-(3) at both faces, and -- since
      C142 (2026-10-24) -- the wall and the water flux in the SAME Newton:
      one Newton per station on the declared block-tridiagonal structure
      with an ANALYTIC Jacobian (PoreNernstPlanck.H, the one home of the
      pore solve; the partition coefficients stay computed HERE).
      NanoFiltran (Geraldes & Alves, J. Membr. Sci. 321 (2008) 172-182) is
      the reference it is compared with
      (tutorials/props/membrane/nanofiltran01_dspmde_reference).  Started
      from the previous station's answer; at the first station from a
      local-Donnan profile, and by continuation in J_v from the exact
      no-flux state when the Newton cannot reach the answer from there
      (counted and announced).

      `method closedForm;` is RETIRED (2026-10-24, DEV.md 4c C142) and
        refuses by name.  It was the default until C141 and did not solve
        the pore: the pore electroneutral at the feed face only, the
        permeate electroneutral, each ion carried across ALONE by
            c_perm,i / c_in,i = K_c / (K_c + (1 - K_c e^{-Pe}) R)
        -- not the solution of (1) even in its own limit with no potential
        (a point solute in an uncharged pore is rejected up to 50 % where
        (1) rejects nothing), and, with the corrected K_d (C141), tending to
        K_c > 1 at low Peclet number: a permeate richer than the pore
        inlet, -121.5 % rejection on membrane11's Born-off NaCl, a bulk
        exhausted until membrane20's solute balance refused.

      The feed-face activity (by default Davies, frozen per station, at the
      BULK ionic strength), the permeate taken ideal, the van't Hoff osmotic
      difference over the ions and the closure J_w = A_w (dP - dpi) of the
      water flux are the station's equations; the wall closure is the
      declared choice below.

    DECLARED CHOICES (C138 slice 2, 2026-10-22; the hindrance corrected by
    C141, 2026-10-24) -- each with a stated default, the first word listed.
    They exist so that the model of NanoFiltran (Geraldes & Alves 2008) can
    be EXPRESSED here and compared code to code
    (tutorials/props/membrane/nanofiltran01_reference); each is announced
    once per run.

      hindrance DechadilokDeen2006;
        the one pair (the default, announced as such when undeclared):
          K_d = H/Phi for lambda <= 0.95 and 0.984 ((1 - lambda)/lambda)^(5/2)
          above, K_c = (1 + 3.867 l - 1.907 l^2 - 0.834 l^3)/(1 + 1.867 l
          - 0.741 l^2) -- the cross-section-averaged pair NanoFiltran uses.
          H is the Dechadilok-Deen polynomial 1 + 9/8 l ln l - 1.56034 l
          + ..., the PRODUCT Phi K_d (the quantity their polynomial fits,
          continuous with their lambda > 0.95 form only once divided by
          Phi).
        legacy: REFUSED by name since 2026-10-24 (DEV.md 4c C141).  It took
          H itself as K_d (with the Bowen-Welfoot centreline K_c), and with
          the partition Phi already carried in (2) that counted the steric
          partition TWICE in diffusion: K_d too small by (1 - lambda)^2.
          It was the default until that day, so every DSPM-DE result
          recorded before it carries the defect.
      activity wallDavies | ideal | bulkOverPoreDavies;
        wallDavies (default): Davies (A from SpeciationSolver::daviesA) at
          the bulk ionic strength on the feed face, the permeate ideal.
        ideal: every activity coefficient 1.
        bulkOverPoreDavies: the partition (2) carries gamma_bulk/gamma_pore
          at BOTH faces -- the bulk-side gamma (the wall solution at the
          feed face, the permeate at the permeate face) with A(eps_b), the
          pore-side gamma at the pore node of that face with A(eps_p),
          both Davies on log10 with A(eps, T) = 1.82483e6 (eps T)^-3/2 (the
          Debye-Hueckel constant; Davies, "Ion Association", 1962).  The
          gammas depend on the answer's own ionic strengths, so since C142
          they are evaluated INSIDE the station's Newton (they were a fixed
          point around the pore solve).
      bulkDielectric <eps>;
        the bulk-solution dielectric constant in the Born term (3) and in
        A(eps_b); absent, SolventProperties::epsWater(T).
      poreSolver { wallClosure porePermeate | solutionDiffusion; }
        porePermeate (the default since C141, announced as such): the wall
          is closed with the permeate the solved pore gives -- the film
          carries to the wall exactly the solute flux the pore carries away.
          Since C142 the interface balance is one of the station Newton's
          rows (it was a Newton around the pore), as NanoFiltran solves them
          in one matrix.  Only the ions the feed carries are unknowns.
        solutionDiffusion: the wall is closed with the salts'
          solution-diffusion B_s, the closure the retired closed form had --
          the film then carries a solute flux the pore does not, and
          membrane20 shows what that costs in rejection.
      poreSolver { grid uniform | graded | adaptive; grading <beta>;
                   gridTolerance <cells>; gridPasses <n>; }
        uniform (the default, announced as such): equal cells.
        graded: the tanh map toward both faces of `grading` (0 < beta <= 6;
          `grading` alone, C142's grammar, means graded, and `grading 0`
          uniform).  Measured not to help (the steep part is interior).
        adaptive (C144): the nodes equidistribute the curvature of the
          solved potential (PoreNernstPlanck.H, THE ADAPTIVE GRID), re-solved
          until no node moves by more than `gridTolerance` of its own cell
          (default 0.1, announced) in at most `gridPasses` re-solves per
          station (default 8, announced); the grid is carried station to
          station.  Measured (docs/design/a-stiff-pore-solved-at-once.md
          section 12) at 0.76x the uniform error on an interior front and
          the same error on the corpus cases -- why it is a declared option
          and not the default.
        A contradiction refuses by name: `grading` on a uniform or an
        adaptive grid, `graded` with no grading, `gridTolerance` or
        `gridPasses` on a fixed grid.

    The classic NF SIGNATURE the tutorials demonstrate falls out of (2)-(4):
    a divalent co-ion (e.g. SO4 against a negative X_d) is excluded far more
    strongly than a monovalent one, so MgSO4 / CaCl2 are rejected above NaCl
    even at equal pore radius.

    STAGED EXCLUSIONS (the §9 K=1-trap lesson -- a symmetric charged solve can
    collapse to the trivial Donnan = 0 saddle).  Three visible switches:
      (a) STERIC only   : X_d = 0, eps_p = eps_b  => Donnan = 0, Born = 0.
      (b) +DONNAN       : X_d != 0.
      (c) +BORN (DE)    : eps_p < eps_b.
    The active stage is chosen by the membrane .dat (which pore fields are
    present) and ANNOUNCED in the run header -- no silent fallback.  There is
    no seeding CHAIN between the stages at run time (this header used to say
    each was "seeded from the previous, simpler converged state"; the code
    does not do that): the solved pore starts from local Donnan equilibrium
    at every node, whose two face potentials are monotone bisections that
    cannot land on the psi = 0 branch.

    SCOPE / INTERFACE GLUE.  The host SpiralWoundModule marches per SALT
    COMPONENT (NaCl, MgSO4, ...), one B_s and one c_b per salt.  DSPM-DE works
    ion-by-ion, so the law DECOMPOSES each salt solute into its (cation, anion)
    via the component's `electrolyte { cation; anion; }` block, solves the
    coupled ion pore problem ONCE per z station, and COLLAPSES the result back
    to a per-salt effective wall / permeate concentration the march expects.
    Ion ACTIVITIES (Davies gamma at the wall, via the speciation hook) enter the
    partition (2); the gammas are evaluated ONCE per station (the scaling-audit
    pattern), never inside the inner Newton.  Membranes lacking the pore tier --
    or salts lacking the cation/anion block -- are refused LOUDLY.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"
#include "PoreNernstPlanck.H"

namespace Choupo {
namespace membrane {

class DSPM_DE : public TransportModel
{
public:
    const std::string& type() const override { return type_; }

    //  `transportParameters { poreSolver { method finiteDifference;
    //  nodes <n>; wallClosure <word>; } hindrance <word>;
    //  activity <word>; bulkDielectric <eps>; }` -- the block this law
    //  reads (see "DECLARED CHOICES" above; absent, every default).
    void readParameters(const DictPtr& transportDict) override;

    //- The declared model choices (C138 slice 2; DSPM_DE.H "DECLARED
    //  CHOICES" says which is each one's default).  The hindrance has one
    //  pair (C141) and needs no enum.
    enum class Activity    { WallDavies, Ideal, BulkOverPoreDavies };
    enum class WallClosure { SolutionDiffusion, PorePermeate };

    TransportSolution localFluxes(const TransportContext& ctx) const override;

private:
    inline static const std::string type_ = "DSPM-DE";
    // The stage banner (which exclusions are active) is announced ONCE per run.
    mutable bool banner_done_ = false;

    // The declared model choices ("DECLARED CHOICES" above).
    bool        hindranceDeclared_ = false; // `hindrance` said by the case
    Activity    activity_       = Activity::WallDavies;
    //  The stated default (C141, 2026-10-24): the wall closed with the
    //  pore's own permeate -- set here because readParameters runs only
    //  when the case writes the block.
    WallClosure wallClosure_    = WallClosure::PorePermeate;
    bool        wallClosureDefaulted_ = true;
    scalar      bulkDielectric_ = -1.0;     // < 0: SolventProperties::epsWater(T)
    mutable bool choicesSaid_   = false;    // the declared choices, announced once

    // The pore solver (see "THE PORE IS SOLVED" above).
    bool        methodDefaulted_  = true;    // no `poreSolver { method }`
    //  The stated defaults, MEASURED (docs/design/a-stiff-pore-solved-at-once.md
    //  section 11): the node count and the grading of the grid.
    std::size_t poreNodes_        = 101;     // grid nodes, faces included
    bool        nodesDefaulted_   = true;
    scalar      poreGrading_      = 0.0;     // beta of the tanh map toward both faces
    bool        gradingDefaulted_ = true;
    //  THE GRID (C144): uniform, graded (tanh, `grading`) or adaptive.
    enum class GridKind { Uniform, Graded, Adaptive };
    GridKind    gridKind_         = GridKind::Uniform;
    bool        gridDefaulted_    = true;
    scalar      gridTolerance_    = 0.1;     // node movement, in cells
    bool        gridTolDefaulted_ = true;
    int         gridPasses_       = 8;       // re-solves per station at most
    bool        gridPassesDefaulted_ = true;
    mutable bool gridUnsettledSaid_ = false; // an unsettled grid, said once
    std::string gridWords() const;
    static scalar smallestCell(const std::vector<scalar>& g);
    mutable bool poreBanner_      = false;   // first solve announced once
    mutable bool continuationSaid_ = false;  // first continuation announced once
    mutable bool noFluxSaid_      = false;   // a station with no water flux, said once
    mutable bool excludedSaid_    = false;   // an ion the pore excludes, said once
    // The previous station's converged state: the next station's start.
    mutable pore::PoreSolution lastPore_;
    mutable bool               haveLastPore_ = false;
};

} // namespace membrane
} // namespace Choupo
