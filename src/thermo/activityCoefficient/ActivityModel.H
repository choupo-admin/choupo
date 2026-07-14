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
    Choupo::ActivityModel

Description
    Abstract base for liquid-phase activity-coefficient models γ_i(T, x).
    Built-in models (Ideal, NRTL, Wilson, UNIQUAC) register themselves
    through `ActivityModel::registerModel(name, factory)`.

        activityModel
        {
            model           ideal;     // or NRTL, Wilson,...
            // model-specific entries...
        }
\*---------------------------------------------------------------------------*/

#pragma once

#include <cmath>

#include "core/Dictionary.H"
#include "core/Types.H"

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class Component;
class ElectrolyteModel;

class ActivityModel
{
public:
    virtual ~ActivityModel() = default;

    // Number of components the model is configured for.
    virtual std::size_t n() const = 0;

    // Activity coefficients γ_i for all components at (T, x).
    virtual sVector gamma(scalar T_K, const sVector& x) const = 0;

    virtual const std::string& modelName() const = 0;

    // ---- Excess enthalpy: the MOLECULAR twin of the electrolyte L_phi ------
    // (docs/electrolyte-enthalpy-spec.md sec.8b).  For a molecular mixture the
    // SYMMETRIC frame is correct (pure-liquid references exist):
    //     G^E/RT = Sum_i x_i ln gamma_i,    H^E = -R T^2 d(G^E/RT)/dT
    // The default computes it by central FD on the model's OWN gamma(T,x) --
    // one identity for the whole family (NRTL tau(T), Wilson, UNIFAC psi(T)
    // all carry T-dependence).  CAVEAT, the same as the electrolyte arc: a
    // VLE-only fit's T-slope gives *an* H^E, not the measured one --
    // consistency is not correctness.  So it is GATED: calorimetricFit()
    // defaults false and flips only when EVERY pair among the present
    // components was regressed against measured heats of mixing (per-pair
    // `calorimetricFit true;` in the pair dict).  Until then H_liquid_formation
    // keeps ideal mixing and the omission stays announced.
    virtual bool calorimetricFit() const { return false; }
    virtual scalar excessEnthalpy(scalar T_K, const sVector& x) const
    {
        const scalar h = 0.05;                      // K, central difference
        auto gexRT = [&](scalar T) -> scalar
        {
            const sVector g = gamma(T, x);
            scalar s = 0.0;
            for (std::size_t i = 0; i < x.size(); ++i)
                if (x[i] > 0.0 && g[i] > 0.0) s += x[i] * std::log(g[i]);
            return s;
        };
        const scalar d = (gexRT(T_K + h) - gexRT(T_K - h)) / (2.0 * h);
        return -8.314462618 * T_K * T_K * d;        // J/mol
    }

    // Minimum-parameter-set MANIFEST (validation boundary, NOT the hot path):
    // per-component property keys this model needs.  Default none.  (NRTL/Wilson/
    // UNIFAC requirements are PAIR/GROUP-level, not per-component scalars, so they
    // stay {} here — pair/group coverage is audited separately.)  See PackageAudit.H.
    virtual std::vector<std::string> requiredComponentProperties() const
    {
        return {};
    }

    // Composition-over-MI accessor (Workstream A2): an electrolyte activity model
    // exposes its ElectrolyteModel engine (the molality+charge surface) here;
    // molecular models return nullptr.  ThermoPackage reaches the engine through
    // THIS -- never an RTTI dynamic_cast.
    virtual const ElectrolyteModel* asElectrolyte() const { return nullptr; }

    using Factory = std::function<std::unique_ptr<ActivityModel>(const DictPtr&, const std::vector<Component>&)>;

    static void registerModel(const std::string& name, Factory f);
    static std::unique_ptr<ActivityModel> New(const DictPtr& dict,
        const std::vector<Component>& components);

    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

} // namespace Choupo
