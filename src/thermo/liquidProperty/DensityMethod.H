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
    Choupo::liquidProperty::DensityMethod

Description
    A METHOD OF THE LIQUID DENSITY, AS A CODE OBJECT (DEV.md 4c C378, the
    pilot; docs/design/density-pilot-plan.md section 1).

    A method answers ONE request -- the liquid density of a set of
    constituents at (T, P) with the phase's own mole fractions -- and says,
    in the same answer, how it got the number: its id, the words a student
    reads, the leaves it combined, whether pressure entered, and the three
    statements of quality.  The label is produced by the code that computed
    the value (review ledger DX-01): no consumer chooses words.

    Two shapes share the base:
      * a LEAF is bound to ONE component and answers that component's liquid
        molar volume v_i (a record's `Vliq` on its route, a pure-fluid
        formulation's liquid branch, the declared hypothesis that the
        component has mass and no volume);
      * a SET METHOD answers the density of the whole constituent set
        (`idealMixing` over one leaf per constituent; in later steps a
        solution record's law and a measurement).
    Both fill `DensityAnswer`: a leaf its `v` (and `rho` of the pure
    component when it has one), a set method `rho` and the set's `v`.

    The explicit factory of every Choupo base: `registerType`, `New`,
    `registerBuiltins` called from each binary's main (CLAUDE.md section 5).
    No method chooses itself: the resolver (DensityResolver.H) chooses, by
    the facts the case and the catalogue hold, once per constituent set.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "thermo/LiquidPropertyDoor.H"

#include <functional>
#include <limits>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace liquidProperty {

struct DensityAnswer
{
    //  m3 per mole of the set's mixture (x normalised over the set); a leaf's
    //  own molar volume.  Zero for a component that keeps mass and no volume.
    scalar v   = std::numeric_limits<scalar>::quiet_NaN();
    //  kg/m3; NaN for a leaf with no volume.
    scalar rho = std::numeric_limits<scalar>::quiet_NaN();
    std::string       methodId;
    std::string       label;
    std::vector<Leaf> leaves;
    bool              pressureApplied = false;
    //  The pressure column's words when they differ by leaf ("applied to
    //  water; not applied to ethanol"); "" means "applied" or "not applied"
    //  as pressureApplied says (C378 pilot review, S3).
    std::string       pressureWords;
    Quality           quality;
};

class DensityMethod
{
public:
    //  What a method is built FROM: the package whose records it reads, the
    //  constituents it answers for (component indices, ascending), the record
    //  a direct method reads, and a composite's parts (one leaf per
    //  constituent, in the order of `set`).
    struct Binding
    {
        const ThermoPackage*                              thermo = nullptr;
        std::vector<std::size_t>                          set;
        DictPtr                                           record;
        std::string                                       recordName;
        std::vector<std::shared_ptr<const DensityMethod>> parts;
    };

    using Factory = std::function<std::unique_ptr<DensityMethod>(const Binding&)>;

    virtual ~DensityMethod() = default;

    //  The stable word of this method AS BOUND ("recordVolume.anchoredRackett",
    //  "pureFluid.IF97", "idealMixing[anchoredRackett+flatVliq]").
    virtual std::string id() const = 0;

    //  True for a leaf (one component's molar volume).
    virtual bool isLeaf() const { return false; }

    //  Answer at (T, P, x).  `x` runs over the package's components; only the
    //  method's own set is read.  Outside its domain a method throws a
    //  PropertyDomainError (the typed refusal), never a neutral value.
    virtual DensityAnswer evaluate(scalar T_K, scalar P_Pa, const sVector& x) const = 0;

    // ----- Explicit factory ------------------------------------------------
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<DensityMethod> New(const std::string& name, const Binding& b);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace liquidProperty
} // namespace Choupo
