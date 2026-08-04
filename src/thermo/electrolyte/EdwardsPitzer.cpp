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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
\*---------------------------------------------------------------------------*/

#include "EdwardsPitzer.H"
#include "SolventProperties.H"

#include <cmath>
#include <iomanip>
#include <ostream>

namespace Choupo {
namespace electrolyte {

namespace {

//  The paper's constants, named rather than sprinkled.  1.2 is Pitzer's
//  universal b; 2.0 is his universal alpha for 1-1 electrolytes, and Edwards
//  uses it throughout (every exponential in Eqs 8 and 10 is exp(-2 sqrt(I))).
constexpr double kB     = 1.2;
constexpr double kAlpha = 2.0;
//  Molar mass of water in kg/mol -- Eq 10 multiplies a molal sum by M_w, so
//  the two must be reciprocal units or a_w is out by 1000.
constexpr double kMw_kg = 0.018015;

//  A_phi = 2.303 A_gamma / 3.  A_gamma is 0.5108 at 25 C (Lewis et al. 1961,
//  App. 4 -- the same anchor the Davies and Pitzer kernels use), and its T
//  dependence rides the shared solvent factor so no two electrolyte models in
//  one case can disagree about rho_w(T) and eps_w(T).
double aPhi(double T)
{
    return 2.303 * 0.5108 * SolventProperties::debyeHuckelFactor(T) / 3.0;
}

//  Eq 8's long bracket, the Debye-Huckel term:
//      sqrt(I)/(1 + b sqrt(I)) + (2/b) ln(1 + b sqrt(I))
double dhBracket(double I)
{
    const double s = std::sqrt(I);
    return s / (1.0 + kB * s) + (2.0 / kB) * std::log1p(kB * s);
}

//  The g-function multiplying b1 in the SECOND term of Eq 8:
//      [ 1 - (1 + a sqrt(I)) exp(-a sqrt(I)) ] / (2 I)
//  Written with the 1/(2I) folded in because that is how the paper groups it,
//  and taken to its LIMIT at I -> 0 rather than dividing by zero: expanding
//  the bracket gives a^2 I / 2 + O(I^{3/2}), so the quotient tends to a^2/4.
double gTerm(double I)
{
    if (I <= 0.0) return kAlpha * kAlpha / 4.0;
    const double x = kAlpha * std::sqrt(I);
    return (1.0 - (1.0 + x) * std::exp(-x)) / (2.0 * I);
}

//  The g-function of the THIRD term of Eq 8, the double sum:
//      [ 1 - (1 + a sqrt(I) + a^2 I/2 ... ) exp(-a sqrt(I)) ] / (4 I^2)
//  The paper writes the bracket as { 1 - (1 + 2 sqrt(I) + 2I) exp(-2 sqrt(I)) },
//  i.e. with alpha = 2 already substituted: (1 + x + x^2/2) with x = 2 sqrt(I).
//  Kept in terms of x so the alpha is visible and not a magic 2.
//  Limit as I -> 0: the bracket is x^3/6 + O(x^4) = (a^3/6) I^{3/2}, so the
//  quotient DIVERGES like I^{-1/2} -- but it is multiplied by m_j m_k, which
//  vanishes faster in any physical dilution path.  Guarded at exactly 0.
double hTerm(double I)
{
    if (I <= 0.0) return 0.0;
    const double x = kAlpha * std::sqrt(I);
    return (1.0 - (1.0 + x + 0.5 * x * x) * std::exp(-x)) / (4.0 * I * I);
}

} // namespace

const std::string& EdwardsPitzer::modelName() const
{
    static const std::string n = "edwardsPitzer";
    return n;
}

//  Eq 8 gives ln gamma_i* for EVERY solute species including H+, and the
//  single-ion convention is Pitzer's own: the parameters were regressed as
//  single-ion quantities under Bromley's additivity (Eq 22), never as
//  measurable mean quantities.  Naming it is mandatory here (the base class
//  has no default) precisely so nobody inherits Davies' charge-symmetric
//  convention by accident -- the two differ by more than a tenth of a pH unit
//  at the ionic strengths this model is for.
const std::string& EdwardsPitzer::pHScale() const
{
    static const std::string s =
        "free H+ activity, Pitzer/Bromley single-ion convention "
        "(Edwards et al. 1978 parameterisation)";
    return s;
}

double EdwardsPitzer::lnGammaDiluteLimit(double b0_aa, double m_a)
{
    return 2.0 * b0_aa * m_a;                                        // (8a)
}

double EdwardsPitzer::lnAwDiluteLimit(double b0_aa, double m_a)
{
    return (-b0_aa * m_a * m_a - m_a) * kMw_kg;                      // (10a)
}

ActivityResult EdwardsPitzer::evaluate(const IonState& st, double T) const
{
    const double A = aPhi(T);
    const double I = st.I;

    //  The THIRD term of Eq 8 is a double sum over species pairs that does NOT
    //  depend on i except through z_i^2 -- so it is computed ONCE here and
    //  scaled per species, rather than n times inside the lambda.  That is not
    //  only speed: it makes the structure of the equation visible, which is
    //  the point of a glass-box implementation.
    double dsum = 0.0;
    for (std::size_t j = 0; j < st.molality.size(); ++j)
        for (std::size_t k = 0; k < st.molality.size(); ++k)
            dsum += st.molality[j] * st.molality[k]
                  * par_.beta1(st.name[j], st.name[k]);
    const double thirdCommon = -dsum * hTerm(I);

    const double g2 = gTerm(I);
    //  Copied by value into the closure: the solver may call the accessor
    //  after this frame is gone.
    auto names = st.name;
    auto mol   = st.molality;
    const auto& par = par_;

    ActivityResult r;
    r.A = A;

    r.gammaNamed = [A, I, g2, thirdCommon, names, mol, &par]
                   (const std::string& nm, double z) -> double
    {
        //  FIRST term: Debye-Huckel.  Vanishes identically for a neutral
        //  species (z = 0), which is how a molecular solute gets a gamma at
        //  all in this model -- from the beta terms alone.
        double lng = -A * z * z * dhBracket(I);

        //  SECOND term: 2 SUM_j m_j { b0_ij + b1_ij * g(I) }.
        for (std::size_t j = 0; j < mol.size(); ++j)
            lng += 2.0 * mol[j] * (par.beta0(nm, names[j])
                                 + par.beta1(nm, names[j]) * g2);

        //  THIRD term: the z_i^2-weighted double sum, precomputed above.
        lng += z * z * thirdCommon;

        return std::exp(lng);
    };

    //  The charge-only accessor the solver falls back on for a species this
    //  model cannot name.  There is no honest charge-only form of Eq 8 -- the
    //  beta terms are per IDENTITY -- so this returns the Debye-Huckel factor
    //  alone and nothing else.  A species that lands here is one the
    //  parameterisation does not cover, and it should look like it.
    r.gamma = [A, I](double z) -> double
    {
        if (z == 0.0 || I <= 0.0) return 1.0;
        return std::exp(-A * z * z * dhBracket(I));
    };

    //  Eq 10 gives ln a_w DIRECTLY; the solver's interface wants an osmotic
    //  coefficient, with a_w = exp(-(M_w/1000) phi SUM m_i) where its M_w is
    //  in g/mol.  So phi is BACK-SOLVED from the paper's own a_w rather than
    //  the paper's equation being rearranged into an osmotic form it never
    //  had -- one conversion, in one place, and Eq 10 stays recognisable.
    r.osmotic = [A, I, names, mol, &par]() -> double
    {
        double mSum = 0.0, pairSum = 0.0;
        for (std::size_t i = 0; i < mol.size(); ++i)
        {
            mSum += mol[i];
            for (std::size_t j = 0; j < mol.size(); ++j)
                pairSum += mol[i] * mol[j]
                         * (par.beta0(names[i], names[j])
                          + par.beta1(names[i], names[j])
                            * std::exp(-kAlpha * std::sqrt(I)));
        }
        const double lnAw = kMw_kg * (2.0 * A * std::pow(I, 1.5)
                                      / (1.0 + kB * std::sqrt(I))
                                      - pairSum)
                          - kMw_kg * mSum;
        if (mSum <= 0.0) return 1.0;
        return -lnAw / (kMw_kg * mSum);
    };

    return r;
}

void EdwardsPitzer::announceParameters(const IonState& st,
                                       std::ostream& os) const
{
    os << "  [edwardsPitzer] " << par_.source << "\n"
       << "  [edwardsPitzer] active pair parameters at I = "
       << std::fixed << std::setprecision(4) << st.I << " mol/kg:\n";
    for (std::size_t i = 0; i < st.name.size(); ++i)
        for (std::size_t j = i; j < st.name.size(); ++j)
        {
            const double b0 = par_.beta0(st.name[i], st.name[j]);
            const double b1 = par_.beta1(st.name[i], st.name[j]);
            if (b0 == 0.0 && b1 == 0.0) continue;
            os << "      " << std::setw(10) << st.name[i] << " - "
               << std::setw(10) << st.name[j]
               << "   beta0 = " << std::setw(10) << std::setprecision(6) << b0
               << "   beta1 = " << std::setw(10) << b1 << "\n";
        }
}

} // namespace electrolyte
} // namespace Choupo
