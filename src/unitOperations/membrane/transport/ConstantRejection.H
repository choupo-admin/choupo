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
    Choupo::membrane::ConstantRejection

Description
    A CONSTANT INTRINSIC REJECTION per solute -- transport law
    `constantRejection` (DEV.md 4c C148, Vitor 2026-10-24: "Pode-se usar o
    da solucao-difusao com B_i ou com rejeicoes intrinsecas constantes
    R_int,i").  The law of Geraldes & Afonso, J. Membr. Sci. 300 (2007)
    20-27, Eq. (1), with R_i taken as an INPUT, as the paper takes it:

        N_i   = J_v c_p,i = J_v (1 - R_i) c_m,i              solute flux
        c_p,i = (1 - R_i) c_m,i                              the permeate
        J_v   = A_w (P_b - P_p - Delta_pi),
        Delta_pi = pi(c_m) - pi(c_p)                         the water flux

    R_i is the INTRINSIC rejection, 1 - c_p,i/c_m,i, measured against the
    WALL -- not the observed 1 - c_p/c_b, which the polarisation lowers.
    The wall c_m comes from the ONE home, the Polarisation object (the
    declared `polarisation {}` policy; for an ion-declared feed with
    `ionCoupling electroneutral;` the Geraldes & Afonso interface field),
    solved JOINTLY with this closure by wallWithPermeateRatio
    (ratio_i = 1 - R_i), and the water flux by the same Newton the
    solution-diffusion law uses (detail::waterFluxNewton).  The membrane
    record supplies A_w only; its `permeabilities {}` are not read.

    Declared in the unit's `operation` (the spiral-wound module, the flat
    cell and the batch diafilter read `transportParameters {}` alike):

        transport  constantRejection;
        transportParameters
        {
            rejection { NaCl 0.60;  MgSO4 0.98; }   // R_int for EVERY solute
            source    "...";                        // where the R's come from
        }

    keyed by the COMPONENT name, as a membrane record keys its B_s: a feed
    declared by salts gets one R per salt, a feed declared ion by ion one R
    per ion.  R lies in [0, 1] (0: the solute passes as it is at the wall;
    1: it is not passed at all); outside refuses, a solute present in the
    feed with no R refuses, an R naming no solute of the feed refuses, and
    any other key in the block refuses.

    THE MULTI-ION DECISION (C148, measured -- see the witness).  A salt is
    neutral, so R per SALT on a feed declared by salts gives an
    electroneutral permeate BY CONSTRUCTION.  Constant R per ION does not:
    the permeate charge is sum z_i (1 - R_i) c_m,i, which vanishes on an
    electroneutral wall only when the R's are equal or tuned to ONE wall
    composition -- and the wall composition moves along the channel.  This
    law has no mechanism that couples the ions (that is SDEM's zero-current
    field), so a charged permeate would be a current flowing through a
    membrane with no electrodes.  It is REFUSED, at the station where it
    appears, when |sum z c_p| / sum |z| c_p exceeds 1e-6, naming both sums,
    the wall's own charge and the two remedies (R per salt; or
    `transport SDEM;`, which derives the split from per-ion permeances).
    Equal R's on every ion of an electroneutral wall pass (the charge is
    then (1 - R) times the wall's, zero).

    AN R DERIVED FROM THE DATA SHEET (DEV.md 4c C189).  A data sheet quotes
    an OBSERVED rejection (feed to permeate), never this law's intrinsic
    one.  `rejection { MgSO4 fromRatedTest; }` asks the unit to DERIVE R_int
    for that solute by inverting the module record's `ratedTest {}` with
    the module's own film (membrane/RatedTestInversion.H, the one home);
    the unit hands the value back through setRatedRejection before the
    first station.  When the record carries several tests of that solute
    the case names one, `rejection { MgSO4 ( fromRatedTest <id> ); }`
    (C189 slice 2).  A unit that holds no module record (the batch
    diafilter) cannot, and the law then refuses the word by name.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {
namespace membrane {

class ConstantRejection : public TransportModel
{
public:
    const std::string& type() const override
    { static const std::string t = "constantRejection"; return t; }

    void readParameters(const DictPtr& params) override;

    TransportSolution localFluxes(const TransportContext& ctx) const override;

    //  The membrane record's `permeabilities {}` are not this law's input:
    //  the module does not warn about a solute the record gives no B_s.
    bool readsMembranePermeabilities() const override { return false; }

    //  `<solute> fromRatedTest;` (see the header): the solutes still waiting
    //  for a derived R, and the door the deriving unit hands it through.
    std::vector<std::string> ratedTestSolutes() const override { return pendingRated_; }
    std::string ratedTestId(const std::string& solute) const override
    { const auto it = ratedIds_.find(solute); return it == ratedIds_.end() ? std::string() : it->second; }
    void setRatedRejection(const std::string& solute, scalar R_int) override;

    //- The relative permeate charge above which an ion-declared feed is
    //  refused (|sum z c_p| / sum |z| c_p).
    static constexpr scalar chargeTolerance = 1.0e-6;

private:
    void resolveOnce(const TransportContext& ctx) const;

    bool                          read_ = false;
    std::map<std::string, scalar> R_;          // component name -> R_int
    std::string                   source_;
    std::vector<std::string>      pendingRated_;   // fromRatedTest, not yet derived
    std::vector<std::string>      derivedRated_;   // fromRatedTest, derived
    std::map<std::string, std::string> ratedIds_;  // solute -> the named test's id

    mutable bool                  resolved_ = false;
    mutable std::vector<scalar>   ratio_;      // 1 - R_i, per solute slot
    mutable std::vector<int>      z_;          // the polarisation's charges
    mutable bool                  perIon_ = false;
};

} // namespace membrane
} // namespace Choupo
