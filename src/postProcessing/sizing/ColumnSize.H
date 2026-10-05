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
    Choupo::ColumnSize

Description
    THE FIRST SIZER THAT RETURNS MORE THAN ONE PHYSICAL ITEM.

    A `distillationColumn` is one MATHEMATICAL operation and up to FIVE
    physical objects, and until 2026-09-07 it was the only major unit with no
    sizer, no cost and no specification sheet at all: `SizingPass` looked it up
    by type, found nothing registered, caught the refusal by name and listed
    the column as not sized.  Honest, and useless to a student handing in a
    design project.

        shell        the tower                    -> costed as a vertical vessel
        trays        the tray stack               -> costed by the tray (below)
        condenser    a shell-and-tube exchanger
        reboiler     a shell-and-tube exchanger
        refluxDrum   a horizontal/vertical drum   -> costed as a vessel

    THE SHAPE WAS ALREADY BUILT FOR THIS.  `DesignSheetWriter`'s own header
    chose `design/<SECTOR>/<unit>/<equipmentTag>` as 1:N with N = 1 and said,
    in those words, "the day a column yields five, the directory gains
    siblings and nothing above it changes".  This class is that day: nothing
    above it changed except the one door's return type.

    WHERE EACH NUMBER COMES FROM, and NOT ONE OF THEM IS NEW PHYSICS.

      * The DIAMETER is the tray hydraulics'.  `TrayHydraulics` has computed
        `Stage::diameterRequired` per tray since it was written, and since
        2026-09-07 it also reports the widest tray of EACH SECTION.  This
        sizer reads `diameter`, `diameter_rectifying` and `diameter_stripping`
        off the column's own KPIs; it does not re-derive a flooding velocity.

        THE TOWER IS BUILT STRAIGHT, at the larger of the two sections.  A
        SWAGED tower -- two diameters with a transition cone -- is an ECONOMIC
        choice, not a thermodynamic one: below roughly 15-20 % difference the
        transition, its fabrication and its inspection cost more than the
        plate a narrower section saves.  Choupo prices no transition, so it
        does not decide; it publishes both section diameters, publishes their
        difference, and sizes the shell straight.  A reader who wants the
        swaged comparison has both numbers to make it with.

      * The HEIGHT is the tray stack plus two end spaces.  `nStages` and
        `feedStage` are the column's own KPIs; the tray spacing is the
        author's declared hydraulics geometry.  The disengagement space above
        the top tray and the sump below the bottom one are DESIGN choices with
        no curated value, so they are `designDefault` assumptions: announced
        at their site, replayed in the end-of-run caveat block, and listed in
        the sheet's `assumed ( ... )` line unless the case declares them.

      * The two EXCHANGER duties are the column's own `Q_condenser_kW` and
        `Q_reboiler_kW` KPIs, published by BOTH solver paths since long before
        this class existed.  U and the approach temperature are NOT derivable
        from a converged column and are the author's to declare -- exactly as
        `ShellTubeHX` already requires of a heater.  A missing one REFUSES the
        item BY NAME; no default U is ever substituted.

      * The DRUM holds the overhead condensate for a declared residence time.
        The condensate's volumetric flow is the column's `Q_condensate_m3_s`
        KPI, because a liquid volume needs a thermo package and a sizer has
        none.  `VesselSize` cannot serve here: its volumetric flow is the
        IDEAL-GAS N R T / P, which on a condensate is wrong by about three
        orders of magnitude.

    ONE MISSING ITEM MUST NOT COST THE OTHER FOUR.  `SizingPass` catches per
    UNIT, so a refusal thrown from here loses the whole column -- shell,
    trays and all.  So the SHELL's inputs are the only hard requirement (a
    column with no diameter has no size at all); every other item is produced
    when its design rules are declared and, when they are not, is ANNOUNCED by
    name with the remedy and simply not built.  A student who declares only
    the shell gets a shell and a sentence saying what to add for the rest.

    THE TRAY STACK IS A SEPARATE ITEM, COSTED BY THE TRAY (2026-10-05).
    Until that day it was sized and REFUSED at cost time, by name, because no
    coefficient set in the costing model fitted a tray and inventing one would
    have converted "uncosted" into "falsely costed".  Turton's sieve-tray set
    (as CAPCOST 2017, the authors' own program, carries it) is now in
    `costing/Turton.cpp`, with its source cells and what was NOT read stated
    there.  This sizer publishes what that set prices from -- `A` (the tower
    cross-section) and `nTrays` -- and carries the author's `trayMaterial`
    word, the material CLASS Turton's F_BM is chosen by, to the costing model
    untouched.  An absent or unknown class refuses BY NAME at cost time and
    the total says INCOMPLETE by exactly the trays: the class is never read
    off the construction material's name, and trays are often a different
    metal from the shell.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EquipmentSize.H"

#include <vector>

namespace Choupo {

class ColumnSize : public EquipmentSize
{
public:
    const std::string& type() const override { return type_; }

    std::vector<EquipmentSizing> size(const std::string& unitName,
        const SimulationResult& result,
        const Material&         material,
        const DictPtr&          designRules) const override;

private:
    inline static const std::string type_ = "distillationColumn";
};

} // namespace Choupo

// ************************************************************************* //
