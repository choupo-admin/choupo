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
    Choupo::liquidProperty::IdealMixing

Description
    ADDITIVE VOLUMES (DEV.md 4c C378 pilot; plan section 1, `idealMixing`):

        rho = sum_i x_i M_i / sum_i x_i v_i         (x over the set, normalised)

    with v_i from ONE leaf per constituent (DensityLeaf.H).  No excess volume:
    for water + ethanol at 0.1 MPa the measured mixture is denser than this
    rule by about 1.8 % at 298.15 K, and no leaf can recover that (the
    pilot's thresholds say so).  The arithmetic is the package's liquid
    branch, term for term in the same order (ThermoPackage::density, step
    3), so over the record leaves the two agree to the last bit.

    The label is composed from what each leaf says about its route: leaves
    of one route share one phrase, the phrases in the order of the routes'
    ranks; the method id lists the routes, e.g.
    `idealMixing[anchoredRackett+flatVliq]`.  Pressure is "applied" only when
    every leaf applies it; the origin is the weakest leaf's (`estimated`
    when any leaf is an estimate).
\*---------------------------------------------------------------------------*/

#pragma once

#include "DensityLeaf.H"

#include <memory>
#include <string>
#include <vector>

namespace Choupo {
namespace liquidProperty {

class IdealMixing : public DensityMethod
{
public:
    explicit IdealMixing(const Binding& b);

    std::string   id() const override { return id_; }
    DensityAnswer evaluate(scalar T_K, scalar P_Pa, const sVector& x) const override;

    const std::vector<std::shared_ptr<const DensityLeaf>>& leaves() const { return leaves_; }

private:
    const ThermoPackage*                            thermo_ = nullptr;
    std::vector<std::size_t>                        set_;
    std::vector<std::shared_ptr<const DensityLeaf>> leaves_;
    std::string                                     id_;
    std::string                                     label_;
    std::string                                     origin_;
    bool                                            pressureApplied_ = false;
};

} // namespace liquidProperty
} // namespace Choupo
