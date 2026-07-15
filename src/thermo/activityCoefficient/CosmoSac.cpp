/*---------------------------------------------------------------------------*\
    SPDX-License-Identifier: GPL-3.0-or-later
    Part of Choupo.  Credit: see AUTHORS ; Notices: see NOTICE.

    COSMO-SAC 2002 (Lin & Sandler) -- NIST benchmark variant (Bell 2019).
\*---------------------------------------------------------------------------*/

#include "CosmoSac.H"
#include "thermo/Component.H"

#include <cmath>
#include <stdexcept>

namespace Choupo {

// ---- COSMO-SAC 2002 constants (usnistgov/COSMOSAC, COSMO1Constants) ----------
namespace {
constexpr scalar A_EFF    = 7.5;        // effective segment area [A^2]
constexpr scalar ALPHA_P  = 16466.72;   // misfit constant [kcal A^4 / (mol e^2)]
constexpr scalar C_HB     = 85580.0;    // hydrogen-bond constant [kcal A^4 / (mol e^2)]
constexpr scalar SIGMA_HB = 0.0084;     // hydrogen-bond cutoff [e/A^2]
constexpr scalar Z_COORD  = 10.0;       // coordination number
constexpr scalar R0_NORM  = 66.69;      // volume normalisation [A^3]
constexpr scalar Q0_NORM  = 79.53;      // area normalisation [A^2]
constexpr scalar R_GAS    = 0.001987;   // gas constant [kcal/(mol K)] (Mullins-consistent)
constexpr scalar SIGMA_MIN = -0.025;    // grid [e/A^2]
constexpr scalar DSIGMA    = 0.001;
} // namespace

CosmoSac::CosmoSac(const DictPtr& /*dict*/, const std::vector<Component>& comps)
    : n_(comps.size())
{
    area_.resize(n_);
    vol_.resize(n_);
    pArea_.resize(n_);

    for (std::size_t i = 0; i < n_; ++i)
    {
        const Component& c = comps[i];
        if (!c.hasCosmo())
            throw std::runtime_error("cosmoSAC: component '" + c.name()
                + "' has no `cosmo { area; volume; sigmaProfile ( ... ); }` block "
                  "in its .dat -- COSMO-SAC needs the COSMO surface data per component "
                  "(no silent crutch; add the block or select another activityModel).");
        const auto& prof = c.cosmoSigmaProfile();
        if (static_cast<int>(prof.size()) != NGRID)
            throw std::runtime_error("cosmoSAC: component '" + c.name()
                + "' sigmaProfile has " + std::to_string(prof.size())
                + " points, expected " + std::to_string(NGRID)
                + " (the -0.025..0.025 e/A^2 grid, step 0.001).");
        area_[i]  = c.cosmoArea();
        vol_[i]   = c.cosmoVolume();
        pArea_[i] = prof;
    }

    // The sigma grid + the (temperature-independent) exchange-energy matrix.
    for (int m = 0; m < NGRID; ++m) sigma_[m] = SIGMA_MIN + DSIGMA * m;
    for (int m = 0; m < NGRID; ++m)
        for (int nn = 0; nn < NGRID; ++nn)
        {
            const scalar sm = sigma_[m], sn = sigma_[nn];
            const scalar s_acc = std::max(sm, sn);
            const scalar s_don = std::min(sm, sn);
            dW_[m][nn] = 0.5 * ALPHA_P * (sm + sn) * (sm + sn)
                       + C_HB * std::max(0.0, s_acc - SIGMA_HB)
                             * std::min(0.0, s_don + SIGMA_HB);
        }
}

std::vector<scalar>
CosmoSac::lnSegmentGamma(scalar T_K, const std::vector<scalar>& pProb) const
{
    // exp(-DELTAW/RT), then Gamma(m) = 1 / sum_n p(n) Gamma(n) exp(-DW/RT),
    // fixed-point with 1/2 damping (NIST recipe), tol 1e-8.
    const scalar RT = R_GAS * T_K;
    std::vector<scalar> G(NGRID, 1.0), Gnew(NGRID, 1.0);
    for (int iter = 0; iter < 500; ++iter)
    {
        scalar maxdiff = 0.0;
        for (int m = 0; m < NGRID; ++m)
        {
            scalar s = 0.0;
            for (int nn = 0; nn < NGRID; ++nn)
                s += pProb[nn] * G[nn] * std::exp(-dW_[m][nn] / RT);
            Gnew[m] = 1.0 / s;
            maxdiff = std::max(maxdiff, std::fabs(Gnew[m] - G[m]));
        }
        for (int m = 0; m < NGRID; ++m) G[m] = 0.5 * (G[m] + Gnew[m]);
        if (maxdiff < 1e-8) break;
    }
    std::vector<scalar> lnG(NGRID);
    for (int m = 0; m < NGRID; ++m) lnG[m] = std::log(G[m]);
    return lnG;
}

sVector CosmoSac::gamma(scalar T_K, const sVector& x) const
{
    // ---- RESIDUAL: mixture segment activities vs each pure component's --------
    scalar Amix = 0.0;
    for (std::size_t i = 0; i < n_; ++i) Amix += x[i] * area_[i];

    std::vector<scalar> pS(NGRID, 0.0);              // mixture probability profile
    if (Amix > 0.0)
        for (int k = 0; k < NGRID; ++k)
        {
            scalar acc = 0.0;
            for (std::size_t i = 0; i < n_; ++i) acc += x[i] * pArea_[i][k];
            pS[k] = acc / Amix;
        }
    const std::vector<scalar> lnGS = lnSegmentGamma(T_K, pS);

    // ---- COMBINATORIAL (Staverman-Guggenheim) sums ---------------------------
    scalar sumRx = 0.0, sumQx = 0.0;
    std::vector<scalar> r(n_), q(n_), l(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        r[i] = vol_[i]  / R0_NORM;
        q[i] = area_[i] / Q0_NORM;
        l[i] = 0.5 * Z_COORD * (r[i] - q[i]) - (r[i] - 1.0);
        sumRx += r[i] * x[i];
        sumQx += q[i] * x[i];
    }
    scalar sumXl = 0.0;
    for (std::size_t i = 0; i < n_; ++i) sumXl += x[i] * l[i];

    sVector out(n_);
    for (std::size_t i = 0; i < n_; ++i)
    {
        // residual: pure-i probability profile + its own segment activities
        std::vector<scalar> pI(NGRID);
        for (int k = 0; k < NGRID; ++k) pI[k] = pArea_[i][k] / area_[i];
        const std::vector<scalar> lnGI = lnSegmentGamma(T_K, pI);
        scalar res = 0.0;
        for (int k = 0; k < NGRID; ++k) res += pI[k] * (lnGS[k] - lnGI[k]);
        res *= area_[i] / A_EFF;

        // combinatorial (x-free ratios, so infinite dilution x_i=0 is finite)
        const scalar phi_over_x   = (sumRx > 0.0) ? r[i] / sumRx : 0.0;
        const scalar theta_over_x = (sumQx > 0.0) ? q[i] / sumQx : 0.0;
        scalar comb = 0.0;
        if (phi_over_x > 0.0)
            comb = std::log(phi_over_x)
                 + 0.5 * Z_COORD * q[i] * std::log(theta_over_x / phi_over_x)
                 + l[i] - phi_over_x * sumXl;

        out[i] = std::exp(comb + res);
    }
    return out;
}

} // namespace Choupo
