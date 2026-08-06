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
    Choupo::VaporPressureModel

Description
    Abstract base for pure-component vapour-pressure models  P_i^sat(T).
    Concrete models (Antoine, ExtendedAntoine, DIPPR101,...) register
    themselves through `VaporPressureModel::registerModel(name, factory)`.

    Selected at run-time via the dictionary entry

        vaporPressure
        {
            model           Antoine;          // factory key
            coefficients    (A B C);
            Trange          (Tmin Tmax);
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <utility>

namespace Choupo {

class VaporPressureModel
{
public:
    virtual ~VaporPressureModel() = default;

    // Saturation pressure in Pa at temperature T [K] (canonical SI
    //; was bar in earlier editions).
    //
    //  NON-VIRTUAL ON PURPOSE (2026-08-06).  Every model must declare a
    //  validity `range()`, every one of the 108 `vaporPressure {}` blocks in
    //  the catalogue declares a `Trange` -- and until this day NOTHING IN THE
    //  TREE EVER CALLED `range()`.  Not one temperature was ever compared
    //  against one of those windows, on the correlation behind every K-value,
    //  every flash and every column stage.
    //
    //  Putting the comparison inside each model would be the SAME defect one
    //  layer down: `Antoine` parsed `Tmin_`/`Tmax_` into members and never
    //  read them, exactly as `PolynomialCp` had until AP3.  A rule each
    //  implementer must remember is a rule that will be forgotten.  So the
    //  base owns it -- one place derives the check from the `range()` every
    //  model already supplies, and a NEW model gets it without writing a line.
    //  (OpenFOAM's shape: `gStd(T)` is an interface function, and `K` follows
    //  from it once for every combination of models.)
    scalar Psat_Pa(scalar T_K) const
    {
        noteRange(T_K);
        return computePsat(T_K);
    }

    // Temperature range (Tmin, Tmax) of validity.  `{0, 0}` means the model
    // declares no window -- absence is not a claim, and nothing is announced.
    virtual std::pair<scalar, scalar> range() const = 0;

    virtual const std::string& modelName() const = 0;

    //  The component this model belongs to, stamped by the factory from the
    //  dict `Component::readFromDict` hands it.  A validity warning that
    //  cannot name its subject is one the reader cannot act on -- the Cp path
    //  paid for that once, printing warnings with no owner for twenty
    //  components.
    void setOwner(const std::string& owner) { owner_ = owner; }

    //  The component's critical temperature, stamped by the factory from the
    //  same injected key the corresponding-states models read.  `noteRange`
    //  needs it to tell two PHYSICALLY DIFFERENT situations apart -- see
    //  `noteRange` for why that distinction is not optional.  0 means the
    //  record declares none, and the branch degrades to the plain one.
    void setCriticalT(scalar Tc) { Tc_declared_ = Tc; }

    // ---- Factory -----------------------------------------------------------
    using Factory = std::function<std::unique_ptr<VaporPressureModel>(const DictPtr&)>;
    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<VaporPressureModel> New(const DictPtr& dict);

    // Registers the built-in models (Antoine,...).  Call once at startup.
    static void registerBuiltins();

protected:
    //  The bare correlation.  A model implements THIS; callers never see it,
    //  so no model can be reached without its validity note having run.
    virtual scalar computePsat(scalar T_K) const = 0;

    //  Announces ONCE per model instance when T falls outside the declared
    //  window, then returns the value anyway.  I4: extrapolation is a
    //  legitimate choice -- the professor extrapolates on purpose, but knows
    //  he did -- so this is never a refusal.
    //
    //  Kept to one bool test per call after the first: `Psat_Pa` runs inside
    //  the Newton loop, and `property-architecture.md` puts provenance at the
    //  data and validation boundaries, never on the hot path.
    void noteRange(scalar T_K) const;

    std::string  owner_;
    scalar       Tc_declared_ = 0.0;
    mutable bool announcedOutside_ = false;

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
