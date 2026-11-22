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
    The fixed bed's dispersion, film and series-resistance correlations
    (C450).  Every coefficient below was READ at the printed page named in its
    citation (the articles are in the project's literature folder), never
    from memory; where the article's own text and a textbook that quotes it
    differ in rounding (Ruthven 1984 prints Re^0.33 where Wilson & Geankoplis'
    J_D = 1.09/eps Re^-2/3 gives Re^(1/3)) the article's exponent is used.
\*---------------------------------------------------------------------------*/

#include "BedTransportCorrelations.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

BedAnchor makeAnchor(scalar value, scalar published, const std::string& kind,
                     const std::string& text)
{
    BedAnchor a;
    a.value = value;
    a.published = published;
    a.dev = std::abs(value - published) / std::abs(published);
    a.kind = kind;
    a.anchor = text;
    return a;
}

//  Append "name = v (outside lo..hi)" to a note.
void outside(std::string& note, bool& ok, const std::string& what)
{
    ok = false;
    if (!note.empty()) note += "; ";
    note += what;
}

std::string num(scalar v)
{
    std::ostringstream os;
    os.precision(4);
    os << v;
    return os.str();
}

// =========================================================================
//  AXIAL DISPERSION
// =========================================================================

// -------------------------------------------------------------------------
//  Wakao & Funazkri (1978), Chem. Eng. Sci. 33, 1375-1384, p. 1375, eq (2):
//
//      eps D_ax / Dm = 20 + 0.5 Sc Re        (mass-transfer condition)
//
//  D_ax interstitial, so the BED-basis dispersion is eps D_ax = Dm (20 +
//  0.5 Sc Re) = 20 Dm + 0.5 dp U.  The "20" is the stagnant contribution
//  E0/Dm of a particle whose surface, not its inside, controls the transfer
//  (the paper's chart value at phi = infinity); it is NOT the 0.6-0.8 of
//  inert flow (their eq 3).  The paper applies eq (2) to data over
//  Re ~ 3 ... 10 000 (abstract).
// -------------------------------------------------------------------------
class WakaoFunazkriDispersion : public BedDispersionCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& phase() const override { return phase_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    BedDispersionResult evaluate(const BedContext& c) const override
    {
        BedDispersionResult r;
        r.Dax = c.Dm * (20.0 + 0.5 * c.Sc * c.Re);
        r.DL = r.Dax / c.eps;
        if (c.Re < 3.0 || c.Re > 1.0e4)
            outside(r.note, r.inWindow, "Re = " + num(c.Re)
                + " is outside the 3 .. 1e4 range of the data the paper"
                  " corrected with this equation");
        return r;
    }

    BedAnchor verify() const override
    {
        BedContext c;
        c.Re = 1.0e-9; c.Sc = 1.0; c.eps = 0.4; c.dp = 1.0e-3; c.U = 1.0;
        c.Dm = 1.0;
        const scalar v = evaluate(c).Dax / c.Dm;
        return makeAnchor(v, 20.0, "printed number",
            "Re Sc -> 0: eps D_ax/Dm = 20, the stagnant term E0/Dm the paper"
            " reads off its chart (p. 1375, text under eq 2)");
    }

private:
    std::string type_ = "WakaoFunazkri";
    std::string phase_ = "gas+liquid";
    std::string window_ = "Re ~ 3 .. 1e4 (the data the equation was applied to,"
        " abstract p. 1375); particles whose surface controls the transfer"
        " (eq 2, not the inert-flow eq 3)";
    std::string cite_ = "Wakao, N.; Funazkri, T. (1978) Chem. Eng. Sci. 33,"
        " 1375-1384, p. 1375, eq (2)";
};

// -------------------------------------------------------------------------
//  Edwards & Richardson (1968), Chem. Eng. Sci. 23, 109-123, p. 119, eq (17):
//
//      D_L = 0.73 Dm + 0.5 u dp / (1 + 9.7 Dm / (u dp))
//
//  u the INTERSTITIAL velocity (p. 109: "u is the mean axial interstitial
//  velocity"), Re = u dp eps / nu = U dp / nu.  Window (abstract, p. 109):
//  0.008 < Re < 50, 0.0377 < dp < 0.60 cm; ONE system (argon pulse in air,
//  non-porous particles), and "with finer particles channelling occurs".
// -------------------------------------------------------------------------
class EdwardsRichardsonDispersion : public BedDispersionCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& phase() const override { return phase_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    BedDispersionResult evaluate(const BedContext& c) const override
    {
        BedDispersionResult r;
        const scalar u = c.U / c.eps;
        const scalar ud = u * c.dp;
        r.DL = 0.73 * c.Dm + 0.5 * ud / (1.0 + 9.7 * c.Dm / ud);
        r.Dax = c.eps * r.DL;
        if (!c.gasPhase)
            outside(r.note, r.inWindow, "a GAS correlation (air/argon) asked"
                " about a liquid bed");
        if (c.Re < 0.008 || c.Re > 50.0)
            outside(r.note, r.inWindow, "Re = " + num(c.Re)
                + " is outside 0.008 .. 50");
        if (c.dp < 3.77e-4 || c.dp > 6.0e-3)
            outside(r.note, r.inWindow, "dp = " + num(c.dp * 100.0)
                + " cm is outside 0.0377 .. 0.60 cm (finer particles"
                  " channel, p. 109)");
        return r;
    }

    BedAnchor verify() const override
    {
        //  The paper prints the same result twice: eq (17) and, for eps =
        //  0.37 and Sc = 0.72, eq (18): 1/Pe = 0.38/Re + 0.5/(1 + 5.0/Re),
        //  Pe = u dp / D_L.  Re = 10 sits in the middle of both terms.
        BedContext c;
        c.Re = 10.0; c.Sc = 0.72; c.eps = 0.37; c.dp = 1.0e-3; c.U = 1.0;
        c.Dm = c.U * c.dp / (c.Re * c.Sc);
        const BedDispersionResult r = evaluate(c);
        const scalar invPe17 = r.DL / ((c.U / c.eps) * c.dp);
        const scalar invPe18 = 0.38 / c.Re + 0.5 / (1.0 + 5.0 / c.Re);
        return makeAnchor(invPe17, invPe18, "cross-check",
            "eq (17) against the paper's own eq (18) at Re = 10, eps = 0.37,"
            " Sc = 0.72 (both p. 119); eq (18) carries rounded constants"
            " (0.38, 5.0), so ~0.5 % is the printing, not an error");
    }

private:
    std::string type_ = "EdwardsRichardson";
    std::string phase_ = "gas";
    std::string window_ = "0.008 < Re < 50 and 0.0377 < dp < 0.60 cm (abstract,"
        " p. 109); one system (argon pulse in air, non-porous particles);"
        " finer particles channel and raise the apparent D_L";
    std::string cite_ = "Edwards, M.F.; Richardson, J.F. (1968) Chem. Eng."
        " Sci. 23, 109-123, p. 119 eq (17) (window p. 109)";
};

// -------------------------------------------------------------------------
//  Chung & Wen (1968), AIChE J. 14, 857-866, p. 864, eqs (15)-(16), fixed
//  bed (X = 1):
//
//      eps N_Pe = 0.20 + 0.011 N_Re^0.48,   N_Pe = dp u / E_z (u interstitial),
//      N_Re = dp U rho / mu
//
//  so E_z = dp U / (0.20 + 0.011 Re^0.48) is the INTERSTITIAL dispersion
//  (eq 16: E_z rho/mu = N_Re / (0.20 + 0.011 N_Re^0.48)) and the bed-basis
//  Dax = eps E_z.  Liquids.  Stated range p. 864: Re 1e-3 .. 1e3, voidage
//  0.4 .. 0.8; standard deviation of the fit on 482 points 46 %.
// -------------------------------------------------------------------------
class ChungWenDispersion : public BedDispersionCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& phase() const override { return phase_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    BedDispersionResult evaluate(const BedContext& c) const override
    {
        BedDispersionResult r;
        r.DL = c.dp * c.U / (0.20 + 0.011 * std::pow(c.Re, 0.48));
        r.Dax = c.eps * r.DL;
        if (c.gasPhase)
            outside(r.note, r.inWindow, "a LIQUID correlation (fluorescein in"
                " liquids, p. 857/864) asked about a gas bed");
        if (c.Re < 1.0e-3 || c.Re > 1.0e3)
            outside(r.note, r.inWindow, "Re = " + num(c.Re)
                + " is outside 1e-3 .. 1e3");
        if (c.eps < 0.4 || c.eps > 0.8)
            outside(r.note, r.inWindow, "voidage " + num(c.eps)
                + " is outside 0.4 .. 0.8");
        return r;
    }

    BedAnchor verify() const override
    {
        //  p. 865: "For the Reynolds number less than 10, the value of
        //  eps N_Pe / X is approximately 0.2."
        BedContext c;
        c.Re = 1.0e-3; c.Sc = 1000.0; c.eps = 0.4; c.dp = 1.0e-3; c.U = 1.0;
        c.Dm = 1.0e-9; c.gasPhase = false;
        const scalar epsPe = c.dp * c.U / evaluate(c).DL;
        return makeAnchor(epsPe, 0.2, "printed number",
            "eps N_Pe -> 0.2 at low Re (p. 865: 'approximately 0.2' for Re < 10;"
            " tolerance is the paper's 'approximately')");
    }

private:
    std::string type_ = "ChungWen";
    std::string phase_ = "liquid";
    std::string window_ = "Re 1e-3 .. 1e3, voidage 0.4 .. 0.8, particle density"
        " up to 480 lb/ft3 (p. 864); LIQUIDS (the paper also covers the expanded bed with its X factor);"
        " standard deviation 46 % on 482 points";
    std::string cite_ = "Chung, S.F.; Wen, C.Y. (1968) AIChE J. 14(6), 857-866,"
        " p. 864 eqs (15)-(16)";
};

// -------------------------------------------------------------------------
//  Gunn (1987), Chem. Eng. Sci. 42(2), 363-373, p. 364 eq (1) with the
//  probability p of eq (3) (spheres, tortuosity tau = 1.4, p. 365):
//
//    D/(U d) = Re Sc (1-p)^2 / (4 a1^2 (1-eps))
//            + Re^2 Sc^2 p (1-p)^3 / (16 a1^4 (1-eps)^2)
//                  * [ exp(-4 (1-eps) a1^2 / (p (1-p) Re Sc)) - 1 ]
//            + eps / (tau Re Sc),           p = 0.17 + 0.33 exp(-24/Re)
//
//  a1 = 2.4048 the first root of J0.  READING OF THE BASIS (the paper says
//  only "usual connotations"): the molecular term eps/(tau Re Sc) makes D
//  the BED-basis dispersion (eps Dm/tau = 0.29 Dm at eps = 0.4, against
//  Edwards & Richardson's eps * 0.73 Dm = 0.29 Dm), so D is returned as Dax
//  with U superficial; the high-Re limit (1-p)/(2p) = 0.5 then equals
//  Edwards & Richardson's 0.5 u dp.  Window: the paper compares eq (1) with
//  data for Re 0.01 .. 1000 and Sc 0.77 .. 1500 (Fig 1, p. 365); p is
//  constant below Re = 1 and above 1000; spheres only (tau = 1.4).
// -------------------------------------------------------------------------
class GunnDispersion : public BedDispersionCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& phase() const override { return phase_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    BedDispersionResult evaluate(const BedContext& c) const override
    {
        BedDispersionResult r;
        const scalar a1 = 2.404825557695773;
        const scalar tau = 1.4;
        const scalar p = 0.17 + 0.33 * std::exp(-24.0 / c.Re);
        const scalar RS = c.Re * c.Sc;
        const scalar e1 = 1.0 - c.eps;
        const scalar t1 = RS * (1.0 - p) * (1.0 - p)
                        / (4.0 * a1 * a1 * e1);
        const scalar x = 4.0 * e1 * a1 * a1 / (p * (1.0 - p) * RS);
        const scalar t2 = RS * RS * p * std::pow(1.0 - p, 3)
                        / (16.0 * std::pow(a1, 4) * e1 * e1)
                        * std::expm1(-x);
        const scalar t3 = c.eps / (tau * RS);
        r.Dax = c.U * c.dp * (t1 + t2 + t3);
        r.DL = r.Dax / c.eps;
        if (c.Re < 0.01 || c.Re > 1000.0)
            outside(r.note, r.inWindow, "Re = " + num(c.Re)
                + " is outside the 0.01 .. 1000 the paper compares with data");
        if (c.Sc < 0.77 || c.Sc > 1500.0)
            outside(r.note, r.inWindow, "Sc = " + num(c.Sc)
                + " is outside the 0.77 .. 1500 the paper compares with data");
        return r;
    }

    BedAnchor verify() const override
    {
        //  Re Sc -> infinity: the first two terms cancel to (1-p)/(2p), and
        //  p -> 0.17 + 0.33 = 0.5 (eq 3), so D/(U d) -> 0.5 -- the same 0.5
        //  as Edwards & Richardson's high-Re term (their data are the 'x' of
        //  the paper's Fig 1).  A limit that follows from the printed form,
        //  not a number the paper prints.
        BedContext c;
        c.Re = 1.0e8; c.Sc = 0.77; c.eps = 0.4; c.dp = 1.0e-3; c.U = 1.0;
        c.Dm = c.U * c.dp / (c.Re * c.Sc);
        const scalar v = evaluate(c).Dax / (c.U * c.dp);
        return makeAnchor(v, 0.5, "limit",
            "Re -> infinity: D/(U d) -> (1-p)/(2p) = 0.5 with p = 0.17 + 0.33"
            " (p. 364 eq 1, p. 365 eq 3); derived from the printed form");
    }

private:
    std::string type_ = "Gunn";
    std::string phase_ = "gas+liquid";
    std::string window_ = "spheres (tau = 1.4); compared with data for Re 0.01 .."
        " 1000 and Sc 0.77 .. 1500 (Fig 1, p. 365); p is constant below Re = 1"
        " and above 1000 (p. 365).  The basis (bed, superficial U) is READ"
        " from the molecular term, not stated";
    std::string cite_ = "Gunn, D.J. (1987) Chem. Eng. Sci. 42(2), 363-373,"
        " p. 364 eq (1), p. 365 eq (3)";
};

// =========================================================================
//  EXTERNAL FILM
// =========================================================================

// -------------------------------------------------------------------------
//  Wakao & Funazkri (1978), p. 1383, eq (12):   Sh = 2 + 1.1 Sc^(1/3) Re^0.6,
//  Sh = k_f dp / Dm, 3 < Re < 1e4, gas AND liquid data corrected for axial
//  dispersion (abstract, p. 1375; quoted as eq 7.16 in Ruthven 1984, p. 215).
//  The corrected data approach Sh = 2 at low Re.
// -------------------------------------------------------------------------
class WakaoFunazkriFilm : public BedFilmCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& phase() const override { return phase_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    BedFilmResult evaluate(const BedContext& c) const override
    {
        BedFilmResult r;
        r.Sh = 2.0 + 1.1 * std::cbrt(c.Sc) * std::pow(c.Re, 0.6);
        r.kf = r.Sh * c.Dm / c.dp;
        if (c.Re < 3.0 || c.Re > 1.0e4)
            outside(r.note, r.inWindow, "Re = " + num(c.Re)
                + " is outside 3 .. 1e4 (below 3 the data may be affected by"
                  " natural convection, p. 1383-1384)");
        return r;
    }

    BedAnchor verify() const override
    {
        BedContext c;
        c.Re = 100.0; c.Sc = 1.0; c.eps = 0.4; c.dp = 1.0e-3; c.Dm = 1.0e-5;
        c.U = 1.0;
        //  2 + 1.1 * 100^0.6 = 2 + 1.1 * 15.848932 = 19.433825 (by hand).
        return makeAnchor(evaluate(c).Sh, 19.433825, "arithmetic",
            "Sc = 1, Re = 100: eq (12) evaluated by hand (p. 1383) -- proves"
            " the transcription, not the physics; the physics is the paper's"
            " Fig 4-5 scatter");
    }

private:
    std::string type_ = "WakaoFunazkri";
    std::string phase_ = "gas+liquid";
    std::string window_ = "3 < Re < 1e4, gas and liquid (abstract, p. 1375);"
        " data corrected for axial dispersion with eq (2), so the two"
        " equations belong together";
    std::string cite_ = "Wakao, N.; Funazkri, T. (1978) Chem. Eng. Sci. 33,"
        " 1375-1384, p. 1383 eq (12)";
};

// -------------------------------------------------------------------------
//  Wilson & Geankoplis (1966), Ind. Eng. Chem. Fundam. 5(1), 9-14, p. 13:
//
//    J_D eps = 1.09 Re'^(-2/3)          0.0016 < Re' < 55, 0.35 < eps < 0.75  (eq 8)
//    J_D eps = 0.250 Re'^(-0.31)        55 < Re' < 1500                         (eq 9)
//    J_D = (k_c/U) Sc^(2/3)  (eq 3 definition, nomenclature p. 14),
//    Re' = dp U rho / mu (superficial)
//
//  so Sh = k_c dp/Dm = J_D Re' Sc^(1/3) = (1.09/eps) Re'^(1/3) Sc^(1/3) at
//  low Re' and (0.250/eps) Re'^0.69 Sc^(1/3) above 55 (the exponents Ruthven
//  1984 eq 7.15 prints as 0.33 and 0.69).  LIQUIDS: benzoic acid spheres in
//  water and propylene glycol, Sc 950 .. 70 600.
// -------------------------------------------------------------------------
class WilsonGeankoplisFilm : public BedFilmCorrelation
{
public:
    const std::string& type() const override { return type_; }
    const std::string& phase() const override { return phase_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    BedFilmResult evaluate(const BedContext& c) const override
    {
        BedFilmResult r;
        const bool low = c.Re <= 55.0;
        const scalar JDeps = low ? 1.09 * std::pow(c.Re, -2.0 / 3.0)
                                 : 0.250 * std::pow(c.Re, -0.31);
        r.Sh = (JDeps / c.eps) * c.Re * std::cbrt(c.Sc);
        r.kf = r.Sh * c.Dm / c.dp;
        if (c.gasPhase)
            outside(r.note, r.inWindow, "a LIQUID correlation (benzoic acid in"
                " water / propylene glycol) asked about a gas bed; the authors"
                " recommend Gupta & Thodos for gases (p. 13)");
        if (c.Re < 0.0016 || c.Re > 1500.0)
            outside(r.note, r.inWindow, "Re' = " + num(c.Re)
                + " is outside 0.0016 .. 1500");
        if (low && (c.eps < 0.35 || c.eps > 0.75))
            outside(r.note, r.inWindow, "voidage " + num(c.eps)
                + " is outside 0.35 .. 0.75 (eq 8)");
        if (c.Sc < 950.0 || c.Sc > 70600.0)
            outside(r.note, r.inWindow, "Sc = " + num(c.Sc)
                + " is outside the 950 .. 70 600 measured");
        return r;
    }

    BedAnchor verify() const override
    {
        //  p. 11 eq (4): J = 2.50 Re'^(-2/3) for the Table I bed, whose
        //  voidage is printed as eps = 0.436 (p. 10).  Eq (8)'s 1.09/eps at
        //  that voidage must give 2.50 (J = Sh at Re' = 1, Sc = 1).
        BedContext c;
        c.Re = 1.0; c.Sc = 1.0; c.eps = 0.436; c.dp = 1.0e-3; c.Dm = 1.0e-9;
        c.U = 1.0; c.gasPhase = false;
        return makeAnchor(evaluate(c).Sh, 2.50, "printed number",
            "J = 2.50 Re'^(-2/3) (p. 11, eq 4) is eq (8) at the Table I bed"
            " voidage 0.436 (p. 10): 1.09/0.436 = 2.50");
    }

private:
    std::string type_ = "WilsonGeankoplis";
    std::string phase_ = "liquid";
    std::string window_ = "Re' 0.0016 .. 55 with voidage 0.35 .. 0.75 (eq 8) and"
        " 55 .. 1500 (eq 9); Sc 950 .. 70 600; LIQUIDS (benzoic acid in water"
        " and propylene glycol), spheres, downflow (p. 13)";
    std::string cite_ = "Wilson, E.J.; Geankoplis, C.J. (1966) Ind. Eng. Chem."
        " Fundam. 5(1), 9-14, p. 13 eqs (8)-(9)";
};

} // namespace

// =========================================================================
//  LDF constant from resistances in series
// =========================================================================

LdfSeriesResult ldfSeries(const LdfSeriesInput& in)
{
    LdfSeriesResult r;
    if (in.kf > 0.0)
        r.tFilm = in.K * in.Rp / (3.0 * in.kf);
    if (in.Dp > 0.0 && in.epsP > 0.0)
        r.tMacro = in.K * in.Rp * in.Rp / (15.0 * in.epsP * in.Dp);
    if (in.DcOverRc2 > 0.0)
        r.tMicro = 1.0 / (15.0 * in.DcOverRc2);
    const scalar sum = r.tFilm + r.tMacro + r.tMicro;
    if (sum <= 0.0)
        throw std::runtime_error("ldfSeries: no resistance was given (film,"
            " macropore, micropore all absent) -- there is no k to estimate");
    r.k = 1.0 / sum;
    r.shareFilm = r.tFilm / sum;
    r.shareMacro = r.tMacro / sum;
    r.shareMicro = r.tMicro / sum;
    return r;
}

const std::string& ldfSeriesCitation()
{
    static const std::string s = "Ruthven, D.M. (1984) Principles of Adsorption"
        " and Adsorption Processes, Wiley, p. 243 eq (8.41) (the series"
        " extension of Glueckauf's approximation); the 15 of the internal"
        " terms is Glueckauf, E. (1955) Trans. Faraday Soc. 51, 1540-1551,"
        " p. 1543 eqn (3a): d q/d(Dt/r^2) = 15 (q_s - q)";
    return s;
}

const std::string& ldfSeriesWindow()
{
    static const std::string s = "linear (or nearly linear) equilibrium: the"
        " series sum is a moments (second-moment) matching of a LINEAR system"
        " (Ruthven p. 242-243); 'the approximation breaks down when the"
        " isotherm is highly nonlinear' (p. 241).  The slope K is taken at the"
        " FEED state; Knudsen and surface diffusion enter only through the"
        " declared macropore diffusivity";
    return s;
}

BedAnchor ldfSeriesVerify()
{
    //  Glueckauf's own coefficient: a single internal resistance, 1/k =
    //  r^2/(15 D), so Dc/rc^2 = 1e-3 1/s gives k = 15e-3 1/s.
    LdfSeriesInput in;
    in.DcOverRc2 = 1.0e-3; in.K = 100.0; in.Rp = 1.0e-3;
    return makeAnchor(ldfSeries(in).k, 15.0e-3, "printed number",
        "single internal resistance: k = 15 D/r^2 (Glueckauf 1955 eqn 3a,"
        " p. 1543; Ruthven 1984 p. 241) -- Dc/rc^2 = 1e-3 1/s gives 0.015 1/s");
}

// =========================================================================
//  Registries
// =========================================================================

std::map<std::string, BedDispersionCorrelation::Factory>&
BedDispersionCorrelation::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void BedDispersionCorrelation::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<BedDispersionCorrelation>
BedDispersionCorrelation::New(const std::string& name)
{
    registerBuiltins();
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::ostringstream os;
        os << "BedDispersionCorrelation: unknown model '" << name
           << "'.  Available:";
        for (const auto& kv : registry()) os << " " << kv.first;
        throw std::runtime_error(os.str());
    }
    return it->second();
}

std::vector<std::string> BedDispersionCorrelation::availableTypes()
{
    registerBuiltins();
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

void BedDispersionCorrelation::registerBuiltins()
{
    registerType("WakaoFunazkri",
        []{ return std::make_unique<WakaoFunazkriDispersion>(); });
    registerType("EdwardsRichardson",
        []{ return std::make_unique<EdwardsRichardsonDispersion>(); });
    registerType("ChungWen",
        []{ return std::make_unique<ChungWenDispersion>(); });
    registerType("Gunn",
        []{ return std::make_unique<GunnDispersion>(); });
}

std::map<std::string, BedFilmCorrelation::Factory>&
BedFilmCorrelation::registry()
{
    static std::map<std::string, Factory> r;
    return r;
}

void BedFilmCorrelation::registerType(const std::string& name, Factory f)
{
    registry()[name] = std::move(f);
}

std::unique_ptr<BedFilmCorrelation>
BedFilmCorrelation::New(const std::string& name)
{
    registerBuiltins();
    auto it = registry().find(name);
    if (it == registry().end())
    {
        std::ostringstream os;
        os << "BedFilmCorrelation: unknown model '" << name
           << "'.  Available:";
        for (const auto& kv : registry()) os << " " << kv.first;
        throw std::runtime_error(os.str());
    }
    return it->second();
}

std::vector<std::string> BedFilmCorrelation::availableTypes()
{
    registerBuiltins();
    std::vector<std::string> out;
    for (const auto& kv : registry()) out.push_back(kv.first);
    return out;
}

void BedFilmCorrelation::registerBuiltins()
{
    registerType("WakaoFunazkri",
        []{ return std::make_unique<WakaoFunazkriFilm>(); });
    registerType("WilsonGeankoplis",
        []{ return std::make_unique<WilsonGeankoplisFilm>(); });
}

} // namespace Choupo
