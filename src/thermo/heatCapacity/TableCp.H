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
    Choupo::TableCp

Description
    A LIQUID OR SOLID HEAT CAPACITY GIVEN AS MEASURED POINTS: the law type
    `table` of the heat-capacity family (DEV.md 4c C398, slice (c); ruled
    addendum A2).  Cp(T) is the table's declared interpolant (linear or
    monotoneCubic); the sensible enthalpy and entropy are its integrals,
    built ONCE at construction in closed form (PropertyTable.H), so
        H(T, Tref) = I1(T) - I1(Tref),   S(T, Tref) = I2(T) - I2(Tref)
    exactly for the interpolant, as a polynomial law's are.

    THE ANCHOR IS COVERED OR THE TABLE IS REFUSED.  Every liquid and solid
    leg of the enthalpy integrates from 298.15 K (Component::h_formation, the
    elements datum), so the table's points must contain 298.15 K; a table
    that does not is refused at construction, naming the reason.  An
    ideal-gas table is refused (A2(v): it enters formation, Gibbs and the
    equilibrium constants and waits for its own check).

    Built by its Component (Component::buildCp_), which knows the record's
    molar mass (a specific heat capacity column is converted with it) and the
    law's name and home for every message; the registry entry exists so the
    type is known to the record reader.
\*---------------------------------------------------------------------------*/

#pragma once

#include "HeatCapacityModel.H"
#include "thermo/PropertyTable.H"

#include <memory>

namespace Choupo {

class TableCp : public HeatCapacityModel
{
public:
    //- The datum temperature every liquid and solid leg integrates from.
    static constexpr scalar anchorT = 298.15;

    explicit TableCp(std::unique_ptr<PropertyTable> table);

    scalar Cp(scalar T) const override { return table_->value(T); }
    scalar H (scalar T, scalar Tref) const override
    { return table_->integral(T) - table_->integral(Tref); }
    scalar S (scalar T, scalar Tref) const override
    { return table_->integralOverT(T) - table_->integralOverT(Tref); }
    const std::string& modelName() const override { return name_; }

    const PropertyTable& table() const { return *table_; }

private:
    inline static const std::string name_ = "table";
    std::unique_ptr<PropertyTable> table_;
};

} // namespace Choupo
