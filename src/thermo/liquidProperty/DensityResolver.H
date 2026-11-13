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
Namespace
    Choupo::liquidProperty (the resolver)

Description
    WHICH METHOD PRICES A LIQUID'S DENSITY: CHOSEN ONCE PER CONSTITUENT SET,
    BY FACTS, AND NEVER HANDED OVER (DEV.md 4c C378 pilot, rulings 3 and
    the plan's section 2).

    The constituent set is the components with x > 0 in the request (one
    definition of "present" in the kernel; the review's PP-08).  The method
    is resolved at the set's FIRST request and frozen for the run: the
    choice is a function of the set and of the data the case and the
    catalogue hold, never of T, P or the amounts -- no state switch.
    Precedence, the routes record's rule 4:

      (1) a measurement the case marks for use (later step);
      (2b) a record law for exactly the set: for ONE constituent, the case's
           `pureFluids` selection, else a reference equation that names it;
           for two or more, a solution record (later step);
      (3) `idealMixing`, one leaf per constituent: `pureFluid` (the case's
           selection) > `referenceEquation` > the record's volume route >
           `massWithoutVolume` (only when declared, later step); a declared
           Henry solute has no pure-liquid leaf;
      (5) refusal, naming every method passed over and why, and the remedy.

    A resolution is kept per (package identity, set) for the run (a new run
    is known by PropertySourceLog::generation(); the identity is the
    package's components and pure-fluid selections).  A package met for the
    first time (another pass of an outer driver builds its own) resolves its
    sets again, and a set that resolves to a DIFFERENT method than it did
    earlier in the run is refused (TR-15): the varied parameter changed which
    data exist, which the run cannot hide.
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityMethod.H"

#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {

//  A resolution is a RECIPE (which registered method, over which leaves, on
//  which record), not an object bound to one package: the objects are built
//  from it on each request (build() below), so a package destroyed between
//  two passes leaves nothing dangling.
struct DensityResolution
{
    std::vector<std::size_t> set;          // component indices, ascending
    std::string              setName;      // "{ethanol, NaCl, water}"
    std::string              method;       // the registered name ("idealMixing")
    std::vector<std::string> parts;        // a composite's leaves, one per constituent
    std::string              record;       // the record a direct method reads ("" when none)
    std::string              methodId;     // the id the method gives itself
    std::vector<std::string> passedOver;   // "method: reason"
};

//  Resolve (or return the run's resolution of) the set present in `x`.
//  Throws PropertyDomainError (missingDatum) when no method applies.
DensityResolution resolveDensity(const ThermoPackage& thermo, const sVector& x);

//  The method object of a resolution, bound to `thermo`.
std::shared_ptr<const DensityMethod> build(const DensityResolution& r, const ThermoPackage& thermo);

//  Every resolution of the run, in the order first met (for the table).
std::vector<DensityResolution> densityResolutionsOfRun();

//  "{ethanol, NaCl, water}" and "ethanol-NaCl-water": the set's names,
//  sorted case-insensitively (the solution records' file names).
std::string setDisplayName(const ThermoPackage& thermo, const std::vector<std::size_t>& set);
std::string setFileName(const ThermoPackage& thermo, const std::vector<std::size_t>& set);

} // namespace liquidProperty
} // namespace Choupo
