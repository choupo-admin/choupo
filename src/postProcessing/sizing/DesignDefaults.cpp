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
\*---------------------------------------------------------------------------*/

#include "DesignDefaults.H"
#include "core/Advisory.H"

#include <iomanip>
#include <iostream>
#include <sstream>

namespace Choupo {
namespace designDefault {

//  NOT ONE OF THESE FOUR IS A CURATED DATUM.  Each is a value the sizer has
//  always used, and each `why` says what accepting it commits the reader to
//  -- which is the only claim that can be defended here.  A citation invented
//  for a number that has none turns `unsourced` into `falsely sourced`, which
//  no reader and no gate can detect.
const Assumption corrosionAllow
{
    "corrosionAllow", 0.003, "m",
    "the metal added to the calculated wall for service life; 3 mm is a"
    " general-service figure and a corrosive or erosive duty needs more"
};

const Assumption jointEfficiency
{
    "jointEfficiency", 1.0, "-",
    "the weld joint efficiency E in the ASME thin-wall formula; 1.0 is the"
    " OPTIMISTIC end -- it assumes a fully radiographed joint, and a"
    " spot-examined one is thinner-walled on paper than it may be built"
};

//  ------------------------------------------------------------------------
//  L/D -- TWO ENTRIES, ONE KEY, AND THE DISAGREEMENT IS THE POINT.
//  See the header: reconciling 2.5 with 3.0 moves every un-declared vessel's
//  D, H, t_wall, weight and cost, and is RESERVED for Vitor.  Neither value
//  is changed here.  What changes is that a reader now meets both in one
//  file, and each sizer names the one it asks for.
//  ------------------------------------------------------------------------
const Assumption stirredTankLoverD
{
    "L_over_D", 2.5, "-",
    "the vessel's height/diameter ratio.  This sizer assumes 2.5 and"
    " `VesselSize` assumes 3.0 for the same key -- the two have never been"
    " reconciled, and which is right for THIS vessel is the author's call"
};

const Assumption vesselLoverD
{
    "L_over_D", 3.0, "-",
    "the vessel's height/diameter ratio.  This sizer assumes 3.0 and"
    " `StirredTank` assumes 2.5 for the same key -- the two have never been"
    " reconciled, and which is right for THIS vessel is the author's call"
};

//  ------------------------------------------------------------------------
//  THE COLUMN'S TWO END SPACES.  Like the four above, neither is a curated
//  datum: both are round allowances a designer picks, and the `why` says what
//  accepting them commits the reader to rather than pretending to a source.
//  ------------------------------------------------------------------------
const Assumption columnDisengagement
{
    "disengagementHeight", 1.2, "m",
    "the vapour space between the top tray and the tower head, where the"
    " entrained droplets fall back.  It buys nothing in the MESH solution and"
    " everything in a real tower; too little of it carries liquid into the"
    " condenser"
};

const Assumption columnSump
{
    "sumpHeight", 1.5, "m",
    "the liquid sump below the bottom tray, which sets the reboiler's"
    " suction inventory and the surge the bottoms pump sees.  A short"
    " residence time here is what makes a column's level control difficult"
};

//  ------------------------------------------------------------------------
//  THE RELIEF VALVE (2026-10-11, DEV.md 4c C62).  The preliminary-sizing
//  values the open `fluids` implementation of API 520 Part I carries as its
//  defaults (fluids/safety_valve.py, MIT licence; API 520 itself was NOT
//  read).  A CITED default is still a default: the certified coefficient of
//  the valve actually bought replaces each of them.
//  ------------------------------------------------------------------------
const Assumption reliefKdVapour
{
    "KdVapour", 0.975, "-",
    "the effective discharge coefficient of a gas or vapour relief valve for"
    " preliminary sizing (API 520 Part I as the open `fluids` library carries"
    " it); the certified coefficient of the valve bought replaces it, and a"
    " rupture disc upstream lowers it"
};

const Assumption reliefKdLiquid
{
    "KdLiquid", 0.65, "-",
    "the effective discharge coefficient of a liquid relief valve for"
    " preliminary sizing (API 520 Part I as `fluids` carries it); the"
    " certified coefficient of the valve bought replaces it"
};

const Assumption reliefKb
{
    "Kb", 1.0, "-",
    "the back-pressure correction of a gas relief valve: 1 is a conventional"
    " valve discharging against a back pressure low enough not to reduce its"
    " capacity -- a balanced-bellows valve against a high one takes less"
};

const Assumption reliefKc
{
    "Kc", 1.0, "-",
    "the combination correction: 1 means no rupture disc upstream of the"
    " valve (an uncertified disc-valve combination takes 0.9)"
};

const Assumption reliefKw
{
    "Kw", 1.0, "-",
    "the back-pressure correction of a liquid relief valve: 1 is a"
    " conventional valve, and `fluids` returns 1 for a balanced one below 15 %"
    " gauge back pressure"
};

const Assumption reliefKv
{
    "Kv", 1.0, "-",
    "the viscosity correction of a liquid relief valve: 1 neglects viscosity,"
    " which `fluids` quotes API 520 10th ed. as recommending below 0.1 Pa.s;"
    " a viscous liquid needs the Reynolds-number correction"
};

const Assumption reliefBackPressure
{
    "backPressure", 0.0, "Pa",
    "the GAUGE pressure at the valve outlet while it relieves (declare it"
    " with its unit, e.g. `backPressure 0.5 bar;`): 0 is a"
    " discharge to atmosphere with no built-up back pressure.  A valve"
    " discharging into a flare header sees more, which can make the flow"
    " subcritical and the valve larger"
};

scalar valueOr(const DictPtr&     designRules,
               const Assumption&  a,
               const std::string& equipment,
               const std::string& unitName,
               EquipmentSizing&   d)
{
    //  A DECLARED VALUE ANNOUNCES NOTHING.  Silence has to keep meaning
    //  "nothing was assumed", so this path is byte-identical to what the
    //  sizer did before this file existed.
    if (designRules && designRules->found(a.key))
        return designRules->lookupScalar(a.key);

    d.assume(a.key);

    //  THE NUMBER IN ITS OWN FORMAT.  `std::cout` carries whatever precision
    //  the last printer left on it -- the costing table sets `std::fixed`
    //  with 0 decimals -- and a 0.003 m allowance rendered under that reads
    //  `0`, which is a claim rather than a value.  Built on its own stream.
    std::ostringstream v;
    v << std::defaultfloat << std::setprecision(6) << a.value;

    std::ostringstream m;
    m << a.key << " was NOT declared in this unit's `designRules {}`: the"
         " size below was computed with the engine's built-in default "
      << v.str();
    if (a.unit && *a.unit && std::string(a.unit) != "-") m << " " << a.unit;
    m << " -- " << a.why << ".  Declare `" << a.key << " " << v.str()
      << ";` (or your own value) to make it the author's choice rather than"
         " the engine's assumption.";

    //  PRINTED ONCE, gated on the sink's own dedup verdict -- the documented
    //  convention in `core/Advisory.H`.  A sizing pass under an `outerDict`
    //  runs once per sweep point, and a sentence repeated forty times is one
    //  the reader stops seeing, which is the failure the end-of-run caveat
    //  block exists to prevent.
    if (AdvisoryLog::instance().add("assumed", "warning",
                                    equipment + " '" + unitName + "'", m.str()))
        std::cout << "  [assumed] " << equipment << " '" << unitName << "': "
                  << m.str() << "\n";
    return a.value;
}

} // namespace designDefault
} // namespace Choupo

// ************************************************************************* //
