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
Description
    The `petroleumCuts` op -- see PetroleumCuts.H for the contract and the
    citations (Riazi, ASTM MNL50, by equation and page).
\*---------------------------------------------------------------------------*/

#include "PetroleumCuts.H"

#include "ConstantEstimator.H"
#include "thermo/DerivedClosures.H"
#include "thermo/RecordResolver.H"
#include "thermo/vaporPressure/AmbroseWalton.H"

#include <algorithm>
#include <cmath>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

struct CurvePoint { double f; double T; };

struct Cut
{
    double lo = 0, hi = 0;          // distilled interval on the declared basis
    double width = 0;               // = hi - lo
    double Tb = 0;                  // K, TBP at the mid-point
    double SG = 0;
    double vol = 0, mass = 0, mole = 0;   // fractions of the feed
    ConstantEstimate est;
};

[[noreturn]] void refuse(const std::string& op, const std::string& why)
{
    throw std::runtime_error("petroleumCuts '" + op + "': " + why);
}

// Riazi Eq. 2.4 (p. 32), Eq. 2.13 (p. 35).
double apiOf(double SG)            { return 141.5 / SG - 131.5; }
double watsonOf(double Tb_K, double SG)
{
    return std::cbrt(1.8 * Tb_K) / SG;
}

// Piecewise-linear TBP temperature at distilled fraction f; REFUSES outside
// the supplied curve (nothing is extrapolated).
double interpT(const std::vector<CurvePoint>& c, double f, const std::string& op,
               const char* what)
{
    constexpr double eps = 1e-12;
    if (f < c.front().f - eps || f > c.back().f + eps)
        refuse(op, std::string("the ") + what + " at distilled fraction "
               + std::to_string(f) + " lies outside the supplied TBP curve ["
               + std::to_string(c.front().f) + ", " + std::to_string(c.back().f)
               + "]: cannot extrapolate -- declare curve points that cover it.");
    for (size_t k = 1; k < c.size(); ++k)
        if (f <= c[k].f + eps)
        {
            const double t = (f - c[k - 1].f) / (c[k].f - c[k - 1].f);
            return c[k - 1].T + t * (c[k].T - c[k - 1].T);
        }
    return c.back().T;
}

// Fractions of the feed on the three bases, given the cuts' SG.
void fractionsOf(std::vector<Cut>& cuts, bool volumeBasis)
{
    double sumV = 0, sumW = 0;
    for (auto& c : cuts)
    {
        if (volumeBasis) { c.vol = c.width; c.mass = c.width * c.SG; }
        else             { c.mass = c.width; c.vol = c.width / c.SG; }
        sumV += c.vol; sumW += c.mass;
    }
    double sumN = 0;
    for (auto& c : cuts) { c.vol /= sumV; c.mass /= sumW; c.mole = c.mass / c.est.MW; sumN += c.mole; }
    for (auto& c : cuts) c.mole /= sumN;
}

struct Averages { double VABP, MABP, CABP, MeABP; };

// Riazi Eq. 3.3 (volume, mole averages), Eq. 3.4 (CABP), Eq. 3.5 (MeABP).
Averages averagesOf(const std::vector<Cut>& cuts)
{
    Averages a{0, 0, 0, 0};
    double s = 0;
    for (const auto& c : cuts)
    {
        a.VABP += c.vol * c.Tb;
        a.MABP += c.mole * c.Tb;
        s += c.vol * std::cbrt(1.8 * c.Tb - 459.67);
    }
    a.CABP  = s * s * s / 1.8 + 255.37;
    a.MeABP = 0.5 * (a.MABP + a.CABP);
    return a;
}

void characterise(std::vector<Cut>& cuts, const ConstantEstimator& rd,
                  const std::string& op)
{
    for (auto& c : cuts)
    {
        bool ok = true; std::string err;
        c.est = rd.estimateFromScalars({ { "Tb", c.Tb }, { "SG", c.SG } }, ok, err);
        if (!ok) refuse(op, err);
    }
}

std::string two(int i)
{
    std::ostringstream o; o << std::setw(2) << std::setfill('0') << i; return o.str();
}

} // namespace

int PetroleumCuts::run(const DictPtr& dict, const ThermoPackage& /*thermo*/,
                       int verbosity)
{
    diag_.clear();
    const std::string op = dict->lookupWordOrDefault("name", "petroleumCuts");

    // ---------------- the curve ---------------------------------------------
    if (!dict->found("curve"))
        refuse(op, "no `curve { type TBP; basis volume|mass; points ( ... ); }` declared.");
    DictPtr cv = dict->subDict("curve");
    if (!cv->found("type"))
        refuse(op, "`curve.type` not declared (TBP is the only type implemented).");
    const std::string ctype = cv->lookupWord("type");
    if (ctype != "TBP")
        refuse(op, "conversion " + ctype + " -> TBP not implemented: only a TBP curve "
                   "is accepted (Riazi Eq. 3.14 / Table 3.2 give ASTM D86 -> TBP; it is "
                   "legible in the book but is not carried here, and nothing is guessed).");
    if (!cv->found("basis"))
        refuse(op, "`curve.basis` not declared: say whether the distilled fraction is "
                   "by `volume` or by `mass`.");
    const std::string basis = cv->lookupWord("basis");
    if (basis != "volume" && basis != "mass")
        refuse(op, "`curve.basis` '" + basis + "' unknown (volume | mass).");
    const bool volumeBasis = (basis == "volume");

    std::vector<CurvePoint> curve;
    for (const auto& e : cv->lookupDictList("points"))
        curve.push_back({ e->lookupScalar("fraction"), e->lookupScalar("T") });
    if (curve.size() < 3)
        refuse(op, "the TBP curve needs at least 3 points.");
    for (size_t k = 0; k < curve.size(); ++k)
    {
        if (curve[k].f < 0.0 || curve[k].f > 1.0)
            refuse(op, "curve fraction outside [0, 1].");
        if (k > 0 && !(curve[k].f > curve[k - 1].f))
            refuse(op, "TBP curve is not monotone: the distilled fractions must strictly increase.");
        if (k > 0 && !(curve[k].T > curve[k - 1].T))
            refuse(op, "TBP curve is not monotone: the temperature must strictly increase "
                       "with the distilled fraction.");
    }

    // ---------------- the feed SG -------------------------------------------
    if (!dict->found("feed"))
        refuse(op, "no `feed { specificGravity <SG 60/60 F>; }` (or `specificGravityFrom TBP;`) declared.");
    DictPtr fd = dict->subDict("feed");
    const bool sgGiven = fd->found("specificGravity");
    const bool sgFrom  = fd->found("specificGravityFrom");
    if (sgGiven == sgFrom)
        refuse(op, "the feed SG must be declared exactly one way: `specificGravity <value>;` "
                   "or `specificGravityFrom TBP;` (Riazi Eq. 3.17).");
    double SGfeed = 0.0;
    std::string sgFeedSource;
    if (sgGiven)
    {
        SGfeed = fd->lookupScalar("specificGravity");
        sgFeedSource = "declared";
    }
    else
    {
        if (fd->lookupWord("specificGravityFrom") != "TBP")
            refuse(op, "`feed.specificGravityFrom` accepts TBP only (Riazi Eq. 3.17, Table 3.4 TBP row).");
        if (!volumeBasis)
            refuse(op, "`specificGravityFrom TBP` (Eq. 3.17) needs the T10 and T50 of a "
                       "VOLUME-basis TBP curve; the curve basis is mass.");
        const double T10 = interpT(curve, 0.10, op, "T10");
        const double T50 = interpT(curve, 0.50, op, "T50");
        // Riazi Eq. 3.17, Table 3.4 TBP row (p. 102-103); T in K.
        SGfeed = 0.10431 * std::pow(T10, 0.12550) * std::pow(T50, 0.20862);
        sgFeedSource = "Riazi Eq. 3.17 (TBP row of Table 3.4)";
        const double T10C = T10 - 273.15, T50C = T50 - 273.15;
        if (T10C < 10.0 || T10C > 295.0 || T50C < 55.0 || T50C > 320.0 ||
            SGfeed < 0.67 || SGfeed > 0.97)
            std::cerr << "  [validity] Eq. 3.17 (TBP row): T10 = " << T10C << " C, T50 = "
                      << T50C << " C, SG = " << SGfeed << " are outside the fitted range "
                      "(T10 10-295 C, T50 55-320 C, SG 0.67-0.97); the estimate is an "
                      "extrapolation.\n";
    }
    if (!(SGfeed > 0.3 && SGfeed < 1.5))
        refuse(op, "feed SG " + std::to_string(SGfeed) + " is not a plausible 60/60 F specific gravity.");

    // ---------------- the cuts ----------------------------------------------
    if (!dict->found("cuts"))
        refuse(op, "no `cuts { boundaries ( ... ); }` (or `number N;`) declared.");
    DictPtr ct = dict->subDict("cuts");
    std::vector<double> bounds;
    if (ct->found("boundaries"))
        bounds = ct->lookupList("boundaries");
    else if (ct->found("number"))
    {
        const int n = static_cast<int>(std::lround(ct->lookupScalar("number")));
        if (n < 1) refuse(op, "`cuts.number` must be >= 1.");
        for (int i = 0; i <= n; ++i) bounds.push_back(static_cast<double>(i) / n);
    }
    else
        refuse(op, "`cuts` needs `boundaries ( ... );` or `number N;`.");
    if (bounds.size() < 2)
        refuse(op, "`cuts.boundaries` needs at least two entries.");
    for (size_t i = 1; i < bounds.size(); ++i)
        if (!(bounds[i] > bounds[i - 1]))
            refuse(op, "cut boundaries are not increasing.");
    if (std::abs(bounds.front()) > 1e-12 || std::abs(bounds.back() - 1.0) > 1e-12)
        refuse(op, "cut fractions do not sum to 1: the boundaries run from "
                   + std::to_string(bounds.front()) + " to " + std::to_string(bounds.back())
                   + " and must run from 0 to 1 (the cuts must partition the whole feed; "
                     "the curve need not reach the ends, only the cuts' mid-points).");

    std::vector<Cut> cuts(bounds.size() - 1);
    double fracSum = 0.0;
    for (size_t i = 0; i < cuts.size(); ++i)
    {
        cuts[i].lo = bounds[i]; cuts[i].hi = bounds[i + 1];
        cuts[i].width = cuts[i].hi - cuts[i].lo;
        fracSum += cuts[i].width;
        // Mid-point rule (Riazi, table of recommended methods, footnote a, p. 83).
        cuts[i].Tb = interpT(curve, 0.5 * (cuts[i].lo + cuts[i].hi), op, "cut mid-point");
    }
    if (std::abs(fracSum - 1.0) > 1e-12)
        refuse(op, "cut fractions do not sum to 1 (sum = " + std::to_string(fracSum) + ").");

    // ---------------- closure tolerance (REQUIRED, declared) ---------------
    if (!dict->found("closure") || !dict->subDict("closure")->found("specificGravityTolerance"))
        refuse(op, "`closure { specificGravityTolerance <relative>; }` not declared: the "
                   "tolerance within which the re-blended cuts must reproduce the feed SG "
                   "is the author's to state.");
    const double tol = dict->subDict("closure")->lookupScalar("specificGravityTolerance");
    if (!(tol > 0.0)) refuse(op, "`specificGravityTolerance` must be positive.");

    // ---------------- the cut SG --------------------------------------------
    if (!dict->found("specificGravity") || !dict->subDict("specificGravity")->found("method"))
        refuse(op, "`specificGravity { method constantWatsonK | declared; }` not declared: "
                   "the cut SG is ONE declared method.");
    DictPtr sg = dict->subDict("specificGravity");
    const std::string sgMethod = sg->lookupWord("method");

    std::unique_ptr<ConstantEstimator> rd = ConstantEstimator::New("RiaziDaubert");
    double Kbulk = 0.0;
    int iterations = 0;

    if (sgMethod == "declared")
    {
        const std::vector<double> vals = sg->lookupList("values");
        if (vals.size() != cuts.size())
            refuse(op, "`specificGravity.values` has " + std::to_string(vals.size())
                       + " entries for " + std::to_string(cuts.size()) + " cuts.");
        for (size_t i = 0; i < cuts.size(); ++i)
        {
            if (!(vals[i] > 0.3 && vals[i] < 1.5))
                refuse(op, "declared cut SG " + std::to_string(vals[i]) + " is not plausible.");
            cuts[i].SG = vals[i];
        }
        characterise(cuts, *rd, op);
        fractionsOf(cuts, volumeBasis);
    }
    else if (sgMethod == "constantWatsonK")
    {
        // Kw of the feed: Eq. 2.13 at the feed SG and the feed's MeABP (Eq. 3.5).
        // The mole fractions inside MABP depend on the cut SG, hence on Kw:
        // fixed point, started from the volume-average ABP (Eq. 3.3).
        double VABP0 = 0.0;
        for (auto& c : cuts) VABP0 += c.width * c.Tb;
        double Kw = std::cbrt(1.8 * VABP0) / SGfeed;
        bool converged = false;
        for (int it = 1; it <= 500; ++it)
        {
            iterations = it;
            for (auto& c : cuts) c.SG = std::cbrt(1.8 * c.Tb) / Kw;     // Eq. 2.13 rearranged
            characterise(cuts, *rd, op);
            fractionsOf(cuts, volumeBasis);
            const Averages a = averagesOf(cuts);
            const double Knew = std::cbrt(1.8 * a.MeABP) / SGfeed;
            if (std::abs(Knew - Kw) <= 1e-13 * Kw) { Kw = Knew; converged = true; break; }
            Kw = Knew;
        }
        if (!converged)
            refuse(op, "the bulk Watson K fixed point did not converge in 500 iterations.");
        for (auto& c : cuts) c.SG = std::cbrt(1.8 * c.Tb) / Kw;
        characterise(cuts, *rd, op);
        fractionsOf(cuts, volumeBasis);
        Kbulk = Kw;
    }
    else
        refuse(op, "`specificGravity.method` '" + sgMethod + "' unknown (constantWatsonK | declared).");

    // ---------------- the blend and the closure ----------------------------
    const Averages av = averagesOf(cuts);
    double SGmix = 0.0, MWmix = 0.0, invSum = 0.0;
    for (const auto& c : cuts)
    {
        SGmix  += c.vol * c.SG;           // Eq. 3.45 (volume fraction)
        invSum += c.mass / c.SG;          // Eq. 3.46 (weight fraction)
        MWmix  += c.mole * c.est.MW;      // Eq. 3.45 (mole fraction)
    }
    if (!volumeBasis) SGmix = 1.0 / invSum;
    const double KwMix = watsonOf(av.MeABP, SGmix);
    const double diffRel = (SGmix - SGfeed) / SGfeed;
    const bool closed = std::abs(diffRel) <= tol;
    double sumVol = 0, sumMass = 0, sumMole = 0;
    for (const auto& c : cuts) { sumVol += c.vol; sumMass += c.mass; sumMole += c.mole; }

    diag_["nCuts"] = static_cast<double>(cuts.size());
    diag_["fractionSum"] = fracSum;
    diag_["volumeFractionSum"] = sumVol;
    diag_["massFractionSum"] = sumMass;
    diag_["moleFractionSum"] = sumMole;
    diag_["feed_SG"] = SGfeed;
    diag_["feed_API"] = apiOf(SGfeed);
    if (sgMethod == "constantWatsonK")
    {
        diag_["feed_WatsonK"] = Kbulk;
        diag_["feed_WatsonKIterations"] = iterations;
    }
    diag_["mixture_SG"] = SGmix;
    diag_["mixture_API"] = apiOf(SGmix);
    diag_["mixture_WatsonK"] = KwMix;
    diag_["mixture_MW"] = MWmix;
    diag_["mixture_VABP_K"] = av.VABP;
    diag_["mixture_MABP_K"] = av.MABP;
    diag_["mixture_CABP_K"] = av.CABP;
    diag_["mixture_MeABP_K"] = av.MeABP;
    diag_["closure_SGdiff_rel"] = diffRel;
    diag_["closure_SGtolerance"] = tol;
    diag_["closure_ok"] = closed ? 1.0 : 0.0;

    auto Cp298 = [](const ConstantEstimate& e)
    {
        const double T = 298.15;
        return e.cpa + e.cpb * T + e.cpc * T * T + e.cpd * T * T * T;
    };
    for (size_t i = 0; i < cuts.size(); ++i)
    {
        const Cut& c = cuts[i];
        const std::string k = "cut" + two(static_cast<int>(i) + 1) + "_";
        diag_[k + "fraction"] = c.width;
        diag_[k + "volumeFraction"] = c.vol;
        diag_[k + "massFraction"] = c.mass;
        diag_[k + "moleFraction"] = c.mole;
        diag_[k + "Tb_K"] = c.Tb;
        diag_[k + "SG"] = c.SG;
        diag_[k + "API"] = apiOf(c.SG);
        diag_[k + "WatsonK"] = watsonOf(c.Tb, c.SG);
        diag_[k + "MW"] = c.est.MW;
        diag_[k + "Tc_K"] = c.est.Tc;
        diag_[k + "Pc_bar"] = c.est.Pc_bar;
        diag_[k + "Vc_cm3mol"] = c.est.Vc;
        diag_[k + "omega"] = c.est.omega;
        diag_[k + "Cp298"] = Cp298(c.est);
    }

    // ---------------- announcements ----------------------------------------
    if (!closed)
        std::cerr << "  [closure] the re-blended cuts give SG = " << SGmix << " against the feed's "
                  << SGfeed << " (" << (diffRel >= 0 ? "+" : "") << diffRel * 100.0
                  << " %), outside the declared tolerance of " << tol * 100.0
                  << " %.  NOT adjusted: the difference is the discretisation of the curve "
                     "and of the cut-SG assumption (" << sgMethod << ").\n";

    // ---------------- outputs ----------------------------------------------
    std::string proposalDir;
    if (dict->found("output") && dict->subDict("output")->found("proposal"))
    {
        const std::string p = dict->subDict("output")->lookupWord("proposal");
        proposalDir = (p == "auto") ? (std::filesystem::path("constant") / "components").string() : p;
    }
    const std::string prefix = (dict->found("output"))
        ? dict->subDict("output")->lookupWordOrDefault("prefix", "petCut") : std::string("petCut");
    if (!proposalDir.empty())
    {
        //  REFUSE FIRST: a refused proposal must leave nothing behind, not even
        //  the directory (check_empty_dirs found data/standards/zz_probe).
        records::refuseStandardsWrite("petroleumCuts '" + op + "'", "proposal",
            (std::filesystem::path(proposalDir) / (prefix + "_01.estimated.dat")).string());
        std::error_code ec; std::filesystem::create_directories(proposalDir, ec);
        for (size_t i = 0; i < cuts.size(); ++i)
        {
            const Cut& c = cuts[i];
            const ConstantEstimate& e = c.est;
            const std::string comp = prefix + "_" + two(static_cast<int>(i) + 1);
            const std::string path = (std::filesystem::path(proposalDir) / (comp + ".estimated.dat")).string();
            const double Pc_Pa = e.Pc_bar * 1.0e5;
            const double Vliq298 = closures::rackettVliq(298.15, e.Tc, Pc_Pa, e.omega);
            records::refuseStandardsWrite("petroleumCuts '" + op + "'", "proposal", path);
            std::ofstream f(path);
            if (!f) { std::cerr << "  petroleumCuts: could not write " << path << "\n"; continue; }
            f << std::setprecision(6);
            f << "/*--------------------------------*- Choupo -*-----------------------*\\\n"
              << "  PSEUDO-COMPONENT: " << comp << "   (petroleum cut -- NOT a real species)\n"
              << "  Generated by choupoProps petroleumCuts ('" << op << "'), cut " << (i + 1)
              << " of " << cuts.size() << ".\n"
              << "  Method:  TBP mid-point Tb; SG by " << sgMethod << "; Riazi-Daubert (Eq. 2.50,\n"
              << "           2.63, 2.64, 2.98); omega Lee-Kesler; ideal-gas Cp Kesler-Lee (1976).\n"
              << "           Riazi, ASTM MNL50 (2005).\n"
              << "\n"
              << "  Distilled interval (" << basis << " basis): " << c.lo << " -> " << c.hi
              << "   (fraction of the feed " << c.width << ")\n"
              << "  Tb = " << c.Tb << " K   SG(60/60 F) = " << c.SG << "   API = " << apiOf(c.SG)
              << "   Watson K = " << watsonOf(c.Tb, c.SG) << "\n"
              << "  A lump of many species: no formula, no CAS, no standardThermochemistry.\n"
              << "  ESTIMATION HAS ERROR -- and a LUMP has more.  This is a PROPOSAL; review,\n"
              << "  then promote it yourself:\n"
              << "      mv " << path << "  constant/components/" << comp << ".dat\n"
              << "\\*---------------------------------------------------------------------------*/\n\n";
            f << "name        " << comp << ";\n"
              << "// formula / CAS OMITTED: a pseudo-component is a LUMP, not a molecule.\n"
              << "MW          " << e.MW << ";        // g/mol (Riazi-Daubert, Eq. 2.50)\n\n"
              << "Tc          " << e.Tc << ";        // K     (Riazi-Daubert, Eq. 2.63)\n"
              << "Pc          " << e.Pc_bar << ";        // bar   (Riazi-Daubert, Eq. 2.64)\n"
              << "omega       " << e.omega << ";        // [-]   Lee-Kesler from (Tb,Tc,Pc)\n\n"
              << "idealGasHeatCapacity\n{\n"
              << "    model         polynomial;\n"
              << "    // Cp [J/(mol*K)] = a0 + a1*T + a2*T^2 + a3*T^3 (Kesler-Lee)  Cp(298)=" << Cp298(e) << "\n"
              << "    coefficients  (" << e.cpa << "   " << e.cpb << "   "
              << std::scientific << e.cpc << "   " << e.cpd << std::fixed << ");\n"
              << "    Trange        (250  1000);\n"
              << "}\n\n"
              << "Tb          " << c.Tb << ";        // K     TBP mid-point of the cut\n"
              << "Vliq        " << Vliq298 << ";      // m^3/mol Rackett, 298 K (estimate)\n"
              << "liquidHeatCapacity\n{\n"
              << "    model         polynomial;\n"
              << "    coefficients  (" << e.cpa << "   " << e.cpb << "   "
              << std::scientific << e.cpc << "   " << e.cpd << std::fixed << ");\n"
              << "    Trange        (250  600);\n"
              << "}\n\n"
              << "vaporPressure { model AmbroseWalton; }\n\n";
            f << "provenance\n{\n"
              << "    status        \"ESTIMATE\";\n"
              << "    origin        estimated;\n"
              << "    lumped        true;\n"
              << "    method        \"petroleumCuts: TBP mid-point Tb, SG by " << sgMethod
              << " (Riazi Eq. 2.13); Riazi-Daubert Eq. 2.50/2.63/2.64/2.98; omega Lee-Kesler; Cp Kesler-Lee (1976); Riazi ASTM MNL50 (2005)\";\n"
              << "    note          \"petroleum pseudo-component, NOT a real species -- cut " << (i + 1)
              << " of " << cuts.size() << " of a " << basis << "-basis TBP curve, distilled "
              << c.lo << " to " << c.hi << "; SG " << c.SG << " (API " << apiOf(c.SG)
              << "), Watson K " << watsonOf(c.Tb, c.SG) << "\";\n"
              << "}\n";
        }
    }
    if (dict->found("output") && dict->subDict("output")->found("file"))
    {
        const std::string path = dict->subDict("output")->lookupWord("file");
        records::refuseStandardsWrite("petroleumCuts '" + op + "'", "file", path);
        std::ofstream f(path);
        if (f)
        {
            f << std::setprecision(10);
            f << "cut,lo,hi,fraction,volumeFraction,massFraction,moleFraction,Tb_K,SG,API,WatsonK,MW,Tc_K,Pc_bar,Vc_cm3mol,omega\n";
            for (size_t i = 0; i < cuts.size(); ++i)
            {
                const Cut& c = cuts[i];
                f << (i + 1) << ',' << c.lo << ',' << c.hi << ',' << c.width << ',' << c.vol << ','
                  << c.mass << ',' << c.mole << ',' << c.Tb << ',' << c.SG << ',' << apiOf(c.SG) << ','
                  << watsonOf(c.Tb, c.SG) << ',' << c.est.MW << ',' << c.est.Tc << ',' << c.est.Pc_bar
                  << ',' << c.est.Vc << ',' << c.est.omega << '\n';
            }
        }
    }

    if (verbosity >= 1)
    {
        std::cout << std::fixed << "\n=========  petroleumCuts '" << op << "': a "
                  << basis << "-basis TBP curve cut into " << cuts.size()
                  << " pseudo-components  =========\n"
                  << "  *** LUMPED petroleum cuts -- NOT real species; every record is an ESTIMATE proposal ***\n"
                  << "  Feed SG(60/60 F) = " << std::setprecision(4) << SGfeed << " (" << sgFeedSource
                  << ")   API = " << std::setprecision(2) << apiOf(SGfeed) << "\n"
                  << "  Cut SG: " << sgMethod;
        if (sgMethod == "constantWatsonK")
            std::cout << "  (Kw = " << std::setprecision(4) << Kbulk << ", Riazi Eq. 2.13 at the feed SG and the feed's MeABP, "
                      << iterations << " fixed-point iterations)";
        std::cout << "\n  Cut Tb: TBP temperature at the mid-point of each distilled interval (Riazi p. 83)\n"
                  << "  ---------------------------------------------------------------------------\n"
                  << "   cut   interval        frac(" << basis.substr(0, 3) << ")  Tb[K]   SG      API    Kw     MW\n";
        for (size_t i = 0; i < cuts.size(); ++i)
        {
            const Cut& c = cuts[i];
            std::cout << "   " << std::setw(2) << (i + 1) << "   "
                      << std::setprecision(3) << c.lo << "-" << std::left << std::setw(6) << c.hi << std::right
                      << "   " << std::setw(7) << std::setprecision(4) << c.width
                      << std::setw(9) << std::setprecision(2) << c.Tb
                      << std::setw(8) << std::setprecision(4) << c.SG
                      << std::setw(7) << std::setprecision(2) << apiOf(c.SG)
                      << std::setw(7) << std::setprecision(3) << watsonOf(c.Tb, c.SG)
                      << std::setw(8) << std::setprecision(1) << c.est.MW << "\n";
        }
        std::cout << "  ---------------------------------------------------------------------------\n"
                  << std::setprecision(4)
                  << "  Blend (Eq. 3.45/3.46): SG = " << SGmix << "   API = " << std::setprecision(2) << apiOf(SGmix)
                  << "   Watson K = " << std::setprecision(3) << KwMix << "   MW = " << std::setprecision(1) << MWmix << "\n"
                  << "  Averages: VABP " << std::setprecision(1) << av.VABP << "  MABP " << av.MABP
                  << "  CABP " << av.CABP << "  MeABP " << av.MeABP << " K\n"
                  << "  Closure: (SG_blend - SG_feed)/SG_feed = " << std::showpos << std::setprecision(3) << diffRel * 100.0
                  << std::noshowpos << " %  vs tolerance " << tol * 100.0 << " %  -> "
                  << (closed ? "CLOSED" : "NOT CLOSED (announced, not adjusted)") << "\n"
                  << "  Fractions: sum(cut) = " << std::setprecision(6) << fracSum << "  sum(vol) = " << sumVol
                  << "  sum(mass) = " << sumMass << "  sum(mole) = " << sumMole << "\n"
                  << "  NOTE: nothing here is validated against a unit; the cuts are CORRELATIONS on (Tb, SG).\n"
                  << "========================================================================\n\n";
        std::cout << std::defaultfloat;
    }
    return 0;
}

} // namespace Choupo
