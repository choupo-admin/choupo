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
    Choupo::EvidencePartition

Description
    fitalpha -- the RELATIVE-VOLATILITY residual of fitParameters(P_bubble),
    and its declared combination with the bubble-pressure residual (C456).

    WHY IT EXISTS.  A bubble-pressure fit asks the equation of state for P at
    (T, x).  For propene + propane under SRK the pressure is nearly blind to
    kij (the vapour pressures dominate it) while the relative volatility
    alpha_12 = (y1/x1)/(y2/x2) -- the quantity a C3 splitter's stage count is
    built on -- moves strongly with it.  So a second residual is offered, on
    alpha, computed from the engine's own bubble point at each (T, x).

    THE OBJECTIVE (declared, no default weight).  The case writes, in its
    `residual` block,

        weights { P wP;  alpha wA;  alphaColumn <name>; }

    and the least-squares objective is

        chi2 = sum_i wP ((P_model,i - P_exp,i)/P_exp,i)^2
             + sum_i wA ((alpha_model,i - alpha_exp,i)/alpha_exp,i)^2

    with alpha_model = (y1/x1)/(y2/x2) from BubblePoint::pressure at the
    point's own T and x, and alpha_exp the dataset column `alphaColumn`.
    Both weights must be written; a weight of 0 drops that family (wP 0 is an
    alpha-only fit).  Absent `weights`, nothing here is active and the
    operation is byte-identical to what it was.

    HOW.  The fit's N points become, per active family, one block of rows
    (P rows first, then alpha rows); every row carries sqrt(weight) so the
    Levenberg-Marquardt loop, the Jacobian and chi2 stay the ones that were.
    The held-out rows are the same blocks with every scale 1, so the held-out
    mean is an UNWEIGHTED relative deviation over the held-out rows of both
    families (and the per-family means are published separately).

    This header is included from FitWeighting.H so that FitParameters.cpp
    needed no new line: lessons cite that file's lines by number.
\*---------------------------------------------------------------------------*/

#ifndef FitAlphaRows_H
#define FitAlphaRows_H

#include "core/Dictionary.H"
#include "core/Types.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <cmath>
#include <limits>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace fitalpha {

struct Plan
{
    bool        active = false;
    scalar      wP = 0.0, wA = 0.0;
    std::string column;
};

//  Per row: the measured alpha (NaN on a pressure row) and sqrt(weight).
struct Rows
{
    sVector alphaExp, scale;
    std::size_t n0 = 0;            // points before stacking
    std::size_t size() const { return scale.size(); }
};

inline const Rows* g_rows = nullptr;   // the rows of the evidence being priced
inline Rows        fitRows, valRows;

inline Plan read(const DictPtr& res, const std::string& kind, bool evalMode)
{
    Plan p;
    if (!res->found("weights")) return p;
    if (kind != "P_bubble")
        throw std::runtime_error("fitParameters: residual.weights (the alpha + P"
            " combination) belongs to kind P_bubble, not " + kind);
    if (evalMode)
        throw std::runtime_error("fitParameters(evaluate): residual.weights is"
            " a fit vocabulary (the alpha residual is not built for evaluate)");
    const DictPtr w = res->subDict("weights");
    for (const char* k : {"P", "alpha", "alphaColumn"})
        if (!w->found(k))
            throw std::runtime_error(std::string("fitParameters: residual.weights"
                " must declare `") + k + "` -- there is no default weight, the"
                " case states what it fits");
    p.wP = w->lookupScalar("P");
    p.wA = w->lookupScalar("alpha");
    p.column = w->lookupWord("alphaColumn");
    if (p.wP < 0.0 || p.wA < 0.0 || (p.wP <= 0.0 && p.wA <= 0.0))
        throw std::runtime_error("fitParameters: residual.weights P and alpha"
            " must be >= 0 and not both 0");
    p.active = true;
    return p;
}

inline std::vector<std::string> wNames(const Plan& p)
{
    return (p.active && p.wA > 0.0) ? std::vector<std::string>{p.column}
                                    : std::vector<std::string>{};
}

//  Concatenate the blocks.  `scaled` false = held-out (every scale 1).
inline void stack(const Plan& p, Rows& rows, sVector& x, sVector& t, sVector& pv,
                  const sVector& alphaData, bool scaled, const char* what)
{
    rows = Rows{};
    if (!p.active) { return; }
    const std::size_t n0 = x.size();
    if (p.wA > 0.0 && alphaData.size() != n0)
        throw std::runtime_error(std::string("fitParameters: the ") + what
            + " evidence has no column `" + p.column + "` on every point (alpha"
              " is read from the dataset; the inline residual.data form carries none)");
    const sVector x0 = x, t0 = t, p0 = pv;
    x.clear(); t.clear(); pv.clear();
    rows.n0 = n0;
    auto block = [&](bool alpha)
    {
        const scalar w = alpha ? p.wA : p.wP;
        for (std::size_t k = 0; k < n0; ++k)
        {
            x.push_back(x0[k]); t.push_back(t0[k]); pv.push_back(p0[k]);
            rows.alphaExp.push_back(alpha ? alphaData[k]
                                          : std::numeric_limits<scalar>::quiet_NaN());
            rows.scale.push_back(scaled ? std::sqrt(w) : 1.0);
        }
    };
    if (p.wP > 0.0) block(false);
    if (p.wA > 0.0) block(true);
    g_rows = &rows;
}

inline bool  isAlphaRow(std::size_t k) { return g_rows && k < g_rows->size() && !std::isnan(g_rows->alphaExp[k]); }
inline scalar scaleOf(std::size_t k)   { return (g_rows && k < g_rows->size()) ? g_rows->scale[k] : 1.0; }

//  relative alpha residual from a bubble-pressure result
inline scalar alphaResidual(const BubblePoint::PressureResult& r, const sVector& x,
                            std::size_t i1, std::size_t i2, std::size_t k)
{
    const scalar a = (r.y[i1] / x[i1]) / (r.y[i2] / x[i2]);
    return (a - g_rows->alphaExp[k]) / g_rows->alphaExp[k];
}

//  the first n0 entries (one per original point), for the tables
inline sVector cut(const sVector& v, const Rows& rows)
{
    if (rows.n0 == 0 || rows.n0 >= v.size()) return v;
    return sVector(v.begin(), v.begin() + static_cast<std::ptrdiff_t>(rows.n0));
}

//  per-family held-out means (unweighted rows)
inline void publish(std::map<std::string, scalar>& diag, const sVector& r)
{
    if (!g_rows || g_rows->size() != r.size()) return;
    scalar sp = 0, sa = 0; std::size_t np = 0, na = 0;
    for (std::size_t k = 0; k < r.size(); ++k)
    {
        if (std::fabs(r[k]) >= 9.99e2) continue;
        if (std::isnan(g_rows->alphaExp[k])) { sp += std::fabs(r[k]); ++np; }
        else                                 { sa += std::fabs(r[k]); ++na; }
    }
    if (np) diag["aad_heldout_P_rel"] = sp / static_cast<scalar>(np);
    if (na) diag["aad_heldout_alpha_rel"] = sa / static_cast<scalar>(na);
}

} // namespace fitalpha
} // namespace Choupo

#endif
