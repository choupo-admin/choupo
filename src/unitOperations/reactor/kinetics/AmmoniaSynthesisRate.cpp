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

#include "core/Dimensions.H"
#include "core/Units.H"

#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace Choupo {

namespace {

//  1 thermochemical calorie = 4.184 J exactly: the factor the grammar's
//  `cal/mol` and `cal/(mol.K)` carry (core/Units.cpp).  Divided back out in
//  `fromDict`, so E and R are held in the calorie the paper wrote them in --
//  changing either to joules here would change the activation energy's
//  meaning silently, and the ratio E/R the law reads would not move a bit.
constexpr scalar J_per_cal = 4.184;

scalar evalEq39(const DysonSimonConstants::Column& r, scalar T, scalar eta)
{
    return r.b[0] + r.b[1]*T + r.b[2]*eta + r.b[3]*T*T
         + r.b[4]*eta*eta + r.b[5]*T*T*T + r.b[6]*eta*eta*eta;
}

std::string num(scalar v)
{
    std::ostringstream os;
    os << std::setprecision(12) << v;
    return os.str();
}

template <std::size_t N>
std::string numList(const scalar (&v)[N])
{
    std::string out = "(";
    for (std::size_t i = 0; i < N; ++i) out += " " + num(v[i]);
    return out + " )";
}

} // namespace

// ---------------------------------------------------------------------------
//  THE PUBLISHED SET -- a VERIFICATION ANCHOR, never a value a case is
//  evaluated with.  Dyson & Simon (1968): Eq 18/19 (k0, E, R), Eq 2 (Ka,
//  after Gillespie & Beattie 1930), Eqs 6-8 (fugacity coefficients), Table I
//  (Eq 39) and the reference mixture Eq 39's eta is measured on.  A case
//  declares its own copy in constant/reactions; `differencesFromPaper`
//  compares the two and the run announces every difference.
// ---------------------------------------------------------------------------
const DysonSimonConstants& DysonSimonConstants::paper()
{
    static const DysonSimonConstants k = []
    {
        DysonSimonConstants p;
        p.k0           = 1.7698e15;     // Eq 19 (Eq 18's 8.849e14, x 2)
        p.E_cal        = 40765.0;       // Eq 18, cal/mol
        p.R_cal        = 1.987;         // Eq 18, cal/(mol K)
        p.ratePmin_atm = 150.0;
        p.ratePmax_atm = 300.0;
        const scalar Ka[5]  = { -2.691122, -5.519265e-5, 1.848863e-7, 2001.6, 2.6899 };
        const scalar gH2[7] = { -3.8402, 0.541, -0.1263, -15.980, 300.0, -0.011901, -5.941 };
        const scalar gN2[5] = { 0.93431737, 0.3101804e-3, 0.295896e-3, -0.2707279e-6, 0.4775207e-6 };
        const scalar gNH3[5]= { 0.1438996, 0.2028538e-2, -0.4487672e-3, -0.1142945e-5, 0.2761216e-6 };
        for (int i = 0; i < 5; ++i) { p.Ka[i] = Ka[i]; p.gN2[i] = gN2[i]; p.gNH3[i] = gNH3[i]; }
        for (int i = 0; i < 7; ++i) p.gH2[i] = gH2[i];
        p.tableI = {
            { 150.0, { -17.539096, 0.07697849, 6.900548, -1.082790e-4,
                       -26.42469,  4.927648e-8, 38.93727 } },
            { 225.0, {  -8.2125534, 0.03774149, 6.190112, -5.354571e-5,
                       -20.86963,  2.379142e-8, 27.88403 } },
            { 300.0, {  -4.6757259, 0.02354872, 4.687353, -3.463308e-5,
                       -11.28031,  1.540881e-8, 10.46627 } } };
        p.refH2overN2 = 3.0;
        p.refInert    = 0.127;
        p.dpMin_mm    = 6.0;
        p.dpMax_mm    = 10.0;
        return p;
    }();
    return k;
}

DysonSimonConstants DysonSimonConstants::fromDict(const DictPtr& kin,
                                                  const std::string& who)
{
    const DysonSimonConstants& P = paper();
    auto refuse = [&](const std::string& path, const std::string& paperValue)
    {
        throw std::runtime_error(who + ": dysonSimon1968 needs `kinetics."
            + path + "` -- every number the law uses is DECLARED by the case"
            " (constant/reactions; kinetics are the case's, property axiom"
            " 3), and none has a default in code: a default would be a second"
            " home for a constant a reader cannot see.  The paper's value"
            " (Dyson & Simon 1968): " + paperValue
            + ".  The complete block is in tutorials/plant/"
              "ammoniaStaged04_kinetic/constant/reactions.");
    };
    auto sub = [&](const DictPtr& d, const std::string& path,
                   const std::string& key, const std::string& paperValue)
    {
        if (!d->found(key)) refuse(path + key + " { ... }", paperValue);
        return d->subDict(key);
    };
    auto scalarOf = [&](const DictPtr& d, const std::string& path,
                        const std::string& key, const Dimensions& dims,
                        const std::string& paperValue)
    {
        if (!d->found(key)) refuse(path + key, paperValue);
        return d->lookupScalar(key, dims);
    };
    auto listOf = [&](const DictPtr& d, const std::string& path,
                      const std::string& key, std::size_t n,
                      const std::string& paperValue)
    {
        if (!d->found(key)) refuse(path + key, paperValue);
        const auto v = d->lookupList(key);
        if (v.size() != n)
            throw std::runtime_error(who + ": dysonSimon1968 `kinetics." + path
                + key + "` carries " + std::to_string(v.size())
                + " numbers; its equation has exactly " + std::to_string(n)
                + ".  The paper's: " + paperValue + ".");
        return v;
    };

    DysonSimonConstants k;

    //  Eq 18/19.
    auto rc = sub(kin, "", "rateConstant",
        "rateConstant { k0 1.7698e15; E 40765 cal/mol; R 1.987 cal/(mol.K);"
        " fittedPressure { min 150 atm; max 300 atm; } }");
    k.k0    = scalarOf(rc, "rateConstant.", "k0", Dims::dimensionless,
                       num(P.k0) + " kmol NH3/(m3 bed h) atm^0.5 (Eq 19)");
    k.E_cal = scalarOf(rc, "rateConstant.", "E", Dims::molarEnergy,
                       "E 40765 cal/mol") / J_per_cal;
    k.R_cal = scalarOf(rc, "rateConstant.", "R", Dims::molarHeatCap,
                       "R 1.987 cal/(mol.K)") / J_per_cal;
    auto fp = sub(rc, "rateConstant.", "fittedPressure",
                  "fittedPressure { min 150 atm; max 300 atm; }");
    k.ratePmin_atm = scalarOf(fp, "rateConstant.fittedPressure.", "min",
                              Dims::pressure, "150 atm") / units::atm_to_Pa;
    k.ratePmax_atm = scalarOf(fp, "rateConstant.fittedPressure.", "max",
                              Dims::pressure, "300 atm") / units::atm_to_Pa;
    if (!(k.k0 > 0.0) || !(k.R_cal > 0.0) || !(k.ratePmax_atm > k.ratePmin_atm))
        throw std::runtime_error(who + ": dysonSimon1968 `rateConstant` needs"
            " k0 > 0, R > 0 and fittedPressure.max > .min.");

    //  Eq 2.
    {
        auto d = sub(kin, "", "equilibriumConstant",
                     "equilibriumConstant { coefficients " + numList(P.Ka) + "; }");
        const auto v = listOf(d, "equilibriumConstant.", "coefficients", 5, numList(P.Ka));
        for (int i = 0; i < 5; ++i) k.Ka[i] = v[i];
    }

    //  Eqs 6-8.
    {
        auto d = sub(kin, "", "fugacityCoefficients",
                     "fugacityCoefficients { H2 " + numList(P.gH2) + "; N2 "
                     + numList(P.gN2) + "; NH3 " + numList(P.gNH3) + "; }");
        const auto h = listOf(d, "fugacityCoefficients.", "H2", 7, numList(P.gH2));
        const auto n = listOf(d, "fugacityCoefficients.", "N2", 5, numList(P.gN2));
        const auto a = listOf(d, "fugacityCoefficients.", "NH3", 5, numList(P.gNH3));
        for (int i = 0; i < 7; ++i) k.gH2[i] = h[i];
        for (int i = 0; i < 5; ++i) { k.gN2[i] = n[i]; k.gNH3[i] = a[i]; }
        if (k.gH2[4] == 0.0)
            throw std::runtime_error(who + ": dysonSimon1968"
                " `fugacityCoefficients.H2` c4 is zero; Eq 6 divides P by it.");
    }

    //  Eq 39 + Table I.
    {
        auto t = sub(kin, "", "effectivenessFactorTable",
            "effectivenessFactorTable { referenceMixture { H2_over_N2 3;"
            " inertFraction 0.127; } particleDiameter { min 6 mm; max 10 mm; }"
            " columns ( { P 150 atm; b ( ... ); } { P 225 atm; ... }"
            " { P 300 atm; ... } ); }");
        auto rm = sub(t, "effectivenessFactorTable.", "referenceMixture",
                      "referenceMixture { H2_over_N2 3; inertFraction 0.127; }");
        k.refH2overN2 = scalarOf(rm, "effectivenessFactorTable.referenceMixture.",
                                 "H2_over_N2", Dims::dimensionless, "3");
        k.refInert    = scalarOf(rm, "effectivenessFactorTable.referenceMixture.",
                                 "inertFraction", Dims::dimensionless, "0.127");
        auto dp = sub(t, "effectivenessFactorTable.", "particleDiameter",
                      "particleDiameter { min 6 mm; max 10 mm; }");
        k.dpMin_mm = 1000.0 * scalarOf(dp, "effectivenessFactorTable.particleDiameter.",
                                       "min", Dims::length, "6 mm");
        k.dpMax_mm = 1000.0 * scalarOf(dp, "effectivenessFactorTable.particleDiameter.",
                                       "max", Dims::length, "10 mm");
        if (!t->hasDictList("columns"))
            refuse("effectivenessFactorTable.columns ( { P <p>; b ( ... ); } ... )",
                   "three columns, at 150, 225 and 300 atm (Table I)");
        for (const auto& c : t->lookupDictList("columns"))
        {
            Column col;
            col.P_atm = scalarOf(c, "effectivenessFactorTable.columns[].", "P",
                                 Dims::pressure, "150, 225, 300 atm") / units::atm_to_Pa;
            const auto b = listOf(c, "effectivenessFactorTable.columns[].", "b", 7,
                                  "Table I's seven constants b1..b7 at that pressure");
            for (int i = 0; i < 7; ++i) col.b[i] = b[i];
            if (!k.tableI.empty() && !(col.P_atm > k.tableI.back().P_atm))
                throw std::runtime_error(who + ": dysonSimon1968"
                    " `effectivenessFactorTable.columns` must be in ASCENDING"
                    " pressure -- the interpolation between columns reads them"
                    " in order.");
            k.tableI.push_back(col);
        }
        if (k.tableI.empty())
            refuse("effectivenessFactorTable.columns", "three columns (Table I)");
        if (!(k.refInert >= 0.0) || !(k.refInert < 1.0) || !(k.refH2overN2 > 0.0)
            || !(k.dpMax_mm > k.dpMin_mm) || !(k.dpMin_mm > 0.0))
            throw std::runtime_error(who + ": dysonSimon1968"
                " `effectivenessFactorTable` needs 0 <= inertFraction < 1,"
                " H2_over_N2 > 0 and 0 < particleDiameter.min < .max.");
    }
    return k;
}

std::vector<std::string> DysonSimonConstants::differencesFromPaper() const
{
    const DysonSimonConstants& P = paper();
    std::vector<std::string> out;
    auto cmp = [&](const std::string& name, scalar declared, scalar published)
    {
        if (std::abs(declared - published) > 1.0e-12 * std::abs(published))
            out.push_back(name + ": declared " + num(declared)
                          + ", the paper's " + num(published));
    };
    cmp("rateConstant.k0", k0, P.k0);
    cmp("rateConstant.E [cal/mol]", E_cal, P.E_cal);
    cmp("rateConstant.R [cal/(mol.K)]", R_cal, P.R_cal);
    cmp("rateConstant.fittedPressure.min [atm]", ratePmin_atm, P.ratePmin_atm);
    cmp("rateConstant.fittedPressure.max [atm]", ratePmax_atm, P.ratePmax_atm);
    for (int i = 0; i < 5; ++i)
        cmp("equilibriumConstant.coefficients[" + std::to_string(i) + "]", Ka[i], P.Ka[i]);
    for (int i = 0; i < 7; ++i)
        cmp("fugacityCoefficients.H2[" + std::to_string(i) + "]", gH2[i], P.gH2[i]);
    for (int i = 0; i < 5; ++i)
    {
        cmp("fugacityCoefficients.N2[" + std::to_string(i) + "]", gN2[i], P.gN2[i]);
        cmp("fugacityCoefficients.NH3[" + std::to_string(i) + "]", gNH3[i], P.gNH3[i]);
    }
    cmp("effectivenessFactorTable.referenceMixture.H2_over_N2", refH2overN2, P.refH2overN2);
    cmp("effectivenessFactorTable.referenceMixture.inertFraction", refInert, P.refInert);
    cmp("effectivenessFactorTable.particleDiameter.min [mm]", dpMin_mm, P.dpMin_mm);
    cmp("effectivenessFactorTable.particleDiameter.max [mm]", dpMax_mm, P.dpMax_mm);
    if (tableI.size() != P.tableI.size())
        out.push_back("effectivenessFactorTable.columns: declared "
            + std::to_string(tableI.size()) + " columns, the paper's Table I has "
            + std::to_string(P.tableI.size()));
    else
        for (std::size_t c = 0; c < tableI.size(); ++c)
        {
            const std::string tag = "effectivenessFactorTable.columns["
                                  + std::to_string(c) + "]";
            cmp(tag + ".P [atm]", tableI[c].P_atm, P.tableI[c].P_atm);
            for (int i = 0; i < 7; ++i)
                cmp(tag + ".b[" + std::to_string(i) + "]",
                    tableI[c].b[i], P.tableI[c].b[i]);
        }
    return out;
}

std::string DysonSimonConstants::lawText() const
{
    std::ostringstream os;
    os << "      Eq 19   V3 = k0 exp(-E / (R T)) [ Ka^2 a_N2 a_H2^1.5 / a_NH3 - a_NH3 / a_H2^1.5 ]"
          "   kmol NH3/(m3 bed h)\n"
       << "              k0 = " << num(k0) << " kmol NH3/(m3 bed h) atm^0.5"
          "   (Eq 18's, per N2: k0/2 = " << num(k0_Eq18()) << ")\n"
       << "              E  = " << num(E_cal) << " cal/mol,  R = " << num(R_cal)
       << " cal/(mol K)   ->  E/R = " << num(E_cal / R_cal) << " K\n"
       << "              fitted over " << num(ratePmin_atm) << " to "
       << num(ratePmax_atm) << " atm\n"
       << "      Eqs 3-5 a_i = x_i gamma_i P   (P in atm)\n"
       << "      Eq 2    log10 Ka = a log10 T + b T + c T^2 + d / T + e,"
          "  (a b c d e) = " << numList(Ka) << "   [Ka in atm^-1, T in K]\n"
       << "      Eq 6    ln gamma_H2 = exp(c0 T^0.125 + c1) P - exp(c2 T^0.5 + c3) P^2"
          " + c4 exp(c5 T + c6) (exp(-P / c4) - 1)\n"
       << "              (c0 .. c6) = " << numList(gH2) << "\n"
       << "      Eq 7    gamma_N2  = c0 + c1 T + c2 P + c3 T^2 + c4 P^2,"
          "  (c0 .. c4) = " << numList(gN2) << "\n"
       << "      Eq 8    gamma_NH3 = c0 + c1 T + c2 P + c3 T^2 + c4 P^2,"
          "  (c0 .. c4) = " << numList(gNH3) << "\n"
       << "      Eq 39   xi = b1 + b2 T + b3 eta + b4 T^2 + b5 eta^2 + b6 T^3"
          " + b7 eta^3   (Table I; eta = N2 conversion on H2/N2 = "
       << num(refH2overN2) << " with " << num(100.0 * refInert)
       << " % inerts; " << num(dpMin_mm) << " to " << num(dpMax_mm) << " mm particles)\n";
    for (const auto& c : tableI)
        os << "              P = " << num(c.P_atm) << " atm   (b1 .. b7) = "
           << numList(c.b) << "\n";
    return os.str();
}
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

std::string DysonSimon1968::validityWindow(const DysonSimonConstants& k)
{
    std::ostringstream os;
    os << num(k.ratePmin_atm) << " to " << num(k.ratePmax_atm) << " atm (the"
          " pressures the case declares Eq 19 was fitted over). The"
          " effectiveness factor xi (Eq 39) is TABULATED at exactly";
    for (std::size_t c = 0; c < k.tableI.size(); ++c)
        os << (c == 0 ? " " : (c + 1 == k.tableI.size() ? " and " : ", "))
           << num(k.tableI[c].P_atm);
    os << " atm and has no form in pressure at all, so it is refused outside"
          " that interval and LINEARLY INTERPOLATED between the tabulated"
          " columns (announced -- the interpolation is Choupo's choice, not"
          " the paper's). xi applies to " << num(k.dpMin_mm) << " to "
       << num(k.dpMax_mm) << " mm particles; BELOW " << num(k.dpMin_mm)
       << " mm the authors' own position is that no diffusion correction is"
          " needed, so xi = 1 there is THEIRS. xi was computed on a "
       << num(k.refH2overN2) << ":1 H2/N2 mixture with "
       << num(100.0 * k.refInert) << " % inerts; the authors report that"
          " other ratios change it and judged the effect on industrial"
          " converter design negligible -- their judgement about their"
          " application, not a Choupo claim. The rate itself (Eq 19) is"
          " ANNOUNCED rather than refused outside its fitted pressures,"
          " because it is a closed expression in T, P and composition that"
          " degrades smoothly, where Eq 39 is a cubic with tabulated columns"
          " and nothing between or beyond them.";
    return os.str();
}

scalar DysonSimon1968::equilibriumConstant(const DysonSimonConstants& k,
                                          scalar T_K)
{
    if (!(T_K > 0.0))
        throw std::runtime_error("DysonSimon1968: equilibrium constant asked"
            " at a non-positive temperature -- Eq 2 carries log10(T) and"
            " d/T and neither exists there.");
    //  Eq 2's FORM; its five numbers are the case's (k.Ka).
    const scalar log10Ka = k.Ka[0] * std::log10(T_K)
                         + k.Ka[1] * T_K
                         + k.Ka[2] * T_K * T_K
                         + k.Ka[3] / T_K
                         + k.Ka[4];
    return std::pow(10.0, log10Ka);
}

//  Eq 6's FORM (the exponents 0.125 and 0.5 are the form); its seven numbers
//  are the case's (k.gH2).
scalar DysonSimon1968::gammaH2(const DysonSimonConstants& k, scalar T_K,
                               scalar P_atm)
{
    const scalar* c = k.gH2;
    const scalar t1 = std::exp(c[0] * std::pow(T_K, 0.125) + c[1]) * P_atm;
    const scalar t2 = std::exp(c[2] * std::sqrt(T_K) + c[3]) * P_atm * P_atm;
    const scalar t3 = c[4] * std::exp(c[5] * T_K + c[6])
                    * (std::exp(-P_atm / c[4]) - 1.0);
    return std::exp(t1 - t2 + t3);
}

//  Eqs 7 and 8 share one FORM; their numbers are the case's.
scalar DysonSimon1968::gammaN2(const DysonSimonConstants& k, scalar T_K,
                               scalar P_atm)
{
    const scalar* c = k.gN2;
    return c[0]
         + c[1] * T_K
         + c[2] * P_atm
         + c[3] * T_K * T_K
         + c[4] * P_atm * P_atm;
}

scalar DysonSimon1968::gammaNH3(const DysonSimonConstants& k, scalar T_K,
                                scalar P_atm)
{
    const scalar* c = k.gNH3;
    return c[0]
         + c[1] * T_K
         + c[2] * P_atm
         + c[3] * T_K * T_K
         + c[4] * P_atm * P_atm;
}

scalar DysonSimon1968::effectivenessAtTabulatedP(const DysonSimonConstants& k,
                                                 scalar P_atm, scalar T_K,
                                                 scalar eta)
{
    for (const auto& r : k.tableI)
        if (std::abs(r.P_atm - P_atm) < 1.0e-9)
            return evalEq39(r, T_K, eta);

    std::ostringstream os;
    os << "DysonSimon1968: Equation 39 is TABULATED at";
    for (const auto& r : k.tableI) os << " " << num(r.P_atm);
    os << " atm and was asked at " << P_atm << " atm. Table I is columns of"
          " constants, not a function of pressure, so there is nothing to"
          " evaluate here. Use `evaluate()`, which interpolates BETWEEN the"
          " tabulated pressures and says that it did.";
    throw std::runtime_error(os.str());
}

AmmoniaRateContext DysonSimon1968::referenceMixture(const DysonSimonConstants& k,
                                                    scalar eta, scalar T_K,
                                                    scalar P_atm)
{
    const scalar refN2 = k.refN2(), refH2 = k.refH2(), refInert = k.refInert;
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

namespace {

//  Eqs 2-8, 18 and 19 -- everything BEFORE the particle question.  ONE body
//  serving both `evaluate()` (which then forms Eq 39/40) and
//  `evaluateIntrinsic()` (which does not), so the two can never price the
//  intrinsic rate two different ways.
void evaluateIntrinsicInto(const DysonSimonConstants& k,
                           const AmmoniaRateContext& c, AmmoniaRateResult& r)
{
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

    r.Ka        = DysonSimon1968::equilibriumConstant(k, c.T_K);
    r.gamma_N2  = DysonSimon1968::gammaN2 (k, c.T_K, c.P_atm);
    r.gamma_H2  = DysonSimon1968::gammaH2 (k, c.T_K, c.P_atm);
    r.gamma_NH3 = DysonSimon1968::gammaNH3(k, c.T_K, c.P_atm);

    //  Eqs 3-5: a_i = X_i f_i^0 with f_i^0 = gamma_i P (Lewis & Randall).
    r.a_N2  = c.x_N2  * r.gamma_N2  * c.P_atm;
    r.a_H2  = c.x_H2  * r.gamma_H2  * c.P_atm;
    r.a_NH3 = c.x_NH3 * r.gamma_NH3 * c.P_atm;

    const scalar a2_32 = std::pow(r.a_H2, 1.5);
    r.forwardTerm = r.Ka * r.Ka * r.a_N2 * a2_32 / r.a_NH3;
    r.reverseTerm = r.a_NH3 / a2_32;

    r.k = k.k0_Eq18() * std::exp(-k.E_cal / (k.R_cal * c.T_K));
    r.rateIntrinsic_kmolNH3_per_m3bed_h =
        k.k0 * std::exp(-k.E_cal / (k.R_cal * c.T_K))
        * (r.forwardTerm - r.reverseTerm);

    if (c.P_atm < k.ratePmin_atm || c.P_atm > k.ratePmax_atm)
    {
        std::ostringstream os;
        os << "[window] the rate expression (Eq 19) was evaluated at "
           << c.P_atm << " atm, OUTSIDE the " << num(k.ratePmin_atm) << "-"
           << num(k.ratePmax_atm) << " atm the correlation was"
              " fitted over -- extrapolated, still returned. The fugacity"
              " coefficients of Eqs 6-8 are the part that degrades first.";
        r.announcements.push_back(os.str());
    }

    //  ---- eta: the paper's abscissa, which is a CONVERSION ----
    //
    //  Eq 39's eta is the conversion of nitrogen measured from the reference
    //  mixture. Inverting the reference line for the ammonia this gas
    //  carries: X3 = 2 refN2 eta / (1 - 2 refN2 eta).
    const scalar refN2 = k.refN2(), refInert = k.refInert;
    r.eta_N2conversion = c.x_NH3 / (2.0 * refN2 * (1.0 + c.x_NH3));

    //  HOW FAR THIS GAS IS FROM THE LINE eta WAS DEFINED ON. Reported with
    //  its numbers rather than judged: the thresholds below are REPORTING
    //  thresholds this file chose, not validity limits the paper states.
    const scalar h2n2 = c.x_H2 / c.x_N2;
    const scalar inertRef = refInert / (1.0 - 2.0 * refN2 * r.eta_N2conversion);
    if (std::abs(h2n2 - k.refH2overN2) > 0.01 || std::abs(c.x_inert - inertRef) > 0.005)
    {
        std::ostringstream os;
        os << "[reference] xi was computed by the authors on a "
           << num(k.refH2overN2) << " : 1"
              " H2/N2 mixture carrying " << inertRef << " inerts at this"
              " conversion; this gas is " << h2n2 << " : 1 carrying "
           << c.x_inert << ". The authors report that other H2/N2 ratios"
              " change xi and judged the effect on industrial converter"
              " design negligible -- that is THEIR judgement about THEIR"
              " application, and it is repeated here as theirs.";
        r.announcements.push_back(os.str());
    }
}

} // namespace

AmmoniaRateResult DysonSimon1968::evaluateIntrinsic(const DysonSimonConstants& k,
                                                    const AmmoniaRateContext& c)
{
    AmmoniaRateResult r;
    evaluateIntrinsicInto(k, c, r);
    //  xi = 1 here means UNPRICED: Eq 39 was not formed.  Said in the route so
    //  a reader of the result cannot mistake it for the sub-6 mm branch of
    //  `evaluate()`, where the same number is the authors' own finding.
    r.xi = 1.0;
    r.xiAvailable = false;
    r.xiRoute = "Eq 39 NOT evaluated: the INTRINSIC rate (Eq 19) was asked"
        " for, so xi = 1 here is UNPRICED -- the diffusion correction the"
        " paper supplies (Eq 39 + Table I, declared in the case beside the"
        " rate)"
        " exists and was not applied. Declare a particle and ask for Eq 40"
        " to price it.";
    r.rate_kmolNH3_per_m3bed_h = r.rateIntrinsic_kmolNH3_per_m3bed_h;
    return r;
}

scalar DysonSimon1968::equilibriumTemperatureOf(const DysonSimonConstants& k,
                                                const AmmoniaRateContext& c,
                                                scalar Tlo, scalar Thi)
{
    if (!(Thi > Tlo) || !(Tlo > 0.0))
        throw std::runtime_error("DysonSimon1968::equilibriumTemperatureOf:"
            " the bracket must satisfy 0 < Tlo < Thi.");
    auto imbalance = [&](scalar T) -> scalar
    {
        AmmoniaRateContext cc = c;
        cc.T_K = T;
        const AmmoniaRateResult r = evaluateIntrinsic(k, cc);
        return r.forwardTerm - r.reverseTerm;       // > 0: below equilibrium T
    };
    scalar lo = Tlo, hi = Thi;
    scalar flo = imbalance(lo);
    const scalar fhi = imbalance(hi);
    if ((flo > 0.0) == (fhi > 0.0))
    {
        std::ostringstream os;
        os << "DysonSimon1968::equilibriumTemperatureOf: Eq 19's forward and"
              " reverse terms do not cross between " << Tlo << " K and "
           << Thi << " K for this composition (imbalance " << flo << " at the"
              " low end, " << fhi << " at the high end), so no equilibrium"
              " temperature lies in the bracket. Widen it, or accept that this"
              " gas is at equilibrium at no temperature the bracket covers.";
        throw std::runtime_error(os.str());
    }
    //  Bisection: Ka is monotone in T (Eq 2), and Eqs 6-8 move slowly, so the
    //  imbalance changes sign exactly once; 100 halvings of a 1000 K bracket
    //  is 1e-27 K, far below anything the result is quoted to.
    for (int i = 0; i < 100; ++i)
    {
        const scalar mid = 0.5 * (lo + hi);
        const scalar fm = imbalance(mid);
        if ((fm > 0.0) == (flo > 0.0)) { lo = mid; flo = fm; }
        else hi = mid;
    }
    return 0.5 * (lo + hi);
}

AmmoniaRateResult DysonSimon1968::evaluate(const DysonSimonConstants& k,
                                           const AmmoniaRateContext& c)
{
    AmmoniaRateResult r;
    evaluateIntrinsicInto(k, c, r);

    //  ---- xi: Eq 39 + Table I, and every branch of it is named ----
    if (!(c.particleDiameter_mm > 0.0))
        throw std::runtime_error("DysonSimon1968: no particle diameter was"
            " declared, so Equation 40 cannot be formed. There is NO default"
            " here on purpose -- which branch applies depends entirely on the"
            " size (below " + num(k.dpMin_mm) + " mm the authors need no"
            " correction at all, " + num(k.dpMin_mm) + "-" + num(k.dpMax_mm)
            + " mm is Table I's range, above it is nobody's). Declare"
            " `particleDiameter` in millimetres, or ask for the INTRINSIC"
            " rate (Eq 19) which needs no particle.");

    if (c.particleDiameter_mm < k.dpMin_mm)
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
    else if (c.particleDiameter_mm > k.dpMax_mm)
    {
        std::ostringstream os;
        os << "DysonSimon1968: the effectiveness factor of Eq 39 was fitted"
              " for " << num(k.dpMin_mm) << " to " << num(k.dpMax_mm)
           << " mm particles and this bed is packed with "
           << c.particleDiameter_mm << " mm. Table I is a cubic in T and eta"
              " with no particle size in it at all, so there is nothing to"
              " extrapolate: a larger particle is a different diffusion"
              " problem, not a further value of this correlation. Declare a"
              " particle inside the range, or ask for the INTRINSIC rate.";
        throw std::runtime_error(os.str());
    }
    else if (c.P_atm < k.tableI.front().P_atm || c.P_atm > k.tableI.back().P_atm)
    {
        std::ostringstream os;
        os << "DysonSimon1968: the effectiveness factor was asked at "
           << c.P_atm << " atm. Table I gives columns at";
        for (const auto& col : k.tableI) os << " " << num(col.P_atm);
        os << " atm and no form in pressure, so outside that interval"
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
        //  A single declared column is a table with no interval: it is only
        //  ever reached AT its own pressure (the window test above).
        const std::size_t N = k.tableI.size();
        std::size_t lo = 0;
        while (lo + 2 < N && c.P_atm > k.tableI[lo + 1].P_atm) ++lo;
        const DysonSimonConstants::Column& A = k.tableI[lo];
        const DysonSimonConstants::Column& B = k.tableI[N > 1 ? lo + 1 : lo];

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
    const DysonSimonConstants& K = DysonSimonConstants::paper();

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
        AmmoniaRateContext c = referenceMixture(K, 0.2, 700.0, 300.0);
        c.particleDiameter_mm = 8.0;
        const auto r = evaluate(K, c);
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
        auto rateAt = [&K](scalar eta) -> scalar
        {
            AmmoniaRateContext c = DysonSimon1968::referenceMixture(K, eta, 700.0, 300.0);
            c.particleDiameter_mm = 8.0;
            return DysonSimon1968::evaluate(K, c).rateIntrinsic_kmolNH3_per_m3bed_h;
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
        AmmoniaRateContext c = referenceMixture(K, etaEq, 700.0, 300.0);
        c.particleDiameter_mm = 8.0;
        const auto r = evaluate(K, c);
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
        a.tolerance = 1.0e-6 * std::abs(r.forwardTerm) * K.k0
                    * std::exp(-K.E_cal / (K.R_cal * 700.0));
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
        a.computed  = equilibriumConstant(K, 700.0);
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
        a.computed  = effectivenessAtTabulatedP(K, 300.0, 700.0, 0.2);
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
        const scalar x150 = effectivenessAtTabulatedP(K, 150.0, 700.0, 0.2);
        const scalar x225 = effectivenessAtTabulatedP(K, 225.0, 700.0, 0.2);
        const scalar x300 = effectivenessAtTabulatedP(K, 300.0, 700.0, 0.2);
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
