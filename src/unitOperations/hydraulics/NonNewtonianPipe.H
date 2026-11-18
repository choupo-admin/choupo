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
-------------------------------------------------------------------------------
Namespace
    Choupo::nonNewtonianPipe

Description
    THE LAMINAR PRESSURE DROP OF A NON-NEWTONIAN LIQUID IN A CIRCULAR PIPE, from
    the liquid's flow curve (DEV.md 4c C421 (7), R7 and R9; Chhabra & Richardson,
    Non-Newtonian Flow and Applied Rheology, 2nd ed., Ch. 3).  Used by `pipe`.

    THE EQUATION.  For a time-independent fluid whose shear rate is a function of
    the shear stress alone, gamma = f(tau), with no wall slip, the mean velocity
    in a pipe of radius R at a wall shear stress tau_w is, exactly (eq. 3.46,
    p. 124-125, the generalised Rabinowitsch-Mooney integral):

        V = ( R / tau_w^3 ) * integral_{tau_y}^{tau_w}  tau^2 f(tau)  d tau        [m/s]

    (f = 0 below the yield stress tau_y: the plug).  The wall stress for a given
    flow is the root of this, and the pressure drop follows from the force
    balance on the fluid (eq. 3.2, p. 111):  -dP/L = 4 tau_w / D.  It needs no
    model: the flow curve's own inverse tau -> gamma is integrated, by composite
    Gauss-Legendre on ln(tau - tau_y), with a breakpoint at every row.  The
    part of the integral from stresses below the lowest measured rate is taken
    from the chord of the curve's first segment, because the integral needs the
    curve from zero and the book is explicit that a table does not give it; the
    share of the flow it carries is returned, so the pipe prints it.

    THE FRICTION FACTOR AND THE REYNOLDS NUMBER (Metzner & Reed, 1955):
        f   = tau_w / (rho V^2 / 2),            laminar f = 16 / Re_MR   (eq. 3.56, p. 127)
        Re_MR = rho V^(2-n') D^n' / (8^(n'-1) m')   (eq. 3.57)  = 8 rho V^2 / tau_w
        n'  = d ln tau_w / d ln (8V/D)               (eq. 2.20; computed pointwise
                                                      from the laminar relation itself)
        m'  = tau_w / (8V/D)^n'
    and the laminar relation holds up to Re_MR = 2100, "the widely accepted figure
    ... for time-independent fluids characterised in terms of n'" (p. 133).

    TURBULENT FLOW IS REFUSED unless the case declares a method (R9).  The one
    method this slice carries is Dodge & Metzner (1959), eqs. 3.70-3.73 (p. 138):

        1/sqrt(f) = ( 4 / n'^0.75 ) log10( Re_MR f^((2-n')/2) ) - 0.4 / n'^1.2

    on the book's stated data range 2900 <= Re_MR <= 36000, 0.36 <= n' <= 1, with
    n' and m' taken at the PREVAILING wall stress from the laminar relation (the
    Metzner-Reed route, p. 151); the book's own warning is printed: the methods
    disagree by up to +-50 % (p. 150-151).  Outside the range, or between 2100 and
    2900, the pipe refuses.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"
#include "thermo/transport/FlowCurve.H"

#include <string>

namespace Choupo {
namespace nonNewtonianPipe {

//  Mean velocity at a wall stress (the integral above).  `tailShare` (when given)
//  receives the share of V that comes from stresses whose shear rate lies below
//  the curve's authorised domain (the chord below the lowest row).
scalar meanVelocity(const rheology::FlowCurve& c, scalar D, scalar tauWall, scalar* tailShare = nullptr);

//  The velocity of the plug of a yield-stress fluid (r < R_p = R tau_y / tau_w):
//  V_p = (R / tau_w) * integral_{tau_y}^{tau_w} f(tau) d tau  (the same derivation as eq. 3.46;
//  the book's eq. 3.40 for Herschel-Bulkley); 0 for a fluid without a yield stress.
scalar plugVelocity(const rheology::FlowCurve& c, scalar D, scalar tauWall);

//  The wall stress that carries the mean velocity V (the root of the above);
//  throws when the flow is not reachable (a yield stress that never yields is not
//  an issue: any V > 0 has a root).
scalar wallStress(const rheology::FlowCurve& c, scalar D, scalar V);

//  n' = d ln tau_w / d ln (8V/D) along the laminar relation, at V (central, 1 %).
scalar nPrime(const rheology::FlowCurve& c, scalar D, scalar V);

//  The Dodge-Metzner friction factor (eq. 3.73) for a given Re_MR and n': the
//  implicit equation solved by bisection.
scalar dodgeMetznerF(scalar ReMR, scalar nPrime);

} // namespace nonNewtonianPipe
} // namespace Choupo
