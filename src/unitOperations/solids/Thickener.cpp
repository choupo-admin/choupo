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

#include "unitOperations/solids/Thickener.H"
#include "unitOperations/solids/SolidLiquidCore.H"
#include "core/Advisory.H"
#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace Choupo {

namespace {

//  The parabola through three neighbouring test points around `t`: its
//  value and slope at t.  j is the middle point, clamped to the interior,
//  and is handed back so the run can say WHICH three points it used.
void localParabola(const std::vector<scalar>& t, const std::vector<scalar>& H,
                   scalar x, scalar& Hx, scalar& dHdt, std::size_t& jMid)
{
    const std::size_t n = t.size();
    std::size_t j = 1;
    scalar best = std::abs(x - t[1]);
    for (std::size_t k = 1; k + 1 < n; ++k)
        if (std::abs(x - t[k]) < best) { best = std::abs(x - t[k]); j = k; }
    const scalar x0 = t[j - 1], x1 = t[j], x2 = t[j + 1];
    const scalar y0 = H[j - 1], y1 = H[j], y2 = H[j + 1];
    //  Lagrange form and its derivative.
    const scalar L0 = (x - x1) * (x - x2) / ((x0 - x1) * (x0 - x2));
    const scalar L1 = (x - x0) * (x - x2) / ((x1 - x0) * (x1 - x2));
    const scalar L2 = (x - x0) * (x - x1) / ((x2 - x0) * (x2 - x1));
    const scalar d0 = ((x - x1) + (x - x2)) / ((x0 - x1) * (x0 - x2));
    const scalar d1 = ((x - x0) + (x - x2)) / ((x1 - x0) * (x1 - x2));
    const scalar d2 = ((x - x0) + (x - x1)) / ((x2 - x0) * (x2 - x1));
    Hx   = y0 * L0 + y1 * L1 + y2 * L2;
    dHdt = y0 * d0 + y1 * d1 + y2 * d2;
    jMid = j;
}

} // namespace

int Thickener::solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity)
{
    const std::string me = "thickener";
    const std::size_t n = thermo.n();
    const SlurryState f = readSingleInlet(dict, thermo, me);
    if (!(f.mSolids > 0.0))
        throw std::runtime_error(me + ": the feed carries no solids.");
    if (!(f.mLiquid > 0.0))
        throw std::runtime_error(me + ": the feed carries no liquid -- a "
            "thickener settles a slurry.");
    if (!dict->found("model"))
        throw std::runtime_error(me + ": no `model` -- `talmageFitch` (Talmage & "
            "Fitch 1955, a tangent at the compression point) or `coeClevenger` "
            "(Coe & Clevenger 1916, the largest area over the test's layers).");
    const std::string model = dict->lookupWord("model");
    if (model != "talmageFitch" && model != "coeClevenger")
        throw std::runtime_error(me + ": `model` is `talmageFitch` or "
            "`coeClevenger`; got '" + model + "'.");
    auto oper = dict->subDict("operation");

    //  ---- the batch settling test ---------------------------------------
    if (!oper->found("settlingTest"))
        throw std::runtime_error(me + ": `operation { settlingTest { "
            "initialConcentration ...; time ( ... ); height ( ... ); } }` is "
            "missing -- a thickener is sized from its slurry's own batch "
            "settling test, and no curve is assumed.");
    auto st = oper->subDict("settlingTest");
    if (!st->found("initialConcentration") || !st->found("time") || !st->found("height"))
        throw std::runtime_error(me + ": `settlingTest` needs `initialConcentration` "
            "[kg/m3 of slurry], `time ( ... )` [s] and `height ( ... )` [m].");
    const scalar C0 = st->lookupScalar("initialConcentration", Dims::density);
    const std::vector<scalar> tt = st->lookupList("time");
    const std::vector<scalar> HH = st->lookupList("height");
    if (tt.size() != HH.size() || tt.size() < 3)
        throw std::runtime_error(me + ": `time` and `height` must have the same "
            "length, at least 3 points.");
    if (tt.front() != 0.0)
        throw std::runtime_error(me + ": the settling test starts at t = 0 with "
            "the initial height H_0; the first `time` is " + std::to_string(tt.front()) + ".");
    for (std::size_t j = 1; j < tt.size(); ++j)
    {
        if (!(tt[j] > tt[j - 1]))
            throw std::runtime_error(me + ": the test's times must increase "
                "strictly (point " + std::to_string(j) + ").");
        if (HH[j] > HH[j - 1])
        {
            std::ostringstream m;
            m << me << ": the settling curve is not monotone -- the interface "
                 "rises from " << HH[j - 1] << " m to " << HH[j] << " m at t = "
              << tt[j] << " s.  A batch settling interface only falls; check the "
                 "reading.";
            throw std::runtime_error(m.str());
        }
    }
    if (!(HH.back() > 0.0) || !(C0 > 0.0))
        throw std::runtime_error(me + ": heights and C_0 must be positive.");
    const scalar H0 = HH.front();

    //  ---- densities, the target underflow -------------------------------
    const scalar rhoS = solidDensity(f.solid, thermo, me);
    const scalar rhoL = liquidDensity(f.liquid, f.T, f.P, thermo);
    if (!oper->found("underflowConcentration"))
        throw std::runtime_error(me + ": `underflowConcentration` C_u [kg/m3 of "
            "underflow] is missing -- the target the thickener is designed for.");
    const scalar Cu = oper->lookupScalar("underflowConcentration", Dims::density);
    if (!(Cu > C0))
        throw std::runtime_error(me + ": the target underflow C_u must exceed the "
            "test's initial concentration C_0 -- a thickener concentrates.");
    if (!(Cu < rhoS))
        throw std::runtime_error(me + ": C_u = " + std::to_string(Cu) + " kg/m3 "
            "is at or above the solid's own density " + std::to_string(rhoS)
            + " -- no liquid would remain.");
    const scalar Hu = C0 * H0 / Cu;                                // Talmage-Fitch step 1
    if (Hu < HH.back())
    {
        std::ostringstream m;
        m << me << ": the target underflow C_u = " << Cu << " kg/m3 lies outside "
             "what the test reached: its underflow line H_u = C_0 H_0 / C_u = "
          << Hu << " m is below the last height measured, " << HH.back()
          << " m (C = " << C0 * H0 / HH.back() << " kg/m3).  Run the test longer "
             "or lower the target.";
        throw std::runtime_error(m.str());
    }

    //  ---- Kynch's construction at every test point ----------------------
    const std::size_t np = tt.size();
    std::vector<scalar> vK(np), HiK(np), CK(np), uaCC(np, 0.0);
    for (std::size_t j = 0; j < np; ++j)
    {
        scalar Hx, d;
        std::size_t jm;
        localParabola(tt, HH, tt[j], Hx, d, jm);
        vK[j]  = std::max(0.0, -d);
        HiK[j] = HH[j] + vK[j] * tt[j];                            // tangent intercept
        CK[j]  = C0 * H0 / HiK[j];                                 // Wills eq. 15.4
    }

    //  ---- Talmage-Fitch ---------------------------------------------------
    //  Where the curve itself crosses the underflow line.
    scalar tCross = tt.back();
    for (std::size_t j = 1; j < np; ++j)
        if (HH[j] <= Hu)
        {
            tCross = tt[j - 1] + (tt[j] - tt[j - 1]) * (HH[j - 1] - Hu) / (HH[j - 1] - HH[j]);
            break;
        }
    scalar tComp = 0.0, Hc = 0.0, vc = 0.0, Hic = 0.0, Cc = 0.0, tuTF = 0.0;
    bool tangentUsed = false;
    std::size_t jPar = 0;                       // middle point of the slope's parabola
    const bool needComp = (model == "talmageFitch");
    if (oper->found("compressionTime"))
    {
        tComp = oper->lookupScalar("compressionTime", Dims::time);
        if (!(tComp > 0.0 && tComp < tt.back()))
            throw std::runtime_error(me + ": `compressionTime` must lie inside the "
                "test, 0 < t < " + std::to_string(tt.back()) + " s.");
        scalar d;
        localParabola(tt, HH, tComp, Hc, d, jPar);
        vc  = -d;
        if (!(vc > 0.0))
            throw std::runtime_error(me + ": the curve does not fall at the "
                "declared compression time; no tangent can be drawn there.");
        Hic = Hc + vc * tComp;
        Cc  = C0 * H0 / Hic;
        if (Hu >= Hc) tuTF = tCross;                               // T&F p. 39
        else { tuTF = (Hic - Hu) / vc; tangentUsed = true; }       // T&F steps 3-4
    }
    else if (needComp)
        throw std::runtime_error(me + " (talmageFitch): `compressionTime` is "
            "missing -- the time at which the settling solids go into "
            "compression, read off the test by the student.  Every way of "
            "picking it is empirical (Perry 9th ed. p. 18-64), so it is "
            "declared, never guessed.");

    //  ---- Coe-Clevenger over the layers of the same test -----------------
    const scalar W = f.mSolids;
    scalar Acc = 0.0, Ccc = 0.0, vcc = 0.0;
    for (std::size_t j = 0; j < np; ++j)
    {
        if (!(vK[j] > 0.0) || !(CK[j] < Cu)) continue;
        uaCC[j] = (1.0 / CK[j] - 1.0 / Cu) / vK[j];                // m2 s / kg
        if (W * uaCC[j] > Acc) { Acc = W * uaCC[j]; Ccc = CK[j]; vcc = vK[j]; }
    }
    if (model == "coeClevenger" && !(Acc > 0.0))
        throw std::runtime_error(me + " (coeClevenger): no layer of the test is "
            "both settling and below C_u -- the curve gives no area.");
    const scalar Atf = needComp || oper->found("compressionTime")
                     ? W * tuTF / (C0 * H0) : 0.0;                 // T&F eq. 10, Wills 15.6
    const scalar A = (model == "talmageFitch") ? Atf : Acc;
    //  The identity: Coe-Clevenger evaluated at the compression layer equals
    //  Talmage-Fitch's tangent area (Wills derives 15.6 from 15.5, p. 387).
    scalar idDev = 0.0;
    if (tangentUsed)
    {
        const scalar Acp = W * (1.0 / Cc - 1.0 / Cu) / vc;
        idDev = std::abs(Acp - Atf) / Atf;
    }

    //  ---- the streams ----------------------------------------------------
    const scalar liqPerSolid = (1.0 - Cu / rhoS) * rhoL / Cu;      // kg liquid / kg solids
    const scalar Lu = liqPerSolid * W;
    if (!(Lu <= f.mLiquid))
        throw std::runtime_error(me + ": an underflow at C_u = " + std::to_string(Cu)
            + " kg/m3 needs " + std::to_string(Lu) + " kg/s of liquid and the feed "
            "brings " + std::to_string(f.mLiquid) + " -- the feed is already "
            "thicker than the target.");
    const scalar phi = Lu / f.mLiquid;
    sVector uLiq(n, 0.0), oLiq(n, 0.0), none(n, 0.0);
    for (std::size_t i = 0; i < n; ++i)
    {
        uLiq[i] = phi * f.liquid[i];
        oLiq[i] = f.liquid[i] - uLiq[i];                           // the DIFFERENCE
    }
    produced_.clear();
    produced_.push_back(makeSlurryStream("underflow", f.T, f.P, uLiq, f.solid, f.psd));
    produced_.push_back(makeSlurryStream("overflow",  f.T, f.P, oLiq, none,    f.psd));
    const scalar closure = componentClosure({ &f.liquid, &f.solid },
                                            { &uLiq, &f.solid, &oLiq });

    const scalar Vs = f.mSolids / rhoS, Vl = f.mLiquid / rhoL;
    const scalar Cfeed = f.mSolids / (Vs + Vl);                    // kg/m3 of feed slurry
    const scalar perTpd = 1000.0 / 86400.0;                        // (kg/s) per (t/d)

    kpis_.clear();
    kpis_["solidsMassFlow_kg_s"]     = W;
    kpis_["liquidMassFlow_kg_s"]     = f.mLiquid;
    kpis_["rho_solid"]               = rhoS;
    kpis_["rho_liquid"]              = rhoL;
    kpis_["feedConcentration_kg_m3"] = Cfeed;
    kpis_["testC0_kg_m3"]            = C0;
    kpis_["testH0_m"]                = H0;
    kpis_["underflowConcentration_kg_m3"] = Cu;
    kpis_["underflowLine_Hu_m"]      = Hu;
    kpis_["curveCrossesHu_s"]        = tCross;
    kpis_["area_m2"]                 = A;
    kpis_["unitArea_m2_per_tpd"]     = (A / W) * perTpd;
    kpis_["areaCoeClevenger_m2"]     = Acc;
    kpis_["coeClevenger_C_kg_m3"]    = Ccc;
    kpis_["coeClevenger_v_m_s"]      = vcc;
    if (Atf > 0.0)
    {
        kpis_["areaTalmageFitch_m2"] = Atf;
        kpis_["compressionTime_s"]   = tComp;
        kpis_["compression_H_m"]     = Hc;
        kpis_["compression_v_m_s"]   = vc;
        kpis_["tangentIntercept_Hi_m"] = Hic;
        kpis_["compression_C_kg_m3"] = Cc;
        kpis_["tu_s"]                = tuTF;
        kpis_["tangentUsed"]         = tangentUsed ? 1.0 : 0.0;
        kpis_["anchor_TFequalsCC_dev"] = idDev;
    }
    kpis_["underflowLiquid_kg_s"]    = Lu;
    kpis_["overflowLiquid_kg_s"]     = f.mLiquid - Lu;
    kpis_["componentMassClosure"]    = closure;

    //  The curve and Kynch's construction at every point, for the GUI to
    //  draw the tangent: (t, H), the intercept H_i, the layer's C and v.
    UnitProfile prof;
    prof.xAxis = "t_s";
    std::vector<scalar> cc(np);
    for (std::size_t j = 0; j < np; ++j) cc[j] = W * uaCC[j];
    prof.columns["t_s"]                 = tt;
    prof.columns["H_m"]                 = HH;
    prof.columns["kynch_v_m_s"]         = vK;
    prof.columns["kynch_Hi_m"]          = HiK;
    prof.columns["kynch_C_kg_m3"]       = CK;
    prof.columns["coeClevengerArea_m2"] = cc;
    if (Atf > 0.0)
    {
        prof.markers.push_back({ tComp, "compression point" });
        prof.markers.push_back({ tuTF,  "t_u" });
    }
    profile_ = prof;

    //  ---- the one window the method checks: the test concentration ------
    //  Talmage & Fitch (p. 40) ask for a settling test at the expected feed
    //  concentration.  A test run elsewhere is still used as declared, so the
    //  deviation is ANNOUNCED (every verbosity, on the advisory log), never
    //  refused and never corrected.
    std::string testNote;
    if (std::abs(Cfeed - C0) / C0 > 0.05)
    {
        std::ostringstream m;
        m << std::defaultfloat << std::setprecision(5)
          << "the settling test was run at C_0 = " << C0 << " kg/m3 and the feed "
             "is at " << Cfeed << " kg/m3 (" << 100.0 * (Cfeed - C0) / C0
          << " % from the test); the area is computed from the test as declared.  "
             "Talmage & Fitch (p. 40) ask for a test at the expected feed "
             "concentration; a test at the feed's own concentration is the remedy.";
        testNote = m.str();
        const std::string unitName = dict->name().empty()
            ? dict->lookupWordOrDefault("name", "(unnamed)") : dict->name();
        AdvisoryLog::instance().add("validity", "warning", me + " " + unitName, testNote);
    }

    if (verbosity >= 1)
    {
        std::cout << "\n=====================  Thickener Result  =========================\n"
                  << std::defaultfloat << std::setprecision(5)
                  << "  Model:        " << model << "\n"
                  << "  Feed:         " << W << " kg/s solids, " << f.mLiquid
                  << " kg/s liquid; " << Cfeed << " kg/m3 of slurry;  rho_s " << rhoS
                  << ", rho_l " << rhoL << " kg/m3\n"
                  << "  Test:         C_0 = " << C0 << " kg/m3, H_0 = " << H0 << " m, "
                  << np << " points to t = " << tt.back() << " s\n";
        if (!testNote.empty())
            std::cout << "  [thickener] NOTE: " << testNote << "\n";
        std::cout << "  Underflow:    C_u = " << Cu << " kg/m3 -> H_u = C_0 H_0 / C_u = "
                  << Hu << " m (the curve crosses it at " << tCross << " s)\n";
        if (Atf > 0.0)
            std::cout << "  Compression:  t = " << tComp << " s, H = " << Hc
                      << " m, slope v = " << vc << " m/s (the derivative at t of the "
                         "parabola through the three test points t = " << tt[jPar - 1]
                      << ", " << tt[jPar] << ", " << tt[jPar + 1] << " s -- the "
                         "point nearest t and its two neighbours), tangent meets the H axis at "
                      << Hic << " m (C = " << Cc << " kg/m3)\n"
                      << "  Talmage-Fitch: t_u = " << tuTF << " s ("
                      << (tangentUsed ? "tangent at the compression point"
                                      : "H_u above the compression point: the curve's own crossing")
                      << ");  A = W t_u / (C_0 H_0) = " << Atf << " m2\n";
        std::cout << "  Coe-Clevenger: largest W (1/C - 1/C_u)/v over the test's layers: "
                  << Acc << " m2 (at C = " << Ccc << " kg/m3, v = " << vcc << " m/s)\n"
                  << "  Sized by:     " << model << ": A = " << A << " m2, unit area "
                  << (A / W) * perTpd << " m2 per t/d\n"
                  << "  Streams:      underflow " << W << " kg/s solids + " << Lu
                  << " kg/s liquid; overflow " << f.mLiquid - Lu << " kg/s clear liquid\n"
                  << std::scientific << std::setprecision(3)
                  << "  Closure:      max_i |out - in| / in = " << closure;
        if (tangentUsed) std::cout << ";  [anchor] Coe-Clevenger at the compression "
                                      "layer = Talmage-Fitch: dev " << idDev;
        std::cout << "\n" << std::defaultfloat;
        if (verbosity >= 2)
        {
            std::cout << "  Kynch's construction (Wills eq. 15.4):\n"
                      << "      t [s]      H [m]     v [m/s]      H_i [m]    C [kg/m3]   A_CC [m2]\n";
            for (std::size_t j = 0; j < np; ++j)
                std::cout << std::setprecision(5) << "  " << std::setw(10) << tt[j]
                          << " " << std::setw(10) << HH[j] << " " << std::setw(11)
                          << vK[j] << " " << std::setw(10) << HiK[j] << " "
                          << std::setw(11) << CK[j] << " " << std::setw(11) << cc[j] << "\n";
        }
        std::cout << "==================================================================\n\n";
    }
    return 0;
}

} // namespace Choupo
