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
    Choupo::MembraneModule

Description
    A membrane MODULE record: the piece of hardware a membrane is deployed
    in -- a commercial spiral-wound element (`format spiralWound`, wound with
    ONE named membrane) or a laboratory flat-sheet crossflow cell
    (`format flatSheetCell`, which takes ANY coupon: the case declares the
    membrane beside the module).  Loaded from `data/standards/assets/<name>.dat`
    with `kind membraneModule;`, or from the case's own `constant/assets/`.

    What a case typed by hand before 2026-09-15 -- `area`, `length`,
    `channelHeight`, `spacerPorosity`, spread over the operation and its
    massTransfer/pressureDrop sub-blocks -- the record carries ONCE, together
    with the manufacturer's LIMITS (checked against the run, announced, never
    refused) and its RATED TEST(S) (the standard test(s) the data sheet quotes,
    one `ratedTest {}` or several `ratedTests ( ... )`, each as stated,
    which the gate check_membrane_modules runs the engine against as a
    measurement).

    THE ESTIMATES ARE THE POINT.  A data sheet publishes the active area and
    the limits; it does not publish the leaf length, the spacer porosity or
    (for most elements) the spacer thickness.  Vitor's ruling (2026-09-15):
    "onde faltam parametros coloca um valor educado, com uma nota a dizer que
    tem de ser verificado" -- an educated value, marked as an ESTIMATE that
    must be verified, never silent.  So a value the document does not state
    carries a per-value provenance block `{ origin estimated; reviewStatus
    unverified; notes "..."; }` naming HOW to verify it, the reader here
    REFUSES an estimate with no note or no review status, and every consumer
    ANNOUNCES each estimate it reads on every run (the [estimate] tag of
    Database.cpp, the ONE vocabulary; AdvisoryLog so it reaches the end-of-run
    caveat block).  A run that reads no estimate announces nothing.

    The record knows nothing about transport: A_w and B_s stay on the
    Membrane record (src/thermo/membrane/Membrane.H), which knows nothing
    about geometry.  The two meet in SpiralWoundModule.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

//- One value the record declares as an ESTIMATE, with what the record says
//  about verifying it.  The consumer prints these; nothing else reads them.
struct ModuleEstimate
{
    std::string key;            // the field (channelHeight, spacerPorosity, ...)
    scalar      value = 0.0;    // its SI value, for the sentence
    std::string reviewStatus;   // the record's own word (unverified, ...)
    std::string notes;          // how to verify it -- REQUIRED
};

//- ONE of the manufacturer's standard tests, as the data sheet quotes it
//  (DEV.md 4c C189 slice 2: a record may carry several, `ratedTests ( {..}
//  {..} );`, each kept with its OWN meaning -- a NaCl test and an MgSO4 test
//  are different operating points, and a minimum is never averaged with a
//  typical value).  The seven numbers below the id are REQUIRED (all or
//  nothing); every other fact is OPTIONAL and, when the sheet does not state
//  it, ABSENT -- an empty word or a has* flag, never a default.  A reader
//  that needs an absent fact refuses or announces it by name.
struct RatedTest
{
    std::string id;                     // optional name; required when two tests share a solute
    std::string solute;                 // the test solute (a component name)
    std::string soluteBasis;            // optional: the formula the sheet states it AS (boron as B)
    scalar      feedMassFraction = 0.0; // kg/kg (2000 ppm -> 2.0e-3)
    scalar      P            = 0.0;     // Pa, applied pressure as stated
    std::string pressureBasis;          // optional: feedAbsolute | feedGauge | netDriving
    scalar      T            = 0.0;     // K
    bool        hasPH        = false;   scalar pH = 0.0;   // optional
    scalar      recovery     = 0.0;     // permeate/feed, volumetric
    scalar      permeateFlow = 0.0;     // m3/s
    std::string permeateFlowBasis;      // optional: sameTest | separateTest
    std::string rejectionValueType;     // optional: typical|minimum|maximum|approximate|range
    scalar      rejection    = 0.0;     // stated observed rejection (NaN when a range)
    scalar      rejectionLow = 0.0, rejectionHigh = 0.0;   // range only
    std::string source;                 // optional: the document (form, revision, date)

    bool isRange() const { return rejectionValueType == "range"; }
    // "test '<id>'" or "the rated test" -- for sentences.
    std::string label() const
    { return id.empty() ? std::string("the rated test") : "test '" + id + "'"; }
};

//- The manufacturer's operating limits.  A limit the sheet does not state is
//  ABSENT (the has* flag), never a zero that means "unknown".
struct ModuleLimits
{
    bool   hasP_max = false;      scalar P_max        = 0.0;   // Pa
    bool   hasT_max = false;      scalar T_max        = 0.0;   // K
    bool   hasDP_max = false;     scalar dP_max       = 0.0;   // Pa, per element
    bool   hasFeedFlow_max = false; scalar feedFlow_max = 0.0; // m3/s
    bool   hasPH = false;         scalar pH_min = 0.0, pH_max = 0.0;
};

class MembraneModule
{
public:
    MembraneModule() = default;

    // Load from a dictionary representing one module .dat file.  `sourcePath`
    // names the file in every refusal.
    void readFromDict(const DictPtr& dict, const std::string& sourcePath);

    // ---- Identification ----------------------------------------------------
    const std::string& name()         const { return name_; }
    const std::string& manufacturer() const { return manufacturer_; }
    const std::string& source()       const { return source_; }
    const std::string& sourcePath()   const { return sourcePath_; }

    // "spiralWound" | "flatSheetCell" -- the accepted words, in one place.
    const std::string& format()       const { return format_; }
    static const std::vector<std::string>& acceptedFormats();
    bool isFlatSheetCell() const { return format_ == "flatSheetCell"; }

    // The membrane the element is wound with (spiral only; empty on a cell).
    const std::string& membrane()     const { return membrane_; }

    // ---- Channel geometry (SI) ---------------------------------------------
    scalar activeArea_m2()    const { return activeArea_; }
    scalar channelHeight_m()  const { return channelHeight_; }
    scalar spacerPorosity()   const { return spacerPorosity_; }
    // Spiral: the leaf length the channel is marched over.
    scalar leafLength_m()     const { return leafLength_; }
    // Spiral, C146: the leaf count (0 = not declared), the nominal diameter
    // and the element length (0 = not declared); the leaf WIDTH is derived
    // where it is used, A / (2 n L), and never stored.
    int    leaves()            const { return leaves_; }
    scalar nominalDiameter_m() const { return nominalDiameter_; }
    scalar elementLength_m()   const { return elementLength_; }
    // The feed spacer record the element is wound with (empty: the legacy
    // inline channelHeight + spacerPorosity, which are 0 when a spacer is named).
    const std::string& feedSpacer() const { return feedSpacer_; }
    // Flat cell: the slot the coupon sits in.  The channel LENGTH is not
    // stored -- it is activeArea / slotWidth, derived where it is used.
    scalar slotWidth_m()      const { return slotWidth_; }
    scalar slotDepth_m()      const { return slotDepth_; }
    scalar holdUpVolume_m3()  const { return holdUpVolume_; }
    const std::vector<scalar>& availableSpacers_m() const { return spacers_; }

    // ---- The manufacturer's limits and standard test -----------------------
    const ModuleLimits& limits()      const { return limits_; }
    //  Every rated test, in the record's order: `ratedTest {}` is read as a
    //  list of one, `ratedTests ( ... )` as written; empty = none declared.
    const std::vector<RatedTest>& ratedTests() const { return rated_; }
    // The accepted words of the optional facts, in one place.
    static const std::vector<std::string>& acceptedRejectionValueTypes();
    static const std::vector<std::string>& acceptedPressureBases();
    static const std::vector<std::string>& acceptedPermeateFlowBases();

    // ---- Every value the record declares as an estimate ---------------------
    const std::vector<ModuleEstimate>& estimates() const { return estimates_; }

private:
    std::string name_, manufacturer_, source_, sourcePath_, format_, membrane_, feedSpacer_;
    int    leaves_ = 0;
    scalar nominalDiameter_ = 0.0, elementLength_ = 0.0;
    scalar activeArea_ = 0.0, channelHeight_ = 0.0, spacerPorosity_ = 0.0;
    scalar leafLength_ = 0.0, slotWidth_ = 0.0, slotDepth_ = 0.0, holdUpVolume_ = 0.0;
    std::vector<scalar> spacers_;
    ModuleLimits limits_;
    std::vector<RatedTest> rated_;
    RatedTest readRatedTest(const DictPtr& r, const std::string& where) const;
    std::vector<ModuleEstimate> estimates_;
};

} // namespace Choupo
