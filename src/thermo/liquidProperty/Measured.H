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
    Choupo::liquidProperty::Measured

Description
    A MEASUREMENT THE CASE MARKS AS A METHOD, WITH A HARD BOX (DEV.md 4c C378
    pilot; docs/design/density-pilot-plan.md section 5; the routes record's
    third amendment block, item 3).

    The data stay in the experiments format the tree already reads
    (`constant/experiments/<name>.dat`: `provenance`, `columns`, `data`), with
    four keys of the measurement: `property liquidDensity;`, `solvent <c>;`
    (the constituent whose mass fraction is the rest; the set is the
    composition columns plus it), `uncertainty <U>;` (kg/m3, expanded) and
    `box { T (lo hi); P (lo hi); w[<c>] (lo hi); }` (K, Pa, -: raw SI, a list
    carries no unit suffix in this grammar).  The case marks the file in its
    thermophysical system:

        volumetric { liquid { measured
        {
            NaOH20_303K { use method; replaces { method solutionLaw; record NaOH-water; }
                          reason "lab point of our caustic"; }
            NaOH20_333K { use check; }
        } } }

    `use method`: the measured value IS the density of that constituent set
    inside the box, on every stream, authored or computed; outside the box a
    typed domain error, never a hand-over to another method.  It displaces a
    catalogue method only when `replaces` names the one that applies; with
    none named where one applies, or one named that does not apply, it is
    refused at the set's resolution.  The replaced method's value at the
    state is printed beside the measurement with the deviation, COUNTED as a
    finding when above that method's stated maximum deviation.
    `use check`: never used; inside its box the run prints it beside the
    computed value with the deviation, outside it "not at its conditions"
    with the distance.

    THE BOX AGAINST THE UNCERTAINTY: when a law applies to the set, the law's
    span over the box's corners is compared with `uncertainty`; a wider box
    is a hypothesis -- `reason` is mandatory and values away from the
    measured point carry origin `assumed`.  With no law, `reason` is always
    mandatory ("box not judged").
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityMethod.H"

#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {
namespace liquidProperty {

struct Measurement
{
    std::string name, path, property, solvent, citation;
    std::vector<std::string> constituents;          // the set, by name
    scalar T = 0, P = 0, rho = 0, U = 0;            // K, Pa, kg/m3, kg/m3
    std::map<std::string, scalar> w;                // mass fraction per named column
    std::pair<scalar, scalar> boxT{0, 0}, boxP{0, 0};
    std::map<std::string, std::pair<scalar, scalar>> boxW;
    std::string use;                                // "method" | "check"
    std::string replacesMethod, replacesRecord, reason;
};

//  The case's measurements, parsed ONCE where the thermophysical system is
//  read (ThermoPackageBuilder, beside `approximations`), consulted by the
//  resolver.  An unknown word under `volumetric` is refused.
class MeasurementDeclarations
{
public:
    static MeasurementDeclarations& instance();
    void readFrom(const DictPtr& topLevel);
    const std::vector<Measurement>& all() const { return all_; }
private:
    std::vector<Measurement> all_;
};

class Measured : public DensityMethod
{
public:
    //  `b.recordName`: the measurement's name; `b.parts`: the replaced
    //  catalogue method (0 or 1); the set is the measurement's.
    explicit Measured(const Binding& b);

    std::string   id() const override { return "measured." + m_.name; }
    DensityAnswer evaluate(scalar T_K, scalar P_Pa, const sVector& x) const override;

    //  The mass fraction of each named constituent of `x` over `set`.
    static std::map<std::string, scalar> massFractions(const ThermoPackage& thermo,
        const std::vector<std::size_t>& set, const sVector& x);
    //  "" inside the box; otherwise the words of the first limit crossed.
    static std::string outsideBox(const Measurement& m, scalar T, scalar P,
                                  const std::map<std::string, scalar>& w);

private:
    const ThermoPackage*                 thermo_ = nullptr;
    std::vector<std::size_t>             set_;
    Measurement                          m_;
    std::shared_ptr<const DensityMethod> replaced_;
    bool                                 hypothesis_ = false;   // box wider than U
};

} // namespace liquidProperty
} // namespace Choupo
