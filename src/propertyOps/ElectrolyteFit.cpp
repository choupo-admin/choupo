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

#include "ElectrolyteFit.H"

#include "EvidencePartition.H"
#include "FitAlgebra.H"
#include "FitObjective.H"
#include "thermo/RecordResolver.H"
#include "thermo/electrolyte/ENRTLSingleSalt.H"
#include "thermo/electrolyte/PitzerSingleSalt.H"
#include "thermo/electrolyte/SaltFromCatalogue.H"

#include <algorithm>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <numeric>
#include <sstream>
#include <stdexcept>

namespace Choupo
{

namespace
{

struct Point { scalar m, gamma, phi; bool heldOut; };

//  The salt's charges and stoichiometry, from its two species records.
struct Salt { scalar zc, za, nuc, nua; };

Salt saltOf(const std::string& cation, const std::string& anion)
{
    const int zc = electrolyte::ionCharge(SpeciesId(cation));
    const int za = electrolyte::ionCharge(SpeciesId(anion));
    if (zc <= 0 || za >= 0)
        throw std::runtime_error("electrolyteFit: '" + cation + "' must be a"
            " cation and '" + anion + "' an anion (their species records say"
            " z = " + std::to_string(zc) + " and " + std::to_string(za) + ")");
    const int g = std::gcd(zc, -za);
    return { scalar(zc), scalar(-za), scalar((-za) / g), scalar(zc / g) };
}

int gradeOf(scalar maxPct, const sVector& lim)
{
    if (maxPct <= lim[0]) return 0;
    if (maxPct <= lim[1]) return 1;
    if (maxPct <= lim[2]) return 2;
    return 3;
}

const char* gradeWord(int g)
{
    static const char* w[] = { "clean", "warning", "severe", "refused" };
    return w[g];
}

}   // namespace

int ElectrolyteFit::run(const DictPtr& dict, const ThermoPackage& /*thermo*/, int verbosity)
{
    diag_.clear();
    const std::string op = "electrolyteFit";
    const std::string cation = dict->lookupWord("cation");
    const std::string anion  = dict->lookupWord("anion");
    const std::string model  = dict->lookupWord("model");
    if (model != "pitzer" && model != "eNRTL")
        throw std::runtime_error(op + ": `model " + model + ";` -- the models"
            " built are `pitzer` (PitzerSingleSalt.H) and `eNRTL`"
            " (ENRTLSingleSalt.H).");
    fitobj::requireLeastSquares(dict, op);

    const Salt s = saltOf(cation, anion);

    // ---- the evidence ------------------------------------------------------
    EvidenceDataset ds;
    ds.path = dict->lookupWord("dataset");
    ds.role = "fit";
    const EvidencePartition::Table tab = EvidencePartition::loadTable(ds, op);
    const int cm = tab.column("m"), cg = tab.column("gamma"), cp = tab.column("phi");
    if (cm < 0 || cg < 0 || cp < 0)
        throw std::runtime_error(op + ": dataset '" + ds.path + "' must carry"
            " the columns `m` (molality), `gamma` (gamma_pm) and `phi`.");
    if (!tab.file->found("temperature"))
        throw std::runtime_error(op + ": dataset '" + ds.path + "' states no"
            " `temperature` -- every point of a gamma_pm/phi table is at one"
            " stated temperature, and the fit is evaluated there.");
    const scalar T = tab.file->lookupScalar("temperature");

    int every = 0, offset = 0;
    if (dict->found("heldOut"))
    {
        auto h = dict->subDict("heldOut");
        every  = static_cast<int>(h->lookupScalar("every"));
        offset = static_cast<int>(h->lookupScalarOrDefault("offset", 0.0));
        if (every < 2 || offset < 0 || offset >= every)
            throw std::runtime_error(op + ": `heldOut { every N; offset k; }`"
                " needs N >= 2 and 0 <= k < N.");
    }
    std::vector<Point> pts;
    for (std::size_t r = 0; r < tab.rows.size(); ++r)
    {
        //  molality: the loader returns it in canonical SI (kmol/kg); the
        //  closed forms take mol/kg.
        const scalar m = tab.rows[r][cm] * 1000.0;
        //  The first and the last row are never held out: the fitted window
        //  is then the dataset's, and a held-out point is an interpolation.
        const bool held = every > 0 && static_cast<int>(r) % every == offset
                       && r != 0 && r + 1 != tab.rows.size();
        pts.push_back({ m, tab.rows[r][cg], tab.rows[r][cp], held });
    }
    std::vector<const Point*> fitPts, heldPts;
    for (const auto& p : pts) (p.heldOut ? heldPts : fitPts).push_back(&p);

    // ---- the model ---------------------------------------------------------
    PitzerSingleSalt pz;
    pz.nu_c = s.nuc; pz.nu_a = s.nua; pz.z_c = s.zc; pz.z_a = s.za;
    ENRTLSingleSalt en;
    en.nu_c = s.nuc; en.nu_a = s.nua; en.z_c = s.zc; en.z_a = s.za;

    std::vector<std::string> names;
    std::vector<sVector> starts;
    bool fitBeta2 = false;
    if (model == "pitzer")
    {
        auto pd = dict->found("pitzer") ? dict->subDict("pitzer") : Dictionary::fromString("");
        pz.alpha1 = pd->lookupScalarOrDefault("alpha1", 2.0);
        pz.alpha2 = pd->lookupScalarOrDefault("alpha2", 12.0);
        fitBeta2  = pd->lookupWordOrDefault("fitBeta2", "false") == "true";
        names = { "beta0", "beta1", "Cphi" };
        if (fitBeta2) names.push_back("beta2");
        starts = { sVector(names.size(), 0.0) };
    }
    else
    {
        auto ed = dict->found("eNRTL") ? dict->subDict("eNRTL") : Dictionary::fromString("");
        en.alpha = ed->lookupScalarOrDefault("alpha", 0.2);
        names = { "tau_m_ca", "tau_ca_m" };
        //  A stated grid of starts (the residual is not linear in tau); the
        //  best of the four is kept.  Chen & Evans's water-NaCl pair
        //  (8.885, -4.549) sits inside it.
        starts = { {6.0, -3.0}, {8.0, -4.0}, {10.0, -5.0}, {12.0, -6.0} };
    }
    const std::size_t P = names.size();

    auto setParams = [&](const sVector& x)
    {
        if (model == "pitzer")
        {
            pz.beta0 = x[0]; pz.beta1 = x[1]; pz.Cphi = x[2];
            pz.beta2 = fitBeta2 ? x[3] : 0.0;
        }
        else { en.tau_m_ca = x[0]; en.tau_ca_m = x[1]; }
    };
    auto gammaOf = [&](scalar m) -> scalar
    { return model == "pitzer" ? pz.gammaPM(m, T) : en.gammaPM(m, T); };
    auto phiOf = [&](scalar m) -> scalar
    { return model == "pitzer" ? pz.osmoticCoefficient(m, T) : en.osmoticCoefficient(m, T); };

    auto residual = [&](const sVector& x) -> sVector
    {
        setParams(x);
        sVector r;
        for (const Point* p : fitPts)
        {
            r.push_back(std::log(gammaOf(p->m)) - std::log(p->gamma));
            r.push_back(phiOf(p->m) - p->phi);
        }
        return r;
    };
    auto ssr = [](const sVector& r)
    { scalar s2 = 0.0; for (scalar v : r) s2 += v * v; return s2; };

    if (fitPts.size() < P + 1)
        throw std::runtime_error(op + ": " + std::to_string(fitPts.size())
            + " points left to fit " + std::to_string(P) + " parameters --"
            " too few to say anything about the fit.");

    // ---- Levenberg-Marquardt ----------------------------------------------
    sVector best; scalar bestS = 1e300;
    for (const sVector& x0 : starts)
    {
        sVector x = x0;
        sVector r = residual(x);
        scalar S = ssr(r);
        if (!std::isfinite(S)) continue;
        scalar lambda = 1e-3;
        for (int it = 0; it < 300; ++it)
        {
            std::vector<sVector> J(r.size(), sVector(P, 0.0));
            for (std::size_t j = 0; j < P; ++j)
            {
                const scalar h = 1e-6 * std::max<scalar>(1.0, std::fabs(x[j]));
                sVector xp = x, xm = x; xp[j] += h; xm[j] -= h;
                const sVector rp = residual(xp), rm = residual(xm);
                for (std::size_t k = 0; k < r.size(); ++k)
                    J[k][j] = (rp[k] - rm[k]) / (2.0 * h);
            }
            bool improved = false;
            for (int tries = 0; tries < 20 && !improved; ++tries)
            {
                const sVector d = fitAlgebra::solveDamped(J, r, lambda);
                sVector xn = x;
                for (std::size_t j = 0; j < P; ++j) xn[j] += d[j];
                const sVector rn = residual(xn);
                const scalar Sn = ssr(rn);
                if (std::isfinite(Sn) && Sn < S)
                {
                    const scalar dS = S - Sn;
                    x = xn; r = rn; S = Sn; improved = true;
                    lambda = std::max<scalar>(lambda * 0.1, 1e-12);
                    if (dS <= 1e-15 * std::max<scalar>(S, 1e-30)) it = 300;
                }
                else lambda *= 10.0;
            }
            if (!improved) break;
        }
        if (S < bestS) { bestS = S; best = x; }
    }
    if (best.empty())
        throw std::runtime_error(op + ": no start of the search gave a finite"
            " residual -- the model cannot be evaluated on these points.");
    setParams(best);

    // ---- errors ------------------------------------------------------------
    struct Err { scalar gSum = 0, pSum = 0, maxPct = 0; std::size_t n = 0; };
    auto errorsOf = [&](const std::vector<const Point*>& set)
    {
        Err e;
        for (const Point* p : set)
        {
            const scalar eg = 100.0 * std::fabs(gammaOf(p->m) - p->gamma) / p->gamma;
            const scalar ep = 100.0 * std::fabs(phiOf(p->m) - p->phi) / p->phi;
            e.gSum += eg; e.pSum += ep; ++e.n;
            e.maxPct = std::max({ e.maxPct, eg, ep });
        }
        return e;
    };
    const Err fe = errorsOf(fitPts), he = errorsOf(heldPts);

    scalar mLo = 1e300, mHi = -1e300;
    for (const Point* p : fitPts) { mLo = std::min(mLo, p->m); mHi = std::max(mHi, p->m); }

    for (std::size_t j = 0; j < P; ++j) diag_["param_" + names[j]] = best[j];
    diag_["nFit"] = scalar(fe.n);
    diag_["nHeldOut"] = scalar(he.n);
    diag_["molality_min"] = mLo;
    diag_["molality_max"] = mHi;
    diag_["temperature_K"] = T;
    diag_["rms"] = std::sqrt(bestS / (2.0 * fe.n));
    diag_["inSample_gamma_AAD_pct"] = fe.gSum / fe.n;
    diag_["inSample_phi_AAD_pct"] = fe.pSum / fe.n;
    diag_["inSample_max_pct"] = fe.maxPct;
    if (he.n)
    {
        diag_["heldOut_gamma_AAD_pct"] = he.gSum / he.n;
        diag_["heldOut_phi_AAD_pct"] = he.pSum / he.n;
        diag_["heldOut_max_pct"] = he.maxPct;
    }
    int gIn = -1, gHeld = -1;
    sVector lim;
    if (dict->found("grade"))
    {
        lim = dict->subDict("grade")->lookupList("limits_pct");
        if (lim.size() != 3 || !(lim[0] > 0 && lim[0] < lim[1] && lim[1] < lim[2]))
            throw std::runtime_error(op + ": `grade { limits_pct ( c w s ); }`"
                " needs three increasing positive numbers (the upper limits of"
                " clean, warning and severe, in per cent).");
        gIn = gradeOf(fe.maxPct, lim);
        diag_["grade_inSample"] = scalar(gIn);
        if (he.n) { gHeld = gradeOf(he.maxPct, lim); diag_["grade_heldOut"] = scalar(gHeld); }
    }

    // ---- the report ----------------------------------------------------------
    if (verbosity >= 1)
    {
        std::ostringstream os;
        os << std::fixed;
        os << "  electrolyteFit " << cation << "-" << anion << " (" << model
           << ", nu " << s.nuc << ":" << s.nua << ", z " << s.zc << ":" << s.za
           << ") at T = " << std::setprecision(2) << T << " K, molality "
           << std::setprecision(3) << mLo << "-" << mHi << " mol/kg\n";
        os << "  residual: ln gamma_pm and phi, equal weight; search:"
              " Levenberg-Marquardt" << (starts.size() > 1 ? " from 4 starts" : "")
           << "\n";
        for (std::size_t j = 0; j < P; ++j)
            os << "    " << std::left << std::setw(9) << names[j] << std::right
               << std::setprecision(8) << std::setw(14) << best[j] << "\n";
        if (model == "pitzer")
            os << "    (alpha1 " << std::setprecision(2) << pz.alpha1 << ", alpha2 "
               << pz.alpha2 << ", b 1.2 fixed" << (fitBeta2 ? "" : "; beta2 0")
               << ")\n";
        else
            os << "    (alpha " << std::setprecision(2) << en.alpha << " fixed)\n";
        os << "       m      gamma   model   err%     phi    model   err%   point\n";
        for (const auto& p : pts)
        {
            const scalar g = gammaOf(p.m), ph = phiOf(p.m);
            os << std::setprecision(3) << std::setw(8) << p.m
               << std::setprecision(4) << std::setw(9) << p.gamma << std::setw(8) << g
               << std::setprecision(2) << std::setw(7) << 100.0 * (g - p.gamma) / p.gamma
               << std::setprecision(4) << std::setw(8) << p.phi << std::setw(8) << ph
               << std::setprecision(2) << std::setw(7) << 100.0 * (ph - p.phi) / p.phi
               << "   " << (p.heldOut ? "held out" : "fitted") << "\n";
        }
        os << std::setprecision(3)
           << "  IN-SAMPLE (the " << fe.n << " points it was fitted to): AAD gamma "
           << fe.gSum / fe.n << " %, phi " << fe.pSum / fe.n << " %, max "
           << fe.maxPct << " %";
        if (gIn >= 0) os << " -> grade " << gradeWord(gIn) << " (in-sample)";
        os << "\n";
        if (he.n)
        {
            os << "  HELD OUT (" << he.n << " interleaved points of the SAME source,"
                  " never handed to the fitter; not a validation): AAD gamma "
               << he.gSum / he.n << " %, phi " << he.pSum / he.n << " %, max "
               << he.maxPct << " %";
            if (gHeld >= 0) os << " -> " << gradeWord(gHeld) << " by the same limits";
            os << "\n";
        }
        else os << "  Nothing held out.\n";
        std::cout << os.str();
    }

    // ---- the proposal --------------------------------------------------------
    if (dict->found("proposal"))
    {
        const std::string file = dict->subDict("proposal")->lookupWord("file");
        records::refuseStandardsWrite(op, "proposal.file", file);
        std::ofstream f(file);
        if (!f) throw std::runtime_error(op + ": cannot write '" + file + "'");
        f << std::setprecision(10);
        f << "// Written by electrolyteFit (" << cation << "-" << anion << ", "
          << model << "): the parameters this case regresses.\n";
        f << "cation " << cation << ";\nanion " << anion << ";\nmodel " << model << ";\n";
        f << "parameters\n{\n";
        for (std::size_t j = 0; j < P; ++j)
            f << "    " << names[j] << " " << best[j] << ";\n";
        if (model == "pitzer")
        {
            if (!fitBeta2) f << "    beta2 0;\n";
            f << "    alpha1 " << pz.alpha1 << ";\n    alpha2 " << pz.alpha2 << ";\n";
        }
        else f << "    alpha " << en.alpha << ";\n";
        f << "}\nfit\n{\n";
        f << "    temperature " << T << ";\n";
        f << "    molalityMin " << mLo << ";\n    molalityMax " << mHi << ";\n";
        f << "    nFit " << fe.n << ";\n    nHeldOut " << he.n << ";\n";
        f << "    inSampleGammaAAD_pct " << fe.gSum / fe.n << ";\n";
        f << "    inSamplePhiAAD_pct " << fe.pSum / fe.n << ";\n";
        f << "    inSampleMax_pct " << fe.maxPct << ";\n";
        if (he.n)
        {
            f << "    heldOutGammaAAD_pct " << he.gSum / he.n << ";\n";
            f << "    heldOutPhiAAD_pct " << he.pSum / he.n << ";\n";
            f << "    heldOutMax_pct " << he.maxPct << ";\n";
        }
        if (gIn >= 0) f << "    gradeInSample " << gradeWord(gIn) << ";\n";
        if (gHeld >= 0) f << "    gradeHeldOut " << gradeWord(gHeld) << ";\n";
        f << "}\n";
    }
    return 0;
}

} // namespace Choupo
