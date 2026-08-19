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
Function
    Choupo::resolveEffectiveDiffusivity

    WHERE D_eff COMES FROM -- ONE home for the decision, because it is a
    DECISION and the arity doctrine covers decisions, not only values.

    The ruling is `docs/design/where-the-catalyst-pellet-lives.md` (2026-08-18)
    and this file implements it verbatim.  Two routes exist and no third:

      ROUTE 1, MEASURED.  A real datum from a real experiment, filed as PAIR
      data at `parameters/diffusion/effective/<catalyst>/<species>.dat`.  The
      derivation cannot produce this, which is why the home exists.

      ROUTE 2, DERIVED, and it is the ORDINARY case:

          D_eff = (epsilon_p / tau) * D_molecular

      `epsilon_p` and `tau` are intrinsic to the pellet and live on the asset;
      `D_molecular` is a property of the species in the fluid and comes from
      the case's own declared `transport { diffusivity {} }` model.  So in the
      normal case NOTHING is stored anywhere: *the tree never stores a
      derivative.*  The value is derived where it is used and ANNOUNCED with
      the rule that produced it, exactly as `EdwardsCatalogue` announces each
      of its five estimation rules instead of writing them to disk.

    WHEN BOTH ROUTES EXIST the measured value STANDS and the derived one
    becomes a CROSS-CHECK -- the K_f pattern from the ice slice.  A
    disagreement between two independent routes is a FINDING, announced with
    both numbers; it is never a silent override in either direction.

    WHEN NEITHER EXISTS this REFUSES, and the refusal names WHICH route was
    attempted and what it lacked.  There is no default tortuosity: a
    tortuosity is conventionally 2-7, the choice moves eta by a factor of
    three, and picking one would invent the answer the student came to
    compute.  (A generic remedy stapled to a specific diagnosis contradicts
    it -- the reference-rung lesson, one field over.)

    WHAT THIS DOES NOT MODEL, said here rather than discovered later:

      * KNUDSEN diffusion.  In pores comparable with the mean free path the
        molecule collides with the wall more often than with another molecule,
        and the bulk D_molecular over-states the transport.  The derivation
        above is the BULK route alone; it is announced as such, and a case
        that needs the Knudsen or the combined (Bosanquet) route must supply a
        measured D_eff.  The engine does not decide which regime the reader is
        in -- it says what it used.
      * Any temperature dependence of a MEASURED D_eff.  The record carries
        one value at one stated temperature; using it elsewhere is announced,
        never silently corrected by a correlation nobody declared.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Types.H"

#include <string>

namespace Choupo {

class Catalyst;
class ThermoPackage;

//  What the caller must state about the fluid the species diffuses in.  There
//  is no default medium: a gas binary diffusivity and a liquid one come from
//  different correlations, and guessing which the case meant would be a
//  silent model choice.
struct DiffusionRequest
{
    std::string species;            // the diffusing (reacting) species
    std::string counterDiffusing;   // the binary partner: carrier / solvent
    std::string medium;             // "gas" | "liquid"
    scalar      T_K = 0.0;
    scalar      P_Pa = 0.0;         // gas route only
    std::string locus;              // for every message this raises
};

struct EffectiveDiffusivityResult
{
    scalar      D_eff        = 0.0;   // m2/s -- the value to be used
    scalar      D_molecular  = 0.0;   // m2/s -- 0 when route 2 was unavailable
    scalar      D_eff_derived = 0.0;  // m2/s -- route 2's value, when it ran
    std::string route;                // "measured" | "derived"
    std::string rule;                 // the announced sentence (route + numbers)
    std::string recordPath;           // the measured record, when one was read

    //  Relative |derived - measured| / measured when BOTH routes ran; a
    //  NEGATIVE value means no cross-check was possible, which is different
    //  from a cross-check that agreed and must not be confused with it.
    scalar      crossCheckRelDeviation = -1.0;
};

//  Resolve, announce (AdvisoryLog + the run log at `verbosity >= 2`), and
//  return.  Throws with both remedies named when no route exists.
EffectiveDiffusivityResult
resolveEffectiveDiffusivity(const Catalyst&        catalyst,
                            const ThermoPackage&   thermo,
                            const DiffusionRequest& request,
                            int                    verbosity);

} // namespace Choupo
