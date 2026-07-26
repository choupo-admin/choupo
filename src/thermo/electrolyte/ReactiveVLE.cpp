/*---------------------------------------------------------------------------*\
  ReactiveVLE -- coupled speciation + phase equilibrium (NH3/water spike).
  See ReactiveVLE.H for the contract.  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "thermo/electrolyte/ReactiveVLE.H"
#include "solver/NewtonND.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {
namespace electrolyte {

namespace {
constexpr scalar kAtm = 101325.0;   // Pa per atm (the PHREEQC gas-record basis)
}

ReactiveVLE::ReactiveVLE(ReactiveVLEConfig cfg)
:
    cfg_(std::move(cfg)),
    spec_(std::make_unique<SpeciationSolver>(cfg_.activityModel))
{
    // ---- Assembly-time verification (declare -> verify -> refuse) ---------
    //  Solve-time surprises are forbidden: every record the solve will need
    //  is checked HERE, with the curation remedy in the message.
    for (const auto appIdx : cfg_.volatiles)
    {
        //  An authorised nonreactive molecular volatile needs its own psat
        //  correlation instead of a gas-liquid record.
        if (cfg_.nonreactive.count(appIdx))
        {
            if (!cfg_.psatOf.count(appIdx))
                throw std::runtime_error("ReactiveVLE: nonreactive molecular"
                    " volatile '" + cfg_.apparent.at(appIdx) + "' has no"
                    " curated pure-component psat correlation -- the ideal"
                    " Raoult approximation cannot be priced.");
            continue;
        }
        if (!gasFor(appIdx))
            throw std::runtime_error("ReactiveVLE: volatile apparent component '"
                + cfg_.apparent.at(appIdx) + "' has NO gas-liquid equilibrium"
                " record (chemistry/, recordType gasLiquidEquilibrium, gas '"
                + (cfg_.gasOf.count(appIdx) ? cfg_.gasOf.at(appIdx)
                                            : cfg_.apparent.at(appIdx))
                + "') -- curate the record (PHREEQC"
                " PHASES convention, a = K * p[atm]) before declaring it"
                " volatile.");
    }
    for (const auto& fam : cfg_.families)
    {
        bool masterKnown = false;
        for (const auto& r : spec_->reactions())
            for (const auto& [m, nu] : r.masters)
                if (m == fam.master.key) { masterKnown = true; break; }
        if (!masterKnown)
            throw std::runtime_error("ReactiveVLE: apparent component '"
                + cfg_.apparent.at(fam.apparentIdx) + "' maps to master '"
                + fam.master.key + "', but NO speciation record references that"
                " master -- the chemistry set cannot map the family's true"
                " species back to the declared apparent-component basis.");
    }
}

ReactiveVLE::~ReactiveVLE() = default;

const GasEntry* ReactiveVLE::gasFor(std::size_t appIdx) const
{
    auto it = cfg_.gasOf.find(appIdx);
    if (it == cfg_.gasOf.end()) return nullptr;
    for (const auto& g : spec_->gases())
        if (g.gas == it->second) return &g;
    return nullptr;
}

// K(T) of a gas-liquid record: the SAME anchored doctrine as the speciation
// kernel (analytic anchored on logK25 > van't Hoff > flat), mirrored here so
// the two legs of one equilibrium network can never use different K(T) math.
scalar ReactiveVLE::gasLogK(const GasEntry& g, scalar T_K) const
{
    if (g.kt.hasAnalytic)
    {
        auto ana = [&](scalar T)
        {
            const auto& a = g.kt.a;
            return a[0] + a[1]*T + a[2]/T + a[3]*std::log10(T) + a[4]/(T*T)
                 + a[5]*T*T;
        };
        return g.logK25 + (ana(T_K) - ana(298.15));
    }
    if (g.hasDH)
    {
        constexpr scalar Rln10 = 8.314462618 * 2.302585093;
        return g.logK25 + g.dH / Rln10 * (1.0/298.15 - 1.0/T_K);
    }
    return g.logK25;
}

ReactiveVLEResult ReactiveVLE::solve(scalar T_K, scalar P_Pa, scalar F,
                                     const sVector& zApp, int verbosity) const
{
    const std::size_t nApp = cfg_.apparent.size();
    if (zApp.size() != nApp)
        throw std::runtime_error("ReactiveVLE: apparent composition size"
            " mismatch.");

    // Apparent mole amounts (basis F = 1 internally; scale-free split).
    sVector n(nApp);
    for (std::size_t i = 0; i < nApp; ++i) n[i] = std::max(zApp[i], 0.0);
    (void)F;

    const scalar nW = n[cfg_.solventIdx];
    if (nW <= 0.0)
        throw std::runtime_error("ReactiveVLE: the feed carries no solvent"
            " water -- an aqueous reactive equilibrium needs the solvent.");

    // ---- The INNER problem: liquid speciation at given liquid totals ------
    //  kgw from the un-vaporised solvent; each family's dissolved total in
    //  molality; closed system, pH SOLVED (electroneutrality inside).
    auto speciate = [&](const sVector& vap, SpeciationResult& out) -> void
    {
        const scalar liqW = nW - (cfg_.gasOf.count(cfg_.solventIdx)
                                  ? vap[cfg_.solventIdx] : 0.0);
        const scalar kgw  = liqW * cfg_.solventMW;   // mol * kg/mol = kg water
        if (kgw <= 1.0e-12)
            throw std::runtime_error("ReactiveVLE: the liquid solvent"
                " vanished during the phase iteration -- an all-vapour"
                " reactive state is outside this slice (name the case; the"
                " slice grows against it).");
        SpeciationInput in;
        in.T = T_K;
        in.solvePH = true;                            // electroneutrality ON
        in.stoichiometricTotals = true;               // bridge-derived, not a
                                                      //   lab analysis

        for (const auto& fam : cfg_.families)
        {
            const scalar liq = n[fam.apparentIdx] - vap[fam.apparentIdx];
            in.totals[fam.master] = std::max(liq, 0.0) / kgw;
        }
        out = spec_->solve(in, 0);                    // quiet inner kernel
    };

    // Activity of the DISSOLVED counterpart of a volatile: the solvent reads
    // a_w; a family volatile reads its NEUTRAL molecular species row (the
    // gas record's `dissolved` species -- e.g. NH3).
    auto dissolvedActivity = [&](std::size_t appIdx,
                                 const SpeciationResult& sr) -> scalar
    {
        if (appIdx == cfg_.solventIdx) return sr.aw;
        const GasEntry* g = gasFor(appIdx);
        for (const auto& row : sr.rows)
            if (row.name == g->species) return row.activity;
        throw std::runtime_error("ReactiveVLE: dissolved species '"
            + g->species + "' absent from the speciation result -- the"
            " chemistry set does not form it (curate the aqueousSpeciation"
            " record).");
    };

    // ---- Single-phase pre-check (bubble criterion) ------------------------
    //  At v = 0 the equilibrium partial pressures are p_i = a_i / K_i; if
    //  their sum cannot reach P the feed is a subsaturated liquid -- announce
    //  and return the all-liquid state (still fully speciated).
    ReactiveVLEResult res;
    res.xApp.assign(nApp, 0.0);
    res.yApp.assign(nApp, 0.0);
    {
        sVector v0(nApp, 0.0);
        SpeciationResult sr;
        speciate(v0, sr);
        scalar pSum = 0.0;
        for (const auto appIdx : cfg_.volatiles)
        {
            //  Authorised nonreactive molecular volatile: ideal Raoult on
            //  its own curated psat, gamma = 1 inside the one declared
            //  aqueous surface (announced at assembly by the resolver).
            if (cfg_.nonreactive.count(appIdx))
            {
                scalar nTot0 = 0.0; for (auto q : n) nTot0 += q;
                const scalar xI = n[appIdx] / nTot0;
                const scalar pI = xI * cfg_.psatOf.at(appIdx)(T_K) / kAtm;
                pSum += pI;
                res.pMolecularAtm[cfg_.apparent[appIdx]] = pI;
                if (verbosity >= 2)
                    std::cout << "  [reactive] " << cfg_.apparent[appIdx]
                              << ": ideal molecular VLE (authorised): p = x *"
                                 " psat = " << std::setprecision(4) << pI
                              << " atm  (x = " << xI << ")\n";
                continue;
            }
            const GasEntry* g = gasFor(appIdx);
            const scalar K  = std::pow(10.0, gasLogK(*g, T_K));
            const scalar pM = dissolvedActivity(appIdx, sr) / K;   // [atm]
            pSum += pM;
            // Carboxylic-acid VAPOUR DIMERISATION (2A = A2, K_dim = pD/pM^2):
            // at equilibrium over this liquid the dimer contributes its OWN
            // partial pressure.  Announced below; van't Hoff in T.
            if (g->hasDimer)
            {
                const scalar Kd = std::pow(10.0, g->dimLogK25
                    - (g->dimDH / (std::log(10.0) * 8.31446))
                      * (1.0/T_K - 1.0/298.15));
                const scalar pD = Kd * pM * pM;
                pSum += pD;
                res.dimerOn   = true;
                res.pMonoAtm  = pM;
                res.pDimerAtm = pD;
                if (verbosity >= 2)
                    std::cout << "  [reactive] " << cfg_.apparent[appIdx]
                              << " vapour dimerisation ON: p_mono = " << pM
                              << " atm, p_dimer = " << pD << " atm (K_dim = "
                              << Kd << " atm^-1; " << g->dimSource << ")\n";
            }
        }
        res.pEqSumAtm = pSum;
        if (pSum * kAtm <= P_Pa)
        {
            scalar nTot = 0.0; for (auto x : n) nTot += x;
            for (std::size_t i = 0; i < nApp; ++i) res.xApp[i] = n[i]/nTot;
            res.V_over_F  = 0.0;
            res.trueState = sr;
            res.pH        = sr.pH;
            res.converged = true;
            res.diagnostic = "single liquid (sum of equilibrium partial"
                " pressures " + std::to_string(pSum) + " atm below P)";
            if (verbosity >= 2)
                std::cout << "  [reactive] subsaturated liquid at (T,P):"
                             " no vapour phase forms (sum p_eq = "
                          << std::setprecision(4) << pSum << " atm)\n";
            return res;
        }
    }

    // ---- OUTER Newton: vaporised moles per volatile (log variables) -------
    //  Residual per volatile (log form, dimensionless):
    //      R = ln a_dissolved(liquid after removal) - ln( K(T) * y P[atm] )
    //  One residual evaluation = one inner speciation solve.
    const std::size_t nV = cfg_.volatiles.size();
    SpeciationResult srLast;
    // Unknowns: (ln V, softmax odds z_1..z_{m-1}) -- the CLASSICAL flash
    // coordinates, generalised to m volatiles (2026-07-26; the 2-volatile
    // logit is the m = 2 special case).  The first cut used raw (v_1, v_2)
    // and its Jacobian was near-singular at small V (the vapour RATIO
    // carries all the sensitivity, the AMOUNT almost none); with (V, y) the
    // amount couples through liquid DEPLETION and Sigma y = 1 is built into
    // the parametrisation.  y_k = exp(z_k)/Sigma exp(z_j), z_m = 0 pinned.
    scalar nTot = 0.0; for (auto x : n) nTot += x;
    auto unpack = [&](const sVector& u, sVector& vap)
    {
        vap.assign(nApp, 0.0);
        const scalar V  = std::min(std::exp(u[0]), 0.999*nTot);
        std::vector<scalar> w(nV, 1.0);              // z_{m-1} = 0 reference
        scalar wSum = 0.0;
        for (std::size_t k = 0; k + 1 < nV; ++k) w[k] = std::exp(u[k+1]);
        for (auto q : w) wSum += q;
        for (std::size_t k = 0; k < nV; ++k)
        {
            const std::size_t idx = cfg_.volatiles[k];
            vap[idx] = std::min(V * w[k]/wSum, 0.9995 * n[idx]);
        }
    };

    //  The dimerising volatile (at most one in this slice) and its K_dim(T).
    std::size_t dimIdx = nApp; scalar Kd = 0.0;
    for (const auto appIdx : cfg_.volatiles)
    {
        if (cfg_.nonreactive.count(appIdx)) continue;
        const GasEntry* g = gasFor(appIdx);
        if (!g->hasDimer) continue;
        if (dimIdx != nApp)
            throw std::runtime_error("ReactiveVLE: two dimerising volatiles"
                " -- this slice re-weights the vapour balance for ONE"
                " (cross-association is a later, deliberate slice).");
        dimIdx = appIdx;
        Kd = std::pow(10.0, g->dimLogK25
                 - (g->dimDH / (std::log(10.0) * 8.31446))
                   * (1.0/T_K - 1.0/298.15));
    }

    //  TRUE vapour composition under dimerisation: the apparent vaporised
    //  moles of the dimerising volatile split as v_d = t_mono + 2 t_dim,
    //  with the vapour-phase equilibrium p_dim = K_dim p_mono^2 (partial
    //  pressures over the TRUE mole count tau = S + t_mono + t_dim, S = the
    //  other volatiles' moles).  g(t_mono) = (v_d - t_mono)/2
    //  - K_dim P t_mono^2 / tau is monotone with a bracketed sign change --
    //  bisection is exact enough and never escapes (0, v_d].
    struct TrueVap { scalar tMono, tDim, tau; };
    auto trueVapour = [&](const sVector& vap) -> TrueVap
    {
        scalar S = 0.0;
        for (const auto appIdx : cfg_.volatiles)
            if (appIdx != dimIdx) S += vap[appIdx];
        if (dimIdx == nApp) return { 0.0, 0.0, S };
        const scalar vd = vap[dimIdx];
        if (vd <= 0.0) return { 0.0, 0.0, S };
        const scalar Patm = P_Pa / kAtm;
        auto g = [&](scalar tm)
        {
            const scalar tau = S + tm + (vd - tm)/2.0;
            return (vd - tm)/2.0 - Kd * Patm * tm*tm / std::max(tau, 1e-300);
        };
        scalar lo = 0.0, hi = vd;
        for (int b = 0; b < 80; ++b)
        {
            const scalar mid = 0.5*(lo + hi);
            (g(mid) > 0.0 ? lo : hi) = mid;
        }
        const scalar tm = 0.5*(lo + hi);
        const scalar td = (vd - tm)/2.0;
        return { tm, td, S + tm + td };
    };

    auto residual = [&](const sVector& u) -> sVector
    {
        sVector vap; unpack(u, vap);
        // A TRIAL point may be unphysical (a step that nearly dries the
        // solvent sends molalities -> infinity and the Davies fixed point
        // diverges).  A diverging trial is NOT a failed solve: return a huge
        // residual so the damped outer Newton backtracks away from it.  Only
        // a divergence AT the accepted solution surfaces as a real refusal.
        try { speciate(vap, srLast); }
        catch (const std::exception&)
        { return sVector(nV, 1.0e6); }
        const TrueVap tv = trueVapour(vap);
        const scalar tau = std::max(tv.tau, 1.0e-300);
        scalar lTot = 0.0;
        for (std::size_t i = 0; i < nApp; ++i) lTot += n[i] - vap[i];
        sVector r(nV);
        for (std::size_t k = 0; k < nV; ++k)
        {
            const std::size_t idx = cfg_.volatiles[k];
            //  TRUE partial pressure of the transferring molecule [atm]:
            //  the dimerising volatile equilibrates through its MONOMER.
            const scalar tK = (idx == dimIdx) ? tv.tMono : vap[idx];
            const scalar pA = (tK / tau) * P_Pa / kAtm;
            if (cfg_.nonreactive.count(idx))
            {
                //  Authorised ideal molecular VLE: x * psat = p  (gamma = 1
                //  within the one declared aqueous surface, announced).
                const scalar x = (n[idx] - vap[idx]) / std::max(lTot, 1e-300);
                const scalar pR = x * cfg_.psatOf.at(idx)(T_K) / kAtm;
                r[k] = std::log(std::max(pR, 1.0e-300))
                     - std::log(std::max(pA, 1.0e-300));
                continue;
            }
            const scalar K  = std::pow(10.0, gasLogK(*gasFor(idx), T_K));
            r[k] = std::log(std::max(dissolvedActivity(idx, srLast), 1.0e-300))
                 - std::log(std::max(K * pA, 1.0e-300));
        }
        return r;
    };

    // Seed: V = 2 % of the feed, vapour ratio from the feed ratio of the
    // volatiles.  The OUTER Newton is hand-damped: FD Jacobian, half-step
    // backtracking on the residual norm, and every trial caged (V and each
    // v_i capped inside unpack -- the liquid never vanishes under the
    // solver's feet; a genuine all-vapour state still refuses loudly).
    auto norm2 = [](const sVector& r)
    { scalar s = 0; for (auto v : r) s += v*v; return std::sqrt(s); };
    sVector u(nV, 0.0);
    u[0] = std::log(0.02 * nTot);
    {
        // PHYSICAL seed: speciate the un-vaporised feed once and start the
        // apparent vapour ratio from the equilibrium partial pressures --
        // p_k = a_k/K_k for the network volatiles (the dimerising one adds
        // 2 p_dim: two apparent moles ride each dimer), x*psat for the
        // authorised molecular co-volatile.  The old feed-RATIO seed put a
        // barely-volatile solute (acetic, y ~ 1e-3) three decades from its
        // solution and the damped Newton stalled against the near-dry cage.
        sVector vap0(nApp, 0.0);
        speciate(vap0, srLast);
        std::vector<scalar> p(nV, 0.0);
        scalar lT0 = 0.0; for (auto q : n) lT0 += q;
        for (std::size_t k = 0; k < nV; ++k)
        {
            const std::size_t idx = cfg_.volatiles[k];
            if (cfg_.nonreactive.count(idx))
            {
                p[k] = (n[idx]/lT0) * cfg_.psatOf.at(idx)(T_K) / kAtm;
                continue;
            }
            const scalar K = std::pow(10.0, gasLogK(*gasFor(idx), T_K));
            p[k] = dissolvedActivity(idx, srLast) / std::max(K, 1.0e-300);
            if (idx == dimIdx)
                p[k] += 2.0 * Kd * p[k] * p[k];      // apparent moles / dimer
        }
        scalar pSum = 0.0; for (auto q : p) pSum += q;
        for (std::size_t k = 0; k + 1 < nV; ++k)
        {
            const scalar yk = std::min(1.0 - 1e-6,
                std::max(1e-9, p[k] / std::max(pSum, 1e-300)));
            const scalar ym = std::min(1.0 - 1e-6,
                std::max(1e-9, p[nV-1] / std::max(pSum, 1e-300)));
            u[k+1] = std::log(yk / ym);              // odds vs the reference
        }
    }
    const scalar uLo = -30.0, uHi = 30.0;
    sVector r = residual(u);
    scalar rn = norm2(r);
    bool convergedOuter = false;
    int  it = 0;
    const int maxIt = 60;
    for (; it < maxIt && !convergedOuter; ++it)
    {
        if (verbosity >= 3)
            std::cout << "  [reactive] outer " << std::setw(2) << it
                      << "   |r|2 = " << std::scientific
                      << std::setprecision(3) << rn << "\n";
        if (rn < 1.0e-9) { convergedOuter = true; break; }
        // FD Jacobian (nV x nV)
        std::vector<sVector> J(nV, sVector(nV, 0.0));
        for (std::size_t j = 0; j < nV; ++j)
        {
            const scalar h = 1.0e-6 * std::max(1.0, std::abs(u[j]));
            sVector up = u; up[j] += h;
            const sVector rp = residual(up);
            for (std::size_t i = 0; i < nV; ++i)
                J[i][j] = (rp[i] - r[i]) / h;
        }
        // Solve J du = -r  (small-n Gauss with partial pivoting -- the
        // outer system is m x m, m = number of volatiles).
        sVector du(nV, 0.0);
        {
            std::vector<sVector> A = J;
            sVector b(nV);
            for (std::size_t i = 0; i < nV; ++i) b[i] = -r[i];
            for (std::size_t c = 0; c < nV; ++c)
            {
                std::size_t piv = c;
                for (std::size_t i2 = c+1; i2 < nV; ++i2)
                    if (std::abs(A[i2][c]) > std::abs(A[piv][c])) piv = i2;
                std::swap(A[c], A[piv]); std::swap(b[c], b[piv]);
                if (std::abs(A[c][c]) < 1.0e-300)
                    throw std::runtime_error("ReactiveVLE: singular outer"
                        " Jacobian -- the phase-equilibrium system is"
                        " degenerate at this state.");
                for (std::size_t i2 = c+1; i2 < nV; ++i2)
                {
                    const scalar f = A[i2][c] / A[c][c];
                    for (std::size_t j2 = c; j2 < nV; ++j2)
                        A[i2][j2] -= f * A[c][j2];
                    b[i2] -= f * b[c];
                }
            }
            for (std::size_t i2 = nV; i2-- > 0; )
            {
                scalar s = b[i2];
                for (std::size_t j2 = i2+1; j2 < nV; ++j2)
                    s -= A[i2][j2] * du[j2];
                du[i2] = s / A[i2][i2];
            }
        }
        if (verbosity >= 4)
        {
            std::cout << "    r  = (";
            for (std::size_t i2 = 0; i2 < nV; ++i2)
                std::cout << (i2 ? ", " : "") << r[i2];
            std::cout << ")\n    du = (";
            for (std::size_t i2 = 0; i2 < nV; ++i2)
                std::cout << (i2 ? ", " : "") << du[i2];
            std::cout << ")\n";
        }
        // TRUST-REGION clamp before the line search: near the bubble point
        // the residual is almost flat along ln V (J00 ~ -V/L), so a raw
        // Newton step can multiply V by e^30 and slam into the near-dry
        // cage, where every backtracked trial is worse and the solve stalls.
        // Capping each component of du at 2 (one step never scales V or the
        // vapour-ratio odds by more than e^2 ~ 7.4x) keeps the iteration
        // inside the region where the FD Jacobian means something.
        scalar duInf = 0.0;
        for (std::size_t j = 0; j < nV; ++j)
            duInf = std::max(duInf, std::abs(du[j]));
        if (duInf > 2.0)
        {
            const scalar sc = 2.0 / duInf;   // SCALE, never clip per-component
            for (std::size_t j = 0; j < nV; ++j) du[j] *= sc;
        }
        // Backtracking line search on |r| with the u-cage applied per trial.
        scalar lambda = 1.0;
        bool accepted = false;
        for (int ls = 0; ls < 12; ++ls, lambda *= 0.5)
        {
            sVector ut(nV);
            for (std::size_t j = 0; j < nV; ++j)
                ut[j] = std::min(uHi, std::max(uLo, u[j] + lambda*du[j]));
            const sVector rt = residual(ut);
            const scalar rtn = norm2(rt);
            if (rtn < rn * (1.0 - 1.0e-4) || rtn < 1.0e-12)
            { u = ut; r = rt; rn = rtn; accepted = true; break; }
        }
        if (!accepted)
            break;                       // stalled -- joint check decides
    }

    // ---- JOINT acceptance: re-evaluate EVERYTHING at the answer -----------
    sVector vap; unpack(u, vap);
    const sVector rFin = residual(u);                // also refreshes srLast
    scalar rMax = 0.0; for (auto rv : rFin) rMax = std::max(rMax, std::abs(rv));
    const bool jointOK = rMax < 1.0e-7;
    struct { int iterations; } sol{ it };

    scalar vTot = 0.0, lTot = 0.0;
    for (std::size_t i = 0; i < nApp; ++i)
    { vTot += vap[i]; lTot += n[i] - vap[i]; }
    for (std::size_t i = 0; i < nApp; ++i)
    {
        res.yApp[i] = vTot > 0 ? vap[i]/vTot : 0.0;
        res.xApp[i] = lTot > 0 ? (n[i]-vap[i])/lTot : 0.0;
    }
    res.V_over_F     = vTot / (vTot + lTot);
    res.pEqSumAtm    = P_Pa / kAtm;      // two-phase: vapour partials sum to P
    //  TRUE vapour bookkeeping at the answer: monomer/dimer partial
    //  pressures, the co-volatile's contribution, and the dimer moles that
    //  price the vapour-enthalpy correction (exact: h_dim = 2 h_mono + dH).
    {
        const TrueVap tvF = trueVapour(vap);
        if (tvF.tau > 0.0)
        {
            if (dimIdx != nApp)
            {
                res.dimerOn   = true;
                res.pMonoAtm  = tvF.tMono / tvF.tau * P_Pa / kAtm;
                res.pDimerAtm = tvF.tDim  / tvF.tau * P_Pa / kAtm;
                res.vapDimerMolPerMolFeed = tvF.tDim / std::max(nTot, 1e-300);
                res.dimDH_J   = gasFor(dimIdx)->dimDH;
            }
            for (const auto appIdx : cfg_.volatiles)
                if (cfg_.nonreactive.count(appIdx))
                    res.pMolecularAtm[cfg_.apparent[appIdx]] =
                        vap[appIdx] / tvF.tau * P_Pa / kAtm;
        }
    }
    res.trueState    = srLast;
    res.pH           = srLast.pH;
    res.resPhaseMax  = rMax;
    res.iterations   = sol.iterations;
    res.converged    = jointOK;
    res.diagnostic   = jointOK ? "coupled speciation + VLE converged (joint"
                                 " residual check passed)"
                               : "JOINT residuals NOT satisfied";
    if (!jointOK)
        throw std::runtime_error("ReactiveVLE: coupled speciation + phase"
            " equilibrium did NOT converge (|r|max = " + std::to_string(rMax)
            + " after " + std::to_string(sol.iterations) + " outer"
            " iterations) -- no partial answer is returned.");

    // ---- The announce block (the glass-box contract of this feature) ------
    if (verbosity >= 1)
    {
        std::cout << "\nReactive electrolyte equilibrium:\n"
                  << "  apparent components:";
        for (const auto& a : cfg_.apparent) std::cout << " " << a;
        std::cout << "\n  model aqueous species:";
        for (const auto& row : srLast.rows) std::cout << " " << row.name;
        std::cout << "\n  volatile molecular species:";
        for (const auto idx : cfg_.volatiles)
            std::cout << " " << cfg_.apparent[idx];
        std::cout << "\n  chemical reactions: " << spec_->reactions().size()
                  << " (network in force)"
                  << "\n  electroneutrality: enforced (pH solved = "
                  << std::fixed << std::setprecision(3) << srLast.pH << ")"
                  << "\n  representation written to streams: apparent\n";
        if (verbosity >= 2)
        {
            std::cout << "  true-state table (molality / gamma / activity):\n";
            for (const auto& row : srLast.rows)
                std::cout << "    " << std::left << std::setw(8) << row.name
                          << std::scientific << std::setprecision(4)
                          << row.molality << "  " << row.gamma << "  "
                          << row.activity << "\n";
            std::cout << "  V/F = " << std::fixed << std::setprecision(6)
                      << res.V_over_F << "   |r|max(joint) = "
                      << std::scientific << std::setprecision(2) << rMax
                      << "\n";
        }
    }
    return res;
}

} // namespace electrolyte
} // namespace Choupo
