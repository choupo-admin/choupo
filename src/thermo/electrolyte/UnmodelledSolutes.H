/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vitor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    SPDX-License-Identifier: GPL-3.0-or-later

Description
    WHAT IS DISSOLVED THAT THE ELECTROLYTE MODEL DOES NOT REPRESENT.

    The salt-level electrolyte models in this project are SINGLE-SALT: Pitzer
    and eNRTL here carry the binary cation-anion parameters of ONE salt in
    ONE solvent, regressed on that system.  A real liquor is under no such
    obligation.  Concentrate a brine that also carries sugar, crystallise
    potassium chloride out of a wine lee that still holds bitartrate, and the
    model is being asked about a solution it has never seen.

    Every consequence of that is quiet.  The activity coefficient comes back,
    the water activity comes back, the saturation solves; nothing is NaN and
    nothing is out of range.  The only visible sign is that the answer is
    the answer for a different liquid.

    So the fact is computed here, once, and both the evaporator and the
    crystallisation saturation state it in the same words.  It is a
    MEASUREMENT, not a declaration: no case says "these are spectators" (a
    vocabulary this project rejected on purpose) -- the composition says what
    is dissolved and the package says what it models, and the difference is
    arithmetic.

    What it is NOT: a refusal.  Ignoring a co-solute is often the right
    engineering call and always the only available one when no ternary
    parameters exist.  The contract is that the run says which liquid the
    numbers belong to.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <cstddef>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

struct UnmodelledSolutes
{
    //- Molality of everything dissolved that is neither the solvent(s) nor
    //  the model's own salt  [mol / kg solvent].
    scalar molality = 0.0;
    //- Their component names, in package order.
    std::vector<std::string> names;

    bool any() const { return !names.empty(); }

    //- The sentence a unit prints.  `whatIsAffected` names the quantity the
    //  omission reaches ("the boiling-point rise", "the saturation"), so the
    //  shared text still says something specific at each site.
    std::string note(const std::string& saltName,
                     const std::string& whatIsAffected) const;
};

//- Measure them.  `x` is the LIQUID composition (mole fractions or flows --
//  only ratios are used); `solventIdx` lists the components whose mass is the
//  molality basis (the solvent, plus an antisolvent when the caller works in a
//  mixed solvent); `iSalt` is the model's own salt.
UnmodelledSolutes unmodelledSolutes(const ThermoPackage&            thermo,
                                    const sVector&                  x,
                                    const std::vector<std::size_t>& solventIdx,
                                    std::size_t                     iSalt);

} // namespace Choupo
