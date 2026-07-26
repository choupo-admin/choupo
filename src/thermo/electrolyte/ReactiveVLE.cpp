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
        if (!gasFor(appIdx))
            throw std::runtime_error("ReactiveVLE: volatile apparent component '"
                + cfg_.apparent.at(appIdx) + "' has NO gas-liquid equilibrium"
                " record (chemistry/, recordType gasLiquidEquilibrium, gas '"
                + cfg_.gasOf.at(appIdx) + "') -- curate the record (PHREEQC"
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
                if (verbosity >= 2)
                    std::cout << "  [reactive] " << cfg_.apparent[appIdx]
                              << " vapour dimerisation ON: p_mono = " << pM
                              << " atm, p_dimer = " << pD << " atm (K_dim = "
                              << Kd << " atm^-1; " << g->dimSource << ")\n";
            }
        }
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
    // Unknowns: (ln V, logit y_1) -- the CLASSICAL flash coordinates.  The
    // first cut used (v_1, v_2) directly and its Jacobian was near-singular
    // at small V (the vapour RATIO carries all the sensitivity, the AMOUNT
    // almost none -- det ~ 1e-4 and the step exploded).  With (V, y) the
    // amount couples through liquid DEPLETION (strong, well-conditioned)
    // and Sigma y = 1 is built into the parametrisation.
    scalar nTot = 0.0; for (auto x : n) nTot += x;
    auto unpack = [&](const sVector& u, sVector& vap)
    {
        vap.assign(nApp, 0.0);
        const scalar V  = std::min(std::exp(u[0]), 0.999*nTot);
        const scalar y1 = (nV == 2) ? 1.0/(1.0 + std::exp(-u[1])) : 1.0;
        const scalar yk[2] = { y1, 1.0 - y1 };
        for (std::size_t k = 0; k < nV; ++k)
        {
            const std::size_t idx = cfg_.volatiles[k];
            vap[idx] = std::min(V * yk[k], 0.9995 * n[idx]);
        }
    };
    for (const auto appIdx : cfg_.volatiles)
        if (gasFor(appIdx)->hasDimer)
            throw std::runtime_error("ReactiveVLE: volatile '"
                + cfg_.apparent[appIdx] + "' declares vapour dimerisation,"
                  " which this slice prices only in the saturation check"
                  " (single-liquid regime).  A TWO-PHASE reactive flash with"
                  " a dimerising vapour re-weights the vapour mole balance"
                  " (apparent moles = n_mono + 2 n_dim) and is a later,"
                  " deliberate slice -- no silent approximation is run.");
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
        scalar vTot = 0.0;
        for (const auto appIdx : cfg_.volatiles) vTot += vap[appIdx];
        sVector r(nV);
        for (std::size_t k = 0; k < nV; ++k)
        {
            const std::size_t idx = cfg_.volatiles[k];
            const scalar y  = vap[idx] / std::max(vTot, 1.0e-300);
            const scalar pA = y * P_Pa / kAtm;                    // [atm]
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
    if (nV == 2)
    {
        // PHYSICAL seed: speciate the un-vaporised feed once and start the
        // vapour ratio from the equilibrium partial pressures p_k = a_k/K_k
        // -- the Raoult-like estimate the announce block already prints.  The
        // old feed-RATIO seed put a barely-volatile solute (acetic acid,
        // y ~ 1e-3) three decades from its solution and the damped Newton
        // stalled against the near-dry cage.
        sVector vap0(nApp, 0.0);
        speciate(vap0, srLast);
        scalar p[2] = { 0.0, 0.0 };
        for (std::size_t k = 0; k < 2; ++k)
        {
            const std::size_t idx = cfg_.volatiles[k];
            const scalar K = std::pow(10.0, gasLogK(*gasFor(idx), T_K));
            p[k] = dissolvedActivity(idx, srLast) / std::max(K, 1.0e-300);
        }
        const scalar y1seed = std::min(1.0 - 1.0e-6, std::max(1.0e-6,
            p[0] / std::max(p[0] + p[1], 1.0e-300)));
        u[1] = std::log(y1seed/(1.0 - y1seed));
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
        // Solve J du = -r  (2x2 direct; general small-n Gauss otherwise)
        sVector du(nV, 0.0);
        if (nV == 1) du[0] = -r[0] / J[0][0];
        else if (nV == 2)
        {
            const scalar det = J[0][0]*J[1][1] - J[0][1]*J[1][0];
            if (std::abs(det) < 1.0e-300)
                throw std::runtime_error("ReactiveVLE: singular outer"
                    " Jacobian -- the phase-equilibrium system is"
                    " degenerate at this state.");
            du[0] = (-r[0]*J[1][1] + r[1]*J[0][1]) / det;
            du[1] = (-r[1]*J[0][0] + r[0]*J[1][0]) / det;
        }
        else
            throw std::runtime_error("ReactiveVLE: this slice solves up to"
                " 2 volatiles (found " + std::to_string(nV) + ").");
        if (verbosity >= 4)
        {
            std::cout << "    r  = (" << r[0] << (nV > 1 ? ", " : "")
                      << (nV > 1 ? std::to_string(r[1]) : "") << ")\n    J  = ["
                      << J[0][0] << (nV > 1 ? " " + std::to_string(J[0][1]) : "");
            if (nV > 1) std::cout << "; " << J[1][0] << " " << J[1][1];
            std::cout << "]\n    du = (" << du[0]
                      << (nV > 1 ? ", " + std::to_string(du[1]) : "") << ")\n";
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
