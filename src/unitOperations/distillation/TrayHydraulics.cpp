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

#include "TrayHydraulics.H"

#include "core/Constants.H"
#include "thermo/PricedDensity.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdexcept>

namespace Choupo
{

namespace
{
    constexpr scalar g_acc = 9.80665;      // m/s^2

    // Fair's flooding capacity chart, in the algebraic form of
    // Lygeros & Magoulas (1986).  TS in mm, F_LV dimensionless, C_SB in m/s.
    scalar cSB_fair(scalar TS_mm, scalar F_LV)
    {
        return 0.0105 + 8.127e-4 * std::pow(TS_mm, 0.755)
                      * std::exp(-1.463 * std::pow(F_LV, 0.842));
    }

    //  A HYDRAULIC NUMBER THAT IS NOT FINITE IS NOT PUBLISHED (C79).  It
    //  refuses by name -- the tray, the quantity, and the state it was built
    //  from -- because a NaN that reaches a KPI prints as "0.0 % of flood"
    //  or "dP -nan" at exit 0, and a NaN that reaches `std::max` quietly
    //  loses to a zero and turns into a different, misleading refusal.
    void requireFinite(scalar v, const char* what,
                       const TrayHydraulics::Stage& s)
    {
        if (std::isfinite(v)) return;
        std::ostringstream o;
        o << "TrayHydraulics: stage " << s.index << ": " << what
          << " is not a finite number (" << v << ") -- it is not published."
             "  The tray state it was built from: rho_L = " << s.rhoL
          << " kg/m3, rho_V = " << s.rhoV << " kg/m3, sigma = " << s.sigma
          << " N/m";
        throw std::runtime_error(o.str());
    }
}


TrayHydraulics::LiquidDensity
TrayHydraulics::liquidDensity(const ThermoPackage& thermo, scalar T, scalar P,
                              const sVector& x)
{
    //  WHICH COMPONENTS: `pricedDensity` decides, the one home.  This
    //  function computes no density of its own.
    const pricedDensity::Selection sel =
        pricedDensity::select(thermo, T, P, x, DensityPhase::Liquid);
    if (!(sel.keptFraction > 0.0))
    {
        std::ostringstream o;
        o << "TrayHydraulics: no component of the liquid has a liquid density"
             " at T = " << T << " K, P = " << P * 1.0e-5 << " bar (left out: "
          << sel.dropped << ") -- the tray cannot be rated";
        throw std::runtime_error(o.str());
    }
    LiquidDensity d;
    d.dropped         = sel.dropped;
    d.droppedFraction = sel.droppedFraction
                      / (sel.keptFraction + sel.droppedFraction);
    //  Nothing left out: the question is the one it always was, asked of
    //  the composition itself, so the answer is unchanged to the bit.
    d.rho = thermo.density(T, P, sel.droppedFraction > 0.0 ? sel.zPriced : x,
                           DensityPhase::Liquid);
    return d;
}


void TrayHydraulics::noteDropped(const LiquidDensity& d, std::string& names,
                                 scalar& maxFraction)
{
    if (d.dropped.empty()) return;
    maxFraction = std::max(maxFraction, d.droppedFraction);
    std::istringstream in(d.dropped);
    std::string name;
    while (std::getline(in, name, ','))
    {
        const auto b = name.find_first_not_of(' ');
        if (b == std::string::npos) continue;
        name = name.substr(b);
        const std::string have = ", " + names + ",";
        if (have.find(", " + name + ",") != std::string::npos) continue;
        if (!names.empty()) names += ", ";
        names += name;
    }
}


TrayHydraulics::Geometry TrayHydraulics::readGeometry(const DictPtr& hyd)
{
    const std::string type = hyd->lookupWordOrDefault("trayType", "sieve");
    if (type != "sieve")
        throw std::runtime_error("TrayHydraulics: only `trayType sieve` is implemented "
            "(got '" + type + "') -- valve and bubble-cap trays carry different "
            "dry-tray and flooding correlations, and Choupo does not fake them");

    Geometry geo;
    geo.diameter       = hyd->lookupScalarOrDefault("diameter",        0.0);
    geo.traySpacing    = hyd->lookupScalarOrDefault("traySpacing",     0.50);
    geo.weirHeight     = hyd->lookupScalarOrDefault("weirHeight",      0.050);
    geo.holeDiameter   = hyd->lookupScalarOrDefault("holeDiameter",    5.0e-3);
    geo.holeAreaFrac   = hyd->lookupScalarOrDefault("holeAreaFraction",      0.10);
    geo.downcomerFrac  = hyd->lookupScalarOrDefault("downcomerAreaFraction", 0.12);
    geo.weirLengthFrac = hyd->lookupScalarOrDefault("weirLengthFraction",    0.77);
    geo.orificeCoeff   = hyd->lookupScalarOrDefault("orificeCoefficient",    0.84);
    geo.floodFraction  = hyd->lookupScalarOrDefault("floodFraction",   0.80);
    geo.K2             = hyd->lookupScalarOrDefault("K2",              0.0);
    geo.sigma          = hyd->lookupScalarOrDefault("sigma",           0.0);

    if (geo.downcomerFrac <= 0.0 || geo.downcomerFrac >= 0.4)
        throw std::runtime_error("TrayHydraulics: downcomerAreaFraction must lie in (0, 0.4)");
    if (geo.holeAreaFrac <= 0.0 || geo.holeAreaFrac >= 0.25)
        throw std::runtime_error("TrayHydraulics: holeAreaFraction (A_h/A_active) must lie "
            "in (0, 0.25) -- above ~15 % the tray weeps at any sensible turndown");
    if (geo.floodFraction <= 0.0 || geo.floodFraction > 1.0)
        throw std::runtime_error("TrayHydraulics: floodFraction must lie in (0, 1]");
    return geo;
}


TrayHydraulics::Result TrayHydraulics::evaluate(const ThermoPackage&        thermo,
                                                scalar                      P,
                                                const std::vector<scalar>&  T,
                                                const std::vector<sVector>& x,
                                                const std::vector<sVector>& y,
                                                const std::vector<scalar>&  V,
                                                const std::vector<scalar>&  L,
                                                const Geometry&             geo,
                                                std::size_t                 feedStage)
{
    const std::size_t N = T.size(), n = thermo.n();
    Result res;
    res.designed = (geo.diameter <= 0.0);
    if (N < 3) return res;                      // no trays between the ends

    const scalar TS_mm = geo.traySpacing * 1000.0;
    const scalar dh_mm = geo.holeDiameter * 1000.0;
    const scalar hw_mm = geo.weirHeight   * 1000.0;

    // ---- Pass 1: the physical state of every tray, and its flood velocity ----
    //  The diameter is not needed here.  What is needed is the phase densities,
    //  the surface tension and the mass traffic -- from which the flow parameter,
    //  Fair's capacity parameter, and the flooding velocity follow.
    // A stage with no vapour traffic is not a tray -- that is how a total
    // condenser identifies itself, whichever index the solver gave it.  The
    // last stage is the reboiler: also not a tray.
    for (std::size_t j = 0; j + 1 < N; ++j)
    {
        Stage s;
        s.index = j + 1;

        scalar MW_V = 0.0, MW_L = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            MW_V += y[j][i] * thermo.comp(i).MW();
            MW_L += x[j][i] * thermo.comp(i).MW();
        }
        const scalar mV = V[j] * MW_V;                 // kg/s   (kmol/s . kg/kmol)
        const scalar mL = L[j] * MW_L;                 // kg/s
        if (mV <= 0.0) continue;

        try
        {
            s.rhoV = thermo.density(T[j], P, y[j], DensityPhase::Vapour);
            const LiquidDensity lq = liquidDensity(thermo, T[j], P, x[j]);
            s.rhoL = lq.rho;
            noteDropped(lq, res.liquidDensityDropped, res.liquidDensityDroppedMax);
        }
        catch (const std::exception& e)
        {
            throw std::runtime_error(std::string("TrayHydraulics: a tray needs both phase "
                "densities and the package cannot supply them -- ") + e.what());
        }
        //  Written so that a NaN FAILS it: `NaN <= x` is false, and the old
        //  form of this test let a NaN liquid density through to every head.
        if (!(s.rhoV > 0.0) || !(s.rhoL > s.rhoV) || !std::isfinite(s.rhoL)
            || !std::isfinite(s.rhoV))
        {
            std::ostringstream o;
            o << "TrayHydraulics: non-physical phase densities on stage "
              << s.index << " (rho_L = " << s.rhoL << ", rho_V = " << s.rhoV
              << " kg/m3) -- the tray cannot be rated";
            throw std::runtime_error(o.str());
        }

        if (geo.sigma > 0.0) s.sigma = geo.sigma;
        else if (thermo.hasSurfaceTension()) s.sigma = thermo.surfaceTension(T[j], x[j]);
        else
            throw std::runtime_error("TrayHydraulics: the flooding correlation needs the "
                "surface tension.  Either add `surfaceTension { model BrockBird; }` to the "
                "thermo package, or declare a constant `sigma <N/m>;` in the hydraulics "
                "block -- it will not be guessed");

        s.F_LV  = (mL / mV) * std::sqrt(s.rhoV / s.rhoL);
        if (s.F_LV < 0.03) res.lowFlowParam = true;

        s.C_SB   = cSB_fair(TS_mm, s.F_LV);
        const scalar sig_dyn = s.sigma * 1000.0;       // N/m -> dyn/cm
        s.uFlood = s.C_SB * std::pow(sig_dyn / 20.0, 0.2)
                          * std::sqrt((s.rhoL - s.rhoV) / s.rhoV);

        const scalar Qv = mV / s.rhoV;                 // m^3/s
        // Net area = tower area less ONE downcomer.  Invert for the diameter that
        // would put this tray exactly at `floodFraction` of its flood velocity.
        const scalar Anet = Qv / (geo.floodFraction * s.uFlood);
        const scalar At   = Anet / (1.0 - geo.downcomerFrac);
        s.diameterRequired = std::sqrt(4.0 * At / constant::pi);

        requireFinite(s.sigma,            "the surface tension", s);
        requireFinite(s.F_LV,             "the flow parameter F_LV", s);
        requireFinite(s.C_SB,             "Fair's capacity parameter C_SB", s);
        requireFinite(s.uFlood,           "the flooding velocity", s);
        requireFinite(s.diameterRequired, "the required diameter", s);

        res.stages.push_back(s);
    }
    if (res.stages.empty()) return res;

    // The column is as wide as its widest tray needs it to be.
    res.diameter = geo.diameter;
    if (res.designed)
        for (const auto& s : res.stages)
            res.diameter = std::max(res.diameter, s.diameterRequired);
    //  THE TRUE CAUSE, when there is no diameter to build on.  Every tray's
    //  requirement is finite by now, so this fires only on a column whose
    //  traffic asks for none -- and it says so, rather than letting a zero
    //  diameter reach the active-area test below and be reported as a
    //  geometry the author never declared.
    if (!(res.diameter > 0.0) || !std::isfinite(res.diameter))
        throw std::runtime_error("TrayHydraulics: the column has no positive"
            " finite diameter to rate (" + std::string(res.designed
                ? "DESIGN mode: no tray required one"
                : "RATING mode: the declared `diameter` is not positive")
            + ") -- the tray heads cannot be evaluated");

    //  THE SAME RULE, APPLIED TO EACH SECTION.  `diameterRequired` is
    //  computed for every tray above whether the pass is designing or rating,
    //  so the two section diameters are available in BOTH modes: in rating
    //  mode they say what each section would have needed, beside the diameter
    //  the author gave.
    //
    //  The rule lives HERE, once, rather than being re-applied by whoever
    //  wants a section maximum: "the widest tray sets it" is one sentence and
    //  it is this class's.
    res.feedStage = feedStage;
    if (feedStage > 0)
        for (const auto& s : res.stages)
        {
            scalar& sect = (s.index < feedStage) ? res.diameterRectifying
                                                 : res.diameterStripping;
            sect = std::max(sect, s.diameterRequired);
        }

    // ---- Pass 2: with a diameter, every head follows --------------------
    const scalar D    = res.diameter;
    const scalar At   = 0.25 * constant::pi * D * D;
    const scalar Ad   = geo.downcomerFrac * At;
    const scalar Anet = At - Ad;
    const scalar Aa   = At - 2.0 * Ad;                 // active (bubbling) area
    const scalar Ah   = geo.holeAreaFrac * Aa;
    const scalar lw   = geo.weirLengthFrac * D;        // m
    // Sinnott's default: the apron clears the tray floor 10 mm below the weir.
    const scalar hap  = std::max(geo.weirHeight - 0.010, 0.005);
    const scalar Aap  = hap * lw;
    const scalar Am   = std::min(Aap, Ad);
    const scalar hbMax_mm = 0.5 * (geo.traySpacing + geo.weirHeight) * 1000.0;

    if (Aa <= 0.0)
        throw std::runtime_error("TrayHydraulics: two downcomers leave no active area "
            "(downcomerAreaFraction >= 0.5 of the tower)");

    res.weepChecked = (geo.K2 > 0.0);

    for (auto& s : res.stages)
    {
        const std::size_t j = s.index - 1;
        scalar MW_V = 0.0, MW_L = 0.0;
        for (std::size_t i = 0; i < n; ++i)
        {
            MW_V += y[j][i] * thermo.comp(i).MW();
            MW_L += x[j][i] * thermo.comp(i).MW();
        }
        const scalar mV = V[j] * MW_V, mL = L[j] * MW_L;
        const scalar Qv = mV / s.rhoV;

        s.uVapour       = Qv / Anet;
        s.floodApproach = s.uVapour / s.uFlood;

        // Dry-tray head: the orifice equation, in mm of clear liquid.
        s.u_h = Qv / Ah;
        s.h_d = 51.0 * std::pow(s.u_h / geo.orificeCoeff, 2.0) * (s.rhoV / s.rhoL);

        // Crest over the weir (Francis), and the residual head that stands in
        // for aeration in this lineage.
        s.h_ow = (mL > 0.0) ? 750.0 * std::pow(mL / (s.rhoL * lw), 2.0 / 3.0) : 0.0;
        s.h_r  = 12.5e3 / s.rhoL;
        s.h_t  = s.h_d + hw_mm + s.h_ow + s.h_r;
        s.dP   = (s.h_t / 1000.0) * s.rhoL * g_acc;     // Pa

        // Downcomer: the liquid backs up until it can push through the apron gap.
        s.h_dc = (mL > 0.0) ? 166.0 * std::pow(mL / (s.rhoL * Am), 2.0) : 0.0;
        s.h_b  = hw_mm + s.h_ow + s.h_t + s.h_dc;
        s.h_bMax = hbMax_mm;
        s.downcomerFloods = (s.h_b > hbMax_mm);
        s.tResidence = (mL > 0.0) ? Ad * (s.h_b / 1000.0) * s.rhoL / mL : 0.0;

        if (res.weepChecked)
        {
            s.u_hMin = (geo.K2 - 0.90 * (25.4 - dh_mm)) / std::sqrt(s.rhoV);
            s.weeps  = (s.u_h < s.u_hMin);
        }

        requireFinite(s.uVapour,       "the vapour velocity", s);
        requireFinite(s.floodApproach, "the approach to flood", s);
        requireFinite(s.u_h,           "the hole velocity", s);
        requireFinite(s.h_d,           "the dry-tray head h_d", s);
        requireFinite(s.h_ow,          "the weir crest h_ow", s);
        requireFinite(s.h_r,           "the residual head h_r", s);
        requireFinite(s.h_t,           "the total tray head h_t", s);
        requireFinite(s.dP,            "the tray pressure drop", s);
        requireFinite(s.h_dc,          "the apron loss h_dc", s);
        requireFinite(s.h_b,           "the downcomer backup h_b", s);
        requireFinite(s.tResidence,    "the downcomer residence time", s);
        requireFinite(s.u_hMin,        "the weep-point hole velocity", s);

        res.dPColumn += s.dP;
        if (s.floodApproach > res.floodApproachMax)
        {
            res.floodApproachMax = s.floodApproach;
            res.floodStage       = s.index;
        }
        res.backupMax = std::max(res.backupMax, s.h_b);
        if (s.weeps) ++res.nWeeping;
        if (s.downcomerFloods) ++res.nDcFlood;
    }

    return res;
}


void TrayHydraulics::report(const Result& r, const Geometry& geo, int verbosity)
{
    if (verbosity < 2 || r.stages.empty()) return;

    std::cout << "\n  --- Sieve-tray hydraulics ("
              << (r.designed ? "DESIGN: the diameter is the result"
                             : "RATING: the diameter is given") << ") ---\n"
              << std::fixed << std::setprecision(3)
              << "  D = " << r.diameter << " m    tray spacing " << geo.traySpacing
              << " m    weir " << geo.weirHeight * 1000.0 << " mm    holes "
              << geo.holeDiameter * 1000.0 << " mm at " << geo.holeAreaFrac * 100.0
              << " % of the active area\n"
              << "  C_o = " << geo.orificeCoeff
              << "  (declared -- the Liebson chart value for this A_h/A_p and t/d_h)\n";
    if (r.designed)
        std::cout << "  sized so no tray passes " << geo.floodFraction * 100.0
                  << " % of its flooding velocity\n";

    //  THE TWO SECTIONS, AND WHETHER THEY ARE FAR ENOUGH APART TO SWAGE.
    //  Printed only when the caller named a feed stage AND both sections hold
    //  a tray -- a column with all its trays on one side of the feed has one
    //  section and nothing to compare.
    if (r.diameterRectifying > 0.0 && r.diameterStripping > 0.0)
    {
        const scalar big = std::max(r.diameterRectifying, r.diameterStripping);
        const scalar sml = std::min(r.diameterRectifying, r.diameterStripping);
        const scalar gap = (big - sml) / big;
        std::cout << std::setprecision(3)
                  << "  by section: rectifying (above stage " << r.feedStage
                  << ") needs " << r.diameterRectifying << " m,  stripping needs "
                  << r.diameterStripping << " m"
                  << std::setprecision(1)
                  << "   (" << gap * 100.0 << " % apart)\n";
        //  A JUDGEMENT THE ENGINE DOES NOT MAKE.  Whether to swage is an
        //  ECONOMIC comparison -- the plate a narrower section saves against
        //  the transition cone, its fabrication and its inspection -- and
        //  this pass prices none of those.  It reports the gap against the
        //  band that is quoted for the decision and says which way the band
        //  points, never that the answer is optimal.
        if (gap < 0.15)
            std::cout << "  the two sections are within 15 % -- the usual"
                         " practice is to build the tower STRAIGHT at "
                      << std::setprecision(3) << big << " m rather than swage"
                         " it (the transition costs more than the plate it"
                         " saves).\n";
        else
            std::cout << "  the two sections differ by more than 15 % -- a"
                         " SWAGED tower is worth pricing here, against a"
                         " straight one at " << std::setprecision(3) << big
                      << " m.  The comparison is economic; Choupo does not"
                         " cost the transition.\n";
    }

    if (verbosity >= 3)
    {
        std::cout << "\n  stage    F_LV    C_SB    u_v    u_flood   %flood"
                     "    h_t     dP      h_b   h_b,max\n"
                     "                   (m/s)  (m/s)   (m/s)             (mm)"
                     "    (Pa)    (mm)    (mm)\n";
        for (const auto& s : r.stages)
            std::cout << "  " << std::setw(5) << s.index
                      << std::setprecision(4) << std::setw(8) << s.F_LV
                      << std::setprecision(3) << std::setw(8) << s.C_SB
                      << std::setw(8) << s.uVapour
                      << std::setw(8) << s.uFlood
                      << std::setprecision(1) << std::setw(9) << s.floodApproach * 100.0
                      << std::setw(9) << s.h_t
                      << std::setw(9) << s.dP
                      << std::setw(9) << s.h_b
                      << std::setw(9) << s.h_bMax
                      << (s.downcomerFloods ? "   <- downcomer FLOODS" : "")
                      << (s.weeps ? "   <- WEEPS" : "")
                      << "\n";
    }

    std::cout << std::setprecision(1)
              << "  worst tray: " << r.floodApproachMax * 100.0 << " % of flood on stage "
              << r.floodStage << "    column dP = " << std::setprecision(2)
              << r.dPColumn / 1000.0 << " kPa    max downcomer backup "
              << std::setprecision(1) << r.backupMax << " mm\n";

    if (r.floodApproachMax >= 1.0)
        std::cout << "  WARNING: stage " << r.floodStage << " is AT OR ABOVE its flooding "
                     "velocity -- the vapour carries the liquid up with it and the column "
                     "separates nothing.  Widen it, space the trays further apart, or cut "
                     "the reflux.\n";
    else if (r.floodApproachMax > 0.85 && !r.designed)
        std::cout << "  NOTE: the worst tray runs above 85 % of flood -- little margin for "
                     "a feed upset.\n";
    if (r.nDcFlood > 0)
        std::cout << "  WARNING: " << r.nDcFlood << " tray(s) back the downcomer above "
                     "half the (spacing + weir) -- the column floods from below\n";
    if (!r.weepChecked)
        std::cout << "  weeping NOT checked: give `K2` (read off the weep-point chart "
                     "against h_w + h_ow) and the check runs\n";
    else if (r.nWeeping > 0)
        std::cout << "  WARNING: " << r.nWeeping << " tray(s) weep -- the hole velocity "
                     "falls below the weep point, liquid rains through\n";
    if (r.lowFlowParam)
        std::cout << "  NOTE: some tray has F_LV < 0.03, where the Lygeros-Magoulas fit of "
                     "Fair's chart is known to bend the wrong way.  Read C_SB off the chart "
                     "there; do not trust these flood numbers.\n";
    std::cout << "\n";
}

} // namespace Choupo
