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
File
    IPParameters.H

Description
    Every named constant of the interior-point optimizer, with the source of
    its value (docs/design/interior-point.md sec. 2.13; Theory Guide
    sec:ip-termination).  None is a dictionary key: the run header prints the
    table, so a student sees the numbers the run used.

    L1 = Wachter & Biegler, "On the implementation of an interior-point filter
    line-search algorithm for large-scale nonlinear programming", Math. Prog.
    106 (2006) 25-57, read as the preprint (optimization-online 2004/03/836, 19
    March 2004): the page numbers and equation numbers cited are THE
    PREPRINT's, the journal's are not verified.  "Choupo's choice" marks a
    value the source leaves free.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <ostream>

namespace Choupo::solver
{

struct IPParameters
{
    // ---- termination and the barrier (L1 p. 9, eq. (5)-(7)) ----------------
    scalar tol           = 1.0e-8;    //- overall tolerance on E_0, L1 p. 9
    scalar mu0           = 0.1;       //- initial barrier parameter, L1 p. 9
    scalar kappaEps      = 10.0;      //- mu is lowered when E_mu <= kappaEps mu, L1 p. 9
    scalar kappaMu       = 0.2;       //- linear decrease factor of mu, L1 (7), p. 9
    scalar thetaMu       = 1.5;       //- superlinear exponent of mu, L1 (7), p. 9
    scalar tauMin        = 0.99;      //- fraction to the boundary tau = max(tauMin, 1 - mu), L1 p. 9
    scalar kappaSigma    = 1.0e10;    //- the dual variables stay within kappaSigma of mu/slack, L1 (16), p. 5
    scalar sMax          = 100.0;     //- multiplier average above which E_mu is scaled, L1 p. 3

    // ---- the filter line search (L1 sec. 2.3, p. 9) -------------------------
    scalar gammaTheta    = 1.0e-5;    //- margin in theta, L1 (18), p. 9
    scalar gammaPhi      = 1.0e-5;    //- margin in phi, L1 (18), p. 9
    scalar delta         = 1.0;       //- switching condition, L1 (19), p. 9
    scalar sTheta        = 1.1;       //- exponent of theta in (19), L1 p. 9
    scalar sPhi          = 2.3;       //- exponent of the slope in (19), L1 p. 9
    scalar etaPhi        = 1.0e-4;    //- Armijo factor, L1 (20), p. 9
    scalar gammaAlpha    = 0.05;      //- safety factor of the smallest step, L1 (23), p. 9
    scalar thetaMaxFactor = 1.0e4;    //- theta_max = 1e4 max(1, theta(x0)), L1 p. 9
    scalar thetaMinFactor = 1.0e-4;   //- theta_min = 1e-4 max(1, theta(x0)), L1 p. 9

    // ---- Algorithm IC, the inertia correction (L1 sec. 3.1, p. 10) ----------
    scalar dwMin         = 1.0e-20;   //- smallest Hessian regularisation tried
    scalar dw0Bar        = 1.0e-4;    //- first trial when none was needed before
    scalar dwMax         = 1.0e40;    //- above this the step is abandoned
    scalar dcBar         = 1.0e-8;    //- constraint regularisation scale
    scalar kappaWPlusBar = 100.0;     //- growth of dw when none was needed before
    scalar kappaWPlus    = 8.0;       //- growth of dw otherwise
    scalar kappaWMinus   = 1.0 / 3.0; //- the next first trial is kappaWMinus times the last dw
    scalar kappaC        = 0.25;      //- dc = dcBar mu^kappaC

    // ---- the restoration phase (L1 sec. 3.3) --------------------------------
    scalar rho           = 1000.0;    //- weight of the violation in the restoration objective, sec. 3.3.1
    scalar kappaResto    = 0.9;       //- the phase ends when theta <= kappaResto theta(x_R), sec. 3.3
    std::size_t restorationMaxIterations = 1000;  //- Choupo's choice: the inner run's own limit

    // ---- the damping of a one-sided bound (L1 sec. 3.7) ---------------------
    scalar kappaD        = 1.0e-4;

    // ---- the start (L1 sec. 3.5, 3.6, 3.8; eq. (35), (36)) ------------------
    //  L1 (35) relaxes every bound outward by 1e-8 max(1, |bound|).  Choupo's
    //  default is 0, a MEASURED deviation: the relaxed problem is not the one
    //  asked for.  On HS13 (a cusp at the optimum) it moves the optimum by 6e-3
    //  in f; on HS116 (multipliers near 1e5) by 9e-4; and the returned point
    //  violates a constraint by up to 1e-8 max(1, |bound|), above the 1e-8 the
    //  tests demand.  The fraction-to-the-boundary rule keeps every iterate
    //  strictly inside the original bounds without it.  The option stays, so a
    //  run can reproduce the source's setting (IPOptions::relaxBounds,
    //  IPParameters::boundRelax = 1e-8).
    scalar boundRelax    = 0.0;
    scalar kappa1        = 1.0e-2;    //- x0 is pushed inside by kappa1 max(1, |bound|), (35)
    scalar kappa2        = 1.0e-2;    //-   or by kappa2 times the width of the box, (35)
    scalar lambdaMax     = 1.0e3;     //- a least-squares multiplier above this is dropped, (36)
    scalar gMax          = 100.0;     //- gradients of f and of each c_j at x0 are scaled down to this, sec. 3.8

    // ---- Choupo's choices (the source leaves them free) ---------------------
    std::size_t maxIterations = 3000; //- iteration limit of an ordinary run
    scalar tinyStepFactor = 10.0;     //- a step below tinyStepFactor eps twice at mu = tol/10 stops the run, L1 sec. 3.9

    //- The table of the run header: name, value, source.
    void print(std::ostream& os) const;
};

} // namespace Choupo::solver
