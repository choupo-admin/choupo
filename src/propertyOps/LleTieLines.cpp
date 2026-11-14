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
    This file is part of Choupo (GPL-3.0-or-later).  See LleTieLines.H.
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */

#include "LleTieLines.H"
#include "core/Constants.H"
#include "thermo/ThermoPackage.H"
#include "unitOperations/flash/IsothermalFlash.H"
#include "thermo/RecordResolver.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

int LleTieLines::run(const DictPtr& dict,
                     const ThermoPackage& globalThermo,
                     int verbosity)
{
    auto override = thermoForOp(dict);
    const ThermoPackage& thermo = override ? *override : globalThermo;

    if (thermo.n() != 3)
        throw std::runtime_error("lleTieLines: needs EXACTLY 3 components in the "
                                 "thermoPackage; got " + std::to_string(thermo.n()));

    auto st = dict->subDict("state");
    const scalar T    = st->lookupScalar("T", Dims::temperature);
    const scalar P_Pa = st->found("P") ? st->lookupScalar("P", Dims::pressure) : 1.0e5;

    // The three roles are DECLARED -- never read off a name or a list order.
    const std::string sName = dict->lookupWord("solute");
    const std::string cName = dict->lookupWord("carrier");
    const std::string eName = dict->lookupWord("extractant");
    const std::size_t iS = thermo.indexOf(sName);
    const std::size_t iC = thermo.indexOf(cName);
    const std::size_t iE = thermo.indexOf(eName);
    if (iS == iC || iS == iE || iC == iE)
        throw std::runtime_error("lleTieLines: solute, carrier and extractant "
                                 "must be three different components");

    auto feed = dict->subDict("feed");
    auto sw   = feed->subDict("soluteMassFraction");
    const scalar wFrom = sw->lookupScalar("from");
    const scalar wTo   = sw->lookupScalar("to");
    const std::size_t nPts = static_cast<std::size_t>(sw->lookupScalar("n"));
    const scalar ratio = feed->lookupScalar("carrierToExtractant");
    if (nPts < 2 || !(wFrom > 0.0) || !(wTo > wFrom) || !(wTo < 1.0) || !(ratio > 0.0))
        throw std::runtime_error("lleTieLines: need n >= 2, 0 < from < to < 1 and "
                                 "carrierToExtractant > 0");

    auto outDict = dict->subDict("output");
    const std::string outFile = outDict->lookupWord("file");
    records::refuseStandardsWrite("lleTieLines", "file", outFile);
    std::ofstream csv(outFile);
    if (!csv.is_open())
        throw std::runtime_error("lleTieLines: cannot open '" + outFile + "'");

    const scalar MW[3] = { thermo.comp(iS).MW(), thermo.comp(iC).MW(), thermo.comp(iE).MW() };
    const std::size_t idx[3] = { iS, iC, iE };
    const std::string nm[3]  = { sName, cName, eName };

    csv << "wR_" << sName << ",wR_" << cName << ",wR_" << eName
        << ",wE_" << sName << ",wE_" << cName << ",wE_" << eName << "\n";
    csv << std::scientific << std::setprecision(8);

    FlashOptions opts;
    opts.phaseSet  = PhaseSet::LL;
    opts.verbosity = 0;

    std::size_t nSplit = 0, nSingle = 0, nRefused = 0;
    scalar wPlait = 0.0;   // largest solute mass fraction (raffinate) that still split

    for (std::size_t k = 0; k < nPts; ++k)
    {
        const scalar w = wFrom + (wTo - wFrom) * static_cast<scalar>(k)
                                 / static_cast<scalar>(nPts - 1);
        // mass fractions of the feed -> mole fractions
        const scalar rest = 1.0 - w;
        const scalar wc = rest * ratio / (1.0 + ratio);
        const scalar we = rest / (1.0 + ratio);
        const scalar ni[3] = { w / MW[0], wc / MW[1], we / MW[2] };
        const scalar nT = ni[0] + ni[1] + ni[2];

        FlashInput in;
        in.F = 1.0;
        in.T = T;
        in.P = P_Pa;
        in.z = sVector(3, 0.0);
        for (int a = 0; a < 3; ++a) in.z[idx[a]] = ni[a] / nT;

        FlashSolution sol;
        try { sol = IsothermalFlash::solveCore(in, thermo, opts); }
        catch (const std::exception&) { ++nRefused; continue; }

        if (!sol.liquidLiquid || sol.x.size() != 3 || sol.y.size() != 3)
        { ++nSingle; continue; }

        // mole -> mass fractions of both liquids
        scalar wA[3], wB[3], sA = 0.0, sB = 0.0;
        for (int a = 0; a < 3; ++a)
        {
            wA[a] = sol.x[idx[a]] * MW[a];  sA += wA[a];
            wB[a] = sol.y[idx[a]] * MW[a];  sB += wB[a];
        }
        for (int a = 0; a < 3; ++a) { wA[a] /= sA; wB[a] /= sB; }

        // Raffinate = the liquid richer in the carrier (mass); never by label.
        const bool aIsRaff = wA[1] >= wB[1];
        const scalar* R = aIsRaff ? wA : wB;
        const scalar* E = aIsRaff ? wB : wA;
        csv << R[0] << "," << R[1] << "," << R[2] << ","
            << E[0] << "," << E[1] << "," << E[2] << "\n";
        ++nSplit;
        if (R[0] > wPlait) wPlait = R[0];
    }
    csv.close();

    if (verbosity >= 2)
        std::cout << "\n=========================  lleTieLines  ============================\n"
                  << "  T = " << T << " K,  P = " << P_Pa / 1.0e5 << " bar;  solute " << nm[0]
                  << ", carrier " << nm[1] << ", extractant " << nm[2] << "\n"
                  << "  feeds: " << nPts << "  split: " << nSplit << "  single liquid: "
                  << nSingle << "  refused: " << nRefused << "\n"
                  << "  largest raffinate solute mass fraction that split: " << wPlait << "\n"
                  << "  Output: " << outFile << "\n"
                  << "====================================================================\n";

    diag_["n_feeds"]   = static_cast<scalar>(nPts);
    diag_["n_split"]   = static_cast<scalar>(nSplit);
    diag_["n_single"]  = static_cast<scalar>(nSingle);
    diag_["n_refused"] = static_cast<scalar>(nRefused);
    diag_["wR_solute_max"] = wPlait;
    return 0;
}

} // namespace Choupo
