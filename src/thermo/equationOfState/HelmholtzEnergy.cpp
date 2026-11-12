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
\*---------------------------------------------------------------------------*/

#include "HelmholtzEnergy.H"

#include <cmath>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {
namespace helmholtz {

namespace {

// The non-analytic terms raise (delta - 1)^2 to fractional powers whose
// second derivative is singular AT delta = 1 exactly (it is finite on
// either side and the product that enters alpha_dd stays finite).  The ONE
// numerical guard of the kernel: an evaluation exactly on the critical
// isochore is taken a hair off it.  It moves no published check value (none
// sits on delta = 1) and is stated here rather than hidden.
scalar offCriticalIsochore(scalar delta)
{
    const scalar eps = 1.0e-12;
    return std::fabs(delta - 1.0) < eps ? 1.0 + eps : delta;
}

} // namespace

// ===========================================================================
//  ONE TERM, ONE BLOCK.  Each block states its equation and returns alpha
//  and the five partial derivatives that every property relation needs.
// ===========================================================================
Derivs TermGroup::term(std::size_t k, scalar delta, scalar tau) const
{
    Derivs r;
    const scalar nk = n[k];

    if (ideal)
    {
        // -------------------------------------------------------------------
        //  IDEAL  power:  n tau^t
        //    a_t  = n t tau^(t-1)       a_tt = n t (t-1) tau^(t-2)
        //  (no delta dependence: the ideal gas has no density term but the
        //   ln(delta) that ReducedHelmholtz::ideal adds once)
        // -------------------------------------------------------------------
        if (type == "power")
        {
            const scalar tk = t[k];
            r.a    = nk * std::pow(tau, tk);
            r.a_t  = nk * tk * std::pow(tau, tk - 1.0);
            r.a_tt = nk * tk * (tk - 1.0) * std::pow(tau, tk - 2.0);
            return r;
        }
        // -------------------------------------------------------------------
        //  IDEAL  planckEinstein:  n ln(1 - exp(-gamma tau))
        //    the vibrational (Planck-Einstein) contribution of one mode of
        //    reduced characteristic temperature gamma = theta / T_c
        //    a_t  =  n gamma e / (1 - e)            e = exp(-gamma tau)
        //    a_tt = -n gamma^2 e / (1 - e)^2
        // -------------------------------------------------------------------
        if (type == "planckEinstein")
        {
            const scalar g = gamma[k];
            const scalar e = std::exp(-g * tau);
            r.a    = nk * std::log(1.0 - e);
            r.a_t  = nk * g * e / (1.0 - e);
            r.a_tt = -nk * g * g * e / ((1.0 - e) * (1.0 - e));
            return r;
        }
        // -------------------------------------------------------------------
        //  IDEAL  lead:  a1 + a2 tau     (n = (a1 a2); the two constants
        //    that fix the zeros of energy and entropy)
        //  IDEAL  logTau:  a3 ln(tau)    a_t = a3/tau, a_tt = -a3/tau^2
        //  Both are carried as power terms with t = 0, 1 (lead) and handled
        //  by the reader; logTau is its own block:
        // -------------------------------------------------------------------
        if (type == "logTau")
        {
            r.a    = nk * std::log(tau);
            r.a_t  = nk / tau;
            r.a_tt = -nk / (tau * tau);
            return r;
        }
        throw std::logic_error("helmholtz: unknown ideal term type " + type);
    }

    // (the non-analytic terms carry no d, t columns)
    const scalar dk = d.empty() ? 0.0 : d[k];
    const scalar tk = t.empty() ? 0.0 : t[k];

    // -----------------------------------------------------------------------
    //  RESIDUAL  power:  X = n delta^d tau^t
    //    a_d  = X d/delta                 a_dd = X d (d-1)/delta^2
    //    a_t  = X t/tau                   a_tt = X t (t-1)/tau^2
    //    a_dt = X d t/(delta tau)
    //  (written with explicit powers, not X/delta, so delta -> 0 is finite)
    // -----------------------------------------------------------------------
    if (type == "power")
    {
        const scalar tt = std::pow(tau, tk);
        r.a    = nk * std::pow(delta, dk) * tt;
        r.a_d  = nk * dk * std::pow(delta, dk - 1.0) * tt;
        r.a_dd = dk == 0.0 || dk == 1.0 ? 0.0
               : nk * dk * (dk - 1.0) * std::pow(delta, dk - 2.0) * tt;
        r.a_t  = nk * tk * std::pow(delta, dk) * std::pow(tau, tk - 1.0);
        r.a_tt = nk * tk * (tk - 1.0) * std::pow(delta, dk) * std::pow(tau, tk - 2.0);
        r.a_dt = nk * dk * tk * std::pow(delta, dk - 1.0) * std::pow(tau, tk - 1.0);
        return r;
    }

    // -----------------------------------------------------------------------
    //  RESIDUAL  exponential:  n delta^d tau^t exp(-delta^c)
    //    with  E = exp(-delta^c),  g = d - c delta^c
    //    a_d  = n tau^t E delta^(d-1) g
    //    a_dd = n tau^t E delta^(d-2) [ g (g - 1) - c^2 delta^c ]
    //  (g - 1 is computed as (d - 1) - c delta^c: for d = 1 at a small delta,
    //   forming g first and subtracting 1 cancels every digit of c delta^c)
    //    a_t  = n t delta^d tau^(t-1) E
    //    a_tt = n t (t-1) delta^d tau^(t-2) E
    //    a_dt = n t tau^(t-1) E delta^(d-1) g
    // -----------------------------------------------------------------------
    if (type == "exponential")
    {
        const scalar ck = c[k];
        const scalar dc = std::pow(delta, ck);
        const scalar E  = std::exp(-dc);
        const scalar g  = dk - ck * dc;
        const scalar g1 = (dk - 1.0) - ck * dc;          // g - 1, without cancellation
        const scalar tt = std::pow(tau, tk);
        r.a    = nk * std::pow(delta, dk) * tt * E;
        r.a_d  = nk * tt * E * std::pow(delta, dk - 1.0) * g;
        r.a_dd = nk * tt * E * std::pow(delta, dk - 2.0) * (g * g1 - ck * ck * dc);
        r.a_t  = nk * tk * std::pow(delta, dk) * std::pow(tau, tk - 1.0) * E;
        r.a_tt = nk * tk * (tk - 1.0) * std::pow(delta, dk) * std::pow(tau, tk - 2.0) * E;
        r.a_dt = nk * tk * std::pow(tau, tk - 1.0) * E * std::pow(delta, dk - 1.0) * g;
        return r;
    }

    // -----------------------------------------------------------------------
    //  RESIDUAL  gaussian (bell-shaped):
    //      X = n delta^d tau^t exp(-alpha (delta-eps)^2 - beta (tau-gamma)^2)
    //    with  fd = d/delta - 2 alpha (delta-eps),  ft = t/tau - 2 beta (tau-gamma)
    //    a_d  = X fd                 a_dd = X (fd^2 - d/delta^2 - 2 alpha)
    //    a_t  = X ft                 a_tt = X (ft^2 - t/tau^2  - 2 beta)
    //    a_dt = X fd ft
    // -----------------------------------------------------------------------
    if (type == "gaussian")
    {
        const scalar al = alpha[k], be = beta[k], ga = gamma[k], ep = epsilon[k];
        const scalar X  = nk * std::pow(delta, dk) * std::pow(tau, tk)
                        * std::exp(-al * (delta - ep) * (delta - ep)
                                   - be * (tau - ga) * (tau - ga));
        const scalar fd = dk / delta - 2.0 * al * (delta - ep);
        const scalar ft = tk / tau   - 2.0 * be * (tau - ga);
        r.a    = X;
        r.a_d  = X * fd;
        r.a_dd = X * (fd * fd - dk / (delta * delta) - 2.0 * al);
        r.a_t  = X * ft;
        r.a_tt = X * (ft * ft - tk / (tau * tau) - 2.0 * be);
        r.a_dt = X * fd * ft;
        return r;
    }

    // -----------------------------------------------------------------------
    //  RESIDUAL  nonAnalytic (the critical-region terms, IAPWS R6-95 Eq. 6,
    //  terms 55-56; derivatives as the release's Table 5):
    //      term  = n Delta^b delta psi
    //      theta = (1 - tau) + A [(delta-1)^2]^(1/(2 beta))
    //      Delta = theta^2 + B [(delta-1)^2]^a
    //      psi   = exp(-C (delta-1)^2 - D (tau-1)^2)
    //    dDelta/ddelta   = (delta-1) { A theta (2/beta) [(delta-1)^2]^(1/(2beta)-1)
    //                                  + 2 B a [(delta-1)^2]^(a-1) }
    //    d2Delta/ddelta2 = dDelta/ddelta / (delta-1) + (delta-1)^2 {
    //                        4 B a (a-1) [(delta-1)^2]^(a-2)
    //                      + 2 A^2 (1/beta)^2 ([(delta-1)^2]^(1/(2beta)-1))^2
    //                      + A theta (4/beta) (1/(2beta) - 1) [(delta-1)^2]^(1/(2beta)-2) }
    //    D_b  = Delta^b:
    //      dD_b/ddelta    = b Delta^(b-1) dDelta/ddelta
    //      d2D_b/ddelta2  = b { Delta^(b-1) d2Delta/ddelta2 + (b-1) Delta^(b-2) (dDelta/ddelta)^2 }
    //      dD_b/dtau      = -2 theta b Delta^(b-1)
    //      d2D_b/dtau2    = 2 b Delta^(b-1) + 4 theta^2 b (b-1) Delta^(b-2)
    //      d2D_b/ddeltadtau = -A b (2/beta) Delta^(b-1) (delta-1) [(delta-1)^2]^(1/(2beta)-1)
    //                         - 2 theta b (b-1) Delta^(b-2) dDelta/ddelta
    //    psi_d = -2 C (delta-1) psi        psi_dd = (2 C (delta-1)^2 - 1) 2 C psi
    //    psi_t = -2 D (tau-1) psi          psi_tt = (2 D (tau-1)^2 - 1) 2 D psi
    //    psi_dt = 4 C D (delta-1)(tau-1) psi
    // -----------------------------------------------------------------------
    if (type == "nonAnalytic")
    {
        const scalar dl = offCriticalIsochore(delta);
        const scalar a = na[k], b = nb[k], B = nB[k], C = nC[k], D = nD[k];
        const scalar A = nA[k], be = beta[k];
        const scalar dm  = dl - 1.0;
        const scalar dm2 = dm * dm;
        const scalar theta = (1.0 - tau) + A * std::pow(dm2, 1.0 / (2.0 * be));
        const scalar Delta = theta * theta + B * std::pow(dm2, a);
        const scalar psi   = std::exp(-C * dm2 - D * (tau - 1.0) * (tau - 1.0));

        const scalar dDelta_d = dm * (A * theta * (2.0 / be)
                                      * std::pow(dm2, 1.0 / (2.0 * be) - 1.0)
                                    + 2.0 * B * a * std::pow(dm2, a - 1.0));
        const scalar d2Delta_d = dDelta_d / dm + dm2 * (
              4.0 * B * a * (a - 1.0) * std::pow(dm2, a - 2.0)
            + 2.0 * A * A * (1.0 / be) * (1.0 / be)
                  * std::pow(std::pow(dm2, 1.0 / (2.0 * be) - 1.0), 2.0)
            + A * theta * (4.0 / be) * (1.0 / (2.0 * be) - 1.0)
                  * std::pow(dm2, 1.0 / (2.0 * be) - 2.0));

        const scalar Db     = std::pow(Delta, b);
        const scalar Db_d   = b * std::pow(Delta, b - 1.0) * dDelta_d;
        const scalar Db_dd  = b * (std::pow(Delta, b - 1.0) * d2Delta_d
                                 + (b - 1.0) * std::pow(Delta, b - 2.0) * dDelta_d * dDelta_d);
        const scalar Db_t   = -2.0 * theta * b * std::pow(Delta, b - 1.0);
        const scalar Db_tt  = 2.0 * b * std::pow(Delta, b - 1.0)
                            + 4.0 * theta * theta * b * (b - 1.0) * std::pow(Delta, b - 2.0);
        const scalar Db_dt  = -A * b * (2.0 / be) * std::pow(Delta, b - 1.0) * dm
                                  * std::pow(dm2, 1.0 / (2.0 * be) - 1.0)
                            - 2.0 * theta * b * (b - 1.0) * std::pow(Delta, b - 2.0) * dDelta_d;

        const scalar psi_d  = -2.0 * C * dm * psi;
        const scalar psi_dd = (2.0 * C * dm2 - 1.0) * 2.0 * C * psi;
        const scalar psi_t  = -2.0 * D * (tau - 1.0) * psi;
        const scalar psi_tt = (2.0 * D * (tau - 1.0) * (tau - 1.0) - 1.0) * 2.0 * D * psi;
        const scalar psi_dt = 4.0 * C * D * dm * (tau - 1.0) * psi;

        r.a    = nk * Db * dl * psi;
        r.a_d  = nk * (Db * (psi + dl * psi_d) + Db_d * dl * psi);
        r.a_dd = nk * (Db * (2.0 * psi_d + dl * psi_dd)
                     + 2.0 * Db_d * (psi + dl * psi_d) + Db_dd * dl * psi);
        r.a_t  = nk * dl * (Db_t * psi + Db * psi_t);
        r.a_tt = nk * dl * (Db_tt * psi + 2.0 * Db_t * psi_t + Db * psi_tt);
        r.a_dt = nk * (Db * (psi_t + dl * psi_dt) + dl * Db_d * psi_t
                     + Db_t * (psi + dl * psi_d) + Db_dt * dl * psi);
        return r;
    }

    throw std::logic_error("helmholtz: unknown residual term type " + type);
}

Derivs TermGroup::sum(scalar delta, scalar tau) const
{
    Derivs s;
    for (std::size_t k = 0; k < size(); ++k) s += term(k, delta, tau);
    return s;
}

// ===========================================================================
//  Reading the record
// ===========================================================================
namespace {

std::vector<scalar> column(const DictPtr& g, const std::string& key,
                           const std::string& where, std::size_t nWant)
{
    if (!g->found(key))
        throw std::runtime_error(where + ": missing column '" + key + "'");
    std::vector<scalar> v = g->lookupList(key);
    if (v.size() != nWant)
        throw std::runtime_error(where + ": column '" + key + "' has "
            + std::to_string(v.size()) + " entries, column 'n' has "
            + std::to_string(nWant) + " -- every column of a term group is "
              "one row per term");
    return v;
}

} // namespace

void ReducedHelmholtz::read(const DictPtr& ideal, const DictPtr& residual,
                            const std::string& rec)
{
    groups_.clear();

    // ---- ideal part ------------------------------------------------------
    //  lead ( a1 a2 );  -> power terms tau^0, tau^1
    //  logTau a3;
    //  power { n (...); t (...); }
    //  planckEinstein { n (...); gamma (...); }
    for (const std::string& key : ideal->keys())
    {
        const std::string where = rec + ": ideal." + key;
        TermGroup g;
        g.ideal = true;
        if (key == "lead")
        {
            const std::vector<scalar> a = ideal->lookupList("lead");
            if (a.size() != 2)
                throw std::runtime_error(where + ": give the two constants "
                    "( a1 a2 ) of a1 + a2 tau");
            g.type = "power";
            g.n = a;
            g.t = { 0.0, 1.0 };
        }
        else if (key == "logTau")
        {
            g.type = "logTau";
            g.n = { ideal->lookupScalar("logTau") };
        }
        else if (key == "power" || key == "planckEinstein")
        {
            const DictPtr b = ideal->subDict(key);
            g.type = key;
            g.n = b->lookupList("n");
            if (key == "power") g.t     = column(b, "t", where, g.n.size());
            else                g.gamma = column(b, "gamma", where, g.n.size());
        }
        else
            throw std::runtime_error(where + ": unknown ideal-part term type '"
                + key + "' -- known: lead, logTau, power, planckEinstein");
        groups_.push_back(std::move(g));
    }

    // ---- residual part ---------------------------------------------------
    static const std::map<std::string, std::vector<std::string>> cols = {
        { "power",       { "d", "t" } },
        { "exponential", { "d", "t", "c" } },
        { "gaussian",    { "d", "t", "alpha", "beta", "gamma", "epsilon" } },
        { "nonAnalytic", { "a", "b", "B", "C", "D", "A", "beta" } },
    };
    for (const std::string& key : residual->keys())
    {
        const std::string where = rec + ": residual." + key;
        const auto it = cols.find(key);
        if (it == cols.end())
            throw std::runtime_error(where + ": unknown residual term type '"
                + key + "' -- known: power, exponential, gaussian, nonAnalytic");
        const DictPtr b = residual->subDict(key);
        TermGroup g;
        g.type = key;
        g.n = b->lookupList("n");
        const std::size_t m = g.n.size();
        for (const std::string& c : it->second)
        {
            std::vector<scalar> v = column(b, c, where, m);
            if      (c == "d")       g.d = v;
            else if (c == "t")       g.t = v;
            else if (c == "c")       g.c = v;
            else if (c == "alpha")   g.alpha = v;
            else if (c == "beta")    g.beta = v;
            else if (c == "gamma")   g.gamma = v;
            else if (c == "epsilon") g.epsilon = v;
            else if (c == "a")       g.na = v;
            else if (c == "b")       g.nb = v;
            else if (c == "B")       g.nB = v;
            else if (c == "C")       g.nC = v;
            else if (c == "D")       g.nD = v;
            else if (c == "A")       g.nA = v;
        }
        groups_.push_back(std::move(g));
    }
    if (nResidualTerms() == 0)
        throw std::runtime_error(rec + ": the residual part declares no term");
}

Derivs ReducedHelmholtz::ideal(scalar delta, scalar tau) const
{
    // ln(delta): the ideal gas's only density dependence, in every equation.
    Derivs s;
    s.a    = std::log(delta);
    s.a_d  = 1.0 / delta;
    s.a_dd = -1.0 / (delta * delta);
    for (const auto& g : groups_) if (g.ideal) s += g.sum(delta, tau);
    return s;
}

Derivs ReducedHelmholtz::residual(scalar delta, scalar tau) const
{
    Derivs s;
    for (const auto& g : groups_) if (!g.ideal) s += g.sum(delta, tau);
    return s;
}

std::size_t ReducedHelmholtz::nResidualTerms() const
{
    std::size_t k = 0;
    for (const auto& g : groups_) if (!g.ideal) k += g.size();
    return k;
}

} // namespace helmholtz
} // namespace Choupo
