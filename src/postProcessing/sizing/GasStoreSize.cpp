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

#include "GasStoreSize.H"
#include "DesignDefaults.H"
#include "MaterialLimits.H"
#include "PhaseDensity.H"
#include "VesselMechanics.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "thermo/equationOfState/EquationOfState.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>

namespace Choupo {

namespace {

//  The atmosphere a gauge pressure is measured from: 1 atm, the same
//  constant the engine's normal conditions use.
constexpr scalar atmosphere_Pa = constant::P_normal;

//  A stream this close to its declared pressure IS at it: minPressure is
//  refused only when it lies BELOW the line by more than round-off.
constexpr scalar pressureSlack = 1.0e-9;

std::string fmt(const char* f, double v)
{
    char b[64];
    std::snprintf(b, sizeof(b), f, v);
    return b;
}

} // anonymous namespace

std::vector<EquipmentSizing> GasStoreSize::size(const std::string& name,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          entry) const
{
    const std::string who = "gas store '" + name + "'";
    auto need = [&](const char* key)
    {
        if (!entry->found(key))
            throw std::runtime_error(who + ": `" + key + "` is not declared."
                "  A gas store is sized from these declarations and the"
                " stream's own state:\n"
                "      stream <name>;  autonomy <n> h;  reason \"...\";"
                "  maxPressure <p> bar;  minPressure <p> bar;\n"
                "      temperature <T> K;  maxVesselVolume <m3>;"
                "  material <record>;\n"
                "  None has a default -- each is a design basis somebody"
                " chooses.");
    };
    for (const char* k : { "stream", "autonomy", "reason", "maxPressure",
                           "minPressure", "temperature", "maxVesselVolume" })
        need(k);

    //  THE UNIT IS REQUIRED where a bare number would be SI and silently
    //  wrong: `2` would be two SECONDS of autonomy, `100` one hundred PASCAL.
    for (const char* k : { "autonomy", "maxPressure", "minPressure",
                           "temperature" })
        if (!entry->hasDimensions(k))
            throw std::runtime_error(who + ": `" + std::string(k) + "` carries"
                " no unit.  A bare number is read in SI by the dict grammar"
                " (seconds, pascal, kelvin), so write it: `autonomy 2 h;`,"
                " `maxPressure 100 bar;`, `temperature 313.15 K;`.");

    const std::string stream = entry->lookupWord("stream");
    const std::string reason = entry->lookupWord("reason");
    const scalar t_s  = entry->lookupScalar("autonomy", Dims::time);        // s
    const scalar Pmax = entry->lookupScalar("maxPressure", Dims::pressure); // Pa
    const scalar Pmin = entry->lookupScalar("minPressure", Dims::pressure); // Pa
    const scalar T    = entry->lookupScalar("temperature", Dims::temperature); // K
    const scalar Vmax = entry->lookupScalar("maxVesselVolume", Dims::volume);  // m3
    if (reason.empty())
        throw std::runtime_error(who + ": `reason` is empty.  The hours of"
            " autonomy are a design assumption; say why that many.");
    if (!(t_s > 0.0))
        throw std::runtime_error(who + ": `autonomy` must be positive.");
    if (!(T > 0.0))
        throw std::runtime_error(who + ": `temperature` must be positive.");
    if (!(Vmax > 0.0))
        throw std::runtime_error(who + ": `maxVesselVolume` must be positive.");
    if (!(Pmin > 0.0))
        throw std::runtime_error(who + ": `minPressure` must be positive.");
    if (!(Pmax > Pmin))
        throw std::runtime_error(who + ": maxPressure ("
            + fmt("%.6g", Pmax * 1.0e-5) + " bar) is not above minPressure ("
            + fmt("%.6g", Pmin * 1.0e-5) + " bar).  A buffer gives back only"
              " the gas between the two, so there would be none to give.");

    //  THE STREAM: its mass flow, its phase and its own pressure.  The ONE
    //  reading every post-processing pass takes (`phaseDensity::of`): it
    //  refuses a two-phase stream and solids by name.
    const phaseDensity::Reading d = phaseDensity::of(result, stream, who);
    if (d.phase != "vapour")
        throw std::runtime_error(who + ": stream '" + stream + "' is a "
            + d.phase + ".  A gas store holds a gas; a liquid is stored in an"
              " atmospheric tank (`storage ( ... )`).");
    if (!(d.massFlow > 0.0))
        throw std::runtime_error(who + ": stream '" + stream + "' carries no"
            " flow -- there is nothing to buffer.");
    //  THE DELIVERY CONSTRAINT.  The store gives the gas back to the line it
    //  buffers, which runs at the stream's own pressure.  Drawn down below
    //  that pressure, the gas cannot flow back into the line -- that would
    //  need a SECOND compressor, which is not modelled.  minPressure ABOVE
    //  the line is accepted: a pressure-control valve lets it down.
    if (Pmin < d.P * (1.0 - pressureSlack))
        throw std::runtime_error(who + ": minPressure ("
            + fmt("%.6g", Pmin * 1.0e-5) + " bar) is BELOW the pressure of"
              " stream '" + stream + "' (" + fmt("%.6g", d.P * 1.0e-5)
            + " bar).  The store delivers back into that line, and gas drawn"
              " down below the line's pressure cannot flow into it without a"
              " second compressor, which this store does not include.  Raise"
              " minPressure to at least the line's pressure (plus what the"
              " let-down valve needs).");

    std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
    if (!pkg)
        throw std::runtime_error(who + ": the thermophysical package could"
            " not be built for post-processing -- no density is available.");
    const ThermoPackage& tp = *pkg;
    const ProcessStream& s = result.streams.at(stream);

    //  THE DENSITY AT BOTH ENDS, on the case's own package, vapour route.
    //  A value that is not finite and positive is REFUSED by name: the
    //  package has been measured returning NaN silently on another route
    //  (DEV.md 4c C79), and an ideal gas quietly substituted here would be
    //  a buffer sized on a model the case did not choose.
    auto rhoAt = [&](scalar P, const char* end) -> scalar
    {
        scalar r = 0.0;
        try { r = tp.density(T, P, s.z, DensityPhase::Vapour); }
        catch (const std::exception& e)
        {
            throw std::runtime_error(who + ": the case's package gives no"
                " vapour density for stream '" + stream + "' at " + end + " ("
                + fmt("%.6g", P * 1.0e-5) + " bar, " + fmt("%.2f", T)
                + " K): " + e.what());
        }
        if (!std::isfinite(r) || !(r > 0.0))
            throw std::runtime_error(who + ": the case's package returned a"
                " vapour density of " + fmt("%.6g", r) + " kg/m3 for stream '"
                + stream + "' at " + end + " (" + fmt("%.6g", P * 1.0e-5)
                + " bar, " + fmt("%.2f", T) + " K) -- not a number a store can"
                  " be sized on.  No ideal-gas value is substituted.");
        return r;
    };
    const scalar rhoMax = rhoAt(Pmax, "maxPressure");
    const scalar rhoMin = rhoAt(Pmin, "minPressure");

    //  Z = P M / (rho R T), on the stream's own mean molar mass -- how far
    //  the stored gas is from ideal, published at both ends.
    scalar Mbar = 0.0, zs = 0.0;
    for (std::size_t i = 0; i < s.z.size() && i < tp.n(); ++i)
    { Mbar += s.z[i] * tp.comp(i).MW(); zs += s.z[i]; }
    Mbar = (Mbar / zs) / 1000.0;                                   // kg/mol
    const scalar Zmax = Pmax * Mbar / (rhoMax * constant::R * T);
    const scalar Zmin = Pmin * Mbar / (rhoMin * constant::R * T);
    const bool   ideal = tp.hasEos() && tp.eos().isIdeal();

    const scalar dRho = rhoMax - rhoMin;
    if (!(dRho > 0.0))
        throw std::runtime_error(who + ": the package gives rho(maxPressure) "
            + fmt("%.6g", rhoMax) + " <= rho(minPressure) " + fmt("%.6g", rhoMin)
            + " kg/m3 -- no gas is given back between the two pressures.");

    //  A STORE BELOW SOME COMPONENT'S CRITICAL TEMPERATURE may condense at
    //  maxPressure, and the vapour route does not test for it.  Said, not
    //  judged (a gas below Tc at modest pressure is still a gas).
    {
        std::string below;
        for (std::size_t i = 0; i < s.z.size() && i < tp.n(); ++i)
            if (s.z[i] > 0.0 && tp.comp(i).Tc() > T)
                below += (below.empty() ? "" : ", ") + tp.comp(i).name();
        if (!below.empty())
        {
            const std::string m = "the store is at " + fmt("%.2f", T)
                + " K, below the critical temperature of " + below + ": the"
                  " gas is priced as a single vapour at maxPressure, and"
                  " whether it condenses there is NOT checked";
            AdvisoryLog::instance().add("design", "warning", who, m);
            std::cout << "  [gas store] " << who << ": " << m << "\n";
        }
    }

    const scalar m_work  = t_s * d.massFlow;                       // kg
    const scalar V_total = m_work / dRho;                          // m3
    const int    N       = static_cast<int>(std::ceil(V_total / Vmax - 1.0e-9));
    const int    nV      = N < 1 ? 1 : N;
    const scalar V_each  = V_total / nV;

    //  THE VESSEL: one record per vessel, its constants from the ONE home
    //  the process vessel uses (announced when the entry omits them).
    if (material.sigma_y <= 0.0)
        throw std::runtime_error(who + ": material '" + material.name
            + "' has no sigma_y defined -- a pressure vessel's wall cannot be"
              " computed without an allowable stress.");
    EquipmentSizing proto;
    proto.unitName      = name;
    proto.equipmentType = "vessel";
    proto.material      = material.name;
    proto.stream        = stream;
    const scalar L_over_D = designDefault::valueOr(
        entry, designDefault::vesselLoverD, "vessel", name, proto);
    const scalar corrosionAllow = designDefault::valueOr(
        entry, designDefault::corrosionAllow, "vessel", name, proto);
    const scalar jointEff = designDefault::valueOr(
        entry, designDefault::jointEfficiency, "vessel", name, proto);

    //  maxPressure IS the design pressure, read as GAUGE (DEV.md 4c C86).
    const scalar pressureDesign = (Pmax - atmosphere_Pa) * 1.0e-5;   // bar g
    const scalar sigma_bar = material.sigma_y * 10.0;
    if (!(2.0 * sigma_bar * jointEff - 1.2 * pressureDesign > 0.0))
        throw std::runtime_error(who + ": material '" + material.name
            + "' (sigma_y " + fmt("%.6g", material.sigma_y) + " MPa) cannot"
              " contain " + fmt("%.6g", pressureDesign) + " bar g -- the ASME"
              " thin-wall denominator is non-positive.  Lower maxPressure or"
              " pick a stronger material.");
    materialLimits::pressure("vessel '" + name + "'", material, pressureDesign);

    const scalar D  = std::cbrt(4.0 * V_each / (constant::pi * L_over_D));  // m
    const scalar H  = L_over_D * D;                                         // m
    const auto mech = vesselMechanics::wall(D, H, pressureDesign, material,
                                            jointEff, corrosionAllow);

    char line[640];
    std::snprintf(line, sizeof(line),
        "  [basis] gas store '%s': %.6g h x %.6g kg/s (stream %s) = %.6g kg of"
        " working gas; rho(%.6g bar, %.2f K) - rho(%.6g bar) = %.6g - %.6g ="
        " %.6g kg/m3 (Z %.4f and %.4f, %s) -> %.6g m3; at most %.6g m3 each ->"
        " %d vessel(s) of %.6g m3, D %.4g m x H %.4g m, wall %.4g mm at %.6g"
        " bar g\n",
        name.c_str(), static_cast<double>(t_s / 3600.0),
        static_cast<double>(d.massFlow), stream.c_str(),
        static_cast<double>(m_work), static_cast<double>(Pmax * 1.0e-5),
        static_cast<double>(T), static_cast<double>(Pmin * 1.0e-5),
        static_cast<double>(rhoMax), static_cast<double>(rhoMin),
        static_cast<double>(dRho), static_cast<double>(Zmax),
        static_cast<double>(Zmin),
        ideal ? "IDEAL GAS, as the case's package declares"
              : "the case's equation of state",
        static_cast<double>(V_total), static_cast<double>(Vmax), nV,
        static_cast<double>(V_each), static_cast<double>(D),
        static_cast<double>(H), static_cast<double>(mech.t_wall * 1000.0),
        static_cast<double>(pressureDesign));
    std::cout << line;
    std::cout << "        reason (autonomy): " << reason << "\n";
    if (ideal)
    {
        const std::string m = "the buffer's two densities are IDEAL-GAS"
            " values (Z = 1) because the case's package declares an ideal"
            " gas; at " + fmt("%.6g", Pmax * 1.0e-5) + " bar a real gas may"
            " differ, and the working gas per m3 with it";
        AdvisoryLog::instance().add("design", "info", who, m);
        std::cout << "  [gas store] " << who << ": " << m << "\n";
    }

    //  WHAT THIS STORE IS NOT, said on every run (console + caveat block).
    {
        const std::string m = "the CHARGING COMPRESSOR that raises stream '"
            + stream + "' from " + fmt("%.6g", d.P * 1.0e-5) + " bar to the"
              " store's maxPressure " + fmt("%.6g", Pmax * 1.0e-5) + " bar is"
              " NOT in the flowsheet: neither the machine nor its power is"
              " sized or priced, so the buffer's capital and operating cost"
              " are LOWER BOUNDS; and the " + fmt("%.6g", t_s / 3600.0)
            + " h of autonomy are a DESIGN ASSUMPTION, not derived from a"
              " renewable-power profile";
        AdvisoryLog::instance().add("costing", "warning", who, m);
        std::cout << "  [not included] " << who << ": " << m << "\n";
    }

    const std::string basis =
        "gas store V = autonomy x mdot / (rho(maxPressure, T) -"
        " rho(minPressure, T)), rho from the case's package (vapour), split"
        " into equal standing vessels of at most maxVesselVolume; wall at"
        " maxPressure as gauge; costed as a process vessel -- NOT included:"
        " the charging compressor and its power; the autonomy is a design"
        " assumption, not derived from a renewable-power profile";

    std::vector<EquipmentSizing> items;
    for (int k = 1; k <= nV; ++k)
    {
        EquipmentSizing it = proto;
        it.equipmentTag = "vessel" + std::to_string(k);
        it.basis        = basis;
        it.set("V_R",             V_each,           "m3");
        it.set("D",               D,                "m");
        it.set("H",               H,                "m");
        it.set("L_over_D",        L_over_D,         "-");
        it.set("t_wall",          mech.t_wall,      "m");
        it.set("weight",          mech.weight,      "kg");
        it.set("pressureDesign",  pressureDesign,   "bar");
        it.set("nVessels",        nV,               "-");
        it.set("V_total",         V_total,          "m3");
        it.set("maxVesselVolume", Vmax,             "m3");
        it.set("autonomy",        t_s / 3600.0,     "h");
        it.set("massFlow",        d.massFlow,       "kg/s");
        it.set("m_working",       m_work,           "kg");
        it.set("m_full",          V_total * rhoMax, "kg");
        it.set("m_cushion",       V_total * rhoMin, "kg");
        it.set("rho_max",         rhoMax,           "kg/m3");
        it.set("rho_min",         rhoMin,           "kg/m3");
        it.set("Z_max",           Zmax,             "-");
        it.set("Z_min",           Zmin,             "-");
        it.set("P_max",           Pmax,             "Pa");
        it.set("P_min",           Pmin,             "Pa");
        it.set("T",               T,                "K");

        //  WHAT THE VESSEL HOLDS: its full charge at maxPressure -- the gas a
        //  full buffer ties up, which the working capital counts.
        HeldPhase h;
        h.phase    = "vapour";
        h.stream   = stream;
        h.fraction = 1.0;
        h.volume   = V_each;
        h.T        = T;
        h.P        = Pmax;
        h.rho      = rhoMax;
        h.mass     = V_each * rhoMax;
        for (const auto& [c, w] : d.massFraction) h.massOf[c] = h.mass * w;
        it.inventory.phases.push_back(h);
        it.inventory.volume     = V_each;
        it.inventory.volumeFrom = "sized";
        it.inventory.basis      = "a gas store full at maxPressure: m = V_R x"
            " rho(maxPressure, T) x w of the stored stream; of it, V_R x"
            " rho(minPressure, T) is cushion gas that never leaves";
        char b[320];
        std::snprintf(b, sizeof(b),
            "  [inventory] %s/%s: vapour of stream '%s' at %.6g bar, %.2f K:"
            " %.6g m3 x %.2f kg/m3 = %.6g kg (cushion %.6g kg)\n",
            name.c_str(), it.equipmentTag.c_str(), stream.c_str(),
            static_cast<double>(Pmax * 1.0e-5), static_cast<double>(T),
            static_cast<double>(V_each), static_cast<double>(rhoMax),
            static_cast<double>(h.mass), static_cast<double>(V_each * rhoMin));
        std::cout << b;
        items.push_back(std::move(it));
    }
    return items;
}

} // namespace Choupo
