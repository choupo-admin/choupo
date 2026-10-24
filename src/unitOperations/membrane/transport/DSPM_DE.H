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

      pore ELECTRONEUTRALITY, at every point of the pore:
        sum_i z_i c_pore,i + X_d = 0                                (4)

      ZERO NET CURRENT through the pore:
        sum_i z_i j_i = 0                                           (5)

    TWO WAYS ACROSS THE PORE -- and what each one SOLVES.  This header
    used to list (4) and (5) as "the physics solved" while the code solved
    neither along the pore (corrected 2026-10-22, DEV.md 4c C138); the two
    paths are now stated apart, because they are not the same model.

      closedForm (the DEFAULT, `poreSolver` absent): the pore is NOT
        solved.  (4) is imposed at the FEED face only, by a bisection on
        the feed Donnan potential, and the permeate is made electroneutral
        by a bisection on a permeate Donnan potential -- both only when the
        membrane declares a charge (with X_d = 0 neither face is made
        electroneutral, so two ions of unequal steric partition enter and
        leave the pore with a net charge); between the faces each ion is
        transmitted ALONE by
            c_perm,i / c_in,i = K_c / (K_c + (1 - K_c e^{-Pe}) R)
        with R the ratio of the two faces' partitions -- no potential
        gradient couples the ions inside the pore, and (4) and (5) are not
        imposed there.  This transmission is not the solution of (1) even in
        its own limit with no potential: a point solute in an uncharged pore
        (Phi = K_c = R = 1) is transmitted 1/(2 - e^{-Pe}), i.e. REJECTED up
        to 50 %, where (1) gives no rejection at all (algebra); and on an
        uncharged, Born-free membrane it departs from the exact ambipolar
        solution of (1)-(5) by about 70 % in the permeate at the worst
        station of membrane20's NaCl unit (MEASURED,
        bin/curate/check_pore_solver.py arm (c2)).  Kept
        byte-identical because every DSPM-DE golden is pinned to it; whether
        to replace it is Vitor's decision.

      finiteDifference (`transportParameters { poreSolver { method
        finiteDifference; nodes <n>; } }`): (1)-(5) SOLVED, all at once --
        the method of NanoFiltran (Geraldes & Alves, J. Membr. Sci. 321
        (2008) 172-182): the ENP discretised on n nodes across the pore,
        (4) at every node, (5), the partitions (2)-(3) at both faces, every
        node solved simultaneously by Newton on the declared
        block-tridiagonal structure (PoreNernstPlanck.H, the one home of
        the pore solve; the partition coefficients stay computed HERE).
        Seeded from the closed form's permeate; announced with its node
        count, iterations, residual and the structure audit.

      Both paths share everything outside the pore: the wall (the shared
      Polarisation object), the feed-face activity (by default Davies,
      frozen per station, at the BULK ionic strength), the permeate taken
      ideal (the closed form's convention, kept so the two paths differ
      ONLY in the pore), the van't Hoff osmotic difference over the ions
      and the damped fixed point on the water flux.  The DECLARED CHOICES
      below change the wall closure and the activities of the solved pore.

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
          pore gammas depend on the pore solution, so they are converged by
          a fixed point around the pore solve: the solved pore is required.
      bulkDielectric <eps>;
        the bulk-solution dielectric constant in the Born term (3) and in
        A(eps_b); absent, SolventProperties::epsWater(T).
      poreSolver { wallClosure solutionDiffusion | porePermeate; }
        solutionDiffusion (default): the wall is closed with the salts'
          solution-diffusion B_s, as the closed form's is.
        porePermeate: the wall is closed with the permeate the solved pore
          gives -- the interface balance and the pore converged together by
          a fixed point, where NanoFiltran solves them in one matrix.

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
    does not do that): the closed form needs no seed -- its two Donnan
    potentials are monotone bisections, which cannot land on the psi = 0
    branch -- and the solved pore starts from local Donnan equilibrium at
    every node.

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

    //  `transportParameters { poreSolver { method closedForm |
    //  finiteDifference; nodes <n>; wallClosure <word>; } hindrance <word>;
    //  activity <word>; bulkDielectric <eps>; }` -- the block this law
    //  reads (see "DECLARED CHOICES" above).
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
    WallClosure wallClosure_    = WallClosure::SolutionDiffusion;
    scalar      bulkDielectric_ = -1.0;     // < 0: SolventProperties::epsWater(T)
    mutable bool choicesSaid_   = false;    // the declared choices, announced once
    mutable int  outerPassesMax_ = 0;       // pore <-> wall/activity passes, the most

    // The pore solver (see "TWO WAYS ACROSS THE PORE" above).
    bool        finiteDifference_ = false;
    std::size_t poreNodes_        = 0;       // grid nodes, faces included
    bool        nodesDefaulted_   = false;
    mutable bool poreBanner_      = false;   // first solve announced once
    mutable bool continuationSaid_ = false;  // first continuation announced once
    // The previous station's converged pore: the next station's seed.
    mutable pore::PoreSolution lastPore_;
    mutable bool               haveLastPore_ = false;
};

} // namespace membrane
} // namespace Choupo
