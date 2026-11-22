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
Namespace
    Choupo::kineticsLibrary

Description
    THE GAS-PHASE REACTION LIBRARY (DEV.md 4c C458, second half; the home of
    elementary reactions, built like the binary-pair catalogues).

    ONE RECORD PER REACTION under data/standards/kinetics/ (`recordType
    elementaryReaction`), in the grammar a case's constant/reactions already
    uses (stoichiometry, kinetics { type modifiedArrhenius | thirdBody |
    falloff | plog ... }), plus a `source` block (citation, table, page) and
    `sets { <set> <label>; }`.

    IDENTITY is the CANONICAL EQUATION: the species sorted within each side
    (a species of coefficient 2 repeated), the reversible reaction oriented
    so the lexicographically smaller side comes first (reverse = the same
    reaction), `+M` and `(+M)` as distinct suffixes of each side.  The file
    stem IS that string:

        H+O2=O+OH      H+H+M=H2+M      H+O2(+M)=HO2(+M)      H+O2~O+OH
                                                         (irreversible: `~`,
                                                          as written)

    and a summed DUPLICATE (CHEMKIN DUPLICATE) carries `@1`, `@2`.  The
    mechanism's own label (R1, A12) is the record's alias WITHIN a set.
    ORDERS are derived (= -nu of a reactant, 0 for a product) and refused on
    an elementary record; a record marked `global true;` declares them.

    A case asks a set by name in its constant/reactions:

        reactionSet  OConaire2004;              // or  reactionSets ( A B );
        reactionRecords ( { record "H+O2=O+OH"; name myR1; } );

    and `materialise` returns the dictionary the case would have written
    inline, entry for entry, so every unit reads it unchanged.  PRECEDENCE,
    as for a binary pair: the case's constant/kinetics/, then
    data/standards/kinetics/, then data/local/kinetics/ (announced UNVERIFIED).

    A mixture of sets is announced, neutrally; a WARNING only when a record
    marked `optimisedWithin X` is used outside X.  One thermochemistry per
    run: a set declares the thermochemistry it was made with (`kinetics/sets/<name>`, block `thermochemistry`),
    and where the run's differs the K_c difference is printed per reaction.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <cstddef>
#include <ostream>
#include <set>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace kineticsLibrary {

//- The canonical stem of a reaction.  `nu` is (species, signed integer
//  coefficient); `form` is "", "+M" or "(+M)"; `reversible` false gives `~`.
//  Throws on a non-integer or zero coefficient.
std::string canonicalStem(const std::vector<std::pair<std::string, double>>& nu,
                          const std::string& form, bool reversible,
                          int duplicate = 0);

//- Does this dictionary ask the library (reactionSet / reactionSets /
//  reactionRecords)?
bool asksLibrary(const DictPtr& reactionsDict);

//- The dictionary a case's constant/reactions stands for: the inline entries
//  plus every record the case asked for, written as an inline entry.  The
//  SAME pointer when the case asks nothing (nothing is copied, nothing is
//  printed).  The efficiencies of a collider the run does not carry (by name or
//  alias) are dropped and announced; one named by an alias is written by its name.
DictPtr materialise(const DictPtr& reactionsDict, const ThermoPackage& thermo);

//- Where an entry that materialise built came from; null for an inline one.
struct Origin
{
    std::string set;      // the set it was asked through ("" when by record)
    std::string label;    // the entry name in the case
    std::string stem;     // the record's canonical stem
    std::string tier;     // case | standards | local
    DictPtr     setDict;  // the set's record (may be null)
};
const Origin* originOf(const Dictionary* entry);

//- (e) K_c(set thermo) / K_c(run thermo) per reaction at T, for every entry
//  of `entries` that came from a set whose declared thermo is a catalogue
//  home; the sentence only when the set's thermo is a citation.  Silent for
//  inline entries.
void announceThermoDifference(const ThermoPackage& thermo,
                              const std::vector<DictPtr>& entries,
                              scalar T, std::ostream& os);

//- (f) One reaction as the reverse check sees it.
struct LegProbe
{
    std::string              name;
    std::vector<std::size_t> comps;     // species indices
    std::vector<double>      nu;        // signed coefficients, same order
    double                   kf = 0;    // forward constant at T (kmol, m3, s)
    bool                     reversible = false;   // reverse from detailed balance
    bool                     hasKr = false;        // an explicit reverse constant
    double                   kr = 0;               // ... at T
    bool                     massAction = true;    // orders = stoichiometry
    bool                     plainForm = false;    // k is a plain A T^b exp(-Ea/RT)
};

//- (f) k_f/k_r against K_c(T) for every explicit reverse: a leg with its own
//  `A_rev`/`Ea_rev`, and a pair of irreversible entries whose stoichiometries
//  are each other's reverse.  Prints nothing when there is none.
void announceReverseConsistency(const ThermoPackage& thermo,
                                const std::vector<LegProbe>& legs,
                                scalar T, std::ostream& os);

} // namespace kineticsLibrary
} // namespace Choupo
