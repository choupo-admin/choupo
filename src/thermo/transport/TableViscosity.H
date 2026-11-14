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
    Choupo::TableViscosity

Description
    A PURE LIQUID'S VISCOSITY GIVEN AS MEASURED POINTS: the law type `table`
    of the liquidViscosity family (DEV.md 4c C398, slice (c)).  The law is a
    record's named law or a case's table cited by a pin; the object reads it
    from the constituent's block by the name the package binds (bindLaw), and
    evaluates it through PropertyTable: the declared interpolation between
    the points, a typed refusal outside them (or inside a case's declared
    extension, the end segment's chord, announced).
\*---------------------------------------------------------------------------*/

#pragma once

#include "LiquidViscosityModel.H"
#include "thermo/PropertyTable.H"

#include <memory>

namespace Choupo {

class TableViscosity : public LiquidViscosityModel
{
public:
    explicit TableViscosity(const DictPtr& /*dict*/) {}
    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }
    scalar viscosityLiquidPure(const Component& c, scalar T_K) const override;
    CorrelationVerify verify() const override;
private:
    inline static const std::string name_ = "table";
    inline static const std::string window_ =
        "the table's own points, hard: no value outside them (a case may "
        "declare a bounded extension on its pin, announced)";
    inline static const std::string cite_ =
        "the source of the points, per law, in the record's provenance block "
        "or the case's experiments file";
    mutable std::unique_ptr<PropertyTable> table_;
};

} // namespace Choupo
