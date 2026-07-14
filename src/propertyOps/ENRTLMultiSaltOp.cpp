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

#include "ENRTLMultiSaltOp.H"
#include "thermo/electrolyte/ENRTLMultiSalt.H"
#include "thermo/electrolyte/ENRTLSingleSalt.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <fstream>
#include <iomanip>
#include <iostream>
#include <stdexcept>

namespace Choupo {

int ENRTLMultiSaltOp::run(const DictPtr& dict, const ThermoPackage&, int verbosity)
{
    // ---- salts from the dict, parameters from the curated catalogue --------
    const auto saltDicts = dict->lookupDictList("salts");
    if (saltDicts.size() < 2)
        throw std::runtime_error("enrtlMultiSalt: give at least two salts ( {cation ..; anion ..;} ... )");

    ENRTLMultiSalt ms;
    struct SaltRef { std::string cat, an; int ci, ai; double tmca, tcam; };
    std::vector<SaltRef> salts;

    // species first (addCation/addAnion reset the parameter tables)
    for (const auto& s : saltDicts)
    {
        const std::string cat = s->lookupWord("cation");
        const std::string an  = s->lookupWord("anion");
        const int zc = electrolyte::ionCharge(cat);
        const int za = electrolyte::ionCharge(an);
        if (zc <= 0 || za >= 0)
            throw std::runtime_error("enrtlMultiSalt: '" + cat + "' must be a cation and '"
                + an + "' an anion");
        if (zc != 1 || za != -1)
            throw std::runtime_error("enrtlMultiSalt: this slice covers 1-1 salts; ("
                + cat + "," + an + ") is " + std::to_string(zc) + ":" + std::to_string(-za));
        int ci = -1, ai = -1;
        for (int c = 0; c < ms.nC(); ++c) if (ms.cations[c].name == cat) ci = c;
        for (int a = 0; a < ms.nA(); ++a) if (ms.anions[a].name  == an)  ai = a;
        if (ci < 0) ci = ms.addCation(cat, zc);
        if (ai < 0) ai = ms.addAnion(an, -za);
        salts.push_back({cat, an, ci, ai, 0, 0});
    }
    // parameters second, from the catalogue (case-local overlay -> standards)
    for (auto& s : salts)
    {
        auto p = electrolyte::findENRTLPair(s.cat, s.an);
        if (!p)
            throw std::runtime_error("enrtlMultiSalt: no eNRTL pair record for ("
                + s.cat + "," + s.an + ") in the case or the standards catalogue");
        s.tmca = p->lookupScalar("tau_m_ca");
        s.tcam = p->lookupScalar("tau_ca_m");
        ms.setPair(s.ci, s.ai, s.tmca, s.tcam, p->lookupScalarOrDefault("alpha", 0.2));
    }

    // optional same-anion electrolyte-electrolyte parameter (Fig 1-2's tau)
    const double tauEE = dict->lookupScalarOrDefault("tauEE", 0.0);
    if (tauEE != 0.0 && salts.size() == 2 && salts[0].ai == salts[1].ai)
    {
        ms.setTauEEsameAnion(salts[0].ai, salts[0].ci, salts[1].ci, tauEE);
        ms.setTauEEsameAnion(salts[0].ai, salts[1].ci, salts[0].ci, -tauEE);
    }

    // formulation: `published` (the industrial 2009 expressions, mixing-rule
    // binaries differentiated as constants) or `consistent` (the exact
    // Gibbs-Duhem-consistent derivative of the same Gex -- the refined-eNRTL
    // idea of Bollas, Chen & Barton 2008 applied to the symmetric form).
    const std::string formulation =
        dict->found("formulation") ? dict->lookupWord("formulation") : "published";
    if (formulation != "published" && formulation != "consistent")
        throw std::runtime_error("enrtlMultiSalt: formulation must be `published` or `consistent`");
    const bool cons = (formulation == "consistent");

    const double mTot = dict->lookupScalarOrDefault("totalMolality", 4.0);
    const int nPts    = static_cast<int>(dict->lookupScalarOrDefault("sweepPoints", 21));
    const double T    = 298.15;

    if (salts.size() != 2)
        throw std::runtime_error("enrtlMultiSalt: the sweep slice handles exactly 2 salts"
                                 " (n-salt states are a straight extension when a case needs one)");

    // molality vectors for a fraction f of salt 2 (per-cation / per-anion)
    auto stateAt = [&](double f, std::vector<double>& mC, std::vector<double>& mA)
    {
        mC.assign(ms.nC(), 0.0); mA.assign(ms.nA(), 0.0);
        mC[salts[0].ci] += mTot * (1.0 - f);  mA[salts[0].ai] += mTot * (1.0 - f);
        mC[salts[1].ci] += mTot * f;          mA[salts[1].ai] += mTot * f;
    };

    // ---- the sweep ----------------------------------------------------------
    std::ofstream csv(dict->subDict("output")->lookupWord("file"));
    if (!csv.is_open()) throw std::runtime_error("enrtlMultiSalt: cannot open output file");
    csv << "x2,m1,m2,gamma1,gamma2,ln_gamma1,ln_gamma2\n" << std::scientific << std::setprecision(8);

    std::vector<double> xs, ln1, ln2;
    for (int k = 0; k < nPts; ++k)
    {
        const double f = double(k) / (nPts - 1);
        std::vector<double> mC, mA; stateAt(f, mC, mA);
        // avoid the exactly-absent-ion endpoint states: evaluate gamma of a
        // TRACE of the missing salt (1e-9 mol/kg), the Harned convention.
        const double eps = 1e-9;
        if (mC[salts[1].ci] == 0.0) { mC[salts[1].ci] = eps; mA[salts[1].ai] += 0.0; }
        if (mC[salts[0].ci] == 0.0) { mC[salts[0].ci] = eps; }
        const double g1 = ms.gammaPMm(salts[0].ci, salts[0].ai, mC, mA, T, cons);
        const double g2 = ms.gammaPMm(salts[1].ci, salts[1].ai, mC, mA, T, cons);
        csv << f << "," << mTot*(1-f) << "," << mTot*f << ","
            << g1 << "," << g2 << "," << std::log(g1) << "," << std::log(g2) << "\n";
        xs.push_back(f); ln1.push_back(std::log(g1)); ln2.push_back(std::log(g2));
    }
    csv.close();

    // ---- diagnostics --------------------------------------------------------
    auto linFit = [&](const std::vector<double>& y, double& slope, double& r2)
    {
        const int n = int(xs.size());
        double sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
        for (int i = 0; i < n; ++i)
        { sx += xs[i]; sy += y[i]; sxx += xs[i]*xs[i]; sxy += xs[i]*y[i]; syy += y[i]*y[i]; }
        slope = (n*sxy - sx*sy) / (n*sxx - sx*sx);
        const double r = (n*sxy - sx*sy)
                       / std::sqrt((n*sxx - sx*sx) * (n*syy - sy*sy));
        r2 = r*r;
    };
    double sl1, r21, sl2, r22;
    linFit(ln1, sl1, r21); linFit(ln2, sl2, r22);

    // reduction pin: pure-salt endpoints vs the validated single-salt kernel
    double pinDev = 0.0;
    for (int which = 0; which < 2; ++which)
    {
        const auto& s = salts[which];
        ENRTLSingleSalt ss;
        ss.tau_m_ca = s.tmca; ss.tau_ca_m = s.tcam;
        std::vector<double> mC(ms.nC(), 0.0), mA(ms.nA(), 0.0);
        mC[s.ci] = mTot; mA[s.ai] = mTot;
        const double gMulti  = ms.gammaPMm(s.ci, s.ai, mC, mA, T, cons);
        const double gSingle = ss.gammaPM(mTot);
        pinDev = std::max(pinDev, std::fabs(gMulti/gSingle - 1.0));
    }

    // the oracle: exact at a pure-salt state; DECLARED inconsistency mid-sweep
    std::vector<double> mCp(ms.nC(), 0.0), mAp(ms.nA(), 0.0);
    mCp[salts[0].ci] = mTot; mAp[salts[0].ai] = mTot;
    const double devPure = ms.verify(mCp, mAp, T, cons);
    std::vector<double> mCm, mAm; stateAt(0.5, mCm, mAm);
    const double devMid  = ms.verify(mCm, mAm, T, cons);
    // the formulation gap at mid-sweep: how much the exact derivative moves
    // gamma_pm relative to the published expressions (the lesson, either way)
    const double gapMid = std::fabs(
        std::log(ms.gammaPMm(salts[0].ci, salts[0].ai, mCm, mAm, T, true))
      - std::log(ms.gammaPMm(salts[0].ci, salts[0].ai, mCm, mAm, T, false)));

    diag_["gamma1_pure"]        = std::exp(ln1.front());
    diag_["gamma1_trace"]       = std::exp(ln1.back());
    diag_["gamma2_trace"]       = std::exp(ln2.front());
    diag_["gamma2_pure"]        = std::exp(ln2.back());
    diag_["harned_slope_1"]     = sl1;
    diag_["harned_slope_2"]     = sl2;
    // Harned coefficients on the experimental convention (log10, per molal of
    // the OTHER salt): log10 gamma_1 = log10 gamma_1^0 - alpha_1 m_2.
    // Directly comparable to isopiestic tables (e.g. Robinson 1961).
    diag_["harned_alpha_1"]     = -sl1 / (2.302585093 * mTot);
    diag_["harned_alpha_2"]     =  sl2 / (2.302585093 * mTot);
    diag_["harned_R2_min"]      = std::min(r21, r22);
    diag_["reduction_pin_dev"]  = pinDev;
    diag_["oracle_pure_dev"]    = devPure;
    diag_["gibbsDuhem_dev_mid"] = devMid;
    diag_["totalMolality"]      = mTot;
    diag_["tauEE"]              = tauEE;
    diag_["consistent"]         = cons ? 1.0 : 0.0;
    diag_["formulation_gap_mid"] = gapMid;

    if (verbosity >= 2)
    {
        std::cout << "enrtlMultiSalt: " << salts[0].cat << salts[0].an << " + "
                  << salts[1].cat << salts[1].an << " at " << mTot
                  << " mol/kg total, " << nPts << " pts, tauEE = " << tauEE
                  << ", formulation = " << formulation << "\n"
                  << std::fixed << std::setprecision(4)
                  << "  gamma_pm(" << salts[0].cat << salts[0].an << "): pure "
                  << std::exp(ln1.front()) << " -> trace " << std::exp(ln1.back())
                  << "   Harned slope " << sl1 << " (R^2 " << std::setprecision(6) << r21 << ")\n"
                  << std::setprecision(4)
                  << "  gamma_pm(" << salts[1].cat << salts[1].an << "): trace "
                  << std::exp(ln2.front()) << " -> pure " << std::exp(ln2.back())
                  << "   Harned slope " << sl2 << " (R^2 " << std::setprecision(6) << r22 << ")\n";
        std::cout << std::scientific << std::setprecision(2)
                  << "  reduction pin (pure endpoints vs ENRTLSingleSalt): " << pinDev << "\n"
                  << "  FD oracle: pure-salt " << devPure
                  << "  |  mid-sweep " << devMid << "\n";
        if (cons)
            std::cout << "     (consistent formulation: gamma IS the exact derivative of\n"
                         "      Gex -- the oracle closes at every composition; the refined-\n"
                         "      eNRTL idea, Bollas, Chen & Barton 2008, AIChE J 54, 1608.)\n";
        else
            std::cout << "     (mid-sweep = the DECLARED Gibbs-Duhem inconsistency of the\n"
                         "      published expressions -- composition-dependent mixing rules\n"
                         "      differentiated as constants; `formulation consistent;` closes\n"
                         "      it: Bollas, Chen & Barton 2008, AIChE J 54, 1608.)\n";
        std::cout << std::scientific << std::setprecision(2)
                  << "  formulation gap at mid-sweep, |dln gamma_pm(salt1)|: " << gapMid << "\n";
    }
    return 0;
}

} // namespace Choupo
