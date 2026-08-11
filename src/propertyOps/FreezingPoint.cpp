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

#include "FreezingPoint.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "thermo/Component.H"
#include "thermo/Database.H"
#include "EvidencePartition.H"
#include "thermo/vaporPressure/VaporPressureModel.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"
#include "thermo/phase/SolidPhase.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>
#include <vector>

namespace Choupo {

int FreezingPoint::run(const DictPtr& dict, const ThermoPackage& /*thermo*/,
                       int verbosity)
{
    diag_.clear();
    const std::string cation = dict->lookupWord("cation");
    const std::string anion  = dict->lookupWord("anion");
    PitzerSingleSalt salt = electrolyte::loadSalt(cation, anion);
    const scalar nu = salt.nu_c + salt.nu_a;

    //  Water from the CATALOGUE, exactly as the phases will see it.  The
    //  crystal's inputs (Hfus, triple point, Psat model) are the record's;
    //  SolidPhase refuses by name if any is missing.
    std::vector<std::string> names{"water"};
    std::vector<Component> comps;
    {
        Component w;
        w.readFromDict(Dictionary::fromFile(
            (Database::currentRoot().empty() ? std::string("data")
                                             : Database::currentRoot())
            + "/standards/components/water.dat"));
        comps.push_back(std::move(w));
    }

    //  THE WITNESS: the ice leg is an actual SolidPhase -- the class the
    //  flash will one day consume -- not a re-typed exp(-dG/RT).  Its
    //  announced approximations (no dCp term; sub-freezing Psat
    //  extrapolation) therefore fire on this case, which is the point.
    SolidPhase ice(Dictionary::fromString(
        "name ice; mode crystallizing; component water;", "freezingPoint.op"),
        names, comps);
    const Component& water = comps[0];
    const scalar Tt = water.subTripleT();

    auto residual = [&](scalar m, scalar T) -> scalar
    {
        sVector x(1, 1.0);
        const scalar fSolid = ice.fEffective(T, 101325.0, x)[0];
        const scalar psat   = water.vp().Psat_Pa(T);
        return std::log(fSolid / psat) - std::log(salt.waterActivity(m, T));
    };

    auto md = dict->subDict("molality");
    const scalar mFrom = md->lookupScalar("from");
    const scalar mTo   = md->lookupScalar("to");
    const int    n     = static_cast<int>(md->lookupScalar("n"));

    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("freezingPoint: cannot open output file");
    csv << "m,Tf_K,depression_K,a_w\n" << std::scientific
        << std::setprecision(8);

    if (verbosity >= 2)
        std::cout << "  [freezingPoint] ice = SolidPhase(water), condition "
                     "f_solid(T) = a_w(m,T)*Psat(T); a_w from the Pitzer ("
                  << cation << "," << anion << ") surface.\n";

    scalar TfFirst = 0.0, TfLast = 0.0, mFirst = 0.0;
    for (int i = 0; i < n; ++i)
    {
        const scalar m = mFrom + (mTo - mFrom) * i / (n - 1);
        scalar lo = Tt - 45.0, hi = Tt + 0.5;
        scalar rLo = residual(m, lo), rHi = residual(m, hi);
        if (rLo * rHi > 0.0)
            throw std::runtime_error(
                "freezingPoint: no ice-solution equilibrium in ["
                + std::to_string(lo) + ", " + std::to_string(hi) + "] K at m = "
                + std::to_string(m) + " mol/kg.  The single-salt model has "
                "been pushed past any equilibrium it contains (toward or past "
                "the eutectic, which it does not model) -- printing a number "
                "here would be a temperature with no equilibrium behind it.");
        for (int it = 0; it < 80; ++it)
        {
            const scalar mid = 0.5 * (lo + hi);
            ((residual(m, mid) > 0.0) == (rHi > 0.0) ? hi : lo) = mid;
        }
        const scalar Tf = 0.5 * (lo + hi);
        csv << m << "," << Tf << "," << (Tt - Tf) << ","
            << salt.waterActivity(m, Tf) << "\n";
        if (i == 0) { TfFirst = Tf; mFirst = m; }
        TfLast = Tf;
    }

    diag_["Tf_lastM_K"]        = TfLast;
    diag_["depression_lastM_K"] = Tt - TfLast;
    //  Dilute-limit slope against nu*K_f: the DERIVED cryoscopic constant,
    //  closed-loop -- K_f was promoted on the condition that a consumer
    //  exist; the consumer is the same SolidPhase solving this curve.
    const scalar slope0 = (Tt - TfFirst) / mFirst;
    diag_["slope_dilute_K_kg_mol"] = slope0;
    if (water.K_f() > 0.0)
        diag_["slope_over_nuKf"] = slope0 / (nu * water.K_f());

    //  R5: the depression curve is DERIVED from the solvent record (Hfus,
    //  triple point) -- nothing is regressed here -- so a held-out claim
    //  has nothing to be held out from.
    EvidencePartition::refuseOnNonFittingOp(dict, "freezingPoint",
        "derives the depression curve from the solvent's own record and"
        " compares it against a measured series");

    if (dict->found("validation"))
    {
        auto v   = dict->subDict("validation");
        auto ds  = Dictionary::fromFile(v->lookupWord("dataset"));
        auto pts = ds->lookupDictList(v->lookupWord("series"));
        scalar sum = 0.0; int nM = 0;
        for (const auto& e : pts)
        {
            const scalar m = e->lookupScalar("m");
            if (m < mFrom || m > mTo) continue;
            const scalar meas = e->lookupScalar("theta");   // depression [K]
            scalar lo = Tt - 45.0, hi = Tt + 0.5;
            const scalar rHi = residual(m, hi);
            for (int it = 0; it < 80; ++it)
            {
                const scalar mid = 0.5 * (lo + hi);
                ((residual(m, mid) > 0.0) == (rHi > 0.0) ? hi : lo) = mid;
            }
            sum += std::fabs((Tt - 0.5 * (lo + hi)) - meas) / meas; ++nM;
        }
        if (nM > 0)
        {
            diag_["theta_AAD_pct"] = 100.0 * sum / nM;
            diag_["theta_nMeas"]   = static_cast<scalar>(nM);
            if (verbosity >= 2)
                std::cout << "  depression validation vs "
                          << v->lookupWord("dataset") << " ["
                          << v->lookupWord("series") << "]: AAD "
                          << 100.0 * sum / nM << " % over " << nM
                          << " point(s).\n";
        }
    }
    return 0;
}

} // namespace Choupo
