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

#include "ShellTubeHX.H"

#include "thermo/utility/UtilityCatalogue.H"
#include "thermo/ThermoPackage.H"
#include "core/Advisory.H"
#include "core/RegistryRefusal.H"
#include "unitOperations/heatTransfer/htc/HeatTransferCorrelation.H"
#include "unitOperations/heatTransfer/htc/ShellTubeDesign.H"
#include "unitOperations/flash/StreamEquilibrium.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <limits>
#include <memory>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  THE ONE RECORD.  Every route below ends here, so the shell weight, the
//  five declared units and the field names have one home whichever way the
//  area was arrived at.
EquipmentSizing exchangerRecord(const std::string& unitName,
    scalar Q_kW, scalar U, scalar LMTD, scalar A, scalar pressureDesign,
    const Material& material, const std::string& basis)
{
    // Empirical weight ≈ 30 kg per m² (TEMA shell+tubes mid-range);
    // material factor scales linearly via density ratio (CS = 7850 kg/m³).
    const scalar weight = 30.0 * A * (material.density / 7850.0);

    EquipmentSizing d;
    d.unitName       = unitName;
    d.equipmentType  = "shellTubeHX";
    d.material       = material.name;
    d.basis          = basis;
    d.set("Q_kW",           Q_kW,           "kW");
    //  `W/m2/K`, NOT `W/(m2.K)` -- THE ONE SPELLING THE GRAMMAR CAN CARRY.
    //  Both name the same unit in `core/Units.cpp` at the same factor 1.0, so
    //  no number moves; but `(` and `)` are not word characters, so the
    //  tokenizer hands the parser `W/` and stops.  Until 2026-09-07 every
    //  heat-exchanger specification sheet therefore carried a `U` line that
    //  Choupo's OWN `Dictionary` refuses -- under a header saying "It is a
    //  Choupo dictionary: every value carries the unit it is in, named as the
    //  dict grammar names it".  `docs/ai/dict-syntax.md` states the rule in
    //  those words already ("the one parseable spelling -- forms like
    //  W/(m2.K) never survive the tokenizer"); this file had not read it.
    //  Found by the FIRST reader of a sheet, which is what
    //  `check_design_sheet`'s own blind-spot list said would find it.
    d.set("U",              U,              "W/m2/K");
    d.set("LMTD",           LMTD,           "K");
    d.set("A",              A,              "m2");
    d.set("pressureDesign", pressureDesign, "bar");
    d.set("weight",         weight,         "kg");
    //  NO TAG HERE.  A heater realises one exchanger and leaves the tag
    //  empty; `ColumnSize` stamps `condenser` / `reboiler` on the records it
    //  gets back, because naming the item is the CALLER's fact and not this
    //  rule's.
    return d;
}

//  A = Q / (U · LMTD).  Q in W; U·LMTD also in W/m².
scalar areaFromDuty(scalar Q_kW, scalar U, scalar LMTD)
{
    if (U <= 0.0 || LMTD <= 0.0)
        throw std::runtime_error("ShellTubeHX: U and LMTD must be > 0");
    return std::abs(Q_kW) * 1000.0 / (U * LMTD);   // m²
}

//  The counter-current LMTD of two POSITIVE terminal differences.  ONE home
//  for routes 2 and 4 (the equal-ends limit is the difference itself).
scalar counterCurrentLMTD(scalar dT1, scalar dT2)
{
    return (std::abs(dT1 - dT2) < 1.0e-9 * std::max(dT1, dT2))
        ? dT1 : (dT1 - dT2) / std::log(dT1 / dT2);
}

//  The temperature-cross refusal of a utility-served exchanger (routes 2, 4).
[[noreturn]] void refuseCross(const std::string& unitName,
    const std::string& uName, bool cooling, scalar Tpi, scalar Tpo,
    const Utility& ut, scalar dT1, scalar dT2)
{
    char b[480];
    std::snprintf(b, sizeof(b),
        "ShellTubeHX: unit '%s' cannot be served by utility '%s':"
        " a %s duty with the process going %.2f -> %.2f K and the"
        " utility %.2f -> %.2f K gives terminal differences %.2f K"
        " and %.2f K -- a temperature cross.  Name a %s utility.",
        unitName.c_str(), uName.c_str(),
        cooling ? "cooling" : "heating",
        static_cast<double>(Tpi), static_cast<double>(Tpo),
        static_cast<double>(ut.T_in), static_cast<double>(ut.T_out),
        static_cast<double>(dT1), static_cast<double>(dT2),
        cooling ? "colder" : "hotter");
    throw std::runtime_error(b);
}


// ===========================================================================
//  ROUTE 4 -- THE DETAILED DESIGN (2026-10-07, DEV.md 4c C48)
// ===========================================================================
//
//  A = Q/(U*LMTD) with an AUTHOR-SET U is a first estimate, not a design: it
//  has no tubes, no shell, no film coefficients, no fouling and no pressure
//  drop, and the U it rests on is a number typed beside the duty.  A
//  `design { method Kern; ... }` block in the designRules asks for the
//  design instead: the bundle the author chose (tube OD/ID/length, pitch,
//  pattern, passes, baffle spacing as a fraction of the shell ID), the
//  fouling the author declares per side, and the number of tubes SOLVED so
//  that
//
//          U_dirty(N) * F * LMTD * pi d_o L N  >=  |Q|
//
//  with U computed from the two films, the wall and the fouling -- the films
//  from the SAME kernel the two-stream unit rates and designs with
//  (`htc/ShellTubeDesign`).  The area the design INSTALLS is the area that
//  is costed.
//
//  WHERE EACH FLUID'S PROPERTIES COME FROM, stated because it is a choice:
//    * the PROCESS side is priced by the case's own package (`thermoForPost`)
//      at the MEAN of its terminal temperatures, its INLET pressure and its
//      inlet composition -- density on the package's phase route (SRK for a
//      gas here), heat capacity as the derivative of the package's own
//      enthalpy (the surface the duty was priced on), viscosity and
//      conductivity from the package's declared `transport {}` models;
//    * the UTILITY side by the system the utility's OWN record declares
//      (`thermophysicalSystem {}` in data/standards/utilities/<name>.dat) at
//      the mean of its supply and return temperatures and its header
//      pressure; its mass flow is |Q| / dutyPerKg, the record's own datum;
//    * a utility that BOILS or CONDENSES (refrigerant, steam) has no
//      single-phase film: its coefficient must be DECLARED
//      (`utilitySideFilm`), and no utility-side pressure drop is computed.
//
//  A CONDENSING PROCESS SIDE (an outlet that is two-phase on a cooling duty)
//  is not a single-phase film, and it is NOT priced as one silently: the
//  film is evaluated on the GAS that leaves -- the outlet's own equilibrium
//  vapour, at the outlet temperature, carrying only the vapour's mass flow,
//  which is the smallest gas flow on the path -- and the condensate film,
//  whose coefficient is higher, is not credited.  So the design is on the
//  SAFE side (it over-sizes), and it says so on the sheet and in the
//  caveats.  Its pressure drop is taken on the INLET, the whole flow priced
//  as the inlet's gas (the largest volumetric flow on the path); a
//  two-phase pressure drop is not modelled.  A side that BOILS on a heating
//  duty, or condenses totally, is refused by name.
namespace design {

using shellTubeDesign::SideFluid;

struct FluidState
{
    std::string label;      // what the sheet calls it
    scalar      T = 0.0, P = 0.0;
    sVector     z;
    scalar      mdot = 0.0; // kg/s
    bool        vapour = true;
};

scalar meanMolarMass(const ThermoPackage& tp, const sVector& z)
{
    scalar M = 0.0;
    for (std::size_t i = 0; i < tp.n() && i < z.size(); ++i)
        if (z[i] > 0.0) M += z[i] * tp.comp(i).MW();
    return M;                                            // kg/kmol
}

//  Price one fluid state into the kernel's `SideFluid`.  Every property is
//  checked finite and positive; a package that cannot supply one REFUSES,
//  naming the property, the state and the package slot that supplies it.
SideFluid price(const ThermoPackage& tp, const FluidState& s, bool heating,
                const std::string& who)
{
    SideFluid f;
    f.mdot = s.mdot;
    f.heating = heating;
    const DensityPhase ph = s.vapour ? DensityPhase::Vapour : DensityPhase::Liquid;
    auto need = [&](const char* what, scalar v, const char* remedy)
    {
        if (!std::isfinite(v) || !(v > 0.0))
        {
            char b[200];
            std::snprintf(b, sizeof(b), " at %.2f K, %.6g bar", static_cast<double>(s.T),
                          static_cast<double>(s.P * 1.0e-5));
            throw std::runtime_error(who + ": the " + s.label + " (" +
                (s.vapour ? "gas" : "liquid") + b + ") has no usable " + what
                + ".  " + remedy);
        }
        return v;
    };
    try
    {
        f.rho = need("density", tp.density(s.T, s.P, s.z, ph),
            "The package's phase-density route returned nothing usable.");
        f.mu = need("viscosity", s.vapour ? tp.viscosityGas(s.T, s.z)
                                          : tp.viscosityLiquid(s.T, s.z),
            "Declare a viscosity model in the package's `transport {}`.");
        f.lambda = need("thermal conductivity",
            s.vapour ? tp.thermalConductivityGas(s.T, s.z)
                     : tp.thermalConductivityLiquid(s.T, s.z),
            "Declare a conductivity model in the package's `transport {}`.");
        //  The heat capacity is the derivative of the package's OWN enthalpy
        //  at the state, on the declared phase -- the surface the duty itself
        //  was priced on -- by a central difference of +-0.05 K.
        const scalar vf = s.vapour ? 1.0 : 0.0, dT = 0.05;
        const scalar cpMol = (tp.H_stream_formation(s.T + dT, s.P, vf, s.z)
                            - tp.H_stream_formation(s.T - dT, s.P, vf, s.z))
                           / (2.0 * dT);                     // J/(mol K)
        const scalar M = meanMolarMass(tp, s.z);              // kg/kmol = g/mol
        f.cp = need("heat capacity", cpMol / (M / 1000.0),
            "The package cannot price this state's enthalpy.");
    }
    catch (const std::exception& e)
    {
        const std::string m = e.what();
        if (m.rfind(who, 0) == 0) throw;
        throw std::runtime_error(who + ": pricing the " + s.label + " failed: "
            + m);
    }
    return f;
}

enum class Phase { Vapour, Liquid, TwoPhase };
Phase phaseOf(const ProcessStream& s)
{
    if (s.vf >= 1.0 - 1.0e-9) return Phase::Vapour;
    if (s.vf <= 1.0e-9)       return Phase::Liquid;
    return Phase::TwoPhase;
}

//  The equilibrium vapour a stream carries at its own (T, P, z): the one
//  home of a stream's split (`flashState::equilibriumAt`).
FlashSolution vapourOf(const ThermoPackage& tp, const ProcessStream& s,
                       const std::string& who)
{
    auto fs = flashState::equilibriumAt(s.T, s.P, s.z, false, s.vf, tp,
                                        who, "design");
    if (!fs || !(fs->V_over_F > 1.0e-9) || fs->y.size() != tp.n())
        throw std::runtime_error(who + ": stream '" + s.name + "' is carried"
            " two-phase but its equilibrium at its own state has no vapour the"
            " design could put a gas film on.");
    return *fs;
}

//  The process-side states: the one the FILM is evaluated on, and the one
//  the PRESSURE DROP is.  Equal for a single-phase side.
struct ProcessSide
{
    FluidState film, hydraulic;
    bool       condensing = false;
    std::string note;        // the sentence the basis carries
};

ProcessSide processSide(const ThermoPackage& tp, const ProcessStream& in,
                        const ProcessStream& out, bool cooling,
                        const std::string& label, const std::string& who)
{
    ProcessSide p;
    const Phase pi = phaseOf(in), po = phaseOf(out);
    const scalar Min = meanMolarMass(tp, in.z);
    const scalar mdot = in.F * Min;                     // kmol/s x kg/kmol
    if (pi == po && pi != Phase::TwoPhase)
    {
        FluidState s;
        s.label = label;
        s.T = 0.5 * (in.T + out.T);  s.P = in.P;  s.z = in.z;
        s.mdot = mdot;  s.vapour = (pi == Phase::Vapour);
        p.film = p.hydraulic = s;
        p.note = label + " single-phase " + (s.vapour ? "gas" : "liquid")
               + ", properties at the mean of its terminal temperatures, its"
                 " inlet pressure and composition";
        return p;
    }
    if (!cooling)
        throw std::runtime_error(who + ": the " + label + " changes phase on a"
            " HEATING duty (" + in.name + " -> " + out.name + ") -- a boiling"
            " film is not modelled by this design route.  Size it on a declared"
            " `U` (`U <W/m2/K>; utility <name>;`) instead.");
    if (po != Phase::TwoPhase)
        throw std::runtime_error(who + ": the " + label + " leaves "
            + (po == Phase::Liquid ? std::string("totally condensed")
                                   : std::string("as a gas from a two-phase inlet"))
            + " -- this design route puts a gas film on the vapour that LEAVES,"
              " and there is none to put it on.  A total condenser needs a"
              " condensation film model; size it on a declared `U` instead.");
    p.condensing = true;
    //  FILM: the outlet's own equilibrium vapour, its mass flow only.
    const FlashSolution fo = vapourOf(tp, out, who);
    FluidState f;
    f.label = label + " outlet gas";
    f.T = out.T;  f.P = out.P;  f.z = fo.y;
    f.mdot = out.F * fo.V_over_F * meanMolarMass(tp, fo.y);
    f.vapour = true;
    p.film = f;
    //  PRESSURE DROP: the whole inlet flow, priced as the inlet's gas.
    FluidState h;
    h.label = label + " inlet (whole flow as gas)";
    h.T = in.T;  h.P = in.P;  h.vapour = true;  h.mdot = mdot;
    h.z = (pi == Phase::Vapour) ? in.z : vapourOf(tp, in, who).y;
    p.hydraulic = h;
    char b[400];
    std::snprintf(b, sizeof(b),
        "%s CONDENSES (vapour fraction %.4f -> %.4f): its film is the GAS film"
        " of the outlet's own equilibrium vapour at %.2f K carrying %.4g kg/s"
        " of the %.4g kg/s -- the condensate film, whose coefficient is"
        " higher, is not credited, so this OVER-SIZES; its pressure drop is"
        " the whole inlet flow priced as gas (a two-phase dP is not modelled)",
        label.c_str(), static_cast<double>(in.vf), static_cast<double>(out.vf),
        static_cast<double>(out.T), static_cast<double>(f.mdot),
        static_cast<double>(mdot));
    p.note = b;
    return p;
}

std::unique_ptr<HeatTransferCorrelation> correlation(const DictPtr& dg,
    const char* block, const std::string& who)
{
    if (!dg->found(block))
        throw std::runtime_error(who + ": `design {}` declares no `" + block
            + " { model <name>; }` -- the film correlation of that side is the"
              " designer's choice and is not defaulted.  Registered:"
            + [] { std::string s; for (const auto& t :
                   HeatTransferCorrelation::availableTypes()) s += " " + t;
                   return s; }());
    auto sd = dg->subDict(block);
    auto c = HeatTransferCorrelation::New(sd->lookupWord("model"));
    c->readParameters(sd);
    return c;
}

std::vector<EquipmentSizing> run(const std::string& unitName, scalar Q_kW,
    const SimulationResult& result, const Material& material,
    const DictPtr& designRules);

} // namespace design

} // namespace


//  THREE ROUTES TO AN AREA -- and a fourth, the DESIGN (`design {}`, C48,
//  above), checked first -- and the designRules say which (2026-10-07,
//  DEV.md 4c C44).  The question each route answers is "which temperatures
//  does this exchanger work across, and who knows them?" -- and a number the
//  RUN already knows must not be typed again beside it, because a typed copy
//  stands still while the flowsheet moves (re-tune a compressor and the
//  intercooler's inlet moves; a typed LMTD does not).
//
//    1. `U` + `LMTD` declared            -> A = Q/(U*LMTD), both author-set.
//       The original route, unchanged: every case that declares both is
//       sized exactly as before.
//    2. `U` + `utility <name>` declared  -> the LMTD is COMPUTED, counter-
//       current, from the unit's own published `T_in`/`T_out` and the
//       utility record's delivery/return temperatures
//       (data/standards/utilities/<name>.dat).  The process side is the
//       run's; the utility is the author's choice, NAMED, never typed as a
//       temperature.  Declaring `LMTD` as well REFUSES: two homes for one
//       number.  The LMTD is on TERMINAL temperatures, so a process side
//       that condenses along the way is approximated, and the basis says so.
//    3. none of `U`, `LMTD`, `utility`   -> a RATED exchanger: the unit
//       already has an area (a `heatExchanger` declares one and publishes
//       `area`, `U` and `LMTD`), so the sizer passes it through, as the
//       compressor sizer passes the shaft power.  A unit that publishes no
//       area refuses, naming the two declarations that would size it.
//
//  NOT closed here, named: a rated exchanger whose postDict ALSO declares
//  `U` + `LMTD` (route 1) is sized on the author's numbers and not on its
//  own area -- two homes for the area, which no gate reads.  Refusing that
//  would move the goldens of every case that has it; it is left as found.
std::vector<EquipmentSizing> ShellTubeHX::size(const std::string& unitName,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          designRules) const
{
    auto kpiIt = result.kpis.find(unitName);
    if (kpiIt == result.kpis.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' has no KPIs in the simulation result");
    const auto& k = kpiIt->second;

    // Q in kW from heater KPIs.
    auto q_it = k.find("Q_kW");
    if (q_it == k.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' has no 'Q_kW' KPI — is it a Heater?");
    const scalar Q_kW = q_it->second;

    const bool hasU       = designRules->found("U");
    const bool hasLMTD    = designRules->found("LMTD");
    const bool hasUtility = designRules->found("utility");

    //  ---- route 4: the DETAILED design (C48) -- U is a RESULT ------------
    if (designRules->found("design"))
    {
        if (hasU || hasLMTD)
            throw std::runtime_error("ShellTubeHX: unit '" + unitName
                + "' declares a `design {}` block AND `"
                + std::string(hasU ? "U" : "LMTD") + "`.\n"
                "  The design COMPUTES the overall coefficient from the films,"
                " the wall and the fouling, and the LMTD from the terminal\n"
                "  temperatures; a typed value beside it is a second home for"
                " the same number.  Delete `U`/`LMTD`, or delete `design {}`\n"
                "  to size on the declared coefficient (A = Q/(U*LMTD)).");
        return design::run(unitName, Q_kW, result, material, designRules);
    }

    //  ---- route 1: both author-set (the original) ------------------------
    if (!hasUtility && (hasU || hasLMTD))
        return { sizeFromDuty(unitName, Q_kW, material, designRules) };

    //  ---- route 2: U author-set, LMTD from the run and a named utility ----
    if (hasUtility)
    {
        const std::string uName = designRules->lookupWord("utility");
        if (hasLMTD)
            throw std::runtime_error("ShellTubeHX: unit '" + unitName
                + "' declares BOTH `utility " + uName + ";` and `LMTD`.\n"
                "  The utility exists to COMPUTE the LMTD from the unit's own"
                " inlet/outlet temperatures; a typed LMTD beside it\n"
                "  is a second home for one number, and the two would disagree"
                " the first time the flowsheet moved.\n"
                "  Delete one of them: `utility` to let the run decide the"
                " temperatures, `LMTD` to declare the difference yourself.");
        if (!hasU)
            throw std::runtime_error("ShellTubeHX: unit '" + unitName
                + "' declares `utility " + uName + ";` but no `U`.  The"
                " utility fixes the temperature difference; the overall\n"
                "  coefficient is still the author's design assumption --"
                " declare `U <W/m2/K>;` in the same designRules.");
        const Utility& ut = UtilityCatalogue::byName(uName);
        auto tIn  = k.find("T_in");
        auto tOut = k.find("T_out");
        if (tIn == k.end() || tOut == k.end())
            throw std::runtime_error("ShellTubeHX: unit '" + unitName
                + "' publishes no `T_in`/`T_out` KPI, so the LMTD against"
                " utility '" + uName + "' cannot be computed.\n"
                "  Declare `LMTD <K>;` instead of `utility`, which makes the"
                " temperature difference the author's assumption.");
        const scalar Tpi = tIn->second, Tpo = tOut->second;
        const bool cooling = Q_kW < 0.0;
        //  Counter-current terminal differences, each signed so that a
        //  feasible exchanger has both positive: the process end that meets
        //  the utility's RETURN, and the end that meets its DELIVERY.
        const scalar dT1 = cooling ? Tpi - ut.T_out : ut.T_out - Tpi;
        const scalar dT2 = cooling ? Tpo - ut.T_in  : ut.T_in  - Tpo;
        if (dT1 <= 0.0 || dT2 <= 0.0)
            refuseCross(unitName, uName, cooling, Tpi, Tpo, ut, dT1, dT2);
        const scalar LMTD = counterCurrentLMTD(dT1, dT2);
        const scalar U = designRules->lookupScalar("U");
        const scalar pressureDesign = designRules->lookupScalar("pressureDesign");
        char line[320];
        std::snprintf(line, sizeof(line),
            "  [basis] shellTubeHX '%s': LMTD %.6g K computed against utility"
            " %s (process %.2f -> %.2f K, utility %.2f -> %.2f K)\n",
            unitName.c_str(), static_cast<double>(LMTD), uName.c_str(),
            static_cast<double>(Tpi), static_cast<double>(Tpo),
            static_cast<double>(ut.T_in), static_cast<double>(ut.T_out));
        std::cout << line;
        return { exchangerRecord(unitName, Q_kW, U, LMTD,
                                 areaFromDuty(Q_kW, U, LMTD), pressureDesign,
                                 material,
            "A = Q/(U*LMTD), U author-set; LMTD counter-current on terminal"
            " temperatures, from the unit's own T_in/T_out and utility "
            + uName + "'s T_in/T_out") };
    }

    //  ---- route 3: a RATED exchanger, its own area passed through --------
    auto aIt = k.find("area");
    if (aIt == k.end())
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' declares no `U`, `LMTD` or `utility` in its designRules and"
            " publishes no `area` of its own.\n"
            "  Declare either `U <W/m2/K>; LMTD <K>;` (both author-set) or"
            " `U <W/m2/K>; utility <name>;`\n"
            "  (the LMTD computed from the unit's temperatures and a utility"
            " record in data/standards/utilities/).");
    const scalar A = aIt->second;
    if (A <= 0.0)
        throw std::runtime_error("ShellTubeHX: unit '" + unitName
            + "' publishes a non-positive `area`; a rated exchanger cannot be"
              " passed through without one.");
    const scalar U    = k.count("U")    ? k.at("U")    : 0.0;
    const scalar LMTD = k.count("LMTD") ? k.at("LMTD") : 0.0;
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");
    return { exchangerRecord(unitName, Q_kW, U, LMTD, A, pressureDesign,
        material,
        "A = the unit's own rated area (pass-through); U and LMTD read from"
        " the unit, not declared") };
}


EquipmentSizing ShellTubeHX::sizeFromDuty(const std::string& unitName,
    scalar                  Q_kW,
    const Material&         material,
    const DictPtr&          designRules)
{
    const scalar U              = designRules->lookupScalar("U");        // W/(m²·K)
    const scalar LMTD           = designRules->lookupScalar("LMTD");      // K
    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");

    return exchangerRecord(unitName, Q_kW, U, LMTD, areaFromDuty(Q_kW, U, LMTD),
        pressureDesign, material, "A = Q/(U*LMTD) with U and LMTD author-set");
}


// ===========================================================================
//  ROUTE 4, the body (see the block above `namespace design`).
// ===========================================================================
namespace {
namespace design {

using shellTubeDesign::TubeBundle;
using shellTubeDesign::Resistances;
using shellTubeDesign::TubeSideState;
using shellTubeDesign::ShellSideState;

//  One side of the bundle: either a FILM the kernel computes from a fluid
//  and a correlation, or a coefficient the case DECLARED (a boiling or
//  condensing utility), which has no correlation and no pressure drop here.
struct Side
{
    std::string  name;                 // "process", "utility <name>", stream
    bool         declaredFilm = false;
    scalar       hDeclared = 0.0;
    SideFluid    film;                 // the state the film is evaluated on
    SideFluid    hydraulic;            // the state the dP is evaluated on
    scalar       Tprops = 0.0;         // the film state's temperature [K]
    std::unique_ptr<HeatTransferCorrelation> corr;
};

std::vector<EquipmentSizing> run(const std::string& unitName, scalar Q_kW,
    const SimulationResult& result, const Material& material,
    const DictPtr& designRules)
{
    const std::string who = "ShellTubeHX: unit '" + unitName + "' (design)";
    auto dg = designRules->subDict("design");

    //  ---- the method: a closed set, and an unknown word refuses ---------
    const std::string method = dg->lookupWord("method");
    if (method != "Kern")
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "exchanger design method", method, {"Kern"}, "Accepted"));

    if (!result.thermoForPost)
        throw std::runtime_error(who + ": this run carries no thermophysical"
            " package for its post-processing passes (only choupoSolve attaches"
            " one), and a film coefficient cannot be formed without one.");
    const std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
    if (!pkg)
        throw std::runtime_error(who + ": the case's package could not be"
            " built for post-processing.");
    const ThermoPackage& tp = *pkg;

    const FlatUnit* fu = nullptr;
    for (const auto& u : result.topology) if (u.name == unitName) fu = &u;
    if (!fu || fu->ins.empty() || fu->ins.size() != fu->outs.size()
        || fu->ins.size() > 2)
        throw std::runtime_error(who + ": the design route needs the unit's"
            " ports -- one inlet and one outlet (a heater/cooler against a"
            " utility) or two of each (a two-stream exchanger) -- and the"
            " solved topology does not give them.");
    auto streamOf = [&](const std::string& n) -> const ProcessStream&
    {
        auto it = result.streams.find(n);
        if (it == result.streams.end())
            throw std::runtime_error(who + ": port stream '" + n + "' is not"
                " in the solved flowsheet.");
        if (it->second.z.size() != tp.n())
            throw std::runtime_error(who + ": stream '" + n + "' does not"
                " match the case's component list.");
        return it->second;
    };

    //  ---- the bundle, as the designer chose it ----------------------------
    TubeBundle b;
    b.tubeOD     = dg->lookupScalar("tubeOD",     Dims::length);
    b.tubeID     = dg->lookupScalar("tubeID",     Dims::length);
    b.tubeLength = dg->lookupScalar("tubeLength", Dims::length);
    b.pitch      = dg->lookupScalar("tubePitch",  Dims::length);
    const std::string pattern = dg->lookupWord("tubePattern");
    if (pattern != "triangular" && pattern != "square")
        throw std::runtime_error(who + ": " + registryRefusal::message(
            "tube pattern", pattern, {"triangular", "square"}, "Accepted"));
    b.triangular = (pattern == "triangular");
    const scalar passesDeclared = dg->lookupScalar("tubePasses");
    b.passes = static_cast<int>(std::lround(passesDeclared));
    if (std::abs(passesDeclared - b.passes) > 1.0e-9
        || !shellTubeDesign::listedPassCount(b.passes))
        throw std::runtime_error(who + ": `tubePasses` must be 1, 2, 4, 6 or 8"
            " -- the counts the bundle-diameter table (Sinnott's K1, n1)"
            " carries.");
    const scalar baffleRatio = dg->lookupScalar("baffleSpacingRatio");
    //  SHELLS IN SERIES (optional, default 1).  Only for ONE tube pass: n
    //  identical 1-1 shells in counter-current series are thermally one
    //  counter-current exchanger n times as long (F = 1, the same flow through
    //  every bundle), which is the remedy a temperature cross needs.  With 2+
    //  tube passes the shells' F would be a different formula, not built.
    const scalar shellsDeclared = dg->found("shellsInSeries")
                                ? dg->lookupScalar("shellsInSeries") : 1.0;
    const int nShells = static_cast<int>(std::lround(shellsDeclared));
    if (std::abs(shellsDeclared - nShells) > 1.0e-9 || nShells < 1)
        throw std::runtime_error(who + ": `shellsInSeries` must be a whole"
            " number >= 1.");
    if (!(b.tubeID > 0.0) || !(b.tubeOD > b.tubeID) || !(b.tubeLength > 0.0)
        || !(b.pitch > b.tubeOD) || !(baffleRatio > 0.0))
        throw std::runtime_error(who + ": inconsistent bundle (need"
            " 0 < tubeID < tubeOD, tubeLength > 0, tubePitch > tubeOD,"
            " baffleSpacingRatio > 0).");
    if (nShells > 1 && b.passes != 1)
        throw std::runtime_error(who + ": `shellsInSeries " + std::to_string(
            nShells) + ";` with " + std::to_string(b.passes) + " tube passes --"
            " the LMTD correction of 1-2 shells in series is not built.  Shells"
            " in series are designed here with ONE tube pass (counter-current,"
            " F = 1).");
    if (!(material.thermalConductivity > 0.0))
        throw std::runtime_error(who + ": material '" + material.name
            + "' carries no `thermalConductivity`, so the tube wall cannot be"
              " priced -- add it to data/standards/assets/" + material.name
            + ".dat.");
    b.wallK = material.thermalConductivity;

    //  ---- fouling: DECLARED, never defaulted ------------------------------
    //  A clean-tube design is a legitimate choice and `0` declares it; what
    //  is refused is an exchanger designed on a fouling nobody chose.
    if (!dg->found("fouling"))
        throw std::runtime_error(who + ": `design {}` declares no `fouling {"
            " tubeSide <R> m2.K/W; shellSide <R> m2.K/W; }`.\n  The fouling"
            " resistance is a design allowance the designer chooses per side"
            " (TEMA tabulates typical values per service); it is not"
            " defaulted.  Declare 0 on a side to design it CLEAN, said.");
    auto fd = dg->subDict("fouling");
    const scalar RfTube  = fd->lookupScalar("tubeSide",  Dims::thermalResistance);
    const scalar RfShell = fd->lookupScalar("shellSide", Dims::thermalResistance);
    if (RfTube < 0.0 || RfShell < 0.0)
        throw std::runtime_error(who + ": a fouling resistance must be >= 0.");

    const scalar Qw = std::abs(Q_kW) * 1000.0;
    if (!(Qw > 0.0))
        throw std::runtime_error(who + ": the unit's duty is zero; there is"
            " nothing to design.");

    Side tube, shell;
    ExchangerSide xTube, xShell;    // what the sheet's `exchanger {}` says (C51)
    std::string basisFluids;        // the sentence on where properties come from
    std::vector<std::string> notes; // conditional statements for the basis
    scalar LMTD = 0.0, Thi = 0, Tho = 0, tci = 0, tco = 0;
    scalar mdotUtility = -1.0;      // < 0: no utility (two process streams)
    std::string uName;
    bool condensing = false;
    std::string ratedNote;
    scalar A_rated = -1.0, U_rated = -1.0;

    auto requireCorr = [&](Side& s, const char* block)
    { s.corr = correlation(dg, block, who); };
    auto refuseUnusedCorr = [&](const char* block)
    {
        if (dg->found(block))
            throw std::runtime_error(who + ": `" + block + " {}` is declared"
                " but that side's coefficient is DECLARED (`utilitySideFilm`),"
                " so no correlation is evaluated there -- delete one of the"
                " two.");
    };

    if (fu->ins.size() == 1)
    {
        //  ================== a cooler / heater against a utility ==========
        if (!designRules->found("utility"))
            throw std::runtime_error(who + ": a one-stream exchanger's design"
                " needs the utility on its other side -- declare `utility"
                " <name>;` (data/standards/utilities/) beside `design {}`.");
        uName = designRules->lookupWord("utility");
        const Utility& ut = UtilityCatalogue::byName(uName);
        const std::string where = dg->lookupWord("processSide");
        if (where != "tube" && where != "shell")
            throw std::runtime_error(who + ": " + registryRefusal::message(
                "process side", where, {"tube", "shell"}, "Accepted"));
        const bool processInTubes = (where == "tube");
        const ProcessStream& in  = streamOf(fu->ins[0]);
        const ProcessStream& out = streamOf(fu->outs[0]);
        const bool cooling = Q_kW < 0.0;
        const scalar Tpi = in.T, Tpo = out.T;
        const scalar dT1 = cooling ? Tpi - ut.T_out : ut.T_out - Tpi;
        const scalar dT2 = cooling ? Tpo - ut.T_in  : ut.T_in  - Tpo;
        if (dT1 <= 0.0 || dT2 <= 0.0)
            refuseCross(unitName, uName, cooling, Tpi, Tpo, ut, dT1, dT2);
        LMTD = counterCurrentLMTD(dT1, dT2);
        if (cooling) { Thi = Tpi; Tho = Tpo; tci = ut.T_in; tco = ut.T_out; }
        else         { Thi = ut.T_in; Tho = ut.T_out; tci = Tpi; tco = Tpo; }

        //  the process side
        ProcessSide ps = processSide(tp, in, out, cooling, "process side", who);
        condensing = ps.condensing;
        Side& P = processInTubes ? tube : shell;
        P.name = "process";
        P.film      = price(tp, ps.film,      !cooling, who);
        P.hydraulic = price(tp, ps.hydraulic, !cooling, who);
        P.Tprops    = ps.film.T;
        requireCorr(P, processInTubes ? "tubeSide" : "shellSide");
        notes.push_back(ps.note);
        ExchangerSide& XP = processInTubes ? xTube : xShell;
        XP.role   = "process";
        XP.inlet  = fu->ins[0];
        XP.outlet = fu->outs[0];
        XP.regime = ps.condensing ? "condensing"
                  : (ps.film.vapour ? "gas" : "liquid");

        //  the utility side
        if (!(ut.dutyPerKg > 0.0))
            throw std::runtime_error(who + ": utility '" + uName + "' declares"
                " no `dutyPerKg`, so its flow cannot be formed from the duty.");
        mdotUtility = Qw / ut.dutyPerKg;                        // kg/s
        Side& Uside = processInTubes ? shell : tube;
        const char* ublock = processInTubes ? "shellSide" : "tubeSide";
        Uside.name = "utility " + uName;
        ExchangerSide& XU = processInTubes ? xShell : xTube;
        XU.role    = "utility";
        XU.utility = uName;
        XU.Tin     = ut.T_in;
        XU.Tout    = ut.T_out;
        XU.regime  = ut.mechanism == "evaporation"  ? "boils"
                   : ut.mechanism == "condensation" ? "condenses"
                   : (ut.state.find("iquid") == std::string::npos ? "gas"
                                                                  : "liquid");
        if (ut.mechanism == "sensible")
        {
            if (dg->found("utilitySideFilm"))
                throw std::runtime_error(who + ": `utilitySideFilm` is"
                    " declared for utility '" + uName + "', which is SENSIBLE"
                    " -- its film is COMPUTED from its flow and properties;"
                    " a typed coefficient beside it would be a second home.");
            if (!ut.thermophysicalSystem)
                throw std::runtime_error(who + ": utility '" + uName + "' declares"
                    " no `thermophysicalSystem {}` in its record, so its density,"
                    " viscosity, conductivity and heat capacity cannot be"
                    " evaluated -- and none is invented.  Add the block to"
                    " data/standards/utilities/" + uName + ".dat (the case"
                    " grammar of constant/thermoPhysPropDict).");
            if (!result.thermoForSystem)
                throw std::runtime_error(who + ": this run cannot build the"
                    " utility's declared system (only choupoSolve can).");
            std::shared_ptr<const ThermoPackage> upkg;
            try { upkg = result.thermoForSystem(ut.thermophysicalSystem); }
            catch (const std::exception& e)
            {
                throw std::runtime_error(who + ": the thermophysical system"
                    " utility '" + uName + "' declares could not be built: "
                    + e.what());
            }
            if (!upkg || upkg->n() != 1)
                throw std::runtime_error(who + ": utility '" + uName + "' must"
                    " declare ONE component in its thermophysicalSystem -- a"
                    " utility mixture is not priced by this route.");
            FluidState us;
            us.label  = "utility side (" + uName + ")";
            us.T      = 0.5 * (ut.T_in + ut.T_out);
            us.P      = ut.P;
            us.z      = sVector(1, 1.0);
            us.mdot   = mdotUtility;
            us.vapour = (ut.state.find("iquid") == std::string::npos);
            Uside.film = Uside.hydraulic = price(*upkg, us, cooling, who);
            Uside.Tprops = us.T;
            requireCorr(Uside, ublock);
            char nb[260];
            std::snprintf(nb, sizeof(nb),
                "utility %s (%s, %s) %.4g kg/s = |Q|/dutyPerKg, priced at the"
                " mean of its supply and return (%.2f K) and its header"
                " pressure by the system its own record declares",
                uName.c_str(), ut.componentsList.empty() ? "?"
                    : ut.componentsList.front().c_str(),
                us.vapour ? "gas" : "liquid",
                static_cast<double>(mdotUtility), static_cast<double>(us.T));
            notes.push_back(nb);
        }
        else if (ut.mechanism == "evaporation" || ut.mechanism == "condensation")
        {
            if (!dg->found("utilitySideFilm"))
                throw std::runtime_error(who + ": utility '" + uName + "' "
                    + (ut.mechanism == "evaporation" ? "BOILS" : "CONDENSES")
                    + " (mechanism " + ut.mechanism + "), and a single-phase"
                      " film correlation does not describe it.  Declare the"
                      " coefficient you design on: `utilitySideFilm <h>"
                      " W/m2/K;` in `design {}` -- an author-set value, said"
                      " on the sheet.");
            refuseUnusedCorr(ublock);
            Uside.declaredFilm = true;
            Uside.hDeclared = dg->lookupScalar("utilitySideFilm",
                                               Dims::heatTransfer_h);
            if (!(Uside.hDeclared > 0.0))
                throw std::runtime_error(who + ": `utilitySideFilm` must be > 0.");
            Uside.Tprops = ut.T_in;
            char nb[240];
            std::snprintf(nb, sizeof(nb),
                "utility %s %s at %.2f K, %.4g kg/s = |Q|/dutyPerKg; its film"
                " coefficient %.0f W/m2/K is DECLARED (author-set, no"
                " correlation) and no utility-side pressure drop is computed",
                uName.c_str(), ut.mechanism == "evaporation" ? "boils"
                                                             : "condenses",
                static_cast<double>(ut.T_in), static_cast<double>(mdotUtility),
                static_cast<double>(Uside.hDeclared));
            notes.push_back(nb);
        }
        else
            throw std::runtime_error(who + ": utility '" + uName + "' has"
                " mechanism '" + ut.mechanism + "', which no exchanger film"
                " describes.");
        basisFluids = "process on the " + where + " side, priced by the case's"
            " package (density on its phase route, heat capacity the"
            " derivative of its enthalpy, DILUTE-gas viscosity and"
            " conductivity from its declared transport models -- no"
            " dense-gas correction)";
    }
    else
    {
        //  ================== two process streams (an interchanger) =========
        if (designRules->found("utility"))
            throw std::runtime_error(who + ": a two-stream exchanger has no"
                " utility -- both sides are process streams.  Delete"
                " `utility`.");
        if (dg->found("utilitySideFilm") || dg->found("processSide"))
            throw std::runtime_error(who + ": `utilitySideFilm` /"
                " `processSide` belong to a one-stream design; a two-stream"
                " exchanger names the stream in its tubes: `tubeStream"
                " <inlet>;`.");
        const std::string tubeName = dg->lookupWord("tubeStream");
        int ti = -1;
        for (std::size_t i = 0; i < 2; ++i)
            if (fu->ins[i] == tubeName) ti = static_cast<int>(i);
        if (ti < 0)
            throw std::runtime_error(who + ": `tubeStream " + tubeName + ";`"
                " names neither inlet ('" + fu->ins[0] + "', '" + fu->ins[1]
                + "').");
        const ProcessStream& i0 = streamOf(fu->ins[0]);
        const ProcessStream& o0 = streamOf(fu->outs[0]);
        const ProcessStream& i1 = streamOf(fu->ins[1]);
        const ProcessStream& o1 = streamOf(fu->outs[1]);
        const bool hot0 = (i0.T >= i1.T);
        const ProcessStream& hi = hot0 ? i0 : i1;
        const ProcessStream& ho = hot0 ? o0 : o1;
        const ProcessStream& ci = hot0 ? i1 : i0;
        const ProcessStream& co = hot0 ? o1 : o0;
        Thi = hi.T; Tho = ho.T; tci = ci.T; tco = co.T;
        const scalar dT1 = Thi - tco, dT2 = Tho - tci;
        if (dT1 <= 0.0 || dT2 <= 0.0)
            throw std::runtime_error(who + ": the unit's own terminal"
                " temperatures cross for a counter-current exchanger (hot "
                + std::to_string(Thi) + " -> " + std::to_string(Tho)
                + " K, cold " + std::to_string(tci) + " -> "
                + std::to_string(tco) + " K).");
        LMTD = counterCurrentLMTD(dT1, dT2);
        const ProcessSide hs = processSide(tp, hi, ho, true,  "hot side",  who);
        const ProcessSide cs = processSide(tp, ci, co, false, "cold side", who);
        if (hs.condensing)
            throw std::runtime_error(who + ": the hot side condenses; the"
                " two-stream design route is single-phase only.");
        const bool hotInTubes = ((ti == 0) == hot0);
        Side& H = hotInTubes ? tube : shell;
        Side& C = hotInTubes ? shell : tube;
        H.name = "hot " + hi.name;  C.name = "cold " + ci.name;
        H.film = H.hydraulic = price(tp, hs.film, false, who);
        C.film = C.hydraulic = price(tp, cs.film, true,  who);
        H.Tprops = hs.film.T;  C.Tprops = cs.film.T;
        requireCorr(tube,  "tubeSide");
        requireCorr(shell, "shellSide");
        notes.push_back(hs.note);
        notes.push_back(cs.note);
        {
            const std::size_t h = hot0 ? 0 : 1, c = 1 - h;
            ExchangerSide& XH = hotInTubes ? xTube : xShell;
            ExchangerSide& XC = hotInTubes ? xShell : xTube;
            XH.role = "hot";   XH.inlet = fu->ins[h];  XH.outlet = fu->outs[h];
            XH.regime = hs.film.vapour ? "gas" : "liquid";
            XC.role = "cold";  XC.inlet = fu->ins[c];  XC.outlet = fu->outs[c];
            XC.regime = cs.condensing ? "condensing"
                      : (cs.film.vapour ? "gas" : "liquid");
        }
        basisFluids = tubeName + " in the tubes; both streams priced by the"
            " case's package (density on its phase route, heat capacity the"
            " derivative of its enthalpy, DILUTE-gas viscosity and"
            " conductivity from its declared transport models -- no"
            " dense-gas correction)";
        //  THE UNIT'S OWN RATING, published BESIDE the design and not
        //  replacing it: the flowsheet's answer was formed on these.
        auto kIt = result.kpis.find(unitName);
        if (kIt != result.kpis.end())
        {
            if (kIt->second.count("area")) A_rated = kIt->second.at("area");
            if (kIt->second.count("U"))    U_rated = kIt->second.at("U");
        }
    }

    //  ---- the LMTD correction ----------------------------------------------
    shellTubeDesign::LmtdCorrection Fc;
    if (b.passes >= 2)
    {
        Fc = shellTubeDesign::oneTwoCorrection(Thi, Tho, tci, tco);
        if (!Fc.feasible)
            throw std::runtime_error(who + ": one shell with " + std::to_string(
                b.passes) + " tube passes cannot deliver these terminal"
                " temperatures (hot " + std::to_string(Thi) + " -> "
                + std::to_string(Tho) + " K, cold " + std::to_string(tci)
                + " -> " + std::to_string(tco) + " K): the 1-2 correction F"
                " has no value (a temperature cross inside the shell).  Declare"
                " `tubePasses 1;` (a single pass, counter-current, F = 1),"
                " with `shellsInSeries <n>;` if one shell is too long.");
    }
    const scalar F = Fc.F;

    //  ---- the design search -------------------------------------------------
    struct Eval
    {
        int N = 0;
        scalar Ds = 0, B = 0, h_t = 0, h_s = 0, A = 0;
        TubeSideState  t;
        ShellSideState s;
        Resistances    r;
    };
    auto evaluate = [&](int N) -> Eval
    {
        Eval e;
        e.N  = N;
        e.Ds = shellTubeDesign::shellFromTubes(b, N);
        e.B  = baffleRatio * e.Ds;
        if (tube.declaredFilm) e.h_t = tube.hDeclared;
        else
        {
            e.t = shellTubeDesign::tubeSide(b, N, tube.film, *tube.corr);
            e.h_t = e.t.film.h;
        }
        if (shell.declaredFilm) e.h_s = shell.hDeclared;
        else
        {
            e.s = shellTubeDesign::shellSide(b, e.Ds, e.B, shell.film, *shell.corr);
            e.h_s = e.s.film.h;
        }
        e.r = shellTubeDesign::overall(b, e.h_t, e.h_s, RfTube, RfShell);
        e.A = nShells * shellTubeDesign::outsideArea(b, N);   // all shells
        return e;
    };
    auto delivered = [&](int perPass) -> scalar
    {
        const Eval e = evaluate(perPass * b.passes);
        return e.r.U * F * LMTD * e.A;                           // W
    };
    const int perPass = shellTubeDesign::smallestCount(delivered, Qw);
    if (!(delivered(perPass) >= Qw))
        throw std::runtime_error(who + ": no bundle of up to "
            + std::to_string(perPass * b.passes) + " tubes delivers the duty"
              " -- the declared geometry cannot serve it.");
    const Eval e = evaluate(perPass * b.passes);
    const scalar U = e.r.U;
    const scalar A_required = Qw / (U * F * LMTD);
    const scalar overdesign = e.A / A_required - 1.0;

    //  ---- pressure drops (on each side's HYDRAULIC state) ------------------
    //  Per shell from the kernel, times the number of shells in series.
    bool haveTubeDP = false, haveShellDP = false;
    shellTubeDesign::TubePressureDrop  tdp;
    shellTubeDesign::ShellPressureDrop sdp;
    scalar ReTubeHyd = 0.0, ReShellHyd = 0.0;
    if (!tube.declaredFilm)
    {
        const TubeSideState th = shellTubeDesign::tubeSide(
            b, e.N, tube.hydraulic, *tube.corr);
        tdp = shellTubeDesign::tubePressureDrop(b, tube.hydraulic.rho, th.u,
                                                th.film.Re);
        tdp.dP *= nShells;
        ReTubeHyd = th.film.Re;
        haveTubeDP = true;
    }
    if (!shell.declaredFilm)
    {
        const ShellSideState sh = shellTubeDesign::shellSide(
            b, e.Ds, e.B, shell.hydraulic, *shell.corr);
        sdp = shellTubeDesign::shellPressureDrop(b, e.Ds, e.B,
                  shell.hydraulic.rho, sh.G, sh.D_e, sh.film.Re);
        sdp.dP *= nShells;
        ReShellHyd = sh.film.Re;
        haveShellDP = true;
    }

    //  ---- validity: announced on the console, the caveat block and the
    //  sheet's basis; never refused (the posture of every correlation here).
    std::vector<std::string> warnings;
    auto warn = [&](const std::string& m)
    {
        warnings.push_back(m);
        AdvisoryLog::instance().add("design", "warning",
            "sizing '" + unitName + "'", m);
        std::cout << "  [validity] shellTubeHX '" << unitName << "': " << m
                  << "\n";
    };
    auto fmt = [](const char* f, double v)
    { char b2[256]; std::snprintf(b2, sizeof(b2), f, v); return std::string(b2); };
    if (!tube.declaredFilm && !e.t.film.inValidity)
        warn("tube-side " + tube.corr->type() + " outside its window ("
             + tube.corr->validityWindow() + "): " + e.t.film.validityNote
             + fmt(", Re = %.0f", e.t.film.Re));
    if (!shell.declaredFilm && !e.s.film.inValidity)
        warn("shell-side " + shell.corr->type() + " outside its window ("
             + shell.corr->validityWindow() + "): " + e.s.film.validityNote
             + fmt(", Re = %.0f", e.s.film.Re));
    if (haveTubeDP && !tdp.inValidity)
        warn("tube-side friction factor 0.079 Re^-0.25 used outside its stated"
             " window Re 4e3-1e5" + fmt(" (Re = %.0f)", ReTubeHyd));
    if (haveShellDP && !sdp.inValidity)
        warn("shell-side Kern friction factor used outside its stated window"
             " Re 400-1e6" + fmt(" (Re = %.0f)", ReShellHyd));
    if (F < 0.75)
        warn(fmt("LMTD correction F = %.3f is below 0.75, the customary floor"
                 " for one shell; more shells in series would be designed", F));
    if (baffleRatio < 0.2 || baffleRatio > 1.0)
        warn(fmt("baffle spacing %.2f x the shell ID is outside the customary"
                 " 0.2-1.0 range", baffleRatio));
    if (condensing)
        AdvisoryLog::instance().add("design", "info", "sizing '" + unitName + "'",
            "a condensing duty designed on the gas film of the vapour that"
            " leaves (the condensate film is not credited): the area is on the"
            " safe side, and the pressure drop is a single-phase estimate");

    //  ---- the record ---------------------------------------------------------
    std::ostringstream basis;
    basis << "Kern shell-and-tube DESIGN (" << nShells
          << (nShells == 1 ? " shell, " : " shells in counter-current series, ")
          << b.passes
          << " tube pass" << (b.passes == 1 ? "" : "es") << ", " << pattern
          << " pitch): the smallest N with U F LMTD n_shells pi d_o L N >= |Q|, U on"
             " the outside area from the " << (tube.declaredFilm
                 ? std::string("DECLARED") : tube.corr->type())
          << " tube film, the " << (shell.declaredFilm
                 ? std::string("DECLARED") : shell.corr->type())
          << " shell film, the wall and the DECLARED fouling; "
          << (b.passes < 2 ? "F = 1 (one tube pass, counter-current)"
              : (Fc.R == 0.0 && Fc.S == 0.0)
                ? "F = 1 (one side is isothermal, so the 1-2 arrangement"
                  " costs nothing)"
                : "F of one 1-2 shell (Bowman-Mueller-Nagle 1940)")
          << "; shell ID = Sinnott bundle + "
          << shellTubeDesign::shellClearance * 1000.0
          << " mm; Kern pressure drops; " << basisFluids;
    for (const auto& n : notes) basis << "; " << n;
    if (A_rated > 0.0)
        basis << "; COSTED on the DESIGNED area A, not on the unit's own rated"
                 " A_rated: the design delivers the same duty the flowsheet"
                 " converged on, on computed films and declared fouling, while"
                 " A_rated rests on an author-set U the design does not confirm";
    if (nShells > 1)
        basis << "; the " << nShells << " shells are COSTED as ONE item at"
                 " their total area (the cost correlation is per item; " << nShells
              << " separate shells of A/" << nShells << " each would cost more)";
    for (const auto& w : warnings) basis << "; WARNING: " << w;

    const scalar pressureDesign = designRules->lookupScalar("pressureDesign");
    EquipmentSizing d = exchangerRecord(unitName, Q_kW, U, LMTD, e.A,
                                        pressureDesign, material, basis.str());
    //  the bundle
    d.set("tubeOD",         b.tubeOD,          "m");
    d.set("tubeID",         b.tubeID,          "m");
    d.set("tubeLength",     b.tubeLength,      "m");
    d.set("tubePitch",      b.pitch,           "m");
    d.set("tubePasses",     b.passes,          "-");
    d.set("nTubes",         e.N,               "-");
    d.set("tubesPerPass",   perPass,           "-");
    d.set("shellID",        e.Ds,              "m");
    d.set("shellClearance", shellTubeDesign::shellClearance, "m");
    d.set("baffleSpacing",  e.B,               "m");
    if (haveShellDP) d.set("nBaffles", sdp.nBaffles, "-");
    else d.set("nBaffles", std::max(0, static_cast<int>(
                   std::round(b.tubeLength / e.B)) - 1), "-");
    d.set("wallK",          b.wallK,           "W/m/K");
    //  the films
    d.set("mdot_tube",      tube.declaredFilm ? mdotUtility : tube.film.mdot, "kg/s");
    d.set("T_tube_props",   tube.Tprops,       "K");
    d.set("h_tube",         e.h_t,             "W/m2/K");
    if (!tube.declaredFilm)
    {
        d.set("u_tube",  e.t.u,        "m/s");
        d.set("Re_tube", e.t.film.Re,  "-");
        d.set("Pr_tube", e.t.film.Pr,  "-");
        d.set("Nu_tube", e.t.film.Nu,  "-");
    }
    d.set("mdot_shell",     shell.declaredFilm ? mdotUtility : shell.film.mdot, "kg/s");
    d.set("T_shell_props",  shell.Tprops,      "K");
    d.set("h_shell",        e.h_s,             "W/m2/K");
    if (!shell.declaredFilm)
    {
        d.set("u_shell",  e.s.u,       "m/s");
        d.set("Re_shell", e.s.film.Re, "-");
        d.set("Pr_shell", e.s.film.Pr, "-");
        d.set("Nu_shell", e.s.film.Nu, "-");
        d.set("D_e",      e.s.D_e,     "m");
    }
    //  the resistances, all on the OUTSIDE area (1/U is their sum)
    d.set("R_film_tube",    e.r.R_inner,       "m2.K/W");
    d.set("R_wall",         e.r.R_wall,        "m2.K/W");
    d.set("R_film_shell",   e.r.R_outer,       "m2.K/W");
    d.set("R_foul_tube",    RfTube,            "m2.K/W");   // on the inside area, as declared
    d.set("R_foul_shell",   RfShell,           "m2.K/W");
    d.set("U_clean",        e.r.U_clean,       "W/m2/K");
    d.set("F",              F,                 "-");
    d.set("shellsInSeries", nShells,           "-");
    d.set("A_required",     A_required,        "m2");
    d.set("overdesign",     overdesign,        "-");
    if (mdotUtility >= 0.0) d.set("mdot_utility", mdotUtility, "kg/s");
    if (haveTubeDP)  d.set("dP_tube",  tdp.dP / 1000.0, "kPa");
    if (haveShellDP) d.set("dP_shell", sdp.dP / 1000.0, "kPa");
    if (A_rated > 0.0) d.set("A_rated", A_rated, "m2");
    if (U_rated > 0.0) d.set("U_rated", U_rated, "W/m2/K");

    //  ---- what flows where, and who chose each key (C51) -----------------
    //  The sheet's `exchanger {}` block: the decisions above, stated as data
    //  so a datasheet draws them instead of parsing the basis.
    auto filmOf = [](ExchangerSide& x, const Side& s)
    {
        x.film = s.declaredFilm ? "declared" : "computed";
        if (!s.declaredFilm && s.corr) x.correlation = s.corr->type();
    };
    filmOf(xTube, tube);
    filmOf(xShell, shell);
    d.exchanger.tube        = xTube;
    d.exchanger.shell       = xShell;
    d.exchanger.tubePattern = pattern;
    d.exchanger.controlling = e.r.controlling;
    d.exchanger.declared = { "tubeOD", "tubeID", "tubeLength", "tubePitch",
                             "tubePasses", "R_foul_tube", "R_foul_shell",
                             "pressureDesign" };
    if (dg->found("shellsInSeries"))
        d.exchanger.declared.push_back("shellsInSeries");
    if (tube.declaredFilm)  d.exchanger.declared.push_back("h_tube");
    if (shell.declaredFilm) d.exchanger.declared.push_back("h_shell");
    d.exchanger.fromRecord = { "wallK" };
    if (A_rated > 0.0) d.exchanger.fromUnit.push_back("A_rated");
    if (U_rated > 0.0) d.exchanger.fromUnit.push_back("U_rated");

    char line[560];
    std::snprintf(line, sizeof(line),
        "  [design] shellTubeHX '%s': %d shell(s) of %d tubes (%d x %d passes), shell ID"
        " %.3f m, h_tube %.0f, h_shell %.0f, U %.1f W/m2/K (clean %.1f),"
        " F %.3f, LMTD %.2f K -> A required %.1f m2, installed %.1f m2"
        " (+%.1f %%)%s\n",
        unitName.c_str(), nShells, e.N, perPass, b.passes, static_cast<double>(e.Ds),
        static_cast<double>(e.h_t), static_cast<double>(e.h_s),
        static_cast<double>(U), static_cast<double>(e.r.U_clean),
        static_cast<double>(F), static_cast<double>(LMTD),
        static_cast<double>(A_required), static_cast<double>(e.A),
        static_cast<double>(100.0 * overdesign),
        condensing ? "  [condensing: gas-film basis]" : "");
    std::cout << line;
    return { d };
}

} // namespace design
} // namespace

} // namespace Choupo
