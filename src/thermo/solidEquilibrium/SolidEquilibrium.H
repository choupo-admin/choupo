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
    Choupo::solidEq

Description
    THE ONE SOLID-EQUILIBRIUM INTERFACE, in the production solver form the
    C2 review ratified (2026-08-08, docs/design/solid-equilibrium-spike.md
    section 7, ruling R1).  A solid -- ANY solid -- is a candidate phase
    whose presence is decided by ONE rule:

        either  n = 0  and  ln(IAP/K) <= 0     (absent, subsaturated)
        or      n > 0  and  ln(IAP/K)  = 0     (present, at equilibrium)

    -- the complementarity every solubility problem shares, whatever the
    solid's thermodynamics.  The solid's own MODEL lives behind the `lnSI`
    closure; the model supplies thermodynamics ONLY (its saturation
    residual and its transfer), and this solver owns everything else:
    the active-set decision, the coupled solve, the one-ledger transfer
    discipline, and the appearance/disappearance narration.  The solver
    below knows NO solid by name, no class by kind, and carries not one
    branch that asks what a candidate is -- the spike gate greps the code,
    comments stripped, on every run.

    THE SOLVER, per ruling R1: ACTIVE-SET complementarity around a
    SIMULTANEOUS DAMPED NEWTON on the active equilibrium set.  The
    complementarity stays EXPLICIT -- an outer decision about which solids
    are present, never a smooth surrogate folded into the residuals
    (pedagogically deliberate: a student can watch the set change) -- and
    the coupled state of the active set solves TOGETHER, so the ORDER in
    which solids were registered can never become part of the physics.
    Appearance and disappearance are announced through the caller's event
    sink; a solid model never emits policy or narrative.

    Material leaves the solution through the `remove` closure ONLY -- the
    one ledger.  The double counting the ruling bans is structurally
    impossible here because there is no second remover.

    Migration status: this header is slice S1 of the authorised campaign
    (docs/design/solid-equilibrium-migration.md).  No flash consumes it
    yet and the speciation path is untouched -- those are later slices.
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

//  Active-set complementarity + simultaneous damped Newton (ruling R1).
//  Returns outer iterations used.  Throws if not converged -- a solids
//  answer that has not settled is not an answer, and returning one quietly
//  would be the silent crutch.  `events`, when given, receives the solver's
//  narration: which candidate appeared, which redissolved away, in the
//  order the ACTIVE-SET decision (not registration order) found them.
inline int equilibrate(std::vector<SolidCandidate>& solids, scalar T,
                       int maxOuter = 400, scalar tol = 1e-10,
                       std::vector<std::string>* events = nullptr)
{
    const auto note = [&](const std::string& s)
    { if (events) events->push_back(s); };

    for (int outer = 1; outer <= maxOuter; ++outer)
    {
        //  1. THE ACTIVE-SET DECISION -- the complementarity, explicit.
        //  A candidate is in the active equilibrium set if it is present
        //  (n > 0, must sit on lnSI = 0) or wants to appear (lnSI > tol).
        //  An absent, subsaturated candidate satisfies its half of the
        //  complementarity and stays out of the solve entirely.
        std::vector<std::size_t> act;
        std::vector<scalar> r;
        bool settled = true;
        for (std::size_t i = 0; i < solids.size(); ++i)
        {
            const scalar ri = solids[i].lnSI(T);
            if (solids[i].n > 0.0)
            {
                act.push_back(i); r.push_back(ri);
                if (std::fabs(ri) > tol) settled = false;
            }
            else if (ri > tol)
            {
                act.push_back(i); r.push_back(ri);
                settled = false;
                note("solid '" + solids[i].name + "' appeared (lnSI = "
                     + std::to_string(ri) + " > 0 at n = 0)");
            }
        }
        if (settled) return outer;

        //  2. SIMULTANEOUS DAMPED NEWTON on the active set.  The Jacobian
        //  d lnSI_i / d n_j is probed with small trial transfers, restored
        //  exactly -- the state is only ever moved through `remove`, so a
        //  probe cannot leak material.  Cross terms are what make this
        //  SIMULTANEOUS: forming one solid changes every other's residual
        //  inside the same linear solve, so no candidate's answer depends
        //  on who was registered first.
        const std::size_t m = act.size();
        std::vector<scalar> J(m * m, 0.0);
        for (std::size_t j = 0; j < m; ++j)
        {
            SolidCandidate& sj = solids[act[j]];
            const scalar dnP = std::max(1e-8, 1e-4 * std::max(sj.n, 1.0));
            sj.remove(dnP);
            for (std::size_t i = 0; i < m; ++i)
                J[i * m + j] = (solids[act[i]].lnSI(T) - r[i]) / dnP;
            sj.remove(-dnP);
            if (!(J[j * m + j] < 0.0))
                throw std::runtime_error("solidEq: candidate '" + sj.name
                    + "' does not relax its own saturation (d lnSI/dn = "
                    + std::to_string(J[j * m + j]) + " >= 0) -- forming this "
                    "solid fails to relieve its supersaturation, so the "
                    "candidate's closures are inconsistent with each other.");
        }

        //  Solve J dn = -r by Gaussian elimination with partial pivoting
        //  (m is the number of COEXISTING solids -- small by physics).
        std::vector<scalar> dn(r);
        for (auto& v : dn) v = -v;
        for (std::size_t k = 0; k < m; ++k)
        {
            std::size_t p = k;
            for (std::size_t i = k + 1; i < m; ++i)
                if (std::fabs(J[i * m + k]) > std::fabs(J[p * m + k])) p = i;
            if (std::fabs(J[p * m + k]) < 1e-300)
                throw std::runtime_error("solidEq: singular coupling between "
                    "the active candidates -- two registered solids move the "
                    "same saturation identically, which is the duplicated-"
                    "mechanism shape the architecture bans.");
            if (p != k)
            {
                for (std::size_t c = 0; c < m; ++c)
                    std::swap(J[p * m + c], J[k * m + c]);
                std::swap(dn[p], dn[k]);
            }
            for (std::size_t i = k + 1; i < m; ++i)
            {
                const scalar f = J[i * m + k] / J[k * m + k];
                for (std::size_t c = k; c < m; ++c) J[i * m + c] -= f * J[k * m + c];
                dn[i] -= f * dn[k];
            }
        }
        for (std::size_t k = m; k-- > 0;)
        {
            for (std::size_t c = k + 1; c < m; ++c) dn[k] -= J[k * m + c] * dn[c];
            dn[k] /= J[k * m + k];
        }

        //  3. DAMPED STEP with the n >= 0 clamp.  A candidate driven to
        //  exactly zero leaves the presence half of the complementarity;
        //  the next outer decision re-tests whether it stays out.
        for (std::size_t j = 0; j < m; ++j)
        {
            SolidCandidate& sj = solids[act[j]];
            scalar step = 0.5 * dn[j];
            if (sj.n + step < 0.0) step = -sj.n;
            if (step == 0.0) continue;
            const bool wasPresent = sj.n > 0.0;
            sj.remove(step);
            sj.n += step;
            if (wasPresent && sj.n == 0.0)
                note("solid '" + sj.name + "' redissolved completely "
                     "(n reached 0; the next outer decision re-tests it)");
        }
    }
    throw std::runtime_error("solidEq: complementarity not settled in "
        + std::to_string(maxOuter) + " outer iterations -- the coupled "
        "solids are oscillating; report, do not trust a partial answer.");
}

} // namespace solidEq
} // namespace Choupo
