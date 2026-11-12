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
    Choupo::propertyRouteBench

Description
    THE CHARACTERISATION BENCH of the liquid-property routes (DEV.md 4c C378,
    slice 0, step 1; docs/design/thermophysical-slice0-plan.md section 5;
    the numerical review's TR-16).

    Slice 0 puts one door in front of the package's liquid-property methods
    and must move no number.  A golden cannot prove that: no stream table
    prints a density, and most routes are exercised by no case.  So, BEFORE
    the engine is edited, this bench calls the package's PUBLIC methods
    (`density`, `viscosityLiquid`, `surfaceTension`, `diffusivityLiquid`)
    for every component record in data/standards/components and every
    route the kernel has today, over a fixed grid of states, and writes
    every answer: the value as a hexfloat (bit for bit), or the FULL refusal
    message.  The gate bin/curate/check_property_route_bench.py hashes each
    (record, property) block and compares with the tracked hashes, so a
    moved record is NAMED.

    The routes are DISCOVERED, not listed here: the registered model and
    mixing-rule names are read from the factories' own refusal of an
    unknown name ("Registered: ..."), the reference equations from the
    records in data/standards/parameters/Helmholtz/.  A route added to the
    engine therefore appears in the bench, and in its hashes, by itself.

    It touches no property routine: it is an APPLICATION that assembles
    packages through ThermoPackageBuilder from in-memory dictionaries, as a
    case does.  No factory name is registered (it is a flag of choupoProps,
    not a props operation).

    Determinism: no threads; LC_NUMERIC is "C" while it runs; the data root
    is replaced by `<data>` in every message; the package's announcements
    (to std::cout) are discarded while it evaluates, and the package's
    once-per-process announcement flags change no value.
\*---------------------------------------------------------------------------*/

#pragma once

#include <string>

namespace Choupo {
namespace propertyRouteBench {

//  Run the bench described by `manifestPath`, writing the full output to
//  `outPath` (its directory is created).  Returns the process exit code.
//  The working directory is changed to the output directory for the run,
//  so no case-local constant/ can overlay a catalogue record.
int run(const std::string& manifestPath, const std::string& outPath);

} // namespace propertyRouteBench
} // namespace Choupo
