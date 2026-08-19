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
\*---------------------------------------------------------------------------*/

#include "PelletDiffusion.H"

#include "solver/NewtonND.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace pellet {

namespace {

//  Beyond this the ascending Bessel series and the hyperbolic closed forms run
//  into double-precision overflow (I0(700) ~ e^700).  It is two orders of
//  magnitude past any modulus a teaching case reaches, and refusing beyond it
//  is better than an inf that propagates as a plausible eta of zero.
constexpr scalar maxModulus = 500.0;

//  Below this a modulus is treated as zero by the small-argument series, which
//  are exact to the last bit there and free of the cancellation the direct
//  forms suffer.
constexpr scalar tinyModulus = 1.0e-8;

void requireFiniteModulus(scalar phiChar)
{
    if (!(phiChar >= 0.0))
        throw std::runtime_error("pellet: the Thiele modulus must be a"
            " non-negative number (got " + std::to_string(phiChar) + ").");
    if (phiChar > maxModulus)
        throw std::runtime_error("pellet: the Thiele modulus "
            + std::to_string(phiChar) + " exceeds the range this solver will"
              " answer in (" + std::to_string(maxModulus) + ").  The closed"
              " forms overflow double precision beyond it, and an overflowed"
              " oracle checks nothing.  At such a modulus the answer is the"
              " asymptote eta -> 1/phi to every digit that matters.");
}

} // anonymous namespace

scalar generalisedModulusFactor(PelletGeometry g)
{
    switch (g)
    {
        case PelletGeometry::slab:     return 1.0;
        case PelletGeometry::cylinder: return 0.5;
        case PelletGeometry::sphere:   return 1.0 / 3.0;
    }
    return 1.0 / 3.0;
}

// ---------------------------------------------------------------------------
//  Modified Bessel functions, ascending series.  Every term is POSITIVE, so
//  there is no cancellation and the only limit is overflow of the sum itself.
//
//      I0(x) = SUM_m (x^2/4)^m / (m!)^2
//      I1(x) = (x/2) SUM_m (x^2/4)^m / (m! (m+1)!)
//
//  The loop advances by the TERM RATIO rather than by recomputing factorials,
//  so nothing large is ever formed that is not part of the answer.
// ---------------------------------------------------------------------------
scalar besselI0(scalar x)
{
    const scalar ax = std::abs(x);
    requireFiniteModulus(ax);
    const scalar q = 0.25 * ax * ax;
    scalar term = 1.0, sum = 1.0;
    for (int m = 1; m < 2000; ++m)
    {
        term *= q / (static_cast<scalar>(m) * static_cast<scalar>(m));
        sum  += term;
        if (term <= 1.0e-18 * sum) break;
    }
    return sum;
}

scalar besselI1(scalar x)
{
    const scalar ax = std::abs(x);
    requireFiniteModulus(ax);
    const scalar q = 0.25 * ax * ax;
    scalar term = 1.0, sum = 1.0;              // series for 2*I1(x)/x
    for (int m = 1; m < 2000; ++m)
    {
        term *= q / (static_cast<scalar>(m) * static_cast<scalar>(m + 1));
        sum  += term;
        if (term <= 1.0e-18 * sum) break;
    }
    const scalar out = 0.5 * ax * sum;
    return (x < 0.0) ? -out : out;
}

// ---------------------------------------------------------------------------
//  The closed forms.
// ---------------------------------------------------------------------------
scalar concentrationClosedForm(PelletGeometry g, scalar phiChar, scalar xi)
{
    requireFiniteModulus(phiChar);
    if (xi < 0.0 || xi > 1.0)
        throw std::runtime_error("pellet: the normalised coordinate must lie"
            " in [0,1] (got " + std::to_string(xi) + ").");
    if (phiChar < tinyModulus) return 1.0;    // no gradient at all

    switch (g)
    {
        case PelletGeometry::slab:
        {
            //  cosh(phi xi)/cosh(phi), written so nothing large is formed:
            //  both numerator and denominator are divided by e^{phi}.
            const scalar e2 = std::exp(-2.0 * phiChar);
            return (std::exp(phiChar * (xi - 1.0))
                  + std::exp(-phiChar * (xi + 1.0))) / (1.0 + e2);
        }
        case PelletGeometry::cylinder:
            return besselI0(phiChar * xi) / besselI0(phiChar);

        case PelletGeometry::sphere:
        {
            //  sinh(phi xi)/(xi sinh phi), same rescaling; the centre is the
            //  removable singularity xi -> 0, where u(0) = phi/sinh(phi).
            const scalar e2   = std::exp(-2.0 * phiChar);
            const scalar denom = 1.0 - e2;
            if (xi < 1.0e-12)
                return 2.0 * phiChar * std::exp(-phiChar) / denom;
            return (std::exp(phiChar * (xi - 1.0))
                  - std::exp(-phiChar * (xi + 1.0))) / (xi * denom);
        }
    }
    return 1.0;
}

scalar effectivenessClosedForm(PelletGeometry g, scalar phiChar)
{
    requireFiniteModulus(phiChar);

    switch (g)
    {
        case PelletGeometry::slab:
        {
            if (phiChar < 1.0e-4)
                return 1.0 - phiChar * phiChar / 3.0;
            return std::tanh(phiChar) / phiChar;
        }
        case PelletGeometry::cylinder:
        {
            if (phiChar < 1.0e-4)
                return 1.0 - phiChar * phiChar / 8.0;
            return 2.0 * besselI1(phiChar) / (phiChar * besselI0(phiChar));
        }
        case PelletGeometry::sphere:
        {
            //  (3/phi)(coth phi - 1/phi) cancels catastrophically for small
            //  phi -- coth phi and 1/phi agree to their leading term -- so the
            //  expansion 1 - phi^2/15 + 2 phi^4/315 - phi^6/1575 is used below
            //  0.1, where its next term is O(1e-9).
            if (phiChar < 0.1)
            {
                const scalar p2 = phiChar * phiChar;
                return 1.0 - p2 / 15.0 + 2.0 * p2 * p2 / 315.0
                     - p2 * p2 * p2 / 1575.0;
            }
            const scalar coth = 1.0 / std::tanh(phiChar);
            return 3.0 * (coth - 1.0 / phiChar) / phiChar;
        }
    }
    return 1.0;
}

// ---------------------------------------------------------------------------
//  The numerical solution.
// ---------------------------------------------------------------------------
PelletSolution solvePellet(PelletGeometry g, scalar phiChar, int nodes)
{
    requireFiniteModulus(phiChar);

    if (nodes < 5)
        throw std::runtime_error("pellet: `nodes` = " + std::to_string(nodes)
            + " is too coarse to discretise a second-order boundary-value"
              " problem; use at least 5 grid points (and far more for a"
              " modulus above 1).");
    if (nodes % 2 == 0)
        throw std::runtime_error("pellet: `nodes` = " + std::to_string(nodes)
            + " is EVEN.  `nodes` counts GRID POINTS, and the effectiveness"
              " factor is the volume integral of the field by Simpson's rule,"
              " which needs an even number of INTERVALS -- so the number of"
              " points must be ODD.  Use " + std::to_string(nodes + 1) + ".");

    const int    N = nodes - 1;               // intervals
    const scalar h = 1.0 / static_cast<scalar>(N);
    const scalar s = static_cast<scalar>(static_cast<int>(g));
    const scalar phi2h2 = phiChar * phiChar * h * h;

    PelletSolution out;
    out.h = h;
    out.xi.resize(nodes);
    for (int j = 0; j < nodes; ++j) out.xi[j] = static_cast<scalar>(j) * h;

    //  THE RESIDUAL.  Central differences, multiplied through by h^2 so every
    //  coefficient is O(1): a residual whose entries scale as 1/h^2 turns an
    //  absolute tolerance into a number compared with nothing.
    //
    //    centre  (xi = 0):  the singular term is removed by L'Hopital and the
    //                       symmetry u'(0) = 0 (ghost node u_{-1} = u_1),
    //                       giving (1+s) u'' = phi^2 u.
    //    interior:          u'' + (s/xi) u' - phi^2 u = 0.
    //    surface (xi = 1):  u = 1, the Dirichlet condition, kept as its own
    //                       residual row so the unknown vector IS the field.
    auto residual = [&](const sVector& u) -> sVector
    {
        sVector F(u.size(), 0.0);
        F[0] = (1.0 + s) * 2.0 * (u[1] - u[0]) - phi2h2 * u[0];
        for (int j = 1; j < N; ++j)
        {
            const scalar xi = static_cast<scalar>(j) * h;
            F[j] = (u[j + 1] - 2.0 * u[j] + u[j - 1])
                 + (s * h / (2.0 * xi)) * (u[j + 1] - u[j - 1])
                 - phi2h2 * u[j];
        }
        F[N] = u[N] - 1.0;
        return F;
    };

    solver::NDOptions opts;
    //  The residual was multiplied through by h^2 above, so its entries are
    //  the O(1) terms the difference equation balances rather than 1/h^2
    //  numbers -- which is what makes an absolute tolerance mean anything
    //  here.  1e-10 sits three to four orders above the round-off floor
    //  (~sqrt(n)*eps from the cancellation in u_{j+1} - 2u_j + u_{j-1}), so
    //  it is reachable at every grid and modulus this solves, and four orders
    //  below the discretisation error, so it is never what limits the answer.
    //
    //  NOT on `solver/Convergence.H`, and stated rather than left to be
    //  noticed: that header is the one home for the OpenFOAM triple and its
    //  normalization, and this Newton is not wired to it -- it is a
    //  single-purpose linear solve with no case-declared control, on the same
    //  footing as the `IsothermalFlash` and `SpeciationSolver` inner Newtons
    //  listed in that ADR's Sec. 4.  Wiring it is a deliberate act, not a
    //  side effect of adding a solver.
    opts.tolerance = 1.0e-10;
    opts.maxIter   = 30;
    //  See the header: the residual is EXACTLY linear in u for a first-order
    //  reaction, so a difference quotient has no truncation error and a small
    //  step only amplifies round-off.
    opts.fdStep       = 1.0e-4;
    opts.backtracking = true;
    //  The residual is a pure function of its argument -- it reads only the
    //  captured grid constants and writes nothing outside its own return
    //  value -- so the finite-difference Jacobian may be built in parallel.
    opts.parallel = true;

    //  The seed is the no-diffusion-limit field, u = 1 everywhere.  It is the
    //  honest starting guess (it IS the answer as phi -> 0) and, the problem
    //  being linear, the Newton reaches the solution from it in one step.
    sVector u0(nodes, 1.0);
    const solver::NDResult res = solver::newtonND(residual, u0, opts);

    out.u                = res.x;
    out.newtonIterations = res.iterations;
    out.newtonResidual   = res.residual;
    out.converged        = res.converged;

    if (!res.converged)
        throw std::runtime_error("pellet: the intraparticle Newton did NOT"
            " converge at phi_char = " + std::to_string(phiChar)
            + " on " + std::to_string(nodes) + " nodes (||F|| = "
            + std::to_string(res.residual) + " after "
            + std::to_string(res.iterations) + " iterations).  The"
              " discretised first-order problem is LINEAR, so this is a"
              " numerical failure and not a physical one -- report it rather"
              " than accepting the last iterate.");

    //  The closed form at the same nodes, and the deviation between them.
    out.uClosedForm.resize(nodes);
    for (int j = 0; j < nodes; ++j)
    {
        out.uClosedForm[j] = concentrationClosedForm(g, phiChar, out.xi[j]);
        out.maxAbsFieldDeviation = std::max(out.maxAbsFieldDeviation,
            std::abs(out.u[j] - out.uClosedForm[j]));
    }

    //  eta by the VOLUME INTEGRAL:  eta = (s+1) INT_0^1 xi^s u dxi, composite
    //  Simpson (O(h^4), so the quadrature is never the limiting error).
    {
        auto integrand = [&](int j)
        {
            return std::pow(out.xi[j], s) * out.u[j];
        };
        scalar sum = integrand(0) + integrand(N);
        for (int j = 1; j < N; ++j)
            sum += ((j % 2) ? 4.0 : 2.0) * integrand(j);
        out.eta = (s + 1.0) * (h / 3.0) * sum;
    }

    //  eta by the SURFACE FLUX:  eta = (s+1) u'(1) / phi_char^2, with u'(1)
    //  from a second-order one-sided difference.  This is an INDEPENDENT route
    //  to the same number -- the integral and the gradient are different
    //  functionals of the same field -- and their agreement is reported rather
    //  than assumed.
    if (phiChar > tinyModulus)
    {
        const scalar dudxi =
            (3.0 * out.u[N] - 4.0 * out.u[N - 1] + out.u[N - 2]) / (2.0 * h);
        out.etaFlux = (s + 1.0) * dudxi / (phiChar * phiChar);
    }
    else
    {
        out.etaFlux = 1.0;   // no gradient: the flux form is 0/0 in the limit
    }

    out.etaClosedForm = effectivenessClosedForm(g, phiChar);
    out.etaRelDeviation =
        std::abs(out.eta - out.etaClosedForm) / std::abs(out.etaClosedForm);
    out.etaVolumeVsFlux =
        (out.eta > 0.0) ? std::abs(out.eta - out.etaFlux) / out.eta : 0.0;

    return out;
}

} // namespace pellet
} // namespace Choupo
