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
    Choupo::PhaseSplitScan

Description
    THE PHASE SPLIT OF ONE FEED, SWEPT ALONG T OR P (DEV.md 4c C118, stage 1,
    2026-10-20).  At a FIXED overall composition the op sweeps temperature at
    fixed pressure (or pressure at fixed temperature) over a declared grid
    and, at every point, solves the FULL phase split through THE ONE flash
    home -- `IsothermalFlash::solveCore`, with the options the flash unit
    itself reads (`IsothermalFlash::readOptions`) -- under the case's own
    thermophysical system: vapour, one or two liquids, crystallising solids
    declared in `phases ( ... )` (flash21's ice), minerals precipitating from
    a speciated solution (flash16's calcite, flash19's four phases at once).
    The op writes NO equilibrium of its own: a number it publishes is the
    number the `isothermalFlash` unit publishes at the same (T, P, z), and the
    gate holds it to the three steady witnesses' goldens.

    It is the freeze-concentration / formulation lesson Vitor asked for:
    cool an aqueous solution from 0 to -20 C and watch the ice point, the
    liquor concentrating along the freezing-point-depression identity, the pH
    moving where the package speciates, a second solid appearing where a
    record declares one.

    Dictionary form:

        {
            name        freeze;
            type        phaseSplitScan;
            state       { P 1 atm;  composition { water 0.9; ethanol 0.1; } }
            vary        { variable T;  from 273.15 K;  to 253.15 K;  n 21; }
            phaseSet    VL;            // optional: VL (default) | LL | VLLE |
                                       // auto -- the flash unit's own word,
                                       // read by the flash unit's own reader
            output      { file freeze.csv; }
        }

    `state` holds the HELD axis (P when T is swept, T when P is swept) and
    the feed; the swept axis declared there too is REFUSED by name (two homes
    for one number).  `vary` is spelt as propertyScan1D spells it (`n` or
    `step`; absent, 21 points announced).  The composition is in MOLES and is
    normalised, said so when it did not sum to one.

    WHAT IS PUBLISHED, per grid point: the amount (mol per mol of feed) of
    every phase present -- `V`, `L1`, `L2` (labelled with the package's own
    phase names: the declared liquid, `aqueous` / `organic` on the reactive
    path) and each solid BY NAME (the declared SolidPhase, or the mineral
    that owns the precipitate); each phase's composition; the flash's own
    observables (`pH`, `solidFraction`, the crystal's activity `a_<c>` beside
    its closed-form saturation value `aEq_<c>`, the reactive partial
    pressures); the solved species flows where the package speciates; and
    the record-level announcements (a sub-273 K Psat extrapolation, a pair
    used outside its span, Davies outside its band) at the FIRST point that
    raised each.  Between consecutive solved points every phase APPEARANCE
    and DISAPPEARANCE is announced -- the ice point, a second solid, the
    phase set `auto` changing its answer.

    A POINT THE FLASH CANNOT SERVE IS A PUBLISHED FACT, NOT A CRASH.  The
    refusal is recorded by name at that point (a pure feed below its melting
    point under the LIQUID+SOLID set freezes entirely, which that phase set
    does not contain; a solid beside a vapour is the named S4c gap) and the
    scan continues.  There is NO fallback answer at a refused point: its CSV
    row carries `solved 0` and `nan` amounts, never a neighbouring point's
    phases or a single-phase guess.  Only a scan with NO solved point exits
    non-zero.

    OUTPUT.  A CSV the plotter reads (the swept variable first, then
    `solved`, `nPhases`, one amount column per phase name, `x_<phase>_<i>`
    compositions, the flash observables, `n_<species>`), and a top-level
    result block `phaseSplitScans` (points, events, refusals, first-raised
    announcements, what is not modelled) for the Explorer lens.  Every
    number in the block is also a CSV cell or a diagnostic, so the existing
    `csv` and `diag` golden kinds read all of it.

    WHAT THIS SCAN DOES NOT MODEL, said on every run and in the block:
    nucleation and supercooling (every point is the equilibrium ceiling);
    solids other than those a record DECLARES (a SolidPhase in `phases ( )`
    needs the component's `Hfus` and triple point -- sucrose.dat has no Hfus,
    it decomposes before melting, so it cannot crystallise here until it
    carries a solubility solid like halite's `solidPhases {}`); solute
    inclusion in a crystal (ice is pure); the liquid/solid heat-capacity
    term of dG_fus (the record's own announcement).

    NOT the `freezingPoint` op: that one solves T_f(m) for ONE salt against
    ice on the Pitzer surface -- the freezing CURVE; this one solves the
    whole split at each declared state -- what EXISTS at -12 C, and how much.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class PhaseSplitScan : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

    //  The three counts every run publishes, whatever it found.  Nothing
    //  path-dependent is named here (the `first_<phase>` keys exist only for
    //  a phase that was present somewhere), on the phaseEnvelope rule: a
    //  headline naming a key the run did not produce is refused by main.
    std::vector<std::string> headline() const override
    { return { "n_solved", "n_refused", "n_events" }; }

    std::pair<std::string, std::string> resultBlock() const override
    { return { "phaseSplitScans", block_ }; }

private:
    inline static const std::string type_ = "phaseSplitScan";
    std::map<std::string, scalar>   diag_;
    std::string                     block_;   // the JSON object, built by run()
};

} // namespace Choupo
