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
-------------------------------------------------------------------------------
Class
    Choupo::electrolyte::EdwardsPitzer

Description
    The activity model of **Edwards, Maurer, Newman & Prausnitz, AIChE J.
    24(6): 966-976 (1978)** -- a Pitzer (1973; Pitzer & Kim 1974) virial
    expansion TRUNCATED at the second virial coefficient, extended to
    MOLECULAR solutes as well as ions.

    Why it exists beside `davies` and `pitzerHMW`.  Davies is a charge-only
    dilute correlation: every singly-charged ion gets the same gamma and a
    neutral solute gets gamma = 1, so it cannot express salting-out at all.
    PitzerHMW is the Harvie-Moller-Weare parameterisation -- a DIFFERENT
    truncation with a different parameter set (beta2, C-phi, theta, psi),
    fitted to strong electrolytes.  Edwards' truncation keeps only beta(0)
    and beta(1), adds molecule-molecule and molecule-ion terms, and is the
    model his NH3/CO2/H2S/SO2 parameters were REGRESSED IN.  Using his
    parameters in another engine would be quoting his numbers under
    someone else's equation.

    THE EQUATIONS, verbatim from the paper (transcription in
    docs/design/sour-water-stripper-scope.md Appendix A; `w` = water,
    `i,j,k` = solute species, m in mol/kg WATER):

    (8)  ln g_i* = - A_phi z_i^2 [ sqrt(I)/(1 + 1.2 sqrt(I))
                                   + (2/1.2) ln(1 + 1.2 sqrt(I)) ]

                 + 2 SUM_j m_j { b0_ij + (b1_ij/(2I))
                                 [ 1 - (1 + 2 sqrt(I)) exp(-2 sqrt(I)) ] }

                 - (z_i^2/(4 I^2)) SUM_j SUM_k m_j m_k b1_jk
                                 { 1 - (1 + 2 sqrt(I) + 2I) exp(-2 sqrt(I)) }

    (9)  I = 1/2 SUM_j z_j^2 m_j

    (10) ln a_w = M_w { 2 A_phi I^(3/2)/(1 + 1.2 sqrt(I))
                        - SUM_i SUM_j m_i m_j [ b0_ij + b1_ij exp(-2 sqrt(I)) ] }
                  - M_w SUM_i m_i

    THREE RULES THE PAPER STATES AROUND EQ 8, each load-bearing and none of
    them visible in the formula itself:
      * if i OR j is a MOLECULAR species, keep b0_ij but set **b1_ij = 0**
        ("because experimental data are inadequate");
      * for ions i,j of LIKE charge, **b0_ij = b1_ij = 0** (Bronsted
        1922/1923 -- like charges do not approach);
      * m must be MOLAL for Eqs 8 and 9 as written.

    A_phi = 2.303 A_gamma/3, with A_gamma the Debye-Huckel parameter
    tabulated 0-100 C by Lewis et al. (1961); above that the paper gives
    A_phi = 1.4017e-6 sqrt(rho*) / (D* T)^(3/2).  Here it is obtained from
    the SAME SolventProperties::debyeHuckelFactor(T) every other Choupo
    electrolyte kernel uses, so two models in one case cannot disagree
    about the solvent -- with the 25 C anchor 2.303 * 0.5108 / 3.

    VERIFIED AGAINST TWO CLOSED FORMS the paper itself supplies, both to
    machine precision (2026-08-04, reproducible from the header of the
    witness case; the permanent gate arrives with it):

      * the LOW-DISSOCIATION LIMIT.  For one molecular solute with no ions,
        Eq 8 must collapse to (8a) ln g = 2 b0_aa m and Eq 10 to (10a).
        Measured over m = 0.01 to 5 mol/kg at 100 C: worst relative
        difference 1.4e-13.  This exercises the beta0 path and the water
        activity -- and, being at I = 0, exercises NEITHER the
        Debye-Huckel term NOR beta1.  Hence the second check.

      * the DEBYE-HUCKEL LIMITING LAW, which is not in the paper as an
        equation but is implied by it.  As I -> 0 the first bracket tends
        to 3 sqrt(I), so ln g -> -3 A_phi z^2 sqrt(I) = -2.303 A_gamma z^2
        sqrt(I), i.e. log10 g -> -A_gamma z^2 sqrt(I).  Measured relative
        difference falls as sqrt(I) -- 1.0e-4 at I = 1e-8, 7.7e-3 at
        I = 1e-4 -- which is the next term of the expansion behaving
        exactly as it should.  This is what checks the first term AND the
        A_phi = 2.303 A_gamma/3 conversion, neither of which the (8a)
        limit can see.

    Still unexercised by either: the beta1 terms (they need ions AND a
    curated beta1, which only the Table 7 anchor supplies) and the
    third-term double sum.  Said here rather than left for a reader to
    assume the two green checks covered everything.

    WHAT THIS CLASS DOES *NOT* DO.  It computes gammas and the water
    activity from a parameter set handed to it.  It does not read files,
    does not estimate a missing parameter, and does not know what a
    carbamate is.  Deriving b1 from b0 (Eq 24), a molecule-molecule cross
    term from the two like terms (Eq 21), or an ion-ion b from the two
    single-ion contributions (Eq 22, Bromley) is CURATION arithmetic and
    belongs where the parameters are assembled -- the tree never stores a
    derivative, and this class never invents one.
\*---------------------------------------------------------------------------*/

#pragma once

#include "AqueousActivity.H"

#include <map>
#include <string>
#include <utility>

namespace Choupo {
namespace electrolyte {

//  The assembled parameter set for one case: b0 and b1 per unordered species
//  PAIR, already resolved (Eqs 21/22/24 applied at curation time), plus each
//  species' charge so the model can apply the like-charge and molecular rules
//  without re-deriving anybody's identity.
struct EdwardsParameters
{
    //  Key is the pair, ordered lexicographically so (a,b) and (b,a) are one
    //  entry.  Absent pair => b0 = b1 = 0, which is the paper's own default
    //  for everything it does not tabulate.
    std::map<std::pair<std::string, std::string>, double> b0;
    std::map<std::pair<std::string, std::string>, double> b1;

    //  Provenance carried WITH the numbers, so a report can say which
    //  parameterisation produced a gamma without asking the case.
    std::string source;

    static std::pair<std::string, std::string> key(const std::string& a,
                                                   const std::string& b)
    { return (a < b) ? std::make_pair(a, b) : std::make_pair(b, a); }

    double beta0(const std::string& a, const std::string& b) const
    { auto it = b0.find(key(a, b)); return it == b0.end() ? 0.0 : it->second; }
    double beta1(const std::string& a, const std::string& b) const
    { auto it = b1.find(key(a, b)); return it == b1.end() ? 0.0 : it->second; }
};

class EdwardsPitzer : public AqueousActivity
{
public:
    explicit EdwardsPitzer(EdwardsParameters p) : par_(std::move(p)) {}

    const std::string& modelName() const override;
    const std::string& pHScale()   const override;

    ActivityResult evaluate(const IonState& st, double T) const override;

    void announceParameters(const IonState& st,
                            std::ostream& os) const override;

    //  The paper's own low-dissociation limits, exposed because they are the
    //  cheapest correct test of the general form: for a single molecular
    //  solute with negligible ionisation Eq 8 must collapse to (8a) and
    //  Eq 10 to (10a), both closed-form.
    //      (8a)  ln g_a* = 2 b0_aa m_a
    //      (10a) ln a_w  = [ -b0_aa m_a^2 - m_a ] M_w
    static double lnGammaDiluteLimit(double b0_aa, double m_a);
    static double lnAwDiluteLimit   (double b0_aa, double m_a);

private:
    EdwardsParameters par_;
};

} // namespace electrolyte
} // namespace Choupo
