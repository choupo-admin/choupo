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
Namespace
    Choupo::membrane::pore

Description
    The extended Nernst-Planck (ENP) equations SOLVED across a charged pore:
    discretised by finite differences on N intervals, every node solved at
    once by Newton on the DECLARED block-tridiagonal structure.  This is the
    method of NanoFiltran (Geraldes & Alves, "Computer program for
    simulation of mass transport in nanofiltration membranes", J. Membr.
    Sci. 321 (2008) 172-182): the ENP discretised inside the membrane,
    linearised, and all nodes solved simultaneously -- because the problem
    is STIFF (a strongly excluded co-ion sits orders of magnitude below the
    counter-ion, and the drift and diffusion terms of its flux nearly
    cancel), and an explicit march across it converges where it was tuned
    and almost nowhere else.  Nothing here is yet compared with NanoFiltran's
    published numbers; that comparison is a separate slice.

    THE PROBLEM, per ion i on the dimensionless pore coordinate xi = x/dx
    in [0, 1] (psi is the potential in RT/F units, relative to the FEED
    BULK; P_i = K_d,i D_i A_k/dx is the ion's diffusive conductance of the
    layer [m/s]):

      flux per membrane area, CONSTANT along xi at steady state:
        N_i = -P_i (dc_i/dxi + z_i c_i dpsi/dxi) + K_c,i J_v c_i       (1)
      carried OUT by convection into the permeate:
        N_i = J_v c_perm,i                                             (2)
      electroneutrality at EVERY node, with the fixed charge X_d:
        sum_i z_i c_i + X_d = 0                                        (3)
      zero net current (equivalently, given (2): an electroneutral
      permeate):
        sum_i z_i N_i = 0                                              (4)
      the interfacial partitions, at the feed face (psi(0) IS the feed
      Donnan jump) and at the permeate face (psi_perm is the permeate
      bulk potential, one unknown):
        c_i(0) = feedSide_i e^{-z_i psi(0)}                            (5)
        c_i(1) = permSide_i c_perm,i e^{-z_i (psi(1) - psi_perm)}      (6)
      feedSide_i and permSide_i are the partition coefficients the CALLING
      law computed (steric x Born x activity x wall concentration, and
      steric x Born) -- this file holds no partition model of its own, so
      the law's one home for them stays the only one.

    THE FLUX BETWEEN TWO NODES -- exponentially fitted (Scharfetter-Gummel).
    On the interval [k, k+1] of width h the coefficients of (1) are frozen
    and the potential is taken linear, so (1) is a linear ODE whose EXACT
    solution gives the discrete flux
        N_i = (P_i/h) [ B(-a h) c_k - B(a h) c_{k+1} ],
        a h  = K_c,i J_v h / P_i - z_i (psi_{k+1} - psi_k),
        B(x) = x / (e^x - 1)  (the Bernoulli function).
    WHY this and not a central difference: a central difference of (1) is
    free of spurious oscillation only while the cell Peclet number |a h|
    stays below 2, and a strongly excluded co-ion crosses a steep profile
    far above it; the fitted flux is exact for a uniform drift, so it stays
    monotone at any cell Peclet number and reduces to central differences
    where the drift vanishes.  It is the standard cure for drift-diffusion
    stiffness in semiconductor device simulation, where the same equations
    are solved.  On a smooth profile it is second order -- which the
    grid-convergence arm of bin/curate/check_pore_solver.py MEASURES rather
    than assumes.

    THE UNKNOWNS, one block per node k = 0..N (block size 2 Ni + 2):
        u_{k,i} = ln c_{k,i}   (positive by construction)
        psi_k
        v_{k,i} = ln c_perm,i  (a copy per node, held equal by a row)
        psi_perm,k             (a copy per node, held equal by a row)
    The copies are what lets the two GLOBAL unknowns (c_perm, psi_perm) fit
    the block-tridiagonal shape: each copy couples only to its neighbour.
    THE EQUATIONS of block k:
        rows 0..Ni-1     k < N: the fitted flux of [k, k+1] minus (2)
                         k = N: the permeate partition (6), in logs
        row  Ni          electroneutrality (3) at node k
        rows Ni+1..2Ni   k = 0: the feed partition (5), in logs
                         k > 0: v_{k,i} - v_{k-1,i}
        row  2Ni+1       k = 0: zero current (4)
                         k > 0: psi_perm,k - psi_perm,k-1
    Every row is NORMALISED by the terms it balances (the project's one
    rule, solver/Convergence.H): a flux row by the sum of the magnitudes of
    its two fitted terms and the convective flux, the electroneutrality row
    by sum |z_i| c_i + |X_d|, the zero-current row by sum |z_i| N_i.  The
    log-form rows are already O(1).

    THE SOLVE is solver::newtonND with NDOptions::blockTri declared -- the
    colored (Curtis-Powell-Reid) Jacobian and the block-Thomas solve, the
    one home the MESH column and the stiff integrator already share.  When
    the caller asks (PoreSettings::audit), the declared structure is
    AUDITED against a dense Jacobian on the first iteration
    (NDResult::offBandMax) and the measurement is returned for the caller
    to announce.

    WHAT IS MEASURED ON THE ANSWER (PoreSolution), never assumed: the
    largest departure of any interval's flux from J_v c_perm,i -- relative
    to the two fitted terms that flux nets, which the Newton drives to
    round-off, AND relative to the net flux itself; the STIFFNESS RATIO,
    the electromigration flux P |z| c dpsi/dxi against the net flux (a
    property of the answer, independent of the grid); the zero-current
    residual and the worst electroneutrality.  The two flux measures part
    because a co-ion held by the Donnan field carries a migration and a
    diffusion flux many orders larger than the flux they net, and
    round-off of 1e-16 of the large terms is a much larger fraction of the
    small one -- the representable limit of the problem, not a defect of
    the solver.

    NOT HERE: activity coefficients inside the pore (the ions are ideal
    between the faces), a non-uniform grid, a pore-size distribution.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {
namespace membrane {
namespace pore {

//- One ion's coefficients, computed by the calling transport law.
struct PoreIon
{
    int    z        = 0;    // signed charge
    scalar P        = 0.0;  // K_d D A_k/dx: diffusive conductance [m/s]
    scalar Kc       = 0.0;  // convective hindrance [-]
    scalar feedSide = 0.0;  // c(0) = feedSide e^{-z psi(0)}  [mol/m3]
    scalar permSide = 0.0;  // c(1) = permSide c_perm e^{-z (psi(1)-psi_perm)}
};

struct PoreProblem
{
    std::vector<PoreIon> ions;
    scalar Xd = 0.0;        // signed fixed charge [mol/m3]
    scalar Jv = 0.0;        // volumetric flux per membrane area [m/s]
};

struct PoreSettings
{
    std::size_t intervals = 100;     // N: the nodes are 0..N
    scalar      tolerance = 1.0e-12; // on ||F||_2 of the normalised rows
    int         maxIter   = 60;
    bool        audit     = true;    // audit the declared structure
};

//- The seed a caller supplies when it has no previous pore solution: the
//  permeate concentrations of an estimate (DSPM-DE hands its closed form's).
//  From them the solver builds a LOCAL DONNAN EQUILIBRIUM profile (see the
//  .cpp): both partitions and electroneutrality hold at every node of the
//  seed, and only the flux rows and zero current are left to the Newton.
struct PoreSeed
{
    std::vector<scalar> cPerm;       // [mol/m3]
};

struct PoreSolution
{
    bool        converged     = false;
    int         iterations    = 0;
    scalar      residual      = 0.0;   // ||F||_2 at the answer
    scalar      offBandMax    = -1.0;  // the audit; < 0 when not audited
    long        jacobianEvals = 0;
    std::string stopReason;
    //  > 0 when the Newton failed from the seed (or the warm start) it was
    //  handed and the answer was reached by continuation in J_v from the
    //  exact J_v = 0 state; the number of solves it took, and why the
    //  direct Newton stopped.  0 and empty otherwise.
    int         continuationSteps = 0;
    std::string directFailure;

    std::size_t intervals = 0;
    std::vector<scalar> cPerm;               // [mol/m3]
    std::vector<std::vector<scalar>> c;      // [node][ion] [mol/m3]
    std::vector<scalar> psi;                 // [node] [RT/F]
    scalar psiPerm = 0.0;

    //  measured on the answer (see the header)
    scalar fluxConstancyMax  = 0.0;  // |N_k - J_v c_perm| / (terms + |J_v c_perm|)
    scalar fluxRelativeMax   = 0.0;  // |N_k - J_v c_perm| / (J_v c_perm)
    scalar stiffnessRatio    = 0.0;  // max migration flux / net flux
    scalar currentMax        = 0.0;  // |sum z N| / sum |z N|
    scalar electroneutralMax = 0.0;  // worst node

    std::vector<scalar> x;                   // the raw unknowns (warm starts)
};

//- Solve from a closed-form seed.
PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSeed& seed);

//- Solve warm-started from a previous solution on the SAME grid and ion
//  list (the caller's outer water-flux iteration moves J_v a little each
//  pass).
PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSolution& warm);

//- The Bernoulli function B(x) = x / (e^x - 1), evaluated without
//  cancellation near 0 and without overflow at large |x|.
scalar bernoulli(scalar x);

} // namespace pore
} // namespace membrane
} // namespace Choupo
