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
    Choupo::ConverterShellSize

Description
    ONE PRESSURE SHELL AROUND A SECTOR'S EQUIPMENT (DEV.md 4c C69, 2026-10-12).

    A multibed catalytic converter is built as ONE pressure vessel holding
    the catalyst beds and the interbed exchangers; the flowsheet still
    computes each bed and each exchanger as its own block, because they ARE
    separate calculations, and the grouping is a fact about the EQUIPMENT --
    sizing, costing and presentation.  The case expresses it with its own
    sector mechanism (the beds and exchangers are the units of one SECTOR)
    and one sizing entry that names the sector:

        { unitName CONVERTER;  type converterShell;  material SS316;
          designRules { pressureDesign 167;      // bar g, REQUIRED
                        H <length>;              // optional, never below the stack
                        corrosionAllow ...;  jointEfficiency ...; } }

    THE MEMBERS ARE THE SECTOR'S UNITS, read from the solved topology (the
    sector each unit was stamped with at the flatten seam), never listed a
    second time: every unit of the sector must ALREADY be sized (its entry
    declared before this one), and each must publish a geometry -- a vessel
    shell's D and H (a catalyst bed's `shell`), or an exchanger design's
    `shellID` and `tubeLength` (times its shells in series).  A unit of the
    sector with no sized item, an item with no geometry, and a name that is
    not a sector of the plant are REFUSED by name.

    ONE DIAMETER, THE SHELL'S, WITH ONE HOME IN THE FLOWSHEET.  The beds sit
    in one shell, so they share one diameter: every catalyst-bed member must
    be a `pfr` of DECLARED diameter (`operation.diameter`, one plant
    variable read by every bed) -- a bed at its own `L_over_D`, or two beds
    declaring two diameters, are REFUSED by name.  The diameter lives in the
    flowsheet and not here because a bed needs its cross-section DURING the
    solve (its Ergun drop is integrated along its length L = V_R/(pi D^2/4))
    and this pass runs after it; so a `D` in these designRules is refused as
    a second home, and the diameter is chosen where the beds are solved (the
    witness's DesignSpec solves it as the smallest at which every bed's
    Ergun drop is within its allowable, a `largestOf` target that names no
    bed in advance).  A member exchanger whose shell is wider than the
    converter does not fit, and is refused.

    THE SMALLEST ADMISSIBLE DIAMETER, BRACKETED.  Each bed publishes its
    drop at the converter's D0 and the share the INERTIAL term carries over
    the bed (`ergunInertialShare_bed`).  At a fixed volume and a FROZEN
    axial state the viscous term goes as D^-4 and the inertial as D^-6, so
    r_i(D) = r_i(D0) [(1 - s_i)(D0/D)^4 + s_i (D0/D)^6] is bed i's drop over
    its allowable at any D -- exact at D0, the one approximation being that
    a different drop would move the pressure the gas reacts at.  max_i r_i
    falls monotonically, so its root at 1 is ONE number: the smallest
    diameter holding every bed, bisected in ln D on [0.1, 10] m (a SEARCH
    bracket, wider than any converter built), announced with the bracket and
    the BINDING bed, published as `D_smallestAdmissible`; no root in the
    bracket is REFUSED by name (no axial-flow converter meets the budgets).
    It then says whether the converter's D0 sits at it (the binding bed at
    its allowable to `bindingTolerance`, 0.2 %), above it (a narrower
    converter would do) or below it (a bed exceeds its allowable, a
    warning).  It does NOT move D0: the beds were solved there.

    THE SHELL IS THE MEMBERS STACKED AXIALLY at that diameter: height the
    sum of the members' -- a straight cylinder with no head space, cooling
    annulus, distributor, plenum or transfer duct, said in the basis.  A
    declared `H` smaller than the stack is REFUSED (a shell smaller than
    what it holds); a larger one is used and said.  The wall is ASME thin-
    wall through `VesselMechanics` at the shell's own `pressureDesign`, which
    may not be BELOW a member's (refused); priced on the existing Turton
    vessel set by its volume.

    WHAT HAPPENS TO THE MEMBERS.  A member's own VESSEL shell (the bed's
    `shell`) is inside this one: it becomes an internal basket, and the
    sizing pass marks it NOT COSTED, naming this item (`encloses`).  The
    catalyst charges stay priced.  A member EXCHANGER keeps its own Turton
    exchanger cost: Turton carries no correlation for a tube bundle without
    its shell, so that item's shell share is counted twice -- an
    OVER-estimate, said on this item's basis rather than corrected by an
    invented factor.

    The item is the SECTOR's (`unitName` the sector, tag `shell`); a relief
    valve declared on the same sector name protects it (ReliefValveSize
    reads the sector's outlets from the topology).
\*---------------------------------------------------------------------------*/

#pragma once
#include "EquipmentSize.H"

#include <vector>

namespace Choupo {

class ConverterShellSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }
    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;
private:
    inline static const std::string type_ = "converterShell";
};

} // namespace Choupo
