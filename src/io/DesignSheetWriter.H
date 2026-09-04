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
    Choupo::DesignSheetWriter

Description
    THE EQUIPMENT SPECIFICATION SHEET, one dictionary file per physical
    equipment item, under the case root:

        design/<SECTOR>/<unit>/<equipmentTag>
        design/<unit>/<equipmentTag>              (a flat case: no sector level)

    WHAT IT IS FOR.  A student hands in a final-year project.  The auditor
    wants, per unit operation, one page: what goes in, what comes out, what
    was sized, what it costs.  Until this existed the three answers lived in
    three unrelated places -- the inlets and outlets only inside `iterations/`
    (numerical history, opt-in, off by default), the sizing only in two flat
    CSVs and on the screen, the cost only beside it.  None of them per unit,
    none of them where somebody audits.

    THE DIRECTORY IS KEYED ON THE EQUIPMENT, WITH THE UNIT AS ITS PARENT.
    The constitution is explicit that a flowsheet unit is a MATHEMATICAL
    operation while design equipment is a PHYSICAL object, and that one unit
    may realise MANY items (a column model -> shell + condenser + reboiler +
    reflux drum + pumps).  The implemented pipeline is 1:1 today.  So the
    SHAPE is 1:N with N = 1: every unit directory has exactly one child now,
    and the day a column yields five, the directory gains siblings and
    nothing above it changes.  That honours the rule without inventing the
    `system/designDict` mapping it names, which has no reader anywhere.

    EMPTY IS NOT A SECTOR CALLED "root".  A flat case gains no sector level
    at all -- not a directory named `root`, not an empty one.  Inventing a
    level for a hierarchy that is not there would make every flat case's
    output differ for a structure it does not have.

    IT IS A PHOTOGRAPH, NOT A SEAM.  The whole tree is removed and rewritten
    on every run, exactly as `converged/` is.  Nothing reads it back today,
    and that is not a defect: the value is that a human can open one file and
    defend the number.  A machine-written file regenerated whole each run
    cannot drift from what produced it, which is why this is not a second
    home for a derived fact -- the arity doctrine binds AUTHORED inputs, and
    the line it draws is authored versus machine-written.

    IT IS WRITTEN AS A DICTIONARY, not a CSV, and the grammar is Choupo's own
    -- named units (`41.7 m3`), `keyword value;`, sub-dicts.  Nothing reads
    it back yet; writing it in a readable grammar is what makes the day it IS
    read cheap.  This is OpenFOAM's property: a field that is written is a
    field that can be read.

    THE FORM IS FIXED; THE CONTENT OF `sizing {}` IS THE EQUIPMENT TYPE'S OWN.
    Header, `inlets {}`, `outlets {}`, `sizing {}`, `cost {}` -- always those,
    always in that order.  What is INSIDE `sizing {}` is whatever the
    registered `EquipmentSize` subclass computed, each value carrying the unit
    that sizer declared.  A new sizer writes its own keys with its own units
    and NO reader changes -- the `boundaryField { patch { type ...; } }`
    pattern, where the file's shape is fixed and the block's content is chosen
    by a registered type.

    A VALUE WITH NO DECLARED UNIT IS REFUSED BY NAME.  Not printed bare, not
    given a plausible default: a default would be the hand-written printing
    table this project has just finished deleting, one indirection further
    away.  Every shipped sizer declares its units; the refusal exists so the
    day one does not, it is said at once and by name.

    THE PORT ROLES COME FROM `core/PortRoles.H`, the same home the per-instant
    `byUnit/<unit>/ports` dict reads.  The two files are different documents
    answering different questions -- that one is an index into a shared
    face-flux field, this one is a specification sheet carrying state -- but
    "is this stream a feed?" is ONE fact and has ONE home.

\*---------------------------------------------------------------------------*/

#ifndef Choupo_DesignSheetWriter_H
#define Choupo_DesignSheetWriter_H

#include "result/SimulationResult.H"
#include "thermo/ThermoPackage.H"

#include <map>
#include <string>

namespace Choupo
{

namespace DesignSheetWriter
{

//  Write the whole `design/` tree for `result`, under `caseRoot`.
//
//  A no-op when `result.sizings` is empty (no sizing pass ran): a case that
//  sized nothing gets no directory, so an empty `design/` can never be read
//  as "sized, and everything came out zero".  An existing tree is REMOVED
//  first -- stale sheets from a previous topology must never linger beside
//  fresh ones.
//
//  `thermo` is the case's package -- needed because a port's MASS FLOW is
//  `StreamMass::F_massTotal`, the FLUID mass PLUS the crystals, and not
//  `F * Sigma z_i MW_i`.  The first draft of this writer computed the latter
//  by hand and printed it as `mdot`; on a crystalliser slurry that silently
//  omits the solid (measured: 437 kg/h short on ChemicalPlantTutorial's
//  Magma stream, while the unit's own balance closed at 100.0000 %).  That
//  is the flash21 defect Vitor reported on 2026-08-09, repeated in a new
//  surface -- which is what `StreamMass.H` exists to stop, and its header
//  says in as many words that balance and stream-table surfaces call the
//  total.  A specification sheet is one of those surfaces.
//
//  Returns the number of sheets written.  Throws, naming the key and the
//  unit, if a sizing value reaches here with no declared unit.
std::size_t write(const std::string&                       caseRoot,
                  const SimulationResult&                  result,
                  const ThermoPackage&                     thermo,
                  int                                      verbosity);

} // namespace DesignSheetWriter
} // namespace Choupo

#endif

// ************************************************************************* //
