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
    Choupo::PropertyOperation

Description
    Abstract base for a *property service operation* --- the thing
    choupoProps runs.  Unlike `UnitOperation` (which has streams in,
    streams out and KPIs), a property operation has:

      * a `state` block --- one or more reference compositions / T / P
      * a `properties` list --- which functions to evaluate
      * an `output` block --- where the result lands (stdout, CSV, JSON)

    Concrete subclasses:

      * propertyPoint   :  evaluate at a single (T, P, x)
      * propertyScan1D  :  vary one of T / P / x_i over a range
      * propertyScan2D  :  vary two of T / P / x_i over a grid
      * fitParameters   :  LM regression against a dataset

    The factory is explicit (no auto-registration), in keeping with the
    rest of Choupo.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>

namespace Choupo {

class ThermoPackage;
class Database;

class PropertyOperation
{
public:
    virtual ~PropertyOperation() = default;

    // Identifies the concrete subtype ("propertyPoint",...).
    virtual const std::string& type() const = 0;

    // Run the operation against the supplied thermoPackage at the given
    // verbosity level.  Returns 0 on success, non-zero on failure.  The
    // op's own dict (`dict`) carries the state, properties list, range,
    // dataset, output blocks --- whatever the concrete type expects.
    virtual int run(const DictPtr& dict,
                    const ThermoPackage& thermo,
                    int verbosity) = 0;

    // Diagnostic numbers for the run, returned via JSON like unit KPIs.
    // Concrete classes populate as appropriate (e.g. "n_points", "fit_chisq").
    virtual std::map<std::string, scalar> diagnostics() const { return {}; }

    // The op's OWN ranking of its answer: which diagnostic keys are the
    // headline (shown first / emphasised in the GUI's Results epilogue).
    // Default empty = no ranking, every diagnostic shown equally.  Keys the
    // run did not produce are simply ignored downstream.
    virtual std::vector<std::string> headline() const { return {}; }

    // Optional setters used by ops that need to RE-BUILD the thermoPackage
    // each iteration (e.g. `fitParameters` mutates pair coefficients and
    // needs to re-construct ThermoPackage with the new values).  Ops that
    // don't need these can safely ignore them.
    void setThermoDict(const DictPtr& d) { thermoDict_ = d; }
    void setDatabase(const Database* db) { database_ = db; }
    DictPtr        thermoDict() const { return thermoDict_; }
    const Database* database()  const { return database_;   }

    using Factory = std::function<std::unique_ptr<PropertyOperation>()>;
    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<PropertyOperation> New(const std::string& name);
    static void registerBuiltins();
    static std::vector<std::string> availableTypes();

protected:
    /** Build a per-operation ThermoPackage when the op dict carries a
     *  `thermo {}` override block; returns null when there is no
     *  override (caller must then use the global thermo).  Mirrors
     *  Flowsheet::thermoFor.  Components stay global; the override may
     *  replace activityModel / equationOfState / vaporPressure /
     *  transport sub-blocks. */
    std::unique_ptr<ThermoPackage> thermoForOp(const DictPtr& opDict) const;

private:
    static std::map<std::string, Factory>& registry();

    DictPtr         thermoDict_;
    const Database* database_ = nullptr;
};

} // namespace Choupo
