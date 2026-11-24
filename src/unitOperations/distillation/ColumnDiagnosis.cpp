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

#include "ColumnDiagnosis.H"

#include <algorithm>
#include <cmath>
#include <exception>
#include <iomanip>
#include <limits>
#include <sstream>

namespace Choupo::columnDiagnosis {

namespace {

constexpr std::size_t kMaxUnknownsAnalysed = 1500;   // the dense analysis is O(n^3)
constexpr double      kIllConditioned      = 1.0e10;  // of the ROW-EQUILIBRATED Jacobian

std::string num(double v, int digits = 4)
{
    std::ostringstream o;
    o << std::setprecision(digits) << v;
    return o.str();
}

std::string stageWord(const Layout& L, std::size_t j)
{
    std::string s = "stage " + std::to_string(j + 1);
    if (j == 0)                          s += (L.partialCondenser ? " (the partial condenser)" : " (the top tray)");
    else if (j + 1 == L.N)               s += " (the reboiler)";
    else if (static_cast<int>(j) == L.feedStage) s += " (the feed stage)";
    return s;
}

const std::string& compName(const Layout& L, std::size_t i)
{
    static const std::string unnamed = "a component";
    return i < L.comp.size() ? L.comp[i] : unnamed;
}

// ---- a self-contained dense LU that never throws ---------------------------
//  A zero pivot is replaced by a tiny number and COUNTED: the caller reads
//  `replaced` as "exactly singular", and the solve still returns a vector
//  dominated by the null direction, which is what inverse iteration wants.
struct LU
{
    std::vector<sVector>     a;
    std::vector<std::size_t> piv;
    int                      replaced = 0;
    std::size_t              n = 0;

    explicit LU(std::vector<sVector> m) : a(std::move(m)), n(a.size())
    {
        piv.resize(n);
        double amax = 0.0;
        for (const auto& r : a) for (double v : r) amax = std::max(amax, std::abs(v));
        const double floorP = std::max(amax, 1.0) * 1.0e-300 + 1.0e-18 * std::max(amax, 1.0);
        for (std::size_t k = 0; k < n; ++k)
        {
            std::size_t p = k;
            for (std::size_t i = k + 1; i < n; ++i)
                if (std::abs(a[i][k]) > std::abs(a[p][k])) p = i;
            piv[k] = p;
            if (p != k) std::swap(a[p], a[k]);
            if (!(std::abs(a[k][k]) > floorP)) { a[k][k] = floorP; ++replaced; }
            for (std::size_t i = k + 1; i < n; ++i)
            {
                a[i][k] /= a[k][k];
                const double m = a[i][k];
                if (m != 0.0)
                    for (std::size_t j = k + 1; j < n; ++j) a[i][j] -= m * a[k][j];
            }
        }
    }
    sVector solve(sVector b) const
    {
        for (std::size_t k = 0; k < n; ++k)
        {
            if (piv[k] != k) std::swap(b[k], b[piv[k]]);
            for (std::size_t i = k + 1; i < n; ++i) b[i] -= a[i][k] * b[k];
        }
        for (std::size_t k = n; k-- > 0; )
        {
            for (std::size_t j = k + 1; j < n; ++j) b[k] -= a[k][j] * b[j];
            b[k] /= a[k][k];
        }
        return b;
    }
};

double norm2(const sVector& v)
{
    double s = 0.0;
    for (double x : v) s += x * x;
    return std::sqrt(s);
}

std::vector<sVector> transpose(const std::vector<sVector>& A)
{
    const std::size_t n = A.size();
    std::vector<sVector> T(n, sVector(n, 0.0));
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = 0; j < n; ++j) T[j][i] = A[i][j];
    return T;
}

//  The units one unknown is of, for the finite-difference step.
double typical(const Layout& L, const Facts& f, std::size_t col)
{
    const std::size_t main = L.N * L.block;
    const double flow = std::max(f.totalFeed, 1.0e-12);
    if (col >= main) return flow;
    const std::size_t i = col % L.block;
    if (i + 1 < L.n) return 0.1;                  // a mole fraction
    if (i + 1 == L.n) return 300.0;               // a temperature
    return flow;                                  // V or L
}

struct Jac
{
    bool                 ok = false;              // built
    std::string          failure;                 // why not
    std::vector<sVector> A;                       // row-equilibrated, column-equilibrated
    std::vector<std::size_t> zeroRows, zeroCols;
    std::vector<std::size_t> nonFiniteRows;
    bool                 nonFinite = false;
};

Jac buildJacobian(const Layout& L, const Facts& f, const ResidualFn& F, const sVector& x, const sVector& F0)
{
    Jac J;
    const std::size_t n = x.size();
    std::vector<sVector> M(n, sVector(n, 0.0));
    for (std::size_t c = 0; c < n; ++c)
    {
        const double h = 1.0e-6 * std::max(std::abs(x[c]), typical(L, f, c));
        sVector xp = x, xm = x;
        xp[c] += h; xm[c] -= h;
        sVector Fp, Fm;
        bool two = true;
        try { Fp = F(xp); Fm = F(xm); }
        catch (const std::exception&) { two = false; }
        if (!two)
        {
            //  one-sided, on whichever side the residual can be priced
            try { Fp = F(xp); Fm = F0; }
            catch (const std::exception&)
            {
                try { Fp = F0; Fm = F(xm); }
                catch (const std::exception& e)
                { J.failure = std::string("the residual cannot be priced next to the best iterate (")
                              + e.what() + ")"; return J; }
            }
        }
        const double span = two ? 2.0 * h : h;
        for (std::size_t r = 0; r < n; ++r)
        {
            const double d = (Fp[r] - Fm[r]) / span;
            if (!std::isfinite(d)) { J.nonFinite = true; J.nonFiniteRows.push_back(r); M[r][c] = 0.0; }
            else M[r][c] = d;
        }
    }
    for (std::size_t r = 0; r < n; ++r)
    {
        double m = 0.0;
        for (double v : M[r]) m = std::max(m, std::abs(v));
        if (m == 0.0) { J.zeroRows.push_back(r); continue; }
        for (auto& v : M[r]) v /= m;
    }
    for (std::size_t c = 0; c < n; ++c)
    {
        double m = 0.0;
        for (std::size_t r = 0; r < n; ++r) m = std::max(m, std::abs(M[r][c]));
        if (m == 0.0) { J.zeroCols.push_back(c); continue; }
        for (std::size_t r = 0; r < n; ++r) M[r][c] /= m;
    }
    J.A = std::move(M);
    J.ok = true;
    return J;
}

struct Spectrum
{
    double sigmaMax = 0.0, sigmaMin = 0.0, cond = 0.0;
    bool   exactlySingular = false;
    sVector u, v;          // left and right singular vectors of the weakest direction
};

Spectrum spectrum(const std::vector<sVector>& A)
{
    Spectrum S;
    const std::size_t n = A.size();
    //  largest singular value: power iteration on A^T A
    {
        sVector v(n, 1.0 / std::sqrt(static_cast<double>(n)));
        double lam = 0.0;
        for (int k = 0; k < 30; ++k)
        {
            sVector w(n, 0.0);
            for (std::size_t i = 0; i < n; ++i)
                for (std::size_t j = 0; j < n; ++j) w[i] += A[i][j] * v[j];
            sVector z(n, 0.0);
            for (std::size_t j = 0; j < n; ++j)
                for (std::size_t i = 0; i < n; ++i) z[j] += A[i][j] * w[i];
            lam = norm2(z);
            if (!(lam > 0.0)) break;
            for (std::size_t j = 0; j < n; ++j) v[j] = z[j] / lam;
        }
        S.sigmaMax = std::sqrt(lam);
    }
    //  smallest: inverse iteration on A^T A  ( (A^T A)^-1 = A^-1 A^-T )
    LU lu(A), luT(transpose(A));
    S.exactlySingular = lu.replaced > 0 || luT.replaced > 0;
    sVector v(n);
    for (std::size_t i = 0; i < n; ++i) v[i] = 1.0 + 0.37 * std::sin(1.0 + 1.7 * static_cast<double>(i));
    { const double nv = norm2(v); for (auto& e : v) e /= nv; }
    double growth = 1.0;
    for (int k = 0; k < 8; ++k)
    {
        sVector z = lu.solve(luT.solve(v));
        growth = norm2(z);
        if (!std::isfinite(growth) || growth == 0.0) break;
        for (std::size_t i = 0; i < n; ++i) v[i] = z[i] / growth;
    }
    S.sigmaMin = (growth > 0.0 && std::isfinite(growth)) ? 1.0 / std::sqrt(growth) : 0.0;
    if (S.exactlySingular) S.sigmaMin = 0.0;
    S.cond = (S.sigmaMin > 0.0) ? S.sigmaMax / S.sigmaMin : std::numeric_limits<double>::infinity();
    S.v = v;
    S.u.assign(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
        for (std::size_t j = 0; j < n; ++j) S.u[i] += A[i][j] * v[j];
    { const double nu = norm2(S.u); if (nu > 0.0) for (auto& e : S.u) e /= nu; }
    return S;
}

std::vector<std::size_t> topIndices(const sVector& v, std::size_t k)
{
    std::vector<std::size_t> idx(v.size());
    for (std::size_t i = 0; i < idx.size(); ++i) idx[i] = i;
    std::sort(idx.begin(), idx.end(), [&](std::size_t a, std::size_t b){ return std::abs(v[a]) > std::abs(v[b]); });
    idx.resize(std::min(k, idx.size()));
    return idx;
}

//  What a weak unknown usually means, read from its value at the best iterate.
std::string physicsOf(const Layout& L, std::size_t col, const sVector& x)
{
    const std::size_t main = L.N * L.block;
    if (col >= main) return "";
    const std::size_t j = col / L.block, i = col % L.block;
    if (i + 1 < L.n)
    {
        const double xv = x[col];
        if (xv < 1.0e-6)
            return compName(L, i) + " is all but absent from " + stageWord(L, j)
                   + " (x = " + num(xv, 3) + "): its balance there has almost no"
                   " sensitivity, the signature of a near-pure stage or a trace component";
        if (xv > 1.0 - 1.0e-6)
            return stageWord(L, j) + " is all but pure " + compName(L, i)
                   + " (x = " + num(xv, 7) + "): the other fractions there barely register";
        return "";
    }
    if (L.kind == Layout::Kind::fullMESH && i == L.n)
        return x[col] < 1.0e-9 ? "the vapour leaving " + stageWord(L, j) + " has gone to zero"
                               : "";
    if (L.kind == Layout::Kind::fullMESH && i == L.n + 1)
        return x[col] < 1.0e-9 ? "the liquid leaving " + stageWord(L, j) + " has gone to zero"
                               : "";
    return "";
}

bool looksLikeExtrapolation(const std::string& s)
{
    std::string t;
    for (char c : s) t.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(c))));
    for (const char* key : {"extrapolat", "outside", "beyond", "above tc", "above the critical",
                            "trange", "valid range", "validity", "not valid", "window",
                            "integrated down", "below its", "out of range", "out-of-range"})
        if (t.find(key) != std::string::npos) return true;
    return false;
}

} // namespace

char letter(Cause c)
{
    switch (c)
    {
        case Cause::infeasibleSpecification: return 'A';
        case Cause::thermoData:              return 'B';
        case Cause::illConditioned:          return 'C';
        case Cause::implementationFault:     return 'D';
        default:                             return '-';
    }
}

std::string equationName(const Layout& L, std::size_t row)
{
    const std::size_t main = L.N * L.block;
    if (row >= main)
    {
        const std::size_t k = row - main;
        if (L.kind == Layout::Kind::fullMESH && L.distillateUnknown && k == 0)
            return "the overall material balance that fixes the distillate rate";
        const std::size_t kr = k - ((L.kind == Layout::Kind::fullMESH && L.distillateUnknown) ? 1 : 0);
        return "the chemical equilibrium of reaction " + std::to_string(kr + 1) + " (K_a)";
    }
    const std::size_t j = row / L.block, i = row % L.block;
    if (i + 1 < L.n)
        return "the material balance of " + compName(L, i) + " on " + stageWord(L, j);
    if (i + 1 == L.n)
        return "the summation sum(y) = 1 of " + stageWord(L, j) + " (its bubble point, which fixes the stage temperature)";
    if (L.kind == Layout::Kind::fullMESH && i == L.n)
        return j == 0 ? std::string("the vapour link of the top stage to the condenser, V1 = (R + 1) D")
                      : "the total flow balance of " + stageWord(L, j);
    if (L.kind == Layout::Kind::fullMESH && i == L.n + 1)
    {
        if (j == 0)       return L.partialCondenser ? std::string("the reflux (or boil-up) specification")
                                                    : std::string("the energy balance of the condenser and top tray");
        if (j + 1 == L.N) return "the bottoms-rate specification of " + stageWord(L, j);
        return "the energy balance of " + stageWord(L, j);
    }
    return "an equation of " + stageWord(L, j);
}

std::string unknownName(const Layout& L, std::size_t col)
{
    const std::size_t main = L.N * L.block;
    if (col >= main)
    {
        const std::size_t k = col - main;
        if (L.kind == Layout::Kind::fullMESH && L.distillateUnknown && k == 0)
            return "the distillate rate D";
        const std::size_t kr = k - ((L.kind == Layout::Kind::fullMESH && L.distillateUnknown) ? 1 : 0);
        return "the molar extent of reaction " + std::to_string(kr + 1);
    }
    const std::size_t j = col / L.block, i = col % L.block;
    if (i + 1 < L.n) return "the mole fraction of " + compName(L, i) + " on " + stageWord(L, j);
    if (i + 1 == L.n) return "the temperature of " + stageWord(L, j);
    if (L.kind == Layout::Kind::fullMESH && i == L.n) return "the vapour flow leaving " + stageWord(L, j);
    if (L.kind == Layout::Kind::fullMESH && i == L.n + 1) return "the liquid flow leaving " + stageWord(L, j);
    return "an unknown of " + stageWord(L, j);
}

Verdict diagnose(const Facts& f, const Layout& L, const ResidualFn& residual, const sVector& x)
{
    Verdict v;
    const std::size_t nU = x.size();

    // ------------------------------------------------------------------
    //  (A) the specification, read from the declared numbers
    // ------------------------------------------------------------------
    std::vector<std::string> specLines;
    bool specHard = false;
    v.tried.push_back("(A) the declared rates against the feed, and the best iterate's component flows");
    const double bottoms = f.totalFeed - f.distillate - f.totalDraws;
    if (!f.rateIsUnknown)
    {
        if (!(f.distillate > 0.0))
        { specLines.push_back("the distillate rate is " + num(f.distillate) + " kmol/s: a column cannot be asked for no distillate"); specHard = true; }
        else if (bottoms <= 0.0)
        {
            specLines.push_back("the distillate rate (" + num(f.distillate) + " kmol/s) plus the side draws ("
                + num(f.totalDraws) + ") is not less than the total feed (" + num(f.totalFeed)
                + " kmol/s): by the overall balance nothing is left for the bottoms (B = "
                + num(bottoms) + " kmol/s) -- the specification asks for more than the column is fed");
            specHard = true;
        }
    }
    if (f.reflux < 0.0)
    { specLines.push_back("the reflux ratio is " + num(f.reflux) + ": it cannot be negative"); specHard = true; }

    //  The best iterate's bottoms against what each component is fed with
    //  (without reaction a component cannot leave in the bottoms more than it
    //  entered; a MESH that is asked for the impossible pushes it there).
    bool stateInfeasible = false;
    if (L.nExtents == 0 && L.N >= 2 && L.block > 0 && x.size() >= L.N * L.block && f.feedComponent.size() == L.n)
    {
        const std::size_t jb = L.N - 1;
        double B = bottoms;
        if (L.kind == Layout::Kind::fullMESH) B = x[jb * L.block + L.n + 1];
        double s = 0.0;
        sVector xb(L.n, 0.0);
        for (std::size_t i = 0; i + 1 < L.n; ++i) { xb[i] = x[jb * L.block + i]; s += xb[i]; }
        xb[L.n - 1] = 1.0 - s;
        for (std::size_t i = 0; i < L.n; ++i)
        {
            const double bi = B * xb[i];
            //  a material excess: beyond 5 % of what the component is fed AND 1 % of the whole feed
            //  (a near-converged iterate overshoots by far less, and is not an infeasible column)
            if (bi - f.feedComponent[i] > 0.05 * f.feedComponent[i] && bi - f.feedComponent[i] > 0.01 * f.totalFeed)
            {
                specLines.push_back("at the best iterate the bottoms would carry " + num(bi)
                    + " kmol/s of " + compName(L, i) + ", but the column is fed only "
                    + num(f.feedComponent[i]) + " kmol/s of it, so its distillate would have to be negative:"
                    " the distillate rate (" + num(f.distillate) + " kmol/s of a " + num(f.totalFeed)
                    + " kmol/s feed) and the reflux cannot be met with this feed's composition");
                stateInfeasible = true;
            }
        }
    }
    if (L.kind == Layout::Kind::fullMESH && L.block > 0 && x.size() >= L.N * L.block)
    {
        for (std::size_t j = 0; j < L.N; ++j)
        {
            const double V = x[j * L.block + L.n], Lq = x[j * L.block + L.n + 1];
            const bool vTop = (j == 0 && L.partialCondenser) || (j + 1 == L.N);
            if (!vTop && V <= 1.0e-9 * std::max(f.totalFeed, 1.0e-12))
            { specLines.push_back("the vapour rising through " + stageWord(L, j)
                    + " has gone to zero at the best iterate: the specified reflux and rates leave this stage dry"); stateInfeasible = true; break; }
            if (j + 1 < L.N && Lq <= 1.0e-9 * std::max(f.totalFeed, 1.0e-12))
            { specLines.push_back("the liquid leaving " + stageWord(L, j)
                    + " has gone to zero at the best iterate: the specified reflux and rates leave this stage dry"); stateInfeasible = true; break; }
        }
    }

    // ------------------------------------------------------------------
    //  (B) the data: refusals the stage pricing raised, extrapolation notices
    // ------------------------------------------------------------------
    v.tried.push_back("(B) the stage pricing's refusals and the thermodynamic advisories raised during the solve");
    std::vector<std::string> thermoLines;   // HARD evidence: a stage that could not be priced
    std::vector<std::string> softLines;     // routine notices: extrapolated windows, not a cause by themselves
    if (!f.trialRefusal.empty())
        thermoLines.push_back("a trial state was refused by the stage pricing: " + f.trialRefusal);
    {
        std::vector<std::string> seen;
        for (const auto& a : f.advisories)
        {
            if (!looksLikeExtrapolation(a.second) && !looksLikeExtrapolation(a.first)) continue;
            //  only a notice about one of THIS column's components
            bool aboutUs = L.comp.empty();
            for (const auto& cn : L.comp)
                if (!cn.empty() && a.second.find(cn) != std::string::npos) { aboutUs = true; break; }
            if (!aboutUs) continue;
            if (std::find(seen.begin(), seen.end(), a.second) != seen.end()) continue;
            seen.push_back(a.second);
            if (seen.size() <= 3) softLines.push_back("advisory during the solve: " + a.second);
        }
        if (seen.size() > 3)
            softLines.push_back("... and " + std::to_string(seen.size() - 3) + " more of the same kind");
    }

    // ------------------------------------------------------------------
    //  (C)/(D) the Jacobian at the best iterate
    // ------------------------------------------------------------------
    v.tried.push_back("(C)/(D) the Jacobian at the best iterate: finiteness, empty equations and unknowns, row-equilibrated conditioning");
    std::vector<std::string> faultLines, condLines;
    bool faultHard = false, condBad = false;
    double cond = std::numeric_limits<double>::quiet_NaN();
    sVector F0;
    bool residualPriced = true;
    std::string residualFailure;
    if (nU == 0)
        v.tried.push_back("    (skipped: this solver is not a simultaneous Newton, so there is no Jacobian to analyse)");
    else
    {
        try { F0 = residual(x); }
        catch (const std::exception& e) { residualPriced = false; residualFailure = e.what(); }
    }
    if (nU == 0) {}
    else if (!residualPriced)
    {
        thermoLines.push_back("the residual cannot be evaluated at the best iterate itself: " + residualFailure);
    }
    else
    {
        for (std::size_t r = 0; r < F0.size(); ++r)
            if (!std::isfinite(F0[r]))
            {
                faultLines.push_back("the residual of " + equationName(L, r) + " is not a finite number at the best iterate: the equation, not the case, is faulty");
                faultHard = true;
                break;
            }
        if (!faultHard && nU <= kMaxUnknownsAnalysed && F0.size() == nU)
        {
            Jac J = buildJacobian(L, f, residual, x, F0);
            if (!J.ok)
                thermoLines.push_back(J.failure);
            else
            {
                if (J.nonFinite)
                {
                    faultLines.push_back("the derivative of " + equationName(L, J.nonFiniteRows.front())
                        + " is not finite near the best iterate");
                    faultHard = true;
                }
                if (!J.zeroRows.empty())
                {
                    faultLines.push_back(equationName(L, J.zeroRows.front())
                        + " contains none of the unknowns at the best iterate (an empty equation)");
                    faultHard = true;
                }
                if (!J.zeroCols.empty())
                {
                    faultLines.push_back(unknownName(L, J.zeroCols.front())
                        + " appears in no equation at the best iterate (an unknown nothing determines)");
                    faultHard = true;
                }
                if (!faultHard)
                {
                    const Spectrum S = spectrum(J.A);
                    cond = S.cond;
                    if (S.exactlySingular || S.cond > kIllConditioned)
                    {
                        condBad = true;
                        condLines.push_back(std::string("the Jacobian at the best iterate is ")
                            + (S.exactlySingular ? "singular" : "ill-conditioned")
                            + " (row-equilibrated condition number "
                            + (std::isfinite(S.cond) ? num(S.cond, 3) : std::string("infinite")) + ")");
                        const auto eq = topIndices(S.u, 2);
                        const auto uk = topIndices(S.v, 2);
                        condLines.push_back("the weakest-determined equations are " + equationName(L, eq[0])
                            + (eq.size() > 1 ? "; and " + equationName(L, eq[1]) : std::string()));
                        condLines.push_back("the least-determined unknowns are " + unknownName(L, uk[0])
                            + (uk.size() > 1 ? "; and " + unknownName(L, uk[1]) : std::string()));
                        for (std::size_t c : uk)
                        {
                            const std::string p = physicsOf(L, c, x);
                            if (!p.empty()) { condLines.push_back("physics: " + p); break; }
                        }
                    }
                }
            }
        }
        else if (!faultHard && nU > kMaxUnknownsAnalysed)
            v.tried.push_back("    (the conditioning analysis was skipped: " + std::to_string(nU)
                              + " unknowns is past the " + std::to_string(kMaxUnknownsAnalysed) + " it will factor)");
    }

    // ------------------------------------------------------------------
    //  The verdict, in the order a cause can be told from the others.
    // ------------------------------------------------------------------
    auto stats = [&]() {
        std::ostringstream o;
        o << "the Newton stopped after " << f.iterations << " iterations at |F| = "
          << std::scientific << std::setprecision(3) << f.residual;
        if (!f.stopReason.empty()) o << " (" << f.stopReason << ")";
        if (f.lmSteps > 0) o << "; " << f.lmSteps << " Levenberg-Marquardt step(s)";
        if (f.stalledSteps > 0) o << "; " << f.stalledSteps << " floor-damped step(s)";
        if (f.trialRefusals > 0) o << "; " << f.trialRefusals << " trial state(s) refused";
        return o.str();
    };

    if (specHard)
    {
        v.cause = Cause::infeasibleSpecification;
        v.headline = "the specification is physically infeasible";
        v.lines = specLines;
    }
    else if (faultHard && thermoLines.empty())
    {
        v.cause = Cause::implementationFault;
        v.headline = "the model's own equations are faulty at the best iterate (an implementation fault, not the case)";
        v.lines = faultLines;
    }
    else if (stateInfeasible)
    {
        v.cause = Cause::infeasibleSpecification;
        v.headline = "the specification is probably infeasible: the best iterate shows it asks for the impossible";
        v.lines = specLines;
    }
    else if (!thermoLines.empty())
    {
        v.cause = Cause::thermoData;
        v.headline = "thermodynamic data are missing, or a stage could not be priced at the conditions the solve reached";
        v.lines = thermoLines;
        if (faultHard) v.lines.insert(v.lines.end(), faultLines.begin(), faultLines.end());
        if (condBad) v.lines.insert(v.lines.end(), condLines.begin(), condLines.end());
    }
    else if (condBad)
    {
        v.cause = Cause::illConditioned;
        v.headline = "the stage equations are ill-conditioned or singular at the best iterate";
        v.lines = condLines;
    }
    else
    {
        v.cause = Cause::couldNotTell;
        v.headline = "could not tell why the column did not converge";
        if (std::isfinite(cond))
            v.lines.push_back("the Jacobian at the best iterate is well conditioned (condition number "
                              + num(cond, 3) + "), so the failure is not a singularity");
        if (f.seedFailed)
            v.lines.push_back("the constant-molal-overflow seed had not converged either");
    }
    if (v.cause != Cause::infeasibleSpecification && !softLines.empty())
    {
        v.lines.push_back("notices from this solve about the column's components (extrapolating a narrow"
                          " property window is routine and is not by itself a cause):");
        for (const auto& l : softLines) v.lines.push_back("  " + l);
    }
    v.lines.push_back(stats());
    return v;
}

std::string noBottomsSentence(const std::string& unit, double totalFeed,
                              double distillate, double sideDraws)
{
    return "column '" + unit + "': (A) the specification is physically infeasible: the distillate rate ("
        + num(distillate * 3600.0) + " kmol/h)"
        + (sideDraws > 0.0 ? " plus the side draws (" + num(sideDraws * 3600.0) + " kmol/h)" : std::string())
        + " is not less than the total feed (" + num(totalFeed * 3600.0)
        + " kmol/h), so by the overall balance nothing is left for the bottoms."
        "  Lower `distillateRate`, or raise the feed.";
}

std::string render(const Verdict& v, const std::string& unit)
{
    std::ostringstream o;
    o << "  [diagnosis] column '" << unit << "' did not converge: ";
    if (v.cause == Cause::couldNotTell) o << v.headline << ".\n";
    else o << "(" << letter(v.cause) << ") " << v.headline << ".\n";
    for (const auto& l : v.lines) o << "      - " << l << "\n";
    if (v.cause == Cause::couldNotTell)
    {
        o << "      what was tried:\n";
        for (const auto& t : v.tried) o << "        * " << t << "\n";
    }
    return o.str();
}

} // namespace Choupo::columnDiagnosis
