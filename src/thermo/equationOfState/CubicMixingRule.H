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
Class
    Choupo::CubicMixingRule

Description
    HOW A CUBIC EQUATION OF STATE MIXES ITS TWO PARAMETERS (DEV.md 4c C408
    (b); design record docs/design/c408-eos-ge-mixing-rules.md).  One object,
    owned by CubicEoS, with the explicit factory every base class has.  It is
    NOT a new equation of state: the cubic, its root picker, its pseudo-root
    and its announcements are CubicEoS's and are untouched.

    WHAT A RULE OWES THE CUBIC.  With beta = a/(b R T) (Michelsen's alpha),
    Z the root, B = bP/RT, A = aP/(RT)^2 and I = ln[(Z + sig B)/(Z + eps B)]
    /(sig - eps), the fugacity coefficient of any two-parameter cubic under
    ANY mixing rule is

        ln phi_i = (bbar_i/b)(Z - 1) - ln(Z - B) - betabar_i I            (1)

    where bbar_i = d(n b)/dn_i and betabar_i = d(n beta)/dn_i (the structure
    of Poling, Prausnitz & O'Connell 5th ed. Eq. 8-12.37; Dahl & Michelsen
    1990 Eq. A2 for SRK).  So a rule returns b, a (= beta b R T), da/dT,
    bbar_i and, in the one number X_i = betabar_i/beta = abar_i/a - bbar_i/b,
    the composition derivative of the attraction (the engine's own form
    ln phi_i = (bbar_i/b)(Z-1) - ln(Z-B) - (A/(B(sig-eps))) X_i ln[...]).
    The departures H^R and S^R then need only a and da/dT, which is why they
    are the cubic's, unchanged (CubicEoS.cpp): for the excess-Gibbs rules
        da/dT = R b (beta + T dbeta/dT)
    and T da/dT - a = R T^2 b dbeta/dT, so the existing expression is the
    departure of Dahl & Michelsen's surface, with the slope of G^E inside.

    THE RULES (names are the grammar's words; each constant sits beside the
    page it was read at, in the table in CubicMixingRule.cpp):

      vanDerWaalsOneFluid   a = sum sum y_i y_j (1 - kij) sqrt(a_i a_j),
                            b = sum y_i b_i.  Today's arithmetic, MOVED here
                            intact -- every existing case is byte-identical.
      MHV1, MHV2            a modified Huron-Vidal rule on SRK, the cubic
                            matched to a G^E model at ZERO pressure:
          q1 (beta - sum y_i beta_i)                                =
              G^E/RT + sum y_i ln(b/b_i)               (MHV1: Michelsen 1990
                                                        Eq. 12, p. 215)
          q1 (beta - sum y_i beta_i) + q2 (beta^2 - sum y_i beta_i^2) =
              G^E/RT + sum y_i ln(b/b_i)               (MHV2: Dahl &
                                                        Michelsen 1990 Eq. 13,
                                                        p. 1831)
          b = sum y_i b_i
        with q1 = -0.593 (MHV1) and q1 = -0.478, q2 = -0.0047 (MHV2), the SRK
        values of Poling Table 5-1 (p. 5.17); the primaries print the same.
        Composition derivatives (Dahl & Michelsen Eq. A3, which holds for
        MHV1 at q2 = 0):
          (q1 + 2 q2 beta) betabar_i =
              q1 beta_i + q2 (beta^2 + beta_i^2)
              + ln gamma_i + ln(b/b_i) + b_i/b - 1
        so NO derivative of the activity model is needed for a fugacity
        coefficient (d(nG^E/RT)/dn_i = ln gamma_i).  MHV2's beta is the
        root of its quadratic that tends to MHV1's as q2 -> 0 (the "larger
        root", Dahl & Michelsen p. 1835).

    THE G^E MODEL is a gamma-phi liquid's own: an ActivityModel built by
    ActivityModel::New from the same `activityModel` block, called at the
    composition of the PHASE BEING PRICED (the liquid's for phiLiquid, the
    vapour's for phi).  The pressure never reaches it.  A pair that resolved
    to ideal (no record) is REFUSED here, by name: under gammaPhi a missing
    pair is an announced ideal assumption; inside an equation of state a zero
    G^E is a definite claim about a that is NOT the one-fluid rule, and no
    kij exists to correct it.

    THE ENERGY.  dbeta/dT contains d(G^E/RT)/dT = -H^E/(RT^2), with H^E the
    activity model's own (ActivityModel::excessEnthalpy).  Inside an
    equation of state it cannot be withheld by `calorimetricFit`: H^R =
    -RT^2 d(sum y_i ln phi_i)/dT is an identity of the surface the fugacities
    came from.  It is announced once per run (CubicMixingRule.cpp).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/Component.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class ActivityModel;

class CubicMixingRule
{
public:
    // The pure-component parameters at T, filled by CubicEoS::buildAi.
    struct Pure
    {
        std::vector<scalar> a;      // a_i(T)        [Pa m^6/mol^2]
        std::vector<scalar> dadT;   // da_i/dT
        std::vector<scalar> s;      // signed sqrt(a_i)
        std::vector<scalar> dsdT;   // its T derivative
        std::vector<scalar> b;      // b_i           [m^3/mol]
    };

    // What the cubic reads back.
    struct Mixed
    {
        scalar a    = 0.0;          // [Pa m^6/mol^2]
        scalar b    = 0.0;          // [m^3/mol]
        scalar dadT = 0.0;          // set when `temperature` was asked
        std::vector<scalar> bbar;   // bbar_i = d(n b)/dn_i        (partials)
        std::vector<scalar> X;      // betabar_i/beta              (partials)
        //  The pair matrix of the one-fluid rule (ledger); empty otherwise.
        std::vector<std::vector<scalar>> aij;
    };

    virtual ~CubicMixingRule() = default;

    //  `partials`    fill bbar and X (the fugacity coefficient needs them).
    //  `temperature` fill dadT (the departures need it).  The one-fluid rule
    //                always fills dadT, its cost being nil.
    virtual void mix(scalar T, const sVector& y, const Pure& pure,
                     Mixed& out, bool partials, bool temperature) const = 0;

    //  The grammar's word.
    virtual const std::string& name() const = 0;

    //  The one-fluid kij matrix, or nullptr: the rules that carry none (the
    //  G^E rules) have no mixing ledger of the one-fluid kind.
    virtual const std::vector<std::vector<scalar>>* kij() const { return nullptr; }

    //  The G^E model of an excess-Gibbs rule, nullptr for the one-fluid rule.
    virtual const ActivityModel* activity() const { return nullptr; }

    //  Lines for the resolved view (the rule, its source, its pairs).
    virtual std::vector<std::string> viewLines() const = 0;

    // ---- factory (explicit, like every base) ----
    struct Context
    {
        std::string                  eosModel;    // "SRK" | "PR"
        const std::vector<Component>* comps = nullptr;
        DictPtr                      eosDict;     // the equationOfState block
        std::vector<std::vector<scalar>> kij;     // one-fluid only (read by the cubic)
    };
    using Factory = std::function<std::unique_ptr<CubicMixingRule>(const Context&)>;
    static void registerType(const std::string& name, Factory f);
    static bool isRegistered(const std::string& name);
    static std::vector<std::string> registeredNames();
    static std::unique_ptr<CubicMixingRule> New(const std::string& name,
                                                const Context& ctx);
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
