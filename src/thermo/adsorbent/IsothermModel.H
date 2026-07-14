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
    Choupo::IsothermModel  (+ HenryIsotherm, LangmuirIsotherm)

Description
    Pure-component adsorption-equilibrium isotherm for ONE (adsorbent x
    adsorbate) pair, loaded from a single curated record under
    `data/standards/parameters/adsorption/equilibria/<adsorbent>/<species>.dat`
    (the forum-#106 catalogue: the adsorbent material file keeps only
    intrinsic identity; the equilibrium is pair data and lives here).

    Each record DECLARES its bases and the engine converts --- canonical SI at
    the C++ interface (T [K], p [Pa], q [mol/kg]), declared units inside the
    record (`loadingBasis molPerKgAdsorbent;` `pressureBasis
    partialPressureBar;`).  An undeclared or unimplemented basis is REFUSED
    loudly; there is no silent unit guess.

    Models (explicit factory, same registerType/New/registerBuiltins shape as
    every other Choupo base --- registerBuiltins() is called explicitly from
    AdsorbentRegistry::loadFrom / byName, never a static initialiser):

    henry      q = H(T) * p                       (linear, low-coverage limit)
    langmuir   q = q_max * b(T) * p / (1 + b(T)*p)   (single-site Type I)

    both with van't Hoff temperature dependence anchored at tRef:

        b(T) = b_298 * exp( -dH_ads/R * (1/T - 1/tRef) ),   dH_ads < 0
        H(T) = H_298 * exp( -dH_ads/R * (1/T - 1/tRef) )    (exothermic)

    The COMPETITIVE (extended-Langmuir) mixture form is assembled by the
    Adsorbent from these per-species records:

        q_i = q_sat_i * b_i(T) * p_i / (1 + Sum_j b_j(T) * p_j)

    via q_sat() and affinity(T).  A henry species is the dilute-coverage
    limit: it contributes NOTHING to the shared site denominator
    (affinity = 0) and loads competition-free, q_i = H_i(T) * p_i.

    An IsothermModel knows nothing about beds, kinetics or cycles --- it is
    the equilibrium surface q(T, p) and its slope, full stop.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Origin.H"
#include "core/Types.H"

#include <functional>
#include <memory>
#include <string>

namespace Choupo {

class IsothermModel
{
public:
    using Factory = std::function<std::unique_ptr<IsothermModel>(
        const DictPtr&, const std::string& sourcePath)>;

    virtual ~IsothermModel() = default;

    // ---- Identification --------------------------------------------------
    virtual const std::string& model() const = 0;      // factory key
    const std::string& adsorbent() const { return adsorbent_; }
    const std::string& adsorbate() const { return adsorbate_; }

    // Declared bases, verbatim from the record (validated at read time).
    const std::string& loadingBasis()  const { return loadingBasis_;  }
    const std::string& pressureBasis() const { return pressureBasis_; }
    Origin origin() const { return origin_; }
    const std::string& quality() const { return quality_; }
    bool designGrade() const { return quality_ != "teachingOnly"; }
    void announceUse() const;

    // van't Hoff anchor temperature [K] (the "298" in b_298 / H_298).
    scalar tRef() const { return tRef_; }

    // ---- Equilibrium surface (canonical SI: T [K], p [Pa], q [mol/kg]) ----
    virtual scalar q(scalar T, scalar p) const = 0;      // loading      [mol/kg]
    virtual scalar dq_dp(scalar T, scalar p) const = 0;  // slope     [mol/kg/Pa]

    // Saturation (monolayer) loading [mol/kg]; +infinity for a model with no
    // saturation (henry) --- check saturates() before using it in a product.
    virtual scalar q_sat() const = 0;
    virtual bool   saturates() const = 0;

    // Isosteric heat used by cyclic equipment ledgers [J/mol].  The catalogue
    // convention is dH_ads < 0 for exothermic adsorption.
    virtual scalar dHAds() const = 0;

    // Affinity b(T) in the DECLARED pressure basis (e.g. 1/bar) --- the
    // building block of the shared extended-Langmuir denominator.  0 for a
    // model that occupies no competitive sites (henry).
    virtual scalar affinity(scalar T) const = 0;

    // Canonical-SI partial pressure [Pa] -> the record's declared basis,
    // and the (constant) scale d(pInBasis)/dp used by dq_dp.
    scalar pInBasis(scalar p_Pa) const;
    scalar pScale() const;

    // ---- Explicit factory (no auto-registration) --------------------------
    static void registerType(const std::string& name, Factory f);

    // Build from one equilibrium record (reads its `model` keyword).
    // `sourcePath` labels error messages only.
    static std::unique_ptr<IsothermModel> New(const DictPtr& record,
                                              const std::string& sourcePath);

    // Register henry + langmuir.  Idempotent; called EXPLICITLY from
    // AdsorbentRegistry (never from a static initialiser).
    static void registerBuiltins();

protected:
    // Read the record-level common fields: adsorbent, adsorbate, tRef,
    // loadingBasis, pressureBasis (all mandatory; bases validated loudly).
    void readCommon(const DictPtr& record, const std::string& sourcePath);

    std::string adsorbent_;
    std::string adsorbate_;
    std::string loadingBasis_;
    std::string pressureBasis_;
    Origin      origin_ = Origin::unattributed;
    std::string quality_;
    scalar      tRef_ = 298.15;
};


// Linear (Henry) isotherm: q = H(T) * p --- the rigorous low-coverage limit
// of every isotherm, and the model of choice when only a Henry constant is
// known.  No saturation; contributes nothing to site competition.
class HenryIsotherm : public IsothermModel
{
public:
    void read(const DictPtr& record, const std::string& sourcePath);

    const std::string& model() const override { return model_; }

    scalar q(scalar T, scalar p) const override;
    scalar dq_dp(scalar T, scalar p) const override;
    scalar q_sat() const override;               // +infinity (announced trait)
    bool   saturates() const override { return false; }
    scalar dHAds() const override { return dH_ads_; }
    scalar affinity(scalar) const override { return 0.0; }

    // H(T) in the declared bases (e.g. mol/kg/bar), van't Hoff on dH_ads.
    scalar henryCoefficient(scalar T) const;

private:
    inline static const std::string model_ = "henry";

    scalar H_298_  = 0.0;   // Henry coefficient at tRef  [mol/kg per declared-p]
    scalar dH_ads_ = 0.0;   // heat of adsorption (<0)    [J/mol]
};


// Single-site Langmuir isotherm: q = q_max * b(T)*p / (1 + b(T)*p).
// The exact model (and the exact arithmetic) the PSA shipped with --- the
// migration moved the numbers, not the physics.
class LangmuirIsotherm : public IsothermModel
{
public:
    void read(const DictPtr& record, const std::string& sourcePath);

    const std::string& model() const override { return model_; }

    scalar q(scalar T, scalar p) const override;
    scalar dq_dp(scalar T, scalar p) const override;
    scalar q_sat() const override { return q_max_; }
    bool   saturates() const override { return true; }
    scalar dHAds() const override { return dH_ads_; }
    scalar affinity(scalar T) const override;    // b(T), van't Hoff @ tRef

private:
    inline static const std::string model_ = "langmuir";

    scalar q_max_  = 0.0;   // saturation loading          [mol/kg]
    scalar b_298_  = 0.0;   // affinity at tRef            [1 per declared-p]
    scalar dH_ads_ = 0.0;   // heat of adsorption (<0)     [J/mol]
};

} // namespace Choupo
