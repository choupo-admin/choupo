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
    Choupo::solidEq   (SPIKE -- C2, 2026-08-08.  Not yet a production home.)

Description
    THE ONE SOLID-EQUILIBRIUM INTERFACE the C2 ruling calls for, in its
    smallest demonstrable form.  A solid -- ANY solid -- is a candidate
    phase whose presence is decided by ONE rule:

        either  n = 0  and  ln(IAP/K) <= 0     (absent, subsaturated)
        or      n > 0  and  ln(IAP/K)  = 0     (present, at equilibrium)

    -- the complementarity every solubility problem shares, whatever the
    solid's thermodynamics.  The solid's own MODEL lives behind the `lnSI`
    closure: a molecular crystal supplies ln a_w + dG_fus/(R T) from its
    fusion properties (SolidPhase); a salt supplies nu*ln(m gamma) - ln Ksp
    from its dissolution equilibrium; a reactive mineral supplies ln(IAP/K)
    over a SPECIATED solution.  Multiple explicit thermodynamic models, one
    equilibrium architecture, exactly as ruled -- and this header contains
    the test of that claim: the solver below knows NO solid by name, no
    class by kind, and carries not one branch that asks what the candidate
    is.  If serving the three classes had required one, the proposition
    would be FALSIFIED, and this comment would say so instead.

    Material leaves the solution through the `remove` closure ONLY -- the
    one ledger.  The double-counting the ruling bans ("speciation removes
    material" and "solid phase removes material" acting independently on the
    same equilibrium) is structurally impossible here because there is no
    second remover; the spike's negative control demonstrates what that bug
    looks like when reintroduced by hand.

    SPIKE-GRADE, said plainly: header-only; the solver is damped sequential
    complementarity (adequate for the demonstrations' 1-2 coupled solids);
    the production form -- simultaneous Newton over the active set, seeding,
    appearance/disappearance announcements in the run header -- is a REVIEW
    question, deliberately not built.  No flash integration, no migration of
    the speciation path: docs/design/solid-equilibrium-spike.md.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cmath>
#include <functional>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace solidEq {

struct SolidCandidate
{
    std::string name;                            // for REPORTING only --
                                                 // the solver never reads it
    std::function<scalar(scalar T)> lnSI;        // ln(IAP/K) at current state
    std::function<void(scalar dn)> remove;       // move dn mol INTO the solid
                                                 // (negative = redissolve)
    scalar n = 0.0;                              // moles formed so far
};

//  Damped sequential complementarity.  Returns outer iterations used.
//  Throws if not converged -- a solids answer that has not settled is not an
//  answer, and returning one quietly would be the silent crutch.
inline int equilibrate(std::vector<SolidCandidate>& solids, scalar T,
                       int maxOuter = 400, scalar tol = 1e-10)
{
    for (int outer = 1; outer <= maxOuter; ++outer)
    {
        bool settled = true;
        for (auto& s : solids)
        {
            scalar r = s.lnSI(T);
            const bool violates = (r > tol) || (s.n > 0.0 && r < -tol);
            if (!violates) continue;
            settled = false;

            //  One damped secant step on n against lnSI.  The derivative is
            //  probed with a small trial transfer and restored -- the state
            //  is only ever moved through `remove`, so the probe cannot leak
            //  material.
            const scalar dnProbe = std::max(1e-8, 1e-4 * std::max(s.n, 1.0));
            s.remove(dnProbe);
            const scalar r2 = s.lnSI(T);
            s.remove(-dnProbe);
            const scalar slope = (r2 - r) / dnProbe;   // d lnSI / dn  (< 0)
            if (!(slope < 0.0))
                throw std::runtime_error("solidEq: candidate '" + s.name
                    + "' does not relax its own saturation (d lnSI/dn = "
                    + std::to_string(slope) + " >= 0) -- forming this solid "
                    "fails to relieve its supersaturation, so the candidate's "
                    "closures are inconsistent with each other.");

            scalar dn = 0.5 * (-r / slope);            // damped Newton
            if (s.n + dn < 0.0) dn = -s.n;             // dissolve at most all
            s.remove(dn);
            s.n += dn;
        }
        if (settled) return outer;
    }
    throw std::runtime_error("solidEq: complementarity not settled in "
        + std::to_string(maxOuter) + " outer iterations -- the coupled "
        "solids are oscillating; report, do not trust a partial answer.");
}

} // namespace solidEq
} // namespace Choupo
