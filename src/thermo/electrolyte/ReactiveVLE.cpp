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
                " record (chemistry/, recordType gasLiquidEquilibrium,"
                " gasSpecies '"
                + (cfg_.gasOf.count(appIdx) ? cfg_.gasOf.at(appIdx)
                                            : cfg_.apparent.at(appIdx))
                + "') -- curate the record (PHREEQC"
                " PHASES convention, a = K * p[atm]) before declaring it"
                " volatile.");
    }
    //  Every master a component maps onto must be reachable in the chemistry
    //  set -- checked per TERM now that a component may span several
    //  (general salt reconstruction).  A salt naming a master no record
    //  references is exactly the "chemistry cannot map back" failure, and it
    //  must name the offending term, not the component alone.
    for (const auto& fam : cfg_.families)
        for (const auto& [master, nu] : fam.mapping)
        {
            (void)nu;
            bool masterKnown = false;
            for (const auto& r : spec_->reactions())
                for (const auto& [m, rnu] : r.masters)
                    if (m == master.key) { masterKnown = true; break; }
            if (!masterKnown)
                throw std::runtime_error("ReactiveVLE: apparent component '"
                    + cfg_.apparent.at(fam.apparentIdx) + "' maps to master '"
                    + master.key + "', but NO speciation record references that"
                    " master -- the chemistry set cannot map the family's true"
                    " species back to the declared apparent-component basis.");
        }
}

ReactiveVLE::~ReactiveVLE() = default;

std::vector<std::pair<std::string, scalar>>
ReactiveVLE::masterComposition(const std::string& species) const
{
    //  A DERIVED species is defined by its formation reaction, and that
    //  reaction's master list IS its composition on the master basis.
    for (const auto& r : spec_->reactions())
        if (r.species == species)
        {
            std::vector<std::pair<std::string, scalar>> out;
            for (const auto& [m, nu] : r.masters) out.emplace_back(m, nu);
            return out;
        }
    //  Otherwise it is a MASTER itself, if any reaction names it as one.
    //  (Asking the reaction list rather than assuming: a name that appears
    //  nowhere in the network is not silently promoted to a master here.)
    for (const auto& r : spec_->reactions())
        for (const auto& [m, nu] : r.masters)
        {
            (void)nu;
            if (m == species) return {{ species, 1.0 }};
        }
    return {};
}

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
    //  DIAGNOSTIC VERBOSITY of the inner speciation, over the outer Newton's
    //  hundreds of calls.  It used to be "verbose on the FIRST call, silent
    //  after", which printed the activation trace once (right) but ALSO
    //  printed the pH, the ionic strength, a_w, the species count and the
    //  whole SI table from that first call -- the INITIAL GUESS, reported as
    //  though it were the answer.  In flash09 the block said pH 10.164 while
    //  the converged summary said 9.900; with a salt in the system the gap
    //  reached 1.7 pH units and the SI table was the saturation state of a
    //  guess.  A glass box that shows the wrong number is worse than one that
    //  shows none (found by the flash14 spike, 2026-07-27).
    //
    //  Now: the FIRST call carries the trace, the middle calls are silent,
    //  and the FINAL call -- on the converged state -- carries the result
    //  diagnostics with the trace suppressed (it has already printed).
    int  innerVerbosity = verbosity;      // first call: trace + diagnostics
    bool announceClosure = true;
    bool traced = false;                      // the activation trace prints ONCE
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

        //  m = A n.  ACCUMULATE (`+=`, not `=`): with a general mapping two
        //  components may feed the SAME family total -- CO2 and CaCO3 both
        //  doing carbonate is precisely that -- and each contributes with its
        //  own stoichiometric coefficient.  With every component 1-master and
        //  nu = +1 this is byte-identical to the assignment it replaces.
        for (const auto& fam : cfg_.families)
        {
            const scalar liq = std::max(n[fam.apparentIdx]
                                        - vap[fam.apparentIdx], 0.0);
            for (const auto& [master, nu] : fam.mapping)
                in.totals[master] += nu * liq / kgw;
        }
        //  The inner kernel is QUIET (it runs hundreds of times inside the
        //  Newton) -- except on the very FIRST call, which carries the run's
        //  verbosity so the closure can print its ACTIVATION TRACE once: the
        //  student sees which equilibria the assembly put in the problem and
        //  why, instead of a bare count.
        //  Ask for precipitation when the case admits solids.  Empty list =
        //  the kernel's phase-free path, untouched.
        in.equilibrate = cfg_.admittedSolids;
        in.announceClosure = announceClosure;
        out = spec_->solve(in, innerVerbosity);
        if (!traced) { traced = true; innerVerbosity = 0; announceClosure = false; }
    };

    auto backbonePos = [&](std::size_t appIdx) -> std::size_t
    {
        for (std::size_t b = 0; b < cfg_.backbone.size(); ++b)
            if (cfg_.backbone[b] == appIdx) return b;
        return cfg_.backbone.size();
    };
    const std::size_t nBk = cfg_.backbone.size();
    auto gammaOf = [&](const sVector& x) -> sVector
    {
        if (cfg_.molecularGamma) return cfg_.molecularGamma(T_K, x);
        return sVector(std::max<std::size_t>(nBk, 1), 1.0);
    };
    auto backboneMoles = [&](const sVector& vap) -> sVector
    {
        sVector nBl(std::max<std::size_t>(nBk, 1), 0.0);
        for (std::size_t b = 0; b < nBk; ++b)
            nBl[b] = std::max(n[cfg_.backbone[b]] - vap[cfg_.backbone[b]], 0.0);
        return nBl;
    };

    //  ---- THE LIQUID STATE, one phase or two -------------------------------
    //  The MOLECULAR BACKBONE (mixed-solvent v1) is the ion-free mixture of
    //  the solvent and the nonreactive co-volatiles.  When the case declares a
    //  second liquid, that mixture is what SPLITS: the aqueous liquid keeps
    //  the whole backbone (and the ions), the organic one holds the declared
    //  members only.  Both are priced by the SAME molecular model, because the
    //  coupling is an equality of ACTIVITY.
    //
    //  What the split does NOT do is change the stream table.  The two liquids
    //  leave as ONE apparent liquid, exactly as the speciation's ions leave as
    //  apparent components: an internal state, reported, never persisted.  So
    //  the outer Newton keeps its dimension and every reactive case that
    //  declares no organic phase takes a path indistinguishable from the one
    //  it took before this existed.
    struct LiquidState
    {
        sVector xAq, gAq;              // aqueous backbone, ion-free x
        sVector xOrg, gOrg;            // organic phase, same indexing
        sVector nAq, nOrg;             // the amounts behind those fractions
        bool    split = false;
    };
    std::vector<std::size_t> orgPos;                 // backbone positions
    for (const auto m : cfg_.organic.members)
    {
        const std::size_t b = backbonePos(m);
        if (b < nBk) orgPos.push_back(b);
    }
    const std::size_t nOrgM = orgPos.size();

    auto singleLiquid = [&](const sVector& nBl, LiquidState& ls)
    {
        ls = LiquidState{};
        ls.xAq.assign(std::max<std::size_t>(nBk, 1), 1.0);
        ls.gAq.assign(std::max<std::size_t>(nBk, 1), 1.0);
        ls.nAq = nBl;
        if (nBk == 0) return;
        scalar s = 0.0;
        for (std::size_t b = 0; b < nBk; ++b) s += nBl[b];
        if (s <= 0.0) return;
        for (std::size_t b = 0; b < nBk; ++b) ls.xAq[b] = nBl[b]/s;
        ls.gAq = gammaOf(ls.xAq);
    };

    //  Gibbs energy of a liquid state, in RT units and per the amounts given:
    //  G/RT = SUM n_i ln(gamma_i x_i).  It is what decides whether the second
    //  liquid is worth having -- a converged split that does not LOWER it is a
    //  root of the equality equations without being the equilibrium.
    auto gibbsOf = [&](const LiquidState& ls) -> scalar
    {
        scalar g = 0.0;
        for (std::size_t b = 0; b < nBk; ++b)
        {
            if (ls.nAq[b] > 0.0)
                g += ls.nAq[b]
                   * std::log(std::max(ls.gAq[b]*ls.xAq[b], 1.0e-300));
            if (ls.split && !ls.nOrg.empty() && ls.nOrg[b] > 0.0)
                g += ls.nOrg[b]
                   * std::log(std::max(ls.gOrg[b]*ls.xOrg[b], 1.0e-300));
        }
        return g;
    };

    //  The split itself: unknowns t_j = ln(organic moles of member j),
    //  equations the equality of activity across the two liquids.  A Newton,
    //  NOT a minimisation -- the minimisation is what DECIDES the phase
    //  (below); once the basin is known the equalities are smooth and solve to
    //  machine precision, and that precision is what the OUTER finite-
    //  difference Jacobian needs.  A loosely-converged inner solve is noise in
    //  the outer gradient and the outer descent dies on it.
    auto splitFrom = [&](const sVector& nBl, const sVector& seedOrg,
                         LiquidState& lsOut) -> bool
    {
        const std::size_t M = nOrgM;
        if (M == 0) return false;
        sVector t(M);
        for (std::size_t j = 0; j < M; ++j)
            t[j] = std::log(std::max(seedOrg[j], 1.0e-14));
        auto eval = [&](const sVector& tv, sVector& f, LiquidState& ls) -> bool
        {
            ls = LiquidState{};
            ls.nOrg.assign(nBk, 0.0);
            ls.nAq = nBl;
            for (std::size_t j = 0; j < M; ++j)
            {
                const std::size_t b = orgPos[j];
                ls.nOrg[b] = std::min(std::exp(tv[j]), 0.999999*nBl[b]);
                ls.nAq[b]  = nBl[b] - ls.nOrg[b];
            }
            scalar sA = 0.0, sO = 0.0;
            for (std::size_t b = 0; b < nBk; ++b)
            { sA += ls.nAq[b]; sO += ls.nOrg[b]; }
            if (sA <= 1.0e-300 || sO <= 1.0e-300) return false;
            ls.xAq.assign(nBk, 0.0); ls.xOrg.assign(nBk, 0.0);
            for (std::size_t b = 0; b < nBk; ++b)
            { ls.xAq[b] = ls.nAq[b]/sA; ls.xOrg[b] = ls.nOrg[b]/sO; }
            ls.gAq  = gammaOf(ls.xAq);
            ls.gOrg = gammaOf(ls.xOrg);
            ls.split = true;
            f.assign(M, 0.0);
            for (std::size_t j = 0; j < M; ++j)
            {
                const std::size_t b = orgPos[j];
                f[j] = std::log(std::max(ls.gOrg[b]*ls.xOrg[b], 1.0e-300))
                     - std::log(std::max(ls.gAq [b]*ls.xAq [b], 1.0e-300));
            }
            return true;
        };
        auto nrm = [](const sVector& v)
        { scalar s = 0.0; for (auto q : v) s += q*q; return std::sqrt(s); };
        sVector f; LiquidState ls;
        if (!eval(t, f, ls)) return false;
        scalar fn = nrm(f);
        for (int itS = 0; itS < 200 && fn > 1.0e-13; ++itS)
        {
            std::vector<sVector> J(M, sVector(M, 0.0));
            for (std::size_t jc = 0; jc < M; ++jc)
            {
                const scalar h = 1.0e-7 * std::max(1.0, std::abs(t[jc]));
                sVector tp = t; tp[jc] += h;
                sVector fp; LiquidState lp;
                if (!eval(tp, fp, lp)) return false;
                for (std::size_t ir = 0; ir < M; ++ir)
                    J[ir][jc] = (fp[ir] - f[ir]) / h;
            }
            sVector dt(M, 0.0);
            {
                std::vector<sVector> A = J;
                sVector b2(M);
                for (std::size_t i2 = 0; i2 < M; ++i2) b2[i2] = -f[i2];
                bool singular = false;
                for (std::size_t c = 0; c < M && !singular; ++c)
                {
                    std::size_t piv = c;
                    for (std::size_t i2 = c+1; i2 < M; ++i2)
                        if (std::abs(A[i2][c]) > std::abs(A[piv][c])) piv = i2;
                    std::swap(A[c], A[piv]); std::swap(b2[c], b2[piv]);
                    if (std::abs(A[c][c]) < 1.0e-300) { singular = true; break; }
                    for (std::size_t i2 = c+1; i2 < M; ++i2)
                    {
                        const scalar fac = A[i2][c] / A[c][c];
                        for (std::size_t j2 = c; j2 < M; ++j2)
                            A[i2][j2] -= fac * A[c][j2];
                        b2[i2] -= fac * b2[c];
                    }
                }
                if (singular) break;
                for (std::size_t i2 = M; i2-- > 0; )
                {
                    scalar s = b2[i2];
                    for (std::size_t j2 = i2+1; j2 < M; ++j2)
                        s -= A[i2][j2] * dt[j2];
                    dt[i2] = s / A[i2][i2];
                }
            }
            for (auto& d : dt) d = std::max(-3.0, std::min(3.0, d));
            scalar lam = 1.0; bool ok = false;
            for (int lsr = 0; lsr < 24; ++lsr, lam *= 0.5)
            {
                sVector tt(M);
                for (std::size_t j = 0; j < M; ++j) tt[j] = t[j] + lam*dt[j];
                sVector ft; LiquidState lt;
                if (!eval(tt, ft, lt)) continue;
                const scalar ftn = nrm(ft);
                if (ftn < fn) { t = tt; f = ft; ls = lt; fn = ftn; ok = true; break; }
            }
            if (!ok) break;
        }
        if (fn > 1.0e-9) return false;
        //  The TRIVIAL root: two phases of the same composition is one phase
        //  wearing two names, and it satisfies every equality exactly.  It is
        //  the K = 1 saddle this repository already documents on the molecular
        //  path, and it is rejected here by inspection, not by luck.
        scalar dmax = 0.0;
        for (const auto b : orgPos)
            dmax = std::max(dmax, std::abs(ls.xOrg[b] - ls.xAq[b]));
        if (dmax < 1.0e-6) return false;
        lsOut = ls;
        return true;
    };

    //  The seeds.  DETERMINISTIC, and deliberately not warm-started from the
    //  previous outer trial: a residual that remembers where the solver came
    //  from is path-dependent, and a path-dependent residual has no finite-
    //  difference Jacobian worth the name.
    auto splitBest = [&](const sVector& nBl, LiquidState& lsOut) -> bool
    {
        bool found = false;
        LiquidState best; scalar gBest = 0.0;
        for (const scalar frac : { 0.99, 0.90, 0.50, 0.10 })
        {
            sVector seed(nOrgM);
            for (std::size_t j = 0; j < nOrgM; ++j)
                seed[j] = frac * nBl[orgPos[j]];
            LiquidState ls;
            if (!splitFrom(nBl, seed, ls)) continue;
            const scalar g = gibbsOf(ls);
            if (!found || g < gBest) { found = true; best = ls; gBest = g; }
        }
        if (found) lsOut = best;
        return found;
    };

    //  ---- THE PHASE DECISION, taken ONCE ------------------------------------
    //  Whether the declared second liquid EXISTS is decided on the feed, and
    //  the phase set is then held for the whole solve.  Deciding it inside the
    //  residual puts a step discontinuity in the function the outer Newton
    //  differentiates, and a residual with a step in it has no descent
    //  direction anywhere near the step.  This is the order the molecular path
    //  already uses: the stability test decides, then the solve runs.
    bool twoLiquids = false;
    auto splitWanted = [&](const sVector& vap, LiquidState& two,
                           scalar& g1, scalar& g2, bool& got) -> bool
    {
        got = false; g1 = 0.0; g2 = 0.0;
        if (nOrgM == 0) return false;
        const sVector nBl = backboneMoles(vap);
        LiquidState one; singleLiquid(nBl, one);
        g1 = gibbsOf(one);
        got = splitBest(nBl, two);
        if (!got) return false;
        g2 = gibbsOf(two);
        return g2 < g1 - 1.0e-10*std::max(1.0, std::abs(g1));
    };
    auto announcePhases = [&](const char* where, const sVector& vap)
    {
        if (verbosity < 2 || nOrgM == 0) return;
        LiquidState two; scalar g1 = 0.0, g2 = 0.0; bool got = false;
        const bool want = splitWanted(vap, two, g1, g2, got);
        std::cout << "  [phases] declared second liquid " << where << ": "
                  << (want ? "PRESENT" : "ABSENT");
        if (got)
            std::cout << "  (G/RT single = " << std::fixed
                      << std::setprecision(6) << g1 << ", split = " << g2 << ")";
        else
            std::cout << "  (no non-trivial split exists there)";
        std::cout << "\n";
        if (want)
        {
            std::cout << "  [phases] organic composition:";
            for (std::size_t j = 0; j < nOrgM; ++j)
                std::cout << " x_" << cfg_.apparent[cfg_.backbone[orgPos[j]]]
                          << " = " << std::setprecision(4)
                          << two.xOrg[orgPos[j]];
            std::cout << "\n";
        }
    };
    if (nOrgM > 0)
    {
        LiquidState two; scalar g1 = 0.0, g2 = 0.0; bool got = false;
        twoLiquids = splitWanted(sVector(nApp, 0.0), two, g1, g2, got);
        announcePhases("on the feed", sVector(nApp, 0.0));
        if (verbosity >= 2)
            std::cout << "  [phases] the phase set is FIXED for each Newton"
                         " pass -- appearance is an OUTER decision, never a"
                         " branch inside the differentiated residual -- and"
                         " re-tested at the answer\n";
    }

    //  The liquid state at a trial vaporisation, under the phase set CURRENTLY
    //  being solved.  Returns false when the trial does not admit that phase
    //  set -- and there is NO silent fallback to one liquid.  A fallback is a
    //  step in the residual, which is the discontinuity the phase loop exists
    //  to keep out of the differentiated path, and it is worse than that: it
    //  lets a pass converge to a ONE-liquid root while reporting two.  That is
    //  exactly what happened on the first build of this slice -- |r| = 7.7e-10
    //  on a state whose organic phase did not exist.
    auto liquidState = [&](const sVector& vap, LiquidState& ls) -> bool
    {
        const sVector nBl = backboneMoles(vap);
        if (twoLiquids && !splitBest(nBl, ls))
        { singleLiquid(nBl, ls); return false; }
        if (!twoLiquids) singleLiquid(nBl, ls);
        return true;
    };

    // Activity of the DISSOLVED counterpart of a volatile: the solvent reads
    // its TOTAL activity -- the multiplicative decomposition
    //     a_w = gamma_w(x_backbone) * x_w(backbone) * aw_ionic(speciation)
    // (backbone factor = molecular mixture only; speciation aw = aqueous
    // molalities only; no double counting; both factors 1 when absent) --
    // a family volatile reads its NEUTRAL molecular species row (the gas
    // record's `dissolved` species, e.g. NH3).
    //
    //  With a second liquid present a backbone component is priced by THE
    //  LIQUID IT LIVES IN.  At the converged split the two are equal by
    //  construction, so this is not a change of physics -- it is a change of
    //  arithmetic: benzene through the aqueous side is a mole fraction near
    //  1e-4 times a gamma near 1e3, the same number computed the worst way.
    auto molecularActivity = [&](std::size_t appIdx,
                                 const LiquidState& ls) -> scalar
    {
        const std::size_t b = backbonePos(appIdx);
        if (b >= nBk) return 1.0;
        if (ls.split)
            for (const auto ob : orgPos)
                if (ob == b) return ls.gOrg[b] * ls.xOrg[b];
        return ls.gAq[b] * ls.xAq[b];
    };
    auto dissolvedActivity = [&](std::size_t appIdx,
                                 const SpeciationResult& sr,
                                 const LiquidState& ls) -> scalar
    {
        if (appIdx == cfg_.solventIdx)
            return molecularActivity(appIdx, ls) * sr.aw;
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
        //  THE PHASES DECLARED, not the phases convenient.  This sum decides
        //  whether a vapour exists at all, and computing it on a SINGLE liquid
        //  when the case declares two is not a small error: benzene held in a
        //  water-rich backbone shows a mole fraction near 1e-4 against a gamma
        //  in the hundreds, and the product is a partial pressure of tens of
        //  atmospheres for a liquid whose real benzene pressure is a fifth of
        //  one.  Such a pre-check waves every case through into a Newton
        //  hunting a vapour that is not there (2026-07-27).
        LiquidState ls0; (void)liquidState(v0, ls0);
        scalar pSum = 0.0;
        for (const auto appIdx : cfg_.volatiles)
        {
            //  Nonreactive molecular volatile on the backbone: p = gamma *
            //  x * psat -- gamma = 1 on the authorised ideal route, the
            //  declared molecular model's value otherwise (announced).
            if (cfg_.nonreactive.count(appIdx))
            {
                const std::size_t b = backbonePos(appIdx);
                bool inOrg = false;
                if (ls0.split)
                    for (const auto ob : orgPos) if (ob == b) inOrg = true;
                const scalar xI = inOrg ? ls0.xOrg[b] : ls0.xAq[b];
                const scalar gI = inOrg ? ls0.gOrg[b] : ls0.gAq[b];
                const scalar pI =
                    gI * xI * cfg_.psatOf.at(appIdx)(T_K) / kAtm;
                pSum += pI;
                res.pMolecularAtm[cfg_.apparent[appIdx]] = pI;
                if (verbosity >= 2)
                    std::cout << "  [reactive] " << cfg_.apparent[appIdx]
                              << ": molecular VLE: p = gamma * x * psat = "
                              << std::setprecision(4) << pI
                              << " atm  (Raoult convention; gamma = " << gI << ", x = " << xI
                              << (cfg_.molecularGamma
                                  ? ", " + cfg_.molecularModelName + " backbone"
                                  : std::string(", ideal authorised"))
                              << (inOrg ? ", ORGANIC liquid" : "")
                              << ")\n";
                continue;
            }
            const GasEntry* g = gasFor(appIdx);
            const scalar K  = std::pow(10.0, gasLogK(*g, T_K));
            const scalar pM = dissolvedActivity(appIdx, sr, ls0) / K;
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
            {
                //  The dimer observables above belong to the INCIPIENT
                //  vapour of the saturation check -- no vapour stream
                //  actually formed (flash12 audit, 2026-07-26).
                if (res.dimerOn)
                    std::cout << "  [saturation] incipient vapour"
                                 " (saturation check, no phase formed):"
                                 " p_mono = " << std::setprecision(4)
                              << res.pMonoAtm << " atm, p_dimer = "
                              << res.pDimerAtm << " atm, dimer_share = "
                              << (res.pMonoAtm + res.pDimerAtm > 0.0
                                  ? res.pDimerAtm
                                    / (res.pMonoAtm + res.pDimerAtm) : 0.0)
                              << "\n";
                std::cout << "  [reactive] subsaturated liquid at (T,P):"
                             " no vapour phase forms at the specified"
                             " pressure (sum p_eq = "
                          << std::setprecision(4) << pSum << " atm)\n";
            }
            return res;
        }
    }

    // ---- OUTER Newton: vaporised moles per volatile (log variables) -------
    //  Residual per volatile (log form, dimensionless):
    //      R = ln a_dissolved(liquid after removal) - ln( K(T) * y P[atm] )
    //  One residual evaluation = one inner speciation solve.
    //  ACTIVE volatiles: a TRACE-feed volatile (n_i ~ 0) has no phase split
    //  to solve -- its log-residual legs would sit at -infinity and sink
    //  the Newton (seen at the I -> 0 limit test).  It stays fully liquid
    //  (vap = 0, exact to its own magnitude), announced, and the outer
    //  system shrinks to the volatiles that are actually present.
    std::vector<std::size_t> act;
    {
        scalar nAll = 0.0; for (auto q : n) nAll += q;
        for (const auto appIdx : cfg_.volatiles)
        {
            if (n[appIdx] > 1.0e-8 * nAll) { act.push_back(appIdx); continue; }
            if (verbosity >= 3)
                std::cout << "  [reactive] volatile '" << cfg_.apparent[appIdx]
                          << "': trace feed (n = " << n[appIdx]
                          << ") -- excluded from the phase Newton, stays"
                             " liquid\n";
        }
    }
    const std::size_t nV = act.size();
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
            const std::size_t idx = act[k];
            //  The per-component cage keeps a liquid amount from reaching
            //  exactly zero (logs and mole fractions need it).  It used to sit
            //  at 0.9995*n, which is not a guard but a CEILING: a component
            //  whose equilibrium leaves 0.03 % of itself in the liquid -- a
            //  benzene stripped into the vapour, say -- cannot reach its own
            //  answer, and the residual goes flat against the cap with every
            //  volatile's leg uniformly short.  That is a stall with no
            //  descent direction, and it looks exactly like a rank-deficient
            //  Jacobian while being nothing of the kind (2026-07-27).
            vap[idx] = std::min(V * w[k]/wSum, (1.0 - 1.0e-10) * n[idx]);
        }
    };

    //  The dimerising volatile (at most one in this slice) and its K_dim(T).
    std::size_t dimIdx = nApp; scalar Kd = 0.0;
    for (const auto appIdx : act)
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
        for (const auto appIdx : act)
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
        //  A trial that does not admit the phase set being solved is reported
        //  unphysical, exactly as a diverging speciation is: the damped outer
        //  Newton backtracks away from it, and if the ANSWER lies on the other
        //  side of the phase boundary the outer phase loop -- not a branch in
        //  here -- moves the whole configuration there.
        LiquidState ls;
        if (!liquidState(vap, ls)) return sVector(nV, 1.0e6);
        sVector r(nV);
        for (std::size_t k = 0; k < nV; ++k)
        {
            const std::size_t idx = act[k];
            //  TRUE partial pressure of the transferring molecule [atm]:
            //  the dimerising volatile equilibrates through its MONOMER.
            const scalar tK = (idx == dimIdx) ? tv.tMono : vap[idx];
            const scalar pA = (tK / tau) * P_Pa / kAtm;
            if (cfg_.nonreactive.count(idx))
            {
                //  Molecular backbone VLE: gamma * x * psat = p  (gamma = 1
                //  on the authorised ideal route, the declared molecular
                //  model's value otherwise -- one surface, announced).
                //  With two liquids the activity comes from the phase the
                //  component LIVES in; the equality of activity across the
                //  split makes that the same number, computed well.
                const scalar pR = molecularActivity(idx, ls)
                                * cfg_.psatOf.at(idx)(T_K) / kAtm;
                r[k] = std::log(std::max(pR, 1.0e-300))
                     - std::log(std::max(pA, 1.0e-300));
                continue;
            }
            const scalar K  = std::pow(10.0, gasLogK(*gasFor(idx), T_K));
            r[k] = std::log(std::max(
                       dissolvedActivity(idx, srLast, ls), 1.0e-300))
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
    sVector r;
    scalar  rn = 0.0;
    int     it = 0;

    //  ---- THE PHASE-CONFIGURATION LOOP -------------------------------------
    //  A phase set decided on the FEED can be wrong at the ANSWER: this flash
    //  strips benzene into the vapour, and past some V/F the organic liquid it
    //  started with no longer exists.  Holding the decision would then report a
    //  one-liquid answer under a two-liquid declaration -- or, worse, let the
    //  split quietly fail inside the residual and call the fallback a solution.
    //
    //  So the decision is OUTSIDE the Newton, and taken again at the answer:
    //  each pass solves a smooth problem with a fixed phase set, and a pass
    //  that ends somewhere its own phase set is not the stable one hands the
    //  new set to the next pass.  Announced, both ways.  This is the standard
    //  structure; what it must never become is a branch inside the residual.
    for (int phasePass = 0; ; ++phasePass)
    {
    //  Pass 0 seeds from the feed; a LATER pass continues from where the
    //  previous one stopped.  A pass that ran out of descent did so pressed
    //  against the phase boundary, and a point on the boundary is the best
    //  start the configuration on the other side of it will ever get -- far
    //  better than seeding the same feed twice and expecting a different
    //  answer.  This is continuation, and it is why the passes are ordered.
    if (phasePass == 0)
    {
    u.assign(nV, 0.0);
    u[0] = std::log(0.02 * nTot);
    {
        // PHYSICAL seed: speciate the un-vaporised feed once and start the
        // apparent vapour ratio from the equilibrium partial pressures --
        // p_k = a_k/K_k for the network volatiles (the dimerising one adds
        // 2 p_dim: two apparent moles ride each dimer), x*psat for the
        // authorised molecular co-volatile.  The old feed-RATIO seed put a
        // barely-volatile solute (acetic, y ~ 1e-3) three decades from its
        // solution and the damped Newton stalled against the near-dry cage.
        //
        //  The equilibrium partial pressures of the liquid at a given total
        //  vaporised amount, with the vapour composition brought to its own
        //  fixed point there.  SUM p_eq = P is the two-phase condition itself,
        //  so this function is the saturation criterion as a function of V.
        auto eqPressures = [&](const sVector& vap, std::vector<scalar>& p)
                           -> bool
        {
            SpeciationResult sr;
            try { speciate(vap, sr); }
            catch (const std::exception&) { return false; }
            LiquidState ls;
            if (!liquidState(vap, ls)) return false;
            p.assign(nV, 0.0);
            for (std::size_t k = 0; k < nV; ++k)
            {
                const std::size_t idx = act[k];
                if (cfg_.nonreactive.count(idx))
                {
                    p[k] = molecularActivity(idx, ls)
                         * cfg_.psatOf.at(idx)(T_K) / kAtm;
                    continue;
                }
                const scalar K = std::pow(10.0, gasLogK(*gasFor(idx), T_K));
                p[k] = dissolvedActivity(idx, sr, ls)
                     / std::max(K, 1.0e-300);
                if (idx == dimIdx)
                    p[k] += 2.0*Kd*p[k]*p[k];        // apparent moles / dimer
            }
            return true;
        };
        //  ---- SEED THE AMOUNT, not just the ratio -----------------------
        //  V used to start at a flat 2 % of the feed.  For a feed only just
        //  above its bubble point that is close enough; for one well above it
        //  -- a mixture whose equilibrium pressure is three times the
        //  specified P -- it is not, and the failure is not a slow
        //  convergence but a WRONG DIRECTION: at small V the residual barely
        //  responds to the amount (the sensitivity lives in the ratio), the
        //  linear solve sends V down instead of up, and the iteration walks
        //  to V = 0 with every leg of the residual stuck at ln(SUM p_eq / P).
        //  Uniformly positive, similar in size, and immovable -- which reads
        //  like a rank-deficient Jacobian and is really a bad seed.
        //
        //  The second seed is the TEXTBOOK one: K_i from the equilibrium
        //  partial pressures over the current liquid, then Rachford-Rice for
        //  the vapour fraction.  RR is monotone in psi, so it brackets and
        //  never wanders, which a successive substitution on the vapour
        //  composition emphatically does -- put the whole vapour into the most
        //  volatile species, collapse its liquid, put none there next round.
        //
        //  BOTH seeds are then tried and the better one starts the Newton.
        //  Neither dominates: RR rescues a feed far above its bubble point,
        //  where 2 % walks the wrong way; the flat 2 % rescues a feed whose
        //  K's are steep, where RR overshoots and drives a solute's liquid to
        //  nothing (flash13 does exactly that, and a seed that breaks a
        //  passing case to fix a failing one is not an improvement).  Trying
        //  two costs one residual evaluation and is deterministic.
        std::vector<scalar> p(nV, 0.0);
        std::vector<scalar> pFeed;
        scalar psiRR = 0.0;
        {
            const scalar Patm = P_Pa / kAtm;
            sVector vapS(nApp, 0.0);
            scalar psi = 0.0;
            bool seeded = false;
            for (int round = 0; round < 6; ++round)
            {
                std::vector<scalar> pr;
                if (!eqPressures(vapS, pr)) break;
                if (round == 0) { pFeed = pr; p = pr; }
                //  K_i = y_i/x_i with y_i = p_i^eq/P over the CURRENT liquid.
                scalar liqTot = 0.0;
                for (std::size_t i = 0; i < nApp; ++i)
                    liqTot += n[i] - vapS[i];
                if (liqTot <= 0.0) break;
                sVector K(nApp, 0.0);
                for (std::size_t k = 0; k < nV; ++k)
                {
                    const std::size_t idx = act[k];
                    const scalar xL = (n[idx] - vapS[idx]) / liqTot;
                    if (xL <= 0.0) { K[idx] = 1.0e6; continue; }
                    K[idx] = (pr[k]/Patm) / xL;
                }
                //  Rachford-Rice: f(psi) = SUM z_i (K_i-1)/(1+psi(K_i-1)),
                //  monotone decreasing -- bisection on [0, 1) is exact enough
                //  for a seed and cannot leave the bracket.
                auto rr = [&](scalar ps)
                {
                    scalar s = 0.0;
                    for (std::size_t i = 0; i < nApp; ++i)
                    {
                        const scalar z = n[i]/nTot, km1 = K[i] - 1.0;
                        s += z*km1 / (1.0 + ps*km1);
                    }
                    return s;
                };
                scalar lo = 0.0, hi = 0.999;
                if (rr(lo) <= 0.0) { psi = 0.0; seeded = true; break; }
                scalar psiR = hi;
                if (rr(hi) < 0.0)
                {
                    for (int b = 0; b < 80; ++b)
                    {
                        const scalar mid = 0.5*(lo + hi);
                        (rr(mid) > 0.0 ? lo : hi) = mid;
                    }
                    psiR = 0.5*(lo + hi);
                }
                psi = seeded ? 0.5*(psi + psiR) : psiR;   // under-relaxed
                seeded = true;
                const scalar V = psi * nTot;
                for (std::size_t k = 0; k < nV; ++k)
                {
                    const std::size_t idx = act[k];
                    const scalar km1 = K[idx] - 1.0;
                    const scalar xi = (n[idx]/nTot) / (1.0 + psi*km1);
                    vapS[idx] = std::min(V * K[idx] * xi / std::max(psi, 1e-300)
                                         * psi, (1.0 - 1.0e-10)*n[idx]);
                }
                p = pr;
            }
            if (seeded && psi > 1.0e-12) psiRR = psi;
        }
        //  Build the two candidates -- same odds construction, different
        //  amount and different liquid behind the ratio -- and keep the one
        //  the residual prefers.
        auto oddsFrom = [&](const std::vector<scalar>& pv, sVector& uc)
        {
            scalar pSum = 0.0; for (auto q : pv) pSum += q;
            for (std::size_t k = 0; k + 1 < nV; ++k)
            {
                const scalar yk = std::min(1.0 - 1e-6,
                    std::max(1e-9, pv[k] / std::max(pSum, 1e-300)));
                const scalar ym = std::min(1.0 - 1e-6,
                    std::max(1e-9, pv[nV-1] / std::max(pSum, 1e-300)));
                uc[k+1] = std::log(yk / ym);         // odds vs the reference
            }
        };
        sVector uFlat(nV, 0.0);
        uFlat[0] = std::log(0.02 * nTot);
        oddsFrom(pFeed.empty() ? p : pFeed, uFlat);
        u = uFlat;
        if (psiRR > 1.0e-12)
        {
            sVector uRR(nV, 0.0);
            uRR[0] = std::log(psiRR * nTot);
            oddsFrom(p, uRR);
            const scalar nFlat = norm2(residual(uFlat));
            const scalar nRR   = norm2(residual(uRR));
            const bool takeRR  = nRR < nFlat;
            if (takeRR) u = uRR;
            if (verbosity >= 3)
                std::cout << "  [reactive] seed: "
                          << (takeRR ? "Rachford-Rice, V/F = " : "flat 2 % (RR"
                              " rejected), RR gave V/F = ")
                          << std::fixed << std::setprecision(4) << psiRR
                          << "   |r|2: flat " << std::scientific
                          << std::setprecision(3) << nFlat << ", RR " << nRR
                          << "\n";
        }
    }
    }
    const scalar uLo = -30.0, uHi = 30.0;
    r  = residual(u);
    //  The Rachford-Rice seed knows the vapour-liquid K's and nothing about
    //  the liquid-liquid boundary, so with the second liquid ON it can land
    //  beyond it -- on the wall, where every residual is the unphysical
    //  marker, the finite-difference Jacobian is identically zero and the
    //  linear solve reports a singular system.  Walk the amount back until
    //  the seed is inside the configuration being solved.  A Newton cannot
    //  start on the wall; it can start just inside it.
    for (int b = 0; b < 80 && !r.empty() && r[0] >= 1.0e5; ++b)
    { u[0] -= 0.25; r = residual(u); }
    rn = norm2(r);
    bool convergedOuter = false;
    it = 0;
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
            std::cout << ")\n    vaporised fraction = (";
            {
                sVector vd; unpack(u, vd);
                for (std::size_t i2 = 0; i2 < nV; ++i2)
                    std::cout << (i2 ? ", " : "")
                              << cfg_.apparent[act[i2]] << " "
                              << vd[act[i2]]/std::max(n[act[i2]], 1e-300);
            }
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

    //  ---- Is the phase set still the right one HERE? -----------------------
    //  Two ways a pass can be wrong about its own phase set.  It can CONVERGE
    //  somewhere that set is not the stable one -- then the answer names the
    //  next configuration.  Or it can fail to converge at all, which for a
    //  fixed phase set usually means the root is on the OTHER side of the phase
    //  boundary and the iteration is pressed against it: the residual stops
    //  descending while every trial across the boundary is refused.  Both are
    //  the same instruction, "solve the other configuration", and neither is a
    //  branch inside the residual.
    if (nOrgM == 0 || phasePass >= 3) break;
    {
        const bool solved = rn < 1.0e-7;
        sVector vapT; unpack(u, vapT);
        LiquidState two; scalar g1 = 0.0, g2 = 0.0; bool got = false;
        const bool want = splitWanted(vapT, two, g1, g2, got);
        if (solved && want == twoLiquids) break;
        const bool next = solved ? want : !twoLiquids;
        if (verbosity >= 2)
        {
            if (!solved)
                std::cout << "  [phases] pass " << phasePass << " did not"
                             " converge with the second liquid "
                          << (twoLiquids ? "ON" : "OFF")
                          << " (|r|2 = " << std::scientific
                          << std::setprecision(3) << rn << std::fixed
                          << ") -- the root is not inside this phase"
                             " configuration\n";
            else
                std::cout << "  [phases] the answer of pass " << phasePass
                          << " is NOT stable under its own phase set: the"
                             " organic liquid "
                          << (want ? "APPEARS" : "DISAPPEARS") << " there"
                          << " (G/RT single = " << std::fixed
                          << std::setprecision(6) << g1
                          << (got ? ", split = " + std::to_string(g2)
                                  : std::string(", no non-trivial split"))
                          << ")\n";
            std::cout << "  [phases] re-solving with the second liquid "
                      << (next ? "ON" : "OFF") << "\n";
        }
        if (next == twoLiquids) break;             // nothing left to try
        twoLiquids = next;
    }
    }

    // ---- JOINT acceptance: re-evaluate EVERYTHING at the answer -----------
    //  And REPORT it: this is the call whose numbers are the answer, so it is
    //  the one that gets the diagnostics.  The activation trace stays
    //  suppressed -- the network is the same one it announced at the start.
    innerVerbosity = verbosity;
    sVector vap; unpack(u, vap);
    const sVector rFin = residual(u);                // also refreshes srLast
    innerVerbosity = 0;
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
        if (twoLiquids)
        {
            //  The second liquid at the ANSWER, not at the feed: how much of
            //  the liquid it is, what it holds, and the activity equality that
            //  ties it to the aqueous phase.  That last column is the one to
            //  read -- it is the equilibrium itself, printed, and if it is not
            //  zero the split is not converged whatever the outer residual says.
            LiquidState lsA; (void)liquidState(vap, lsA);
            if (!lsA.split)
                throw std::runtime_error("ReactiveVLE: the declared second"
                    " liquid was PRESENT on the feed but its split does not"
                    " converge at the accepted state -- the answer would be a"
                    " one-liquid answer reported under a two-liquid"
                    " declaration.  No partial answer is returned.");
            scalar sA = 0.0, sO = 0.0;
            for (std::size_t b = 0; b < nBk; ++b)
            { sA += lsA.nAq[b]; if (!lsA.nOrg.empty()) sO += lsA.nOrg[b]; }
            std::cout << "  second liquid (organic): " << std::fixed
                      << std::setprecision(4)
                      << (sO / std::max(sA + sO, 1.0e-300) * 100.0)
                      << " % of the backbone liquid moles\n"
                         "    component      x_org      x_aq     "
                         " ln(a_org/a_aq)\n";
            for (const auto b : orgPos)
                std::cout << "    " << std::left << std::setw(12)
                          << cfg_.apparent[cfg_.backbone[b]] << std::right
                          << std::setw(10) << std::setprecision(6)
                          << lsA.xOrg[b] << std::setw(10) << lsA.xAq[b]
                          << std::setw(14) << std::scientific
                          << std::setprecision(2)
                          << (std::log(std::max(lsA.gOrg[b]*lsA.xOrg[b],1e-300))
                            - std::log(std::max(lsA.gAq [b]*lsA.xAq [b],1e-300)))
                          << std::fixed << "\n";
            std::cout << "    (both liquids leave as ONE apparent liquid"
                         " stream -- the split is internal state, like the"
                         " speciation)\n";
        }
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
