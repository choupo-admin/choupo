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

#include "PitzerActivity.H"

#include "core/Constants.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int PitzerActivity::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    diag_.clear();
    const std::string cation = dict->lookupWord("cation");
    const std::string anion  = dict->lookupWord("anion");

    // Charges, stoichiometry and Pitzer parameters from the curated catalogue.
    PitzerSingleSalt model = electrolyte::loadSalt(cation, anion);

    // Temperature [K] -- the model is T-dependent (A_phi(T) via eps_w(T)/rho_w(T));
    // defaults to 25 C so a bench with no `temperature` reads the 25 C curve.
    const scalar T = dict->lookupScalarOrDefault("temperature", 298.15);

    // -- molality grid --------------------------------------------------------
    scalar mFrom = 0.1, mTo = 6.0;
    std::size_t n = 30;
    if (dict->found("molality"))
    {
        auto md = dict->subDict("molality");
        mFrom = md->lookupScalarOrDefault("from", mFrom);
        mTo   = md->lookupScalarOrDefault("to",   mTo);
        if (md->found("n")) n = std::max<std::size_t>(2, static_cast<std::size_t>(md->lookupScalar("n")));
    }

    // -- output ---------------------------------------------------------------
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open())
        throw std::runtime_error("pitzerActivity: cannot open output file");
    // L_phi by the universal identity (the slice-1 FD, J/mol salt).  TWO
    // curves on purpose: the FITTED kernel (catalogue T-slots) and the
    // ANCHORED one (slots zeroed -- Gibbs-Helmholtz-consistent but
    // calorimetrically uncalibrated).  Their split IS the lesson: beyond the
    // Debye-Huckel tail only the calorimetric fit tracks the measured curve.
    PitzerSingleSalt anchored = model;
    anchored.dbeta0_dT = anchored.dbeta1_dT = anchored.dCphi_dT = 0.0;
    auto Lphi = [&](const PitzerSingleSalt& k_, scalar m) -> scalar
    { return k_.Lphi(m, T); };   // ONE implementation: the kernel's own

    csv << "m,gamma_pm,phi,a_w,L_phi_fit,L_phi_anchored\n";
    csv << std::scientific << std::setprecision(8);
    const scalar dm = (n > 1) ? (mTo - mFrom) / static_cast<scalar>(n - 1) : 0.0;
    for (std::size_t k = 0; k < n; ++k)
    {
        const scalar m = mFrom + dm * static_cast<scalar>(k);
        csv << m << "," << model.gammaPM(m, T) << "," << model.osmoticCoefficient(m, T)
            << "," << model.waterActivity(m, T)
            << "," << Lphi(model, m) << "," << Lphi(anchored, m) << "\n";
    }

    // -- optional VALIDATION vs a measured L_phi dataset -----------------------
    //   validation { dataset "constant/experiments/...dat"; series naoh; }
    // Explicit and glass-box: the op names the file + the series it compares
    // against, computes the AAD at the MEASURED molalities inside the scan
    // window (skipping the near-zero band |meas| < 50 cal/mol -- the curve
    // crosses zero; a ratio there is noise), prints it aloud and emits it as
    // diagnostics so the golden master locks it.
    if (dict->found("validation"))
    {
        auto v   = dict->subDict("validation");
        auto ds  = Dictionary::fromFile(v->lookupWord("dataset"));
        auto pts = ds->lookupDictList(v->lookupWord("series"));
        const scalar CALORIE = 4.184;
        // The fit's data window (the calorimetric contract): in-window points
        // make the headline AAD; beyond it the comparison is an EXTRAPOLATION
        // and is reported SEPARATELY (one blended number would mislead).
        scalar wLo = mFrom, wHi = mTo;
        if (v->found("window"))
        {
            auto w = v->lookupList("window");
            if (w.size() == 2) { wLo = w[0]; wHi = w[1]; }
        }
        scalar sumRel = 0.0, sumAbs = 0.0, extrapMax = 0.0, extrapAtM = 0.0;
        int nRel = 0, nAbs = 0, nExtrap = 0;
        for (const auto& e : pts)
        {
            const scalar m = e->lookupScalar("m");
            if (m < mFrom || m > mTo) continue;
            const scalar meas = e->lookupScalar("phiL") * CALORIE;   // cal -> J
            const scalar pred = Lphi(model, m);
            const scalar dev  = std::fabs(pred - meas);
            if (m >= wLo && m <= wHi)
            {
                sumAbs += dev; ++nAbs;
                if (std::fabs(meas) >= 50.0 * CALORIE)
                { sumRel += dev / std::fabs(meas); ++nRel; }
            }
            else
            {
                ++nExtrap;
                if (dev > extrapMax) { extrapMax = dev; extrapAtM = m; }
            }
        }
        if (nAbs > 0)
        {
            const scalar relPct = (nRel > 0) ? 100.0 * sumRel / nRel : 0.0;
            diag_["Lphi_AAD_rel_pct"]  = relPct;
            diag_["Lphi_AAD_abs_Jmol"] = sumAbs / nAbs;
            diag_["Lphi_nMeas"]        = static_cast<scalar>(nAbs);
            if (verbosity >= 1)
                std::cout << "  L_phi validation vs " << v->lookupWord("dataset")
                          << " [" << v->lookupWord("series") << "], window "
                          << wLo << "-" << wHi << " mol/kg: rel-AAD "
                          << std::fixed << std::setprecision(2) << relPct
                          << " % (" << nRel << " pts, near-zero skipped), abs-AAD "
                          << std::setprecision(1) << (sumAbs / nAbs)
                          << " J/mol over " << nAbs << " points\n";
        }
        if (nExtrap > 0)
        {
            diag_["Lphi_extrap_maxdev_Jmol"] = extrapMax;
            if (verbosity >= 1)
                std::cout << "  L_phi EXTRAPOLATION beyond the window: " << nExtrap
                          << " measured points; worst deviation "
                          << std::fixed << std::setprecision(0) << extrapMax
                          << " J/mol at m = " << std::setprecision(1) << extrapAtM
                          << " -- the fit is NOT data-backed there.\n";
        }
    }

    // -- KPIs for the golden master (word-char keys; lock the curve shape) -----
    diag_["gamma_pm_1m"] = model.gammaPM(1.0, T);
    diag_["gamma_pm_3m"] = model.gammaPM(3.0, T);
    diag_["phi_1m"]      = model.osmoticCoefficient(1.0, T);
    diag_["aw_1m"]       = model.waterActivity(1.0, T);

    if (verbosity >= 2)
        std::cout << "pitzerActivity: " << cation << "/" << anion
                  << " (nu " << model.nu_c << ":" << model.nu_a << ", 25 C), m = "
                  << mFrom << "-" << mTo << " mol/kg, " << n << " pts.  gamma_pm(1.0) = "
                  << std::fixed << std::setprecision(4) << model.gammaPM(1.0) << "\n";
    return 0;
}

} // namespace Choupo
