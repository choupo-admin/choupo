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
Functions
    Choupo::membrane::readAqueousSplit
    Choupo::membrane::splitAt
    Choupo::membrane::effectiveRejection

Description
    ONE home for the BORON-IN-REVERSE-OSMOSIS split (DEV.md 4c C198, Stage 1;
    docs/design/boron-in-reverse-osmosis-proposal.md).

    A weak acid (boric acid) crosses a seawater membrane as a small NEUTRAL
    molecule; its conjugate base (borate) is an ANION the membrane rejects like
    a salt.  Which form dominates is the pH against the acid's pKa, so ONE
    apparent component (boron, as B) is carried by two internal forms with
    their OWN rejections:

        alpha = m(base) / (m(acid) + m(base))

    THE FRACTION IS THE PACKAGE'S, NOT THIS FILE'S.  The unit asks the case's
    declared aqueous chemistry (`ThermoPackage::speciateAqueous`, the curated
    record chemistry/BOH4-formation.dat for log K and its enthalpy, the
    declared activity model for gamma) to speciate the module INLET bulk at
    the DECLARED pH.  No chemistry is built here (check_no_unit_chemistry).

    THE REDUCTION, and the conditions under which it is EXACT.  With the
    constant-rejection law (J_s,i = (1 - R_i) J_w c_m,i), one film coefficient
    for both forms (the case declares one diffusivity for the component) and
    the split held at its inlet value along the channel (the declared
    approximation: pH frozen at the inlet, local re-equilibration of the
    acid-base pair), the two forms recombine EXACTLY into the apparent
    component with

        1 - R_eff = (1 - alpha)(1 - R_acid) + alpha (1 - R_base).

    The unit therefore hands the law R_eff for the apparent component and
    reports the forms (permeate and retentate by species) from the same
    algebra.  A law whose per-form passage depends on the local flux
    (solution-diffusion, SDEM) is REFUSED by name, not approximated: R_eff
    would then vary along the channel and this reduction would no longer be
    exact.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <cstddef>
#include <string>
#include <utility>
#include <vector>

namespace Choupo {

class ThermoPackage;

namespace membrane {

//- How the two forms' rejections are obtained (read from `aqueousSplit {
//  rejection { ... } }`).  Exactly one of three modes.
struct AqueousSplitSpec
{
    std::string component;          // the apparent component (boron)
    std::string acid;               // species (H3BO3)
    std::string base;               // species (BOH4)
    scalar      pH       = 0.0;     // declared, free-scale activity pH
    std::string pHSource;           // where the pH comes from (REQUIRED)

    //  mode (a): TWO rated tests of the component at two pH -> both forms.
    std::vector<std::string> testIds;
    //  mode (b): ONE rated test -> the ACID; the base is given.
    std::string acidTest;
    //  ... the base: the same intrinsic rejection as another solute of the
    //  unit (`sameAs NaCl`: an anion rejected like a salt), or a number.
    std::string baseSameAs;
    bool        hasBaseValue = false;
    scalar      baseValue    = 0.0;
    //  mode (c): the acid given as a number too.
    bool        hasAcidValue = false;
    scalar      acidValue    = 0.0;

    bool twoTests() const { return !testIds.empty(); }
};

//- Read and validate `aqueousSplit {}`; refuses by name (unknown key,
//  missing pH / pHSource, ambiguous or incomplete rejection block, a number
//  outside [0, 1]).  `who` opens every refusal.
AqueousSplitSpec readAqueousSplit(const DictPtr& split, const std::string& who);

//- What the package says about the split at one state.
struct SplitState
{
    scalar alpha        = 0.0;   // m_base / (m_acid + m_base)
    scalar logK_T       = 0.0;   // the record's formation log K at T (van't Hoff)
    scalar pKa_thermo   = 0.0;   // = -logK_T, the thermodynamic constant
    scalar pKa_apparent = 0.0;   // pH + log10(m_acid / m_base), concentration-based
    scalar gamma_acid   = 1.0;
    scalar gamma_base   = 1.0;
    scalar I            = 0.0;   // ionic strength, mol/kg
    scalar m_acid       = 0.0;   // mol/kg water
    scalar m_base       = 0.0;
    bool   beyondDomain = false; // the declared model's own band
    std::string domainNote;      // the model's sentence at this I
    std::string pHScale;         // the model's statement of what its pH is
};

//- Speciate a state through the case's declared aqueous chemistry and read
//  the split.  `bulk` pairs a component index with its concentration
//  [kmol/m3]; `rho` is the solution mass density [kg/m3] (water per m3 =
//  rho - sum c_i MW_i).  Every component with a declared `aqueousMapping`
//  (or `dissociatesTo`) is converted to its species totals through that
//  bridge; one without a bridge is REFUSED by name.  The component must map
//  to the declared acid, one-to-one.
SplitState splitAt(const ThermoPackage& thermo,
                   const AqueousSplitSpec& spec,
                   const std::vector<std::pair<std::size_t, scalar>>& bulk,
                   scalar rho, scalar T, scalar pH, int verbosity = 0);

//- 1 - R_eff = (1 - alpha)(1 - R_acid) + alpha (1 - R_base).
scalar effectiveRejection(scalar alpha, scalar R_acid, scalar R_base);

//- The share of the PERMEATE component carried by each form (the retentate,
//  the split being frozen, keeps alpha).
struct SplitPassage
{
    scalar permeateAcidShare = 0.0;
    scalar permeateBaseShare = 0.0;
};
SplitPassage splitPassage(scalar alpha, scalar R_acid, scalar R_base);

} // namespace membrane
} // namespace Choupo
