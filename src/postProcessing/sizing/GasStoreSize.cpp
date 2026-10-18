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
#include "StorageLink.H"
#include "VesselMechanics.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"
#include "thermo/PricedDensity.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "unitOperations/saturation/BubblePoint.H"

#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <vector>

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


//  ---- THE VESSEL BANK: ONE HOME FOR BOTH PRESSURE STORES ------------------
//
//  A gas buffer (C89) and a pressurised liquid store (C92) differ in HOW MUCH
//  vessel they need -- a pressure swing against a hold time and a fill
//  fraction -- and in nothing after that: N equal vessels of at most
//  maxVesselVolume, each a cylinder of L/D with its wall at the design
//  pressure read as gauge, rated by `materialLimits`, and COSTED BY ITS
//  STEEL MASS.  That second half was written once, for the gas store, and
//  is shared here rather than copied the day a second store needed it.
struct Bank
{
    EquipmentSizing proto;          // unit, kind, material, stream, cost words
    int    nV             = 1;
    scalar V_total        = 0.0;    // m3
    scalar Vmax           = 0.0;    // m3
    scalar V_each         = 0.0;    // m3
    scalar L_over_D       = 0.0;
    scalar pressureDesign = 0.0;    // bar g
    scalar D              = 0.0;    // m
    scalar H              = 0.0;    // m
    vesselMechanics::Wall mech;
};

Bank vesselBank(const std::string& name, const std::string& who,
                const std::string& stream, scalar V_total, scalar Vmax,
                scalar P_design_abs, const Material& material,
                const DictPtr& entry)
{
    Bank b;
    b.V_total = V_total;
    b.Vmax    = Vmax;
    const int N = static_cast<int>(std::ceil(V_total / Vmax - 1.0e-9));
    b.nV      = N < 1 ? 1 : N;
    b.V_each  = V_total / b.nV;

    //  THE VESSEL: one record per vessel, its constants from the ONE home
    //  the process vessel uses (announced when the entry omits them).
    if (material.sigma_y <= 0.0)
        throw std::runtime_error(who + ": material '" + material.name
            + "' has no sigma_y defined -- a pressure vessel's wall cannot be"
              " computed without an allowable stress.");
    EquipmentSizing& proto = b.proto;
    proto.unitName      = name;
    proto.equipmentType = "vessel";
    proto.material      = material.name;
    proto.stream        = stream;
    //  COSTED BY ITS STEEL MASS (Vitor's ruling on C89, 2026-10-18): the
    //  word tells the costing model which shape prices this vessel, and it
    //  is set whether or not a price is declared -- so a missing price is
    //  REFUSED there (the item stays sized, the total reads INCOMPLETE) and
    //  never falls back to the Turton vessel set.  The price and its reason
    //  are the CASE's: carried, never defaulted.
    proto.costWords["costBasis"] = "steelMass";
    if (entry->found("steelPrice"))
        proto.costInputs["steelPrice"] = entry->lookupScalar("steelPrice");
    if (entry->found("steelPriceReason"))
        proto.costWords["steelPriceReason"] = entry->lookupWord("steelPriceReason");
    b.L_over_D = designDefault::valueOr(
        entry, designDefault::vesselLoverD, "vessel", name, proto);
    const scalar corrosionAllow = designDefault::valueOr(
        entry, designDefault::corrosionAllow, "vessel", name, proto);
    const scalar jointEff = designDefault::valueOr(
        entry, designDefault::jointEfficiency, "vessel", name, proto);

    //  The design pressure, read as GAUGE (DEV.md 4c C86).
    b.pressureDesign = (P_design_abs - atmosphere_Pa) * 1.0e-5;     // bar g
    const scalar sigma_bar = material.sigma_y * 10.0;
    if (!(2.0 * sigma_bar * jointEff - 1.2 * b.pressureDesign > 0.0))
        throw std::runtime_error(who + ": material '" + material.name
            + "' (sigma_y " + fmt("%.6g", material.sigma_y) + " MPa) cannot"
              " contain " + fmt("%.6g", b.pressureDesign) + " bar g -- the ASME"
              " thin-wall denominator is non-positive.  Lower the design"
              " pressure or pick a stronger material.");
    materialLimits::pressure("vessel '" + name + "'", material, b.pressureDesign);

    b.D    = std::cbrt(4.0 * b.V_each / (constant::pi * b.L_over_D));  // m
    b.H    = b.L_over_D * b.D;                                         // m
    b.mech = vesselMechanics::wall(b.D, b.H, b.pressureDesign, material,
                                   jointEff, corrosionAllow);
    return b;
}

//  Vessel k of the bank, carrying the values every pressure-store vessel
//  publishes; the caller adds its own design basis and what it holds.
EquipmentSizing bankVessel(const Bank& b, int k, const std::string& basis)
{
    EquipmentSizing it = b.proto;
    it.equipmentTag = "vessel" + std::to_string(k);
    it.basis        = basis;
    it.set("V_R",             b.V_each,         "m3");
    it.set("D",               b.D,              "m");
    it.set("H",               b.H,              "m");
    it.set("L_over_D",        b.L_over_D,       "-");
    it.set("t_wall",          b.mech.t_wall,    "m");
    //  The thin-wall measure: the wall over the shell's radius.  The
    //  wall formula assumes t << R; this says how far from that it is.
    it.set("t_over_R",        b.mech.t_wall / (0.5 * b.D), "-");
    //  The CYLINDRICAL SHELL's steel, rho pi D H t: no heads, nozzles,
    //  supports or internals -- the mass the declared price multiplies.
    it.set("weight",          b.mech.weight,    "kg");
    it.set("pressureDesign",  b.pressureDesign, "bar");
    it.set("nVessels",        b.nV,             "-");
    it.set("V_total",         b.V_total,        "m3");
    it.set("maxVesselVolume", b.Vmax,           "m3");
    return it;
}

//  A storageTank unit's hold time, read by a linked pressure store, and the
//  sentence that says so -- one line, both stores.
void printLinked(const std::string& kind, const std::string& name,
                 const std::string& unit, const std::string& what)
{
    std::cout << "  [basis] " << kind << " '" << name << "': " << what
              << " those of the storageTank unit '" << unit << "' (its KPIs"
                 " and its inlet) -- declared once, on the unit\n";
}

} // anonymous namespace

std::vector<EquipmentSizing> GasStoreSize::size(const std::string& name,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          entry) const
{
    const std::string who = "gas store '" + name + "'";

    //  TWO ROUTES, the storage tank's (DEV.md 4c C87, extended by C92): a
    //  store LINKED to the flowsheet `storageTank` unit that holds its
    //  stream reads the unit's inlet and residence time (`unit <name>;`,
    //  one home for the hold time); an UNLINKED store declares both.
    std::string stream, reason, linkedUnit;
    scalar      t_s = 0.0;
    scalar      unitVesselVolume = 0.0;
    if (entry->found("unit"))
    {
        const std::string u = entry->lookupWord("unit");
        const std::vector<storageLink::Owned> owned = {
            { "autonomy", "the hold time has ONE home, the unit's `operation"
                " { residenceTime; }` in system/flowsheetDict, and the store is"
                " sized on the residence time the unit publishes.  Delete"
                " `autonomy` from this entry; to change the hold time, change"
                " the unit's `residenceTime`." },
            { "stream",   "the stream a linked store buffers is the unit's own"
                " inlet.  Delete `stream` from this entry." },
            { "name",     "the items of a linked entry ARE the unit's (" + u
                + "/vessel1, ...).  Delete `name` from this entry." },
        };
        const storageLink::Link link = storageLink::resolve(entry, result,
            who, "store", "(stream; autonomy; reason)", owned);
        linkedUnit       = link.unit;
        stream           = link.stream;
        t_s              = link.residenceTime_s;
        unitVesselVolume = link.vesselVolume;
        reason           = entry->lookupWordOrDefault("reason", "");
    }
    else
        storageLink::refuseUnlinkedNamesake(name, result, who,
            "`stream` and `autonomy`", "the store is then sized on the unit's"
            " own inlet and residence time");

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
                " chooses.  (A store that a flowsheet `storageTank` unit"
                " holds is linked with `unit <name>;` instead, and reads the"
                " unit's stream and residence time.)");
    };
    if (linkedUnit.empty())
        for (const char* k : { "stream", "autonomy", "reason" })
            need(k);
    for (const char* k : { "maxPressure", "minPressure", "temperature",
                           "maxVesselVolume" })
        need(k);

    //  THE UNIT IS REQUIRED where a bare number would be SI and silently
    //  wrong: `2` would be two SECONDS of autonomy, `100` one hundred PASCAL.
    for (const char* k : { "autonomy", "maxPressure", "minPressure",
                           "temperature" })
        if (entry->found(k) && !entry->hasDimensions(k))
            throw std::runtime_error(who + ": `" + std::string(k) + "` carries"
                " no unit.  A bare number is read in SI by the dict grammar"
                " (seconds, pascal, kelvin), so write it: `autonomy 2 h;`,"
                " `maxPressure 100 bar;`, `temperature 313.15 K;`.");

    if (linkedUnit.empty())
    {
        stream = entry->lookupWord("stream");
        reason = entry->lookupWord("reason");
        t_s    = entry->lookupScalar("autonomy", Dims::time);           // s
    }
    const scalar Pmax = entry->lookupScalar("maxPressure", Dims::pressure); // Pa
    const scalar Pmin = entry->lookupScalar("minPressure", Dims::pressure); // Pa
    const scalar T    = entry->lookupScalar("temperature", Dims::temperature); // K
    const scalar Vmax = entry->lookupScalar("maxVesselVolume", Dims::volume);  // m3
    if (linkedUnit.empty() && reason.empty())
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

    //  THE VESSELS, from the one home both pressure stores share; maxPressure
    //  IS the design pressure (no margin is added above the declared ceiling).
    const Bank bk = vesselBank(name, who, stream, V_total, Vmax, Pmax,
                               material, entry);
    const int    nV     = bk.nV;
    const scalar V_each = bk.V_each;

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
        static_cast<double>(V_each), static_cast<double>(bk.D),
        static_cast<double>(bk.H), static_cast<double>(bk.mech.t_wall * 1000.0),
        static_cast<double>(bk.pressureDesign));
    std::cout << line;
    if (!linkedUnit.empty())
    {
        printLinked("gas store", name, linkedUnit,
                    "the autonomy (its residenceTime_s) and the stream are");
        //  THE UNIT'S OWN VOLUME IS NOT THE STORE'S, and the difference is
        //  the lesson: the unit holds its residence time of gas AT THE LINE
        //  STATE, and a vessel kept at the line's pressure can give none of
        //  it back without falling below the line.  The store is sized on
        //  the pressure swing instead.
        std::cout << "  [basis] gas store '" << name << "': the storageTank"
                     " unit's own vesselVolume_m3 (" << fmt("%.6g",
                     unitVesselVolume) << " m3) holds the gas at the line"
                     " state, " << fmt("%.6g", d.P * 1.0e-5) << " bar -- a"
                     " volume that gives back nothing without falling below"
                     " the line; the store is sized on the swing between"
                     " maxPressure and minPressure instead\n";
    }
    std::cout << "        reason (autonomy): "
              << (reason.empty() ? std::string("(none declared here: the hold"
                  " time is the storageTank unit's residenceTime, in"
                  " system/flowsheetDict)") : reason) << "\n";
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
            + (linkedUnit.empty()
               ? " h of autonomy are a DESIGN ASSUMPTION, not derived from a"
                 " renewable-power profile"
               : " h of autonomy (the storageTank unit's residenceTime) are a"
                 " DESIGN ASSUMPTION, not derived from any upset or"
                 " supply-interruption study");
        AdvisoryLog::instance().add("costing", "warning", who, m);
        std::cout << "  [not included] " << who << ": " << m << "\n";
    }

    const std::string basis = linkedUnit.empty()
        ? std::string(
        "gas store V = autonomy x mdot / (rho(maxPressure, T) -"
        " rho(minPressure, T)), rho from the case's package (vapour), split"
        " into equal standing vessels of at most maxVesselVolume; wall at"
        " maxPressure as gauge; costed BY ITS SHELL STEEL MASS (the"
        " cylindrical shell only: no heads, nozzles or supports) x a"
        " declared installed price per kg, the Turton vessel set printed"
        " beside it as a comparison -- NOT included: the charging compressor"
        " and its power; the autonomy is a design assumption, not derived"
        " from a renewable-power profile")
        : "gas store V = autonomy x mdot / (rho(maxPressure, T) -"
          " rho(minPressure, T)), the autonomy and the stream read from the"
          " storageTank unit '" + linkedUnit + "', rho from the case's package"
          " (vapour), split into equal standing vessels of at most"
          " maxVesselVolume; wall at maxPressure as gauge; costed BY ITS SHELL"
          " STEEL MASS (the cylindrical shell only: no heads, nozzles or"
          " supports) x a declared installed price per kg, the Turton vessel"
          " set printed beside it as a comparison -- NOT included: the"
          " charging compressor and its power; the autonomy is a design"
          " assumption";

    std::vector<EquipmentSizing> items;
    for (int k = 1; k <= nV; ++k)
    {
        EquipmentSizing it = bankVessel(bk, k, basis);
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


//  ---- A PRESSURISED LIQUID STORE (DEV.md 4c C92) ---------------------------

std::vector<EquipmentSizing> LiquefiedGasStoreSize::size(
    const std::string&      name,
    const SimulationResult& result,
    const Material&         material,
    const DictPtr&          entry) const
{
    const std::string who = "liquefied gas store '" + name + "'";

    //  TWO ROUTES, the storage tank's: LINKED to the flowsheet storageTank
    //  unit that holds the stream (its inlet, residence time and fill
    //  fraction, one home -- C87), or UNLINKED (the entry declares them).
    std::string stream, linkedUnit;
    scalar      t_s = 0.0, fill = 0.0;
    if (entry->found("unit"))
    {
        const std::string u = entry->lookupWord("unit");
        const std::vector<storageLink::Owned> owned = {
            { "storageTime",  "the hold time has ONE home, the unit's `operation"
                " { residenceTime; }` in system/flowsheetDict, and the store is"
                " sized on the residence time the unit publishes.  Delete"
                " `storageTime` from this entry; to change the stock, change the"
                " unit's `residenceTime`." },
            { "fillFraction", "the working level has ONE home, the unit's"
                " `operation { fillFraction; }` in system/flowsheetDict (its"
                " holdup is computed with it), and the store is sized on the"
                " fill fraction the unit publishes.  Delete `fillFraction` from"
                " this entry; to change it, change the unit's." },
            { "stream",       "the stream a linked store holds is the unit's own"
                " inlet.  Delete `stream` from this entry." },
            { "name",         "the items of a linked entry ARE the unit's (" + u
                + "/vessel1, ...).  Delete `name` from this entry." },
        };
        const storageLink::Link link = storageLink::resolve(entry, result,
            who, "store", "(stream; storageTime; fillFraction)", owned);
        linkedUnit = link.unit;
        stream     = link.stream;
        t_s        = link.residenceTime_s;
        fill       = link.fillFraction;
    }
    else
        storageLink::refuseUnlinkedNamesake(name, result, who,
            "`stream`, `storageTime` and `fillFraction`", "the store is then"
            " sized on the unit's own inlet, residence time and fill fraction");

    auto need = [&](const char* key)
    {
        if (!entry->found(key))
            throw std::runtime_error(who + ": `" + key + "` is not declared."
                "  A pressurised liquid store is sized from these declarations"
                " and the stream's own state:\n"
                "      stream <name>;  storageTime <n> day;  fillFraction"
                " <0..1>;  designPressure <p> bar;  temperature <T> K;\n"
                "      reason \"...\";  maxVesselVolume <m3>;  material"
                " <record>;\n"
                "  None has a default -- each is a design basis somebody"
                " chooses.  (A store that a flowsheet `storageTank` unit"
                " holds is linked with `unit <name>;` instead, and reads the"
                " unit's stream, residence time and fill fraction.)");
    };
    if (linkedUnit.empty())
        for (const char* k : { "stream", "storageTime", "fillFraction" })
            need(k);
    for (const char* k : { "designPressure", "temperature", "reason",
                           "maxVesselVolume" })
        need(k);
    //  THE UNIT IS REQUIRED where a bare number would be SI and silently
    //  wrong: `48` would be 48 SECONDS of stock, `25` twenty-five PASCAL.
    for (const char* k : { "storageTime", "designPressure", "temperature" })
        if (entry->found(k) && !entry->hasDimensions(k))
            throw std::runtime_error(who + ": `" + std::string(k) + "` carries"
                " no unit.  A bare number is read in SI by the dict grammar"
                " (seconds, pascal, kelvin), so write it: `storageTime 2 day;`,"
                " `designPressure 25 bar;`, `temperature 250 K;`.");
    if (linkedUnit.empty())
    {
        stream = entry->lookupWord("stream");
        t_s    = entry->lookupScalar("storageTime", Dims::time);         // s
        fill   = entry->lookupScalar("fillFraction");
    }
    const scalar Pd   = entry->lookupScalar("designPressure", Dims::pressure); // Pa abs
    const scalar T    = entry->lookupScalar("temperature", Dims::temperature); // K
    const scalar Vmax = entry->lookupScalar("maxVesselVolume", Dims::volume);  // m3
    const std::string reason = entry->lookupWord("reason");
    if (reason.empty())
        throw std::runtime_error(who + ": `reason` is empty.  The design"
            " pressure and the storage temperature are design choices; say"
            " why these.");
    if (!(t_s > 0.0))
        throw std::runtime_error(who + ": the storage time must be positive.");
    if (!(fill > 0.0 && fill <= 1.0))
        throw std::runtime_error(who + ": `fillFraction` is the working"
            " liquid level as a fraction of the vessel volume, in (0, 1].");
    if (!(T > 0.0))
        throw std::runtime_error(who + ": `temperature` must be positive.");
    if (!(Vmax > 0.0))
        throw std::runtime_error(who + ": `maxVesselVolume` must be positive.");
    if (!(Pd > atmosphere_Pa))
        throw std::runtime_error(who + ": `designPressure` ("
            + fmt("%.6g", Pd * 1.0e-5) + " bar) is ABSOLUTE and must lie above"
              " the atmosphere -- a liquid that needs no pressure is stored in"
              " an atmospheric tank (`storage ( ... )`).");

    //  THE STREAM: the one reading every post-processing pass takes.
    const phaseDensity::Reading d = phaseDensity::of(result, stream, who);
    if (d.phase != "liquid")
        throw std::runtime_error(who + ": stream '" + stream + "' is a "
            + d.phase + ".  A pressurised liquid store holds a liquid; a gas is"
              " buffered in pressure vessels by `gasStorage ( ... )`.");
    if (!(d.massFlow > 0.0))
        throw std::runtime_error(who + ": stream '" + stream + "' carries no"
            " flow -- there is nothing to store.");

    std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
    if (!pkg)
        throw std::runtime_error(who + ": the thermophysical package could"
            " not be built for post-processing -- no density is available.");
    const ThermoPackage& tp = *pkg;
    const ProcessStream& s = result.streams.at(stream);

    //  THE LIQUID DENSITY AT THE STORAGE TEMPERATURE.  At the stream's own
    //  temperature it IS the stream's reading; at another one it is asked of
    //  the package over the same priced components, and a value that is not
    //  finite and positive REFUSES by name -- nothing is sized on a guess.
    scalar rho = d.rho;
    const bool atStreamT = std::fabs(T - d.T) <= 1.0e-6 * d.T;
    if (!atStreamT)
    {
        const pricedDensity::Selection sel =
            pricedDensity::select(tp, T, d.P, s.z, DensityPhase::Liquid);
        rho = 0.0;
        if (sel.keptFraction > 0.0)
            try { rho = tp.density(T, d.P, sel.zPriced, DensityPhase::Liquid); }
            catch (const std::exception&) { rho = 0.0; }
        const std::string m = "the liquid of stream '" + stream + "' arrives"
            " at " + fmt("%.2f", d.T) + " K and is stored at the declared "
            + fmt("%.2f", T) + " K: what warms or cools it between the two (an"
              " exchanger, or the ambient) is NOT in the flowsheet, so its"
              " duty is not priced; the liquid is sized at the storage"
              " temperature";
        AdvisoryLog::instance().add("design", "warning", who, m);
        std::cout << "  [liquefied gas store] " << who << ": " << m << "\n";
    }
    if (!std::isfinite(rho) || !(rho > 0.0))
        throw std::runtime_error(who + ": the case's package returned a"
            " liquid density of " + fmt("%.6g", rho) + " kg/m3 for stream '"
            + stream + "' at " + fmt("%.2f", T) + " K -- not a number a store"
              " can be sized on.  Nothing is substituted.");

    //  THE PRESSURE THE STORE MUST HOLD: the liquid's bubble pressure at the
    //  storage temperature, with every dissolved component it carries, on
    //  the case's own K-values (`BubblePoint::pressure`, the incipient vapour
    //  iterated).  A design pressure below it REFUSES: the liquid would boil
    //  in the vessel.
    const BubblePoint::PressureResult bub = BubblePoint::pressure(tp, s.z, T, Pd);
    if (!bub.converged)
        throw std::runtime_error(who + ": no pressure up to "
            + fmt("%.6g", bub.P * 1.0e-5) + " bar keeps stream '" + stream
            + "' a liquid at " + fmt("%.2f", T) + " K on the case's K-values --"
              " it is not a liquid to store there.");
    std::size_t j = 0;
    for (std::size_t i = 1; i < s.z.size() && i < tp.n(); ++i)
        if (s.z[i] > s.z[j]) j = i;
    const bool   hasPsat = tp.hasSaturationCurve(j);
    const scalar PsatMain = hasPsat ? tp.Psat(j, T) : 0.0;
    if (Pd < bub.P * (1.0 - pressureSlack))
        throw std::runtime_error(who + ": designPressure ("
            + fmt("%.6g", Pd * 1.0e-5) + " bar) is BELOW the bubble pressure of"
              " stream '" + stream + "' at the storage temperature "
            + fmt("%.2f", T) + " K (" + fmt("%.6g", bub.P * 1.0e-5) + " bar,"
              " on the case's own K-values): the liquid would boil in the"
              " vessel.  Raise designPressure to at least that, or store it"
              " colder.");

    const scalar V_stored = t_s * d.massFlow / rho;            // m3 of liquid
    const scalar V_total  = V_stored / fill;                   // m3 of vessel

    //  THE VESSELS, from the one home both pressure stores share, at the
    //  declared design pressure.
    const Bank bk = vesselBank(name, who, stream, V_total, Vmax, Pd,
                               material, entry);

    char line[720];
    std::snprintf(line, sizeof(line),
        "  [basis] liquefied gas store '%s': %.6g day x %.6g kg/s (stream %s)"
        " / %.6g kg/m3 at %.2f K = %.6g m3 of liquid; / fillFraction %.4g ="
        " %.6g m3; at most %.6g m3 each -> %d vessel(s) of %.6g m3, D %.4g m x"
        " L %.4g m, wall %.4g mm at %.6g bar g\n",
        name.c_str(), static_cast<double>(t_s / 86400.0),
        static_cast<double>(d.massFlow), stream.c_str(),
        static_cast<double>(rho), static_cast<double>(T),
        static_cast<double>(V_stored), static_cast<double>(fill),
        static_cast<double>(V_total), static_cast<double>(Vmax), bk.nV,
        static_cast<double>(bk.V_each), static_cast<double>(bk.D),
        static_cast<double>(bk.H), static_cast<double>(bk.mech.t_wall * 1000.0),
        static_cast<double>(bk.pressureDesign));
    std::cout << line;
    if (!linkedUnit.empty())
        printLinked("liquefied gas store", name, linkedUnit,
                    "the storage time, the fill fraction and the stream are");
    std::cout << "  [basis] liquefied gas store '" << name << "': the bubble"
                 " pressure of stream '" << stream << "' at " << fmt("%.2f", T)
              << " K is " << (bub.belowFloor ? "below " : "")
              << fmt("%.6g", bub.P * 1.0e-5) << " bar (the case's own K-values,"
                 " every dissolved component counted)";
    if (hasPsat)
        std::cout << "; " << tp.comp(j).name() << " alone would boil at "
                  << fmt("%.6g", PsatMain * 1.0e-5) << " bar";
    std::cout << " -> designPressure " << fmt("%.6g", Pd * 1.0e-5)
              << " bar (absolute) holds it\n";
    std::cout << "        reason (design pressure and temperature): "
              << reason << "\n";

    //  WHAT THIS STORE IS NOT, said on every run (console + caveat block).
    {
        const std::string m = "the store's vapour space, its pressure"
            " control and its relief are NOT in the flowsheet: no boil-off,"
            " vapour return or relief valve is sized or priced, so the"
            " store's capital is a LOWER BOUND; and its storage time and"
            " design pressure are DESIGN ASSUMPTIONS";
        AdvisoryLog::instance().add("costing", "warning", who, m);
        std::cout << "  [not included] " << who << ": " << m << "\n";
    }

    const std::string basis = std::string("pressurised liquid store V ="
        " storageTime x mdot / (rho_liquid(T) x fillFraction)")
        + (linkedUnit.empty() ? std::string()
           : ", the storage time, the fill fraction and the stream read from"
             " the storageTank unit '" + linkedUnit + "'")
        + ", rho from the case's package; designPressure (absolute) at or"
          " above the liquid's bubble pressure at T (the case's own K-values); split"
          " into equal vessels of at most maxVesselVolume, wall at"
          " designPressure as gauge; costed BY ITS SHELL STEEL MASS (the"
          " cylindrical shell only: no heads, nozzles or supports) x a"
          " declared installed price per kg, the Turton vessel set printed"
          " beside it as a comparison -- NOT included: boil-off, vapour"
          " return and relief";

    std::vector<EquipmentSizing> items;
    for (int k = 1; k <= bk.nV; ++k)
    {
        EquipmentSizing it = bankVessel(bk, k, basis);
        it.set("storageTime",  t_s / 86400.0, "day");
        it.set("fillFraction", fill,          "-");
        it.set("massFlow",     d.massFlow,    "kg/s");
        it.set("V_stored",     V_stored,      "m3");
        it.set("rho",          rho,           "kg/m3");
        it.set("T",            T,             "K");
        it.set("P_design",     Pd,            "Pa");
        it.set("P_bubble",     bub.P,         "Pa");
        if (hasPsat) it.set("Psat_main", PsatMain, "Pa");

        //  WHAT THE VESSEL HOLDS: the liquid at its working level, at its
        //  bubble pressure -- storageTime of production over the bank.
        HeldPhase h;
        h.phase    = "liquid";
        h.stream   = stream;
        h.fraction = fill;
        h.volume   = bk.V_each * fill;
        h.T        = T;
        h.P        = bub.P;
        h.rho      = rho;
        h.mass     = h.volume * rho;
        for (const auto& [c, w] : d.massFraction) h.massOf[c] = h.mass * w;
        it.inventory.phases.push_back(h);
        it.inventory.volume     = bk.V_each;
        it.inventory.volumeFrom = "sized";
        it.inventory.basis      = "a pressurised liquid store at its working"
            " level: m = V_R x fillFraction x rho(T) x w of the stored stream,"
            " i.e. storageTime of production over the vessels";
        char b[320];
        std::snprintf(b, sizeof(b),
            "  [inventory] %s/%s: liquid of stream '%s' at %.2f K: %.6g m3 x"
            " %.4g x %.2f kg/m3 = %.6g kg\n",
            name.c_str(), it.equipmentTag.c_str(), stream.c_str(),
            static_cast<double>(T), static_cast<double>(bk.V_each),
            static_cast<double>(fill), static_cast<double>(rho),
            static_cast<double>(h.mass));
        std::cout << b;
        items.push_back(std::move(it));
    }
    return items;
}

} // namespace Choupo
