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
    This file is part of Choupo.  See PropertyScanBinary.H for the licence.
    SPDX-License-Identifier: GPL-3.0-or-later
-------------------------------------------------------------------------------
\*---------------------------------------------------------------------------*/

#include "PropertyScanBinary.H"

#include "core/Constants.H"
#include "thermo/ThermoPackage.H"
#include "thermo/activityCoefficient/ActivityModel.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

namespace {

// molar Gibbs energy of mixing [J/mol] for a binary at (T, x1):
//   g_mix = R T [ x1(ln x1 + ln gamma1) + x2(ln x2 + ln gamma2) ]
scalar gmixBinary(const ThermoPackage& thermo, scalar T, scalar x1)
{
    const scalar x2 = 1.0 - x1;
    const sVector x{ x1, x2 };
    const sVector g = thermo.activity().gamma(T, x);
    return constant::R * T
         * ( x1 * (std::log(x1) + std::log(g[0]))
           + x2 * (std::log(x2) + std::log(g[1])) );
}

} // namespace

int PropertyScanBinary::run(const DictPtr& dict,
                            const ThermoPackage& globalThermo,
                            int verbosity)
{
    // Per-op thermo override (same mechanism as PropertyScan1D/2D/Ternary).
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    if (thermo.n() != 2)
        throw std::runtime_error(
            "propertyScanBinary: needs EXACTLY 2 components in the "
            "thermoPackage; got " + std::to_string(thermo.n()));

    // -- fixed flash state (T, P).  Composition is the swept axis.
    auto stateDict = dict->subDict("state");
    const scalar T = stateDict->found("T")
                         ? stateDict->lookupScalar("T", Dims::temperature)
                       : 298.15;
    const scalar P_Pa = stateDict->found("P")
                            ? stateDict->lookupScalar("P", Dims::pressure)
                          : 1.0e5;
    const scalar P_bar = P_Pa / 1.0e5;     // FlashInput.P is in bar

    // -- grid resolution (interior composition samples).
    std::size_t g = 41;
    if (dict->found("grid"))
    {
        auto gridDict = dict->subDict("grid");
        if (gridDict->found("n"))
            g = static_cast<std::size_t>(gridDict->lookupScalar("n"));
    }
    if (g < 5)
        throw std::runtime_error("propertyScanBinary: grid.n must be >= 5");

    auto outDict = dict->subDict("output");
    const std::string outFile = outDict->lookupWord("file");
    std::ofstream csv(outFile);
    if (!csv)
        throw std::runtime_error("propertyScanBinary: cannot open '" + outFile + "'");
    csv << "x1,gmix_J_per_mol,role,beta\n";
    csv << std::scientific << std::setprecision(8);

    // (a) the g_mix(x1) curve -- interior nodes only (x ln x -> 0 at the ends,
    //     but ln x diverges, so we never sample x1 = 0 or 1 exactly).
    for (std::size_t i = 1; i < g; ++i)
    {
        const scalar x1 = static_cast<scalar>(i) / static_cast<scalar>(g);
        csv << x1 << ',' << gmixBinary(thermo, T, x1) << ",curve,\n";
    }

    // (b) the two coexisting liquid compositions from ONE liquid-liquid flash
    //     (PhaseSet::LL) at z = (0.5,0.5).  The two binodal points lie ON the
    //     curve above and share its common tangent -- the engine, not a fit,
    //     locates them.  A miscible system returns no split: reported honestly.
    FlashInput in;
    in.F = 1.0;
    in.T = T;
    in.P = P_Pa;        // FlashInput.P is in Pa (SI), not bar
    in.z = sVector{ 0.5, 0.5 };

    FlashOptions opts;
    opts.phaseSet  = PhaseSet::LL;
    opts.verbosity = (verbosity >= 4) ? verbosity : 0;

    bool split = false;
    try
    {
        const FlashSolution sol = IsothermalFlash::solveCore(in, thermo, opts);
        const bool isLL = sol.regime.find("two-phase liquid") != std::string::npos;
        if (isLL && sol.x.size() == 2 && sol.y.size() == 2)
        {
            const scalar xa = sol.x[0];           // liquid-alpha mole fraction of comp 1
            const scalar xb = sol.y[0];           // liquid-beta
            const scalar bB = sol.V_over_F;       // beta fraction (the beta liquid)
            if (std::abs(xa - xb) > 1.0e-3)        // a genuine, non-trivial split
            {
                split = true;
                csv << xa << ',' << gmixBinary(thermo, T, xa) << ",binodal," << (1.0 - bB) << '\n';
                csv << xb << ',' << gmixBinary(thermo, T, xb) << ",binodal," << bB << '\n';
                std::cout << "[binaryLLE] two liquid phases at " << T << " K, "
                          << P_bar << " bar: x1 = " << xa << " | " << xb
                          << "  (beta = " << bB << ")\n";
                const scalar tiny = std::min(std::min(xa, 1.0 - xa), std::min(xb, 1.0 - xb));
                if (tiny < 2.0e-3)
                    std::cout << "[advisory] a binodal branch is very dilute (x ~ "
                              << tiny << "), near the LL-flash 1e-4 simplex floor -- "
                                 "treat the dilute mutual solubility as approximate.\n";
            }
        }
    }
    catch (const std::exception& e)
    {
        std::cout << "[advisory] the liquid-liquid flash did not converge: "
                  << e.what() << " -- no binodal emitted.\n";
    }

    if (!split)
        std::cout << "[binaryLLE] single liquid at " << T << " K, " << P_bar
                  << " bar: the chosen activity model predicts MISCIBILITY (no "
                     "liquid-liquid split) -- the g_mix curve stays convex.\n";

    csv.close();
    diag_["split"] = split ? 1.0 : 0.0;
    diag_["T"]     = T;
    if (verbosity >= 2)
        std::cout << "propertyScanBinary: g_mix over " << (g - 1)
                  << " nodes + " << (split ? 2 : 0) << " binodal points -> "
                  << outFile << "\n";
    return 0;
}

} // namespace Choupo
