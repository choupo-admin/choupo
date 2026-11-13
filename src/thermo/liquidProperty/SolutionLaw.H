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
-------------------------------------------------------------------------------
Class
    Choupo::liquidProperty::SolutionLaw

Description
    A SOLUTION'S OWN DENSITY LAW, read from its solution record (DEV.md 4c
    C378 pilot; docs/design/density-pilot-plan.md section 4).

    A solution record lives in `parameters/solution/<set>.dat` (the case's
    `constant/parameters/solution/` first, then the catalogue), named by its
    constituent set sorted case-insensitively (`NaOH-water`).  Its
    `liquidDensity` block states what it returns, the FORM of its law (a
    registered name, `SolutionForm.H`), the composition variable, the law's
    coefficients, its domain -- HARD -- and its evidence.  The method applies
    only to a request whose constituent set EQUALS the record's: a third
    constituent passes it over, never extrapolates it.

    The pilot's one form is `polynomialTSqrtX` (Olsson, Jernqvist and Aly,
    Int. J. Thermophys. 18 (1997), Eqs. (6)-(9)):

        rho = b1 + b2 t + b3 t^2,   b_j = sum_{k=0..5} c_jk x^(k/2),

    with t = T - `temperatureOrigin` and x the record's `variable`.  The law
    carries no pressure term (`pressure notCarried;`): the run says so once
    per method and unit.  Outside every band of its domain the request is a
    typed domain error naming the record and the bands.
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityMethod.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {

//  One registered FORM of a solution's density law: validates the record's
//  coefficients at load and evaluates rho [kg/m3] at (t, x).
class SolutionForm
{
public:
    virtual ~SolutionForm() = default;
    virtual std::string name() const = 0;
    virtual scalar      rho(scalar t, scalar x) const = 0;

    using Factory = std::function<std::unique_ptr<SolutionForm>(const DictPtr&, const std::string&)>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<SolutionForm> New(const std::string& name, const DictPtr& block,
                                             const std::string& where);
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

class SolutionLaw : public DensityMethod
{
public:
    //  `b.recordName` is the record's path (as resolved).
    explicit SolutionLaw(const Binding& b);
    ~SolutionLaw() override;

    std::string   id() const override;
    DensityAnswer evaluate(scalar T_K, scalar P_Pa, const sVector& x) const override;

    //  The record of the set present in `x`, by name, or "" when none
    //  (throws when one exists but is malformed).
    static std::string recordFor(const ThermoPackage& thermo, const std::vector<std::size_t>& set);

    //  The record's stated maximum deviation [kg/m3]: what a disagreement
    //  with a measurement is counted against (rule 5).
    scalar maxDeviation() const { return maxDeviation_; }

private:
    struct Band { scalar Tlo, Thi, xlo, xhi; };

    const ThermoPackage*          thermo_ = nullptr;
    std::vector<std::size_t>      set_;
    std::string                   path_, shown_, setName_;
    std::unique_ptr<SolutionForm> form_;
    std::size_t                   variable_ = 0;     // component whose mass fraction is x
    scalar                        Torigin_ = 0.0;
    std::vector<Band>             domain_;
    std::string                   citation_, uncertainty_;
    scalar                        maxDeviation_ = 0.0;
};

} // namespace liquidProperty
} // namespace Choupo
