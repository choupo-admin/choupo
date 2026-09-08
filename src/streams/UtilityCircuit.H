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
File
    src/streams/UtilityCircuit.H

Description
    A case may DECLARE that two of its boundary streams are the supply and
    the return of an auxiliary CIRCUIT -- cooling water, a hot-oil loop, a
    refrigerant -- rather than process material.  This header is the ONE home
    of that declaration: the grammar, the refusals, and the set of stream
    names a presented process balance leaves out.

    THE LOAD-BEARING INVARIANT.  The separation is PRESENTATION, never
    VALIDATION SCOPE.  Excluding a utility from the *presented* process
    balance must NEVER exclude it from a physical check: the per-unit
    balances, the element balance, the energy balance and every explicitly
    modelled material boundary keep covering ALL streams, utilities included.
    ONLY the plant-level material SUMMARY gains a second scope.  A reader who
    finds this file being used to skip a stream anywhere else is looking at a
    defect.

    WHY IT EXISTS, measured.  `tutorials/plant/ammonia02_full_plant` models
    its cooling water as an explicit process stream, and the cooling water is
    then 99.2 % of the mass in the plant's own material balance: the real
    process material is 70 637 kg/h against a reported total of 9 078 137,
    a dilution factor of 128, so a 1 % loss of syngas reads as 0.008 % --
    invisible at the four decimals the report prints.  The 100.0000 % that
    plant published passed by DILUTION, not by conservation.  The same plant
    treats its other three utilities (steam, electricity, refrigerant) as
    ALLOCATED duties, outside the material balance entirely: one plant, two
    conventions, and the noisier one won.

    THE CRITERION IS "TRANSFERS MATTER ACROSS THE PROCESS BOUNDARY", never
    "contacts the process".  The first is checkable -- from the topology and
    from conservation, both of which this file checks -- and the second is
    rhetoric that would have to be taken on the author's word.

    WHY THE DECLARATION LIVES IN `flowsheetDict` and nowhere else.  It is
    TOPOLOGY: WHICH EDGES form an auxiliary circuit.  It is not state, so it
    does not belong in `0/<stream>` (those files are rewritten in
    `converged/`, and a role that is rewritten by a solve is not a role); and
    it is not a port property, because a stream is an EDGE and declaring its
    role at ONE endpoint is exactly the producer rule this project replaced
    on 2026-09-07.

    WHAT A `reason` WOULD HAVE BEEN, and why there is only an optional
    `note`.  A first draft required a free-text `reason`, by analogy with the
    Hermia blocking laws in the membrane module.  The analogy is FALSE and is
    recorded as such: Hermia's `reason` states a MECHANISM the engine cannot
    verify (a deposited cake or a covered pore -- only the author knows), so
    prose is the only evidence available.  Here the claim IS verifiable, and
    this file verifies it.  Mandatory prose where verification exists is
    friction, not rigour.

    CONSERVATION ACROSS THE PAIR IS NECESSARY AND NOT SUFFICIENT, and it is
    NOT a universal law of utilities: a cooling tower with makeup,
    evaporation, drift and blowdown is a perfectly legitimate plant and does
    NOT conserve across two streams.  So when the pair fails to conserve, the
    refusal says the two-stream closed-circuit DECLARATION is false and names
    the streams to model -- never that the plant leaks.  The error is in the
    declaration.

\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/FlatUnit.H"
#include "core/Types.H"
#include "streams/ProcessStream.H"
#include "thermo/ThermoPackage.H"

#include <map>
#include <set>
#include <string>
#include <vector>

namespace Choupo {

//- ONE declared auxiliary circuit: the pair of boundary streams that carry
//  it, the catalogue service it renders, and an optional note.
struct UtilityCircuit
{
    std::string name;      // the circuit's own name, the author's word (CW1)
    std::string service;   // a record in data/standards/utilities/
    std::string supply;    // the stream entering the plant
    std::string ret;       // the stream leaving it (`return` is a keyword)
    std::string note;      // OPTIONAL free text; never required, never parsed
};

namespace utilityCircuits {

//- Component-wise conservation across the declared pair, RELATIVE to the
//  larger of the two sides.  It is a tolerance and not a physical band: the
//  two sides of a closed circuit are the same matter, so what is being
//  allowed for is the recycle tear's own convergence and the stream files'
//  rounding, exactly as the mass-balance report's band is.
constexpr scalar kConservationRelTol = 1.0e-6;

//- Parse the root flowsheetDict's `utilities ( ... )` block.  Returns an
//  empty vector when the block is absent -- and a case with no block is
//  BYTE-IDENTICAL to one built before this existed.
//
//  Refuses here: a missing required key, `supply` == `return`, a stream
//  named by two circuits, and a `service` word that is not a record in the
//  utility catalogue (through `registryRefusal::message`, the ONE home of
//  that sentence) -- unless NO catalogue is loaded at all, in which case the
//  word is ANNOUNCED as unchecked rather than refused: an empty registry is
//  not evidence about a name (a tool that could not look must not report what
//  it did not see, 2026-09-06).
std::vector<UtilityCircuit> read(const DictPtr& flowsheetDict);

//- Refuse a declaration the TOPOLOGY contradicts: a stream that does not
//  exist in the graph, a `supply` that is not a plant boundary INLET, a
//  `return` that is not a plant boundary OUTLET, and a pair whose two ends
//  are not the SAME unit's utility side (see the .cpp for why that last one
//  is a statement about the declaration and not about the plant).
void validateTopology(const std::vector<UtilityCircuit>& circuits,
                      const std::vector<FlatUnit>&       topology);

//- Refuse a declaration the SOLUTION contradicts: the pair must conserve
//  component-wise.  Called with the converged stream registry.
void validateConservation(const std::vector<UtilityCircuit>&       circuits,
                          const std::map<std::string, ProcessStream>& streams,
                          const ThermoPackage&                     thermo);

//- The stream names a PRESENTED process balance leaves out.  Nothing else
//  may use this to skip a stream -- see the invariant at the top.
std::set<std::string> excludedStreams(const std::vector<UtilityCircuit>& circuits);

//- Which declared circuit a unit's utility side belongs to, keyed by unit
//  name -- for the utility report, so a circuit served by an explicit stream
//  is listed there instead of being invisible.  Empty when nothing is
//  declared.  Derived from the topology, never from a name.
//
//  BY VALUE, and the first version was not: it returned pointers INTO the
//  caller's vector, and the caller wrote
//  `servedUnits(read(dict), topology)` -- a temporary that dies at the end of
//  the full expression, so every pointer dangled and the flagship crashed in
//  `basic_string::_M_create`.  The same lesson the Edwards ActivityResult
//  paid for on 2026-08-04: a result that outlives the frame that made it must
//  be SELF-CONTAINED.
std::map<std::string, UtilityCircuit>
servedUnits(const std::vector<UtilityCircuit>& circuits,
            const std::vector<FlatUnit>&       topology);

} // namespace utilityCircuits
} // namespace Choupo
