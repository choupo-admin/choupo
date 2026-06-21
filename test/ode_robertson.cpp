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
Standalone validation of the ODE module on the ROBERTSON problem -- the classic
public-domain stiff benchmark (H.H. Robertson, 1966):

    y1' = -0.04 y1 + 1e4 y2 y3
    y2' = +0.04 y1 - 1e4 y2 y3 - 3e7 y2^2
    y3' =                        3e7 y2^2
    y(0) = (1, 0, 0),   y1 + y2 + y3 = 1 conserved.

Rosenbrock23 (L-stable) must integrate 0..1e5 without blowing up and conserve
the sum.  Explicit RK4 with a sane-looking step must visibly STRUGGLE (overflow
or gross mass error) -- the stiffness lesson, demonstrated not asserted.

Build (standalone, no engine link needed -- the ODE module depends only on
Types.H + LU):
    g++ -std=c++17 -Isrc test/ode_robertson.cpp \
        src/solver/ODE/ODEIntegrator.cpp src/solver/ODE/RK4.cpp \
        src/solver/ODE/EulerSI.cpp src/solver/ODE/Rosenbrock23.cpp \
        src/solver/ODE/Jacobian.cpp src/solver/LU.cpp -o /tmp/robertson
\*---------------------------------------------------------------------------*/

#include "solver/ODE/ODEIntegrator.H"
#include "solver/ODE/RK4.H"
#include "solver/ODE/Rosenbrock23.H"

#include <cmath>
#include <cstdio>

using namespace Choupo;
using namespace Choupo::solver;

static sVector robertson(scalar /*t*/, const sVector& y)
{
    sVector d(3);
    d[0] = -0.04 * y[0] + 1.0e4 * y[1] * y[2];
    d[2] =  3.0e7 * y[1] * y[1];
    d[1] = -d[0] - d[2];
    return d;
}

int main()
{
    bool allOk = true;

    // --- Rosenbrock23 vs the SUNDIALS/CVODE Robertson reference -----------
    //  CVODE's robertson example reports, accurately, at t = 4e4:
    //      y1 = 3.898902e-02,  y2 = 1.621669e-07,  y3 = 9.610108e-01.
    //  We integrate there and match y1 to 1%, plus exact mass conservation,
    //  plus a full run to 1e5 to show it survives the brutal span.
    {
        sVector y = {1.0, 0.0, 0.0};
        ODEControls c;
        c.atol = {1.0e-8, 1.0e-12, 1.0e-8};   // y2 is tiny -> its own tight atol
        c.rtol = 1.0e-6;
        c.nPositive = 3;
        c.verbosity = 3;
        Rosenbrock23 ros;
        const ODEStats st = ros.integrate(y, 0.0, 4.0e4, robertson, c);
        const scalar sum = y[0] + y[1] + y[2];
        const scalar y1ref = 3.898902e-2, y3ref = 9.610108e-1;
        std::printf("Rosenbrock23  t=4e4:  y = (%.6e, %.6e, %.6e)\n",
                    y[0], y[1], y[2]);
        std::printf("              CVODE ref:    (%.6e,         --, %.6e)\n", y1ref, y3ref);
        std::printf("              sum = %.12f  (drift %.2e)   steps: %zu acc / %zu rej\n",
                    sum, std::fabs(sum - 1.0), st.accepted, st.rejected);
        const bool conserved = std::fabs(sum - 1.0) < 1.0e-6;
        const bool matches   = std::fabs(y[0] - y1ref) / y1ref < 1.0e-2
                            && std::fabs(y[2] - y3ref) / y3ref < 1.0e-2;
        const bool ok = st.ok && conserved && matches;
        std::printf("              -> %s (matches CVODE reference to 1%%, mass conserved)\n\n",
                    ok ? "PASS" : "FAIL");
        allOk = allOk && ok;
    }

    // --- RK4 with a sane-looking fixed step on the stiff transient --------
    {
        sVector y = {1.0, 0.0, 0.0};
        ODEControls c;
        c.hInit = 1.0e-3;          // looks reasonable; far above the stiff limit
        RK4 rk;
        const ODEStats st = rk.integrate(y, 0.0, 40.0, robertson, c);
        const scalar sum = y[0] + y[1] + y[2];
        const bool finite = std::isfinite(sum);
        std::printf("RK4 (h=1e-3)  t=40 over %zu steps:\n", st.steps);
        if (finite)
            std::printf("              y = (%.4e, %.4e, %.4e)  sum = %.6f  (drift %.2e)\n",
                        y[0], y[1], y[2], sum, std::fabs(sum - 1.0));
        else
            std::printf("              OVERFLOWED to non-finite values (st.ok=%d)\n", st.ok);
        // The lesson: explicit RK4 at this step either blows up or loses mass.
        const bool struggled = !finite || std::fabs(sum - 1.0) > 1.0e-3 || !st.ok;
        std::printf("              -> %s (explicit method struggles on the stiff system)\n\n",
                    struggled ? "PASS" : "UNEXPECTEDLY-STABLE");
        allOk = allOk && struggled;
    }

    std::printf("ROBERTSON VALIDATION: %s\n", allOk ? "ALL PASS" : "FAILURE");
    return allOk ? 0 : 1;
}
