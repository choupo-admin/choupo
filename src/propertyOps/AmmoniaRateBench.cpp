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
\*---------------------------------------------------------------------------*/

#include "AmmoniaRateBench.H"

#include "unitOperations/reactor/kinetics/AmmoniaSynthesisRate.H"

#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  The dictionary grammar converts every declared unit to canonical SI, so a
//  case writes `300 atm` and this op receives pascal.  Dyson and Simon wrote
//  their equations in ATMOSPHERES, and that unit is a property of the
//  correlation, not of the case -- so the conversion happens HERE, once, at
//  the edge where the two conventions meet, instead of asking a case to type
//  the paper's unit system.
constexpr scalar Pa_per_atm = 101325.0;

std::string f(scalar v, int p = 6)
{
    std::ostringstream os;
    os << std::fixed << std::setprecision(p) << v;
    return os.str();
}

} // namespace

int AmmoniaRateBench::run(const DictPtr& dict,
                          const ThermoPackage& /*thermo*/,
                          int verbosity)
{
    diag_.clear();
    std::ostringstream os;

    os << "\n========  Ammonia synthesis rate  ========\n"
       << "  source:  " << DysonSimon1968::citation() << "\n\n"
       << "  window:  " << DysonSimon1968::validityWindow() << "\n\n"
       << "  SYMBOLS, AND THEY COLLIDE WITH THIS TREE'S OWN.  The paper writes\n"
          "  xi for the EFFECTIVENESS FACTOR and eta for the CONVERSION of\n"
          "  nitrogen.  src/unitOperations/reactor/CatalystPellet.H -- and most\n"
          "  of the reaction-engineering literature -- writes eta for the\n"
          "  EFFECTIVENESS FACTOR.  Everything below uses the PAPER's letters.\n\n";

    // -----------------------------------------------------------------
    //  THE SELF-CHECK, and every anchor says what KIND it is.
    // -----------------------------------------------------------------
    os << "  ---- self-check: what each anchor proves ----\n";
    const auto anchors = DysonSimon1968::verify();
    bool allPass = true;
    std::size_t idx = 0;
    for (const auto& a : anchors)
    {
        ++idx;
        allPass = allPass && a.pass;
        diag_["anchor" + std::to_string(idx) + "_pass"] = a.pass ? 1.0 : 0.0;
        os << "  [" << std::left << std::setw(10) << a.kind << "] "
           << std::setw(46) << a.name
           << (a.pass ? "  [PASS]" : "  [FAIL]") << "\n"
           << "               computed " << a.computed
           << "   expected " << a.expected << "\n"
           << "               " << a.statement << "\n\n";
    }
    diag_["anchorsPassed"] = scalar(anchors.size()) * (allPass ? 1.0 : 0.0);
    diag_["anchorCount"]   = scalar(anchors.size());
    os << "  NOTHING ABOVE IS MEASURED BY CHOUPO.  A `theory` anchor is an\n"
          "  identity the expression must satisfy; an `arithmetic` anchor is the\n"
          "  closed form at a stated point against a literal, and it proves a\n"
          "  TRANSCRIPTION, never a physics.  The measurements these equations\n"
          "  were fitted to are Nielsen, Kjaer and Hansen's, and they are not in\n"
          "  this tree.\n\n";

    if (!allPass)
        throw std::runtime_error("ammoniaRateBench: an anchor failed -- the"
            " transcription or the formula is wrong. Do not loosen the"
            " tolerance to make this pass.");

    // -----------------------------------------------------------------
    //  THE CATALYST.  There is no default particle size anywhere in this
    //  slice, and the refusal that follows from leaving it out is the point.
    // -----------------------------------------------------------------
    scalar dp_mm = 0.0;
    if (dict->found("catalyst"))
    {
        auto cat = dict->subDict("catalyst");
        //  Declared in metres after the grammar's conversion; the paper's
        //  6-10 mm range is in millimetres.
        dp_mm = 1000.0 * cat->lookupScalar("particleDiameter");
    }
    diag_["particleDiameter_mm"] = dp_mm;

    // -----------------------------------------------------------------
    //  (1) THE LOCUS OF MAXIMUM RATE
    // -----------------------------------------------------------------
    if (dict->found("locus"))
    {
        auto L = dict->subDict("locus");
        const scalar P_atm = L->lookupScalar("pressure") / Pa_per_atm;
        auto etas = L->lookupList("conversions");
        auto Td = L->subDict("temperature");
        const scalar Tfrom = Td->lookupScalar("from");
        const scalar Tto   = Td->lookupScalar("to");
        const std::size_t n =
            std::max<std::size_t>(2, std::size_t(Td->lookupScalar("n")));

        if (!(Tto > Tfrom))
            throw std::runtime_error("ammoniaRateBench: locus.temperature.to"
                " must exceed .from -- a sweep of zero width locates no"
                " maximum.");
        if (etas.empty())
            throw std::runtime_error("ammoniaRateBench: locus.conversions is"
                " empty. One conversion gives one point of the locus; the"
                " locus is the sequence, and a single point cannot show that"
                " it DESCENDS, which is the whole lesson.");

        os << "  ---- the locus of maximum rate, at " << f(P_atm, 3)
           << " atm ----\n"
           << "  On the paper's own reference mixture (3:1 H2/N2, 12.7 %"
              " inerts) the\n  temperature of greatest net rate DESCENDS as"
              " conversion rises.  That\n  descent is the curve a quench"
              " converter zigzags about.\n\n"
           << "  " << std::left
           << std::setw(8)  << "eta"
           << std::setw(12) << "T_max [K]"
           << std::setw(20) << "V3 [kmol/m3/h]"
           << std::setw(20) << "V3 [lbmol/ft3/h]"
           << std::setw(12) << "xi(T_max)"
           << "Eq40 [kmol/m3/h]\n";

        const scalar dT = (Tto - Tfrom) / scalar(n - 1);
        std::size_t k = 0;
        scalar previousTmax = 0.0;
        bool descends = true;
        for (scalar eta : etas)
        {
            ++k;
            const std::string tag = "locus" + std::to_string(k);
            scalar bestT = Tfrom, bestV = -1.0e300;
            for (std::size_t i = 0; i < n; ++i)
            {
                const scalar T = Tfrom + dT * scalar(i);
                AmmoniaRateContext c =
                    DysonSimon1968::referenceMixture(eta, T, P_atm);
                c.particleDiameter_mm = dp_mm;
                const auto r = DysonSimon1968::evaluate(c);
                if (r.rateIntrinsic_kmolNH3_per_m3bed_h > bestV)
                {
                    bestV = r.rateIntrinsic_kmolNH3_per_m3bed_h;
                    bestT = T;
                }
            }

            AmmoniaRateContext c =
                DysonSimon1968::referenceMixture(eta, bestT, P_atm);
            c.particleDiameter_mm = dp_mm;
            const auto r = DysonSimon1968::evaluate(c);

            diag_[tag + "_eta"]        = eta;
            diag_[tag + "_T_maxRate_K"] = bestT;
            diag_[tag + "_V3_max"]     = bestV;
            diag_[tag + "_xi"]         = r.xi;
            diag_[tag + "_Eq40"]       = r.rate_kmolNH3_per_m3bed_h;

            os << "  " << std::left
               << std::setw(8)  << f(eta, 3)
               << std::setw(12) << f(bestT, 2)
               << std::setw(20) << f(bestV, 4)
               << std::setw(20) << f(DysonSimon1968::toLbmolPerFt3h(bestV), 4)
               << std::setw(12) << f(r.xi, 5)
               << f(r.rate_kmolNH3_per_m3bed_h, 4) << "\n";

            //  THE EDGE CASE THAT IS NOT AN EDGE CASE: a maximum found ON the
            //  sweep's own boundary is a boundary, not a maximum, and saying
            //  so is the difference between a locus and an artefact.
            if (std::abs(bestT - Tfrom) < 0.5 * dT ||
                std::abs(bestT - Tto)   < 0.5 * dT)
                os << "        ^ this maximum sits ON THE EDGE of the swept"
                      " window, so it is the edge\n          that was found,"
                      " not a maximum.  Widen `temperature` to locate one.\n";

            for (const auto& a : r.announcements)
                os << "        " << a << "\n";

            if (k > 1 && bestT > previousTmax) descends = false;
            previousTmax = bestT;
        }
        diag_["locusDescends"] = descends ? 1.0 : 0.0;
        os << "\n  The locus " << (descends ? "DESCENDS" : "does NOT descend")
           << " over the conversions asked for.\n"
           << "  Where it should be MET is not a question this bench answers:"
              " sitting on\n  the locus maximises rate and a real converter"
              " trades that against the\n  temperature its catalyst"
              " survives, which nothing here prices.\n\n";
    }

    // -----------------------------------------------------------------
    //  (2) THE RATE AT STATES THE CASE DECLARES
    // -----------------------------------------------------------------
    if (dict->found("points"))
    {
        auto pts = dict->lookupDictList("points");
        os << "  ---- the rate at declared states ----\n"
           << "  " << std::left
           << std::setw(22) << "state"
           << std::setw(12) << "T [K]"
           << std::setw(12) << "P [atm]"
           << std::setw(20) << "V3 [kmol/m3/h]"
           << std::setw(12) << "eta"
           << std::setw(12) << "xi"
           << "Eq40 [kmol/m3/h]\n";

        for (const auto& p : pts)
        {
            const std::string label = p->lookupWord("label");
            AmmoniaRateContext c;
            c.T_K   = p->lookupScalar("T");
            c.P_atm = p->lookupScalar("P") / Pa_per_atm;
            auto comp = p->subDict("composition");
            c.x_N2    = comp->lookupScalar("N2");
            c.x_H2    = comp->lookupScalar("H2");
            c.x_NH3   = comp->lookupScalar("NH3");
            c.x_inert = comp->lookupScalar("inert");
            c.particleDiameter_mm = dp_mm;

            const auto r = DysonSimon1968::evaluate(c);
            diag_[label + "_V3"]  = r.rateIntrinsic_kmolNH3_per_m3bed_h;
            diag_[label + "_xi"]  = r.xi;
            diag_[label + "_eta"] = r.eta_N2conversion;
            diag_[label + "_Eq40"] = r.rate_kmolNH3_per_m3bed_h;

            os << "  " << std::left
               << std::setw(22) << label
               << std::setw(12) << f(c.T_K, 2)
               << std::setw(12) << f(c.P_atm, 3)
               << std::setw(20) << f(r.rateIntrinsic_kmolNH3_per_m3bed_h, 4)
               << std::setw(12) << f(r.eta_N2conversion, 5)
               << std::setw(12) << f(r.xi, 5)
               << f(r.rate_kmolNH3_per_m3bed_h, 4) << "\n";
            for (const auto& a : r.announcements)
                os << "        " << a << "\n";
        }
        os << "\n";
    }

    os << "  " << AmmoniaRateResult::freshCatalystCaveat() << "\n"
       << "==========================================\n\n";

    if (verbosity >= 1) std::cout << os.str();
    return 0;
}

} // namespace Choupo
