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
    Choupo::EDStack

Description
    An ELECTRODIALYSIS STACK record (`kind edStack;` in the flat assets/
    home): the piece of hardware an `electrodialysisStack` unit is run in.
    A case names it -- `stack EUR2C-7P18;` in the unit's operation -- and
    the record supplies the cell pairs, the active area, the channel the
    diluate flows through, the spacer, the hydraulic passes, the
    mass-transfer correlation fitted to THAT stack, and the manufacturer's
    limits.

    WHY IT EXISTS, and it is not only tidiness.  Until 2026-09-16 the
    operation declared `linearVelocity`, which is a SECOND HOME: the unit
    already receives the diluate flow on its inlet stream, and the
    crossflow velocity is that flow divided by the channel cross-section
    of the channels running in parallel.  An author could declare a
    velocity that contradicted the flow and nothing noticed -- while the
    velocity sets the mass-transfer coefficient and therefore the limiting
    current.  With a stack record the velocity is DERIVED and the
    arithmetic is printed.

    VITOR'S TWO RULINGS (2026-09-16), verbatim in the records themselves:

      * `activeArea` IS THE CELL-PAIR AREA.  *A stack of 50 m2 has 50 m2
        of anionic membrane AND 50 m2 of cationic membrane.*  So the
        record stores the cell-pair active area of the whole stack and
        NOTHING ELSE: the area per cell pair (activeArea/cellPairs), the
        area per membrane kind (activeArea) and the total membrane area
        (2 x activeArea) are DERIVED here and announced by the consumer.
        The tree never stores a derivative.

      * THE PASS BELONGS TO THE EQUIPMENT.  `hydraulicPasses` is a fact
        about how the stack is plumbed, not an operating choice, so it
        lives here; a case that declares it beside `stack` is refused.

    THE ESTIMATES ARE THE POINT, exactly as for `kind membraneModule`
    (2026-09-15): a value the source does not state carries `{ origin
    estimate; reviewStatus unverified; notes "how to verify it"; }` in
    `provenance {}`, this reader REFUSES an estimate with no note or no
    review status, and the consumer ANNOUNCES every estimate it reads on
    every run.  Provenance blocks reach ONE level into `limits {}` and
    `massTransfer {}`, because that is where two of this stack's four
    estimates live.

    THE MASS-TRANSFER CORRELATION IS EQUIPMENT-AND-SPACER DATA, never a
    universal law.  Sh = a Re^b Sc^c is a fit to one stack with one
    spacer; the record carries the coefficients, the velocity basis they
    were fitted on, and the citation.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

//- One value the record declares as an ESTIMATE, with what the record says
//  about verifying it.  `key` is dotted where the value sits inside a
//  sub-dict (`limits.T_max`), so a consumer's announcement names the value
//  the way the record spells it.
struct EDStackEstimate
{
    std::string key;
    scalar      value = 0.0;
    std::string reviewStatus;
    std::string notes;
};

//- The Sherwood correlation fitted to THIS stack.
//    powerLaw:  Sh = a Re^b Sc^c
//    leveque:   Sh = a (Re Sc d_h / L)^(1/3)          (a defaults to 1.85)
struct EDSherwood
{
    std::string model;          // powerLaw | leveque
    scalar      a = 0.0, b = 0.0, c = 0.0;
    std::string velocityBasis;  // superficial | interstitial
    //- The Reynolds band the fit was taken over.  EQUIPMENT DATA, like every
    //  other validity window in this tree: a correlation applied outside the
    //  band it was fitted on is an extrapolation and the run says so.  Absent
    //  (the flag) means the source states none, never a zero band.
    bool        hasReBand = false;
    scalar      Re_lo = 0.0, Re_hi = 0.0;
};

//- The manufacturer's operating limits.  A limit the source does not state
//  is ABSENT (the has* flag), never a zero that means "unknown".
struct EDStackLimits
{
    bool hasI_max = false;    scalar i_max = 0.0;     // A/m2
    bool hasT_max = false;    scalar T_max = 0.0;     // K
    bool hasDP_max = false;   scalar dP_max = 0.0;    // Pa
    bool hasFlow_max = false; scalar flow_max = 0.0;  // m3/s, diluate
    bool hasPH = false;       scalar pH_min = 0.0, pH_max = 0.0;
};

class EDStack
{
public:
    EDStack() = default;

    void readFromDict(const DictPtr& dict, const std::string& sourcePath);

    // ---- Identification ----------------------------------------------------
    const std::string& name()         const { return name_; }
    const std::string& manufacturer() const { return manufacturer_; }
    const std::string& source()       const { return source_; }
    const std::string& sourcePath()   const { return sourcePath_; }
    //- The IEM pair the stack is built with, or EMPTY when the source names
    //  none -- a stack FRAME takes any pair, so the case then declares
    //  `membrane <name>;` beside `stack` (the SEPA_CF flat-cell precedent).
    const std::string& membranes()    const { return membranes_; }
    bool namesMembranes() const { return !membranes_.empty(); }

    // ---- What the record STORES -------------------------------------------
    int    cellPairs()        const { return cellPairs_; }
    scalar activeArea_m2()    const { return activeArea_; }   // the CELL-PAIR area of the whole stack
    scalar channelHeight_m()  const { return channelHeight_; }
    scalar channelWidth_m()   const { return channelWidth_; }
    //- DECLARED where the source states it, else DERIVED as
    //  activeArea / (cellPairs * channelWidth) -- resolved once in the reader
    //  and never stored on disk in the derived case.
    scalar channelLength_m()  const { return channelLength_; }
    bool   lengthDeclared()   const { return lengthDeclared_; }
    scalar spacerPorosity()   const { return spacerPorosity_; }
    const std::string& spacerType() const { return spacerType_; }
    int    hydraulicPasses()  const { return passes_; }

    // ---- What it DERIVES (nothing below is stored) -------------------------
    scalar areaPerCellPair_m2()     const { return activeArea_ / cellPairs_; }
    scalar areaPerMembraneKind_m2() const { return activeArea_; }
    scalar totalMembraneArea_m2()   const { return 2.0 * activeArea_; }
    //- Diluate channels running side by side within one hydraulic pass.
    scalar channelsPerPass()  const { return static_cast<scalar>(cellPairs_)
                                          / static_cast<scalar>(passes_); }
    //- The path a parcel of diluate actually travels.
    scalar flowPathLength_m() const { return channelLength_
                                          * static_cast<scalar>(passes_); }
    //- The geometric spacer footprint of one cell pair, for the cross-check
    //  against the declared (effective) area.  Two facts, never one derived
    //  from the other.
    scalar channelFootprint_m2() const { return channelWidth_ * channelLength_; }

    const EDSherwood&     massTransfer() const { return sh_; }
    const EDStackLimits&  limits()       const { return limits_; }
    const std::vector<EDStackEstimate>& estimates() const { return estimates_; }

    // The accepted words, each in ONE place.
    static const std::vector<std::string>& acceptedSpacerTypes();
    static const std::vector<std::string>& acceptedSherwoodModels();
    static const std::vector<std::string>& acceptedVelocityBases();

private:
    std::string name_, manufacturer_, source_, sourcePath_, membranes_, spacerType_;
    int    cellPairs_ = 0, passes_ = 0;
    bool   lengthDeclared_ = false;
    scalar activeArea_ = 0.0, channelHeight_ = 0.0, channelWidth_ = 0.0;
    scalar channelLength_ = 0.0, spacerPorosity_ = 0.0;
    EDSherwood    sh_;
    EDStackLimits limits_;
    std::vector<EDStackEstimate> estimates_;
};

} // namespace Choupo
