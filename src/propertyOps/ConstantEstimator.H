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
\*---------------------------------------------------------------------------*/

/*---------------------------------------------------------------------------*\
  ConstantEstimator — a pure-component CONSTANT estimator.

  The interface behind `estimateComponent`'s `model` slot.  Two FAMILIES of
  estimator share this one base, each picking the input channel its method
  needs:

    * GROUP-based   (Joback today; Constantinou-Gani / Wilson-Jasperson
                     tomorrow) -- override estimate(groups, ...).  Turn a list
                     of molecular groups into (Tc, Pc, omega, Tb, ...).

    * SCALAR-based  (Riazi-Daubert today) -- override
                     estimateFromScalars(anchors, ...).  Turn measured anchor
                     scalars (Tb, SG / MW) into (Tc, Pc, omega, ...) for a
                     PETROLEUM PSEUDO-COMPONENT -- a lumped cut with no single
                     molecular structure, so it has no group decomposition.

  An estimator declares which channel(s) it supports via inputKind(); the two
  estimate methods carry a default that refuses the channel the subclass did
  not implement (so the group signature is NEVER hacked to take scalars, and
  vice versa).  EstimateComponent picks the channel from the op dict (`groups`
  vs `anchors`).

  CURATION-TIME ONLY (Layer 3).  This NEVER runs in the solver hot path; it
  produces a glass-box .dat the student reviews + promotes.  Explicit factory,
  like every other Choupo base (no auto-registration; registerBuiltins() is
  called explicitly in choupoProps/main.cpp).
\*---------------------------------------------------------------------------*/

#ifndef Choupo_ConstantEstimator_H
#define Choupo_ConstantEstimator_H

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

// The pure-component constants an estimator produces from molecular groups.
struct ConstantEstimate
{
    double MW = 0.0, Tb = 0.0, Tc = 0.0, Pc_bar = 0.0, Vc = 0.0;
    double Hf = 0.0, Gf = 0.0, Hvap = 0.0, omega = 0.0;
    double cpa = 0.0, cpb = 0.0, cpc = 0.0, cpd = 0.0;   // Cp_ig polynomial coeffs
    int    nA = 0;                                        // total atom count

    // Per-group contribution, for the glass-box console build-up.
    struct GroupContribution { std::string name; int count; double dTb, dTc, dHf; };
    std::vector<GroupContribution> breakdown;
};

// The POLYMER repeat-unit properties a group-contribution method produces.
// A separate struct from the fluid ConstantEstimate: a polymer has no Tb/Tc/
// omega closure chain -- it has a repeat-unit molar mass M0 and (Slice 1)
// a van-der-Waals volume / molar volume / density.  Tg, delta, Tm follow in
// later slices (own provenance, own equations).
struct PolymerEstimate
{
    double M0  = 0.0;   // repeat-unit molar mass            [g/mol]
    double Vw  = 0.0;   // Bondi van der Waals volume        [cm^3/mol]
    double V   = 0.0;   // molar volume V = k * Vw           [cm^3/mol]
    double rho = 0.0;   // density rho = M0 / V              [g/cm^3]
    double k   = 0.0;   // packing factor used (announced)
    bool   hasVol = false;   // false if any group lacks an open Vw value

    // Per-group contribution for the glass-box console build-up.  A group with
    // no open Vw value carries hasVw=false -> printed `? (no open value)`,
    // never a silent zero.
    struct PolyBreakdown { std::string name; int count; double dMW, dVw; bool hasVw; };
    std::vector<PolyBreakdown> breakdown;
};

class ConstantEstimator
{
public:
    using GroupSpec = std::pair<std::string, int>;       // (group key, count)
    using Factory   = std::function<std::unique_ptr<ConstantEstimator>()>;

    // Which input channel the method consumes (drives the op's dispatch + the
    // user-facing error when the wrong block is supplied).
    enum class InputKind { Groups, Scalars, PolymerGroups };

    virtual ~ConstantEstimator() = default;

    // A human-readable provenance string (goes into the proposal .dat).
    virtual std::string method() const = 0;

    // The input channel this estimator reads.  Default Groups (the historical
    // family); a scalar-input estimator overrides it to Scalars.
    virtual InputKind inputKind() const { return InputKind::Groups; }

    // ---- GROUP channel (Joback & co.) -------------------------------------
    // Estimate the constants from the picked groups.  On an unknown group,
    // sets ok=false and fills `error` (the op surfaces it) — never throws.
    // Default: refuse (this estimator is scalar-input, not group-based).
    virtual ConstantEstimate estimate(const std::vector<GroupSpec>& /*groups*/,
                                      bool& ok, std::string& error) const
    {
        ok = false;
        error = "estimator '" + method()
              + "' is SCALAR-input -- it takes `anchors { ... }` (Tb, SG / MW),"
                " not a `groups ( ... )` list.";
        return {};
    }

    // The recognised group keys (for the user-facing error message).  Empty
    // for a scalar-input estimator.
    virtual std::vector<std::string> knownGroups() const { return {}; }

    // ---- SCALAR channel (Riazi-Daubert & co.) -----------------------------
    // Estimate the constants from named anchor scalars (canonical SI: Tb in K;
    // SG dimensionless; MW in g/mol).  On a missing/insufficient anchor, sets
    // ok=false and fills `error` — never throws.  Default: refuse (this
    // estimator is group-based, not scalar-input).
    virtual ConstantEstimate estimateFromScalars(
        const std::map<std::string, double>& /*anchors*/,
        bool& ok, std::string& error) const
    {
        ok = false;
        error = "estimator '" + method()
              + "' is GROUP-input -- it takes a `groups ( ... )` list,"
                " not an `anchors { ... }` block.";
        return {};
    }

    // The recognised anchor keys (for the user-facing error message).  Empty
    // for a group-input estimator.
    virtual std::vector<std::string> knownAnchors() const { return {}; }

    // ---- POLYMER GROUP channel (Van Krevelen & co.) -----------------------
    // Estimate repeat-unit properties from the repeat unit's groups + the
    // packing factor k (V = k * Vw).  On an unknown group, sets ok=false and
    // fills `error` -- never throws.  Default: refuse (this estimator is not a
    // polymer group-contribution method).
    virtual PolymerEstimate estimatePolymer(const std::vector<GroupSpec>& /*groups*/,
                                            double /*k*/,
                                            bool& ok, std::string& error) const
    {
        ok = false;
        error = "estimator '" + method()
              + "' is not a POLYMER group-contribution method -- it does not take"
                " a polymer repeat-unit `groups ( ... )` block.";
        return {};
    }

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<ConstantEstimator> New(const std::string& name);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();
};

} // namespace Choupo

#endif
