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
      Polarisation object), the feed-face activity (Davies, frozen per
      station, at the BULK ionic strength), the permeate taken ideal (the
      closed form's convention, kept so the two paths differ ONLY in the
      pore), the van't Hoff osmotic difference over the ions and the
      damped fixed point on the water flux.

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
    //  finiteDifference; nodes <n>; } }` -- the only block this law reads.
    void readParameters(const DictPtr& transportDict) override;

    TransportSolution localFluxes(const TransportContext& ctx) const override;

private:
    inline static const std::string type_ = "DSPM-DE";
    // The stage banner (which exclusions are active) is announced ONCE per run.
    mutable bool banner_done_ = false;

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
