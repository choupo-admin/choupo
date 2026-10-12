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
    Choupo::ExpressionRate

Description
    `kinetics { type expression; }` -- A RATE LAW WRITTEN IN THE CASE.

    Every number the law uses is in the case's constant/reactions, with its
    unit, beside the formula that uses it; the engine compiles the formula
    once (core/Formula), checks its dimensions, prints it back, and evaluates
    it.  Nothing about the law is compiled into the engine.  This is DEV.md
    4c C67, Vítor's architecture decision of 2026-10-12 (option 3), and the
    three-axiom layout's axiom 3 taken literally: equipment-dependent
    kinetics live in the case's constant/.

    THE GRAMMAR (one reaction of constant/reactions):

        <name>
        {
            stoichiometry ( { component A; nu -1; } ... );   // no `order`
            kinetics
            {
                type        expression;
                source      "<the citation the numbers come from>";
                basis       reactorVolume | catalystMass;
                rateOf      extent | <component>;
                parameters  { <name> <value> <unit>; ... }       // optional
                tables      { <table> { x ( ... ); xUnit <u>;    // optional
                                        <col> ( ... ); ...
                                        yUnit <u>; } }
                definitions { <name> "<formula>"; ... }          // optional
                rate        "<formula>";                         // either
                forward     "<formula>";  reverse "<formula>";   // or both
                rateConstant { name <definition>; unit <u>; }    // optional
                fugacityCoefficients { <component> <definition>; } // optional
                validity    { <symbol> { min ..; max ..;          // optional
                                         outside announce|refuse; } }
                equilibriumTemperatureWindow { min .. K; max .. K; } // optional
                caveats     ( "<sentence>" ... );                // optional
            }
        }

    THE SYMBOLS a formula may read -- the minimal honest set, and each is
    what the REACTOR supplies, never a model this law chooses:

        T        temperature                              [K]
        P        pressure                                 [Pa]
        x[i]     mole fraction of component i in the
                 reacting fluid                           [-]
        p[i]     partial pressure x[i] * P                [Pa]
        c[i]     molar concentration, as the REACTOR
                 forms it (the pfr and cstr: F_i / Q on
                 the liquid basis Q = F * sum z_i Vliq_i;
                 batchReactor and dynamicCSTR: n_i / V)   [kmol/m3]

    plus every declared parameter (a constant, with its unit), every
    definition (a named formula, evaluated in dependency order, a cycle
    refused), and every column of a declared table.  NOT supplied, said
    plainly: fugacities or activities from the PACKAGE.  A law fitted with
    its own fugacity coefficients writes them as definitions (Dyson & Simon
    do, Eqs 6-8); a law fitted on the package's activities is the built-in
    `LHHW` with `basis activity`.  A rate that read the package's fugacity
    would change with the equation-of-state choice, silently.

    WHAT THE VALUE IS.  `rate` (or `forward - reverse`) must have the
    dimensions of its `basis`: kmol/(m3 s) per reactor volume, kmol/(kg s)
    per catalyst mass -- checked when the formula is compiled.  `rateOf`
    says what it is the rate OF: the reaction's extent, or the net formation
    of one component (a paper that reports "kmol NH3 per m3 per hour"),
    which the law divides by that component's nu.  Declared, never assumed.

    WHAT IS REFUSED, by name: an unknown symbol, a parameter with no unit
    (write `-` for a pure number), a definition cycle, a dimension mismatch,
    a basis the reactor contradicts (`catalystLoading` beside a volumetric
    law, or none beside a per-mass law), a symbol the reactor cannot supply,
    an `order` or `reversible` key the law does not read, a table read
    outside its points, a `validity` entry declared `refuse` and left, and a
    NON-FINITE value -- naming the first definition that went non-finite.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Formula.H"
#include "core/Types.H"
#include "thermo/reaction/ReactionRate.H"

#include <cstddef>
#include <map>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace Choupo {

class ExpressionRate : public ReactionRate
{
public:

    //- Build from one reaction of constant/reactions.  `components` is the
    //  component list x[i] / c[i] / p[i] index into (the package's, in a
    //  reactor; the bench's own composition space on the props bench).
    ExpressionRate(const DictPtr&                  rxn,
                   const std::vector<std::string>& components,
                   const std::string&              who,
                   const RateOffer&                offer);

    //- One evaluation, with everything a reader might print.
    struct Detail
    {
        std::vector<scalar>      slots;      // T, P, x, p, c, then the definitions
        scalar                   rateSI    = 0.0;   // the law's value, SI
        scalar                   forwardSI = 0.0;   // when legs are declared
        scalar                   reverseSI = 0.0;
        std::vector<std::string> interpolated;      // tables interpolated
        std::vector<std::string> outside;           // `validity` entries left (announce)
    };
    Detail evaluate(const RateState& s) const;

    //- The value of a definition or parameter in a Detail (SI).
    scalar valueOf(const Detail& d, const std::string& name) const;
    bool   knows  (const std::string& name) const;
    Dimensions dimsOf(const std::string& name) const;

    // ---- ReactionRate ------------------------------------------------------
    const std::string& typeName() const override;
    scalar netRate(const ThermoPackage& thermo, const RateState& s) const override;
    bool   hasRateConstant() const override { return !rateConstantName_.empty(); }
    scalar rateConstant(const ThermoPackage& thermo, const RateState& s) const override;
    bool   needsConcentration() const override { return usesConcentration_; }
    std::string declaredBasis() const override { return basis_; }
    const ExpressionRate* asExpression() const override { return this; }

    // ---- What the law declares, for the reactor and the bench --------------
    const std::string& source()  const { return source_; }
    const std::string& rateOf()  const { return rateOf_; }     // "extent" or a component
    scalar             rateOfNu() const { return nuRateOf_; }
    bool               hasLegs() const { return legs_; }
    const std::vector<std::string>& caveats() const { return caveats_; }
    const std::string& rateConstantName() const { return rateConstantName_; }
    const std::string& rateConstantUnit() const { return rateConstantUnit_; }
    //- component -> definition name of the law's own fugacity coefficient
    const std::map<std::string, std::string>& fugacityCoefficients() const
    { return fugacity_; }
    bool   hasEquilibriumWindow() const { return Teq_max_ > 0.0; }
    scalar equilibriumWindowMin() const { return Teq_min_; }
    scalar equilibriumWindowMax() const { return Teq_max_; }
    const std::vector<std::string>& components() const { return comps_; }
    const sVector& nu() const { return nu_; }

    //- forward - reverse at `s` with T replaced: the sign says which way the
    //  reaction runs; zero is the law's own equilibrium.
    scalar legImbalance(const RateState& s, scalar T) const;

    //- The temperature at which the gas in `s` is at equilibrium under THIS
    //  law's two legs, searched by bisection over the declared
    //  `equilibriumTemperatureWindow`.  Throws by name when no sign change
    //  lies in it.
    scalar equilibriumTemperature(const RateState& s) const;

    //- The glass box: parameters, tables, definitions in evaluation order,
    //  the rate, each with its dimensions -- the PARSE, printed back.
    std::string describe(const std::string& indent = "    ") const;

    //- The law's value in a reporting unit (fromSI), named.
    static scalar inUnit(scalar si, const std::string& unit);

private:

    struct Def
    {
        std::string name;
        std::string text;
        Formula     f;
        std::size_t slot = 0;
    };
    struct Param
    {
        std::string name;
        scalar      value = 0.0;
        Dimensions  dims;
    };
    struct Validity
    {
        std::string name;        // symbol, parameter or definition
        scalar      lo = 0.0, hi = 0.0;
        bool        hasLo = false, hasHi = false;
        bool        refuse = false;
        std::string unit;        // declared unit word, for messages
        scalar      factor = 1.0;
    };

    std::string who_;
    std::string source_;
    std::string basis_;
    std::string rateOf_;
    scalar      nuRateOf_ = 1.0;
    bool        legs_ = false;
    bool        usesConcentration_ = false;
    bool        usesPressure_ = false;

    std::vector<std::string> comps_;
    sVector                  nu_;
    std::vector<Param>       params_;
    std::map<std::string, std::shared_ptr<const Formula::Table>> tables_;
    std::vector<std::string> tableGroups_;      // declared order, for describe()
    std::vector<Def>         defs_;             // in evaluation (dependency) order
    std::optional<Formula>   rate_, forward_, reverse_;
    std::string              rateConstantName_, rateConstantUnit_;
    std::map<std::string, std::string> fugacity_;
    std::vector<Validity>    validity_;
    std::vector<std::string> caveats_;
    scalar                   Teq_min_ = 0.0, Teq_max_ = 0.0;

    std::size_t nSlots_ = 0;

    // slot layout
    std::size_t slotT() const { return 0; }
    std::size_t slotP() const { return 1; }
    std::size_t slotX(std::size_t i) const { return 2 + i; }
    std::size_t slotPp(std::size_t i) const { return 2 + comps_.size() + i; }
    std::size_t slotC(std::size_t i) const { return 2 + 2 * comps_.size() + i; }

    void fillState(const RateState& s, std::vector<scalar>& v) const;
    void evaluateDefinitions(std::vector<scalar>& v, Formula::Trace* tr) const;
    void checkValidity(const std::vector<scalar>& v, std::vector<std::string>* out) const;
    std::optional<scalar> lookupValue(const std::vector<scalar>& v, const std::string& name) const;
};

} // namespace Choupo
