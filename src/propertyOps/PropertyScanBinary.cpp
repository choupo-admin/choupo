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
#include "solver/StabilityTest.H"
#include "unitOperations/flash/IsothermalFlash.H"

#include "thermo/RecordResolver.H"
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

//  ln gamma_i at (T, x1) for a binary (the tangent-plane test's building block).
sVector lnGammaBinary(const ThermoPackage& thermo, scalar T, scalar x1)
{
    const sVector g = thermo.activity().gamma(T, sVector{ x1, 1.0 - x1 });
    return sVector{ std::log(g[0]), std::log(g[1]) };
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
    records::refuseStandardsWrite("propertyScanBinary", "file", outFile);
    std::ofstream csv(outFile);
    if (!csv)
        throw std::runtime_error("propertyScanBinary: cannot open '" + outFile + "'");
    csv << "x1,gmix_J_per_mol,role,beta\n";
    csv << std::scientific << std::setprecision(8);

    PublishedTable curveTab, binTab;
    curveTab.name = "gmix";
    curveTab.description = "the molar Gibbs energy of mixing along composition (interior nodes)";
    curveTab.columns = { { "x1", "-" }, { "gmix", "J/mol" } };
    binTab.name = "binodal";
    binTab.description = "the two coexisting liquids of the liquid-liquid flash on the g_mix curve; beta is each phase's fraction (no rows when the model predicts miscibility)";
    binTab.columns = { { "x1", "-" }, { "gmix", "J/mol" }, { "beta", "-" } };
    comp1_ = thermo.comp(0).name();

    // (a) the g_mix(x1) curve -- interior nodes only (x ln x -> 0 at the ends,
    //     but ln x diverges, so we never sample x1 = 0 or 1 exactly).
    for (std::size_t i = 1; i < g; ++i)
    {
        const scalar x1 = static_cast<scalar>(i) / static_cast<scalar>(g);
        const scalar gm = gmixBinary(thermo, T, x1);
        csv << x1 << ',' << gm << ",curve,\n";
        curveTab.rows.push_back({ x1, gm });
    }

    // (b) the two coexisting liquid compositions from ONE liquid-liquid flash
    //     (PhaseSet::LL).  The two binodal points lie ON the curve above and
    //     share its common tangent -- the engine, not a fit, locates them.  A
    //     miscible system returns no split: reported honestly.
    //
    //     The flash FEED must lie INSIDE the miscibility gap or the lever rule
    //     makes the split infeasible (a feed outside the binodal is a single
    //     liquid).  Default is equimolar z = (0.5, 0.5); the case may override
    //     it with an optional `feed { <comp> <x1>; }` to place the feed inside
    //     an ASYMMETRIC gap (e.g. water/1-butanol, whose butanol-rich binodal
    //     sits below 50 mol% butanol, so z = 0.5 is outside it).
    //  The mole fraction of component 1 a `feed { <comp> <x>; }` block declares.
    auto readFeedX1 = [&](const DictPtr& feedDict, scalar dflt) -> scalar
    {
        scalar z1 = dflt;
        const std::string c0 = thermo.comp(0).name();
        const std::string c1 = thermo.comp(1).name();
        if (feedDict->found(c0))
            z1 = feedDict->lookupScalar(c0);
        else if (feedDict->found(c1))
            z1 = 1.0 - feedDict->lookupScalar(c1);
        if (z1 <= 0.0 || z1 >= 1.0)
            throw std::runtime_error("propertyScanBinary: feed composition for '"
                + c0 + "' must be in (0,1); got " + std::to_string(z1));
        return z1;
    };
    scalar zFeed1 = 0.5;
    if (dict->found("feed"))
        zFeed1 = readFeedX1(dict->subDict("feed"), zFeed1);

    FlashInput in;
    in.F = 1.0;
    in.T = T;
    in.P = P_Pa;        // FlashInput.P is in Pa (SI), not bar
    in.z = sVector{ zFeed1, 1.0 - zFeed1 };

    FlashOptions opts;
    opts.phaseSet  = PhaseSet::LL;
    //  With a `stability` block the flash is run at verbosity 3 so that ITS
    //  OWN Michelsen line (IsothermalFlash.cpp, "Michelsen TPD stability test")
    //  is in the log beside the table; without one nothing changes.
    opts.verbosity = (verbosity >= 4) ? verbosity : (dict->found("stability") ? 3 : 0);

    bool split = false;
    //  The verbose flash leaves the stream in scientific format with 4 figures;
    //  restore it when WE asked for that verbosity, so the lines below read as before.
    const bool raisedVerbosity = (opts.verbosity == 3 && verbosity < 3);
    const std::ios_base::fmtflags streamFlags = std::cout.flags();
    const std::streamsize streamPrecision = std::cout.precision();
    try
    {
        const FlashSolution sol = IsothermalFlash::solveCore(in, thermo, opts);
        if (raisedVerbosity) { std::cout.flags(streamFlags); std::cout.precision(streamPrecision); }
        const bool isLL = sol.liquidLiquid;   // the split's KIND, never parsed from `regime`
        if (isLL && sol.x.size() == 2 && sol.y.size() == 2)
        {
            const scalar xa = sol.x[0];           // liquid-alpha mole fraction of comp 1
            const scalar xb = sol.y[0];           // liquid-beta
            const scalar bB = sol.V_over_F;       // beta fraction (the beta liquid)
            if (std::abs(xa - xb) > 1.0e-3)        // a genuine, non-trivial split
            {
                split = true;
                binTab.rows.push_back({ xa, gmixBinary(thermo, T, xa), 1.0 - bB });
                binTab.rows.push_back({ xb, gmixBinary(thermo, T, xb), bB });
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
        if (raisedVerbosity) { std::cout.flags(streamFlags); std::cout.precision(streamPrecision); }
        std::cout << "[advisory] the liquid-liquid flash did not converge: "
                  << e.what() << " -- no binodal emitted.\n";
    }

    if (!split)
        std::cout << "[binaryLLE] single liquid at " << T << " K, " << P_bar
                  << " bar: the chosen activity model predicts MISCIBILITY (no "
                     "liquid-liquid split) -- the g_mix curve stays convex.\n";

    //  (c) OPTIONAL `stability { feed { <comp> <x>; } }` (2026-11-25): the
    //      tangent-plane picture of "how many phases?".  Absent block -> nothing
    //      below runs and no output moves.  Three more tables:
    //        activity    x1, lnGamma1, lnGamma2, a1, a2   (a_i = x_i gamma_i),
    //                    on the same interior nodes as gmix
    //        tpd         y1, tm  for the declared feed z:
    //                    tm(y) = sum_i y_i [ ln y_i + ln gamma_i(y) - ln z_i - ln gamma_i(z) ]
    //        stationary  the verdict of the ENGINE's own Michelsen test
    //                    (solver::michelsenTPD, called, not re-implemented) on
    //                    the first liquid phase: stable / unstable, its lowest
    //                    tm and the composition of the incipient phase there.
    //      Its tm is the engine's modified form, 1 + sum Y (ln Y + ln gamma - h - 1),
    //      which has the sign of tm(y) at a stationary point; both are printed.
    const bool wantStability = dict->found("stability");
    extraTables_.clear();
    if (wantStability)
    {
        auto sd = dict->subDict("stability");
        const scalar zS = sd->found("feed") ? readFeedX1(sd->subDict("feed"), zFeed1)
                                            : zFeed1;
        PublishedTable actTab, tpdTab, statTab, binActTab;
        actTab.name = "activity";
        actTab.description = "ln gamma and activity of both components along composition (the same interior nodes as gmix)";
        actTab.columns = { { "x1", "-" }, { "lnGamma1", "-" }, { "lnGamma2", "-" },
                           { "a1", "-" }, { "a2", "-" } };
        tpdTab.name = "tpd";
        tpdTab.description = "the tangent-plane distance tm(y) / RT of the declared feed along the trial composition y1 (same nodes)";
        tpdTab.columns = { { "y1", "-" }, { "tm", "-" } };
        statTab.name = "stationary";
        statTab.description = "the engine's Michelsen test on the declared feed: the lowest tangent-plane distance it found (its own form, 1 + sum Y (ln Y + ln gamma - h - 1)) and the incipient phase there";
        statTab.columns = { { "feed1", "-" }, { "unstable", "-" }, { "tmMin", "-" }, { "y1", "-" } };

        binActTab.name = "binodalActivity";
        binActTab.description = "the activities of both components in each coexisting liquid of the flash (equal in the two rows at equilibrium: the iso-activity conditions); no rows when there is no split";
        binActTab.columns = { { "x1", "-" }, { "lnGamma1", "-" }, { "lnGamma2", "-" },
                              { "a1", "-" }, { "a2", "-" } };
        for (const auto& r : binTab.rows)
        {
            const sVector lb = lnGammaBinary(thermo, T, r[0]);
            binActTab.rows.push_back({ r[0], lb[0], lb[1],
                                       r[0] * std::exp(lb[0]), (1.0 - r[0]) * std::exp(lb[1]) });
        }
        const sVector lnGz = lnGammaBinary(thermo, T, zS);
        const scalar hz1 = std::log(zS) + lnGz[0];
        const scalar hz2 = std::log(1.0 - zS) + lnGz[1];
        scalar tmGridMin = 0.0, yAtGridMin = 0.0;
        for (std::size_t i = 1; i < g; ++i)
        {
            const scalar x1 = static_cast<scalar>(i) / static_cast<scalar>(g);
            const sVector lg = lnGammaBinary(thermo, T, x1);
            actTab.rows.push_back({ x1, lg[0], lg[1],
                                    x1 * std::exp(lg[0]), (1.0 - x1) * std::exp(lg[1]) });
            const scalar tm = x1 * (std::log(x1) + lg[0] - hz1)
                            + (1.0 - x1) * (std::log(1.0 - x1) + lg[1] - hz2);
            tpdTab.rows.push_back({ x1, tm });
            if (tm < tmGridMin) { tmGridMin = tm; yAtGridMin = x1; }
        }
        const auto liqs = thermo.phasesOfType("liquid");
        if (liqs.empty())
            throw std::runtime_error("propertyScanBinary: `stability` needs a liquid phase in the thermoPackage");
        const solver::StabilityResult st = solver::michelsenTPD(
            thermo.phase(liqs[0]), T, P_bar, sVector{ zS, 1.0 - zS });
        const scalar yEng = st.trialY.size() == 2 ? st.trialY[0] : 0.0;
        statTab.rows.push_back({ zS, st.unstable ? 1.0 : 0.0, st.tmMin, yEng });
        std::cout << "[tangentPlane] feed x1 = " << zS << " at " << T << " K, " << P_bar
                  << " bar: Michelsen test says " << (st.unstable ? "UNSTABLE (a phase is missing)"
                                                                   : "STABLE (one liquid)")
                  << ", tm_min = " << st.tmMin << " at y1 = " << yEng << "\n";
        diag_["tpdFeed1"]     = zS;
        diag_["tpdUnstable"]  = st.unstable ? 1.0 : 0.0;
        diag_["tpdTmMin"]     = st.tmMin;
        diag_["tpdTrialY1"]   = yEng;
        diag_["tpdGridMin"]   = tmGridMin;
        diag_["tpdGridMinY1"] = yAtGridMin;
        extraTables_.push_back(std::move(actTab));
        extraTables_.push_back(std::move(tpdTab));
        extraTables_.push_back(std::move(binActTab));
        extraTables_.push_back(std::move(statTab));
    }
    stability_ = wantStability;

    csv.close();
    split_ = split;
    tables_.clear();
    tables_.push_back(std::move(curveTab));
    tables_.push_back(std::move(binTab));
    for (auto& t : extraTables_) tables_.push_back(std::move(t));
    extraTables_.clear();
    diag_["split"] = split ? 1.0 : 0.0;
    diag_["T"]     = T;
    if (verbosity >= 2)
        std::cout << "propertyScanBinary: g_mix over " << (g - 1)
                  << " nodes + " << (split ? 2 : 0) << " binodal points -> "
                  << outFile << "\n";
    return 0;
}

std::string PropertyScanBinary::defaultViews(const std::string& op) const
{
    std::string out =
        "{ name lleMap; type series; title \"" + op + ": molar Gibbs energy of mixing against composition"
        + std::string(split_ ? " -- the two coexisting liquids sit on the common tangent" : " -- convex everywhere: the model predicts one liquid")
        + "\"; xAxis { label \"mole fraction of " + comp1_ + ", x1\"; } yAxis { label \"g_mix\"; }"
          " series ( { name curve; label \"g_mix(x1)\"; op " + op + "; table gmix; x x1; y gmix; style lines; }";
    if (split_)
        out += " { name tangent; label \"common tangent\"; op " + op + "; table binodal; x x1; y gmix; style lines; }"
               " { name binodal; label \"coexisting liquids (binodal)\"; op " + op + "; table binodal; x x1; y gmix; style markers; }";
    out += " ); }\n";
    if (stability_)
    {
        out += "{ name activity; type series; title \"" + op + ": activity of both components against composition -- the iso-activity conditions\";"
               " xAxis { label \"mole fraction of " + comp1_ + ", x1\"; } yAxis { label \"activity a_i = x_i gamma_i\"; }"
               " series ( { name a1; label \"a1\"; op " + op + "; table activity; x x1; y a1; style lines; }"
               " { name a2; label \"a2\"; op " + op + "; table activity; x x1; y a2; style lines; } ); }\n";
        out += "{ name tpd; type series; title \"" + op + ": tangent-plane distance of the declared feed along the trial composition\";"
               " xAxis { label \"trial mole fraction of " + comp1_ + ", y1\"; } yAxis { label \"tm(y) / RT\"; }"
               " series ( { name tm; label \"tm(y)\"; op " + op + "; table tpd; x y1; y tm; style lines; } ); }\n";
    }
    return out;
}

} // namespace Choupo
