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

#include "RatedMachineSize.H"

#include "TrainSplit.H"
#include "propertyOps/CompactionLaws.H"   // the bench's own curves, inverted (C270)
#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "core/RegistryRefusal.H"
#include "result/ResultEmitter.H"   // overallMassFlow: the one home

#include <algorithm>
#include <cmath>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

const scalar kAnnounceDefault = 0.85;   // the stated threshold, printed when used
constexpr scalar kPi = 3.14159265358979323846;

//  An OPTIONAL sub-dictionary of the designRules: absent -> nullptr; present
//  and not a dictionary -> refused by name.
DictPtr optionalBlock(const DictPtr& d, const std::string& key, const std::string& who)
{
    if (!d->found(key)) return nullptr;
    if (!std::holds_alternative<DictPtr>(d->entryValue(key)))
        throw std::runtime_error(who + ": `" + key + "` must be a block `" + key
            + " { ...; source \"...\"; reason \"...\"; }`.");
    return d->subDict(key);
}

//  A declared value of an optional block: required once the block is there.
scalar needIn(const DictPtr& b, const std::string& block, const std::string& key,
              const Dimensions& dims, const std::string& who, const std::string& hint)
{
    if (!b->found(key))
        throw std::runtime_error(who + ": `" + block + " { " + key + " ...; }` is"
            " not declared (" + hint + ").  The block is optional; once it is"
            " declared every one of its inputs is the case's own fact, and no"
            " default is taken.");
    return b->lookupScalar(key, dims);
}

scalar needInPlain(const DictPtr& b, const std::string& block, const std::string& key,
                   const std::string& who, const std::string& hint)
{
    if (!b->found(key))
        throw std::runtime_error(who + ": `" + block + " { " + key + " ...; }` is"
            " not declared (" + hint + ").  The block is optional; once it is"
            " declared every one of its inputs is the case's own fact, and no"
            " default is taken.");
    return b->lookupScalar(key);
}

//  in-die | out-of-die: the two densities a compaction curve can be fitted on.
std::string needBasis(const DictPtr& b, const std::string& block, const std::string& who)
{
    if (!b->found("basis"))
        throw std::runtime_error(who + ": `compaction { " + block + " { basis"
            " inDie|outOfDie; } }` is not declared -- whether the porosity the"
            " curve was fitted on was measured in the die under load or on the"
            " ejected tablet.");
    const std::string w = b->lookupWord("basis");
    if (w != "inDie" && w != "outOfDie")
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "compaction." + block + ".basis", w, { "inDie", "outOfDie" }, "Accepted"));
    return w;
}

std::string fmt(scalar v)
{
    std::ostringstream o;
    o.precision(6);
    o << v;
    return o.str();
}

//  A key the case owes, with its unit checked.
scalar need(const DictPtr& d, const std::string& key, const Dimensions& dims,
            const std::string& who, const std::string& hint)
{
    if (!d->found(key))
        throw std::runtime_error(who + ": `" + key + "` is not declared in"
            " `rating { }` (" + hint + ").  A vendor rating is the case's own"
            " fact and no default is taken.");
    return d->lookupScalar(key, dims);
}

scalar needPlain(const DictPtr& d, const std::string& key,
                 const std::string& who, const std::string& hint)
{
    if (!d->found(key))
        throw std::runtime_error(who + ": `" + key + "` is not declared in"
            " `rating { }` (" + hint + ").  A vendor rating is the case's own"
            " fact and no default is taken.");
    return d->lookupScalar(key);
}

void needText(const DictPtr& d, const std::string& block, const std::string& who)
{
    for (const char* k : { "source", "reason" })
        if (!d->found(k) || d->lookupWord(k).empty())
            throw std::runtime_error(who + ": `" + block + " { " + k
                + " \"...\"; }` is not declared -- a number the case chose"
                  " carries where it came from and why it is this plant's.");
}

//  ---- kind volumeRate (C199): a pump rated by the flow it can carry -------
//
//  A seawater plant does not put its whole flow through one pump: the
//  maker's catalogue ends at a largest machine, so the flow is shared by N
//  pumps in parallel per train and the trains by the plant.  Nothing is
//  scheduled by a batch plan here, so this kind reads NO plan: the load is
//  the pump's own published flow, `F` (kmol/s) times `v_molar_liq`
//  (m3/mol), and the rating is the CASE's declared largest pump.
//
//      pumpsNeeded   = ceil( Q_train / maxFlowPerUnit )
//      utilisation   = Q_train / (pumpsInstalled maxFlowPerUnit)
//
//  `installed { count; source; reason; }` is the pumps IN PARALLEL PER TRAIN
//  the case builds (default 1); fewer than needed REFUSES, naming the count.
//  `spare { count; source; reason; }` is the PLANT's stand-by pumps (the
//  practice read for C199: Ebara supplied Carlsbad with 4 axially split
//  multistage pumps, 3 running and 1 spare); absent, none.
std::vector<EquipmentSizing> sizeVolumeRate(const std::string& unitName,
    const SimulationResult& result, const Material& material,
    const DictPtr& designRules, const std::string& who,
    const std::string& typeName)
{
    const int N = trainSplit::trainsOf(result, designRules, who);
    const int nTr = std::max(1, N);

    auto kit = result.kpis.find(unitName);
    if (kit == result.kpis.end())
        throw std::runtime_error(who + ": the unit has no KPIs in the result.");
    auto kp = [&](const char* key) -> scalar
    {
        auto it = kit->second.find(key);
        if (it == kit->second.end())
            throw std::runtime_error(who + ": kind volumeRate reads the pump's"
                " own published `" + key + "` and the unit publishes none (is"
                " it a liquid `pump`?).");
        return it->second;
    };
    const scalar Qplant = kp("F") * 1000.0 * kp("v_molar_liq") * 3600.0;   // m3/h
    const scalar Wplant = kp("W_shaft_kW");
    const scalar head   = kp("head_m");
    const scalar Pout   = kp("P_out") / 1.0e5;                              // bar
    const scalar Qtrain = Qplant / nTr;

    const DictPtr rating = designRules->found("rating")
        && std::holds_alternative<DictPtr>(designRules->entryValue("rating"))
        ? designRules->subDict("rating") : nullptr;
    if (!rating)
        throw std::runtime_error(who + ": `rating { maxFlowPerUnit <Q>; origin"
            " literature|assumed; source \"...\"; reason \"...\"; }` is not"
            " declared -- the largest pump the maker builds, and where that"
            " number came from.  No catalogue is carried and no default is"
            " taken.");
    needText(rating, "rating", who);
    if (!rating->found("origin"))
        throw std::runtime_error(who + ": `rating { origin ...; }` is not"
            " declared (literature | assumed).");
    const std::string origin = rating->lookupWord("origin");
    if (origin != "literature" && origin != "assumed")
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "origin", origin, { "literature", "assumed" }, "Accepted"));
    const scalar qMax = need(rating, "maxFlowPerUnit", Dims::volumetricFlow, who,
        "the largest flow ONE pump of the chosen make is built for, e.g."
        " `maxFlowPerUnit 1600 m3/h;`") * 3600.0;
    if (!(qMax > 0.0))
        throw std::runtime_error(who + ": maxFlowPerUnit must be positive.");
    scalar pRating = 0.0;
    if (rating->found("pressureRating"))
    {
        pRating = rating->lookupScalar("pressureRating", Dims::pressure) / 1.0e5;
        if (Pout > pRating + 1e-9)
            throw std::runtime_error(who + ": the pump discharges at "
                + fmt(Pout) + " bar, above the declared pressure rating of "
                + fmt(pRating) + " bar (" + rating->lookupWord("source")
                + ").  The maker builds no pump for it.");
    }

    const int needed = std::max(1, static_cast<int>(std::ceil(Qtrain / qMax - 1e-9)));
    int installed = 1;
    if (designRules->found("installed"))
    {
        const DictPtr ins = designRules->subDict("installed");
        needText(ins, "installed", who);
        if (!ins->found("count"))
            throw std::runtime_error(who + ": `installed { count N; }` has no `count`.");
        const scalar c = ins->lookupScalar("count");
        if (!(c >= 1.0) || std::abs(c - std::round(c)) > 1e-9)
            throw std::runtime_error(who + ": `installed.count` must be a whole number >= 1.");
        installed = static_cast<int>(std::lround(c));
    }
    int spare = 0;
    if (designRules->found("spare"))
    {
        const DictPtr sp = designRules->subDict("spare");
        needText(sp, "spare", who);
        if (!sp->found("count"))
            throw std::runtime_error(who + ": `spare { count N; }` has no `count`.");
        const scalar c = sp->lookupScalar("count");
        if (!(c >= 0.0) || std::abs(c - std::round(c)) > 1e-9)
            throw std::runtime_error(who + ": `spare.count` must be a whole number >= 0.");
        spare = static_cast<int>(std::lround(c));
    }
    if (installed < needed)
        throw std::runtime_error(who + ": " + std::to_string(installed)
            + " pump(s) per train do NOT carry the flow -- " + fmt(Qtrain)
            + " m3/h per train against " + fmt(qMax) + " m3/h for the largest"
            " pump (" + rating->lookupWord("source") + ").  " + std::to_string(needed)
            + " pump(s) in parallel per train would: declare `installed { count "
            + std::to_string(needed) + "; source \"...\"; reason \"...\"; }`,"
              " or more trains, or a larger pump.");

    const scalar perPump = Qtrain / installed;
    const scalar util    = perPump / qMax;
    EquipmentSizing d;
    d.unitName      = unitName;
    d.equipmentType = typeName;
    d.material      = material.name;
    //  The plant tag's inputs (EquipmentTag.H): a pump, and how many machines
    //  this item stands for -- the parallel pumps of a train, or, at a single
    //  station, the running pumps plus the declared stand-by.
    d.machineKind   = "volumeRate";
    d.installed     = (N > 0) ? installed : installed + spare;
    d.set("Q_plant",           Qplant,                      "m3/h");
    //  The per-train numbers exist only where the plant is built in trains; a
    //  single station (the intake) publishes the plant's and no "train".
    if (N > 0)
    {
        d.set("Q_train",           Qtrain,                  "m3/h");
        d.set("pumpsPerTrain",     installed,               "-");
        d.set("shaftPowerTrain",   Wplant / nTr,            "kW");
    }
    d.set("maxFlowPerUnit",    qMax,                        "m3/h");
    d.set("pumpsNeeded",       needed,                      "-");
    d.set("flowPerPump",       perPump,                     "m3/h");
    d.set("utilisation",       util,                        "-");
    d.set("shaftPowerPerPump", Wplant / nTr / installed,    "kW");
    d.set("shaftPowerPlant",   Wplant,                      "kW");
    d.set("head",              head,                        "m");
    d.set("P_out",             Pout,                        "bar");
    if (pRating > 0.0) d.set("pressureRating", pRating,     "bar");
    d.set("pumpsRunningPlant", static_cast<scalar>(installed) * nTr, "-");
    d.set("pumpsSparePlant",   spare,                       "-");
    d.set("pumpsInstalledPlant", static_cast<scalar>(installed) * nTr + spare, "-");
    d.basis = "pumps per train = ceil(Q_train / the largest pump's flow); Q = the"
        " pump's own published F x v_molar_liq; the largest pump is the CASE's"
        " (" + origin + ": " + rating->lookupWord("source") + "); shaft power is"
        " the unit's own W_shaft shared by the trains; " + std::to_string(spare)
        + " stand-by pump(s) for the plant (declared)"
        + (N > 0 ? "; per TRAIN of the " + std::to_string(N) + " declared"
                   " identical trains (" + result.trains.source + ")"
                 : std::string());
    d.notCostedBecause = "no cost correlation is carried for a process pump here;"
        " the money is the case's declared quote (`costing { quotes }`)";

    scalar thr = kAnnounceDefault;
    if (designRules->found("announceAbove")) thr = designRules->lookupScalar("announceAbove");
    if (util > thr)
    {
        const std::string msg = "utilisation " + fmt(util) + " is above " + fmt(thr)
            + ": the pump carries " + fmt(perPump) + " m3/h of a largest-pump flow of "
            + fmt(qMax) + " m3/h, little margin";
        std::cerr << "[sizing] " << who << ": " << msg << "\n";
        AdvisoryLog::instance().add("sizing", "warning", who, msg);
    }
    if (N == 0) return { d };
    std::vector<EquipmentSizing> out;
    for (int k = 1; k <= N; ++k)
    {
        EquipmentSizing t = d;
        trainSplit::stamp(t, k, N);
        out.push_back(std::move(t));
    }
    return out;
}

//  ---- the tablet press's optional checks (DEV.md 4c C270) -------------------
//
//  Called once, on the item the sizer publishes (the binding product's), after
//  the fit.  Three announcements of ABSENCE keep a press that declares nothing
//  saying so (no number of such a press moves); the declared checks publish
//  their numbers on the item and print their arithmetic.
void announce(const std::string& who, const std::string& severity,
              const std::string& msg)
{
    std::cerr << "[sizing] " << who << ": " << msg << "\n";
    AdvisoryLog::instance().add("sizing", severity, who, msg);
}

void pressChecks(EquipmentSizing& d, std::string& basis,
                 const std::string& unitName, const std::string& who,
                 const SimulationResult& result,
                 const DictPtr& dwellBlk, const DictPtr& oeeBlk,
                 const DictPtr& compBlk, scalar thr)
{
    auto v = [&](const char* k) { return d.values.at(k); };

    //  ---- dwell --------------------------------------------------------------
    if (!dwellBlk)
    {
        const std::string msg = "the press is NOT checked for dwell time: its"
            " capacity is the catalogue speed's.  Declare `dwell { punchFlat;"
            " pitchCircle; minimumDwellTime; source; reason; }` to rate it on the"
            " formulation's minimum dwell";
        if (AdvisoryLog::instance().addAnnouncedOnce("ratedMachine:dwellUnchecked:"
                + unitName, "sizing", "info", who, msg))
            std::cerr << "[sizing] " << who << ": " << msg << "\n";
    }
    else
    {
        std::cout << "\n  " << who << " -- DWELL (kinematics of the punch flat under the"
                     " roll)\n"
                  << "    t_dwell = L_flat / (pi D_pitch n) = " << fmt(v("punchFlat"))
                  << " mm / (pi x " << fmt(v("pitchCircle")) << " m x "
                  << fmt(v("turretSpeed")) << "/60 rev/s) = " << fmt(v("dwellTime_atRating"))
                  << " ms   (minimum " << fmt(v("dwellTime_minimum")) << " ms)\n"
                  << "    n_max   = L_flat / (pi D_pitch t_min) x 60 = "
                  << fmt(v("turretSpeed_dwellLimited")) << " rpm   capacity at n_max = "
                  << fmt(v("capacity_dwellLimited")) << " tablets/h per press (catalogue "
                  << fmt(v("capacity_machine")) << ")\n";
        if (v("dwellBinds") > 0.5)
            announce(who, "warning", "the DWELL LIMIT BINDS: at the catalogue "
                + fmt(v("turretSpeed")) + " rpm the punch flat dwells "
                + fmt(v("dwellTime_atRating")) + " ms under the roll against a declared"
                  " minimum of " + fmt(v("dwellTime_minimum")) + " ms, so the press runs"
                  " no faster than " + fmt(v("turretSpeed_dwellLimited")) + " rpm and"
                  " makes " + fmt(v("capacity_dwellLimited")) + " tablets/h, not the"
                  " catalogue's " + fmt(v("capacity_machine")) + "; the utilisation uses"
                  " the lower capacity");
    }

    //  ---- effectiveness: the rejects counted twice ---------------------------
    if (oeeBlk && v("quality") < 1.0)
    {
        const FlatUnit* fu = nullptr;
        for (const auto& u : result.topology)
            if (u.name == unitName) { fu = &u; break; }
        if (fu && fu->outs.size() >= 2)
        {
            scalar tot = 0.0, big = 0.0;
            for (const auto& s : fu->outs)
            {
                auto it = result.streams.find(s);
                if (it == result.streams.end()) continue;
                const scalar m = overallMassFlow(result, it->second);
                tot += m;  big = std::max(big, m);
            }
            const scalar rej = (tot > 0.0) ? 1.0 - big / tot : 0.0;
            if (rej > 0.0)
            {
                d.set("rejectFraction_flowsheet", rej, "-");
                announce(who, "warning", "the rejects are COUNTED TWICE: the"
                    " flowsheet already sends " + fmt(rej * 100.0) + " % of the"
                    " press's tablets out of its other outlet(s), and the declared"
                    " quality factor " + fmt(v("quality")) + " removes another "
                    + fmt((1.0 - v("quality")) * 100.0) + " % of its capacity.  OEE"
                    " = availability x performance x quality already counts the"
                    " rejects: declare quality 1 or drop the flowsheet's reject"
                    " split, not both");
            }
        }
    }

    //  ---- compaction: from the fitted curves to the force --------------------
    if (!compBlk)
    {
        const std::string msg = "the press is NOT checked for compaction force:"
            " declare `compaction { heckel { ... } ryshkewitch { ... }"
            " targetTensileStrength; punchTipArea; maxCompressionForce; source;"
            " reason; }` (the formulation's fitted curves, e.g. from the"
            " compactionFit bench) to find the pressure and force a tablet of the"
            " target strength needs";
        if (AdvisoryLog::instance().addAnnouncedOnce("ratedMachine:compactionUnchecked:"
                + unitName, "sizing", "info", who, msg))
            std::cerr << "[sizing] " << who << ": " << msg << "\n";
        return;
    }
    const std::string material = compBlk->lookupWordOrDefault("material",
                                                               "(material not named)");
    const DictPtr hk = optionalBlock(compBlk, "heckel", who);
    const DictPtr rd = optionalBlock(compBlk, "ryshkewitch", who);
    if (!hk || !rd)
        throw std::runtime_error(who + ": `compaction { }` needs both `heckel {"
            " K|Py; A; Pmin; Pmax; basis; source; reason; }` and `ryshkewitch {"
            " sigma0; kb; basis; source; reason; }` -- the pressure is found by"
            " inverting both curves.");
    needText(hk, "compaction.heckel", who);
    needText(rd, "compaction.ryshkewitch", who);

    //  Heckel: K or its reciprocal Py, exactly one (one quantity, one home).
    if (hk->found("K") == hk->found("Py"))
        throw std::runtime_error(who + ": `compaction.heckel` declares "
            + std::string(hk->found("K") ? "both `K` and `Py`" : "neither `K` nor `Py`")
            + " -- declare exactly one: the slope K [1/MPa] or the mean yield"
              " pressure Py = 1/K [MPa].");
    const scalar K = hk->found("K")
        ? hk->lookupScalar("K", Dimensions{ -1, 1, 2, 0, 0 }) * 1.0e6          // 1/MPa
        : 1.0e6 / hk->lookupScalar("Py", Dims::pressure);                     // 1/MPa
    const scalar A = needInPlain(hk, "compaction.heckel", "A", who,
        "the Heckel intercept, e.g. `A 0.66;`");
    const scalar Pmin = needIn(hk, "compaction.heckel", "Pmin", Dims::pressure, who,
        "the low end of the pressure window the line was fitted on") / 1.0e6;
    const scalar Pmax = needIn(hk, "compaction.heckel", "Pmax", Dims::pressure, who,
        "the high end of the pressure window the line was fitted on") / 1.0e6;
    const std::string hBasis = needBasis(hk, "heckel", who);
    const scalar s0 = needIn(rd, "compaction.ryshkewitch", "sigma0", Dims::pressure, who,
        "the strength extrapolated to zero porosity, e.g. `sigma0 34 MPa;`") / 1.0e6;
    const scalar kb = needInPlain(rd, "compaction.ryshkewitch", "kb", who,
        "the bonding-capacity constant, e.g. `kb 7.2;`");
    const std::string rBasis = needBasis(rd, "ryshkewitch", who);
    const scalar sig = needIn(compBlk, "compaction", "targetTensileStrength", Dims::pressure,
        who, "the tensile strength the tablet must reach, e.g. `targetTensileStrength 2 MPa;`") / 1.0e6;
    const scalar Atip = needIn(compBlk, "compaction", "punchTipArea", Dims::area, who,
        "the area of ONE punch tip, e.g. `punchTipArea 100 mm2;`");
    const scalar Fmax = needIn(compBlk, "compaction", "maxCompressionForce", Dims::force, who,
        "the press's largest main-compression force, e.g. `maxCompressionForce 100 kN;`");

    //  The refusals: what no tablet of these curves can be.
    if (!(K > 0.0))
        throw std::runtime_error(who + ": compaction.heckel K (or Py) must be"
            " positive -- a line along which the compact gets LESS dense as the"
            " pressure rises gives no pressure.");
    if (!(s0 > 0.0) || !(kb > 0.0))
        throw std::runtime_error(who + ": compaction.ryshkewitch sigma0 and kb"
            " must be positive.");
    if (!(sig > 0.0) || !(Atip > 0.0) || !(Fmax > 0.0) || !(Pmax > Pmin))
        throw std::runtime_error(who + ": compaction targetTensileStrength,"
            " punchTipArea and maxCompressionForce must be positive, and"
            " heckel.Pmax above heckel.Pmin.");
    if (!(sig < s0))
        throw std::runtime_error(who + ": the target tensile strength "
            + fmt(sig) + " MPa is at or above sigma_0 = " + fmt(s0) + " MPa, the"
              " strength the Ryshkewitch-Duckworth curve reaches only at ZERO"
              " porosity: no porosity gives it.  Lower the target or take a"
              " stronger material.");
    const scalar eps = compactionLaw::rdPorosity(s0, kb, sig);
    if (!(eps < 1.0))
        throw std::runtime_error(who + ": the target tensile strength " + fmt(sig)
            + " MPa needs a porosity of " + fmt(eps) + " on the Ryshkewitch-Duckworth"
              " curve -- at or above 1, which is no compact.");
    const scalar D = 1.0 - eps;
    const scalar DA = compactionLaw::heckelInterceptDensity(A);
    const scalar P = compactionLaw::heckelPressure(K, A, D);                   // MPa
    if (!(P > 0.0))
        throw std::runtime_error(who + ": the Heckel line cannot give the solid"
            " fraction " + fmt(D) + ": its own intercept is already D_A = 1 -"
              " exp(-A) = " + fmt(DA) + ", reached at zero pressure, so the"
              " pressure it inverts to is " + fmt(P) + " MPa.  The target lies"
              " outside what the line describes.");
    const scalar F = P * 1.0e6 * Atip;                                          // N
    const scalar ratio = F / Fmax;

    d.set("targetTensileStrength", sig,          "MPa");
    d.set("porosity_target",       eps,          "-");
    d.set("solidFraction_target",  D,            "-");
    d.set("compactionPressure",    P,            "MPa");
    d.set("punchTipArea",          Atip * 1.0e6, "mm2");
    d.set("punchForce",            F / 1.0e3,    "kN");
    d.set("maxCompressionForce",   Fmax / 1.0e3, "kN");
    d.set("forceRatio",            ratio,        "-");
    d.set("heckelWindowMin",       Pmin,         "MPa");
    d.set("heckelWindowMax",       Pmax,         "MPa");

    std::cout << "\n  " << who << " -- COMPACTION (" << material << ": ONE fitted"
                 " material, no mixture rule)\n"
              << "    Ryshkewitch-Duckworth inverted: eps = ln(sigma_0 / sigma_t) / k_b = ln("
              << fmt(s0) << " / " << fmt(sig) << ") / " << fmt(kb) << " = " << fmt(eps)
              << "   (" << rBasis << ")\n"
              << "    solid fraction  D = 1 - eps = " << fmt(D) << "\n"
              << "    Heckel inverted: P = (ln(1/(1 - D)) - A) / K = (" << fmt(compactionLaw::heckelOrdinate(D))
              << " - " << fmt(A) << ") / " << fmt(K) << " 1/MPa = " << fmt(P)
              << " MPa   (" << hBasis << ", window [" << fmt(Pmin) << ", " << fmt(Pmax) << "] MPa)\n"
              << "    force on one punch F = P x A_tip = " << fmt(P) << " MPa x "
              << fmt(Atip * 1.0e6) << " mm2 = " << fmt(F / 1.0e3) << " kN   ("
              << fmt(ratio * 100.0) << " % of the press's " << fmt(Fmax / 1.0e3) << " kN)\n";
    if (compBlk->found("trueDensity"))
    {
        const scalar rhoT = compBlk->lookupScalar("trueDensity", Dims::density);
        if (!(rhoT > 0.0))
            throw std::runtime_error(who + ": compaction.trueDensity must be positive.");
        const scalar m = v("itemMass");                                         // kg
        const scalar h = m / (rhoT * D * Atip);                                  // m
        d.set("trueDensity",     rhoT, "kg/m3");
        d.set("tabletThickness", h * 1.0e3, "mm");
        std::cout << "    thickness of a flat-faced tablet h = m / (rho_true D A_tip) = "
                  << fmt(m * 1.0e3) << " g / (" << fmt(rhoT / 1.0e3) << " g/cm3 x "
                  << fmt(D) << " x " << fmt(Atip * 1.0e4) << " cm2) = " << fmt(h * 1.0e3)
                  << " mm\n";
    }
    basis += "; COMPACTION (one fitted material, " + material + ", no mixture"
             " rule): porosity from Ryshkewitch-Duckworth inverted at the target"
             " strength, pressure from Heckel inverted at its solid fraction,"
             " force = pressure x punch tip area";

    //  The announcements: an answer the case must defend, never silently taken.
    const std::string noMix = "the compaction check reads ONE fitted material ("
        + material + "): no mixture rule is implemented, so the curves stand in for"
          " the formulation only as far as this material dominates it";
    if (AdvisoryLog::instance().addAnnouncedOnce("ratedMachine:compactionOneMaterial:"
            + unitName, "sizing", "info", who, noMix))
        std::cerr << "[sizing] " << who << ": " << noMix << "\n";
    if (P < Pmin || P > Pmax)
        announce(who, "warning", "the compaction pressure " + fmt(P) + " MPa lies"
            " OUTSIDE the window the Heckel line was fitted on [" + fmt(Pmin) + ", "
            + fmt(Pmax) + "] MPa: the line is EXTRAPOLATED there");
    if (hBasis != rBasis)
        announce(who, "warning", "the two curves are on DIFFERENT bases: Heckel is "
            + hBasis + " and Ryshkewitch-Duckworth is " + rBasis + ".  An in-die"
              " porosity is measured under load and an out-of-die one on the ejected"
              " tablet, after its elastic recovery, so the pressure found from one"
              " at the other's porosity is not the pressure that makes that tablet");
    if (ratio > thr)
        announce(who, "warning", ratio > 1.0
            ? "the force on one punch, " + fmt(F / 1.0e3) + " kN, is ABOVE the"
              " press's maximum compression force of " + fmt(Fmax / 1.0e3) + " kN"
              " (ratio " + fmt(ratio) + "): this press cannot make the tablet at"
              " the target strength"
            : "the force on one punch, " + fmt(F / 1.0e3) + " kN, is " + fmt(ratio)
              + " of the press's maximum of " + fmt(Fmax / 1.0e3) + " kN, above "
              + fmt(thr) + ": little margin");
}

} // namespace

std::vector<EquipmentSizing> RatedMachineSize::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    const std::string who = "ratedMachine '" + unitName + "'";

    //  THE KIND WITHOUT A BATCH PLAN (C199): a pump is rated by flow, and
    //  nothing in a continuous plant is scheduled.  Decided before the plan
    //  is demanded.
    if (designRules->found("kind") && designRules->lookupWord("kind") == "volumeRate")
        return sizeVolumeRate(unitName, result, material, designRules, who, type_);

    const BatchPlanRecord& plan = result.batchPlan;

    if (!plan.present)
        throw std::runtime_error(who + ": no batch plan ran before the sizing"
            " pass -- the machine's load is read from the plan's stage, lot and"
            " times.  Declare `batchPlan { ... }` ABOVE `sizing { ... }` in"
            " system/postDict.");
    const BatchStage* stage = plan.stageOfUnit(unitName);
    if (!stage)
        throw std::runtime_error(who + ": the unit is in no stage of the batch"
            " plan, so there is no lot, cycle or operating time to read.  Add"
            " it to a stage's `units ( ... )`.");
    if ((!plan.multiProduct() && !(plan.lotSize > 0.0)) || !(plan.productRate > 0.0))
        throw std::runtime_error(who + ": the plan publishes no positive lot"
            " size and product rate.");

    //  ---- the declared kind -------------------------------------------------
    if (!designRules->found("kind"))
        throw std::runtime_error(who + ": `kind` is not declared in the"
            " designRules (batchVolume | massRate | tabletPress |"
            " packagingLine).");
    const std::string kind = designRules->lookupWord("kind");
    const std::vector<std::string> kinds =
        { "batchVolume", "massRate", "tabletPress", "packagingLine", "volumeRate" };
    if (std::find(kinds.begin(), kinds.end(), kind) == kinds.end())
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "kind", kind, kinds, "Accepted"));

    if (!designRules->found("rating")
        || !std::holds_alternative<DictPtr>(designRules->entryValue("rating")))
        throw std::runtime_error(who + ": `rating { ... source \"...\"; reason"
            " \"...\"; }` is not declared -- the vendor's number and where it"
            " came from.");
    const DictPtr rating = designRules->subDict("rating");
    needText(rating, "rating", who);

    //  ---- how many machines ----------------------------------------------
    int installed = stage->unitsInstalled;
    bool installedDeclared = false;
    if (designRules->found("installed"))
    {
        const DictPtr ins = designRules->subDict("installed");
        needText(ins, "installed", who);
        if (!ins->found("count"))
            throw std::runtime_error(who + ": `installed { count N; }` has no"
                " `count`.");
        const scalar c = ins->lookupScalar("count");
        if (!(c >= 1.0) || std::abs(c - std::round(c)) > 1e-9)
            throw std::runtime_error(who + ": `installed.count` must be a"
                " whole number >= 1.");
        installed = static_cast<int>(std::lround(c));
        installedDeclared = true;
    }

    //  ---- the mass the machine handles ---------------------------------------
    //  ONE VIEW of the stage per product: a single-product plan has one (the
    //  plan's stage and lot); a MULTIPRODUCT plan has one per product (its
    //  lot mass, its own operating time, bulk density and cycle at this
    //  stage -- `BatchProductStage`), and the fit is checked for EACH.
    struct View
    {
        std::string product;      // "" for a single-product plan
        scalar lotSize, massPerLot, bulkDensity, fillFraction, processTime,
               cycleTime, utilisation;
    };
    std::vector<View> views;
    if (!plan.multiProduct())
        views.push_back({ "", plan.lotSize, stage->massPerLot, stage->bulkDensity,
            stage->fillFraction, stage->processTime, stage->cycleTime,
            stage->utilisation });
    else
    {
        for (const auto& pr : plan.products)
        {
            const BatchProductStage* ps = nullptr;
            for (const auto& x : plan.productStages)
                if (x.product == pr.name && x.stage == stage->name) ps = &x;
            if (!ps)
                throw std::runtime_error(who + ": the plan has no record of product '"
                    + pr.name + "' at stage '" + stage->name + "'.");
            views.push_back({ pr.name, pr.lotSize, ps->massPerLot, ps->bulkDensity,
                ps->fillFraction, ps->processTime, ps->cycleTime, ps->utilisation });
        }
    }

    scalar inletKgH = 0.0;                                         // kg/h, flowsheet basis
    {
        const FlatUnit* fu = nullptr;
        for (const auto& u : result.topology)
            if (u.name == unitName) { fu = &u; break; }
        if (!fu)
            throw std::runtime_error(who + ": the unit is not in the"
                " flattened topology, so its inlet streams are unknown.");
        for (const auto& s : fu->ins)
        {
            auto it = result.streams.find(s);
            if (it == result.streams.end())
                throw std::runtime_error(who + ": inlet stream '" + s
                    + "' is not in the converged result.");
            inletKgH += overallMassFlow(result, it->second) * 3600.0;
        }
    }

    struct Eval
    {
        const View* v = nullptr;
        scalar load = 0.0, capacity = 0.0, perMachine = 0.0, util = 0.0, run = 0.0;
        int needed = 1;
        std::string loadUnit, basis;
        EquipmentSizing d;
    };
    //  THE PRESS'S OPTIONAL CHECKS (DEV.md 4c C270): a tablet press only.
    const bool press = (kind == "tabletPress");
    DictPtr dwellBlk = nullptr, oeeBlk = nullptr, compBlk = nullptr;
    for (const char* k : { "dwell", "effectiveness", "compaction" })
        if (!press && designRules->found(k))
            throw std::runtime_error(who + ": `" + std::string(k) + " { }` is"
                " declared on a kind " + kind + " machine; it belongs to a"
                " tablet press (kind tabletPress) only.");
    if (press)
    {
        dwellBlk = optionalBlock(designRules, "dwell", who);
        oeeBlk   = optionalBlock(designRules, "effectiveness", who);
        compBlk  = optionalBlock(designRules, "compaction", who);
        if (dwellBlk) needText(dwellBlk, "dwell", who);
        if (oeeBlk)   needText(oeeBlk, "effectiveness", who);
        if (compBlk)  needText(compBlk, "compaction", who);
    }

    auto evaluate = [&](const View& v) -> Eval
    {
    Eval E;  E.v = &v;
    scalar& load = E.load; scalar& capacity = E.capacity; scalar& perMachine = E.perMachine;
    std::string& loadUnit = E.loadUnit; std::string& basis = E.basis;
    EquipmentSizing& d = E.d;
    const scalar lotHours = v.lotSize / plan.productRate;          // h
    const scalar m_lot_unit = inletKgH * lotHours;                  // kg per lot

    d.unitName      = unitName;
    d.equipmentType = type_;
    d.material      = material.name;

    if (kind == "batchVolume")
    {
        if (stage->type != "batch")
            throw std::runtime_error(who + ": kind batchVolume needs a BATCH"
                " stage; stage '" + stage->name + "' is "
                + stage->type + ".");
        if (!(v.bulkDensity > 0.0))
            throw std::runtime_error(who + ": stage '" + stage->name
                + "' declares no bulk density.");
        const scalar Vnom  = need(rating, "nominalVolume", Dims::volume, who,
                                  "the vendor's total volume, e.g. `nominalVolume 1.2 m3;`");
        const scalar fill  = needPlain(rating, "maxFill", who,
                                  "the largest fraction of the volume the vendor lets you fill, e.g. `maxFill 0.7;`");
        if (!(Vnom > 0.0) || !(fill > 0.0 && fill <= 1.0))
            throw std::runtime_error(who + ": nominalVolume must be positive"
                " and maxFill in (0, 1].");
        load       = v.massPerLot / v.bulkDensity;       // m3 working
        perMachine = Vnom * fill;
        capacity   = installed * perMachine;
        loadUnit   = "m3";
        d.set("m_lot",              v.massPerLot,  "kg");
        d.set("rho_bulk",           v.bulkDensity, "kg/m3");
        d.set("fillPlan",           v.fillFraction, "-");
        d.set("V_nominal",          Vnom,               "m3");
        d.set("maxFill",            fill,               "-");
        d.set("V_working_required", load,               "m3");
        d.set("V_working_capacity", capacity,           "m3");
        basis = "lot working volume = the plan stage's mass per lot / its declared"
                " bulk density (read from the batch plan); capacity = machines x"
                " vendor nominal volume x maximum fill";
    }
    else
    {
        if (stage->type != "semicontinuous")
            throw std::runtime_error(who + ": kind " + kind + " needs a"
                " SEMICONTINUOUS stage; stage '" + stage->name + "' is "
                + stage->type + ".");
        if (!(v.processTime > 0.0))
            throw std::runtime_error(who + ": stage '" + stage->name
                + "' has no positive operating time.");
        const scalar tOp = v.processTime;                      // h
        d.set("m_lot",    m_lot_unit, "kg");
        d.set("t_operating_plan", tOp, "h");
        if (kind == "massRate")
        {
            const scalar cap = need(rating, "capacity", Dims::massFlow, who,
                                    "the vendor's throughput, e.g. `capacity 200 kg/h;`") * 3600.0;
            if (!(cap > 0.0)) throw std::runtime_error(who + ": capacity must be positive.");
            load = m_lot_unit / tOp;  perMachine = cap;  loadUnit = "kg/h";
            d.set("capacity_machine", cap, "kg/h");
            basis = "load = the mass the unit's inlet streams carry per lot (the"
                    " run's flowsheet basis scaled by the plan's lot hours) / the"
                    " stage's operating time (read from the batch plan);"
                    " capacity = machines x the vendor's throughput";
        }
        else
        {
            scalar mItem = need(rating, "itemMass", Dims::mass, who,
                                "the mass of ONE counted item, e.g. `itemMass 0.7 g;`");
            //  SEVERAL PRODUCTS: a strength with its own tablet weight declares
            //  it beside the default (`itemMassByProduct { strength5 0.145 g; }`).
            if (!v.product.empty() && rating->found("itemMassByProduct"))
            {
                const DictPtr ib = rating->subDict("itemMassByProduct");
                if (ib->found(v.product))
                    mItem = ib->lookupScalar(v.product, Dims::mass);
            }
            if (!(mItem > 0.0)) throw std::runtime_error(who + ": itemMass must be positive.");
            const scalar itemsPerHour = m_lot_unit / mItem / tOp;   // items/h
            d.set("itemMass", mItem, "kg");
            if (kind == "tabletPress")
            {
                const scalar st  = needPlain(rating, "stations", who,
                    "the turret's punch stations, e.g. `stations 45;`");
                const scalar rpm = needPlain(rating, "turretSpeed", who,
                    "the turret speed in revolutions per minute (a plain number), e.g. `turretSpeed 60;`");
                const scalar cpr = needPlain(rating, "compressionsPerRevolution", who,
                    "tablets a station makes per revolution (1 single-sided, 2 double-sided), e.g. `compressionsPerRevolution 1;`");
                if (!(st > 0.0 && rpm > 0.0 && cpr > 0.0))
                    throw std::runtime_error(who + ": stations, turretSpeed and"
                        " compressionsPerRevolution must be positive.");
                perMachine = st * rpm * 60.0 * cpr;                 // tablets/h
                load = itemsPerHour;  loadUnit = "tablets/h";
                d.set("stations",    st,  "-");
                d.set("turretSpeed", rpm, "1/min");
                d.set("compressionsPerRevolution", cpr, "-");
                d.set("capacity_machine", perMachine, "1/h");
                basis = "load = tablets per hour = the mass the press's inlet"
                        " carries per lot / the pressed tablet's mass / the"
                        " stage's operating time (read from the batch plan);"
                        " capacity = machines x stations x turret rpm x 60 x"
                        " compressions per revolution (nameplate";

                //  THE DWELL LIMIT (DEV.md 4c C270).  The punch head's flat
                //  stays under the compression roll while the turret turns
                //  through flat / (pi D_pitch) of a revolution, so at n rev/s
                //      t_dwell = L_flat / (pi D_pitch n)
                //  and a formulation that needs at least t_min is pressed no
                //  faster than
                //      n_max = L_flat / (pi D_pitch t_min).
                //  Pure kinematics; the press is rated on the LOWER of the
                //  catalogue speed and n_max.  Absent, the press is NOT
                //  checked for dwell time and the run says so (below).
                if (dwellBlk)
                {
                    const scalar flat = needIn(dwellBlk, "dwell", "punchFlat", Dims::length, who,
                        "the length of the punch head's flat, e.g. `punchFlat 8 mm;`");
                    const scalar Dpc = needIn(dwellBlk, "dwell", "pitchCircle", Dims::length, who,
                        "the diameter of the turret's pitch circle, e.g. `pitchCircle 0.30 m;`");
                    const scalar tmin = needIn(dwellBlk, "dwell", "minimumDwellTime", Dims::time, who,
                        "the shortest dwell the formulation tolerates, e.g. `minimumDwellTime 10 ms;`");
                    if (!(flat > 0.0 && Dpc > 0.0 && tmin > 0.0))
                        throw std::runtime_error(who + ": dwell.punchFlat, dwell.pitchCircle"
                            " and dwell.minimumDwellTime must be positive.");
                    const scalar nAt   = rpm / 60.0;                          // rev/s
                    const scalar tAt   = flat / (kPi * Dpc * nAt);            // s
                    const scalar rpmLim = flat / (kPi * Dpc * tmin) * 60.0;   // 1/min
                    const scalar capLim = st * rpmLim * 60.0 * cpr;           // tablets/h
                    const bool binds = rpmLim < rpm;
                    d.set("punchFlat",                flat * 1.0e3, "mm");
                    d.set("pitchCircle",              Dpc,          "m");
                    d.set("dwellTime_minimum",        tmin * 1.0e3, "ms");
                    d.set("dwellTime_atRating",       tAt * 1.0e3,  "ms");
                    d.set("turretSpeed_dwellLimited", rpmLim,       "1/min");
                    d.set("capacity_dwellLimited",    capLim,       "1/h");
                    d.set("dwellBinds",               binds ? 1.0 : 0.0, "-");
                    if (binds) perMachine = capLim;
                    basis += binds
                        ? std::string("; the DWELL LIMIT BINDS: rated at n = L_flat / (pi"
                          " D_pitch t_min), below the catalogue speed")
                        : std::string("; checked for dwell: t_dwell = L_flat / (pi D_pitch"
                          " n) at the catalogue speed meets the declared minimum");
                }
                //  OVERALL EQUIPMENT EFFECTIVENESS, declared: availability x
                //  performance x quality scales the capacity.  Absent, the
                //  capacity carries no efficiency (as before).
                if (oeeBlk)
                {
                    const scalar a = needInPlain(oeeBlk, "effectiveness", "availability", who,
                        "the fraction of the planned time the press runs, e.g. `availability 0.90;`");
                    const scalar p = needInPlain(oeeBlk, "effectiveness", "performance", who,
                        "the running speed as a fraction of the rated one, e.g. `performance 0.95;`");
                    const scalar q = needInPlain(oeeBlk, "effectiveness", "quality", who,
                        "the fraction of the tablets made that are good, e.g. `quality 0.99;`");
                    for (scalar f : { a, p, q })
                        if (!(f > 0.0 && f <= 1.0))
                            throw std::runtime_error(who + ": effectiveness.availability,"
                                " performance and quality must each lie in (0, 1].");
                    d.set("availability", a, "-");
                    d.set("performance",  p, "-");
                    d.set("quality",      q, "-");
                    d.set("oee",          a * p * q, "-");
                    perMachine *= a * p * q;
                    basis += "; x the declared overall equipment effectiveness"
                             " (availability x performance x quality)";
                }
                if (dwellBlk || oeeBlk)
                    d.set("capacity_effective", perMachine, "1/h");
                basis += (dwellBlk || oeeBlk) ? ")" : ", no efficiency)";
            }
            else   // packagingLine
            {
                const scalar ppm = needPlain(rating, "packsPerMinute", who,
                    "the line's packs per minute (a plain number), e.g. `packsPerMinute 300;`");
                const scalar nPk = needPlain(rating, "itemsPerPack", who,
                    "tablets in one pack, e.g. `itemsPerPack 28;`");
                if (!(ppm > 0.0 && nPk > 0.0))
                    throw std::runtime_error(who + ": packsPerMinute and"
                        " itemsPerPack must be positive.");
                perMachine = ppm * 60.0;                            // packs/h
                load = itemsPerHour / nPk;  loadUnit = "packs/h";
                d.set("packsPerMinute", ppm, "1/min");
                d.set("itemsPerPack",   nPk, "-");
                d.set("capacity_machine", perMachine, "1/h");
                basis = "load = packs per hour = the mass the line's inlet carries"
                        " per lot / the packed tablet's mass / tablets per pack /"
                        " the stage's operating time (read from the batch plan);"
                        " capacity = machines x packs per minute x 60 (nameplate)";
            }
        }
        capacity = installed * perMachine;
        d.set("load", load, loadUnit == "kg/h" ? "kg/h" : "1/h");
        const scalar run = (load * tOp) / capacity;                 // h at the rating
        d.set("runTime_atRating", run, "h");
    }

    const scalar util = load / capacity;
    const int needed = std::max(1, static_cast<int>(std::ceil(load / perMachine - 1e-9)));
    d.set("utilisation",       util,            "-");
    d.set("machinesNeeded",    needed,          "-");
    d.machineKind = kind;
    d.installed   = installed;
    d.set("machinesInstalled", installed,       "-");
    d.set("machinesInPlan",    stage->unitsInstalled, "-");
    d.set("cycleTime_plan",    stage->cycleTime, "h");
    d.set("utilisation_plan",  stage->utilisation, "-");

    E.util = load / capacity;
    E.needed = std::max(1, static_cast<int>(std::ceil(load / perMachine - 1e-9)));
    if (kind != "batchVolume") E.run = d.values.at("runTime_atRating");
    return E;
    };

    if (rating->found("itemMassByProduct"))
    {
        if (!plan.multiProduct())
            throw std::runtime_error(who + ": `rating { itemMassByProduct { ... } }` is"
                " declared and the plan has ONE product -- there is nothing to"
                " distinguish; declare `itemMass` alone.");
        for (const auto& k : rating->subDict("itemMassByProduct")->keys())
        {
            bool known = false;
            for (const auto& pr : plan.products) known = known || pr.name == k;
            if (!known)
                throw std::runtime_error(who + ": `itemMassByProduct { " + k + " ...; }`"
                    " names no product of the plan.");
        }
    }
    std::vector<Eval> evals;
    for (const auto& v : views) evals.push_back(evaluate(v));
    //  The binding product: the one that loads the machine most.
    std::size_t bind = 0;
    for (std::size_t i = 1; i < evals.size(); ++i)
        if (evals[i].util > evals[bind].util + 1e-12) bind = i;
    const std::string bindName = evals[bind].v->product;
    for (const auto& E : evals)
        if (E.util > 1.0 + 1e-12)
            throw std::runtime_error(who + ": the machine does NOT fit the lot"
                + (E.v->product.empty() ? std::string() : " of product '"
                    + E.v->product + "'")
                + " -- utilisation " + fmt(E.util) + " (" + fmt(E.load) + " "
                + E.loadUnit + " against " + fmt(E.capacity) + " " + E.loadUnit
                + " for " + std::to_string(installed) + " machine(s)).  "
                + std::to_string(E.needed) + " machine(s) of this rating would carry it:"
                " declare `installed { count " + std::to_string(E.needed)
                + "; source \"...\"; reason \"...\"; }` (a second unit is a decision"
                  " the case states), or a larger machine, or a longer stage in the"
                  " batch plan.");
    EquipmentSizing d = evals[bind].d;
    const scalar load = evals[bind].load, capacity = evals[bind].capacity;
    const std::string loadUnit = evals[bind].loadUnit;
    std::string basis = evals[bind].basis;
    const scalar util = evals[bind].util;
    int needed = 1;
    for (const auto& E : evals) needed = std::max(needed, E.needed);
    d.set("utilisation",       util,            "-");
    d.set("machinesNeeded",    needed,          "-");
    d.machineKind = kind;
    d.installed   = installed;
    d.set("machinesInstalled", installed,       "-");
    d.set("machinesInPlan",    stage->unitsInstalled, "-");
    d.set("cycleTime_plan",    evals[bind].v->cycleTime, "h");
    d.set("utilisation_plan",  evals[bind].v->utilisation, "-");
    if (plan.multiProduct())
    {
        for (const auto& E : evals)
        {
            d.set("utilisation_" + E.v->product, E.util, "-");
            d.set("load_" + E.v->product, E.load, "-");
        }
        d.set("productsChecked", static_cast<scalar>(evals.size()), "-");
        basis += ".  MULTIPRODUCT: the fit is checked for each of the "
            + std::to_string(evals.size()) + " products (its lot, its operating"
            " time at this stage); the figures above are those of product '"
            + bindName + "', the one that loads the machine most";
        const std::string msg = "ratedMachine '" + unitName + "' checked its fit over "
            + std::to_string(evals.size()) + " products (binding: " + bindName + ")";
        if (AdvisoryLog::instance().addAnnouncedOnce("ratedMachine:products:" + unitName,
                "sizing", "info", who, msg))
            std::cerr << "[sizing] " << msg << "\n";
    }

    //  ---- the limits ---------------------------------------------------------
    if (installedDeclared && installed != stage->unitsInstalled)
    {
        const std::string msg = "the case installs " + std::to_string(installed)
            + " machine(s) but the batch plan's stage '" + stage->name
            + "' assumes " + std::to_string(stage->unitsInstalled)
            + " (its cycle time is built on that number)";
        std::cerr << "[sizing] " << who << ": " << msg << "\n";
        AdvisoryLog::instance().add("sizing", "warning", who, msg);
    }
    scalar thr = kAnnounceDefault;
    if (designRules->found("announceAbove")) thr = designRules->lookupScalar("announceAbove");
    if (util > thr)
    {
        const std::string msg = "utilisation " + fmt(util) + " is above "
            + fmt(thr) + (designRules->found("announceAbove") ? "" :
              " (the engine's stated announcement threshold; declare"
              " `announceAbove` to own it)") + ": the machine fits the lot with"
            " little margin (" + fmt(load) + " " + loadUnit + " against "
            + fmt(capacity) + ")";
        std::cerr << "[sizing] " << who << ": " << msg << "\n";
        AdvisoryLog::instance().add("sizing", "warning", who, msg);
    }
    if (designRules->found("shift"))
    {
        const DictPtr sh = designRules->subDict("shift");
        needText(sh, "shift", who);
        if (!sh->found("length"))
            throw std::runtime_error(who + ": `shift { length ...; }` has no `length`.");
        const scalar Ls = sh->lookupScalar("length", Dims::time) / 3600.0;   // h
        d.set("shiftLength", Ls, "h");
        //  ONE QUANTITY FOR EVERY KIND, AND EVERY PRODUCT (2026-11-09, DEV.md
        //  4c C269, the walk's S13).  The question the `shift` block asks --
        //  "a lot that cannot be finished inside the shift it starts in spans
        //  shifts" -- is about the time the lot HOLDS the machine, and the
        //  plan's cycle of this stage (charge + process + discharge + clean)
        //  is that time, for a vessel and for a rated machine alike.  Until
        //  now a vessel was compared on its cycle and a rated machine on its
        //  run at the nameplate rating, so donepezil's packaging line showed
        //  6.3 h against an 8 h shift while the plan held it 11 h per lot;
        //  and only the binding product was compared, so donepezil02's 5 mg
        //  lot (14 h on the press in the plan) was never announced.  The run
        //  at the rating stays published (`runTime_atRating`) as the
        //  machine's own need inside that cycle.
        auto lotTimeOf = [&](const Eval& E) { return E.v->cycleTime; };
        d.set("lotTime_forShift", lotTimeOf(evals[bind]), "h");
        for (const auto& E : evals)
        {
            const scalar lot = lotTimeOf(E);
            const bool   multi = !E.v->product.empty();
            if (multi) d.set("lotTime_forShift_" + E.v->product, lot, "h");
            if (lot > Ls)
            {
                std::string msg = "a lot" + (multi ? " of product '" + E.v->product + "'"
                                                   : std::string())
                    + " holds the machine " + fmt(lot) + " h (the plan's cycle of"
                      " stage '" + stage->name + "': charge + process + discharge"
                      " + clean";
                if (kind != "batchVolume")
                    msg += "; it runs " + fmt(E.run) + " h at the rating";
                msg += ") against a shift of " + fmt(Ls) + " h: the lot spans shifts";
                std::cerr << "[sizing] " << who << ": " << msg << "\n";
                AdvisoryLog::instance().add("sizing", "warning", who, msg);
            }
        }
    }

    if (press) pressChecks(d, basis, unitName, who, result, dwellBlk, oeeBlk,
                           compBlk, thr);

    if (press)
        d.basis = basis + ".  The rating is the CASE's (" + kind + ", declared"
            " with its source); the flowsheet's press is a mass split and models"
            " no compaction: the sizer checks the dwell time and the compaction"
            " force ONLY where the case declares the formulation's needs"
            " (`dwell { }`, `compaction { }`), and an overall equipment"
            " effectiveness only where it declares one (`effectiveness { }`)";
    else
        d.basis = basis + ".  The rating is the CASE's (" + kind + ", declared with"
              " its source); the machine's behaviour (compaction force, granule"
              " size, blend uniformity) and its overall equipment effectiveness"
              " are not modelled";
    d.notCostedBecause = "no cost correlation exists for a process machine; the"
        " money is the case's declared quote (`costing { quotes }`)";
    d.notPlacedBecause = "the machine stands in a room of the building; the"
        " room is what the plot plan places";
    return { d };
}

} // namespace Choupo
