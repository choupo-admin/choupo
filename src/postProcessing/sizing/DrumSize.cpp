/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
\*---------------------------------------------------------------------------*/

#include "DrumSize.H"
#include "PhaseDensity.H"
#include "core/Advisory.H"
#include "core/Constants.H"
#include "thermo/ThermoPackage.H"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <iostream>
#include <memory>
#include <stdexcept>

namespace Choupo {
namespace drumSize {

namespace {

constexpr scalar ft = 0.3048;     // m per ft (Wankat's K is in ft/s)
constexpr scalar inch = 0.0254;
constexpr scalar pi = constant::pi;
constexpr scalar gStd = 9.80665;   // m/s2, standard gravity

std::string fmt(double v, const char* f = "%.4g")
{
    char b[64];
    std::snprintf(b, sizeof(b), f, v);
    return b;
}

//  Liquid depth h in a horizontal cylinder of radius R from a liquid area A.
scalar depthFromArea(scalar R, scalar A)
{
    scalar lo = 0.0, hi = 2.0 * R;
    for (int i = 0; i < 80; ++i)
    {
        const scalar mid = 0.5 * (lo + hi);
        (segmentArea(R, mid) < A ? lo : hi) = mid;
    }
    return 0.5 * (lo + hi);
}

scalar need(const DictPtr& dr, const std::string& unit, const std::string& key,
            const std::string& why)
{
    if (!dr->found(key))
        throw std::runtime_error("Drum: unit '" + unit + "' sizes a separator"
            " drum and `drum { " + key + " ...; }` is not declared.\n  " + why
            + "\n  The sources do not fix this number, so the case declares it"
              " and states its reason.");
    return dr->lookupScalar(key);
}

} // namespace

scalar blackwellK_ftps(scalar Flv)
{
    //  Wankat Eq. 2-60 and the five constants printed under it.
    const scalar A = -1.877478097, B = -0.8145804597, C = -0.1870744085,
                 Dc = -0.0145228667, E = -0.0010148518;
    const scalar x = std::log(Flv);
    return std::exp(A + B * x + C * x * x + Dc * x * x * x
                    + E * x * x * x * x);
}

scalar haiderLevenspielTerminal(scalar d, scalar rho_g, scalar rho_L,
                                scalar mu_g)
{
    //  Kunii & Levenspiel, 2nd ed., p. 80-81:
    //  d* = d [rho_g (rho_s - rho_g) g / mu^2]^(1/3)           (Eq. 31)
    //  u* = [18/d*^2 + 0.591/d*^0.5]^-1, sphere                (Eq. 34)
    //  u_t = u* [mu (rho_s - rho_g) g / rho_g^2]^(1/3)         (Eq. 32)
    const scalar g = gStd;
    const scalar ds = d * std::cbrt(rho_g * (rho_L - rho_g) * g / (mu_g * mu_g));
    const scalar us = 1.0 / (18.0 / (ds * ds) + 0.591 / std::sqrt(ds));
    return us * std::cbrt(mu_g * (rho_L - rho_g) * g / (rho_g * rho_g));
}

scalar segmentArea(scalar R, scalar h)
{
    h = std::max(0.0, std::min(h, 2.0 * R));
    if (h <= 0.0) return 0.0;
    if (h >= 2.0 * R) return pi * R * R;
    return R * R * std::acos((R - h) / R) - (R - h) * std::sqrt(2.0 * R * h - h * h);
}

Result size(const std::string&      unitName,
            const SimulationResult& result,
            const DictPtr&          dr,
            EquipmentSizing&        d)
{
    const std::string who = "drum '" + unitName + "'";

    // ---- the two streams that leave the drum ----------------------------
    if (!dr->found("vapourStream") || !dr->found("liquidStream"))
        throw std::runtime_error("Drum: unit '" + unitName + "' needs `drum {"
            " vapourStream <name>; liquidStream <name>; ... }` -- the two"
            " outlet streams whose densities and flows size it.");
    const std::string vName = dr->lookupWord("vapourStream");
    const std::string lName = dr->lookupWord("liquidStream");
    const phaseDensity::Reading V = phaseDensity::of(result, vName, who);
    const phaseDensity::Reading L = phaseDensity::of(result, lName, who);
    if (V.phase != "vapour" || L.phase != "liquid")
        throw std::runtime_error("Drum: unit '" + unitName + "': `vapourStream "
            + vName + "` is a " + V.phase + " and `liquidStream " + lName
            + "` is a " + L.phase + " -- name the vapour outlet and the liquid"
              " outlet.");
    const scalar rhoV = V.rho, rhoL = L.rho;
    const scalar Qv = V.massFlow / rhoV;       // m3/s
    const scalar Ql = L.massFlow / rhoL;       // m3/s
    const scalar P  = V.P;

    // ---- the declarations -------------------------------------------------
    if (!dr->found("method"))
        throw std::runtime_error("Drum: unit '" + unitName + "' needs `drum {"
            " method wankat; }` or `method towler;` -- the published procedure"
            " that sizes it (Wankat section 2.8, or Towler & Sinnott section"
            " 10.9).");
    const std::string method = dr->lookupWord("method");
    if (method != "wankat" && method != "towler")
        throw std::runtime_error("Drum: unit '" + unitName + "': `method "
            + method + ";` -- accepted: wankat, towler.");
    if (!dr->found("demister"))
        throw std::runtime_error("Drum: unit '" + unitName + "' needs `drum {"
            " demister yes; }` or `demister no;` -- a mesh pad lets the vapour"
            " run faster (Towler: u_t, not 0.15 u_t).");
    const std::string dem = dr->lookupWord("demister");
    if (dem != "yes" && dem != "no")
        throw std::runtime_error("Drum: unit '" + unitName + "': `demister "
            + dem + ";` -- accepted: yes, no.");
    const bool demister = dem == "yes";
    const std::string orient = dr->lookupWordOrDefault("orientation", "auto");
    if (orient != "auto" && orient != "vertical" && orient != "horizontal")
        throw std::runtime_error("Drum: unit '" + unitName + "': `orientation "
            + orient + ";` -- accepted: auto, vertical, horizontal.");

    const scalar tHold  = need(dr, unitName, "holdupTime",
        "The liquid hold-up between the normal and the low level, in seconds"
        " (Towler section 10.9.2: 10 minutes typical).");
    const scalar tSurge = need(dr, unitName, "surgeTime",
        "The surge time between the normal and the high level, in seconds.");
    const scalar hLow   = need(dr, unitName, "lowLevel",
        "The low liquid level above the bottom tangent line, in m (Towler"
        " Example 10.5: 0.3 m for the level controller).");
    const scalar step   = dr->found("diameterStep") ? dr->lookupScalar("diameterStep") : 0.0;
    const scalar dDrop  = dr->found("dropDiameter") ? dr->lookupScalar("dropDiameter") : 0.0;

    if (!dr->found("nozzleVelocity"))
        throw std::runtime_error("Drum: unit '" + unitName + "' needs `drum {"
            " nozzleVelocity { feed ...; vapour ...; liquid ...; } }` in m/s"
            " (Towler section 5: liquids pumped 1-3 m/s, gases and vapours"
            " 15-30 m/s).");
    const DictPtr nv = dr->subDict("nozzleVelocity");
    const scalar uFeed = nv->lookupScalar("feed");
    const scalar uVap  = nv->lookupScalar("vapour");
    const scalar uLiq  = nv->lookupScalar("liquid");
    const scalar feedRhoV2Max =
        dr->found("feedRhoV2Max") ? dr->lookupScalar("feedRhoV2Max") : 0.0;

    // ---- the allowable vapour velocity (Souders-Brown) ---------------------
    const scalar Flv = (L.massFlow / V.massFlow) * std::sqrt(rhoV / rhoL);
    scalar K = 0.0;  std::string kText;
    if (dr->found("K"))
    {
        K = dr->lookupScalar("K");
        kText = "K = " + fmt(K) + " m/s (declared)";
    }
    else if (method == "wankat")
    {
        K = blackwellK_ftps(Flv) * ft;
        kText = "K = " + fmt(K) + " m/s = " + fmt(K / ft) + " ft/s, Blackwell"
                " fit of Watkins' chart at F_lv = " + fmt(Flv)
                + " (Wankat Eq. 2-60)";
    }
    else
    {
        K = 0.07;
        kText = "K = 0.07 m/s (Towler Eq. 10.10)";
    }
    const scalar ut_SB = K * std::sqrt((rhoL - rhoV) / rhoV);   // m/s
    //  Towler: x0.15 without a demister.  Wankat: the chart is for no
    //  demister at 85 % of flood, and the same K serves with one.
    scalar uPerm = ut_SB;
    if (method == "towler" && !demister) uPerm *= 0.15;
    const scalar uPermVert = uPerm;
    const scalar uPermHor  = (method == "wankat") ? 1.25 * uPerm : uPerm;

    // ---- the geometry: vertical first, horizontal if it is chosen ----------
    //  Nozzles first: the feed line sets Wankat's clearances.
    const scalar Qfeed = Qv + Ql;
    const scalar rhoMix = (V.massFlow + L.massFlow) / Qfeed;
    const scalar dFeed = std::sqrt(4.0 * Qfeed / (pi * uFeed));
    const scalar dVap  = std::sqrt(4.0 * Qv / (pi * uVap));
    const scalar dLiq  = std::sqrt(4.0 * Ql / (pi * uLiq));

    auto roundUp = [&](scalar x) { return step > 0.0 ? std::ceil(x / step - 1e-9) * step : x; };

    struct Geo { scalar D, H, Hshell, LLL, NLL, HLL, uv, tRes, tSet; scalar fillArea; };
    Geo vert{}, hor{};

    //  VERTICAL.  D from the vapour area (Towler Eq. 10.11 / Wankat Eq. 2-62).
    {
        const scalar Ac = Qv / uPermVert;
        vert.D = roundUp(std::sqrt(4.0 * Ac / pi));
        const scalar A = pi * vert.D * vert.D / 4.0;
        vert.LLL = hLow;
        vert.NLL = hLow + Ql * tHold / A;
        vert.HLL = vert.NLL + Ql * tSurge / A;
        scalar hf, hv, pad = 0.0;
        if (method == "towler")
        {   //  Figure 10.51a: inlet at least D/2 (0.6 m min) above the liquid,
            //  D (1.0 m min) of disengagement to the pad, 0.4 m min for the pad.
            hf = std::max(vert.D / 2.0, 0.6);
            hv = std::max(vert.D, 1.0);
            pad = demister ? 0.4 : 0.0;
        }
        else
        {   //  Wankat section 2.8: hf 12 in + d_feed/2 (18 in min), hv 36 in
            //  + d_feed/2 (48 in min).
            hf = std::max(12.0 * inch + dFeed / 2.0, 18.0 * inch);
            hv = std::max(36.0 * inch + dFeed / 2.0, 48.0 * inch);
        }
        vert.H = vert.HLL + hf + hv + pad;
        vert.Hshell = vert.H;
        vert.uv = Qv / A;
        vert.tRes = 0.0; vert.tSet = 0.0;
    }

    //  HORIZONTAL.
    {
        scalar Dh, Lh;
        const scalar Vliq = Ql * (tHold + tSurge);
        if (method == "wankat")
        {   //  Eq. 2-64: A_T = A_c / 0.2 with K_h = 1.25 K_v.
            const scalar Ac = Qv / uPermHor;
            const scalar AT = Ac / 0.2;
            Dh = roundUp(std::sqrt(4.0 * AT / pi));
            const scalar ATact = pi * Dh * Dh / 4.0;
            const scalar Aliq = 0.8 * ATact;
            const scalar R = Dh / 2.0;
            Lh = std::max(3.0 * Dh, Vliq / (Aliq - segmentArea(R, hLow)));
            hor.fillArea = Aliq;
        }
        else
        {   //  Gerunda / Towler 10.9.3: L/D by pressure, liquid at half depth;
            //  settling-time balance 0.5 D / u_a = (L/D) D / u_v with
            //  u_v = Q_v / (0.5 A_T)  ->  D = sqrt(Q_v / (0.5 pi/4 ... )).
            const scalar bar = P * 1e-5;
            const scalar LD = bar < 20.0 ? 3.0 : (bar <= 35.0 ? 4.0 : 5.0);
            //  t_settle = (D/2)/u_a ; t_res = L / (Q_v/(pi D^2/8))
            //  equal  ->  D^2 = Q_v * 4 / (pi * LD * u_a)
            Dh = std::sqrt(4.0 * Qv / (pi * LD * uPermHor));
            for (int it = 0; it < 4000; ++it)
            {
                const scalar R = Dh / 2.0;
                const scalar Lc = LD * Dh;
                const scalar Hold = Lc * (pi * R * R / 2.0 - segmentArea(R, hLow));
                if (Hold >= Vliq) break;
                Dh *= 1.005;
            }
            Dh = roundUp(Dh);
            Lh = LD * Dh;
            hor.fillArea = pi * Dh * Dh / 8.0;
        }
        const scalar R = Dh / 2.0;
        hor.D = Dh;  hor.H = Lh;  hor.Hshell = Lh;
        hor.LLL = hLow;
        const scalar AL = segmentArea(R, hLow);
        hor.NLL = depthFromArea(R, AL + Ql * tHold / Lh);
        hor.HLL = depthFromArea(R, AL + Ql * (tHold + tSurge) / Lh);
        const scalar Av = pi * R * R - segmentArea(R, hor.HLL);
        hor.uv = Qv / Av;
        hor.tRes = Lh / hor.uv;
        hor.tSet = (Dh - hor.HLL) / uPermHor;
    }

    // ---- the choice ----------------------------------------------------------
    //  Wankat: a vertical drum has H/D from 3 to 5, and above 5 a horizontal
    //  drum should be used.  Towler: a horizontal one where a long hold-up is
    //  needed -- the same condition seen from the other side.
    bool horizontal;  std::string why;
    if (orient == "vertical")        { horizontal = false; why = "declared"; }
    else if (orient == "horizontal") { horizontal = true;  why = "declared"; }
    else
    {
        const scalar r = vert.H / vert.D;
        horizontal = r > 5.0;
        why = "auto: vertical H/D = " + fmt(r) + (horizontal
              ? " > 5 (Wankat section 2.8: use a horizontal drum)"
              : (r < 3.0 ? " < 3, so vertical (Wankat: a larger liquid surge would be allowed)"
                         : " is within the 3-5 window, so vertical"));
    }
    const Geo& g = horizontal ? hor : vert;

    // ---- the droplet check (Haider & Levenspiel) ---------------------------
    scalar utDrop = 0.0, muV = 0.0;  bool haveDrop = false;  std::string dropNote;
    if (dDrop > 0.0)
    {
        try
        {
            std::shared_ptr<const ThermoPackage> pkg = result.thermoForPost();
            const auto& s = result.streams.at(vName);
            muV = pkg->viscosityGas(s.T, s.P, s.z);
            utDrop = haiderLevenspielTerminal(dDrop, rhoV, rhoL, muV);
            haveDrop = std::isfinite(utDrop);
        }
        catch (const std::exception& e)
        {
            dropNote = std::string("not computed: ") + e.what();
        }
    }
    else dropNote = "no `dropDiameter` declared";

    // ---- the nozzle momentum ---------------------------------------------------
    const scalar rv2Feed = rhoMix * uFeed * uFeed;

    // ---- print -----------------------------------------------------------------
    std::cout << "  [drum] " << who << ": " << method << ", "
              << (demister ? "with" : "without") << " demister, "
              << (horizontal ? "HORIZONTAL" : "VERTICAL") << " (" << why << ")\n"
              << "         vapour '" << vName << "' rho " << fmt(rhoV, "%.4g")
              << " kg/m3, Q " << fmt(Qv, "%.5g") << " m3/s;  liquid '" << lName
              << "' rho " << fmt(rhoL, "%.4g") << " kg/m3, Q " << fmt(Ql, "%.5g")
              << " m3/s;  F_lv " << fmt(Flv) << "\n"
              << "         Souders-Brown: " << kText << " -> u_t = "
              << fmt(ut_SB) << " m/s, allowable u = " << fmt(horizontal ? uPermHor : uPermVert)
              << " m/s\n";
    //  A VERTICAL drum: the droplet settles if its terminal velocity exceeds the
    //  rising vapour's.  A HORIZONTAL one: the vapour crosses the drum and the
    //  droplet falls through the free height, so it settles if the time to fall
    //  (free height / terminal velocity) is within the vapour's residence time.
    bool dropSettles = false;  scalar fallTime = 0.0;
    if (haveDrop)
    {
        if (horizontal)
        {
            fallTime = (hor.D - hor.HLL) / utDrop;
            dropSettles = fallTime <= hor.tRes;
        }
        else dropSettles = utDrop > vert.uv;
    }
    if (haveDrop)
    {
        std::cout << "         droplet check: d = " << fmt(dDrop * 1e6, "%.0f")
                  << " um, gas viscosity " << fmt(muV, "%.3g")
                  << " Pa.s, Haider-Levenspiel terminal velocity " << fmt(utDrop) << " m/s; ";
        if (horizontal)
            std::cout << "free fall " << fmt(hor.D - hor.HLL) << " m takes " << fmt(fallTime)
                      << " s vs vapour residence " << fmt(hor.tRes) << " s";
        else
            std::cout << "vapour rises at " << fmt(vert.uv) << " m/s";
        std::cout << " -> " << (dropSettles ? "the droplet settles" : "the droplet is CARRIED OVER") << "\n";
    }
    else
        std::cout << "         droplet check: " << dropNote << "\n";
    if (!horizontal)
        std::cout << "         D = " << fmt(vert.D) << " m from A = Q_v/u (rounded up"
                  << (step > 0 ? " to a step of " + fmt(step) + " m" : std::string(", no step"))
                  << "), H = " << fmt(vert.H) << " m, H/D = " << fmt(vert.H / vert.D)
                  << (vert.H / vert.D < 3.0 || vert.H / vert.D > 5.0 ? "  OUTSIDE the 3-5 window (Wankat)" : "  (window 3-5)")
                  << "\n";
    else
        std::cout << "         D = " << fmt(hor.D) << " m, L = " << fmt(hor.H) << " m, L/D = "
                  << fmt(hor.H / hor.D)
                  << (hor.H / hor.D < 3.0 || hor.H / hor.D > 5.0 ? "  OUTSIDE the 3-5 window" : "  (window 3-5)")
                  << ";  vapour residence " << fmt(hor.tRes) << " s vs droplet settling "
                  << fmt(hor.tSet) << " s -> " << (hor.tRes >= hor.tSet * 0.999 ? "satisfied" : "NOT satisfied") << "\n";
    std::cout << "         levels above the bottom: LLL " << fmt(g.LLL) << " m, NLL "
              << fmt(g.NLL) << " m, HLL " << fmt(g.HLL) << " m (hold-up "
              << fmt(tHold, "%.0f") << " s, surge " << fmt(tSurge, "%.0f") << " s)\n"
              << "         nozzles: feed " << fmt(dFeed * 1000, "%.0f") << " mm at "
              << fmt(uFeed) << " m/s (rho v^2 = " << fmt(rv2Feed, "%.0f") << " Pa"
              << (feedRhoV2Max > 0.0 ? (rv2Feed <= feedRhoV2Max ? ", within the declared limit " : ", ABOVE the declared limit ")
                                         + fmt(feedRhoV2Max, "%.0f") + " Pa" : std::string(", no limit declared"))
              << "), vapour " << fmt(dVap * 1000, "%.0f") << " mm at " << fmt(uVap)
              << " m/s, liquid " << fmt(dLiq * 1000, "%.0f") << " mm at " << fmt(uLiq) << " m/s\n";
    auto outside = [&](const char* nm, scalar u, scalar lo, scalar hi)
    {
        if (u < lo || u > hi)
            std::cout << "         note: the " << nm << " nozzle velocity " << fmt(u)
                      << " m/s is outside Towler's typical " << fmt(lo, "%.0f") << "-"
                      << fmt(hi, "%.0f") << " m/s\n";
    };
    outside("liquid", uLiq, 1.0, 3.0);
    outside("vapour", uVap, 15.0, 30.0);

    // ---- the record ---------------------------------------------------------------
    Result out;
    out.D = g.D;  out.H = g.Hshell;
    out.V = pi * g.D * g.D / 4.0 * g.Hshell;
    out.basis = std::string("separator drum, ") + method + ": "
        + (horizontal ? "horizontal" : "vertical") + " (" + why + "); allowable vapour"
        " velocity by Souders-Brown, " + kText + (demister ? ", with demister" : ", no demister")
        + "; levels from hold-up " + fmt(tHold, "%.0f") + " s and surge " + fmt(tSurge, "%.0f")
        + " s above a low level of " + fmt(hLow) + " m; V is the tangent-to-tangent shell";
    d.set("horizontal",  horizontal ? 1.0 : 0.0, "-");
    d.set("K_SB",        K,         "m/s");
    d.set("u_allowable", horizontal ? uPermHor : uPermVert, "m/s");
    d.set("u_vapour",    g.uv,      "m/s");
    if (haveDrop) { d.set("u_drop_terminal", utDrop, "m/s");
                    d.set("drop_settles", dropSettles ? 1.0 : 0.0, "-"); }
    d.set("rho_vapour",  rhoV,      "kg/m3");
    d.set("rho_liquid",  rhoL,      "kg/m3");
    d.set("Q_vapour",    Qv,        "m3/s");
    d.set("Q_liquid",    Ql,        "m3/s");
    d.set("LLL",         g.LLL,     "m");
    d.set("NLL",         g.NLL,     "m");
    d.set("HLL",         g.HLL,     "m");
    d.set("d_nozzle_feed",   dFeed, "m");
    d.set("d_nozzle_vapour", dVap,  "m");
    d.set("d_nozzle_liquid", dLiq,  "m");
    d.set("rhov2_feed",  rv2Feed,   "Pa");
    return out;
}

} // namespace drumSize
} // namespace Choupo
