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
    Choupo::ElementaryRate

    The three CHEMKIN-style rate words of the ReactionRate factory:

        modifiedArrhenius   k = A T^b exp(-Ea/(R T))
        thirdBody           k = A T^b exp(-Ea/(R T)) [M]
        falloff             k = kInf Pr/(1+Pr) F,  Pr = kLow [M] / kInf

    with [M] = sum_j eff_j c_j (unlisted species: efficiency 1), and F the
    Troe broadening (F = 1, Lindemann, when no `troe` list is given).  The
    net rate is  r = k * prod c_i^order_i  minus, for `reversible true`, the
    detailed-balance reverse leg k/Kc * prod_{nu>0} c_i^nu_i.

    THE GRAMMAR is the one `batchReactor` reads for the same words, so one
    reactions file runs in both vessels: `A`, `b`, `Ea`; for thirdBody a
    `thirdBody { species eff; }` block; for falloff a `low { A b Ea }` block,
    an optional `troe ( alpha T3 T1 [T2] )` and an optional `thirdBody`
    block; an optional `units { A "cm3/mol/s"; Ea "kcal/mol"; }`.

    UNITS.  With a `cm` A unit the constant is converted to the CALLER's
    amount unit at evaluation: per order of the molecularity beyond the
    first (the sum of the declared orders, +1 for thirdBody and for `low`)
    A is multiplied by 1e-6 * 1000 / amountPerKmol -- 1e-6 in a reactor that
    works in mol/m3 (cstr, pfr), 1e-3 in one that works in kmol/m3 (the batch
    vessel's own reader).  Ea: kcal x 4184, cal x 4.184, kJ x 1000 (J/mol
    unchanged).  WITHOUT a `units` block the values are taken as already in
    the caller's amount unit, as for `Arrhenius`.

    PLOG (`type plog`, CHEMKIN-II PLOG): `plog ( { P 0.1 atm; A; b; Ea; } ... )`,
    one modified Arrhenius per pressure line, P through the Dictionary's unit
    machinery (stored in Pa).  k(T,P): at a tabulated P the law is that line's
    k_i(T); between two tabulated pressures ln k is LINEAR in ln P; below the
    lowest / above the highest pressure k is that end's value (no
    extrapolation -- Cantera's convention); several lines at the SAME P are
    SUMMED, k_i = sum of their Arrhenius, before the interpolation (CHEMKIN and
    Cantera).  The nominal `A b Ea` of the reaction line is ignored.  The law
    reads the caller's pressure, so a vessel without one refuses it by name.

    REFUSED BY NAME: an `adsorption` block or `basis activity` (LHHW's), an
    explicit `A_rev`/`Ea_rev` (use `reversible true`), a `thirdBody` /
    `falloff` without its required blocks, and an A unit that is not a
    cm-mol-s one.  Source: CHEMKIN-II (Kee, Rupley, Miller, SAND89-8009);
    Gilbert, Luther & Troe (1983) for the Troe form.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/reaction/ReactionRate.H"

namespace Choupo
{

class ElementaryRate : public ReactionRate
{
public:

    enum class Form { modifiedArrhenius, thirdBody, falloff, plog };

    //  `offer` says whether the caller can hand the law a pressure; `plog`
    //  refuses at construction when it cannot.
    static ElementaryRate fromDict(const DictPtr&       rxn,
                                   const ThermoPackage& thermo,
                                   const std::string&   who,
                                   const RateOffer&     offer = RateOffer());

    scalar netRate(const ThermoPackage& thermo, const RateState& s) const override;
    const sVector* gibbsStoichiometry() const override
    { return reversible_ ? &nu_ : nullptr; }
    bool   hasRateConstant() const override { return true; }
    scalar rateConstant(const ThermoPackage&, const RateState& s) const override
    { return kEff(s); }
    const std::string& typeName() const override { return type_; }

    //  The analytic derivatives (the batch reactor's Jacobian): every form,
    //  PLOG included -- d k / d T of each Arrhenius leg, d k / d[M] of the
    //  third body and the fall-off (Lindemann and Troe exactly), d k / d P of
    //  the PLOG interpolation (0 where it is clamped), d ln Kc / dT from the
    //  species' h(T).  Theory Guide, sec:batch-analytic-jacobian.
    bool hasAnalyticGradient() const override { return true; }
    bool netRateGradient(const ThermoPackage& thermo, const RateState& s,
                         RateGradient& g) const override;
    bool rateDependencies(std::vector<std::size_t>& species) const override;
    bool readsPressure() const override { return form_ == Form::plog; }

private:

    //- The effective forward k (third body and fall-off folded in), in the
    //  caller's amount unit.
    scalar kEff(const RateState& s) const;
    //- kEff and its derivatives: dkdM (third body / fall-off; 0 otherwise),
    //  dkdT at fixed [M] and P, dkdP at fixed T (PLOG; 0 otherwise).
    struct KDerivs { scalar k = 0.0, dkdM = 0.0, dkdT = 0.0, dkdP = 0.0; };
    KDerivs kEffDerivs(const RateState& s) const;

    std::string who_;
    std::string type_;
    Form        form_ = Form::modifiedArrhenius;

    // A is kept as written (CHEMKIN units); `molec_` is the molecularity the
    // conversion uses (the sum of the declared orders), 0 when no cm unit asks.
    scalar A_ = 0.0, b_ = 0.0, Ea_ = 0.0;          // Ea in J/mol
    scalar ALow_ = 0.0, bLow_ = 0.0, EaLow_ = 0.0;
    bool   cmA_ = false, cmALow_ = false;
    int    molec_ = 0;
    sVector troe_;

    //  PLOG (CHEMKIN-II): one entry per DISTINCT tabulated pressure, ascending;
    //  `arr` holds every Arrhenius line given at that pressure (summed).
    struct PlogArr { scalar A = 0.0, b = 0.0, Ea = 0.0; };    // A in the caller's unit
    struct PlogRow { scalar P = 0.0; std::vector<PlogArr> arr; };
    std::vector<PlogRow> plog_;
    scalar plogK(const PlogRow& row, scalar T) const;
    scalar plogDkDT(const PlogRow& row, scalar T) const;   // d plogK / dT
    sVector eff_;                                  // full-length third-body efficiencies

    //  orderRev_: the reverse leg's power, max(nu, 0) unless a species on BOTH
    //  sides declares its product count (`orderRev`).
    sVector nu_, order_, orderRev_;
    bool    reversible_ = false;
};

} // namespace Choupo
