/*---------------------------------------------------------------------------*\
  ReactiveVLE -- coupled speciation + phase equilibrium (NH3/water spike).
  See ReactiveVLE.H for the contract.  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "thermo/electrolyte/ReactiveVLE.H"
#include "solver/NewtonND.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/solidEquilibrium/SolidEquilibriumService.H"

#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include "core/Advisory.H"

#include <iomanip>
#include <sstream>
#include <iostream>
#include <memory>
#include <stdexcept>

namespace Choupo {

//  Trim a temperature for a message: 304.13 stays, 304.130000 does not.
static std::string trimNumRV(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(6) << v;
    return os.str();
}
namespace electrolyte {

namespace {
constexpr scalar kAtm = 101325.0;   // Pa per atm (the PHREEQC gas-record basis)
}

/*---------------------------------------------------------------------------*\
  THE NUMERICS, in one place.

  Every tolerance, cap, seed and iteration count this solve uses is named
  here, because they were scattered across fifteen call sites and three of
  them turned out to be load-bearing PHYSICS in disguise:

    * `cageKnee` is not a safety clamp.  It used to be a hard min() at the
      component's own amount, which does not merely LIMIT the vaporised
      moles -- it kills the derivative.  Nitrogen wants to be 99.98 %
      vaporised; the clamp put it at 100 % and its residual leg sat 14 log
      units out with ZERO gradient, which reads exactly like a rank-deficient
      Jacobian.  Linear below the knee, C1 and strictly monotone above it.
    * `flatVapourSeed` is one of TWO starts.  A Rachford-Rice seed on the
      equilibrium K's runs beside it and the BETTER of the two begins the
      Newton -- neither dominates, and the flat 2 % alone could not reach a
      component that must almost entirely vaporise.
    * `gibbsMargin` is the margin by which two liquids must BEAT one before
      the split is accepted.  Gibbs DECIDES, the Newton SOLVES: a split that
      wins by less than this is numerical noise under the outer FD Jacobian.

  Nothing here is tuned per case.  A number that needs tuning is a model
  that needs fixing.
\*---------------------------------------------------------------------------*/
namespace num {

//  Basis floor: below this there is no solvent water, hence no liquid to
//  speciate and no molality to convert against.
constexpr scalar kgwFloor       = 1.0e-12;      // kg water

//  The ORGANIC split -- an inner Newton on the equality of ACTIVITY
//  ln(gamma_org x_org) = ln(gamma_aq x_aq), solved to machine precision
//  inside each residual evaluation of the outer Newton.
constexpr scalar orgSeedFloor   = 1.0e-14;      // log-variable seed floor
constexpr scalar splitTol       = 1.0e-13;      // |f| target
constexpr int    splitMaxIt     = 200;
constexpr int    splitLineSteps = 24;           // halvings per step
constexpr scalar splitAccept    = 1.0e-9;       // above this: NOT converged
constexpr scalar gibbsMargin    = 1.0e-10;      // relative; see the note above

//  The per-component vaporisation CAGE (see the note above).
constexpr scalar cageKnee       = 0.9;          // linear for t <= 0.9 n
constexpr scalar expClamp       = 700.0;        // exp() overflow guard

//  SEEDS.
constexpr scalar flatVapourSeed = 0.02;         // 2 % of the feed, one of two
constexpr scalar rrGuard        = 1.0e-10;      // keep RR's vapour < n
constexpr scalar oddsFloor      = 1.0e-9;       // softmax odds floor
constexpr scalar pTiny          = 1.0e-300;     // pressure-sum divide guard
constexpr scalar psiFloor       = 1.0e-12;      // RR root worth seeding from

//  The OUTER Newton on the vaporised moles.
//
//  ITS CONVERGENCE TEST NO LONGER LIVES HERE.  `outerMaxIt 60` and
//  `outerTol 1e-9` used to be two constants in this block, and `1e-9` was a
//  BARE number on a raw ||r||_2 -- a magnitude compared with nothing.  Both
//  moved to the project's one convergence home, solver/Convergence.H, where
//  they are the documented DEFAULTS of ConvergenceControls, the verdict is
//  taken on a NORMALIZED residual, and a case may declare its own triple in
//  system/solverDict (`reactiveEquilibrium { tolerance; relTol; maxIter; }`).
//  The two numbers below are what remains here, and neither is a convergence
//  test: `outerLineSteps` is the damping budget and `outerTiny` is the
//  line-search acceptance floor for a step that is already at round-off.
constexpr int    outerLineSteps = 12;           // halvings per step
constexpr scalar armijo         = 1.0e-4;       // sufficient-decrease factor
constexpr scalar outerTiny      = 1.0e-12;      // accept an already-tiny ||r||

} // namespace num

ReactiveVLE::ReactiveVLE(ReactiveVLEConfig cfg)
:
    cfg_(std::move(cfg)),
    spec_(std::make_unique<SpeciationSolver>(cfg_.activityModel))
{
    //  ---- PERMANENT GASES: their family, from the record that already has it
    //  A dissolved gas anchors a family like any other component, but its
    //  bridge is not on the component record and must not be put there: the
    //  gas-liquid record's `dissolvedSpecies` is the one curated home for
    //  "which species is dissolved N2", and it is a TYPED reference already.
    //  This is the only place in the assembly where those records are loaded,
    //  so this is where the bridge is read.
    for (const auto appIdx : cfg_.dissolvedGases)
    {
        const GasEntry* g = gasFor(appIdx);
        if (!g)
            throw std::runtime_error("ReactiveVLE: '"
                + cfg_.apparent.at(appIdx) + "' is a permanent gas in a"
                " reactive aqueous system, so its aqueous home is its"
                " gas-liquid record -- and it has none.  Declare it a volatile"
                " and curate chemistry/<gas>-dissolution.dat (recordType"
                " gasLiquidEquilibrium, PHREEQC convention a = K * p[atm]), or"
                " drop it from the component set.");
        if (!findAqueousSpecies(g->species))
            throw std::runtime_error("ReactiveVLE: the gas-liquid record for '"
                + cfg_.apparent.at(appIdx) + "' dissolves into species '"
                + g->species + "', which has no record (species/" + g->species
                + ".dat) -- the dissolved gas cannot become an aqueous total.");
        cfg_.families.push_back(
            { appIdx, std::string(), {{ SpeciesId(g->species), 1.0 }} });
    }

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
            //  A DISSOLVED GAS's master is referenced by its gas-liquid record
            //  and by nothing else, and that is not a broken chemistry set --
            //  it is what INERT means.  Nitrogen ionises with nothing and
            //  reacts with nothing; its entire aqueous story is one
            //  dissolution equilibrium.  Requiring a speciation reaction would
            //  refuse the one case where having none is the physics.
            if (!masterKnown && cfg_.dissolvedGases.count(fam.apparentIdx))
                for (const auto& g : spec_->gases())
                    if (g.species == master.key) { masterKnown = true; break; }
            //  A SPECTATOR master -- a fully dissociated salt's free ion
            //  (NaCl -> Na+, Cl-) -- may be referenced by NO equilibrium at
            //  all: its entire aqueous story is the free master balance the
            //  m = A n map targets DIRECTLY, so there is nothing to "map
            //  back" through.  It is legitimate exactly when the species
            //  catalogue resolves it (record + charge), the same condition
            //  solve() itself enforces.  Found sealing marcilla01
            //  (2026-08-10): the UNSEALED run passed only because an
            //  unrelated databank record (NaSO4-formation) happened to
            //  reference Na, and the sealed frontier -- correctly -- did
            //  not stage it.  A verification that depends on records the
            //  case does not use is a verification of the databank, not of
            //  the case.
            if (!masterKnown)
            {
                try { (void)spec_->chargeOf(master.key); masterKnown = true; }
                catch (const std::exception&) {}
            }
            if (!masterKnown)
                throw std::runtime_error("ReactiveVLE: apparent component '"
                    + cfg_.apparent.at(fam.apparentIdx) + "' maps to master '"
                    + master.key + "', but NO speciation record references that"
                    " master -- the chemistry set cannot map the family's true"
                    " species back to the declared apparent-component basis.");
        }
}

ReactiveVLE::~ReactiveVLE() = default;

SpeciationResult
ReactiveVLE::speciateAsLiquid(scalar T_K, const sVector& nApp) const
{
    const scalar nW = (cfg_.solventIdx < nApp.size())
                    ? nApp[cfg_.solventIdx] : 0.0;
    const scalar kgw = nW * cfg_.solventMW;
    if (kgw <= num::kgwFloor)
        throw std::runtime_error("ReactiveVLE::speciateAsLiquid: the material"
            " carries no solvent water -- there is no aqueous phase to"
            " speciate.");
    SpeciationInput in;
    in.T = T_K;
    in.solvePH = true;                     // electroneutrality closes it
    in.stoichiometricTotals = true;        // bridge-derived, not an analysis
    in.announceClosure = false;
    for (const auto& fam : cfg_.families)
    {
        const scalar q = (fam.apparentIdx < nApp.size())
                       ? std::max(nApp[fam.apparentIdx], 0.0) : 0.0;
        for (const auto& [master, nu] : fam.mapping)
            in.totals[master] += nu * q / kgw;
    }
    //  S3b: an admitted solid set goes through the ONE door (coupled route,
    //  numbers unchanged; narration off -- this is a report utility whose
    //  caller owns the stream's own narration).
    if (cfg_.admittedSolids.empty()) return spec_->solve(in, 0);
    return solidEq::SolidEquilibriumService::equilibrateMinerals(
        *spec_, in, cfg_.admittedSolids, 0,
        solidEq::SolidEquilibriumService::Route::coupled,
        /*narrate*/ false).aqueous;
}

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
    //  ...or a master that appears in NO reaction, which is what an inert
    //  dissolved gas is: nitrogen's whole aqueous story is one dissolution
    //  equilibrium, so the gas-liquid record is the only place its species is
    //  named.  Without this it collapses to nothing and a report block that
    //  correctly declares 5 kmol/h of dissolved N2 is read as declaring none.
    for (const auto& g : spec_->gases())
        if (g.species == species) return {{ species, 1.0 }};
    //  ...or a PRECIPITATED MINERAL, whose dissolution reaction is its
    //  composition on the master basis.  A stream carrying calcite has most of
    //  its calcium in the solid, not in solution: a decomposition that listed
    //  only the aqueous rows would be missing the matter, not describing it.
    for (const auto& m : spec_->minerals())
        if (m.mineral == species)
        {
            std::vector<std::pair<std::string, scalar>> out;
            for (const auto& [mm, nu] : m.masters) out.emplace_back(mm, nu);
            return out;
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

/*---------------------------------------------------------------------------*\
  The LIQUID-LIQUID split, lifted out of solve().

  It needs three things and nothing else: how wide the molecular backbone is,
  which of its positions the declared organic phase ADMITS, and the molecular
  activity model as a function of a backbone composition.  That is the whole
  coupling -- no speciation, no vapour, no config -- which is why it can live
  here as plain arithmetic instead of as four lambdas inside a 1200-line
  function capturing everything in scope.

  Both liquids share ONE `gammaOf` by construction: two different models would
  make the activity-equality residual measure their disagreement rather than
  the physics, and the builder refuses that upstream.
\*---------------------------------------------------------------------------*/
struct LiquidState
{
    sVector xAq, gAq;              // aqueous backbone, ion-free x
    sVector xOrg, gOrg;            // organic phase, same indexing
    sVector nAq, nOrg;             // the amounts behind those fractions
    bool    split = false;
};

struct TwoLiquidSplit
{
    std::size_t                            nBk = 0;   // backbone width
    std::vector<std::size_t>               orgPos;    // admitted positions
    std::function<sVector(const sVector&)> gammaOf;   // the shared model

    //  THE WET ORGANIC (2026-08-10, the marcilla01 finding).  When the case
    //  declares the AQUEOUS SOLVENT a member, its cross-liquid equality is
    //      gamma_org x_org  =  gamma_aq x_aq * a_w,ionic
    //  -- the multiplicative decomposition the formulation already states
    //  (a_w = gamma_w x_w * aw_ionic), applied across the split.  The ionic
    //  factor is FROZEN during this Newton (it comes from the speciation of
    //  the aqueous liquid) and iterated to self-consistency by the caller;
    //  at convergence the frozen state is the current state, the same
    //  discipline the gamma fixed point uses.  solventPos = SIZE_MAX (dry
    //  organic) leaves every path below byte-identical to what it was.
    std::size_t                            solventPos = SIZE_MAX;
    std::function<scalar()>                awIonic;   // frozen factor; null = 1

    //  ONE liquid: the whole backbone in the aqueous phase.
    void single(const sVector& nBl, LiquidState& ls) const
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
    }

    //  Gibbs energy of a liquid state, in RT units and per the amounts given:
    //  G/RT = SUM n_i ln(gamma_i x_i).  It is what decides whether the second
    //  liquid is worth having -- a converged split that does not LOWER it is a
    //  root of the equality equations without being the equilibrium.
    scalar gibbs(const LiquidState& ls) const
    {
        //  The solvent's AQUEOUS chemical potential carries the ionic a_w
        //  factor (wet organic only): both configurations -- single liquid
        //  and split -- price it on the SAME frozen factor, so the
        //  comparison is consistent and the dry-organic path (solventPos ==
        //  SIZE_MAX) is byte-identical.
        const scalar lnAw = (solventPos != SIZE_MAX && awIonic)
                          ? std::log(std::max(awIonic(), 1.0e-300)) : 0.0;
        scalar g = 0.0;
        for (std::size_t b = 0; b < nBk; ++b)
        {
            if (ls.nAq[b] > 0.0)
                g += ls.nAq[b]
                   * (std::log(std::max(ls.gAq[b]*ls.xAq[b], 1.0e-300))
                      + (b == solventPos ? lnAw : 0.0));
            if (ls.split && !ls.nOrg.empty() && ls.nOrg[b] > 0.0)
                g += ls.nOrg[b]
                   * std::log(std::max(ls.gOrg[b]*ls.xOrg[b], 1.0e-300));
        }
        return g;
    }

    //  The split itself: unknowns t_j = ln(organic moles of member j),
    //  equations the equality of activity across the two liquids.  A Newton,
    //  NOT a minimisation -- the minimisation is what DECIDES the phase
    //  (below); once the basin is known the equalities are smooth and solve to
    //  machine precision, and that precision is what the OUTER finite-
    //  difference Jacobian needs.  A loosely-converged inner solve is noise in
    //  the outer gradient and the outer descent dies on it.
    bool from(const sVector& nBl, const sVector& seedOrg,
              LiquidState& lsOut) const
    {
        const std::size_t M = orgPos.size();
        if (M == 0) return false;
        sVector t(M);
        for (std::size_t j = 0; j < M; ++j)
            t[j] = std::log(std::max(seedOrg[j], num::orgSeedFloor));
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
                //  Wet organic: the solvent's aqueous activity carries the
                //  frozen ionic a_w factor (see the struct comment).
                if (b == solventPos && awIonic)
                    f[j] -= std::log(std::max(awIonic(), 1.0e-300));
            }
            return true;
        };
        auto nrm = [](const sVector& v)
        { scalar s = 0.0; for (auto q : v) s += q*q; return std::sqrt(s); };
        sVector f; LiquidState ls;
        if (!eval(t, f, ls)) return false;
        scalar fn = nrm(f);
        for (int itS = 0; itS < num::splitMaxIt && fn > num::splitTol; ++itS)
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
            for (int lsr = 0; lsr < num::splitLineSteps; ++lsr, lam *= 0.5)
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
        if (fn > num::splitAccept) return false;
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
    }

    //  The liquid state at explicit organic amounts -- the same arithmetic
    //  eval() uses, without the equality residual.  Serves the Gibbs
    //  machinery below.
    bool stateAt(const sVector& nBl, const sVector& org, LiquidState& ls) const
    {
        ls = LiquidState{};
        ls.nOrg.assign(nBk, 0.0);
        ls.nAq = nBl;
        for (std::size_t j = 0; j < orgPos.size(); ++j)
        {
            const std::size_t b = orgPos[j];
            ls.nOrg[b] = std::min(std::max(org[j], 0.0), 0.999999*nBl[b]);
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
        return true;
    }

    //  Direct GIBBS DESCENT in the split's own ln-moles space (Nelder-Mead,
    //  deterministic simplex), refining a seed before the Newton runs.  The
    //  wet organic needs it: with the solvent a member, |f| carries a
    //  1-parameter STATIONARY FAMILY (the organic as a scaled clone of the
    //  mixture, Jacobian singular along it, |f| = |ln a_w| but never zero)
    //  and an |f|-descent Newton funnels into that family from almost any
    //  seed -- the K=1 saddle this repository already documents for
    //  symmetric molecular LL splits, whose cure there is the same: minimise
    //  G directly, then solve.  The equalities are the stationarity of G,
    //  so a strict G-minimiser hands the Newton a nonsingular basin.
    sVector gibbsDescent(const sVector& nBl, const sVector& seed) const
    {
        const std::size_t M = orgPos.size();
        auto G = [&](const sVector& tv) -> scalar
        {
            sVector org(M);
            for (std::size_t j = 0; j < M; ++j) org[j] = std::exp(tv[j]);
            LiquidState ls;
            if (!stateAt(nBl, org, ls)) return 1.0e30;
            return gibbs(ls);
        };
        std::vector<sVector> S(M + 1, sVector(M));
        for (std::size_t j = 0; j < M; ++j)
            S[0][j] = std::log(std::max(seed[j], num::orgSeedFloor));
        for (std::size_t v = 1; v <= M; ++v)
        { S[v] = S[0]; S[v][v-1] += 0.4; }
        sVector gv(M + 1);
        for (std::size_t v = 0; v <= M; ++v) gv[v] = G(S[v]);
        for (int itNM = 0; itNM < 200; ++itNM)
        {
            //  order: lo = best, hi = worst
            std::size_t lo = 0, hi = 0;
            for (std::size_t v = 1; v <= M; ++v)
            {
                if (gv[v] < gv[lo]) lo = v;
                if (gv[v] > gv[hi]) hi = v;
            }
            if (std::abs(gv[hi] - gv[lo])
                <= 1.0e-13 * std::max(1.0, std::abs(gv[lo]))) break;
            sVector cen(M, 0.0);
            for (std::size_t v = 0; v <= M; ++v)
                if (v != hi)
                    for (std::size_t j = 0; j < M; ++j)
                        cen[j] += S[v][j] / scalar(M);
            auto lerp = [&](scalar a) {
                sVector p(M);
                for (std::size_t j = 0; j < M; ++j)
                    p[j] = cen[j] + a * (S[hi][j] - cen[j]);
                return p;
            };
            sVector pr = lerp(-1.0);           // reflect
            scalar gr = G(pr);
            if (gr < gv[lo])
            {
                sVector pe = lerp(-2.0);       // expand
                scalar ge = G(pe);
                if (ge < gr) { S[hi] = pe; gv[hi] = ge; }
                else         { S[hi] = pr; gv[hi] = gr; }
            }
            else if (gr < gv[hi]) { S[hi] = pr; gv[hi] = gr; }
            else
            {
                sVector pc = lerp(0.5);        // contract
                scalar gc = G(pc);
                if (gc < gv[hi]) { S[hi] = pc; gv[hi] = gc; }
                else
                {
                    for (std::size_t v = 0; v <= M; ++v)   // shrink to best
                        if (v != lo)
                        {
                            for (std::size_t j = 0; j < M; ++j)
                                S[v][j] = S[lo][j]
                                        + 0.5*(S[v][j] - S[lo][j]);
                            gv[v] = G(S[v]);
                        }
                }
            }
        }
        std::size_t lo = 0;
        for (std::size_t v = 1; v <= M; ++v) if (gv[v] < gv[lo]) lo = v;
        sVector out(M);
        for (std::size_t j = 0; j < M; ++j) out[j] = std::exp(S[lo][j]);
        return out;
    }

    //  The seeds.  DETERMINISTIC, and deliberately not warm-started from the
    //  previous outer trial: a residual that remembers where the solver came
    //  from is path-dependent, and a path-dependent residual has no finite-
    //  difference Jacobian worth the name.
    bool best(const sVector& nBl, LiquidState& lsOut) const
    {
        bool found = false;
        LiquidState bestLs; scalar gBest = 0.0;
        auto trySeed = [&](const sVector& seed)
        {
            LiquidState ls;
            if (!from(nBl, seed, ls)) return;
            const scalar g = gibbs(ls);
            if (!found || g < gBest) { found = true; bestLs = ls; gBest = g; }
        };
        for (const scalar frac : { 0.99, 0.90, 0.50, 0.10 })
        {
            sVector seed(orgPos.size());
            for (std::size_t j = 0; j < orgPos.size(); ++j)
                seed[j] = frac * nBl[orgPos[j]];
            trySeed(seed);
        }
        //  The Newton descends |f|, and with the solvent a member |f| has a
        //  SECOND trivial attractor beside the clone manifold: the
        //  all-organic cap corner, where every member rides its 0.999999
        //  cap, both phases hold the feed composition, and |f| bottoms out
        //  at |ln a_w| without ever reaching zero.  An |f| descent cannot
        //  tell that pit from a basin.  GIBBS CAN -- the corner prices the
        //  solvent without its ionic a_w term, so it sits ABOVE the single
        //  liquid, while the true split sits below it.  So the seed is
        //  chosen by a deterministic Gibbs GRID over (solvent fraction,
        //  member fraction), refined by the Nelder-Mead descent above, and
        //  the Newton polishes from the refined minimum: Gibbs decides, the
        //  Newton solves -- the same division of labour this file already
        //  states.  (A uniform-fraction seed sits EXACTLY on the clone
        //  manifold when the solvent is a member, so the four seeds above
        //  stop being seeds at all for the wet organic.)
        if (solventPos != SIZE_MAX)
        {
            scalar gMin = 0.0; sVector seedMin;
            for (const scalar fOrg : { 0.50, 0.70, 0.85, 0.95, 0.99 })
                for (const scalar fW : { 0.02, 0.05, 0.10, 0.20, 0.30, 0.45 })
                {
                    sVector seed(orgPos.size());
                    for (std::size_t j = 0; j < orgPos.size(); ++j)
                        seed[j] = (orgPos[j] == solventPos ? fW : fOrg)
                                * nBl[orgPos[j]];
                    LiquidState ls;
                    if (!stateAt(nBl, seed, ls)) continue;
                    const scalar g = gibbs(ls);
                    if (seedMin.empty() || g < gMin) { gMin = g; seedMin = seed; }
                }
            if (!seedMin.empty())
                trySeed(gibbsDescent(nBl, seedMin));
        }
        if (found) lsOut = bestLs;
        return found;
    }
};


/*---------------------------------------------------------------------------*\
  The VAPOUR COORDINATES and the vapour-side DIMER, lifted out of solve().

  Both are pure arithmetic over a handful of numbers -- the unknowns, which
  volatiles are active, the feed amounts -- so neither needed the 1200-line
  scope it used to capture by reference.  The smooth CAGE lives in the first
  and the dimer BISECTION in the second: the two places a reader most often
  goes looking, now findable without scrolling through a Newton.
\*---------------------------------------------------------------------------*/
// Unknowns: (ln V, softmax odds z_1..z_{m-1}) -- the CLASSICAL flash
// coordinates, generalised to m volatiles (2026-07-26; the 2-volatile
// logit is the m = 2 special case).  The first cut used raw (v_1, v_2)
// and its Jacobian was near-singular at small V (the vapour RATIO
// carries all the sensitivity, the AMOUNT almost none); with (V, y) the
// amount couples through liquid DEPLETION and Sigma y = 1 is built into
// the parametrisation.  y_k = exp(z_k)/Sigma exp(z_j), z_m = 0 pinned.
void unpackVapour(const sVector&                  u,
                  const std::vector<std::size_t>&  act,
                  const sVector&                   n,
                  const scalar                     nTot,
                  const std::size_t                nApp,
                  sVector&                         vap)
{
    const std::size_t nV = act.size();
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
        //  exactly zero (logs and mole fractions need it).  It used to be
        //  a hard min() at 0.9995*n, which is not a guard but a CEILING
        //  twice over.  As a LIMIT it is too low: a component whose
        //  equilibrium leaves 0.03 % of itself in the liquid -- a benzene
        //  stripped into the vapour -- cannot reach its own answer.  And
        //  as a CLAMP it kills the derivative: once min() picks the cap,
        //  vap stops responding to the unknowns entirely, so the residual
        //  goes flat and the Newton has nowhere to step.  A nearly
        //  insoluble permanent gas hits that instantly -- nitrogen wants
        //  to be 99.98 % vaporised, the clamp puts it at 100 %, and its
        //  leg sits 14 log units out with zero gradient.
        //
        //  So the saturation is SMOOTH -- and smooth ONLY WHERE THE CLAMP
        //  USED TO BITE.  Below 90 % of a component's own amount, vap is
        //  exactly t, so every case that never approached the cap is
        //  untouched; above it, the curve bends over exponentially and
        //  approaches n from below without ever reaching it:
        //
        //      vap = t                                  t <= 0.9 n
        //      vap = n - 0.1 n exp( -(t - 0.9n)/(0.1n) ) t >  0.9 n
        //
        //  Continuous AND C1 at the join (value 0.9n, slope 1 on both
        //  sides), asymptotic to n, derivative never zero.  Making it
        //  smooth EVERYWHERE was tried first and broke flash13 with a
        //  singular Jacobian: bending the curve where it did not need
        //  bending left two of its columns near-parallel (2026-07-27).
        const scalar t  = V * w[k]/wSum;
        const scalar ni = n[idx];
        if (ni <= 0.0)            vap[idx] = 0.0;
        else if (t <= num::cageKnee * ni) vap[idx] = t;
        else
        {
            const scalar tail = (1.0 - num::cageKnee) * ni;
            vap[idx] = ni - tail * std::exp(
                -std::min((t - num::cageKnee*ni) / tail, num::expClamp));
        }
    }
}

//  TRUE vapour composition under dimerisation: the apparent vaporised
//  moles of the dimerising volatile split as v_d = t_mono + 2 t_dim,
//  with the vapour-phase equilibrium p_dim = K_dim p_mono^2 (partial
//  pressures over the TRUE mole count tau = S + t_mono + t_dim, S = the
//  other volatiles' moles).  g(t_mono) = (v_d - t_mono)/2
//  - K_dim P t_mono^2 / tau is monotone with a bracketed sign change --
//  bisection is exact enough and never escapes (0, v_d].
struct TrueVap { scalar tMono, tDim, tau; };

TrueVap trueVapour(const sVector&                  vap,
                   const std::vector<std::size_t>& act,
                   const std::size_t               dimIdx,
                   const std::size_t               nApp,
                   const scalar                    Kd,
                   const scalar                    Patm)
{
    scalar S = 0.0;
    for (const auto appIdx : act)
        if (appIdx != dimIdx) S += vap[appIdx];
    if (dimIdx == nApp) return { 0.0, 0.0, S };
    const scalar vd = vap[dimIdx];
    if (vd <= 0.0) return { 0.0, 0.0, S };
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
}

//  A VAPOUR IS NOT A GAS, AND WHICH ONE A SUBSTANCE IS DEPENDS ON T.
//
//  A vapour is a gaseous substance BELOW its critical temperature: it
//  condenses under pressure alone, with no cooling.  A permanent gas is one
//  ABOVE it, where no pressure whatever liquefies it and there is no
//  gas/liquid distinction left.  So `noncondensable true;` states a RELATION
//  between the record's Tc and the local temperature, and the record cannot
//  know the temperature.
//
//  Three catalogue records declare it.  N2 (Tc 126.2 K) and O2 (154.58 K)
//  agree with the flag at any ordinary process temperature.  CO2's Tc is
//  304.13 K = 31.0 degC -- so below 31 degC carbon dioxide is a VAPOUR, which
//  is how every CO2 cylinder works and the whole basis of supercritical-CO2
//  extraction.  absorption01_CO2_water runs at 298.15 K, six kelvin below,
//  and the engine announces "no pure liquid to reference above Tc" about a
//  substance that is beneath it.
//
//  This ANNOUNCES and changes nothing.  Deleting the flag would lose a
//  legitimate modelling statement (a psychrometric carrier at 300 K); silently
//  deriving the routing from T would change answers across the corpus, which
//  is a physics change wearing a refactor's clothes.  Both are rejected in the
//  record.  The shape is the ratified `role` vs `volatility{}` split: the flag
//  is the case's modelling class, Tc is the substance's physics, and the
//  engine announces the contradiction instead of obeying it in silence.
void ReactiveVLE::noteSubcriticalGases(scalar T_K) const
{
    if (announcedSubcritical_) return;      // one bool test, per solve
    announcedSubcritical_ = true;

    for (const auto appIdx : cfg_.dissolvedGases)
    {
        auto it = cfg_.criticalTOfGas.find(appIdx);
        if (it == cfg_.criticalTOfGas.end()) continue;
        const scalar Tc = it->second;
        if (Tc <= 0.0 || T_K >= Tc) continue;      // absent, or genuinely a gas

        const std::string& nm = cfg_.apparent.at(appIdx);
        AdvisoryLog::instance().add(
            "modelling", "warning", "component '" + nm + "'",
            "declared `noncondensable true;` but solved at T = "
            + trimNumRV(T_K) + " K, BELOW its own critical temperature Tc = "
            + trimNumRV(Tc) + " K -- at this temperature it is a condensable"
              " vapour, not a permanent gas; the Henry routing is a modelling"
              " choice, not a consequence of the physics");
        std::cerr << "[gas/vapour] component '" << nm << "': declared"
                     " `noncondensable true;` and routed on the HENRY rung,"
                     " but solved at T = " << trimNumRV(T_K)
                  << " K, BELOW its own critical temperature Tc = "
                  << trimNumRV(Tc) << " K.\n     Below Tc a substance is a"
                     " VAPOUR, not a permanent gas: it condenses under pressure"
                     " alone.  Treating it as a permanent carrier here is a"
                     " deliberate simplification of the CASE, and a legitimate"
                     " one -- it is not a property of the substance, and the"
                     " engine is not deriving it.\n";
    }
}

ReactiveVLEResult ReactiveVLE::solve(scalar T_K, scalar P_Pa, scalar F,
                                     const sVector& zApp, int verbosity,
                                     bool subsaturatedProbe) const
{
    noteSubcriticalGases(T_K);

    //  ---- THE CONVERGENCE CONTRACT (solver/Convergence.H) -------------------
    //  Announced ONCE per engine instance, defaults included: a default that
    //  is never printed is indistinguishable from a number nobody chose.
    //  HERE and not beside the outer Newton -- a SUBSATURATED feed returns
    //  from the saturation pre-check and never reaches it, and a case whose
    //  contract is announced only when the solver happens to iterate is a
    //  status guard armed on one of two routes (the K_f lesson, 2026-08-07).
    if (verbosity >= 2 && !convAnnounced_)
    {
        std::cout << "  " << conv_.describe("reactiveEquilibrium",
                                            convDefaulted_) << "\n";
        convAnnounced_ = true;
    }

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
    //  `orgW` [mol, feed basis] = solvent held by the ORGANIC liquid (wet
    //  organic only; 0 everywhere else).  The molality basis is the AQUEOUS
    //  liquid's water alone -- water in the organic phase dissolves no ions.
    auto speciate = [&](const sVector& vap, scalar orgW,
                        SpeciationResult& out) -> void
    {
        const scalar liqW = nW - (cfg_.gasOf.count(cfg_.solventIdx)
                                  ? vap[cfg_.solventIdx] : 0.0) - orgW;
        const scalar kgw  = liqW * cfg_.solventMW;   // mol * kg/mol = kg water
        if (kgw <= num::kgwFloor)
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
        //  Ask for precipitation when the case admits solids -- through the
        //  ONE door (S3b; coupled route, numbers unchanged).  Narration off:
        //  this kernel runs hundreds of times inside the Newton, and the
        //  post-solve reporting owns the converged narration.  Empty list =
        //  the kernel's phase-free path, untouched.
        in.announceClosure = announceClosure;
        if (cfg_.admittedSolids.empty())
            out = spec_->solve(in, innerVerbosity);
        else
            out = solidEq::SolidEquilibriumService::equilibrateMinerals(
                *spec_, in, cfg_.admittedSolids, innerVerbosity,
                solidEq::SolidEquilibriumService::Route::coupled,
                /*narrate*/ false).aqueous;
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

    //  WHICH backbone positions the declared organic phase admits, and the
    //  split machinery that works on them (defined above this function:
    //  plain arithmetic over the backbone, handed the one model both liquids
    //  share).  An empty `orgPos` IS the no-organic case -- every reactive
    //  case that declares none takes a path indistinguishable from the one it
    //  took before the second liquid existed.
    std::vector<std::size_t> orgPos;
    for (const auto m : cfg_.organic.members)
    {
        const std::size_t b = backbonePos(m);
        if (b < nBk) orgPos.push_back(b);
    }
    const std::size_t nOrgM = orgPos.size();

    //  WET ORGANIC wiring: when the aqueous solvent is a declared member,
    //  the split's water equality reads the ionic a_w factor FROZEN from the
    //  latest speciation, and the split<->speciation pair is brought to a
    //  joint fixed point by resolveLiquid below.  Dry organic: solventPos
    //  stays SIZE_MAX, awFrozen is never read, every path byte-identical.
    const std::size_t solventBk = backbonePos(cfg_.solventIdx);
    bool wetOrganic = false;
    for (const auto m : cfg_.organic.members)
        if (m == cfg_.solventIdx) wetOrganic = true;
    scalar awFrozen = 1.0;
    const TwoLiquidSplit split{ nBk, orgPos, gammaOf,
                                wetOrganic ? solventBk : SIZE_MAX,
                                [&awFrozen]() -> scalar { return awFrozen; } };


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
        //  The phase DECISION freezes the ionic a_w at the single-liquid
        //  speciation of this trial: both configurations are then compared
        //  on the same factor (consistent), and the SOLVE afterwards
        //  iterates the pair to self-consistency.  A trial the speciation
        //  cannot price keeps the last frozen factor -- the decision is a
        //  comparison, not the answer.
        if (wetOrganic)
        {
            try { SpeciationResult srD; speciate(vap, 0.0, srD);
                  awFrozen = srD.aw; }
            catch (const std::exception&) {}
        }
        const sVector nBl = backboneMoles(vap);
        LiquidState one; split.single(nBl, one);
        g1 = split.gibbs(one);
        got = split.best(nBl, two);
        if (!got) return false;
        g2 = split.gibbs(two);
        return g2 < g1 - num::gibbsMargin*std::max(1.0, std::abs(g1));
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
        if (twoLiquids && !split.best(nBl, ls))
        { split.single(nBl, ls); return false; }
        if (!twoLiquids) split.single(nBl, ls);
        return true;
    };

    //  ---- THE JOINT LIQUID RESOLUTION (speciation + split, one entry) ------
    //  Dry organic (or none): exactly the historical sequence -- one
    //  speciation, one split -- byte-identical numbers.  Wet organic: the two
    //  share the water, so they are brought to a joint fixed point --
    //  speciate the aqueous liquid (molality on ITS water), freeze a_w,
    //  split, hand the organic water back to the speciation, repeat.  The
    //  update is damped on a detected oscillation exactly as the speciation's
    //  own I fixed point is (announced there; this loop is inside the outer
    //  Newton's residual, so it must stay quiet and simply converge -- the
    //  converged state is announced once at the answer).  DETERMINISTIC:
    //  every evaluation starts from orgW = 0, never from the previous trial
    //  (a residual that remembers where the solver came from is
    //  path-dependent, and its FD Jacobian is worth nothing).
    auto resolveLiquid = [&](const sVector& vap, SpeciationResult& sr,
                             LiquidState& ls) -> bool
    {
        if (!wetOrganic || !twoLiquids)
        {
            speciate(vap, 0.0, sr);
            if (wetOrganic) awFrozen = sr.aw;
            return liquidState(vap, ls);
        }
        scalar orgW = 0.0;
        scalar orgWpp = std::numeric_limits<scalar>::quiet_NaN();
        scalar lam = 1.0;
        const sVector nBl = backboneMoles(vap);
        for (int itW = 0; itW < 40; ++itW)
        {
            speciate(vap, orgW, sr);
            awFrozen = sr.aw;
            if (!split.best(nBl, ls))
            {
                //  The trial does not admit the two-liquid set: report it
                //  exactly as liquidState does, with the speciation at the
                //  single-liquid basis so the caller's fallback is coherent.
                speciate(vap, 0.0, sr);
                split.single(nBl, ls);
                return false;
            }
            const scalar orgWnew = ls.nOrg[solventBk];
            if (std::abs(orgWnew - orgW) <= 1.0e-12 * std::max(1.0, nW))
                return true;
            if (itW >= 2 && std::abs(orgWnew - orgWpp)
                              < 0.1 * std::abs(orgWnew - orgW))
                lam = std::max(0.5 * lam, 1.0/64.0);
            orgWpp = orgW;
            orgW  += lam * (orgWnew - orgW);
        }
        throw std::runtime_error("ReactiveVLE: the organic-water /"
            " speciation joint fixed point did not converge in 40 rounds"
            " (wet organic) -- the trial is reported unphysical.");
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
        //  The SOLVENT always prices on the aqueous side: its VLE consumer
        //  multiplies by the speciation's a_w (the multiplicative
        //  decomposition), and the organic-side number ALREADY contains that
        //  factor through the wet-organic equality -- routing the solvent
        //  through the organic side would count a_w twice.
        if (ls.split && b != solventBk)
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
        LiquidState ls0;
        (void)resolveLiquid(v0, sr, ls0);
        //  THE PHASES DECLARED, not the phases convenient.  This sum decides
        //  whether a vapour exists at all, and computing it on a SINGLE liquid
        //  when the case declares two is not a small error: benzene held in a
        //  water-rich backbone shows a mole fraction near 1e-4 against a gamma
        //  in the hundreds, and the product is a partial pressure of tens of
        //  atmospheres for a liquid whose real benzene pressure is a fifth of
        //  one.  Such a pre-check waves every case through into a Newton
        //  hunting a vapour that is not there (2026-07-27).
        //  ls0 resolved jointly with the speciation above (wet organic:
        //  the pair shares the water; dry: the historical sequence).
        scalar pSum = 0.0;
        //  Kept component by component as well as summed: a stage K-value is
        //  an incipient quantity and needs the parts, not the total.
        res.pEqAtm.assign(nApp, 0.0);
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
                res.pEqAtm[appIdx] = pI;
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
            res.pEqAtm[appIdx] = pM;
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
                //  Apparent (monomer) basis: a dimer is two monomers here as
                //  it is everywhere else on the apparent component basis.
                res.pEqAtm[appIdx] = pM + 2.0 * pD;
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
        if (subsaturatedProbe || pSum * kAtm <= P_Pa)
        {
            scalar nTot = 0.0; for (auto x : n) nTot += x;
            for (std::size_t i = 0; i < nApp; ++i) res.xApp[i] = n[i]/nTot;
            res.V_over_F  = 0.0;
            res.trueState = sr;
            res.pH        = sr.pH;
            res.converged = true;
            res.diagnostic = (subsaturatedProbe && pSum * kAtm > P_Pa)
                ? "subsaturated PROBE: the fully speciated v = 0 liquid,"
                  " HYPOTHETICAL at this (T, P) (sum p_eq "
                  + std::to_string(pSum) + " atm exceeds P) -- an incipient"
                  " basis, not a flash answer"
                : "single liquid (sum of equilibrium partial"
                  " pressures " + std::to_string(pSum) + " atm below P)";
            //  THE SECOND LIQUID OF A SUBSATURATED ANSWER (2026-08-10,
            //  found by marcilla02, the first case whose organic is PRESENT
            //  with no vapour): v0 IS the answer here, ls0 already carries
            //  the converged split, and this early return used to walk past
            //  the finalisation block that publishes it -- so the stream
            //  left as one liquid while the run's own narration said
            //  PRESENT.  Publish it; and a decided-present organic whose
            //  split did not resolve is refused exactly as the two-phase
            //  finalisation refuses it (a one-liquid answer under a
            //  two-liquid declaration is no answer at all).
            if (twoLiquids)
            {
                if (!ls0.split)
                    throw std::runtime_error("ReactiveVLE: the declared"
                        " second liquid was PRESENT on the feed but its"
                        " split does not converge at the (subsaturated)"
                        " answer -- the answer would be a one-liquid answer"
                        " reported under a two-liquid declaration.  No"
                        " partial answer is returned.");
                res.nOrgApp.assign(nApp, 0.0);
                for (std::size_t b = 0; b < cfg_.backbone.size(); ++b)
                    res.nOrgApp[cfg_.backbone[b]] = ls0.nOrg[b];
                if (verbosity >= 2)
                {
                    scalar sA = 0.0, sO = 0.0;
                    for (std::size_t b = 0; b < nBk; ++b)
                    { sA += ls0.nAq[b]; sO += ls0.nOrg[b]; }
                    std::cout << "  second liquid (organic): " << std::fixed
                              << std::setprecision(4)
                              << (sO / std::max(sA + sO, 1.0e-300) * 100.0)
                              << " % of the backbone liquid moles\n"
                                 "    component      x_org      x_aq     "
                                 " ln(a_org/a_aq)\n";
                    for (const auto b : orgPos)
                        std::cout << "    " << std::left << std::setw(12)
                                  << cfg_.apparent[cfg_.backbone[b]]
                                  << std::right << std::setw(10)
                                  << std::setprecision(6) << ls0.xOrg[b]
                                  << std::setw(10) << ls0.xAq[b]
                                  << std::setw(14) << std::scientific
                                  << std::setprecision(2)
                                  << (std::log(std::max(
                                          ls0.gOrg[b]*ls0.xOrg[b], 1e-300))
                                    - std::log(std::max(
                                          ls0.gAq[b]*ls0.xAq[b], 1e-300))
                                    - (wetOrganic && b == solventBk
                                       ? std::log(std::max(awFrozen, 1e-300))
                                       : 0.0))
                                  << std::fixed << "\n";
                    std::cout << "    (both liquids leave as ONE apparent"
                                 " liquid stream -- the split is internal"
                                 " state, like the speciation)\n";
                }
            }
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
                if (subsaturatedProbe && pSum * kAtm > P_Pa)
                    std::cout << "  [reactive] subsaturated PROBE at (T,P):"
                                 " the v = 0 liquid is HYPOTHETICAL here"
                                 " (sum p_eq = " << std::setprecision(4)
                              << pSum << " atm exceeds P) -- returned as an"
                                 " incipient basis, not as a flash answer\n";
                else
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
    scalar nTot = 0.0; for (auto x : n) nTot += x;
    auto unpack = [&](const sVector& u, sVector& vap)
    { unpackVapour(u, act, n, nTot, nApp, vap); };

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
    const scalar dimPatm = P_Pa / kAtm;
    auto trueVapourOf = [&](const sVector& vap) -> TrueVap
    { return trueVapour(vap, act, dimIdx, nApp, Kd, dimPatm); };


    //  THE TERMS each equation balances, filled by every residual evaluation
    //  and read by the NORMALIZATION (solver/Convergence.H section 2).  Two
    //  per equation, equation-major:  [ ln(liquid side), ln(vapour side) ],
    //  whose difference IS r_k.  They are what the residual is measured
    //  against; without them 1e-9 is a magnitude compared with nothing.
    //  An UNPHYSICAL trial leaves them empty -- there is no balance to
    //  normalize against at a point that is not a state, and an empty term
    //  set is the degenerate branch, which is the honest verdict there.
    sVector termsLast;

    auto residual = [&](const sVector& u) -> sVector
    {
        termsLast.clear();
        sVector vap; unpack(u, vap);
        // A TRIAL point may be unphysical (a step that nearly dries the
        // solvent sends molalities -> infinity and the Davies fixed point
        // diverges).  A diverging trial is NOT a failed solve: return a huge
        // residual so the damped outer Newton backtracks away from it.  Only
        // a divergence AT the accepted solution surfaces as a real refusal.
        //  The guard covers the WHOLE evaluation, not just the speciation
        //  step.  A trial that strips a solute out of the liquid entirely
        //  makes its dissolved species vanish from the result, and reading it
        //  back raises the curation refusal -- right at the answer, wrong at a
        //  trial.  Catching only the diverging fixed point left that second
        //  path uncaught, and flash13 hit it the day the seed changed
        //  (2026-07-27).
        try
        {
        LiquidState ls;
        if (!resolveLiquid(vap, srLast, ls)) return sVector(nV, 1.0e6);
        const TrueVap tv = trueVapourOf(vap);
        const scalar tau = std::max(tv.tau, 1.0e-300);
        //  A trial that does not admit the phase set being solved is reported
        //  unphysical, exactly as a diverging speciation is: the damped outer
        //  Newton backtracks away from it, and if the ANSWER lies on the other
        //  side of the phase boundary the outer phase loop -- not a branch in
        //  here -- moves the whole configuration there.  (The liquid state
        //  above is resolved JOINTLY with the speciation -- one entry.)
        sVector r(nV);
        termsLast.assign(2*nV, 0.0);
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
                termsLast[2*k]   = std::log(std::max(pR, 1.0e-300));
                termsLast[2*k+1] = std::log(std::max(pA, 1.0e-300));
                r[k] = termsLast[2*k] - termsLast[2*k+1];
                continue;
            }
            const scalar K  = std::pow(10.0, gasLogK(*gasFor(idx), T_K));
            termsLast[2*k]   = std::log(std::max(
                                   dissolvedActivity(idx, srLast, ls), 1.0e-300));
            termsLast[2*k+1] = std::log(std::max(K * pA, 1.0e-300));
            r[k] = termsLast[2*k] - termsLast[2*k+1];
        }
        return r;
        }
        catch (const std::exception&)
        { termsLast.clear(); return sVector(nV, 1.0e6); }
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

    //  The verdict carrier: raw AND normalized, seed AND answer, plus the
    //  criterion that decided.  Seeded at the FIRST residual evaluation of
    //  the whole solve (phase pass 0), so `reduction()` measures the solve.
    solver::ResidualReport conv;
    bool    convSeeded = false;
    sVector terms;                 // the term set at the CURRENT accepted u

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
    //  THE OUTER NEWTON WALKS, AND SAYS SO (2026-08-24).
    //
    //  This is where the reactive path's advisories are BORN.  Every trial
    //  below runs a full inner speciation at a composition the damped Newton
    //  invented -- seeds, backtracks, caged steps, finite-difference columns,
    //  whole discarded phase passes -- and an electrolyte kernel raises an
    //  out-of-band caveat on most of them.  On column13 that is where the
    //  ionic strengths of 8.01, 7.93 and 6.77 mol/kg come from: states no
    //  sour water is in, reported to the reader as though they qualified the
    //  answer.
    //
    //  Framing it HERE rather than at each caller is the whole point.  The
    //  column's MESH, the adiabatic flash's T search and the energy report's
    //  per-stream pricing all reach the same Newton; one frame at the search
    //  covers every one of them, and a caller that never heard of advisories
    //  gets the right answer anyway.
    //
    //  This is the SAME first/middle/final structure `innerVerbosity` already
    //  uses a thousand lines above -- and for the same reason.  That switch
    //  was fixed in 2026-07-27 because the block reported the INITIAL GUESS's
    //  pH as though it were the answer; the advisories had the identical
    //  defect and kept it three fields longer.  The frame closes right before
    //  the JOINT acceptance below, which re-evaluates everything AT the
    //  answer, so that evaluation's caveats are `accepted`.
    //
    //  AND THAT CLOSE IS, TODAY, INERT -- measured, not assumed.  Removing it
    //  entirely leaves column13's advisory tally BYTE-IDENTICAL (12 accepted,
    //  95 trial, same frames).  Every accepted caveat on that case arrives by
    //  a path that opens no frame at all: the post-solve pass in
    //  `Flowsheet::solve` that speciates each converged stream as a liquid,
    //  which raises the same sentences and reaches the reader anyway.
    //
    //  It stays for two reasons that are not "it might help".  First, that
    //  pass speciates a stream's OVERALL composition as a liquid, which for a
    //  two-phase stream is a different state from the converged equilibrium
    //  liquid this Newton just solved -- they coincide on this corpus and are
    //  not the same computation.  Second, and decisive: without the close,
    //  whether a reader is told anything about the answer would depend on an
    //  unrelated pass in another subsystem continuing to exist.  A contract
    //  that holds by coincidence is not a contract.  What is NOT claimed is
    //  that any corpus case demonstrates it; none does, and the gate says so.
    AdvisoryFrame walk("reactive equilibrium: outer Newton search");

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
    u[0] = std::log(num::flatVapourSeed * nTot);
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
            //  A SEED TRIAL, and it is allowed to be unphysical.  Pushing a
            //  solute's liquid to nothing makes its dissolved species drop out
            //  of the speciation result, and reading that back is a CURATION
            //  refusal -- correct at the answer, wrong here: this is the
            //  Rachford-Rice loop looking for a starting point, and a trial it
            //  cannot price is simply a trial to walk away from.  Same posture
            //  the residual already takes toward a diverging speciation
            //  (2026-07-27, found when flash13's RR round drove the ammonia
            //  out of the liquid).
            try
            {
                SpeciationResult sr;
                LiquidState ls;
                if (!resolveLiquid(vap, sr, ls)) return false;
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
                        p[k] += 2.0*Kd*p[k]*p[k];    // apparent moles / dimer
                }
            }
            catch (const std::exception&) { return false; }
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
                                         * psi, (1.0 - num::rrGuard)*n[idx]);
                }
                p = pr;
            }
            if (seeded && psi > num::psiFloor) psiRR = psi;
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
                    std::max(num::oddsFloor, pv[k] / std::max(pSum, num::pTiny)));
                const scalar ym = std::min(1.0 - 1e-6,
                    std::max(num::oddsFloor, pv[nV-1] / std::max(pSum, num::pTiny)));
                uc[k+1] = std::log(yk / ym);         // odds vs the reference
            }
        };
        sVector uFlat(nV, 0.0);
        uFlat[0] = std::log(num::flatVapourSeed * nTot);
        oddsFrom(pFeed.empty() ? p : pFeed, uFlat);
        u = uFlat;
        if (psiRR > num::psiFloor)
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
    terms = termsLast;
    rn = norm2(r);
    bool convergedOuter = false;
    conv.criterion.clear();      // this pass's verdict, not the last one's
    it = 0;
    const int maxIt = conv_.maxIter;
    for (; it < maxIt && !convergedOuter; ++it)
    {
        //  THE VERDICT, on the normalized residual (solver/Convergence.H).
        //  `rn` (the L2 norm) stays exactly what it was -- it is the LINE
        //  SEARCH's descent measure, not the convergence test, and the two
        //  were only ever the same number by accident.
        const solver::Normalization nz = solver::normalizeResidual(r, terms);
        if (!convSeeded)
        {
            conv.rawInitial  = nz.rawL1;
            conv.normInitial = nz.normalized;
            convSeeded = true;
        }
        conv.rawFinal  = nz.rawL1;
        conv.normFinal = nz.normalized;
        if (verbosity >= 3)
            std::cout << "  [reactive] outer " << std::setw(2) << it
                      << "   |r|2 = " << std::scientific
                      << std::setprecision(3) << rn
                      << "   |r|1 = " << nz.rawL1
                      << "   normalized = " << nz.normalized
                      << (nz.degenerate ? "  (normalization degenerate)" : "")
                      << "\n";
        if (solver::convergedNow(conv_, conv.normInitial, nz.normalized,
                                 nz.rawL1, nz.degenerate, conv.criterion))
        { convergedOuter = true; break; }
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
                    //  NonConvergence, not a refusal: a degenerate interior
                    //  system is the phase split having no answer AT THIS
                    //  TRIAL STATE (a simplex corner, a band edge) -- the
                    //  same kind of failure as the stalled Newton below, and
                    //  the same legitimate continuation applies (stageK's
                    //  incipient probe).  Nothing about the CASE is wrong.
                    throw NonConvergence("ReactiveVLE: singular outer"
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
        for (int ls = 0; ls < num::outerLineSteps; ++ls, lambda *= 0.5)
        {
            sVector ut(nV);
            for (std::size_t j = 0; j < nV; ++j)
                ut[j] = std::min(uHi, std::max(uLo, u[j] + lambda*du[j]));
            const sVector rt = residual(ut);
            const scalar rtn = norm2(rt);
            if (rtn < rn * (1.0 - num::armijo) || rtn < num::outerTiny)
            { u = ut; r = rt; rn = rtn; terms = termsLast; accepted = true;
              break; }
        }
        if (!accepted)
            break;                       // stalled -- joint check decides
    }

    //  The pass's verdict, named.  "Not converged" is a verdict too, and the
    //  two ways of failing (the cap, and a line search with no decreasing
    //  step left) are different facts about the solve, so they get different
    //  sentences.
    if (!convergedOuter)
        conv.criterion = (it >= maxIt) ? solver::exhaustedCriterion(conv_)
                                       : solver::stalledCriterion();
    conv.converged  = convergedOuter;
    conv.iterations = it;

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

    walk.close();       // the search is over; what follows IS the answer

    // ---- JOINT acceptance: re-evaluate EVERYTHING at the answer -----------
    //  And REPORT it: this is the call whose numbers are the answer, so it is
    //  the one that gets the diagnostics.  The activation trace stays
    //  suppressed -- the network is the same one it announced at the start.
    innerVerbosity = verbosity;
    sVector vap; unpack(u, vap);
    const sVector rFin = residual(u);                // also refreshes srLast
    innerVerbosity = 0;
    //  The five numbers, taken at the ACCEPTED state -- the same evaluation
    //  the answer itself comes from, so the reported residual is the answer's
    //  residual and not the last trial's.
    {
        const solver::Normalization nzF =
            solver::normalizeResidual(rFin, termsLast);
        conv.rawFinal  = nzF.rawL1;
        conv.normFinal = nzF.normalized;
    }
    scalar rMax = 0.0; for (auto rv : rFin) rMax = std::max(rMax, std::abs(rv));
    //  ACCEPTANCE = the per-leg joint check AND the declared convergence
    //  contract.  Both, and the second half is new: before it, an outer
    //  Newton that ran out of iterations could still be waved through by the
    //  per-leg check, so a tolerance a case DECLARED and the solve never met
    //  came out as a silent pass.  A declared control that cannot decide
    //  anything is a comment (Convergence.H).
    const bool jointOK = rMax < 1.0e-7 && conv.converged;
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
        const TrueVap tvF = trueVapourOf(vap);
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
    //  The SECOND LIQUID, per apparent component, on the same one-mole-of-
    //  feed basis as xApp.  Computed HERE and not inside the verbosity block
    //  that prints it: what the stream file carries cannot depend on how
    //  loudly the run was asked to talk.
    if (twoLiquids)
    {
        SpeciationResult srF; LiquidState lsF;
        (void)resolveLiquid(vap, srF, lsF);
        if (lsF.split && !lsF.nOrg.empty())
        {
            res.nOrgApp.assign(nApp, 0.0);
            for (std::size_t b = 0; b < cfg_.backbone.size(); ++b)
                res.nOrgApp[cfg_.backbone[b]] = lsF.nOrg[b];
        }
        //  A declared-and-present organic that does not split AT THE ANSWER
        //  is refused below (a one-liquid answer under a two-liquid
        //  declaration), so an empty nOrgApp never reaches a stream quietly.
    }
    res.trueState    = srLast;
    res.pH           = srLast.pH;
    res.resPhaseMax  = rMax;
    res.iterations   = sol.iterations;
    res.outerResidual = conv;
    res.converged    = jointOK;
    res.diagnostic   = jointOK ? "coupled speciation + VLE converged (joint"
                                 " residual check passed)"
                               : "JOINT residuals NOT satisfied";
    if (!jointOK)
    {
        auto sci = [](scalar v)
        {
            std::ostringstream os;
            os << std::scientific << std::setprecision(4) << v;
            return os.str();
        };
        throw NonConvergence("ReactiveVLE: coupled speciation + phase"
            " equilibrium did NOT converge (|r|max = " + std::to_string(rMax)
            + " after " + std::to_string(sol.iterations) + " outer"
            " iterations) -- no partial answer is returned."
            "\n  raw   |r|1   initial " + sci(conv.rawInitial)
            + "  ->  final " + sci(conv.rawFinal)
            + "\n  normalized   initial " + sci(conv.normInitial)
            + "  ->  final " + sci(conv.normFinal)
            + "\n  reduction    normFinal/normInitial = "
            + sci(conv.reduction())
            + "\n  tolerance    " + sci(conv_.tolerance)
            + "   relTol " + sci(conv_.relTol)
            + "   maxIter " + std::to_string(conv_.maxIter)
            + (convDefaulted_ ? "   (defaults)" : "   (system/solverDict)")
            + "\n  criterion    " + conv.criterion);
    }

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
        //  THE CONVERGENCE VERDICT, in full.  Five numbers and the criterion
        //  that decided, because a residual quoted alone is a magnitude
        //  compared with nothing.  The RAW residual is this solver's own
        //  (sum of |ln(a_liquid) - ln(K p)| over the volatiles -- log-form,
        //  therefore dimensionless); it is kept because it is the number a
        //  reader can trace back to a partial pressure.  The NORMALIZED one
        //  is what the verdict is taken on.  Contract + the honest limits of
        //  the OpenFOAM analogy: solver/Convergence.H.
        {
            const auto& c = res.outerResidual;
            std::cout << "  outer-Newton convergence (normalized residual,"
                         " solver/Convergence.H):\n"
                      << std::scientific << std::setprecision(4)
                      << "    raw   |r|1   initial " << c.rawInitial
                      << "  ->  final " << c.rawFinal
                      << "   (log-form, dimensionless)\n"
                      << "    normalized   initial " << c.normInitial
                      << "  ->  final " << c.normFinal << "\n"
                      << "    reduction    normFinal/normInitial = "
                      << c.reduction() << "\n"
                      << "    tolerance    " << conv_.tolerance
                      << "   relTol " << conv_.relTol
                      << "   maxIter " << conv_.maxIter
                      << (convDefaulted_ ? "   (defaults)"
                                         : "   (system/solverDict)") << "\n"
                      << "    criterion    " << c.criterion << "\n"
                      << "    verdict      "
                      << (c.converged ? "CONVERGED" : "NOT converged")
                      << " after " << c.iterations << " outer iterations\n"
                      << std::defaultfloat;
        }
        if (twoLiquids)
        {
            //  The second liquid at the ANSWER, not at the feed: how much of
            //  the liquid it is, what it holds, and the activity equality that
            //  ties it to the aqueous phase.  That last column is the one to
            //  read -- it is the equilibrium itself, printed, and if it is not
            //  zero the split is not converged whatever the outer residual says.
            SpeciationResult srA; LiquidState lsA;
            (void)resolveLiquid(vap, srA, lsA);
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
                          //  The solvent's aqueous activity carries the
                          //  ionic a_w factor (wet organic) -- the printed
                          //  residual is the equality actually solved.
                          << (std::log(std::max(lsA.gOrg[b]*lsA.xOrg[b],1e-300))
                            - std::log(std::max(lsA.gAq [b]*lsA.xAq [b],1e-300))
                            - (wetOrganic && b == solventBk
                               ? std::log(std::max(awFrozen, 1e-300)) : 0.0))
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
