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
    Choupo::Controller

Description
    Abstract base for a process controller in the dynamic continuous
    binary.  A controller:

      * reads a Controlled Variable (CV) from a DynamicUnitOperation
        (the "measurement" port);
      * computes a control action;
      * writes a Manipulated Variable (MV) into a DynamicUnitOperation
        (the "actuator" port).

    The base does not prescribe the algorithm --- concrete classes
    (e.g. PIDController) own the math.  The controller object owns
    pointers to its CV-source and MV-sink units (both can be the same
    unit, e.g. a CSTR with internal jacket control).

    Explicit factory, same as every other base in the project.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "unitOperations/dynamic/DynamicUnitOperation.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Controller
{
public:
    virtual ~Controller() = default;

    virtual const std::string& type() const = 0;
    virtual const std::string& name() const { return name_; }

    // Bind the controller to its unit(s) and parse the controller-
    // specific tuning parameters from `ctrlDict`.  Two named-unit
    // lookups are typical:
    //   measurement.unit / measurement.cv
    //   actuator.unit / actuator.mv
    // The host application is expected to provide a resolver function
    // from unit name to pointer; this keeps the base agnostic of how
    // the application stores its unit objects.
    using UnitResolver = std::function<DynamicUnitOperation*(const std::string&)>;

    virtual void initialise(const DictPtr&     ctrlDict,
                            const UnitResolver& resolveUnit) = 0;

    // Compute one control step: read CV, compute u, write MV.
    virtual void update(scalar t, scalar dt) = 0;

    // Diagnostic: most recent CV reading + MV value (for trajectory CSV).
    virtual scalar lastCV() const = 0;
    virtual scalar lastMV() const = 0;
    virtual scalar setpoint() const = 0;

    // ---- Factory (explicit registry) ----
    using Factory = std::function<std::unique_ptr<Controller>()>;

    static void                            registerType(const std::string& name, Factory f);
    static std::unique_ptr<Controller>     New(const std::string& type);
    static void                            registerBuiltins();
    static std::vector<std::string>        availableTypes();

    void setName(const std::string& nm) { name_ = nm; }

protected:
    std::string name_;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
