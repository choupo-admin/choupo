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
Class
    Choupo::liquidProperty::PureFluidLeaf

Description
    A PURE-FLUID FORMULATION'S LIQUID BRANCH, as a leaf and as the method of
    a one-constituent set (DEV.md 4c C378 pilot; plan sections 1 and 2).
    Two registered names, one class:

        pureFluid          the case's `pureFluids { <c> { method ...; } }`
                           selection (IF97, or a Helmholtz record by name):
                           an explicit act, it pins the component's method;
        referenceEquation  a Helmholtz record in parameters/Helmholtz/ whose
                           `fluid` is the component (by its name or an
                           alias), found as the reference equation itself is
                           found (case-local, then the catalogue): taken BY
                           THE FACT that the record exists, with pressure.

    THE LIQUID BRANCH (the kernel's rule, one band in the engine): the state
    is placed by `pureFluidPhaseState` (pureFluid/PureFluidModel.H), the one
    decision of which branch a pure fluid is evaluated on.  Below the
    critical temperature, a liquid asked above p_sat(T) (1 + 1e-6) is the
    liquid at (T, P); inside the band the saturated liquid at T; and:
      * as the method of the ONE-CONSTITUENT SET, a state more than the band
        on the vapour side is a VAPOUR -- a typed domain error naming
        p_sat(T) and the remedy, never a number;
      * as a LEAF inside a mixture, a constituent below its own p_sat is the
        saturated liquid at T (the hypothetical-liquid convention the Rackett
        leaves already follow), announced once per method and site.
    At or above the record's critical temperature there is no liquid: a
    hard limit for both.  Below the triple point the formulation is asked at
    (T, P) as it is (IF97 refuses there by its own name; a Helmholtz record
    describes the supercooled liquid).
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityLeaf.H"

#include <memory>

namespace Choupo {

class PureFluidModel;

namespace liquidProperty {

class PureFluidLeaf : public DensityLeaf
{
public:
    enum class Kind { caseSelection, referenceEquation };

    //  caseSelection: the package's own model for the component.
    //  referenceEquation: the Helmholtz record `b.recordName` (its equation
    //  name), loaded here.
    PureFluidLeaf(const Binding& b, Kind k);
    ~PureFluidLeaf() override;

    std::string id() const override;
    scalar      molarVolume(scalar T_K, scalar P_Pa) const override;
    std::string routeKey() const override;
    int         routeRank() const override;
    std::string routeWords(const std::vector<std::string>& statedAt) const override;
    std::string origin() const override;
    bool        pressureApplied() const override { return true; }
    std::string evidence() const override;

    //  The one-constituent set: the vapour side of the band is refused.
    DensityAnswer evaluate(scalar T_K, scalar P_Pa, const sVector& x) const override;

    const PureFluidModel& model() const { return *model_; }

private:
    //  `asSet`: the method of the one-constituent set (a vapour is refused)
    //  rather than a leaf in a mixture (below p_sat: the saturated liquid).
    scalar volumeAt(scalar T_K, scalar P_Pa, bool asSet) const;

    Kind                            kind_;
    const PureFluidModel*           model_ = nullptr;
    std::unique_ptr<PureFluidModel> owned_;
    std::string                     equation_;      // the Helmholtz record, when one
    std::string                     uncertainty_;   // the record's stated uncertainty
    scalar                          Tc_ = 0.0;      // no liquid at or above
};

} // namespace liquidProperty
} // namespace Choupo
