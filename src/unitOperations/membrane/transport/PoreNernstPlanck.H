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
    discretised by finite differences on N intervals of a grid -- uniform,
    graded toward both faces, or adapted to the solved profile (THE ADAPTIVE
    GRID) -- every node solved at once by Newton on the DECLARED
    block-tridiagonal structure with an ANALYTIC Jacobian.  The method of
    NanoFiltran (Geraldes & Alves, "Computer program for simulation of mass
    transport in nanofiltration membranes", J. Membr. Sci. 321 (2008)
    172-182) is the ENP discretised inside the membrane, linearised and all
    nodes solved simultaneously -- because the problem is STIFF (a strongly
    excluded co-ion sits orders of magnitude below the counter-ion, and the
    drift and diffusion terms of its flux nearly cancel).  NanoFiltran is
    the REFERENCE this solver is compared with
    (tutorials/props/membrane/nanofiltran01_dspmde_reference,
    bin/curate/check_nanofiltran_reference.py); since C142 (2026-10-24,
    Vitor: "Eu quero que facas um solver melhor!") it is not the method this
    file copies -- the differences below are each measured in
    docs/design/a-stiff-pore-solved-at-once.md section 11.

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

    THE STATION, when the caller hands the wall and the water flux in too
    (PoreProblem::wall, ::activity, ::closure -- what DSPM-DE does since
    C142; the fixed-face problem above stays available, the gate's probe
    uses it):
      the feed-face wall concentration of every ion from the film's
      interface balance, Geraldes & Afonso, J. Membr. Sci. 300 (2007) 20,
      AT THE FIELD xi' THE NEWTON CARRIES (membrane::wallAtField, the one
      home of that equation), closed with the permeate (2) of THIS pore
      (`wallClosure porePermeate`) or with the salts' solution-diffusion
      B_s (`solutionDiffusion`):
        feedSide_i = partition_i C_m,i(c_perm, J_v, xi')               (7)
      electroneutrality AT THE WALL when the film is coupled
      (`ionCoupling electroneutral`), xi' = 0 otherwise:
        sum_i z_i C_m,i = 0                                            (8)
      the water flux, imposed (the props bench) or CLOSED:
        J_v = A_w (dP - R T (sum_i C_m,i - sum_i c_perm,i))             (9)
      and, with `activity bulkOverPoreDavies`, the Davies coefficients at
      both faces evaluated on the answer's own ionic strengths (wall,
      first pore node, last pore node, permeate) -- not by a fixed point
      around the solve.
    Before C142 the wall was a Newton AROUND the pore and the water flux a
    secant AROUND that (each wall evaluation a full pore solve): the three
    are now ONE Newton, because (7)-(9) read only the first node's unknowns
    and fit the block structure as they stand -- no bordering, no dense
    solve.

    THE FLUX BETWEEN TWO NODES -- exponentially fitted (Scharfetter-Gummel).
    On the interval [k, k+1] of width h_k the coefficients of (1) are frozen
    and the potential is taken linear, so (1) is a linear ODE whose EXACT
    solution gives the discrete flux
        N_i = (P_i/h_k) [ B(-a) c_k - B(a) c_{k+1} ],
        a    = K_c,i J_v h_k / P_i - z_i (psi_{k+1} - psi_k),
        B(x) = x / (e^x - 1)  (the Bernoulli function).
    WHY this and not a central difference: a central difference of (1) is
    free of spurious oscillation only while the cell Peclet number |a|
    stays below 2, and a strongly excluded co-ion crosses a steep profile
    far above it; the fitted flux is exact for a uniform drift on ANY cell
    (uniform or not), so it stays monotone at any cell Peclet number and
    reduces to central differences where the drift vanishes.  It is the
    standard cure for drift-diffusion stiffness in semiconductor device
    simulation, where the same equations are solved.  On a smooth profile
    it is second order -- which the grid-convergence arms of
    bin/curate/check_pore_solver.py MEASURE rather than assume.

    THE GRID (C142): uniform by default, or graded toward BOTH faces by a
    symmetric tanh map,
        xi_k = (1 + tanh(beta (2k/N - 1)) / tanh(beta)) / 2,
    which keeps the order (2, measured) but was measured NOT to help: the
    steep part of a mixed-counter-ion pore is an interior front, not a face
    layer.  beta = 0 is the uniform grid of C138.  The default and the node
    count are the ones MEASURED in docs/design/a-stiff-pore-solved-at-once.md
    sections 11 and 12.  A caller may also hand an explicit node list
    (PoreSettings::nodes).

    THE ADAPTIVE GRID (C144, PoreSettings::adaptive; DSPM-DE `grid
    adaptive;`).  The fitted flux above is EXACT on a cell where psi is
    linear, so its truncation error on cell k is O(h_k^2 |psi''|) -- the
    potential's CURVATURE is what the scheme leaves out.  The published
    permeate's error is the sum of those, and the node distribution that
    minimises sum h_k^2 D_k at a fixed node count has h_k ~ D_k^{-1/3}; so
    the monitor of a solved profile is
        M_k = |psi''|_k^{1/3} + mean(|psi''|^{1/3}),
    the mean a floor that keeps at least half the nodes uniformly spread
    (Beckett & Mackenzie, Appl. Numer. Math. 35 (2000) 87), smoothed by two
    passes of a (1/4, 1/2, 1/4) filter.  The loop (de Boor's): solve,
    EQUIDISTRIBUTE M (the new nodes cut the integral of M into equal parts
    -- strictly increasing, because M > 0), carry the state onto the new
    grid (ln c and psi interpolated linearly, the global copies kept), solve
    again warm-started, until no node would move by more than
    `gridTolerance` of its own cell (PoreSolution::gridMove), at most
    `gridPasses` re-solves; a re-solve that fails is abandoned and the last
    converged answer stands (PoreSolution::gridFailure).  A warm start
    carries its own grid, so a module adapts at its first station and
    re-adapts only when the profile moves.  WHAT IT BUYS, measured (section
    12): 0.76x the uniform grid's error on NanoFiltran's interior front at
    50, 100 and 200 intervals, 0.8-0.9x on the ambipolar limit, the same
    error on the corpus cases -- a margin, not an order, because the
    curvature of psi there is spread over a third of the pore; which is why
    the uniform grid stays the default.

    THE UNKNOWNS, one block per node k = 0..N (block size 2 Ni + 4):
        u_{k,i} = ln c_{k,i}   (positive by construction)
        psi_k
        v_{k,i} = ln c_perm,i  (a copy per node, held equal by a row)
        psi_perm,k             (a copy per node, held equal by a row)
        j_k = J_v / J_ref      (a copy per node, held equal by a row)
        x_k = xi' / xi_ref     (the wall field; read at k = 0 only)
    The copies are what lets the GLOBAL unknowns (c_perm, psi_perm, J_v) fit
    the block-tridiagonal shape: each copy couples only to its neighbour.
    THE EQUATIONS of block k:
        rows 0..Ni-1     k < N: the fitted flux of [k, k+1] minus (2)
                         k = N: the permeate partition (6), in logs
        row  Ni          electroneutrality (3) at node k
        rows Ni+1..2Ni   k = 0: the feed partition (5) with (7), in logs
                         k > 0: v_{k,i} - v_{k-1,i}
        row  2Ni+1       k < N: psi_perm,k - psi_perm,k+1
                         k = N: zero current (4)
        row  2Ni+2       k = 0: the water flux, (9) or j_0 = J_imposed/J_ref
                         k > 0: j_k - j_{k-1}
        row  2Ni+3       k = 0: (8) when the film is coupled, x_0 otherwise
                         k > 0: x_k (an idle slot: blocks share one size)
    Every row is NORMALISED by the terms it balances (the project's one
    rule, solver/Convergence.H): a flux row by the sum of the magnitudes of
    its two fitted terms and the convective flux, the electroneutrality
    rows by sum |z_i| c_i (+ |X_d|), the zero-current row by sum |z_i| N_i,
    the water-flux row by A_w dP.  The log-form rows are already O(1).

    THE JACOBIAN IS ANALYTIC (C142): every row above has closed-form
    derivatives (the Bernoulli function's own, B'(x) = B(x)(1 - x - B(x))/x
    with its series near 0; the wall's from membrane::wallAtField; Davies'
    d ln gamma/dI), assembled straight into the three bands and handed to
    solver::newtonND (BlockTri::jacobian), whose block-Thomas solve is the
    one home the MESH column and the stiff integrator share.  The colored
    finite differences of C138 are kept as the ORACLE only: with
    PoreSettings::audit the first iteration builds the dense FD Jacobian and
    the solve returns both the off-band maximum (the structure claim) and
    the analytic-against-FD departure (the derivative claim); the gate
    compares the two on random states.  PoreSettings::finiteDifferenceJacobian
    restores the FD Newton for that comparison.

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

    CONTINUATION, the robust fallback.  When the Newton fails from the seed
    it was handed, the station is solved again from the one state that is
    exact without any Newton -- no flux, the pore in Donnan equilibrium with
    both baths -- and the DRIVE (the imposed J_v, or dP under the closure
    (9)) is raised geometrically from a Peclet number of 1e-4 to the target,
    each solve warm-started; it is COUNTED (PoreSolution::continuationSteps)
    for the caller to announce.

    NOT HERE: activity coefficients inside the pore between the faces (the
    ions are ideal there, as in NanoFiltran), a pore-size distribution.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "../massTransfer/Polarisation.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {
namespace solver { struct BlockBands; }
namespace membrane {
namespace pore {

//- One ion's coefficients, computed by the calling transport law.
struct PoreIon
{
    int    z        = 0;    // signed charge
    scalar P        = 0.0;  // K_d D A_k/dx: diffusive conductance [m/s]
    scalar Kc       = 0.0;  // convective hindrance [-]
    //  c(0) = feedSide e^{-z psi(0)}  [mol/m3]; with a wall (PoreWall), the
    //  partition per unit WALL concentration (steric x Born x the activity
    //  the caller holds fixed), multiplied by C_m from (7).
    scalar feedSide = 0.0;
    scalar permSide = 0.0;  // c(1) = permSide c_perm e^{-z (psi(1)-psi_perm)}
};

//- The film, folded into the station's Newton (7)-(8).  Per ion, in the
//  order of PoreProblem::ions.
struct PoreWall
{
    bool active = false;
    SuctionCorrection   suction = SuctionCorrection::FilmTheory;
    bool                coupled = false;           // (8) on: ionCoupling electroneutral
    bool                solutionDiffusion = false; // close the wall with B, not with (2)
    std::vector<scalar> cBulk;   // [mol/m3]
    std::vector<scalar> k;       // film coefficient [m/s]
    std::vector<scalar> D;       // free-solution D (the migration term) [m2/s]
    std::vector<scalar> B;       // solution-diffusion B_s [m/s] (solutionDiffusion only)
};

//- `activity bulkOverPoreDavies`: gamma_bulk/gamma_pore at both faces,
//  Davies on log10, A(eps) for the solution side and for the pore side.
//  When active, feedSide_i is multiplied by gamma_wall,i(I_wall)/gamma_0,i(I_0)
//  and permSide_i by gamma_perm,i(I_perm)/gamma_N,i(I_N), each on the
//  answer's own ionic strength.
struct PoreActivity
{
    bool   active    = false;
    scalar Asolution = 0.0;
    scalar Apore     = 0.0;
};

//- The water flux (9): absent, J_v = PoreProblem::Jv is imposed.
struct PoreClosure
{
    bool   active = false;
    scalar Aw     = 0.0;    // water permeance [m/(s Pa)]
    scalar dP     = 0.0;    // applied pressure difference [Pa]
    scalar RT     = 0.0;    // [J/mol]
};

struct PoreProblem
{
    std::vector<PoreIon> ions;
    scalar Xd = 0.0;        // signed fixed charge [mol/m3]
    scalar Jv = 0.0;        // the imposed flux [m/s] (no closure)
    PoreWall     wall;
    PoreActivity activity;
    PoreClosure  closure;
};

struct PoreSettings
{
    std::size_t intervals = 100;     // N: the nodes are 0..N
    scalar      grading   = 0.0;     // beta of the tanh map; 0 = uniform
    //  An explicit grid, xi_0 = 0 < xi_1 < ... < xi_N = 1 (intervals + 1
    //  values): when given it replaces the tanh map.  The adaptive loop
    //  hands each re-solve its moved grid this way (THE ADAPTIVE GRID).
    std::vector<scalar> nodes;
    //  THE ADAPTIVE GRID (C144): equidistribute the monitor of the answer,
    //  re-solve on the moved grid, repeat until no node moves by more than
    //  `gridTolerance` of its own local cell, at most `gridPasses` re-solves.
    bool        adaptive      = false;
    scalar      gridTolerance = 0.1;
    int         gridPasses    = 8;
    scalar      tolerance = 1.0e-12; // on ||F||_2 of the normalised rows
    int         maxIter   = 60;
    bool        audit     = true;    // audit the structure and the derivatives
    //  The test oracle: the colored finite-difference Jacobian of C138 in
    //  place of the analytic one (bin/curate/check_pore_solver.py compares).
    bool        finiteDifferenceJacobian = false;
};

//- The seed a caller supplies when it has no previous solution: a permeate
//  estimate and, under the closure, a water flux.  From them the solver
//  builds a LOCAL DONNAN EQUILIBRIUM profile (see the .cpp): both
//  partitions and electroneutrality hold at every node of the seed, and
//  only the flux rows and zero current are left to the Newton.
struct PoreSeed
{
    std::vector<scalar> cPerm;       // [mol/m3]
    scalar              Jv = -1.0;   // [m/s]; < 0: the imposed one, or A_w dP / 2
};

struct PoreSolution
{
    bool        converged     = false;
    int         iterations    = 0;
    scalar      residual      = 0.0;   // ||F||_2 at the answer
    scalar      offBandMax    = -1.0;  // the structure audit; < 0 when not audited
    scalar      jacobianMismatch = -1.0; // analytic vs FD; < 0 when not audited
    long        jacobianEvals = 0;
    std::string stopReason;
    //  > 0 when the Newton failed from the seed (or the warm start) it was
    //  handed and the answer was reached by continuation in the drive from
    //  the exact no-flux state; the number of solves it took, and why the
    //  direct Newton stopped.  0 and empty otherwise.
    int         continuationSteps = 0;
    std::string directFailure;
    //  Newton iterations summed over every solve this call made (direct
    //  attempt, continuation and the adaptive re-solves): the cost, as the
    //  module counts it.
    int         iterationsTotal = 0;
    //  THE ADAPTIVE GRID, measured (PoreSettings::adaptive only): the
    //  re-solves on a moved grid this call made, the last node movement
    //  measured (in units of the local cell), whether it settled below the
    //  tolerance, and why a re-solve was abandoned (the answer then stays
    //  the last converged one, on its own grid).
    int         gridPasses  = 0;
    scalar      gridMove    = 0.0;
    bool        gridSettled = true;
    std::string gridFailure;

    std::size_t intervals = 0;
    std::vector<scalar> grid;                // [node] xi_k
    std::vector<scalar> cPerm;               // [mol/m3]
    std::vector<std::vector<scalar>> c;      // [node][ion] [mol/m3]
    std::vector<scalar> psi;                 // [node] [RT/F]
    scalar psiPerm = 0.0;
    scalar Jv      = 0.0;                    // the water flux solved / imposed [m/s]
    std::vector<scalar> cWall;               // with a wall: C_m [mol/m3]
    scalar xiPrime = 0.0;                    // with a coupled wall: (F/RT) xi [1/m]

    //  measured on the answer (see the header)
    scalar fluxConstancyMax  = 0.0;  // |N_k - J_v c_perm| / (terms + |J_v c_perm|)
    scalar fluxRelativeMax   = 0.0;  // |N_k - J_v c_perm| / (J_v c_perm)
    scalar stiffnessRatio    = 0.0;  // max migration flux / net flux
    scalar currentMax        = 0.0;  // |sum z N| / sum |z N|
    scalar electroneutralMax = 0.0;  // worst node
    scalar wallChargeMax     = 0.0;  // coupled wall: |sum z C_m| / sum |z| C_m

    std::vector<scalar> x;                   // the raw unknowns (warm starts)
};

//- Solve from a seed.
PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSeed& seed);

//- Solve warm-started from a previous solution with the SAME node count
//  and ion list (the next station of a module, or the next point of a
//  sweep).  Adaptive: the warm answer's own grid is the start.  Fixed: the
//  warm state is carried onto the declared grid (the identity when the two
//  are the same).
PoreSolution solve(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSolution& warm);

//- THE AUDIT, on its own: the declared block-tridiagonal structure and the
//  analytic Jacobian measured against the dense finite-difference Jacobian
//  at the seed state (PoreSolution::offBandMax, ::jacobianMismatch), after
//  one Newton step and no continuation.  The structure and the derivatives
//  are properties of the CODE, not of the grid, so a caller audits a small
//  copy of its problem (DSPM-DE: 11 nodes) and solves the real one
//  unaudited -- the dense audit Jacobian of a 201-node four-ion pore is
//  46 MB and 4800 residual evaluations, more than the solve itself.
PoreSolution audit(const PoreProblem& pb, const PoreSettings& s,
                   const PoreSeed& seed);

//- The Bernoulli function B(x) = x / (e^x - 1), evaluated without
//  cancellation near 0 and without overflow at large |x|, and its
//  derivative B'(x) = B(x)(1 - x - B(x))/x (series near 0).
scalar bernoulli(scalar x);
scalar bernoulliSlope(scalar x);

//- The graded grid, xi_0 = 0 .. xi_N = 1 (see THE GRID).
std::vector<scalar> gradedGrid(std::size_t N, scalar beta);

//- THE ADAPTIVE GRID: the grid of the same node count that equidistributes
//  the monitor of a solved profile (see the header), and the movement from
//  one grid to another in units of the local cell (max over the interior
//  nodes of |xi_new - xi_old| over the mean of the two old cells there).
std::vector<scalar> equidistributedGrid(const PoreSolution& r);
scalar gridMovement(const std::vector<scalar>& from, const std::vector<scalar>& to);

//- Davies ln gamma on log10 at ionic strength I [mol/L], and d ln gamma/dI.
//  The one home of the Davies form the DSPM-DE law and this solver use.
scalar daviesLnGamma(int z, scalar I_molL, scalar A, scalar* dLnGamma_dI = nullptr);

// ---- the test surface (bin/curate/_poreSolverProbe.cpp) --------------------
//  The residual, the ANALYTIC Jacobian and the seed, exposed so the gate can
//  compare the derivatives with finite differences at states of its own
//  choosing.  Nothing in the engine calls these.
std::size_t blockSize(const PoreProblem& pb);
sVector residualAt(const PoreProblem& pb, const PoreSettings& s, const sVector& x);
void    jacobianAt(const PoreProblem& pb, const PoreSettings& s, const sVector& x,
                   solver::BlockBands& J);
sVector seedOf(const PoreProblem& pb, const PoreSettings& s, const PoreSeed& seed);

} // namespace pore
} // namespace membrane
} // namespace Choupo
