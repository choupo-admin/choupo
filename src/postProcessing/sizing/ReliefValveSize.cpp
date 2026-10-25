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

#include "ReliefValveSize.H"

#include "DesignDefaults.H"
#include "PhaseDensity.H"
#include "ReliefArithmetic.H"
#include "core/Constants.H"
#include "core/RegistryRefusal.H"
#include "streams/StreamMass.H"
#include "thermo/ThermoPackage.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "solver/NewtonRaphson.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <cctype>
#include <iostream>
#include <cmath>
#include <cstdio>
#include <iomanip>
#include <memory>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

//  The scenario words this sizer evaluates, and the ones it NAMES and refuses
//  because a credible design would need what no case declares or no source
//  this project has read.  A word outside both is refused as unknown.
const std::vector<std::string> implemented = { "blockedOutlet", "fire" };

std::string notImplementedReason(const std::string& w)
{
    if (w == "tubeRupture")
        return "the API 521 rule for when a tube rupture needs no relief (the"
               " 2/3 rule and its 10/13 successor) was not read from the"
               " standard and is unverified (DEV.md 4c C61)";
    if (w == "controlValveFailure" || w == "gasBlowby")
        return "the relieving rate is the capacity of the failed valve, which"
               " needs its flow coefficient -- no case declares one";
    if (w == "coolingFailure" || w == "refluxFailure")
        return "the relieving rate follows from the heat balance of the unit"
               " with the cooling lost, which this sizer does not re-solve";
    if (w == "runawayReaction")
        return "a runaway vents two-phase; the omega method and the DIERS"
               " methods are named in the EduTool and not built";
    if (w == "thermalExpansion")
        return "the rate needs the heat input to a blocked-in liquid, which no"
               " case declares";
    return {};
}

std::string fmt(scalar v, int sig = 6)
{
    std::ostringstream o;
    o << std::defaultfloat << std::setprecision(sig) << v;
    return o.str();
}

//  A stream name as a `values` key fragment: the golden `equipment` kind
//  reads keys of [A-Za-z0-9_] only, and a sectored stream is `SECTOR.Name`.
std::string keyFragment(const std::string& s)
{
    std::string k = s;
    for (auto& c : k)
        if (!(std::isalnum(static_cast<unsigned char>(c)) || c == '_')) c = '_';
    return k;
}

//  The fluid properties of the vapour that passes the device, from the
//  case's package -- the same two calls `propertyPoint` makes.
struct Vapour { scalar Z = 0.0, k = 0.0, M = 0.0; };

Vapour vapourAt(const ThermoPackage& tp, scalar T, scalar P, const sVector& y,
                const std::string& who)
{
    Vapour v;
    v.M = MWmix(y, tp);
    v.Z = tp.eos().Z(T, P, y);
    const scalar Cp = tp.Cp_ig(T, y);
    if (!(Cp > constant::R))
        throw std::runtime_error(who + ": the package's ideal-gas heat capacity"
            " at the relieving state (" + fmt(Cp) + " J/mol/K) does not give a"
            " heat-capacity ratio k = Cp/(Cp - R) -- a relief gas needs one.");
    v.k = Cp / (Cp - constant::R);
    if (!(v.Z > 0.0) || !std::isfinite(v.Z) || !(v.M > 0.0))
        throw std::runtime_error(who + ": the package gives no usable vapour"
            " Z or molar mass at the relieving state (Z = " + fmt(v.Z)
            + ", M = " + fmt(v.M) + ").");
    return v;
}

} // anonymous namespace

std::vector<EquipmentSizing> ReliefValveSize::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    const std::string who = "ReliefValve: unit '" + unitName + "'";

    //  ---- EVERY HARD REQUIREMENT FIRST (the VesselSize rule) --------------
    if (!result.thermoForPost)
        throw std::runtime_error(who + ": this run carries no thermophysical"
            " package for its post-processing passes (only choupoSolve attaches"
            " one), and a relief fluid's Z, k and boiling point come from it.");
    const std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
    if (!pkg)
        throw std::runtime_error(who + ": the case's package could not be"
            " built for post-processing.");
    const ThermoPackage& tp = *pkg;

    //  ---- THE PROTECTED ITEM: already sized, by its own entry ------------
    std::vector<const EquipmentSizing*> candidates;
    for (const auto& [id, sz] : result.sizings)
        if (sz.unitName == unitName && !sz.relief.present())
            candidates.push_back(&sz);
    if (candidates.empty())
        throw std::runtime_error(who + ": no item of this unit has been sized"
            " before this entry, so there is nothing whose design pressure the"
            " valve can be set at.  Declare this `reliefValve` entry AFTER the"
            " unit's own sizing entry in `sizing { units ( ... ); }` -- the set"
            " pressure is READ from that item, never typed here.");
    const EquipmentSizing* item = nullptr;
    if (designRules->found("protects"))
    {
        const std::string tag = designRules->lookupWord("protects");
        std::vector<std::string> tags;
        for (const auto* c : candidates)
        {
            tags.push_back(c->equipmentTag.empty() ? std::string("(untagged)")
                                                   : c->equipmentTag);
            if (c->equipmentTag == tag) item = c;
        }
        if (!item)
            throw std::runtime_error(who + ": " + registryRefusal::message(
                "protected item", tag, tags, "Sized items of this unit"));
    }
    else if (candidates.size() == 1)
        item = candidates.front();
    else
    {
        std::string tags;
        for (const auto* c : candidates)
            tags += " " + (c->equipmentTag.empty() ? std::string("(untagged)")
                                                    : c->equipmentTag);
        throw std::runtime_error(who + ": this unit realises "
            + std::to_string(candidates.size()) + " sized items (" + tags
            + " ) -- name the one the valve protects with `protects <tag>;`.");
    }
    auto pd = item->values.find("pressureDesign");
    if (pd == item->values.end())
        throw std::runtime_error(who + ": the protected item '" + item->itemId()
            + "' publishes no `pressureDesign`, so there is no design pressure"
              " to set the valve at.  Only a pressure-holding item sized as such"
              " (a vessel, a catalyst-bed shell, a compressor casing) can be"
              " protected.");
    if (item->unitOf("pressureDesign") != "bar")
        throw std::runtime_error(who + ": the protected item's `pressureDesign`"
            " declares unit '" + item->unitOf("pressureDesign") + "', not bar --"
            " this sizer reads it as bar GAUGE, as `VesselMechanics` does.");
    const scalar Pset_g = pd->second * 1.0e5;                 // Pa gauge
    if (!(Pset_g > 0.0))
        throw std::runtime_error(who + ": the protected item's design pressure"
            " is not positive (" + fmt(pd->second) + " bar g).");

    if (!designRules->found("scenarios"))
        throw std::runtime_error(who + ": no `scenarios ( ... );` declared.  The"
            " credible causes of overpressure are the designer's judgement and"
            " no converged state can decide them: declare at least one, e.g."
            " `scenarios ( { scenario blockedOutlet; } );`.");
    const std::vector<DictPtr> scen = designRules->lookupDictList("scenarios");
    if (scen.empty())
        throw std::runtime_error(who + ": `scenarios` is empty.");

    const FlatUnit* fu0 = nullptr;
    for (const auto& u : result.topology) if (u.name == unitName) fu0 = &u;
    //  A SECTOR'S OWN ITEM (C69: one converter shell around a sector's beds
    //  and exchangers) is protected at the SECTOR's outlets: the streams its
    //  units produce and none of its units consumes, read from the topology.
    FlatUnit sectorAsUnit;
    if (!fu0)
    {
        std::set<std::string> consumed;
        std::vector<std::string> produced;
        for (const auto& u : result.topology)
            if (u.sector == unitName || u.sector.rfind(unitName + ".", 0) == 0)
            {
                for (const auto& s : u.ins)  consumed.insert(s);
                for (const auto& s : u.outs) produced.push_back(s);
            }
        for (const auto& s : produced)
            if (!consumed.count(s)) sectorAsUnit.outs.push_back(s);
        if (produced.empty())
            throw std::runtime_error(who + ": neither a unit nor a sector of the"
                " solved topology, so its outlets are unknown.");
        sectorAsUnit.name = unitName;
        fu0 = &sectorAsUnit;
    }
    const FlatUnit* fu = fu0;

    EquipmentSizing d;
    d.unitName      = unitName;
    d.equipmentTag  = "psv";
    d.equipmentType = "reliefValve";
    d.material      = material.name;
    d.relief.protects = item->itemId();
    d.notCostedBecause = "a pressure-relief valve: this engine carries no cost"
        " correlation for a relief device and none is invented, so the capital"
        " total does not include it";
    if (result.sizings.count(d.itemId()))
        throw std::runtime_error(who + ": item '" + d.itemId() + "' is already"
            " sized -- one relief entry per protected unit.");

    //  ---- the coefficients, read only where a scenario needs them --------
    const scalar Pback_g = designDefault::valueOr(designRules,
        designDefault::reliefBackPressure, "reliefValve", unitName, d);   // Pa g
    const scalar P2 = Pback_g + reliefMath::pAtmPa;                       // Pa abs
    const scalar Kc = designDefault::valueOr(designRules,
        designDefault::reliefKc, "reliefValve", unitName, d);

    d.set("P_set_gauge",  Pset_g * 1.0e-5,  "bar");
    d.set("P_back_gauge", Pback_g * 1.0e-5, "bar");

    std::set<std::string> prefixes;
    scalar Agov = -1.0;

    //  The gas equation at a state; publishes Z, k, M and the area.
    auto sizeGas = [&](const std::string& p, ReliefScenario& rs, scalar W_kg_h,
                       scalar T, scalar P1, const sVector& y) -> scalar
    {
        const scalar Kd = designDefault::valueOr(designRules,
            designDefault::reliefKdVapour, "reliefValve", unitName, d);
        const scalar Kb = designDefault::valueOr(designRules,
            designDefault::reliefKb, "reliefValve", unitName, d);
        const Vapour v = vapourAt(tp, T, P1, y, who + " scenario " + rs.scenario);
        const auto g = reliefMath::gasArea(W_kg_h, T, v.Z, v.M, v.k,
                                           P1 * 1.0e-3, P2 * 1.0e-3, Kd, Kb, Kc);
        rs.phase  = "vapour";
        rs.regime = g.critical ? "critical" : "subcritical";
        d.set(p + "_Z", v.Z, "-");
        d.set(p + "_k", v.k, "-");
        d.set(p + "_M", v.M, "kg/kmol");
        d.set(p + "_A", g.A_mm2, "mm2");
        std::cout << "  [relief] reliefValve '" << unitName << "' " << p << ": "
                  << fmt(W_kg_h) << " kg/h of vapour at P1 = " << fmt(P1 * 1e-5)
                  << " bar abs, T = " << fmt(T) << " K, Z = " << fmt(v.Z)
                  << ", k = " << fmt(v.k) << ", M = " << fmt(v.M) << " kg/kmol; "
                  << rs.regime << " flow (P2/P1 = " << fmt(g.r) << ", critical "
                  << fmt(g.rc) << ") -> A = " << fmt(g.A_mm2) << " mm2\n";
        return g.A_mm2;
    };

    for (const auto& sd : scen)
    {
        if (!sd->found("scenario"))
            throw std::runtime_error(who + ": a `scenarios` entry has no"
                " `scenario <word>;`.");
        const std::string w = sd->lookupWord("scenario");
        if (w != "blockedOutlet" && w != "fire")
        {
            std::string msg = registryRefusal::message("relief scenario", w,
                                                       implemented, "Accepted");
            const std::string why = notImplementedReason(w);
            if (!why.empty())
                msg += "\n  '" + w + "' is a credible scenario this sizer NAMES"
                       " and does not compute: " + why + ".";
            throw std::runtime_error(who + ": " + msg);
        }

        ReliefScenario rs;
        rs.scenario = w;
        scalar A = 0.0;

        if (w == "blockedOutlet")
        {
            //  WHICH OUTLET BLOCKS.  A unit with one outlet has no other
            //  answer; a unit with several must say, because which one the
            //  designer judges can close (the vapour line, the level-
            //  controlled liquid line) is a judgement and decides the fluid.
            std::string outlet;
            if (sd->found("outlet"))
            {
                outlet = sd->lookupWord("outlet");
                bool ok = false;
                for (const auto& o : fu->outs) if (o == outlet) ok = true;
                if (!ok)
                    throw std::runtime_error(who + ": " + registryRefusal::message(
                        "blocked outlet", outlet, fu->outs, "Outlets of this unit"));
            }
            else if (fu->outs.size() == 1)
                outlet = fu->outs.front();
            else
            {
                std::string os;
                for (const auto& o : fu->outs) os += " " + o;
                throw std::runtime_error(who + ": scenario blockedOutlet on a"
                    " unit with " + std::to_string(fu->outs.size())
                    + " outlets (" + os + " ) -- name the one that closes with"
                      " `outlet <stream>;`.  Which line can block is the"
                      " designer's judgement, and it decides what the valve"
                      " passes.");
            }
            auto sit = result.streams.find(outlet);
            if (sit == result.streams.end())
                throw std::runtime_error(who + ": outlet '" + outlet + "' is not"
                    " in the solved flowsheet.");
            const ProcessStream& s = sit->second;
            for (scalar sv : s.s)
                if (sv > 0.0)
                    throw std::runtime_error(who + ": blocked outlet '" + outlet
                        + "' carries solids -- no relief equation here passes a"
                          " slurry.");
            rs.stream = outlet;
            const std::string p = "blocked_" + keyFragment(outlet);
            rs.prefix = p;
            if (!prefixes.insert(p).second)
                throw std::runtime_error(who + ": scenario '" + p + "' is"
                    " declared twice.");

            const scalar W_kg_h = F_massTotal(s, tp) * 3600.0;
            const scalar P1 = reliefMath::relievingPressureAbs(Pset_g, false);
            const scalar T  = s.T;
            d.set(p + "_W",      W_kg_h,     "kg/h");
            d.set(p + "_P1_abs", P1 * 1e-5,  "bar");
            d.set(p + "_T1",     T,          "K");

            if (s.vf >= 1.0 - 1.0e-9)
                A = sizeGas(p, rs, W_kg_h, T, P1, s.z);
            else if (s.vf <= 1.0e-9)
            {
                const scalar Kd = designDefault::valueOr(designRules,
                    designDefault::reliefKdLiquid, "reliefValve", unitName, d);
                const scalar Kw = designDefault::valueOr(designRules,
                    designDefault::reliefKw, "reliefValve", unitName, d);
                const scalar Kv = designDefault::valueOr(designRules,
                    designDefault::reliefKv, "reliefValve", unitName, d);
                //  The density the case's package prices at the stream's own
                //  state -- one home (`phaseDensity`), the storage tank's.
                const auto rd = phaseDensity::of(result, outlet,
                    "reliefValve '" + unitName + "'");
                const scalar Q_L_min = W_kg_h / rd.rho * 1000.0 / 60.0;
                const scalar G = rd.rho / reliefMath::waterRefDensity;
                A = reliefMath::liquidArea(Q_L_min, G, (P1 - P2) * 1.0e-3,
                                           Kd, Kw, Kc, Kv);
                rs.phase  = "liquid";
                rs.regime = "liquid";
                d.set(p + "_rho", rd.rho,  "kg/m3");
                d.set(p + "_Q",   Q_L_min, "L/min");
                d.set(p + "_A",   A,       "mm2");
                std::cout << "  [relief] reliefValve '" << unitName << "' " << p
                          << ": " << fmt(W_kg_h) << " kg/h of liquid, rho "
                          << fmt(rd.rho) << " kg/m3 (Q = " << fmt(Q_L_min)
                          << " L/min), P1 - P2 = " << fmt((P1 - P2) * 1e-5)
                          << " bar -> A = " << fmt(A) << " mm2\n";
            }
            else
                throw std::runtime_error(who + ": blocked outlet '" + outlet
                    + "' is carried TWO-PHASE (vapour fraction " + fmt(s.vf)
                    + ").  No two-phase relief method is implemented (the"
                      " omega method is named in the overpressure EduTool and"
                      " not built); name an outlet that carries one phase.");
        }
        else    //  fire
        {
            const std::string p = "fire";
            rs.prefix = p;
            if (!prefixes.insert(p).second)
                throw std::runtime_error(who + ": scenario 'fire' is declared"
                    " twice.");
            //  THE WETTED SURFACE, from the protected item's own geometry and
            //  its own declared inventory -- never a second declaration of
            //  how full the vessel is.
            auto dit = item->values.find("D");
            auto hit = item->values.find("H");
            if (dit == item->values.end() || hit == item->values.end()
                || item->unitOf("D") != "m" || item->unitOf("H") != "m")
                throw std::runtime_error(who + ": scenario fire needs the"
                    " protected item's diameter D and height H in m, and '"
                    + item->itemId() + "' publishes no such pair -- the fire"
                      " case is the wetted-VESSEL case.");
            std::vector<const HeldPhase*> liq;
            for (const auto& h : item->inventory.phases)
                if (h.phase == "liquid") liq.push_back(&h);
            if (liq.size() != 1)
                throw std::runtime_error(who + ": scenario fire reads the"
                    " liquid level and the boiling liquid from the protected"
                    " item's declared `inventory { held ( ... ); }`, and '"
                    + item->itemId() + "' declares "
                    + std::to_string(liq.size()) + " liquid phase(s) there."
                      "  Declare exactly one held liquid on its sizing entry"
                      " (its `fraction` is the level, its `stream` the liquid).");
            const HeldPhase& hl = *liq.front();
            for (const char* key : { "environmentFactor", "drainage" })
                if (!sd->found(key))
                    throw std::runtime_error(who + ": scenario fire declares no"
                        " `" + std::string(key) + "`.  Both are facts about the"
                        " site, not defaults: `environmentFactor 1.0;` is a"
                        " bare vessel (insulation that survives a fire lowers"
                        " it) and `drainage adequate;` means prompt"
                        " fire-fighting and drainage carry burning liquid away"
                        " (`inadequate` otherwise).");
            const scalar F = sd->lookupScalar("environmentFactor");
            if (!(F > 0.0) || F > 1.0)
                throw std::runtime_error(who + ": environmentFactor "
                    + fmt(F) + " is outside (0, 1].");
            const std::string dr = sd->lookupWord("drainage");
            if (dr != "adequate" && dr != "inadequate")
                throw std::runtime_error(who + ": " + registryRefusal::message(
                    "fire drainage", dr, { "adequate", "inadequate" }, "Accepted"));

            const scalar D = dit->second, H = hit->second;
            const scalar level = hl.fraction;
            const scalar Awet = constant::pi * D * (level * H)
                              + constant::pi * D * D / 4.0;
            const scalar Q = reliefMath::fireHeatInput(Awet, F, dr == "adequate");
            const scalar P1 = reliefMath::relievingPressureAbs(Pset_g, true);

            auto sit = result.streams.find(hl.stream);
            if (sit == result.streams.end())
                throw std::runtime_error(who + ": the held liquid's stream '"
                    + hl.stream + "' is not in the solved flowsheet.");
            const sVector& x = sit->second.z;
            rs.stream = hl.stream;

            //  The main component of the liquid, and whether a latent heat
            //  exists for it at P1 at all.
            std::size_t j = 0;
            for (std::size_t i = 1; i < x.size(); ++i) if (x[i] > x[j]) j = i;
            const Component& cj = tp.comp(j);
            if (cj.Pc() > 0.0 && P1 >= cj.Pc() * 1.0e5)
                throw std::runtime_error(who + ": scenario fire: the relieving"
                    " pressure " + fmt(P1 * 1e-5) + " bar abs is at or above the"
                    " critical pressure of the liquid's main component '"
                    + cj.name() + "' (" + fmt(cj.Pc()) + " bar).  The liquid"
                      " does not BOIL there, so there is no latent heat to"
                      " divide the fire's heat by; a supercritical fire case is"
                      " a transient calculation this sizer does not do.");
            //  THE SEED OF THE BUBBLE-POINT SEARCH IS A SOLVER AID, AND IS SAID.
            //  `BubblePoint::compute` evaluates the vapour fugacity at y = x,
            //  and below the liquid's own boiling range the EoS then returns a
            //  LIQUID-like root for that "vapour": measured on LetdownHP's
            //  ammonia at 27.6 bar, sum K x falls through 1 a second, spurious
            //  time near 250 K and the default seed (the mole-weighted normal
            //  boiling point, 240 K) never reaches the real root at ~328 K.  So
            //  the search starts from the saturation temperature of the
            //  liquid's main component at P1 -- the pure-solvent answer, which
            //  dissolved gases move DOWN by a few kelvin -- found on the same
            //  package's own vapour-pressure curve.
            scalar Tseed = 0.0;
            if (tp.hasSaturationCurve(j))
            {
                solver::NROptions so;
                so.tolerance = 1.0e-10;  so.maxIter = 100;
                so.lower = 100.0;
                so.upper = (cj.Tc() > 0.0) ? cj.Tc() : 1000.0;
                so.bracket = true;  so.monotoneIncreasing = true;  so.maxStep = 25.0;
                auto g  = [&](scalar T) { return std::log(tp.Psat(j, T) / P1); };
                auto dg = [&](scalar T) { return (g(T + 1.0e-3) - g(T - 1.0e-3)) / 2.0e-3; };
                const scalar T0 = (cj.Tb() > 0.0) ? cj.Tb() : 300.0;
                const auto rs0 = solver::newton1D(g, dg, T0, so);
                if (rs0.converged) Tseed = rs0.x;
            }
            const auto bp = BubblePoint::compute(tp, x, P1, Tseed);
            if (!bp.converged || bp.y.size() != x.size())
                throw std::runtime_error(who + ": scenario fire: the bubble point"
                    " of '" + hl.stream + "' at the relieving pressure "
                    + fmt(P1 * 1e-5) + " bar abs did not converge on the case's"
                      " package.");
            const scalar Tb = bp.T;
            if (cj.Tc() > 0.0 && Tb >= cj.Tc())
                throw std::runtime_error(who + ": scenario fire: the liquid's"
                    " bubble point at the relieving pressure (" + fmt(Tb)
                    + " K) is at or above the critical temperature of its main"
                      " component '" + cj.name() + "' (" + fmt(cj.Tc())
                    + " K): no latent heat exists there.");
            //  The molar latent heat of the incipient vapour.  A component
            //  above its own Tc (a dissolved permanent gas) carries none --
            //  the package's own liquid rung prices it at its gas enthalpy.
            scalar lambda = 0.0;                                  // J/mol
            for (std::size_t i = 0; i < x.size(); ++i)
            {
                if (!(bp.y[i] > 0.0)) continue;
                const Component& ci = tp.comp(i);
                if (ci.Tc() > 0.0 && Tb >= ci.Tc()) continue;
                lambda += bp.y[i] * ci.Hvap_latent(Tb);
            }
            if (!(lambda > 0.0))
                throw std::runtime_error(who + ": scenario fire: the incipient"
                    " vapour of '" + hl.stream + "' carries no latent heat at "
                    + fmt(Tb) + " K -- nothing in it boils.");
            const scalar M_v = MWmix(bp.y, tp);       // kg/kmol
            const scalar n_mol_s = Q / lambda;
            const scalar W_kg_h = n_mol_s * 1.0e-3 * M_v * 3600.0;

            //  THE ARITHMETIC, PRINTED, so a reader can redo the load.
            std::cout << "  [relief] reliefValve '" << unitName << "' fire: Q = "
                      << fmt(reliefMath::fireCoefficientSI(dr == "adequate") * 1e-3)
                      << " x " << fmt(F) << " x " << fmt(Awet) << "^0.82 = "
                      << fmt(Q * 1e-3) << " kW (A_wet = pi D (level H) + pi D^2/4,"
                         " D " << fmt(D) << " m, H " << fmt(H) << " m, level "
                      << fmt(level) << " from the declared inventory); '"
                      << hl.stream << "' boils at " << fmt(Tb) << " K at P1 = "
                      << fmt(P1 * 1e-5) << " bar abs (bubble point on the case's"
                         " package, searched from "
                      << (Tseed > 0.0 ? "the saturation T of " + cj.name()
                                        + " at P1, " + fmt(Tseed) + " K"
                                      : std::string("the default seed"))
                      << "); latent heat of the incipient vapour "
                      << fmt(lambda) << " kJ/kmol -> W = " << fmt(W_kg_h)
                      << " kg/h\n";

            d.set("fire_Awet",   Awet,       "m2");
            d.set("fire_level",  level,      "-");
            d.set("fire_F",      F,          "-");
            d.set("fire_Q",      Q * 1e-3,   "kW");
            d.set("fire_lambda", lambda,     "kJ/kmol");   // = J/mol
            d.set("fire_W",      W_kg_h,     "kg/h");
            d.set("fire_P1_abs", P1 * 1e-5,  "bar");
            d.set("fire_T1",     Tb,         "K");
            A = sizeGas(p, rs, W_kg_h, Tb, P1, bp.y);
        }

        d.relief.scenarios.push_back(rs);
        if (A > Agov) { Agov = A; d.relief.governing = rs.prefix; }
    }

    d.set("A_relief", Agov, "mm2");
    d.basis = "ONE relief valve set at the protected item's design pressure"
              " (read from " + item->itemId() + ", gauge), its MAWP ASSUMED equal to it; each"
              " declared scenario sized by API 520 Part I at its relieving pressure"
              " (set + 10 % or 3 psi; fire + 21 %), the governing one the"
              " largest area (" + d.relief.governing + "); the lettered"
              " orifice is NOT selected -- the letter areas are in API 526, a"
              " no-grant source, not reproduced here; Z the package's EoS vapour root and k = Cp_ig/(Cp_ig - R) at"
              " each relieving state; NOT COSTED";
    return { d };
}

} // namespace Choupo
