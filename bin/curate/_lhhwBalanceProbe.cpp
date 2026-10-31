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
-------------------------------------------------------------------------------
Application
    _lhhwBalanceProbe  (a curation probe, not a shipped binary)

Description
    Evaluates RateLaw::netRate on rate laws written in memory, over the
    thermophysical system of a case given on the command line (the water-gas
    shift, CO + H2O <-> CO2 + H2, whose sum of nu is zero so Kc = Kp), and
    prints one JSON object.  bin/curate/check_lhhw_detailed_balance.py reads
    it.  What is evaluated, per law:

      Kc         the engine's own Reaction::equilibriumKc at T
      rf         the forward leg alone, k_f PROD abar^order / denom^p,
                 computed HERE from the declared numbers -- a scale for the
                 net rate, so a residual is judged against the leg it is a
                 difference of
      atEq       netRate at a composition with PROD c^nu = Kc
      below      netRate at PROD c^nu = Kc / 2   (must be > 0)
      above      netRate at PROD c^nu = 2 Kc     (must be < 0)
      reference  for the laws whose arithmetic must not move (no adsorption,
                 or an explicit reverse pair), the net rate recomputed HERE
                 in the engine's own order of operations, compared with ==

    The probe judges nothing; the gate does.
\*---------------------------------------------------------------------------*/

#include "core/Constants.H"
#include "core/Dictionary.H"
#include "core/distribution/SizeDistribution.H"
#include "thermo/Database.H"
#include "thermo/PropertyContext.H"
#include "thermo/ThermoAnnounce.H"
#include "thermo/ThermoPackage.H"
#include "thermo/ThermoPackageBuilder.H"
#include "thermo/SurfaceTensionModel.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "thermo/electrolyte/AqueousActivity.H"
#include "thermo/electrolyte/AqueousVolumetric.H"
#include "thermo/equationOfState/EquationOfState.H"
#include "thermo/heatCapacity/HeatCapacityModel.H"
#include "thermo/henrysLaw/HenrysLawRegistry.H"
#include "thermo/phase/Phase.H"
#include "thermo/pureFluid/PureFluidModel.H"
#include "thermo/reaction/RateLaw.H"
#include "thermo/reaction/Reaction.H"
#include "thermo/solution/SolutionRegistry.H"
#include "thermo/transport/DiffusivityModel.H"
#include "thermo/transport/LiquidConductivityModel.H"
#include "thermo/transport/LiquidDiffusivityModel.H"
#include "thermo/transport/LiquidViscosityModel.H"
#include "thermo/transport/ThermalConductivityModel.H"
#include "thermo/transport/TransportModel.H"
#include "thermo/vaporPressure/VaporPressureModel.H"

#include <cmath>
#include <cstdlib>
#include <filesystem>
#include <iostream>
#include <set>
#include <sstream>
#include <string>
#include <vector>

using namespace Choupo;
namespace fs = std::filesystem;

namespace
{

// One law under test.  `ads` is the adsorption block's species list, written
// as dict text; empty means no adsorption block (a power law).
struct Law
{
    std::string name;
    std::string type;          // Arrhenius | LHHW
    bool        reversible;    // detailed balance
    bool        explicitRev;   // A_rev / Ea_rev instead
    std::string ads;           // "{ component CO; K0 10; B 300; } ..."
    double      vacant;
    double      exponent;
    // the numbers the probe re-uses for its own forward leg / reference
    std::vector<std::pair<std::string, std::pair<double, double>>> sites;
};

const double A  = 1.0e7, Ea = 8.0e4, Arev = 3.0e6, Earev = 9.0e4;

std::string lawText(const Law& L)
{
    std::ostringstream s;
    s.precision(17);
    s << "limitingReactant CO;\n";
    if (L.reversible) s << "reversible true;\n";
    s << "stoichiometry (\n"
         "  { component CO;    nu -1; order 1; }\n"
         "  { component water; nu -1; order 1; }\n"
         "  { component CO2;   nu  1; order 0; }\n"
         "  { component H2;    nu  1; order 0; }\n);\n"
         "kinetics {\n  type " << L.type << ";\n  A " << A << ";\n  Ea " << Ea
      << ";\n";
    if (L.explicitRev) s << "  A_rev " << Arev << ";\n  Ea_rev " << Earev << ";\n";
    if (!L.ads.empty())
        s << "  adsorption {\n    exponent " << L.exponent << ";\n    vacantSite "
          << L.vacant << ";\n    species (\n" << L.ads << "\n    );\n  }\n";
    s << "}\n";
    return s.str();
}

} // namespace

int main(int argc, char** argv)
{
    if (argc != 2)
    {
        std::cerr << "usage: _lhhwBalanceProbe <caseDir>\n";
        return 2;
    }
    try
    {
        SizeDistribution::registerBuiltins();
        VaporPressureModel::registerBuiltins();
        ActivityModel::registerBuiltins();
        electrolyte::AqueousActivity::registerBuiltins();
        electrolyte::AqueousVolumetricModel::registerBuiltins();
        PureFluidModel::registerBuiltins();
        EquationOfState::registerBuiltins();
        TransportModel::registerBuiltins();
        SurfaceTensionModel::registerBuiltins();
        ThermalConductivityModel::registerBuiltins();
        DiffusivityModel::registerBuiltins();
        LiquidViscosityModel::registerBuiltins();
        LiquidConductivityModel::registerBuiltins();
        LiquidDiffusivityModel::registerBuiltins();
        HeatCapacityModel::registerBuiltins();
        Phase::registerBuiltins();

        fs::path dataRoot;
        if (const char* env = std::getenv("CHOUPO_HOME"))
            dataRoot = fs::path(env) / "data";
        fs::current_path(argv[1]);
        thermoAnnounceLevel() = 0;
        Database db(dataRoot.empty() ? "" : dataRoot.string());
        HenrysLawRegistry::loadFrom(dataRoot.string());
        SolutionRegistry::loadFrom(dataRoot.string());

        const std::string pkgPath = "constant/thermoPhysPropDict";
        auto sel = Dictionary::fromFile(pkgPath);
        ChemistrySystem chem = resolveChemistryContext(
            fs::path(pkgPath).parent_path().string());
        if (sel->found("inherits"))
        {
            std::set<std::string> visited;
            sel = resolvePropertyContext(
                fs::path(pkgPath).parent_path().string(), visited);
        }
        ThermoPackage thermo = ThermoPackageBuilder::build(
            sel, db, chem.present ? &chem : nullptr);
        const std::size_t n = thermo.n();
        const std::size_t iCO = thermo.indexOf("CO"), iW = thermo.indexOf("water"),
                          iCO2 = thermo.indexOf("CO2"), iH2 = thermo.indexOf("H2");

        // The laws.  Strong, unequal adsorption on BOTH sides of the reaction
        // (CO 10 against H2 1; then a product-only and a
        // reactant-only site, and a temperature-dependent pair), so a missing
        // or misplaced factor cannot hide behind a K of one.
        std::vector<Law> laws = {
            {"powerLaw_reversible", "Arrhenius", true, false, "", 1, 1, {}},
            {"lhhw_unequal_CO10_H2_1", "LHHW", true, false,
             "{ component CO; K0 10; }\n{ component H2; K0 1; }", 1, 1,
             {{"CO", {10, 0}}, {"H2", {1, 0}}}},
            {"lhhw_product_only", "LHHW", true, false,
             "{ component CO2; K0 4; }", 1, 2, {{"CO2", {4, 0}}}},
            {"lhhw_reactant_only_saturated", "LHHW", true, false,
             "{ component water; K0 0.3; }\n{ component CO; K0 2; }", 0, 2,
             {{"water", {0.3, 0}}, {"CO", {2, 0}}}},
            {"lhhw_vantHoff_all_four", "LHHW", true, false,
             "{ component CO; K0 0.02; B 1500; }\n{ component water; K0 0.5; B 200; }\n"
             "{ component CO2; K0 0.1; B 900; }\n{ component H2; K0 3; B -400; }", 1, 1,
             {{"CO", {0.02, 1500}}, {"water", {0.5, 200}}, {"CO2", {0.1, 900}},
              {"H2", {3, -400}}}},
            {"lhhw_explicit_reverse", "LHHW", false, true,
             "{ component CO; K0 10; }\n{ component H2; K0 1; }", 1, 1,
             {{"CO", {10, 0}}, {"H2", {1, 0}}}},
        };

        const std::vector<double> temps = {500.0, 700.0, 900.0};

        std::ostringstream out;
        out.precision(17);
        out << "{\"laws\": [";
        bool firstLaw = true;
        for (const auto& L : laws)
        {
            auto rxn = Dictionary::fromString(lawText(L), L.name);
            RateLaw law = RateLaw::fromDict(rxn, thermo, "probe:" + L.name);
            sVector nu(n, 0.0);
            nu[iCO] = -1; nu[iW] = -1; nu[iCO2] = 1; nu[iH2] = 1;

            if (!firstLaw) out << ",";
            firstLaw = false;
            out << "{\"name\": \"" << L.name << "\", \"reversible\": "
                << (L.reversible ? "true" : "false") << ", \"adsorbs\": "
                << (L.ads.empty() ? "false" : "true") << ", \"points\": [";

            bool firstPt = true;
            for (double T : temps)
            {
                const double Kc = Reaction::equilibriumKc(thermo, nu, T);
                auto Kof = [&](const std::string& c)
                {
                    for (const auto& s : L.sites)
                        if (s.first == c)
                            return s.second.first * std::exp(s.second.second / T);
                    return 1.0;
                };
                // A composition at PROD c^nu = q.Kc: reactants and H2 at
                // 40 mol/m3, CO2 carrying the ratio.
                auto stateAt = [&](double q)
                {
                    sVector c(n, 0.0);
                    c[iCO] = 40.0; c[iW] = 40.0; c[iH2] = 40.0;
                    c[iCO2] = q * Kc * c[iCO] * c[iW] / c[iH2];
                    return c;
                };
                auto xOf = [&](const sVector& c)
                {
                    double s = 0.0;
                    for (double v : c) s += v;
                    sVector x(n, 0.0);
                    for (std::size_t i = 0; i < n; ++i) x[i] = c[i] / s;
                    return x;
                };
                const sVector cEq = stateAt(1.0);
                const double kf = Reaction::arrheniusRate(A, Ea, T);

                // The forward leg alone, from the declared numbers.
                double denom = 1.0, p = 0.0;
                if (!L.ads.empty())
                {
                    denom = L.vacant;
                    for (const auto& s : L.sites)
                        denom += Kof(s.first) * cEq[thermo.indexOf(s.first)];
                    p = L.exponent;
                }
                const double rf = kf * Kof("CO") * cEq[iCO] * Kof("water") * cEq[iW]
                                / std::pow(denom, p);

                const double atEq  = law.netRate(thermo, T, cEq, xOf(cEq));
                const sVector cLo = stateAt(0.5), cHi = stateAt(2.0);
                const double below = law.netRate(thermo, T, cLo, xOf(cLo));
                const double above = law.netRate(thermo, T, cHi, xOf(cHi));

                // The arithmetic that must not move, in the engine's own order.
                bool   haveRef = false;
                double ref = 0.0;
                if (L.ads.empty() && L.reversible)
                {
                    double f = kf;
                    for (std::size_t i = 0; i < n; ++i)
                        if (nu[i] < 0.0) f *= std::pow(cEq[i], 1.0);
                    double r = (Kc > 0.0) ? kf / Kc : 0.0;
                    for (std::size_t i = 0; i < n; ++i)
                        if (nu[i] > 0.0) r *= std::pow(cEq[i], nu[i]);
                    ref = f - r;
                    haveRef = true;
                }
                else if (L.explicitRev)
                {
                    sVector abar = cEq;
                    for (const auto& s : L.sites)
                    {
                        const std::size_t i = thermo.indexOf(s.first);
                        abar[i] = s.second.first * std::exp(s.second.second / T) * cEq[i];
                    }
                    double f = kf;
                    for (std::size_t i = 0; i < n; ++i)
                        if (nu[i] < 0.0) f *= std::pow(abar[i], 1.0);
                    double r = Reaction::arrheniusRate(Arev, Earev, T);
                    for (std::size_t i = 0; i < n; ++i)
                        if (nu[i] > 0.0) r *= std::pow(abar[i], nu[i]);
                    double d = L.vacant;
                    for (const auto& s : L.sites) d += abar[thermo.indexOf(s.first)];
                    ref = (f - r) / std::pow(d, L.exponent);
                    haveRef = true;
                }

                // What PROD theta^nu the OLD code balanced at, for the record:
                // Kc / PROD K_i^nu_i.
                const double shift = Kof("CO2") * Kof("H2") / (Kof("CO") * Kof("water"));

                if (!firstPt) out << ",";
                firstPt = false;
                out << "{\"T\": " << T << ", \"Kc\": " << Kc << ", \"rf\": " << rf
                    << ", \"atEq\": " << atEq << ", \"below\": " << below
                    << ", \"above\": " << above << ", \"adsShift\": " << shift;
                if (haveRef) out << ", \"reference\": " << ref;
                out << "}";
            }
            out << "]}";
        }
        out << "]}\n";
        std::cout << out.str();
        return 0;
    }
    catch (const std::exception& e)
    {
        std::cerr << "probe error: " << e.what() << "\n";
        return 1;
    }
}
