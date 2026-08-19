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
    Choupo::pellet

    THE SINGLE PELLET: an isothermal, first-order reaction diffusing into one
    porous catalyst particle.  This is the physics half of the Thiele slice;
    the props op is a bench over it, and the four reactors that today assume
    eta = 1 (`reactor/CatalystPellet.H`) are the intended second caller.

    THE EQUATION.  With xi the normalised coordinate measured from the pellet
    CENTRE (xi = r/R for a sphere or a cylinder, x/L for a slab sealed on its
    edges) and u = c/c_s the concentration normalised on the EXTERNAL SURFACE
    value:

        u'' + (s/xi) u' = phi_char^2 u,     u'(0) = 0,   u(1) = 1,

    with the shape factor s = 0 (slab), 1 (cylinder), 2 (sphere) and

        phi_char = <characteristic dimension> * sqrt(k / D_eff).

    TWO MODULI TRAVEL TOGETHER, and confusing them is the classical error, so
    both are named and both are published:

      * `phi_char` -- built on the characteristic dimension (the half-thickness
        L of a slab, the radius R of a cylinder or a sphere).  It is the
        modulus the differential equation above is written in.
      * `phi`      -- the GENERALISED (Aris) modulus, built on the
        volume-to-surface length Lambda = V_p/S_p:  L, R/2, R/3.  It is the
        modulus in which the three geometries nearly COLLAPSE onto one eta(phi)
        curve, and it is the one `reactor/CatalystPellet.H` already quotes:
        eta = (1/phi)[1/tanh(3 phi) - 1/(3 phi)] for the sphere.

    THE ORACLE IS THE POINT.  First-order isothermal has a CLOSED FORM in all
    three geometries, so the numerical answer is not merely produced -- it is
    CHECKED, point by point, against something nobody fitted:

        slab      u = cosh(phi_char xi)/cosh(phi_char)
                  eta = tanh(phi_char)/phi_char
        cylinder  u = I0(phi_char xi)/I0(phi_char)
                  eta = 2 I1(phi_char)/(phi_char I0(phi_char))
        sphere    u = sinh(phi_char xi)/(xi sinh(phi_char))
                  eta = (3/phi_char)[1/tanh(phi_char) - 1/phi_char]

    The modified Bessel functions are the ascending power series -- every term
    POSITIVE, so there is no cancellation and the series is accurate to the
    last bit over the whole range this solves.  C++17's `std::cyl_bessel_i`
    would have been shorter and is deliberately NOT used: libc++ does not
    provide the special-function set, so the WASM build (Emscripten) would
    fail to compile, and the GUI is exactly where this slice is going.

    THE NUMERICS ARE HAND-ROLLED AND VISIBLE: second-order central differences
    on a uniform grid, assembled as a residual vector and handed to the
    existing `solver::newtonND` (finite-difference Jacobian + LU with partial
    pivoting).  No new dependency and no new solver.  The residual is
    multiplied through by h^2 so every coefficient is O(1) -- a residual whose
    entries are 1/h^2 makes an absolute convergence tolerance a number compared
    with nothing.

    WHY A COARSE FINITE-DIFFERENCE STEP IS RIGHT HERE.  For a FIRST-ORDER
    reaction the residual is exactly LINEAR in u, so the difference quotient
    carries no truncation error at all and the only error is round-off, which
    a SMALL step amplifies.  `fdStep` is therefore set well above the
    general-purpose default.  If this is ever extended to order n != 1 that
    reasoning lapses and the step must be revisited.

    WHAT IS NOT MODELLED, named rather than implied:

      * NON-ISOTHERMAL pellets.  The energy equation coupled through Arrhenius
        gives the Prater/gamma multiplicity -- up to three eta for one phi, and
        eta > 1.  A Newton finds whichever root the initial guess is nearest,
        which is exactly the failure this project refuses (a plausible number
        at exit 0); it needs continuation and must be reported as a SET.  Out
        of the first slice, deliberately.
      * ORDERS other than first.  There is then no closed form, hence no
        oracle, and the generalised modulus stops collapsing the geometries.
      * EXTERNAL mass transfer.  c_s is taken as the bulk concentration; the
        external film is a separate resistance and no case declares one.
      * A DISTRIBUTION of pellet sizes.  One pellet, one dimension.
\*---------------------------------------------------------------------------*/

#pragma once

#include "Catalyst.H"

#include "core/Types.H"

namespace Choupo {
namespace pellet {

//  Lambda/<characteristic dimension>: 1 (slab), 1/2 (cylinder), 1/3 (sphere).
//  The ONE place the two moduli are related, so they cannot drift apart.
scalar generalisedModulusFactor(PelletGeometry g);

inline scalar generalisedModulus(PelletGeometry g, scalar phiChar)
{
    return phiChar * generalisedModulusFactor(g);
}

inline scalar characteristicModulus(PelletGeometry g, scalar phi)
{
    return phi / generalisedModulusFactor(g);
}

// ---- The closed forms (the ORACLE) -----------------------------------------

//  u(xi) = c/c_s from the analytical solution.  `xi` in [0,1].
scalar concentrationClosedForm(PelletGeometry g, scalar phiChar, scalar xi);

//  The effectiveness factor from the analytical solution.
scalar effectivenessClosedForm(PelletGeometry g, scalar phiChar);

//  Modified Bessel functions of the first kind, ascending series.  Exposed so
//  the cylinder's closed form is readable from outside and testable on its
//  own; `x` is capped (see the .cpp) well beyond any teaching range.
scalar besselI0(scalar x);
scalar besselI1(scalar x);

// ---- The numerical solution ------------------------------------------------

struct PelletSolution
{
    sVector xi;                 // the grid, 0 (centre) .. 1 (surface)
    sVector u;                  // c/c_s, NUMERICAL
    sVector uClosedForm;        // c/c_s, ANALYTICAL, at the same nodes

    scalar  eta            = 0.0;   // from the volume integral of u (Simpson)
    scalar  etaFlux        = 0.0;   // from the surface gradient (independent)
    scalar  etaClosedForm  = 0.0;

    scalar  maxAbsFieldDeviation = 0.0;   // max |u - uClosedForm| over the grid
    scalar  etaRelDeviation      = 0.0;   // |eta - etaClosedForm|/etaClosedForm
    scalar  etaVolumeVsFlux      = 0.0;   // |eta - etaFlux|/eta

    int     newtonIterations = 0;
    scalar  newtonResidual   = 0.0;
    bool    converged        = false;

    scalar  h = 0.0;            // grid spacing
};

//  Solve the BVP on `nodes` grid points (nodes = intervals + 1, and it must be
//  ODD so Simpson's rule sees an even number of intervals).  Throws, naming
//  the reason, on an unusable grid or a non-converged Newton.
PelletSolution solvePellet(PelletGeometry g, scalar phiChar, int nodes);

} // namespace pellet
} // namespace Choupo
