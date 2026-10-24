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
    Choupo::FeedSpacer

Description
    A FEED-CHANNEL SPACER record (`kind feedSpacer;` in the flat assets/
    home, or a case's constant/assets/): the net that holds the leaves of a
    spiral-wound element apart and sets the channel the feed flows in.

    THE GEOMETRY, AND WHICH OF IT IS STORED.  Schock & Miquel, Desalination
    64 (1987) 339-352, characterise a feed spacer by its thickness h_SP, its
    filament diameter d_F and its mesh length l_M (Tab. 1, p. 343), and
    DERIVE the rest:
        V_SP   = 0.5 pi d_F^2 l_M,   V_Tot = l_M^2 h_SP         Eqs. (21)-(22)
        eps    = 1 - V_SP / V_Tot                               Eq.  (20)
        S_V,SP = 4 / d_F                                        Eq.  (23)
        d_h    = 4 eps / ( 2/h + (1 - eps) S_V,SP )             Eq.  (17)
    with the channel height h taken equal to the spacer thickness (p. 341,
    the assumption stated under Eq. 12).  So the record stores what was
    MEASURED and the engine derives the rest -- never both (the tree never
    stores a derivative):
      * `thickness`                                   -- always;
      * `porosity` XOR (`filamentDiameter` + `meshLength`) -- a porosity
        weighed directly (the paper's Eq. 19) or one computed from the mesh
        (Eqs. 20-22); declaring all three REFUSES;
      * `filamentDiameter` XOR `hydraulicDiameter` -- d_h is DERIVED by
        Eq. (17) where the filament is known, and stored only where a source
        publishes d_h and not the filament; both, or neither, REFUSES.

    THE CORRELATIONS ARE DATA ON THE SPACER.  `massTransfer {}` and
    `pressureDrop {}` name the model (a registered factory word), its
    coefficients and the Reynolds `validity { Re ( lo hi ); }` the fit was
    taken over.  A case SELECTS a correlation by naming its model in its own
    massTransfer / pressureDrop block; the spacer then supplies the
    coefficients (a case's own a / b / c beside a spacer REFUSES -- one home)
    and the window, outside which the run ANNOUNCES the extrapolation and
    continues.  A case that fixes `k_film` or `dP_feed_total` uses no
    correlation and reads only the geometry.

    No viscosity correction is carried: the paper evaluates its numbers on
    average bulk properties and states that a concentration dependence is
    "assumed to be insignificant" (p. 340); it gives no wall-viscosity term.

    Per-value provenance as in MembraneModule: a value no source states is
    `origin estimated; reviewStatus unverified; notes "how to verify";`,
    refused without its note, and announced on every run that reads it.
\*---------------------------------------------------------------------------*/

#pragma once

#include "MembraneModule.H"          // ModuleEstimate
#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

//- One correlation the spacer carries: the model word, its block (the
//  coefficients, handed to the model's readParameters), and its window.
struct SpacerCorrelation
{
    bool        declared  = false;
    std::string model;               // a registered factory word (SchockMiquel, ...)
    DictPtr     dict;                // the record's block, coefficients included
    bool        hasReBand = false;
    scalar      Re_lo = 0.0, Re_hi = 0.0;
};

class FeedSpacer
{
public:
    FeedSpacer() = default;

    void readFromDict(const DictPtr& dict, const std::string& sourcePath);

    const std::string& name()         const { return name_; }
    const std::string& manufacturer() const { return manufacturer_; }
    const std::string& source()       const { return source_; }
    const std::string& sourcePath()   const { return sourcePath_; }

    // ---- geometry (SI) -----------------------------------------------------
    scalar thickness_m()         const { return thickness_; }
    bool   hasFilament()         const { return filament_ > 0.0; }
    scalar filamentDiameter_m()  const { return filament_; }
    bool   hasMesh()             const { return mesh_ > 0.0; }
    scalar meshLength_m()        const { return mesh_; }

    //  Eqs. (20)-(22) when the mesh is declared, else the declared porosity.
    scalar porosity()            const { return porosity_; }
    bool   porosityDerived()     const { return porosityDerived_; }
    //  Eq. (23): S_V,SP = 4/d_F [1/m]; 0 when no filament is declared.
    scalar specificSurface()     const { return hasFilament() ? 4.0 / filament_ : 0.0; }
    //  Eq. (17) when the filament is declared, else the published datum.
    scalar hydraulicDiameter_m() const { return dh_; }
    bool   hydraulicDiameterDerived() const { return hasFilament(); }

    // ---- correlations ------------------------------------------------------
    const SpacerCorrelation& massTransfer() const { return mt_; }
    const SpacerCorrelation& pressureDrop() const { return pd_; }

    const std::vector<ModuleEstimate>& estimates() const { return estimates_; }

    //- Eq. (17): the hydraulic diameter of a spacer-filled flat channel.
    static scalar hydraulicDiameterEq17(scalar h, scalar eps, scalar Sv);
    //- Eqs. (20)-(22): the porosity of a mesh of cylindrical filaments.
    static scalar porosityFromMesh(scalar h, scalar dF, scalar lM);

private:
    std::string name_, manufacturer_, source_, sourcePath_;
    scalar thickness_ = 0.0, filament_ = 0.0, mesh_ = 0.0;
    scalar porosity_ = 0.0, dh_ = 0.0;
    bool   porosityDerived_ = false;
    SpacerCorrelation mt_, pd_;
    std::vector<ModuleEstimate> estimates_;
};

//- Singleton lookup.  Filled by MembraneModuleRegistry::loadFrom, which scans
//  the same two tiers (the catalogue, then every case-local constant/assets/)
//  -- an element and the spacer it is wound with are read by one scan.
class FeedSpacerRegistry
{
public:
    static void clear();
    static void add(FeedSpacer s);
    static const FeedSpacer& byName(const std::string& name);
    static std::vector<std::string> availableNames();
};

} // namespace Choupo
