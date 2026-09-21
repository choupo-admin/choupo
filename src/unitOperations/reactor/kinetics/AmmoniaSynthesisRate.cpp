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

#include "AmmoniaSynthesisRate.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  The gas constant Eq 18 is written with: calories, not joules.  Changing it
//  to 8.314 would change the activation energy's meaning silently.
constexpr scalar R_cal_per_mol_K = 1.987;

//  Eq 18's pre-exponential, and Eq 19's, which is twice it by the
//  stoichiometry (two ammonia per nitrogen).  Both literals are the paper's.
constexpr scalar k0_Eq18  = 8.849e14;
constexpr scalar k0_Eq19  = 1.7698e15;
constexpr scalar E_cal    = 40765.0;

//  The reference mixture Eq 39's eta is measured on: 3 : 1 hydrogen to
//  nitrogen with 12.7 % inerts, at eta = 0.
constexpr scalar refInert = 0.127;
constexpr scalar refN2    = (1.0 - refInert) / 4.0;          // 0.21825
constexpr scalar refH2    = 3.0 * refN2;                     // 0.65475

//  TABLE I -- the constants of Equation 39, AT THREE PRESSURES AND NOWHERE
//  ELSE.  There is no functional form in pressure in this paper: there are
//  three columns.  That is why `effectivenessAtTabulatedP` refuses any other
//  pressure and why `evaluate` interpolates only BETWEEN them, aloud.
struct TableIRow { scalar P_atm; scalar b[7]; };
const TableIRow tableI[3] =
{
    { 150.0, { -17.539096, 0.07697849, 6.900548, -1.082790e-4,
               -26.42469,  4.927648e-8, 38.93727 } },
    { 225.0, {  -8.2125534, 0.03774149, 6.190112, -5.354571e-5,
               -20.86963,  2.379142e-8, 27.88403 } },
    { 300.0, {  -4.6757259, 0.02354872, 4.687353, -3.463308e-5,
               -11.28031,  1.540881e-8, 10.46627 } }
};

scalar evalEq39(const TableIRow& r, scalar T, scalar eta)
{
    return r.b[0] + r.b[1]*T + r.b[2]*eta + r.b[3]*T*T
         + r.b[4]*eta*eta + r.b[5]*T*T*T + r.b[6]*eta*eta*eta;
}

} // namespace

const std::string& AmmoniaRateResult::freshCatalystCaveat()
{
    //  Paraphrased from the authors' own statement of what Eq 40 leaves out.
    //  It travels on the result because it has to reach wherever a bed size
    //  is eventually published, and a comment in a header does not travel.
    static const std::string s =
        "Equation 40 carries NO correction for the effect of particle size on"
        " catalyst reduction, on poisoning or on ageing -- the authors say so"
        " themselves. A bed sized from this rate is a FRESH, CLEAN, FULLY"
        " REDUCED bed, and a working converter is none of those for most of"
        " its life.";
    return s;
}

const std::string& DysonSimon1968::type()
{
    static const std::string s = "dysonSimon1968";
    return s;
}

const std::string& DysonSimon1968::citation()
{
    static const std::string s =
        "Dyson, D.C. & Simon, J.M., Ind. Eng. Chem. Fundam. 7(4) (1968)"
        " 605-610 -- Eqs 2 (equilibrium, after Gillespie & Beattie 1930),"
        " 6-8 (fugacity coefficients, after Cooper 1967 / Shaw & Wones 1964 /"
        " Newton 1935), 18-19 (rate, fitted to the data of Nielsen, Kjaer &"
        " Hansen, J. Catalysis 3 (1964) 68), 39 + Table I (effectiveness"
        " factor, diffusion after Nielsen 1956) and 40.";
    return s;
}

const std::string& DysonSimon1968::validityWindow()
{
    static const std::string s =
        "150 to 300 atm. The effectiveness factor xi (Eq 39) is TABULATED at"
        " exactly 150, 225 and 300 atm and has no form in pressure at all, so"
        " it is refused outside that interval and LINEARLY INTERPOLATED"
        " between the tabulated columns (announced -- the interpolation is"
        " Choupo's choice, not the paper's). xi applies to 6 to 10 mm"
        " particles; BELOW 6 mm the authors' own position is that no"
        " diffusion correction is needed, so xi = 1 there is THEIRS. xi was"
        " computed on a 3:1 H2/N2 mixture with 12.7 % inerts; the authors"
        " report that other ratios change it and judged the effect on"
        " industrial converter design negligible -- their judgement about"
        " their application, not a Choupo claim. The rate itself (Eq 19) is"
        " ANNOUNCED rather than refused outside 150-300 atm, because it is a"
        " closed expression in T, P and composition that degrades smoothly,"
        " where Eq 39 is a cubic with three tabulated columns and nothing"
        " between or beyond them.";
    return s;
}

scalar DysonSimon1968::equilibriumConstant(scalar T_K)
{
    if (!(T_K > 0.0))
        throw std::runtime_error("DysonSimon1968: equilibrium constant asked"
            " at a non-positive temperature -- Eq 2 carries log10(T) and"
            " 2001.6/T and neither exists there.");
    const scalar log10Ka = -2.691122 * std::log10(T_K)
                         -  5.519265e-5 * T_K
                         +  1.848863e-7 * T_K * T_K
                         +  2001.6 / T_K
                         +  2.6899;
    return std::pow(10.0, log10Ka);
}

scalar DysonSimon1968::gammaH2(scalar T_K, scalar P_atm)
{
    const scalar t1 = std::exp(-3.8402 * std::pow(T_K, 0.125) + 0.541) * P_atm;
    const scalar t2 = std::exp(-0.1263 * std::sqrt(T_K) - 15.980) * P_atm * P_atm;
    const scalar t3 = 300.0 * std::exp(-0.011901 * T_K - 5.941)
                    * (std::exp(-P_atm / 300.0) - 1.0);
    return std::exp(t1 - t2 + t3);
}

scalar DysonSimon1968::gammaN2(scalar T_K, scalar P_atm)
{
    return 0.93431737
         + 0.3101804e-3 * T_K
         + 0.295896e-3  * P_atm
         - 0.2707279e-6 * T_K * T_K
         + 0.4775207e-6 * P_atm * P_atm;
}

scalar DysonSimon1968::gammaNH3(scalar T_K, scalar P_atm)
{
    return 0.1438996
         + 0.2028538e-2 * T_K
         - 0.4487672e-3 * P_atm
         - 0.1142945e-5 * T_K * T_K
         + 0.2761216e-6 * P_atm * P_atm;
}

scalar DysonSimon1968::effectivenessAtTabulatedP(scalar P_atm, scalar T_K,
                                                 scalar eta)
{
    for (const auto& r : tableI)
        if (std::abs(r.P_atm - P_atm) < 1.0e-9)
            return evalEq39(r, T_K, eta);

    std::ostringstream os;
    os << "DysonSimon1968: Equation 39 is TABULATED at 150, 225 and 300 atm"
          " and was asked at " << P_atm << " atm. Table I is three columns of"
          " constants, not a function of pressure, so there is nothing to"
          " evaluate here. Use `evaluate()`, which interpolates BETWEEN the"
          " tabulated pressures and says that it did.";
    throw std::runtime_error(os.str());
}

AmmoniaRateContext DysonSimon1968::referenceMixture(scalar eta, scalar T_K,
                                                    scalar P_atm)
{
    if (!(eta > 0.0) || eta >= 1.0)
        throw std::runtime_error("DysonSimon1968: the reference mixture is"
            " asked at a nitrogen conversion outside (0, 1). At eta = 0 there"
            " is no ammonia, and Eq 19 carries X_NH3 in a denominator -- the"
            " expression is not defined there, which is a property of the"
            " rate law and not a limitation of this code.");

    const scalar n1 = refN2 * (1.0 - eta);
    const scalar n2 = refH2 * (1.0 - eta);
    const scalar n3 = 2.0 * refN2 * eta;
    const scalar n4 = refInert;
    const scalar tot = n1 + n2 + n3 + n4;

    AmmoniaRateContext c;
    c.T_K = T_K;  c.P_atm = P_atm;
    c.x_N2 = n1 / tot;  c.x_H2 = n2 / tot;
    c.x_NH3 = n3 / tot; c.x_inert = n4 / tot;
    return c;
}

scalar DysonSimon1968::toLbmolPerFt3h(scalar kmol_per_m3_h)
{
    //  1 kg-mol = 2.2046226218 lb-mol; 1 m^3 = 35.3146667215 ft^3.
    return kmol_per_m3_h * (2.2046226218 / 35.3146667215);
}

AmmoniaRateResult DysonSimon1968::evaluate(const AmmoniaRateContext& c)
{
    AmmoniaRateResult r;

    if (!(c.T_K > 0.0) || !(c.P_atm > 0.0))
        throw std::runtime_error("DysonSimon1968: temperature and pressure"
            " must both be positive; the pressure is in ATMOSPHERES here,"
            " which is the unit Eqs 6-8 were written in.");
    if (!(c.x_NH3 > 0.0))
        throw std::runtime_error("DysonSimon1968: the gas carries no ammonia."
            " Equation 19 divides by X_NH3, so the rate is unbounded at zero"
            " ammonia. That is the rate law's own property -- a Temkin-type"
            " expression has no finite rate on ammonia-free gas -- and not"
            " something this code may paper over with a floor.");
    if (!(c.x_N2 > 0.0) || !(c.x_H2 > 0.0))
        throw std::runtime_error("DysonSimon1968: the gas carries no nitrogen"
            " or no hydrogen; there is no synthesis rate to report.");

    const scalar xsum = c.x_N2 + c.x_H2 + c.x_NH3 + c.x_inert;
    if (std::abs(xsum - 1.0) > 1.0e-6)
    {
        std::ostringstream os;
        os << "DysonSimon1968: the four mole fractions sum to " << xsum
           << ", not 1. They are NOT normalised here: a composition that does"
              " not close is a fact about the caller's gas, and renormalising"
              " it would hide which of the four is wrong.";
        throw std::runtime_error(os.str());
    }

    r.Ka        = equilibriumConstant(c.T_K);
    r.gamma_N2  = gammaN2 (c.T_K, c.P_atm);
    r.gamma_H2  = gammaH2 (c.T_K, c.P_atm);
    r.gamma_NH3 = gammaNH3(c.T_K, c.P_atm);

    //  Eqs 3-5: a_i = X_i f_i^0 with f_i^0 = gamma_i P (Lewis & Randall).
    r.a_N2  = c.x_N2  * r.gamma_N2  * c.P_atm;
    r.a_H2  = c.x_H2  * r.gamma_H2  * c.P_atm;
    r.a_NH3 = c.x_NH3 * r.gamma_NH3 * c.P_atm;

    const scalar a2_32 = std::pow(r.a_H2, 1.5);
    r.forwardTerm = r.Ka * r.Ka * r.a_N2 * a2_32 / r.a_NH3;
    r.reverseTerm = r.a_NH3 / a2_32;

    r.k = k0_Eq18 * std::exp(-E_cal / (R_cal_per_mol_K * c.T_K));
    r.rateIntrinsic_kmolNH3_per_m3bed_h =
        k0_Eq19 * std::exp(-E_cal / (R_cal_per_mol_K * c.T_K))
        * (r.forwardTerm - r.reverseTerm);

    if (c.P_atm < 150.0 || c.P_atm > 300.0)
    {
        std::ostringstream os;
        os << "[window] the rate expression (Eq 19) was evaluated at "
           << c.P_atm << " atm, OUTSIDE the 150-300 atm the correlation was"
              " fitted over -- extrapolated, still returned. The fugacity"
              " coefficients of Eqs 6-8 are the part that degrades first.";
        r.announcements.push_back(os.str());
    }

    //  ---- eta: the paper's abscissa, which is a CONVERSION ----
    //
    //  Eq 39's eta is the conversion of nitrogen measured from the reference
    //  mixture. Inverting the reference line for the ammonia this gas
    //  carries: X3 = 2 refN2 eta / (1 - 2 refN2 eta).
    r.eta_N2conversion = c.x_NH3 / (2.0 * refN2 * (1.0 + c.x_NH3));

    //  HOW FAR THIS GAS IS FROM THE LINE eta WAS DEFINED ON. Reported with
    //  its numbers rather than judged: the thresholds below are REPORTING
    //  thresholds this file chose, not validity limits the paper states.
    const scalar h2n2 = c.x_H2 / c.x_N2;
    const scalar inertRef = refInert / (1.0 - 2.0 * refN2 * r.eta_N2conversion);
    if (std::abs(h2n2 - 3.0) > 0.01 || std::abs(c.x_inert - inertRef) > 0.005)
    {
        std::ostringstream os;
        os << "[reference] xi was computed by the authors on a 3.00 : 1"
              " H2/N2 mixture carrying " << inertRef << " inerts at this"
              " conversion; this gas is " << h2n2 << " : 1 carrying "
           << c.x_inert << ". The authors report that other H2/N2 ratios"
              " change xi and judged the effect on industrial converter"
              " design negligible -- that is THEIR judgement about THEIR"
              " application, and it is repeated here as theirs.";
        r.announcements.push_back(os.str());
    }

    //  ---- xi: Eq 39 + Table I, and every branch of it is named ----
    if (!(c.particleDiameter_mm > 0.0))
        throw std::runtime_error("DysonSimon1968: no particle diameter was"
            " declared, so Equation 40 cannot be formed. There is NO default"
            " here on purpose -- which branch applies depends entirely on the"
            " size (below 6 mm the authors need no correction at all, 6-10 mm"
            " is Table I's range, above 10 mm is nobody's). Declare"
            " `particleDiameter` in millimetres, or ask for the INTRINSIC"
            " rate (Eq 19) which needs no particle.");

    if (c.particleDiameter_mm < 6.0)
    {
        r.xi = 1.0;
        r.xiAvailable = true;
        r.xiRoute = "xi = 1 exactly, and it is THE AUTHORS' position and not"
            " an assumption of ours: below 6 mm they state that no diffusion"
            " correction is needed. Note that this is a DIFFERENT statement"
            " from the one the four reactors in src/unitOperations/reactor/"
            " announce when they take the effectiveness factor as 1 -- those"
            " say the correction is UNPRICED, this says the authors priced it"
            " and found it unity.";
        //  ANNOUNCED, not merely stored.  The route a value came by has to
        //  reach the reader's screen or it is a comment in a struct: the
        //  2026-08-04 banner trap, where a sentence describing one model was
        //  printed for another and nobody could see it.
        r.announcements.push_back("[particle] " + r.xiRoute);
    }
    else if (c.particleDiameter_mm > 10.0)
    {
        std::ostringstream os;
        os << "DysonSimon1968: the effectiveness factor of Eq 39 was fitted"
              " for 6 to 10 mm particles and this bed is packed with "
           << c.particleDiameter_mm << " mm. Table I is a cubic in T and eta"
              " with no particle size in it at all, so there is nothing to"
              " extrapolate: a larger particle is a different diffusion"
              " problem, not a further value of this correlation. Declare a"
              " particle inside the range, or ask for the INTRINSIC rate.";
        throw std::runtime_error(os.str());
    }
    else if (c.P_atm < 150.0 || c.P_atm > 300.0)
    {
        std::ostringstream os;
        os << "DysonSimon1968: the effectiveness factor was asked at "
           << c.P_atm << " atm. Table I gives three columns -- 150, 225 and"
              " 300 atm -- and no form in pressure, so outside that interval"
              " there is no correlation to evaluate and this REFUSES rather"
              " than extrapolating a cubic through three points. The rate"
              " expression itself (Eq 19) only ANNOUNCES out there, because"
              " it is a closed expression and this is a table.";
        throw std::runtime_error(os.str());
    }
    else
    {
        //  Inside 150-300 atm with a 6-10 mm particle: either exactly on a
        //  tabulated column, or linearly interpolated between the two that
        //  bracket it -- and the interpolation is ANNOUNCED with both
        //  endpoints, because it is Choupo's choice and not the paper's.
        std::size_t lo = 0;
        while (lo + 2 < 3 && c.P_atm > tableI[lo + 1].P_atm) ++lo;
        const TableIRow& A = tableI[lo];
        const TableIRow& B = tableI[lo + 1];

        const scalar xiA = evalEq39(A, c.T_K, r.eta_N2conversion);
        const scalar xiB = evalEq39(B, c.T_K, r.eta_N2conversion);

        if (std::abs(c.P_atm - A.P_atm) < 1.0e-9)
        {
            r.xi = xiA;
            r.xiRoute = "Eq 39 with Table I's own column at this pressure --"
                        " no interpolation.";
        }
        else if (std::abs(c.P_atm - B.P_atm) < 1.0e-9)
        {
            r.xi = xiB;
            r.xiRoute = "Eq 39 with Table I's own column at this pressure --"
                        " no interpolation.";
        }
        else
        {
            const scalar w = (c.P_atm - A.P_atm) / (B.P_atm - A.P_atm);
            r.xi = xiA + w * (xiB - xiA);
            std::ostringstream os;
            os << "Eq 39 LINEARLY INTERPOLATED in pressure between Table I's"
                  " " << A.P_atm << " atm column (xi = " << xiA << ") and its "
               << B.P_atm << " atm column (xi = " << xiB << "). Table I has"
                  " no form in pressure, so this interpolation is CHOUPO'S"
                  " CHOICE and not the paper's -- it is linear because three"
                  " points do not justify anything more.";
            r.xiRoute = os.str();
            r.announcements.push_back("[interpolated] " + r.xiRoute);
        }
        r.xiAvailable = true;
    }

    //  AN EFFECTIVENESS FACTOR OUTSIDE (0, 1] IS NOT A CORRECTION, IT IS THE
    //  POLYNOMIAL LEAVING THE REGION IT WAS FITTED IN. It is ANNOUNCED and
    //  returned UNCLAMPED: a silent clamp would hide exactly the fact that
    //  the caller has walked off the table.
    if (r.xi <= 0.0 || r.xi > 1.0)
    {
        std::ostringstream os;
        os << "[unphysical] Eq 39 returned xi = " << r.xi << " at T = "
           << c.T_K << " K and eta = " << r.eta_N2conversion << ". An"
              " effectiveness factor must lie in (0, 1]; a cubic does not"
              " know that. The value is returned UNCLAMPED because clamping"
              " it would hide that this (T, eta) is outside the region Table"
              " I was fitted over -- a region the paper does not state, which"
              " is itself worth knowing.";
        r.announcements.push_back(os.str());
    }

    r.rate_kmolNH3_per_m3bed_h = r.rateIntrinsic_kmolNH3_per_m3bed_h * r.xi;
    return r;
}

std::vector<DysonSimon1968::Anchor> DysonSimon1968::verify()
{
    std::vector<Anchor> out;

    // ---------------------------------------------------------------------
    //  A1 -- THEORY. The rate expression and the equilibrium constant are
    //  the SAME equilibrium. Dividing Eq 19's two terms gives
    //      forward / reverse = Ka^2 a1 a2^3 / a3^2 = (Ka / Q)^2
    //  where Q = a3 / (a1^0.5 a2^1.5) is the reaction quotient in activities.
    //  It is an identity at EVERY composition, so it holds with no root find
    //  and no fitted number -- and its immediate corollary is the thing a
    //  student needs: the rate is exactly zero when Q = Ka, and its sign is
    //  the direction the reaction runs.
    // ---------------------------------------------------------------------
    {
        AmmoniaRateContext c = referenceMixture(0.2, 700.0, 300.0);
        c.particleDiameter_mm = 8.0;
        const auto r = evaluate(c);
        const scalar Q = r.a_NH3 / (std::sqrt(r.a_N2) * std::pow(r.a_H2, 1.5));
        const scalar lhs = r.forwardTerm / r.reverseTerm;
        const scalar rhs = (r.Ka / Q) * (r.Ka / Q);
        Anchor a;
        a.name = "forward/reverse == (Ka/Q)^2";
        a.kind = "theory";
        a.statement = "Eq 19's two terms and Eq 2's equilibrium constant"
            " describe ONE equilibrium: their ratio is (Ka/Q)^2 identically,"
            " so the rate vanishes exactly at Q = Ka and changes sign across"
            " it. An identity, true at every composition -- not a number"
            " anybody measured, and not one a mistranscribed coefficient"
            " could reproduce by accident.";
        a.computed  = lhs;
        a.expected  = rhs;
        a.tolerance = 1.0e-10 * std::abs(rhs);
        a.pass = std::abs(a.computed - a.expected) <= a.tolerance;
        out.push_back(a);
    }

    // ---------------------------------------------------------------------
    //  A2 -- THEORY. The intrinsic rate is exactly zero at the equilibrium
    //  composition. Found by bisection on the reference line, so the residual
    //  carries the root find's own error and the tolerance says so.
    // ---------------------------------------------------------------------
    {
        auto rateAt = [](scalar eta) -> scalar
        {
            AmmoniaRateContext c = DysonSimon1968::referenceMixture(eta, 700.0, 300.0);
            c.particleDiameter_mm = 8.0;
            return DysonSimon1968::evaluate(c).rateIntrinsic_kmolNH3_per_m3bed_h;
        };
        scalar lo = 1.0e-6, hi = 0.99;
        scalar flo = rateAt(lo);
        for (int i = 0; i < 200; ++i)
        {
            const scalar mid = 0.5 * (lo + hi);
            const scalar fm = rateAt(mid);
            if ((fm > 0.0) == (flo > 0.0)) { lo = mid; flo = fm; }
            else hi = mid;
        }
        const scalar etaEq = 0.5 * (lo + hi);
        AmmoniaRateContext c = referenceMixture(etaEq, 700.0, 300.0);
        c.particleDiameter_mm = 8.0;
        const auto r = evaluate(c);
        Anchor a;
        a.name = "V3 == 0 at the Gillespie-Beattie equilibrium";
        a.kind = "theory";
        a.statement = "At the composition where Eq 2's Ka is satisfied, Eq"
            " 19's rate is zero. The equilibrium conversion this locates on"
            " the reference mixture at 700 K and 300 atm is a CONSEQUENCE of"
            " the two equations agreeing, not a datum: nothing here was"
            " measured.";
        a.computed  = r.rateIntrinsic_kmolNH3_per_m3bed_h;
        a.expected  = 0.0;
        a.tolerance = 1.0e-6 * std::abs(r.forwardTerm) * k0_Eq19
                    * std::exp(-E_cal / (R_cal_per_mol_K * 700.0));
        a.pass = std::abs(a.computed - a.expected) <= a.tolerance;
        out.push_back(a);
    }

    // ---------------------------------------------------------------------
    //  A3 -- ARITHMETIC. Eq 2 at a stated temperature against a literal.
    //  This proves a TRANSCRIPTION and nothing else, which is exactly what
    //  the 2026-09-05 transport rule requires such an anchor to say.
    // ---------------------------------------------------------------------
    {
        Anchor a;
        a.name = "Ka(700 K) from Eq 2";
        a.kind = "arithmetic";
        a.statement = "Equation 2 evaluated at 700 K against the literal it"
            " produces. It proves the five coefficients were typed"
            " correctly. It proves NOTHING about ammonia: a wrong equation"
            " typed consistently would pass it.";
        a.computed  = equilibriumConstant(700.0);
        a.expected  = 8.8060688324288414e-3;
        a.tolerance = 1.0e-12;
        a.pass = std::abs(a.computed - a.expected) <= a.tolerance;
        out.push_back(a);
    }

    // ---------------------------------------------------------------------
    //  A4 -- ARITHMETIC. Eq 39 on Table I's 300 atm column.
    // ---------------------------------------------------------------------
    {
        Anchor a;
        a.name = "xi(300 atm, 700 K, eta = 0.2) from Eq 39";
        a.kind = "arithmetic";
        a.statement = "Equation 39 on Table I's 300 atm column against the"
            " literal it produces -- a transcription check on seven"
            " constants, and no more than that.";
        a.computed  = effectivenessAtTabulatedP(300.0, 700.0, 0.2);
        a.expected  = 0.69337909;
        a.tolerance = 1.0e-8;
        a.pass = std::abs(a.computed - a.expected) <= a.tolerance;
        out.push_back(a);
    }

    // ---------------------------------------------------------------------
    //  A5 -- THEORY, and the only anchor that exercises all 21 constants at
    //  once. Pore diffusion gets WORSE as the intrinsic rate rises, so at a
    //  fixed temperature and conversion the effectiveness factor must fall
    //  with pressure. Table I's three columns are independent fits; nothing
    //  forces them to line up except the physics they were fitted to.
    //  The anchor is the ORDERING, so `computed` is the smallest gap between
    //  consecutive columns and `expected` is that it be positive.
    // ---------------------------------------------------------------------
    {
        const scalar x150 = effectivenessAtTabulatedP(150.0, 700.0, 0.2);
        const scalar x225 = effectivenessAtTabulatedP(225.0, 700.0, 0.2);
        const scalar x300 = effectivenessAtTabulatedP(300.0, 700.0, 0.2);
        const scalar gap = std::min(x150 - x225, x225 - x300);
        Anchor a;
        a.name = "xi falls monotonically with pressure";
        a.kind = "theory";
        a.statement = "xi(150) > xi(225) > xi(300) at 700 K and eta = 0.2 --"
            " the ordering pore-diffusion theory requires, since a faster"
            " intrinsic rate at higher pressure makes the particle more"
            " strongly diffusion-limited. It is the only check here that"
            " reads all 21 of Table I's constants together, and it is a"
            " QUALITATIVE expectation rather than an identity: it can pass"
            " with a coefficient wrong in the last digits.";
        a.computed  = gap;
        a.expected  = 1.0;      // the sign test below is what decides
        a.tolerance = 0.0;
        a.pass = (gap > 0.0);
        out.push_back(a);
    }

    return out;
}

} // namespace Choupo
