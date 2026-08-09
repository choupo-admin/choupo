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

#include "IsothermalFlash.H"
#include "core/Constants.H"
#include "thermo/phase/SolidPhase.H"
#include "thermo/solidEquilibrium/SolidEquilibrium.H"
#include "solver/NelderMead.H"
#include "solver/NewtonND.H"
#include "solver/NewtonRaphson.H"
#include "solver/StabilityTest.H"
#include "solver/Wegstein.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <limits>
#include <memory>
#include <stdexcept>
#include "streams/SpeciationBlock.H"
#include "thermo/electrolyte/ReactiveVLE.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

namespace Choupo {

namespace {

scalar RR(const sVector& z, const sVector& K, scalar V)
{
    scalar s = 0.0;
    for (std::size_t i = 0; i < z.size(); ++i)
        s += z[i] * (K[i] - 1.0) / (1.0 + V * (K[i] - 1.0));
    return s;
}

scalar dRR_dV(const sVector& z, const sVector& K, scalar V)
{
    scalar s = 0.0;
    for (std::size_t i = 0; i < z.size(); ++i)
    {
        scalar d = 1.0 + V * (K[i] - 1.0);
        s -= z[i] * (K[i] - 1.0) * (K[i] - 1.0) / (d * d);
    }
    return s;
}

//  ---- The LIQUID+SOLID (SLE) branch -- migration S4b (2026-08-09) --------
//
//  A declared crystallizing SolidPhase beside ONE liquid and NO vapour is a
//  freeze-concentration problem: the liquid concentrates until the crystal
//  component's activity satisfies  gamma_c x_c = exp(-dG_fus/(R T))  --
//  the K = 1 identity SolidPhase::fEffective derives (and check_ice_freezing
//  pins in closed form).  Presence is decided by THE ONE solid-equilibrium
//  mechanism (solidEq::equilibrate, ruling R1's active-set + simultaneous
//  damped Newton): each solid phase becomes a SolidCandidate whose lnSI is
//  ln(f_liquid_c / f_solid_c) at the CURRENT liquid inventory and whose
//  `remove` pulls the owning component out of that inventory -- the one
//  ledger.  Nothing here knows what the crystal is; the model lives entirely
//  behind the two fEffective calls, which share the SAME Psat reference by
//  construction.
//
//  The solve runs on a per-MOLE-OF-FEED basis: the solver's Jacobian probes
//  are ABSOLUTE transfers (1e-8..1e-4 mol), so a normalised inventory keeps
//  them well-scaled whatever the case's F.
FlashSolution solveSLE(const FlashInput&    in,
                       const ThermoPackage& thermo,
                       const FlashOptions&  opts,
                       std::size_t          liqIdx,
                       const std::vector<std::size_t>& solidIdxs)
{
    const std::size_t n = in.z.size();
    sVector nLiq = in.z;                     // liquid inventory, mol / mol feed

    std::vector<solidEq::SolidCandidate> cands;
    std::vector<std::size_t> crystalOf;      // candidate -> component index
    for (auto si : solidIdxs)
    {
        const auto& sp = dynamic_cast<const SolidPhase&>(thermo.phase(si));
        const std::size_t c = sp.crystalIndex();
        //  A crystal of a component the feed does not carry: absent means
        //  absent -- no candidate, no announcement (the same posture stageK
        //  takes for an exact zero).
        if (!(in.z[c] > 0.0)) continue;

        solidEq::SolidCandidate cd;
        cd.name = sp.name();
        cd.lnSI = [&thermo, &nLiq, &in, liqIdx, si, c](scalar T) -> scalar
        {
            scalar tot = 0.0;
            for (auto v : nLiq) tot += v;
            if (!(nLiq[c] > 0.0) || !(tot > 0.0))
                throw std::runtime_error("IsothermalFlash[SLE]: the liquid's "
                    "inventory of '" + thermo.comp(c).name() + "' is exhausted "
                    "-- complete solidification leaves no liquid phase, and a "
                    "LIQUID+SOLID equilibrium needs both.  A pure (or nearly "
                    "pure) feed below its melting point freezes entirely; that "
                    "answer is outside this phase set.  Raise T, or add "
                    "solute.");
            sVector x(nLiq);
            for (auto& v : x) v /= tot;
            //  fEffective is the X-FREE effective fugacity (the K-value
            //  convention: gamma_i * Psat_i for a liquid), so the liquid's
            //  actual fugacity needs the mole fraction back:
            //  f_liq_c = x_c * gamma_c * Psat_c.  The solid side is a PURE
            //  crystal (activity 1) and stays as returned.  Getting this
            //  wrong reads as d lnSI/dn = +d ln(gamma)/dn and the solver's
            //  own consistency guard refuses -- which is how this line was
            //  first written wrong and caught in the same minute.
            const scalar fL = x[c]
                * thermo.phase(liqIdx).fEffective(T, in.P, x)[c];
            const scalar fS = thermo.phase(si).fEffective(T, in.P, x)[c];
            return std::log(fL / fS);
        };
        cd.remove = [&nLiq, c](scalar dn) { nLiq[c] -= dn; };
        cands.push_back(std::move(cd));
        crystalOf.push_back(c);
    }

    //  Glass-box: at verbosity 4 show each candidate's opening state -- the
    //  two fugacities and the lnSI the complementarity starts from.
    if (opts.verbosity >= 4)
        for (std::size_t j = 0; j < cands.size(); ++j)
        {
            const std::size_t c = crystalOf[j];
            sVector x(nLiq);
            scalar tot = 0.0; for (auto v : x) tot += v;
            for (auto& v : x) v /= tot;
            const scalar fL = x[c]
                * thermo.phase(liqIdx).fEffective(in.T, in.P, x)[c];
            const scalar fS = thermo.phase(solidIdxs[j]).fEffective(in.T, in.P, x)[c];
            std::cout << "  [sle:debug] candidate '" << cands[j].name
                      << "' (crystal of " << thermo.comp(c).name() << "): "
                      << "f_liquid = x*gamma*Psat = " << fL
                      << " Pa, f_solid = " << fS
                      << " Pa, lnSI = " << std::log(fL / fS) << "\n";
        }

    std::vector<std::string> events;
    int iters = 0;
    try
    {
        iters = solidEq::equilibrate(cands, in.T, 400, 1.0e-10, &events);
    }
    catch (...)
    {
        //  The narration up to the failure is evidence; a throw must not
        //  swallow it (and the buffer must not either -- hence the flush).
        if (opts.verbosity >= 2)
            for (const auto& e : events)
                std::cout << "  [sle] " << e << "\n";
        std::cout.flush();
        throw;
    }
    if (opts.verbosity >= 2)
        for (const auto& e : events)
            std::cout << "  [sle] " << e << "\n";

    FlashSolution sol;
    sol.sleBranch  = true;
    sol.converged  = true;                   // equilibrate throws otherwise
    sol.iterations = iters;
    sol.V_over_F   = 0.0;
    //  The chemistry-route convention, kept deliberately: sol.x is the
    //  apparent LIQUID+SOLID material (the crystal still inside), and the
    //  stream assembly subtracts solidFlows to leave the fluid -- so the
    //  outlet's overall material equals the feed exactly, by construction.
    sol.x = in.z;
    sol.y.assign(n, 0.0);
    sol.K.assign(n, 0.0);

    sVector s(n, 0.0);
    scalar  nSolid = 0.0, rMax = 0.0;
    bool    any = false;
    for (std::size_t j = 0; j < cands.size(); ++j)
        if (cands[j].n > 0.0)
        {
            s[crystalOf[j]] += cands[j].n * in.F;
            nSolid += cands[j].n;
            rMax = std::max(rMax, std::fabs(cands[j].lnSI(in.T)));
            any = true;
        }
    sol.residual = rMax;
    if (any) sol.solidFlows = s;
    sol.regime = any
        ? "liquid + solid (SLE: crystallizing solid at equilibrium)"
        : "subcooled liquid (declared solid stays subsaturated)";

    //  Glass-box observables: the crystal component's ACTIVITY in the liquor
    //  beside the closed-form saturation value it must equal when the solid
    //  is present -- the freezing-point-depression identity, published so a
    //  reader (and the gate) can check K = 1 without rerunning anything.
    sol.extraKpis["solidFraction"] = nSolid;         // mol solid / mol feed
    {
        scalar tot = 0.0;
        for (auto v : nLiq) tot += v;
        sVector x(nLiq);
        if (tot > 0.0) for (auto& v : x) v /= tot;
        const auto gamma = thermo.phase(liqIdx).activityCoefficients(in.T, x);
        for (std::size_t j = 0; j < cands.size(); ++j)
        {
            const std::size_t c = crystalOf[j];
            const Component& comp = thermo.comp(c);
            sol.extraKpis["a_" + comp.name()] = gamma[c] * x[c];
            const scalar dGfus = comp.subHfus()
                               * (1.0 - in.T / comp.subTripleT());
            sol.extraKpis["aEq_" + comp.name()] =
                std::exp(-dGfus / (constant::R * in.T));
        }
    }
    return sol;
}

} // anonymous namespace

FlashSolution
IsothermalFlash::solveCore(const FlashInput&    in,
                           const ThermoPackage& thermo,
                           const FlashOptions&  opts)
{
    FlashSolution sol;
    const std::size_t n = in.z.size();
    if (n != thermo.n())
        throw std::runtime_error("Flash: feed composition length ("
            + std::to_string(n) + ") differs from thermo components ("
            + std::to_string(thermo.n()) + ")");

    // ---- REACTIVE package: delegate WHOLE equilibrium to the ThermoPackage.
    //  The unit implements no chemistry (the ratified contract, section 6b):
    //  a reactive-electrolyte package resolves speciation + phase transfer +
    //  electroneutrality jointly inside equilibrate(); the flash receives the
    //  APPARENT phase split.  Non-convergence throws there (never exit 0).
    if (thermo.hasReactiveEquilibrium())
    {
        const auto r = thermo.equilibrate(in.T, in.P, in.F, in.z,
                                          opts.verbosity);
        sol.converged  = r.converged;
        sol.V_over_F   = r.V_over_F;
        sol.x          = r.xApp;
        sol.y          = r.yApp;
        sol.K.assign(n, 0.0);
        for (std::size_t i = 0; i < n; ++i)
            sol.K[i] = (r.xApp[i] > 0.0) ? r.yApp[i] / r.xApp[i] : 0.0;
        sol.iterations = r.iterations;
        sol.residual   = r.resPhaseMax;
        // The chemistry's own observables, KPI-bound: sweeps and outer
        // drivers read these to SEE T act through both van't Hoff legs
        // (dissolution AND -- when declared -- vapour dimerisation).
        sol.extraKpis["pH"]           = r.pH;
        sol.extraKpis["p_eq_sum_atm"] = r.pEqSumAtm;
        for (const auto& [nm, pI] : r.pMolecularAtm)
            sol.extraKpis["p_" + nm + "_atm"] = pI;
        sol.dimerHeat_J_per_molFeed =
            r.vapDimerMolPerMolFeed * r.dimDH_J;
        if (r.dimerOn)
        {
            sol.extraKpis["p_mono_atm"]  = r.pMonoAtm;
            sol.extraKpis["p_dimer_atm"] = r.pDimerAtm;
            sol.extraKpis["dimer_share"] =
                (r.pMonoAtm + r.pDimerAtm > 0.0)
                    ? r.pDimerAtm / (r.pMonoAtm + r.pDimerAtm) : 0.0;
        }
        sol.regime     = r.V_over_F > 0.0
            ? "reactive electrolyte VLE (simultaneous speciation + phase"
              " equilibrium; pH " + std::to_string(r.pH).substr(0, 5) + ")"
            : "single liquid (reactive: subsaturated at T,P; fully speciated)";

        //  ---- The SOLVED speciation, as species FLOWS ----------------------
        //  The kernel works in molality (mol per kg of solvent water) because
        //  that is the reference the activity models use.  A stream carries
        //  FLOWS, so the conversion runs here, once, against the liquid's own
        //  water: n_i = m_i * (F_liq * x_water * MW_water).  This is a
        //  DECOMPOSITION of the liquid, attached to the liquid outlet below,
        //  and it is report-only -- nothing reads it back to build a stream.
        if (const auto* cfg = thermo.reactiveConfig())
        {
            const std::size_t wi = cfg->solventIdx;
            const scalar Fliq = in.F * (1.0 - r.V_over_F);
            const scalar kgw  = (wi < r.xApp.size())
                ? Fliq * r.xApp[wi] * thermo.comp(wi).MW() : 0.0;
            //  THE PRECIPITATE IS A PHASE, not an aqueous species.  Each
            //  mineral whose OWNING component the package declares moves into
            //  the stream's solid material -- "dissolved CaCO3 and solid
            //  CaCO3 are the same flowsheet component, so precipitation moves
            //  nothing between components; it moves material between PHASES"
            //  (ReactiveVLE.H).  That sentence was written before there was
            //  anywhere to move it TO; there is now.
            //
            //  The apparent basis is untouched: componentMolarFlows still
            //  carries the whole CaCO3.  What changes is that the crystal
            //  stops being reported as if it were in solution.
            sVector solidFlows(thermo.n(), 0.0);
            bool anyPlaced = false;
            for (const auto& [mineral, molal] : r.trueState.precipitated)
            {
                auto it = cfg->solidOwner.find(mineral);
                if (it == cfg->solidOwner.end() || molal <= 0.0) continue;
                solidFlows[it->second] += molal * kgw / 1000.0;
                anyPlaced = true;
            }
            sol.speciation = speciationBlock(
                thermo, r.trueState, kgw, r.pH,
                [&](const std::string& m)
                { return cfg->solidOwner.count(m) > 0; });
            if (anyPlaced) sol.solidFlows = solidFlows;

            //  The second liquid, on the stream's own basis.  `nOrgApp` is
            //  per mole of FEED (like xApp), so it scales by in.F -- the same
            //  conversion the kgw line above performs for the molalities.
            if (!r.nOrgApp.empty())
            {
                auto org = std::make_shared<sVector>(r.nOrgApp);
                for (auto& v : *org) v *= in.F;
                sol.organicLiquid = org;
            }
        }
        return sol;
    }

    // ----------------------------------------------------------------------
    //  Outer loop on composition.
    //
    //  Direct substitution:
    //      x_{k+1} = g(x_k)        where g(x) = z / (1 + V·(K(x) - 1))
    //  This converges linearly with rate g'(x), which for strongly
    //  non-ideal mixtures is close to 1 (very slow).
    //
    //  Wegstein acceleration (default):
    //      uses a secant approximation of g' to produce a Newton-like
    //      over-relaxation.  Typically cuts the iteration count
    //      from O(20-40) to O(5-10).
    // ----------------------------------------------------------------------
    sVector x = in.z;
    sVector y = in.z;

    //  Identify which two phases the flash equilibrates.
    //
    //  BY TYPE, NEVER BY POSITION (2026-08-07).  This used to default to
    //  `phaseAlpha = 0, phaseBeta = 1` -- the first two phases in DECLARATION
    //  ORDER -- and only the LL and VLLE branches asked what type they had
    //  got.  For the flat reader that was invisibly correct, because it builds
    //  liquid then vapour itself.  The `gammaGamma` reader pushes whatever the
    //  case declares, in the case's order, so
    //
    //      phases ( liquid solid vapour )
    //
    //  gave a VL flash that equilibrated the liquid against the SOLID and
    //  reported it as the vapour.  It converges, it closes, it exits 0.  The
    //  same class of defect as reading a datum on the wrong reference rung:
    //  the arithmetic is fine and the answer is about something else.
    //
    //  Selecting by type is byte-identical for every package whose order was
    //  already (liquid, vapour), which is the whole corpus -- the point is
    //  that it now cannot stop being true without saying so.
    const auto liqAll = thermo.phasesOfType("liquid");
    const auto vapAll = thermo.phasesOfType("vapor");
    const auto solAll = thermo.phasesOfType("solid");

    //  A DECLARED PHASE THAT NO FLASH CONSUMES MUST NOT BE SILENTLY DROPPED.
    //
    //  SERVED SINCE S4b (2026-08-09), for exactly ONE shape: crystallizing
    //  solid(s) beside ONE liquid with NO vapour phase and the default VL
    //  phase set -- the freeze-concentration (SLE) flash, solveSLE above,
    //  presence decided by THE ONE solid-equilibrium mechanism.  Every other
    //  solid-bearing shape still refuses below with its route named:
    //    * solid BESIDE a vapour (a triple-point / sublimation-adjacent
    //      problem: which fluid the crystal equilibrates against is a design
    //      question) -- the NAMED S4c gap, not an oversight;
    //    * solid beside TWO liquids (LL/VLLE phase sets) -- same gap family;
    //    * `mode inert` -- the stub SolidPhase::fEffective itself refuses
    //      (propagate-but-skip is not built);
    //    * a mineral precipitating FROM SOLUTION -- the CHEMISTRY route
    //      (chemistryDict solidPhases + the component's own solidPhases{}
    //      dissolution K), live since flash16/flash19, NOT this Phase.
    //  Contract: docs/architecture/solid-formation-routes.md.
    if (!solAll.empty())
    {
        bool allCryst = true;
        for (auto si : solAll)
        {
            const auto* sp = dynamic_cast<const SolidPhase*>(&thermo.phase(si));
            if (!sp || sp->mode() != SolidPhase::Mode::Crystallizing)
            { allCryst = false; break; }
        }
        if (allCryst && vapAll.empty() && liqAll.size() == 1
            && opts.phaseSet == PhaseSet::VL)
        {
            sol = solveSLE(in, thermo, opts, liqAll[0], solAll);
            return sol;
        }
        throw std::runtime_error(
            "IsothermalFlash: this package declares a solid phase ('"
            + thermo.phase(solAll[0]).name() + "') in a shape the flash does "
            "not serve.  The LIQUID+SOLID (SLE) branch serves crystallizing "
            "solid(s) beside ONE liquid with NO vapour phase; here the "
            "package has " + std::to_string(liqAll.size()) + " liquid(s), "
            + std::to_string(vapAll.size()) + " vapour phase(s), and "
            "phaseSet " + std::to_string(static_cast<int>(opts.phaseSet))
            + " (0 = VL).\n"
            "  A solid BESIDE a vapour or a second liquid is the NAMED S4c "
            "gap (docs/design/solid-equilibrium-migration.md): which fluid "
            "the crystal equilibrates against is a design question, not a "
            "default.  An `inert` solid is a separate unbuilt stub.\n"
            "  If the solid PRECIPITATES FROM SOLUTION (a mineral -- calcite, "
            "gypsum), it is not a Phase here at all: declare it in "
            "constant/chemistryDict `equilibria { solidPhases ( ... ); }` and "
            "give the owning component its own `solidPhases{}` dissolution "
            "equilibrium.  That route is live and flash19 exercises it.\n"
            "  Contract: docs/architecture/solid-formation-routes.md.");
    }

    //  The VL default, now stated as what it means rather than as 0 and 1.
    //  Where a type is absent the old index survives, so a package with an
    //  unusual phase set behaves exactly as it did before this change.
    std::size_t phaseAlpha = liqAll.empty() ? 0 : liqAll[0];
    std::size_t phaseBeta  = vapAll.empty() ? 1 : vapAll[0];
    if (opts.phaseSet == PhaseSet::LL)
    {
        const auto& liqs = liqAll;
        if (liqs.size() < 2)
            throw std::runtime_error("LL flash needs >= 2 liquid phases in "
                "the thermoPackage (got " + std::to_string(liqs.size()) + ")");
        phaseAlpha = liqs[0];
        phaseBeta  = liqs[1];

        // -----------------------------------------------------------------
        //  LL flash via direct minimisation of the Gibbs energy of
        //  mixing on the simplex of compositions.  Variables in
        //  Nelder-Mead (length n):
        //
        //      v[0]         =  β                         in (0, 1)
        //      v[1..n-1]    =  x_α[0..n-2]               in (0, 1)
        //
        //  x_α[n-1] is set by Σ x_α = 1 (penalty if any x_α < 0).
        //  x_β is set by overall mass balance:
        //      x_β_i = (z_i − (1−β) x_α_i) / β
        //  (penalty if any x_β < 0).
        //
        //  Objective (per mole of feed, divided by RT):
        //      G(β, x_α) = (1−β) Σ x_α_i [ln x_α_i + ln γ_α_i(x_α)]
        //                +   β   Σ x_β_i [ln x_β_i + ln γ_β_i(x_β)]
        //
        //  Direct minimisation cannot fall into the K=1 saddle of g(Y)
        //  that traps Newton-on-fixed-point methods --- the simplex
        //  algorithm probes g values, not roots of its gradient.
        //  Multi-start gives global-search robustness over symmetric
        //  LLE landscapes.
        // -----------------------------------------------------------------

        // Decision-only Michelsen TPD (cheap pre-check).
        auto stab = solver::michelsenTPD(thermo.phase(phaseAlpha), in.T, in.P, in.z);

        if (opts.verbosity >= 3)
        {
            std::cout << "\nMichelsen TPD stability test on phase '"
                      << thermo.phase(phaseAlpha).name() << "':\n"
                      << "  tm_min   = " << std::scientific << std::setprecision(4)
                      << stab.tmMin
                      << "       unstable = " << (stab.unstable ? "YES" : "no")
                      << "\n\n";
        }
        if (!stab.unstable)
        {
            sol.regime    = "single liquid (no LL split detected by TPD)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        const std::size_t iA =
            (opts.llAlphaRichComp == static_cast<std::size_t>(-1))
            ? 0     : opts.llAlphaRichComp;
        const std::size_t iB =
            (opts.llBetaRichComp == static_cast<std::size_t>(-1))
            ? n - 1 : opts.llBetaRichComp;

        // ACTIVE components: restrict the Gibbs minimisation to species actually
        // present in the feed (z > 0).  A stream in a large flowsheet carries
        // many components that are ZERO here; searching the full simplex over
        // them makes the LL split unfindable in high dimension.  Inactive
        // species stay 0 in both phases -> mass is conserved EXACTLY.  When all
        // species are active (nA == n) the search is identical to the full one,
        // so every existing LL case is byte-unchanged.
        std::vector<std::size_t> act;
        for (std::size_t i = 0; i < n; ++i)
            if (in.z[i] > 1.0e-10) act.push_back(i);
        const std::size_t nA = act.size();
        auto posInAct = [&](std::size_t full) -> std::size_t
        {
            for (std::size_t a = 0; a < nA; ++a) if (act[a] == full) return a;
            return 0;
        };

        const scalar INFEASIBLE_PENALTY = 1.0e8;
        const scalar EPS_SIMPLEX        = 1.0e-9;

        // Fewer than two present species cannot split -> single liquid.
        if (nA < 2)
        {
            sol.regime    = "single liquid (one component present)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        // Pack (β, x_α[0..n-2]) -> (β, x_α[0..n-1], x_β[0..n-1])  or  fail.
        auto unpack = [&](const sVector& v,
                          scalar& beta, sVector& xA, sVector& xB) -> bool
        {
            beta = v[0];
            if (beta < EPS_SIMPLEX || beta > 1.0 - EPS_SIMPLEX) return false;

            xA.assign(n, 0.0);
            scalar sumA = 0.0;
            for (std::size_t a = 0; a < nA - 1; ++a)
            {
                xA[act[a]] = v[1 + a];
                if (xA[act[a]] < EPS_SIMPLEX) return false;
                sumA += xA[act[a]];
            }
            xA[act[nA - 1]] = 1.0 - sumA;
            if (xA[act[nA - 1]] < EPS_SIMPLEX) return false;

            xB.assign(n, 0.0);
            for (std::size_t a = 0; a < nA; ++a)
            {
                const std::size_t i = act[a];
                xB[i] = (in.z[i] - (1.0 - beta) * xA[i]) / beta;
                if (xB[i] < EPS_SIMPLEX) return false;
            }
            return true;
        };

        auto gibbsObjective = [&](const sVector& v) -> scalar
        {
            scalar beta;
            sVector xA, xB;
            if (!unpack(v, beta, xA, xB)) return INFEASIBLE_PENALTY;

            const auto gA = thermo.phase(phaseAlpha).activityCoefficients(in.T, xA);
            const auto gB = thermo.phase(phaseBeta ).activityCoefficients(in.T, xB);

            scalar G = 0.0;
            for (std::size_t a = 0; a < nA; ++a)
            {
                const std::size_t i = act[a];
                const scalar lnAi = std::log(xA[i])
                                  + std::log(std::max<scalar>(gA[i], 1.0e-30));
                const scalar lnBi = std::log(xB[i])
                                  + std::log(std::max<scalar>(gB[i], 1.0e-30));
                G += (1.0 - beta) * xA[i] * lnAi
                   +        beta  * xB[i] * lnBi;
            }
            return G;
        };

        // Reference: Gibbs of staying in a single phase at the feed.
        // If the multi-start NM cannot find anything below this, we
        // declare the feed stable (TPD said unstable, but the basin
        // it pointed to may have collapsed by direct minimisation).
        scalar gFeed = INFEASIBLE_PENALTY;
        {
            auto gZ = thermo.phase(phaseAlpha).activityCoefficients(in.T, in.z);
            gFeed = 0.0;
            for (std::size_t a = 0; a < nA; ++a)
            {
                const std::size_t i = act[a];
                gFeed += in.z[i] * (std::log(std::max<scalar>(in.z[i], 1.0e-30))
                                  + std::log(std::max<scalar>(gZ[i], 1.0e-30)));
            }
        }

        // Multi-start: 4 simplexes that bracket the symmetric LL
        // landscape from different basins.
        std::vector<sVector> starts;
        auto pushStart = [&](scalar betaG, std::size_t richPos) {
            sVector s(nA, 0.0);
            s[0] = betaG;
            for (std::size_t a = 0; a < nA - 1; ++a)
                s[1 + a] = (a == richPos) ? 0.92 : 0.04;
            // If x_α[last] would come out negative or >1, renormalise.
            scalar sumA = 0.0;
            for (std::size_t a = 0; a < nA - 1; ++a) sumA += s[1 + a];
            if (sumA >= 1.0)
            {
                const scalar scale = 0.95 / sumA;
                for (std::size_t a = 0; a < nA - 1; ++a) s[1 + a] *= scale;
            }
            starts.push_back(s);
        };

        // Pure-iA and pure-iB biased starts at β = 0.5, plus their
        // β = 0.25 and β = 0.75 variants (rich component -> its active slot).
        pushStart(0.50, posInAct(iA));
        pushStart(0.50, posInAct(iB));
        pushStart(0.25, posInAct(iA));
        pushStart(0.75, posInAct(iA));

        // Bounds
        sVector lo(nA, 1.0e-4), hi(nA, 1.0 - 1.0e-4);

        solver::NMOptions nmo;
        nmo.maxIter           = 400;
        nmo.tolX              = 1.0e-5;
        nmo.tolF              = 1.0e-7;
        nmo.simplexInitFactor = 0.10;

        scalar bestG     = std::numeric_limits<scalar>::infinity();
        sVector bestV;
        int     totalEvals  = 0;
        int     bestStart   = -1;
        bool    bestConv    = false;

        for (std::size_t k = 0; k < starts.size(); ++k)
        {
            auto res = solver::nelderMead(gibbsObjective, starts[k], lo, hi, nmo);
            totalEvals += res.evaluations;
            if (res.f < bestG)
            {
                bestG     = res.f;
                bestV     = res.x;
                bestStart = static_cast<int>(k);
                bestConv  = res.converged;
            }
        }

        if (opts.verbosity >= 3)
        {
            std::cout << "LL flash via Gibbs minimisation (Nelder-Mead, "
                      << starts.size() << " multi-starts):\n"
                      << "  evaluations  : " << totalEvals  << "\n"
                      << "  best start   : #" << bestStart  << "\n"
                      << "  G(LL split)  : " << std::scientific
                      << std::setprecision(6) << bestG  << "\n"
                      << "  G(feed only) : " << gFeed << "\n"
                      << "  ΔG = G_LL − G_z: " << (bestG - gFeed) << "\n\n";
        }

        // If the best LL configuration has G higher than feed, the
        // TPD detected a weak instability that the Gibbs landscape
        // does not actually realise (numerical or model artifact);
        // fall back to single-phase.
        if (!(bestG < gFeed - 1.0e-10))
        {
            sol.regime    = "single liquid (Gibbs min finds no improvement over feed)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        scalar betaFinal; sVector xA, xB;
        unpack(bestV, betaFinal, xA, xB);

        // ---- TPD on the CONVERGED phases (advisory, 2026-07-25) ----------
        //  Multi-start minimisation reduces the local-minimum risk but does
        //  not prove global stability; the honest closing act is to ask the
        //  tangent-plane question OF THE ANSWER: is either product phase
        //  itself unstable (a third phase thermodynamically favourable)?
        //  ADVISORY posture (WARN, never refuse) until corpus evidence
        //  justifies promotion -- the same warn-first path every new guard
        //  has walked (bounds, utility-port cabling).
        auto tpdAdvisory = [&](const char* nm, const sVector& xc)
        {
            auto st = solver::michelsenTPD(thermo.phase(phaseAlpha),
                                           in.T, in.P, xc);
            if (st.unstable)
                std::cerr << "WARNING: LL flash: converged phase " << nm
                          << " is TPD-unstable (tm = " << st.tmMin
                          << ") -- a further split may be thermodynamically"
                             " favourable; the reported 2-phase answer may be"
                             " a local minimum.  Consider phaseSet VLLE.\n";
        };
        tpdAdvisory("L-alpha", xA);
        tpdAdvisory("L-beta",  xB);

        sol.regime     = "two-phase liquid (LL via Gibbs minimisation)";
        sol.V_over_F   = betaFinal;
        sol.x          = xA;
        sol.y          = xB;
        sol.K          = thermo.Kvec_phases(phaseAlpha, phaseBeta,
                                            in.T, in.P, xA, xB);
        sol.iterations = totalEvals;
        sol.residual   = bestG;
        sol.converged  = bestConv;
        return sol;
    }

    // ============================================================
    //                  VLLE (vapour + 2 liquids)
    // ============================================================
    if (opts.phaseSet == PhaseSet::VLLE)
    {
        const auto& vaps = vapAll;
        const auto& liqs = liqAll;
        if (vaps.empty())
            throw std::runtime_error("VLLE flash needs >= 1 vapor phase "
                "in the thermoPackage (got 0)");
        if (liqs.size() < 2)
            throw std::runtime_error("VLLE flash needs >= 2 liquid phases "
                "in the thermoPackage (got " + std::to_string(liqs.size()) + ")");
        (void)vaps[0];   // vapor phase index not currently needed (γ unused; we use Psat directly)
        const std::size_t pAlpha = liqs[0];
        const std::size_t pBeta  = liqs[1];

        // -----------------------------------------------------------------
        //  VLLE via direct Gibbs minimisation on the (2n)-dimensional
        //  composition simplex.  Free variables:
        //
        //      v[0]               =  β_V       in (0, 1)
        //      v[1]               =  β_α       in (0, 1-β_V)
        //      v[2..n]            =  y[0..n-2]      (n-1 entries)
        //      v[n+1..2n-1]       =  x_α[0..n-2]    (n-1 entries)
        //
        //  Derived:
        //      β_β  = 1 - β_V - β_α            (penalty if ≤ 0)
        //      y[n-1], x_α[n-1] from Σ x = 1   (penalty if ≤ 0)
        //      x_β  from overall mass balance per component
        //
        //  Objective (per mole feed, ÷ RT, reference = pure liquid):
        //
        //      G = β_V Σ y_i [ln y_i + ln(P / Psat_i(T))]
        //        + β_α Σ x_α_i [ln x_α_i + ln γ_α_i(x_α)]
        //        + β_β Σ x_β_i [ln x_β_i + ln γ_β_i(x_β)]
        //
        //  Same logic as the 2-phase LL branch, with one extra phase
        //  contribution.  Ideal-gas vapour assumed (φ_i = 1); the
        //  ln(P/Psat_i) term encodes the vapour-vs-liquid stability
        //  via Antoine.
        // -----------------------------------------------------------------

        const scalar INFEAS    = 1.0e8;
        const scalar EPS_VLLE  = 1.0e-9;
        const std::size_t nVars = 2 * n;          // (β_V, β_α, y[0..n-2], x_α[0..n-2])

        auto unpackVLLE = [&](const sVector& v,
                              scalar& bV, scalar& bA, scalar& bB,
                              sVector& y, sVector& xA, sVector& xB) -> bool
        {
            bV = v[0]; bA = v[1];
            bB = 1.0 - bV - bA;
            if (bV < EPS_VLLE || bA < EPS_VLLE || bB < EPS_VLLE) return false;
            if (bV > 1.0 - EPS_VLLE || bA > 1.0 - EPS_VLLE
                || bB > 1.0 - EPS_VLLE) return false;

            y.assign(n, 0.0);
            xA.assign(n, 0.0);
            scalar sumY = 0.0, sumA = 0.0;
            for (std::size_t i = 0; i < n - 1; ++i)
            {
                y [i] = v[2 + i];
                xA[i] = v[2 + (n - 1) + i];
                if (y[i] < EPS_VLLE || xA[i] < EPS_VLLE) return false;
                sumY += y [i];
                sumA += xA[i];
            }
            y [n - 1] = 1.0 - sumY;
            xA[n - 1] = 1.0 - sumA;
            if (y[n - 1] < EPS_VLLE || xA[n - 1] < EPS_VLLE) return false;

            xB.assign(n, 0.0);
            for (std::size_t i = 0; i < n; ++i)
            {
                xB[i] = (in.z[i] - bV * y[i] - bA * xA[i]) / bB;
                if (xB[i] < EPS_VLLE) return false;
            }
            // Consistency: Σ xB should equal 1 (auto if mass balance holds).
            scalar sumB = 0.0;
            for (auto v2 : xB) sumB += v2;
            if (std::abs(sumB - 1.0) > 1.0e-4) return false;
            return true;
        };

        auto vlleObjective = [&](const sVector& v) -> scalar
        {
            scalar bV, bA, bB;
            sVector y, xA, xB;
            if (!unpackVLLE(v, bV, bA, bB, y, xA, xB)) return INFEAS;

            const auto gA = thermo.phase(pAlpha).activityCoefficients(in.T, xA);
            const auto gB = thermo.phase(pBeta ).activityCoefficients(in.T, xB);

            scalar G = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                const scalar Psat =
                    std::max<scalar>(thermo.comp(i).vp().Psat_Pa(in.T), 1.0e-30);
                const scalar lnY = std::log(y [i]) + std::log(in.P / Psat);
                const scalar lnA = std::log(xA[i]) + std::log(std::max<scalar>(gA[i], 1.0e-30));
                const scalar lnB = std::log(xB[i]) + std::log(std::max<scalar>(gB[i], 1.0e-30));
                G += bV * y [i] * lnY
                   + bA * xA[i] * lnA
                   + bB * xB[i] * lnB;
            }
            return G;
        };

        // Reference Gibbs of the feed-as-single-liquid.
        scalar gFeed = INFEAS;
        {
            auto gZ = thermo.phase(pAlpha).activityCoefficients(in.T, in.z);
            gFeed = 0.0;
            for (std::size_t i = 0; i < n; ++i)
                gFeed += in.z[i] * (std::log(std::max<scalar>(in.z[i], 1.0e-30))
                                  + std::log(std::max<scalar>(gZ[i], 1.0e-30)));
        }

        // -----------------------------------------------------------------
        //  Multi-start.  Five canonical configurations bracketing the
        //  region where 3-phase coexistence can occur.
        // -----------------------------------------------------------------
        const std::size_t iA =
            (opts.llAlphaRichComp == static_cast<std::size_t>(-1))
            ? 0     : opts.llAlphaRichComp;
        const std::size_t iB =
            (opts.llBetaRichComp == static_cast<std::size_t>(-1))
            ? n - 1 : opts.llBetaRichComp;

        // Mass-balance-derived multi-start.  For each candidate
        // (β_V, β_α, x_α, x_β) we solve for y by overall mass balance:
        //
        //     y_i = (z_i − β_α x_α_i − β_β x_β_i) / β_V
        //
        // If all y_i ∈ (0, 1), the start is admissible AND feasible
        // (no INFEAS penalty on the first evaluation).  This is
        // essential for ternaries: with naive component-by-component
        // bias the projected x_β often comes out negative and every
        // start returns the penalty, leaving Nelder-Mead with no
        // gradient to follow.
        auto packStart = [&](scalar bV, scalar bA, const sVector& yFull,
                             const sVector& xAFull) {
            sVector s(nVars, 0.0);
            s[0] = bV;
            s[1] = bA;
            for (std::size_t i = 0; i < n - 1; ++i)
            {
                s[2 + i]           = yFull[i];
                s[2 + (n - 1) + i] = xAFull[i];
            }
            return s;
        };

        auto compRich = [&](scalar bias, std::size_t richIdx) {
            sVector c(n, (1.0 - bias) / static_cast<scalar>(std::max<std::size_t>(n - 1, 1)));
            c[richIdx] = bias;
            return c;
        };

        std::vector<sVector> starts;
        auto pushDerivedStart = [&](scalar bV, scalar bA,
                                    const sVector& xA, const sVector& xB) {
            const scalar bB = 1.0 - bV - bA;
            if (bV < 0.02 || bA < 0.02 || bB < 0.02) return;
            sVector y(n);
            scalar sumY = 0.0;
            for (std::size_t i = 0; i < n; ++i)
            {
                y[i] = (in.z[i] - bA * xA[i] - bB * xB[i]) / bV;
                if (y[i] < 1.0e-4 || y[i] > 1.0 - 1.0e-4) return;
                sumY += y[i];
            }
            if (std::abs(sumY - 1.0) > 1.0e-3) return;
            starts.push_back(packStart(bV, bA, y, xA));
        };

        // Canonical heteroazeotrope seed: α extremely rich in iA, β
        // extremely rich in iB.  Sweep over a grid of (β_V, β_α) so
        // at least one falls inside the simplex of feasible mass
        // balances for the given feed composition.
        for (scalar bV : { 0.20, 0.35, 0.50, 0.65, 0.80 })
        {
            for (scalar bA : { 0.10, 0.15, 0.25, 0.40 })
            {
                pushDerivedStart(bV, bA,
                                 compRich(0.95, iA), compRich(0.95, iB));
                pushDerivedStart(bV, bA,
                                 compRich(0.99, iA), compRich(0.99, iB));
            }
        }
        // Also seed the *binary* heteroazeotrope pattern (compositions
        // mostly along the iA-iB axis, third component small), which
        // covers binary cases as well.
        if (starts.empty())
        {
            // Last-ditch fallback: rich-iA in one liquid, rich-iB in the
            // other, vapour = feed.  Rarely feasible but better than
            // nothing.
            starts.push_back(packStart(0.20, 0.40, in.z,
                                        compRich(0.90, iA)));
        }

        sVector lo(nVars, 1.0e-4), hi(nVars, 1.0 - 1.0e-4);

        solver::NMOptions nmo;
        nmo.maxIter           = 500;
        nmo.tolX              = 1.0e-5;
        nmo.tolF              = 1.0e-7;
        nmo.simplexInitFactor = 0.10;

        scalar  bestG    = std::numeric_limits<scalar>::infinity();
        sVector bestV;
        int     totalEvals = 0;
        int     bestStart  = -1;
        bool    bestConv   = false;

        for (std::size_t k = 0; k < starts.size(); ++k)
        {
            auto res = solver::nelderMead(vlleObjective, starts[k], lo, hi, nmo);
            totalEvals += res.evaluations;
            if (res.f < bestG)
            {
                bestG     = res.f;
                bestV     = res.x;
                bestStart = static_cast<int>(k);
                bestConv  = res.converged;
            }
        }

        if (opts.verbosity >= 3)
        {
            std::cout << "VLLE flash via Gibbs minimisation (Nelder-Mead, "
                      << starts.size() << " multi-starts):\n"
                      << "  vars          : " << nVars << "  (β_V, β_α, y, x_α)\n"
                      << "  evaluations   : " << totalEvals << "\n"
                      << "  best start    : #" << bestStart << "\n"
                      << "  G(3-phase split): " << std::scientific
                      << std::setprecision(6) << bestG  << "\n"
                      << "  G(feed only)  : " << gFeed << "\n"
                      << "  ΔG = G_split - G_z: " << (bestG - gFeed) << "\n\n";
        }

        if (!(bestG < gFeed - 1.0e-10))
        {
            sol.regime    = "single liquid (Gibbs min finds no 3-phase improvement over feed)";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.K.assign(n, 1.0);
            sol.converged = true;
            return sol;
        }

        scalar bV, bA, bB;
        sVector y, xA, xB;
        unpackVLLE(bestV, bV, bA, bB, y, xA, xB);

        // If one of the three phases is vanishingly small, demote to
        // 2-phase (V+L or LL).  Threshold: 1 %.
        const scalar PHASE_EPS = 1.0e-2;
        if (bV < PHASE_EPS)
        {
            // 2-phase LL --- emit as the LL branch normally would.
            const scalar denom = 1.0 - bV;
            sol.regime     = "two-phase liquid (LL, VLLE attempt found V β ≈ 0)";
            sol.V_over_F   = bB / denom;
            sol.x          = xA;
            sol.y          = xB;
            sol.K          = thermo.Kvec_phases(pAlpha, pBeta, in.T, in.P, xA, xB);
            sol.iterations = totalEvals;
            sol.residual   = bestG;
            sol.converged  = bestConv;
            return sol;
        }
        if (bA < PHASE_EPS || bB < PHASE_EPS)
        {
            // 2-phase V+L --- pick the larger liquid as the unique L.
            const auto& xL = (bA >= bB) ? xA : xB;
            sol.regime     = "two-phase (VL, VLLE attempt found one L β ≈ 0)";
            sol.V_over_F   = bV;
            sol.x          = xL;
            sol.y          = y;
            sol.K          = thermo.Kvec(in.T, in.P, xL, y);
            sol.iterations = totalEvals;
            sol.residual   = bestG;
            sol.converged  = bestConv;
            return sol;
        }

        // Genuine 3-phase
        sol.threePhase = true;
        sol.regime     = "three-phase (V + Lα + Lβ via Gibbs minimisation)";
        sol.betaVapor  = bV;
        sol.V_over_F   = bA;                  // β_α (alpha liquid fraction)
        sol.xVapor     = y;
        sol.x          = xA;
        sol.y          = xB;
        sol.K          = thermo.Kvec_phases(pAlpha, pBeta, in.T, in.P, xA, xB);
        sol.iterations = totalEvals;
        sol.residual   = bestG;
        sol.converged  = bestConv;
        return sol;
    }

    auto computeK = [&](const sVector& xA, const sVector& xB) -> sVector
    {
        if (opts.phaseSet == PhaseSet::VL)
            return thermo.Kvec(in.T, in.P, xA, xB);
        return thermo.Kvec_phases(phaseAlpha, phaseBeta,
                                  in.T, in.P, xA, xB);
    };

    // Short-circuit on phaseSet first — thermo.eos() may be null for LL.
    const bool isIdeal =
        (opts.phaseSet == PhaseSet::VL)
        && (thermo.activity().modelName() == "ideal")
        && (thermo.eos     ().modelName() == "idealGas");
    const bool useWegstein =
        (opts.accelerator == OuterAccelerator::Wegstein) && !isIdeal;

    solver::Wegstein accel(n, opts.wegsteinQmin, opts.wegsteinQmax);

    bool   phaseTrivial = false;
    int    outerIt      = 0;
    scalar compDelta    = 0.0;

    // The outer-loop table header prints LAZILY, right before its first row:
    // the K-value block, the phase test and the outer-0 Rachford-Rice table
    // all print between here and that row, so an up-front header would sit
    // orphaned from the rows it labels.
    bool outerHeaderPrinted = false;

    for (outerIt = 0; outerIt < opts.maxOuterIter; ++outerIt)
    {
        sol.K = computeK(x, y);

        // TRIVIAL-K SEED (phi-phi near-critical; Stryjek points exposed it).
        // At the UNSPLIT first iteration (x = y = z) a single-root cubic gives
        // K_i = phi_L/phi_V = 1 identically, the Rachford-Rice gate reads
        // g(0) = g(1) = 0 and declares a fake single phase inside a measured
        // two-phase region.  A trivial K is USELESS in any world, so seed the
        // FIRST iteration with the Wilson (1968) estimate
        //     K_i = (Pc_i/P) exp[5.373 (1+omega_i)(1 - Tc_i/T)]
        // to break the symmetry -- the next iteration re-evaluates the REAL
        // K(x,y) on the split.  gamma-phi/Henry K's are never all-1 (Psat/P,
        // H/P), so this fires ONLY on the phi-phi single-root pathology.
        // (The seed lives HERE, in the flash's initialisation -- an earlier
        // attempt inside Kvec corrupted the Gibbs phase comparison.)
        if (outerIt == 0)
        {
            bool trivial = true;
            for (std::size_t i = 0; i < n; ++i)
                if (std::abs(sol.K[i] - 1.0) > 1.0e-9) { trivial = false; break; }
            if (trivial)
            {
                for (std::size_t i = 0; i < n; ++i)
                {
                    const auto& c = thermo.comp(i);
                    if (c.Tc() > 0.0 && c.Pc() > 0.0)
                        sol.K[i] = (c.Pc() * 1.0e5 / in.P)
                                 * std::exp(5.373 * (1.0 + c.omega())
                                            * (1.0 - c.Tc() / in.T));
                }
                if (opts.verbosity >= 2)
                    std::cout << "  trivial K at the unsplit feed "
                                 "(single-root cubic) -- seeding iteration 0 "
                                 "with the Wilson correlation.\n";
            }
        }

        // ---- Phase test on current K's --------------------------------
        scalar g_at_0 = 0.0, g_at_1 = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            g_at_0 += in.z[i] * (sol.K[i] - 1.0);
            g_at_1 += in.z[i] * (sol.K[i] - 1.0) / sol.K[i];
        }

        if (outerIt == 0 && opts.verbosity >= 3)
        {
            // The header prints in the framing the K-value ACTUALLY uses.
            // phi-phi world: K = phi_L/phi_V from the same cubic -- gamma and
            // Psat play NO part, so neither is shown.  gamma-phi world: the
            // classic gamma*Psat/(phi*P) header, except a declared Henry
            // solute whose K comes from H(T), not Psat -- name its pair file.
            const bool phiPhi = (opts.phaseSet == PhaseSet::VL)
                             && (thermo.vleWorld() == "phiPhi");
            if (phiPhi)
            {
                std::cout << "K-values  (K = φ_L/φ_V, "
                          << thermo.eos().modelName()
                          << " both phases,  evaluated at x = y = z initially):\n";
                for (std::size_t i = 0; i < n; ++i)
                    std::cout << "  " << std::left << std::setw(12)
                              << thermo.comp(i).name()
                              << "    K = " << sol.K[i] << "\n";
            }
            else
            {
            const std::string gammaModel = thermo.activity().modelName();
            const std::string phiModel   = (opts.phaseSet == PhaseSet::VL)
                ? thermo.eos().modelName() : std::string("LL-mode");
            std::cout << "K-values  (γ = " << gammaModel
                      << ",  φ = " << phiModel
                      << ",  evaluated at x = z initially):\n";
            for (std::size_t i = 0; i < n; ++i)
            {
                std::cout << "  " << std::left << std::setw(12)
                          << thermo.comp(i).name();
                if (thermo.isHenrySolute(i))
                {
                    std::cout << "  K from Henry pair parameters/Henry/"
                              << thermo.comp(i).name() << "-"
                              << thermo.solventName() << ".dat";
                }
                else if (thermo.comp(i).hasVaporPressure())
                {
                    scalar Psat = thermo.comp(i).vp().Psat_Pa(in.T);
                    std::cout << "  Psat = " << std::fixed << std::setprecision(4)
                              << (Psat * 1.0e-5) << " bar";
                }
                else
                {
                    std::cout << "  Psat = (nonvolatile)         ";
                }
                std::cout << "    K = " << sol.K[i] << "\n";
            }
            }
            std::cout << "\nPhase test:\n"
                      << "  g(V=0) = " << std::scientific
                      << std::setprecision(4) << g_at_0
                      << "    g(V=1) = " << g_at_1 << "\n\n";
        }

        if (g_at_0 <= 0.0)
        {
            sol.regime    = "subcooled liquid";
            sol.V_over_F  = 0.0;
            sol.x         = in.z;
            sol.y.assign(n, 0.0);
            sol.converged = true;
            phaseTrivial  = true;
            break;
        }
        if (g_at_1 >= 0.0)
        {
            sol.regime    = "superheated vapor";
            sol.V_over_F  = 1.0;
            sol.y         = in.z;
            sol.x.assign(n, 0.0);
            sol.converged = true;
            phaseTrivial  = true;
            break;
        }

        sol.regime = "two-phase";

        // ---- Inner Newton-Raphson on Rachford-Rice --------------------
        solver::NROptions nro;
        nro.tolerance = opts.tolerance;
        nro.maxIter   = opts.maxIter;
        nro.lower     = 0.0;
        nro.upper     = 1.0;
        nro.bracket   = true;

        const bool showInner = (opts.verbosity >= 4)
                            || (opts.verbosity >= 3 && outerIt == 0);
        if (showInner)
        {
            std::cout << "  [outer " << outerIt
                      << "] Rachford-Rice Newton (inner):\n"
                      << "    it          V           g(V)         dg/dV"
                      << "         ΔV\n"
                      << "    ----  -----------  -------------  -------------"
                      << "  -------------\n";
            nro.onIter = [&](const solver::NRTrace& tr)
            {
                std::cout << "    " << std::setw(4) << tr.iteration
                          << "  " << std::fixed << std::setprecision(8)
                          << std::setw(11) << tr.x
                          << "  " << std::scientific << std::setprecision(5)
                          << std::setw(13) << tr.f
                          << "  " << std::setw(13) << tr.dfdx
                          << "  " << std::setw(13) << tr.dx << "\n";
            };
        }
        auto fres = [&](scalar V) { return RR    (in.z, sol.K, V); };
        auto dres = [&](scalar V) { return dRR_dV(in.z, sol.K, V); };

        scalar V0 = (outerIt == 0) ? 0.5 : sol.V_over_F;
        auto r = solver::newton1D(fres, dres, V0, nro);

        sol.V_over_F   = r.x;
        sol.iterations += r.iterations;   // CUMULATIVE across outer passes (pass-4: 14-vs-1 confusion)
        sol.residual   = r.residual;
        sol.converged  = r.converged;

        // ---- g(x) = direct-substitution image of current x -------------
        sVector x_subst(n), y_new(n);
        for (std::size_t i = 0; i < n; ++i)
        {
            x_subst[i] = in.z[i] / (1.0 + sol.V_over_F * (sol.K[i] - 1.0));
            y_new[i]   = sol.K[i] * x_subst[i];
        }

        // ---- Wegstein acceleration on x ------------------------------
        sVector x_next = useWegstein
            ? accel.step(x, x_subst)
          : x_subst;

        // Normalise (Wegstein may push slightly off the simplex)
        scalar s = 0.0;
        for (auto v : x_next) s += v;
        if (s > 0.0)
            for (auto& v : x_next) v /= s;

        // |Δx|_2 between iterates (convergence metric)
        scalar dsum = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            scalar d = x_next[i] - x[i];
            dsum += d*d;
        }
        compDelta = std::sqrt(dsum);
        if (opts.residualSink) opts.residualSink(compDelta);

        if (opts.verbosity >= 3 && !isIdeal)
        {
            if (!outerHeaderPrinted)
            {
                std::cout << "Composition outer loop  ["
                          << (useWegstein ? "Wegstein-accelerated"
                                          : "direct substitution")
                          << "]:\n"
                          << "   it     |Δx|2         γ_1         γ_2";
                for (std::size_t i = 2; i < n; ++i)
                    std::cout << "         γ_" << (i+1);
                std::cout << (useWegstein ? "         q_1        q_2" : "")
                          << "\n"
                          << "  ----  -----------  ----------  ----------"
                          << (useWegstein ? "  ----------  ---------" : "")
                          << "\n";
                outerHeaderPrinted = true;
            }
            auto gam = thermo.activity().gamma(in.T, x_next);
            std::cout << "  " << std::setw(4) << outerIt
                      << "  " << std::scientific << std::setprecision(3)
                      << std::setw(11) << compDelta;
            std::cout << std::fixed << std::setprecision(5);
            for (std::size_t i = 0; i < n; ++i)
                std::cout << "  " << std::setw(10) << gam[i];
            if (useWegstein && accel.callCount() >= 2)
            {
                std::cout << std::fixed << std::setprecision(3);
                for (std::size_t i = 0; i < std::min<std::size_t>(n, 2); ++i)
                    std::cout << "  " << std::setw(10) << accel.lastQ()[i];
            }
            std::cout << "\n";
        }

        x = x_next; y = y_new;
        sol.x = x;
        sol.y = y;

        if (compDelta < opts.compositionTol) break;
    }

    if (!phaseTrivial && opts.verbosity >= 3)
        std::cout << "\nComposition outer loop (gamma/K refresh) converged after " << (outerIt + 1)
                  << " composition iteration"
                  << ((outerIt + 1 == 1) ? "" : "s")
                  << "  (|Δx|2 = " << std::scientific << std::setprecision(3)
                  << compDelta << ").\n";

    return sol;
}

int IsothermalFlash::solve(const DictPtr& dict,
                           const ThermoPackage& thermo,
                           int verbosity)
{
    auto feedDict = dict->subDict("feed");
    auto operDict = dict->subDict("operation");
    auto compDict = dict->subDict("composition");

    FlashInput in;
    in.F = feedDict->lookupScalar("F", Dims::molarFlow);
    // T and P fall back to the feed stream values if the user did
    // not set them explicitly under `operation` — natural propagation
    // in a flowsheet, override possible per unit.
    in.T = operDict->found("T")
             ? operDict->lookupScalar("T", Dims::temperature)
           : feedDict->lookupScalar("T", Dims::temperature);
    in.P = operDict->found("P")
             ? operDict->lookupScalar("P", Dims::pressure)
           : feedDict->lookupScalar("P", Dims::pressure);

    in.z.assign(thermo.n(), 0.0);
    scalar zsum = 0.0;
    for (const auto& key : compDict->keys())
    {
        std::size_t i = thermo.indexOf(key);
        in.z[i] = compDict->lookupScalar(key);
        zsum   += in.z[i];
    }
    if (std::abs(zsum - 1.0) > 1.0e-6)
    {
        std::cerr << "Warning: feed composition sums to " << zsum
                  << "; normalising.\n";
        for (auto& v : in.z) v /= zsum;
    }

    FlashOptions opts;
    opts.verbosity = verbosity;

    if (dict->found("outerAccelerator"))
    {
        std::string acc = dict->lookupWord("outerAccelerator");
        if      (acc == "wegstein"            ) opts.accelerator = OuterAccelerator::Wegstein;
        else if (acc == "directSubstitution"  ) opts.accelerator = OuterAccelerator::DirectSubstitution;
        else throw std::runtime_error("Unknown outerAccelerator: '" + acc + "'");
    }
    if (dict->found("compositionTol"))
        opts.compositionTol = dict->lookupScalar("compositionTol");
    if (dict->found("maxOuterIter"))
        opts.maxOuterIter   = static_cast<int>(dict->lookupScalar("maxOuterIter"));

    std::string psDeclared;
    if (operDict->found("phaseSet"))
    {
        const std::string ps = operDict->lookupWord("phaseSet");
        psDeclared = ps;
        if      (ps == "VL"  ) opts.phaseSet = PhaseSet::VL;
        else if (ps == "LL"  ) opts.phaseSet = PhaseSet::LL;
        else if (ps == "VLLE") opts.phaseSet = PhaseSet::VLLE;
        else if (ps == "auto")
        {
            /*---------------------------------------------------------------*\
              `phaseSet auto` -- the phase set as a RESULT, not an input.

              This repository has said for a while, in its own case dicts,
              that "the phase set is a RESULT, not an input", and then made
              the author type it.  Under `auto` the engine decides, and it
              decides from two things it already trusts -- never from a new
              heuristic:

                * WHAT THE PACKAGE ADMITS.  A formulation that declares one
                  liquid phase has no second liquid to split into, and one
                  that declares no vapour cannot boil.  The phase set can
                  never be richer than the declared thermophysical system,
                  and the VLLE path already refuses when it is asked for a
                  vapour the package does not have.
                * MICHELSEN's TANGENT-PLANE DISTANCE on the liquid -- the
                  same test the LL path runs before it minimises anything.
                  tm < 0 means a composition exists whose chemical potential
                  lies below the tangent plane at z: the feed is not stable
                  as one liquid.

              A first cut of this asked a THIRD question -- the
              Rachford-Rice bracket (sum z K, sum z/K) at the feed's own
              composition -- to decide whether a vapour would appear.  It was
              wrong, and wrong in the way that matters: on vlle03 it read
              sum zK = 0.965 and chose LL over the declared VLLE, losing a
              vapour the Gibbs minimisation does find.  K-values evaluated at
              the FEED are not the K-values at the split, and a strongly
              non-ideal system is exactly where they differ.  So the vapour
              question is not asked here at all: when a second liquid exists
              and the package has a vapour, the richest set is handed to the
              Gibbs minimisation, and GIBBS decides whether the vapour is
              populated.  That is the settled posture, not a new one.

              Opt-in, and it cannot move a case that does not ask: absent,
              the phase set stays VL exactly as before, and an explicit
              VL/LL/VLLE remains the author's override.
            \*---------------------------------------------------------------*/
            const std::size_t nLiq = thermo.phasesOfType("liquid").size();
            const std::size_t nVap = thermo.phasesOfType("vapor").size();
            bool   llSplit = false;
            scalar tmMin   = 0.0;
            if (nLiq >= 2)
            {
                const auto st = solver::michelsenTPD(
                    thermo.phase(thermo.phasesOfType("liquid")[0]),
                    in.T, in.P, in.z);
                llSplit = st.unstable;
                tmMin   = st.tmMin;
            }
            opts.phaseSet = !llSplit ? PhaseSet::VL
                          : (nVap >= 1 ? PhaseSet::VLLE : PhaseSet::LL);
            if (verbosity >= 2)
            {
                std::cout << "  [flash] phaseSet auto -> "
                          << (opts.phaseSet == PhaseSet::VL   ? "VL"
                            : opts.phaseSet == PhaseSet::LL   ? "LL" : "VLLE")
                          << "  (package admits " << nLiq << " liquid phase(s)"
                          << (nVap ? " + vapour" : ", no vapour") << "; ";
                if (nLiq >= 2)
                    std::cout << "TPD tm_min " << std::scientific
                              << std::setprecision(3) << tmMin
                              << (llSplit ? " -- second liquid"
                                          : " -- stable as one liquid")
                              << std::defaultfloat;
                else
                    std::cout << "one liquid declared -- nothing to split into";
                std::cout << ")\n";
                if (opts.phaseSet == PhaseSet::VLLE)
                    std::cout << "  [flash] the vapour is NOT asserted here --"
                                 " the richest admissible set goes to the Gibbs"
                                 " minimisation and Gibbs decides whether it is"
                                 " populated\n";
            }
        }
        else throw std::runtime_error("Unknown phaseSet '" + ps
            + "' (expected 'VL', 'LL', 'VLLE' or 'auto')");
    }

    /*-----------------------------------------------------------------------*\
      THE `model` SLOT: which MACHINE solves the flash.

      Four numerical worlds have always lived in this one unit and NONE of
      them had a name in the dictionary -- a student found out which one ran
      by reading the C++.  The distillation column settled the convention
      (`type` = which unit, `model` = which variant, `operation` = the
      values), and this is the same move, with the same posture: the DEFAULT
      is what already ran, so every existing case is untouched.

        rachfordRice       K-value iteration: Rachford-Rice inside, Wegstein
                           (or direct substitution) outside on composition.
        gibbsMinimisation  direct minimisation of the Gibbs energy of mixing.
                           Not an optimisation of taste: for a SYMMETRIC
                           gamma-model the K-value iteration converges to the
                           trivial K = 1 saddle -- two phases of identical
                           composition, which satisfies every equality and is
                           not a split.  This is why LL and VLLE take it.

      WHAT IS *NOT* IN THE LIST is the reactive path, and deliberately.  It
      is chosen by `thermo.hasReactiveEquilibrium()` -- a consequence of the
      formulation the case DECLARED (the one-knob rule), never a unit's
      choice.  Units never implement chemistry (the ratified section 6b).
      Naming it here would give one decision two homes and let a case declare
      a machine its package cannot run; so a reactive package with a declared
      `model` is REFUSED, by name, rather than silently overridden.
    \*-----------------------------------------------------------------------*/
    const bool reactivePkg = thermo.hasReactiveEquilibrium();
    const std::string declaredModel = dict->lookupWordOrDefault("model", "");
    const char* impliedModel =
        (opts.phaseSet == PhaseSet::VL) ? "rachfordRice" : "gibbsMinimisation";

    if (!declaredModel.empty())
    {
        if (reactivePkg)
            throw std::runtime_error("flash: `model " + declaredModel
                + ";` was declared, but this case's thermophysical package"
                  " resolves a REACTIVE electrolyte equilibrium -- speciation,"
                  " phase transfer and electroneutrality are solved jointly by"
                  " the package, and the unit implements no chemistry.  Which"
                  " machine runs is a consequence of the declared formulation,"
                  " not a unit-level choice: remove the `model` line (the"
                  " package's own announce says what it solved), or declare a"
                  " non-reactive formulation in constant/thermoPhysPropDict.");
        if (declaredModel != "rachfordRice" && declaredModel != "gibbsMinimisation")
            throw std::runtime_error("flash: unknown `model " + declaredModel
                + ";`.  Available: rachfordRice (K-value iteration:"
                  " Rachford-Rice + Wegstein) | gibbsMinimisation (direct"
                  " Gibbs minimisation -- required for a liquid-liquid split,"
                  " where the K-value iteration converges to the trivial"
                  " K = 1 saddle).");
        if (declaredModel == "rachfordRice" && opts.phaseSet != PhaseSet::VL)
            throw std::runtime_error("flash: `model rachfordRice;` with"
                " `phaseSet " + operDict->lookupWord("phaseSet") + ";`.  A"
                " liquid-liquid split cannot be reached by K-value iteration:"
                " for a symmetric activity model it converges to the trivial"
                " K = 1 saddle -- two phases of identical composition, which"
                " satisfies every equality and is not a split.  Declare"
                " `model gibbsMinimisation;` or drop the line (that is the"
                " default for this phase set).");
        if (declaredModel == "gibbsMinimisation" && opts.phaseSet == PhaseSet::VL)
            throw std::runtime_error("flash: `model gibbsMinimisation;` with"
                " a VL phase set.  The Gibbs path of this unit resolves the"
                " LIQUID phases; a vapour-liquid flash runs the K-value"
                " iteration.  Drop the line, or declare the phase set the"
                " machine is for (`phaseSet LL;` / `phaseSet VLLE;`).");
    }
    if (opts.verbosity >= 2 && !reactivePkg)
        std::cout << "  [flash] model " << impliedModel
                  << (declaredModel.empty() ? "  (implied by the phase set)"
                                            : "  (declared)") << "\n";
    if (operDict->found("alphaRich"))
        opts.llAlphaRichComp = thermo.indexOf(operDict->lookupWord("alphaRich"));
    if (operDict->found("betaRich"))
        opts.llBetaRichComp  = thermo.indexOf(operDict->lookupWord("betaRich"));

    // Pipe per-iteration composition residuals into UnitOperation's
    // recordResidual so the GUI's convergence plot can see them.
    opts.residualSink = [this](scalar r) { recordResidual(r); };

    if (opts.verbosity >= 3)
    {
        std::cout << "Feed: F = " << (in.F * 3600.0) << " kmol/h\n"
                  << "Operation: T = " << in.T << " K, P = "
                  << (in.P * 1.0e-5) << " bar\n"
                  << "Feed composition (z):\n";
        for (std::size_t i = 0; i < thermo.n(); ++i)
            std::cout << "  " << thermo.comp(i).name() << "  = " << in.z[i] << "\n";
        std::cout << "\n";
    }

    auto sol = solveCore(in, thermo, opts);
    if (opts.verbosity >= 2) printFlashResult(sol, thermo, in);

    // ---- Duty Q (the heat exchanged) -----------------------------------
    //   Q = F · (H_out - H_in).  H_in is the FEED at its inlet conditions
    //   (T_feed, P_feed, vf_feed); H_out is the equilibrium mixture at the
    //   operating (T, P).  For an isothermal flash with the feed already at
    //   T this is just the latent heat of the vaporised fraction; when the
    //   operation moves T (e.g. a condenser at T < T_feed) it is the full
    //   sensible + latent duty.  Sign: + = heating, - = cooling.  This makes
    //   the heat VISIBLE (a result), so the utility-allocation pass can size
    //   the steam / cooling-water it implies.  Q = 0 (adiabatic) emerges
    //   naturally when the operation does not move the stream's state.
    scalar Q_W = 0.0;
    bool   Q_valid = false;
    std::string Q_gap;                    // why the duty is unavailable
    try
    {
        const scalar T_feed  = feedDict->lookupScalar("T", Dims::temperature);
        const scalar P_feed  = feedDict->lookupScalarOrDefault("P", in.P, Dims::pressure);
        const scalar vf_feed = feedDict->lookupScalarOrDefault("vf", 0.0);
        const bool   pinned  =
            feedDict->lookupScalarOrDefault("phasePinned", 0.0) > 0.5;

        //  ---- R-E1: AN UNPINNED FEED *IS* ITS OWN EQUILIBRIUM ---------------
        //  (docs/design/tp-stream-energy-coherence.md, ratified 2026-08-09.)
        //  The constitution already says an unpinned TP stream's phase is a
        //  RESULT of equilibrium at (T, P, z); the MATERIAL side has always
        //  honoured that, and the duty did not -- it priced whatever `vf`
        //  happened to hold, which for an unpinned stream is the struct's 0.0,
        //  i.e. an undeclared `phase liquid;`.  flash19 paid +13.3 kW for
        //  "vaporising" a liquid that was never declared liquid.
        //
        //  So the re-flash runs whenever the feed is NOT pinned: the feed's
        //  own (T_feed, P_feed, z) resolved by the SAME solveCore this unit
        //  uses, which is what makes the identity operation cost zero (feed at
        //  the drum's own conditions => H_in == H_out, exactly).  A converged
        //  single-phase answer changes nothing (idempotent), so the cost of
        //  the extra solve buys coherence and never a different number where
        //  the old one was already right.
        //
        //  R-E2: a PINNED feed keeps its declared reading.  `vaporFraction q`
        //  still splits at q (the saturation pin), `phase liquid|gas` prices
        //  that phase -- and if that costs energy at unchanged (T, P), the
        //  case DECLARED a constrained/metastable inlet and the price is
        //  announced below rather than hidden.
        const bool wantSplit = pinned
            ? (vf_feed > 1.0e-9 && vf_feed < 1.0 - 1.0e-9)
            : true;
        bool feedSplit = wantSplit && !thermo.phasesOfType("vapor").empty();
        FlashSolution feedSol;
        if (feedSplit)
        {
            FlashInput fin; fin.F = 1.0; fin.T = T_feed; fin.P = P_feed; fin.z = in.z;
            FlashOptions fopts; fopts.verbosity = 0; fopts.phaseSet = opts.phaseSet;
            //  A feed state the package cannot resolve is a NAMED gap, never a
            //  crashed case and never a silent fall-back to the old pricing:
            //  the duty would then be a number about a state the engine just
            //  said it could not compute.  (Caveat C2 -- column13's stage-mix
            //  state refuses under the reactive package.)
            try
            {
                feedSol = solveCore(fin, thermo, fopts);
            }
            catch (const std::exception& fe)
            {
                throw std::runtime_error(
                    std::string("the feed's own equilibrium state could not be"
                    " resolved at its (T, P, z), so its enthalpy has no"
                    " defined value: ") + fe.what());
            }
            feedSplit = feedSol.converged
                     && feedSol.V_over_F > 1.0e-9
                     && feedSol.V_over_F < 1.0 - 1.0e-9;
        }

        // For an LL flash BOTH product phases are LIQUIDS: the `sol.y` slot
        // carries the second liquid (β-phase), NOT a vapour.  Its vapour
        // fraction is therefore 0, not 1 --- blending it as a vapour would add a
        // phantom latent heat to the β fraction (a large spurious duty for an
        // otherwise isothermal, equal-T liquid split).
        const scalar betaVf = (opts.phaseSet == PhaseSet::LL) ? 0.0 : 1.0;

        //  The vf the SINGLE-PHASE branch prices on.  Pinned: the declaration.
        //  Unpinned: what the feed's own equilibrium resolved to -- an
        //  all-vapour feed must not be priced as liquid merely because the
        //  struct's default said 0 (the same defect one branch further down).
        scalar vf_priced = vf_feed;
        if (!pinned && feedSol.converged)
            vf_priced = (feedSol.V_over_F >= 1.0 - 1.0e-9) ? 1.0
                      : (feedSol.V_over_F <= 1.0e-9)       ? 0.0
                                                           : feedSol.V_over_F;

        bool useForm = true;
        for (std::size_t i = 0; i < thermo.n(); ++i)
            if (!thermo.comp(i).hasGibbsData()) { useForm = false; break; }
        scalar H_in, H_out;
        if (useForm)
        {
            // ONE enthalpy surface everywhere: the duty is computed on the
            // SAME canonical elements-datum form (h_ig − ΔHvap_latent(T)) that
            // the energy-balance report reads (H_stream_formation), NOT the
            // Watson-at-298 + ∫cpLiq variant H_stream.  The two differ by the
            // liquid latent model, which surfaced as a phantom ~24 % gap
            // between this flash's reported Q and its own stream dH.  The
            // SPLIT (V_over_F) is unchanged -- an isothermal flash sets it from
            // the VLE, not from Q -- so this moves only the reported DUTY
            // (an energy KPI), never the material flows.  We still weight by the
            // equilibrium PHASE compositions (x α-phase, y β-phase) so a feed
            // already at the drum's conditions reads Q = 0, not a phantom latent.
            const scalar bV = sol.V_over_F;
            if (feedSplit)
            {
                const scalar bF = feedSol.V_over_F;
                H_in = (1.0 - bF) * thermo.H_stream_formation(T_feed, P_feed, 0.0, feedSol.x)
                     +        bF  * thermo.H_stream_formation(T_feed, P_feed, betaVf, feedSol.y);
            }
            else
                H_in = thermo.H_stream_formation(T_feed, P_feed, vf_priced, in.z);
            H_out = (1.0 - bV) * thermo.H_stream_formation(in.T, in.P, 0.0, sol.x)
                  +        bV  * thermo.H_stream_formation(in.T, in.P, betaVf, sol.y);
        }
        else if (opts.phaseSet == PhaseSet::LL)
        {
            // Both phases liquid: blend two liquid enthalpies (no latent heat).
            H_out = (1.0 - sol.V_over_F) * thermo.Hliquid(in.T, sol.x, T_feed)
                  +        sol.V_over_F  * thermo.Hliquid(in.T, sol.y, T_feed);
            H_in  = thermo.Hliquid(T_feed, in.z, T_feed);   // sensible datum @ T_feed
        }
        else
        {
            H_out = thermo.Hmixture(in.T, sol.V_over_F, sol.x, sol.y, T_feed);
            if (feedSplit)
                H_in = thermo.Hmixture(T_feed, feedSol.V_over_F,
                                       feedSol.x, feedSol.y, T_feed);
            else
                H_in = thermo.Hliquid(T_feed, in.z, T_feed);   // sensible datum @ T_feed
        }
        Q_W = in.F * 1000.0 * (H_out - H_in);                // kmol/s -> mol/s; J/mol -> W
        if (sol.dimerHeat_J_per_molFeed != 0.0)
        {
            //  Vapour dimerisation: the association enthalpy is EXACTLY
            //  priceable on top of the apparent (monomer-basis) vapour
            //  enthalpy -- included, announced.
            Q_W += in.F * 1000.0 * sol.dimerHeat_J_per_molFeed;
            if (opts.verbosity >= 2)
                std::cout << "  [duty] vapour dimer association heat"
                             " included: "
                          << in.F * sol.dimerHeat_J_per_molFeed
                          << " kW (h_dim = 2 h_mono + dH, exact)\n";
        }
        //  R-E3 (docs/design/tp-stream-energy-coherence.md): ONE solid rung
        //  everywhere.  H_out above priced sol.x with any crystallised
        //  share still inside as APPARENT dissolved/liquid material (the
        //  chemistry-route convention; the SLE branch keeps the same
        //  shape), while the balance report prices the same crystal on the
        //  solid formation rung (solidH_elements).  Re-price each
        //  crystallised mole from the liquid formation rung onto
        //  h_formation(T,"solid") -- the SAME leg the report reads -- so
        //  the unit duty and the report agree on solids by construction.
        //  A missing transition datum throws into the catch below: a NAMED
        //  gap, never a fake number.
        //  BOTH SIDES, or the rung itself becomes a phantom duty (R-E5,
        //  measured 2026-08-09).  H_out gains the crystal's rung correction;
        //  so must H_in when the FEED's own resolved state carries crystals --
        //  otherwise an unpinned feed already at the drum's conditions reads
        //  exactly the rung difference as its duty (flash19: 0.156 kW, the
        //  same number the report's closure gap used to be) and the R-E1
        //  identity misses zero by the width of slice 1.  The feed's solids
        //  come from the SAME re-flash that priced its phases; per mole the
        //  correction is identical, so at identical (T, P, z) the two sides
        //  cancel exactly and the identity operation costs nothing.
        const auto rungCorrection =
            [&](const sVector& solids, scalar T_at) -> scalar
        {
            scalar acc = 0.0;
            sVector e(thermo.n(), 0.0);
            for (std::size_t i = 0; i < solids.size() && i < thermo.n(); ++i)
            {
                const scalar s_i = solids[i];             // kmol/s, absolute
                if (s_i <= 0.0) continue;
                e.assign(thermo.n(), 0.0);
                e[i] = 1.0;
                acc += 1000.0 * s_i                       // kmol/s -> mol/s
                     * (thermo.comp(i).h_formation(T_at, "solid")
                        - thermo.H_liquid_formation(T_at, e));
            }
            return acc;
        };
        if (!sol.solidFlows.empty())
            Q_W += rungCorrection(sol.solidFlows, in.T);
        //  The feed's crystals are per mole of FEED inside feedSol (F = 1),
        //  so they scale by in.F to reach the same kmol/s basis as sol's.
        if (!feedSol.solidFlows.empty())
        {
            sVector fs = feedSol.solidFlows;
            for (auto& v : fs) v *= in.F;
            Q_W -= rungCorrection(fs, T_feed);
        }
        Q_valid = std::isfinite(Q_W);
        if (!Q_valid) Q_gap = "enthalpy evaluated non-finite";

        //  R-E2: A DECLARED CONSTRAINT MAY COST ENERGY, AND SAYS SO.  At
        //  unchanged (T, P) an UNPINNED feed now prices to Q = 0 by
        //  construction (it is its own equilibrium), so a duty surviving here
        //  is the price of the case's own pin -- a constrained or metastable
        //  inlet relaxing to equilibrium.  That is legitimate physics and
        //  legitimate teaching; what it may never be is invisible.
        if (Q_valid && pinned && std::fabs(Q_W) > 1.0
            && std::fabs(in.T - T_feed) < 1.0e-9
            && std::fabs(in.P - P_feed) < 1.0e-6
            && opts.verbosity >= 1)
            std::cout << "  [duty] the feed is PINNED (vf = " << vf_feed
                      << ") and the flash operates at the feed's own T and P,"
                         " so this duty is priced as declared: the "
                         "constrained inlet relaxing to equilibrium ("
                      << Q_W / 1000.0 << " kW).  An UNPINNED feed at these "
                         "conditions would read 0 -- the pin is the physics "
                         "here, not the operation.\n";
    }
    catch (const std::exception& e) { Q_valid = false; Q_gap = e.what(); }

    // ---- Produced streams ----------------------------------------------
    //   VL:    (liquid, vapor)                  — vf = 0, vf = 1
    //   LL:    (liquid_alpha, liquid_beta)      — both vf = 0
    //   VLLE:  (vapor, liquid_alpha, liquid_beta)
    //          when sol.threePhase == true; otherwise demoted to one
    //          of the two-phase forms above by the solver.
    produced_.clear();
    if (opts.phaseSet == PhaseSet::VLLE)
    {
        // VLLE always emits THREE streams (vapor, liquid_alpha,
        // liquid_beta) so that the flowsheet's output names list can
        // remain fixed even when the optimum collapses to a 2-phase
        // configuration --- the absent phase appears with F = 0.
        scalar bV, bA, bB;
        sVector yV, xA, xB;
        if (sol.threePhase)
        {
            bV = sol.betaVapor;
            bA = sol.V_over_F;
            bB = 1.0 - bV - bA;
            yV = sol.xVapor;
            xA = sol.x;
            xB = sol.y;
        }
        else
        {
            // 2-phase fallback from the VLLE branch.  Identify which
            // pair survived from sol.regime and populate the empty one.
            const bool vlFallback =
                sol.regime.find("VL") != std::string::npos;
            if (vlFallback)
            {
                // V+L: sol.x is the liquid, sol.y is the vapor
                bV = sol.V_over_F;
                bA = 1.0 - bV;
                bB = 0.0;
                yV = sol.y;
                xA = sol.x;
                xB.assign(thermo.n(), 0.0);
            }
            else
            {
                // LL: sol.x = α, sol.y = β, sol.V_over_F = β fraction
                bV = 0.0;
                bA = 1.0 - sol.V_over_F;
                bB = sol.V_over_F;
                yV.assign(thermo.n(), 0.0);
                xA = sol.x;
                xB = sol.y;
            }
        }

        ProcessStream vap;
        vap.name = "vapor";
        vap.F    = in.F * bV;
        vap.T    = in.T;
        vap.P    = in.P;
        vap.z    = yV;
        vap.vf   = 1.0;
        produced_.push_back(vap);

        ProcessStream alpha;
        alpha.name = "liquid_alpha";
        alpha.F    = in.F * bA;
        alpha.T    = in.T;
        alpha.P    = in.P;
        alpha.z    = xA;
        alpha.vf   = 0.0;
        produced_.push_back(alpha);

        ProcessStream beta;
        beta.name  = "liquid_beta";
        beta.F     = in.F * bB;
        beta.T     = in.T;
        beta.P     = in.P;
        beta.z     = xB;
        beta.vf    = 0.0;
        produced_.push_back(beta);
    }
    else
    {
        const bool isLL = (opts.phaseSet == PhaseSet::LL);

        ProcessStream alpha;
        alpha.name = isLL ? "liquid_alpha" : "liquid";
        alpha.F    = in.F * (1.0 - sol.V_over_F);
        alpha.T    = in.T;
        alpha.P    = in.P;
        alpha.z    = sol.x;
        alpha.vf   = 0.0;
        //  The speciation belongs to the LIQUID and to nothing else: ions do
        //  not enter a vapour, and a decomposition attached to a stream that
        //  cannot carry it would be a decoration.
        alpha.speciation = sol.speciation;
        //  ...and so do the liquid-liquid split and the precipitate: both
        //  describe THIS stream, neither adds another.
        alpha.organicLiquid = sol.organicLiquid;
        if (!sol.solidFlows.empty())
        {
            //  The crystal rides with the liquid it grew in, and it rides as
            //  a SOLID: alpha.F/z describe the fluid, alpha.s the crystals.
            //  The apparent total is unchanged -- the material only changes
            //  phase.
            alpha.s = sol.solidFlows;
            scalar liqTot = 0.0;
            for (std::size_t i = 0; i < alpha.z.size(); ++i)
            {
                const scalar fluid = alpha.F * alpha.z[i]
                                   - (i < alpha.s.size() ? alpha.s[i] : 0.0);
                alpha.z[i] = fluid; liqTot += fluid;
            }
            alpha.F = liqTot;
            if (liqTot > 0.0) for (auto& zi : alpha.z) zi /= liqTot;
        }
        produced_.push_back(alpha);

        ProcessStream beta;
        beta.name  = isLL ? "liquid_beta" : "vapor";
        beta.F     = in.F * sol.V_over_F;
        beta.T     = in.T;
        beta.P     = in.P;
        beta.z     = sol.y;
        beta.vf    = isLL ? 0.0 : 1.0;
        produced_.push_back(beta);
    }

    // ---- KPIs ----------------------------------------------------------
    kpis_.clear();
    const bool isLL = (opts.phaseSet == PhaseSet::LL);
    kpis_["T"]         = in.T;
    kpis_["P"]         = in.P;
    kpis_["F_in"]      = in.F;
    // LL vocabulary (Codex tutorial-audit P0.2): the second LIQUID is not a
    // vapour -- V_over_F is reserved for a real vapour fraction; an LL split
    // publishes betaFraction (= L_beta/F).  Same number, honest name.
    if (isLL) kpis_["betaFraction"] = sol.V_over_F;
    else      kpis_["V_over_F"]     = sol.V_over_F;
    if (Q_valid && !isLL)                 // duty: + heating, - cooling [W]
    {
        // LL: two Hliquid calls WITHOUT an excess-enthalpy route coherent
        // with the activity model make Q=0 a non-conclusion -- the duty is
        // UNAVAILABLE for an LL split until that route exists (announced),
        // never a fake zero.
        kpis_["Q"]    = Q_W;
        kpis_["Q_kW"] = Q_W / 1000.0;
    }
    else if (isLL && opts.verbosity >= 2)
        std::cout << "  [duty] LL split: duty UNAVAILABLE -- the liquid"
                     " enthalpy carries no excess-of-mixing term coherent"
                     " with the activity model, so a numeric Q would be a"
                     " non-conclusion (not published).\n";
    else if (!Q_valid && opts.verbosity >= 1)
        // The caloric contract: a missing enthalpy route is a NAMED gap,
        // never a silent absence (and never a fake Q = 0).
        std::cout << "  [duty] duty UNAVAILABLE -- " << Q_gap
                  << " (Q not published).\n";
    kpis_["F_alpha"]   = in.F * (1.0 - sol.V_over_F);
    kpis_["F_beta"]    = in.F * sol.V_over_F;
    if (sol.threePhase)
    {
        kpis_["beta_vapor"] = sol.betaVapor;
        kpis_["F_vapor"]    = in.F * sol.betaVapor;
    }
    kpis_["phaseSet"]  =
          (opts.phaseSet == PhaseSet::VLLE) ? 2.0
      : (opts.phaseSet == PhaseSet::LL  ) ? 1.0
                                          : 0.0;  // 0 VL / 1 LL / 2 VLLE
    for (const auto& [k, v] : sol.extraKpis)
        kpis_[k] = v;

    return sol.converged ? 0 : 1;
}

void printFlashResult(const FlashSolution& sol,
                      const ThermoPackage& thermo,
                      const FlashInput&    in)
{
    std::cout << "\n=========================  Flash Result  ==========================\n";
    std::cout << "  Regime:        " << sol.regime  << "\n";
    std::cout << "  Converged:     " << (sol.converged ? "yes" : "NO")  << "\n";
    std::cout << "  Iterations:    " << sol.iterations
              << "   (CUMULATIVE Rachford-Rice Newton steps across ALL composition-outer passes; only the [outer 0] table prints at verbosity 3)\n";
    std::cout << "  Final |g(V)|:  " << std::scientific << std::setprecision(3)
              << sol.residual << "\n";
    // LL split: the beta phase is a LIQUID -- never print it as "Vapor"
    // (Codex P0.2: V/F is reserved for a real vapour fraction).
    const bool llSplit = sol.regime.find("liquid (LL") != std::string::npos
                      || sol.regime.find("two-phase liquid") != std::string::npos;
    if (llSplit)
    {
        std::cout << "  beta (Lb/F):   " << std::fixed << std::setprecision(6)
                  << sol.V_over_F << "\n";
        std::cout << "  alpha (La/F):  " << (1.0 - sol.V_over_F) << "\n";
        std::cout << "  L_beta flow:   " << (in.F * sol.V_over_F * 3600.0)
                  << " kmol/h\n";
        std::cout << "  L_alpha flow:  " << (in.F * (1.0 - sol.V_over_F) * 3600.0)
                  << " kmol/h\n";
    }
    else
    {
        std::cout << "  V/F:           " << std::fixed << std::setprecision(6)
                  << sol.V_over_F << "\n";
        std::cout << "  L/F:           " << (1.0 - sol.V_over_F) << "\n";
        std::cout << "  Vapor flow V:  " << (in.F * sol.V_over_F * 3600.0) << " kmol/h\n";
        std::cout << "  Liquid flow L: " << (in.F * (1.0 - sol.V_over_F) * 3600.0)
                  << " kmol/h\n";
    }

    std::cout << "\n  Component         z          x          y          K\n";
    std::cout <<   "  -----------------------------------------------------------\n";
    for (std::size_t i = 0; i < in.z.size(); ++i)
    {
        std::cout << "  " << std::left << std::setw(14)
                  << thermo.comp(i).name()
                  << std::right << std::fixed
                  << "  " << std::setprecision(6) << std::setw(8) << in.z[i]
                  << "  " << std::setprecision(6) << std::setw(8) << sol.x[i]
                  << "  " << std::setprecision(6) << std::setw(8) << sol.y[i]
                  << "  " << std::setprecision(4) << std::setw(8) << sol.K[i]
                  << "\n";
    }
    std::cout << "====================================================================\n\n";
}

} // namespace Choupo
