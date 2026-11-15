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

#include "LiquidDiffusionMatrix.H"

#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"

#include <cmath>
#include <stdexcept>
#include <string>

namespace Choupo {
namespace liquidDiffusion {

namespace {

using Mat = std::vector<std::vector<scalar>>;

void requireAllPresent(const ThermoPackage& thermo, const sVector& x)
{
    if (thermo.n() < 2 || x.size() != thermo.n())
        throw std::runtime_error("liquid diffusion matrix: a liquid of two components or more,"
            " one mole fraction per component of the package.");
    for (std::size_t i = 0; i < x.size(); ++i)
        if (!(x[i] > 2.0 * gammaStep))
            throw std::runtime_error("liquid diffusion matrix: every component must be present"
                " (x > 2e-6; the thermodynamic factor is a central difference of ln gamma in mole"
                " fraction); " + thermo.comp(i).name() + " has x = " + std::to_string(x[i]) + ".");
}

} // namespace

Mat thermodynamicFactor(const ThermoPackage& thermo, scalar T, const sVector& x)
{
    requireAllPresent(thermo, x);
    const std::size_t n = thermo.n(), m = n - 1;
    Mat G(m, std::vector<scalar>(m, 0.0));
    for (std::size_t j = 0; j < m; ++j)
    {
        sVector xp = x, xm = x;
        xp[j] += gammaStep;  xp[m] -= gammaStep;
        xm[j] -= gammaStep;  xm[m] += gammaStep;
        const sVector gp = thermo.activity().gamma(T, xp);
        const sVector gm = thermo.activity().gamma(T, xm);
        for (std::size_t i = 0; i < m; ++i)
        {
            const scalar dlng = (std::log(gp[i]) - std::log(gm[i])) / (2.0 * gammaStep);
            G[i][j] = (i == j ? 1.0 : 0.0) + x[i] * dlng;
        }
    }
    return G;
}

Mat fickMatrix(const ThermoPackage& thermo, scalar T, const sVector& x)
{
    requireAllPresent(thermo, x);
    const std::size_t n = thermo.n(), m = n - 1;
    //  The pair values D_ij of the mixture (symmetric), Eq. 23.
    Mat Dp(n, std::vector<scalar>(n, 0.0));
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = i + 1; j < n; ++j)
            Dp[i][j] = Dp[j][i] = thermo.liquidPairDiffusivity(T, x, i, j);
    Mat B(m, std::vector<scalar>(m, 0.0));
    for (std::size_t i = 0; i < m; ++i)
    {
        B[i][i] = x[i] / Dp[i][m];
        for (std::size_t k = 0; k < n; ++k)
            if (k != i) B[i][i] += x[k] / Dp[i][k];
        for (std::size_t j = 0; j < m; ++j)
            if (j != i) B[i][j] = -x[i] * (1.0 / Dp[i][j] - 1.0 / Dp[i][m]);
    }
    const Mat G = thermodynamicFactor(thermo, T, x);
    //  [D] = [B]^-1 [Gamma]: Gauss-Jordan on [B | Gamma], partial pivoting.
    Mat A = B, R = G;
    for (std::size_t c = 0; c < m; ++c)
    {
        std::size_t piv = c;
        for (std::size_t r = c + 1; r < m; ++r)
            if (std::fabs(A[r][c]) > std::fabs(A[piv][c])) piv = r;
        if (!(std::fabs(A[piv][c]) > 0.0))
            throw std::runtime_error("liquid diffusion matrix: [B] is singular.");
        std::swap(A[c], A[piv]);  std::swap(R[c], R[piv]);
        const scalar d = A[c][c];
        for (std::size_t k = 0; k < m; ++k) { A[c][k] /= d; R[c][k] /= d; }
        for (std::size_t r = 0; r < m; ++r)
        {
            if (r == c) continue;
            const scalar f = A[r][c];
            if (f == 0.0) continue;
            for (std::size_t k = 0; k < m; ++k) { A[r][k] -= f * A[c][k]; R[r][k] -= f * R[c][k]; }
        }
    }
    return R;
}

} // namespace liquidDiffusion
} // namespace Choupo
