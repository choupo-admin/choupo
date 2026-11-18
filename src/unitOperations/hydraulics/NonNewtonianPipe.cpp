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
\*---------------------------------------------------------------------------*/

#include "NonNewtonianPipe.H"

#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <vector>

namespace Choupo {
namespace nonNewtonianPipe {

namespace {

//  Five-point Gauss-Legendre nodes and weights on [-1, 1].
const scalar GLx[5] = { 0.0, -0.5384693101056831, 0.5384693101056831, -0.9061798459386640, 0.9061798459386640 };
const scalar GLw[5] = { 0.5688888888888889, 0.4786286704993665, 0.4786286704993665, 0.2369268850561891, 0.2369268850561891 };

//  integral of g(u) du over [a, b], `panels` composite panels.
template <class G>
scalar gl(G g, scalar a, scalar b, int panels)
{
    scalar sum = 0.0;
    const scalar h = (b - a) / panels;
    for (int p = 0; p < panels; ++p)
    {
        const scalar mid = a + (p + 0.5) * h;
        for (int k = 0; k < 5; ++k) sum += GLw[k] * g(mid + 0.5 * h * GLx[k]);
    }
    return 0.5 * h * sum;
}

} // namespace

scalar meanVelocity(const rheology::FlowCurve& c, scalar D, scalar tau_w, scalar* tailShare)
{
    const scalar y0 = c.hasYield ? c.yield : 0.0;
    const scalar sw = tau_w - y0;
    if (!(sw > 0.0)) { if (tailShare) *tailShare = 0.0; return 0.0; }
    //  integral over u = ln s, s = tau - y0:  tau^2 gamma(tau) s du.
    auto integrand = [&](scalar u) -> scalar
    {
        const scalar s = std::exp(u);
        const scalar tau = y0 + s;
        return tau * tau * c.rateAt(tau) * s;
    };
    const scalar uHi = std::log(sw), uLo = uHi - 42.0;
    //  breakpoints: every row's stress above the yield that lies inside (uLo, uHi)
    std::vector<scalar> bp{ uLo };
    for (std::size_t k = 0; k < c.tau.size(); ++k)
    {
        const scalar s = c.tau[k] - y0;
        if (s > 0.0) { const scalar u = std::log(s); if (u > uLo + 1e-9 && u < uHi - 1e-9) bp.push_back(u); }
    }
    bp.push_back(uHi);
    std::sort(bp.begin(), bp.end());
    scalar I = 0.0;
    for (std::size_t i = 0; i + 1 < bp.size(); ++i) I += gl(integrand, bp[i], bp[i + 1], 24);
    if (tailShare)
    {
        //  the part of V that stands on shear rates below the authorised domain
        scalar tail = 0.0;
        const scalar gLo = c.gammaLoAuth;
        //  u at which gamma(tau) = gLo : tau = stress at gLo
        const scalar sLo = c.stressUnchecked(gLo) - y0;
        if (sLo > 0.0)
        {
            const scalar uStar = std::min(std::log(sLo), uHi);
            std::vector<scalar> bq{ uLo };
            for (std::size_t i = 1; i + 1 < bp.size(); ++i) if (bp[i] < uStar) bq.push_back(bp[i]);
            bq.push_back(uStar);
            for (std::size_t i = 0; i + 1 < bq.size(); ++i) tail += gl(integrand, bq[i], bq[i + 1], 24);
        }
        *tailShare = I > 0.0 ? tail / I : 0.0;
    }
    return (0.5 * D) * I / (tau_w * tau_w * tau_w);
}

scalar plugVelocity(const rheology::FlowCurve& c, scalar D, scalar tau_w)
{
    if (!c.hasYield || !(tau_w > c.yield)) return 0.0;
    const scalar y0 = c.yield, sw = tau_w - y0;
    auto integrand = [&](scalar u) -> scalar { const scalar s = std::exp(u); return c.rateAt(y0 + s) * s; };
    const scalar uHi = std::log(sw), uLo = uHi - 42.0;
    std::vector<scalar> bp{ uLo };
    for (std::size_t k = 0; k < c.tau.size(); ++k)
    {
        const scalar s = c.tau[k] - y0;
        if (s > 0.0) { const scalar u = std::log(s); if (u > uLo + 1e-9 && u < uHi - 1e-9) bp.push_back(u); }
    }
    bp.push_back(uHi);
    std::sort(bp.begin(), bp.end());
    scalar I = 0.0;
    for (std::size_t i = 0; i + 1 < bp.size(); ++i) I += gl(integrand, bp[i], bp[i + 1], 24);
    return (0.5 * D) * I / tau_w;
}

scalar wallStress(const rheology::FlowCurve& c, scalar D, scalar V)
{
    if (!(V > 0.0)) throw std::runtime_error("nonNewtonianPipe: a non-positive mean velocity.");
    const scalar y0 = c.hasYield ? c.yield : 0.0;
    //  bisection on ln(s), s = tau_w - y0; V(tau_w) increases with tau_w.
    scalar lo = std::log(std::max(1.0e-12, 1.0e-9 * (y0 > 0 ? y0 : 1.0)));
    scalar hi = std::log(std::max(1.0, 10.0 * (c.tau.back())));
    for (int k = 0; k < 40 && meanVelocity(c, D, y0 + std::exp(hi)) < V; ++k) hi += 1.0;
    if (meanVelocity(c, D, y0 + std::exp(hi)) < V)
        throw std::runtime_error("nonNewtonianPipe: the flow curve reaches no wall stress that carries this velocity.");
    for (int it = 0; it < 200; ++it)
    {
        const scalar mid = 0.5 * (lo + hi);
        if (meanVelocity(c, D, y0 + std::exp(mid)) < V) lo = mid; else hi = mid;
        if (hi - lo < 1.0e-13) break;
    }
    return y0 + std::exp(0.5 * (lo + hi));
}

scalar nPrime(const rheology::FlowCurve& c, scalar D, scalar V)
{
    const scalar a = V * 0.99, b = V * 1.01;
    const scalar ta = wallStress(c, D, a), tb = wallStress(c, D, b);
    return (std::log(tb) - std::log(ta)) / (std::log(b) - std::log(a));
}

scalar dodgeMetznerF(scalar Re, scalar n)
{
    auto resid = [&](scalar f)
    {
        return 1.0 / std::sqrt(f) - (4.0 / std::pow(n, 0.75) * std::log10(Re * std::pow(f, (2.0 - n) / 2.0))
                                     - 0.4 / std::pow(n, 1.2));
    };
    scalar lo = 1.0e-5, hi = 0.1;       // resid(lo) > 0, resid(hi) < 0 over the book's range
    for (int it = 0; it < 200; ++it)
    {
        const scalar mid = std::sqrt(lo * hi);
        if (resid(mid) > 0.0) lo = mid; else hi = mid;
    }
    return std::sqrt(lo * hi);
}

} // namespace nonNewtonianPipe
} // namespace Choupo
