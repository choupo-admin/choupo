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
    Choupo::ReactionRate

Description
    THE KINETICS LAW OF ONE REACTION, selected by `kinetics { type <word>; }`
    in a case's constant/reactions, through the explicit factory every other
    model family here uses (CLAUDE.md §5): `registerType` / `New` /
    `registerBuiltins`, called explicitly from the mains that build reactors.

    Before 2026-10-12 (DEV.md 4c C67) there was no family: `RateLaw` was a
    value class serving `Arrhenius` and `LHHW`, and the `pfr` selected a
    third law, Dyson-Simon, from a fixed word list beside it -- with the
    law's constants compiled into the engine.  Vítor's ruling the same day:
    the kinetics live in the CASE (axiom 3 of the property layout, and "o
    código tem de ficar no caso").  So:

      * `Arrhenius`, `LHHW`   built in -- `RateLaw`, unchanged in arithmetic;
      * `expression`          built in -- `ExpressionRate`: the law WRITTEN in
                              the dict as a formula over named parameters, the
                              state and declared tables, evaluated by
                              core/Formula.  Runs everywhere, the site included;
      * anything else         a case-local law: a case's `code/` folder may
                              register one from `registerUserTypes()`, built by
                              `bin/buildCode` into a per-case binary.  LOCAL
                              ONLY -- the browser has no compiler -- and the
                              GUI says so for every case that ships `code/`.

    WHO READS THIS FAMILY.  The multi-reaction paths of `cstr` and `pfr`
    (`reactions ( ... );`) take EVERY law through `New`.  `batchReactor` and
    `dynamicCSTR` keep their own readers for the words they own -- the batch
    vessel's `Arrhenius` / `modifiedArrhenius` / `thirdBody` / `falloff`
    carry CHEMKIN unit conversion and pressure fall-off that no law here
    has, and the dynamic CSTR's `Arrhenius` is wired into its own energy
    probe -- and send every OTHER word (`LHHW`, `expression`, a user law)
    here.  The SINGLE-reaction paths of `cstr` and `pfr` (`reaction
    <name>;`) keep their closed-form Arrhenius reader (Damkohler number and
    the analytic first-order check are about THAT law) and refuse any other
    word naming the multi-reaction grammar.  The reactive distillation
    column reads its own pseudo-homogeneous / adsorption kinetics and is not
    a reactor; it is untouched.

    THE STATE A LAW IS HANDED (`RateState`): T [K], P [Pa], the
    concentrations in the CALLER's amount unit (`amountPerKmol` says which:
    1000 when the reactor works in mol, 1 when in kmol) and the mole
    fractions of the reacting fluid.  What a reactor CANNOT supply it says in
    a `RateOffer` at construction, and a law that needs it refuses there
    rather than reading a placeholder.

    THE RATE A LAW RETURNS is the EXTENT rate of its reaction in the caller's
    convention: per cubic metre of reactor in the caller's amount unit per
    second, or -- when the reactor declares `catalystLoading` -- per gram of
    catalyst in mol per second (numerically kmol per kg), which the reactor
    converts with the loading exactly as it always has.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <ostream>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;
class ExpressionRate;

//- The state one evaluation is asked about.
struct RateState
{
    scalar         T = 0.0;              // K
    scalar         P = 0.0;              // Pa (NaN when the reactor carries none)
    const sVector* conc = nullptr;       // caller's amount unit per m3
    const sVector* x    = nullptr;       // mole fractions of the reacting fluid
    scalar         amountPerKmol = 1000.0;   // 1000: conc in mol/m3; 1: in kmol/m3
};

//- What a reactor can hand a law.
struct RateOffer
{
    bool        pressure      = true;
    bool        concentration = true;
    std::string concentrationBasis;      // how the reactor forms c[i], in words
};

class ReactionRate
{
public:

    using Factory = std::function<std::unique_ptr<ReactionRate>(
        const DictPtr&       rxn,
        const ThermoPackage& thermo,
        const std::string&   who,
        const RateOffer&     offer)>;

    static void registerType(const std::string& name, Factory f);

    //- Build the law named by `rxn.kinetics.type`; refuses an unregistered
    //  word with the registered list.
    static std::unique_ptr<ReactionRate> New(const DictPtr&       rxn,
                                             const ThermoPackage& thermo,
                                             const std::string&   who,
                                             const RateOffer&     offer = RateOffer());

    static void registerBuiltins();
    static std::vector<std::string> availableTypes();
    static bool isRegistered(const std::string& name);

    virtual ~ReactionRate() = default;

    virtual const std::string& typeName() const = 0;

    //- Net EXTENT rate, in the caller's convention (see the header).
    virtual scalar netRate(const ThermoPackage& thermo, const RateState& s) const = 0;

    //- The law's rate constant, for reporting (`k_<reaction>`).  A law that
    //  declares none returns false and the caller publishes nothing.
    virtual bool   hasRateConstant() const { return false; }
    virtual scalar rateConstant(const ThermoPackage& thermo, const RateState& s) const;

    //- Whether the law reads concentrations at all (a gas bed whose law is in
    //  T, P and mole fractions never asks the reactor for a liquid basis).
    virtual bool needsConcentration() const { return true; }

    //- The basis the law DECLARES: "reactorVolume", "catalystMass", or ""
    //  when the law does not declare one (Arrhenius / LHHW: the reactor's
    //  `catalystLoading` decides, as it always has).
    virtual std::string declaredBasis() const { return ""; }

    //- The expression law, when this is one (the pfr and the bench read its
    //  definitions); null otherwise.  A virtual, not a cast.
    virtual const ExpressionRate* asExpression() const { return nullptr; }

    //- Refuse a declared basis that contradicts the reactor's loading: a law
    //  per reactor volume multiplied by a loading, or a law per catalyst mass
    //  with no loading to convert it.  No-op for a law that declares none.
    void checkLoading(bool reactorHasLoading, const std::string& who) const;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
