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
Description
    THE ONE SPLIT EVERY SIZE CLASSIFIER PERFORMS (DEV.md 4c C361 slice 3).

    `classifier`, `screen` and `hydrocyclone` differ only in how they obtain
    the partition a_k (a declared curve, Karra's screen model).  Once a_k is
    known, the split is King's
    mass balance over each class (2001, eqs. 4.20-4.29, pp. 86-87):

        coarse_k = a_k f_k m_s          fine_k = f_k m_s - coarse_k

    f_k the feed's mass fraction in class k and m_s its solids mass flow.
    The fine product is computed as the DIFFERENCE, so coarse + fine = feed
    holds per class to the last bit: a classifier creates and destroys no
    mass, and the closure printed is the arithmetic's, not a tolerance.

    The fluid (everything in the feed that is not solid) is split by ONE
    fraction R_fl to the coarse product, the same for every fluid component:
    a classifier separates by size, not by chemistry.

    SOLIDS ARE ONE POPULATION (design record 2.3, still deferred): each solid
    component splits in the same proportion Y = SUM_k a_k f_k, because one
    distribution describes them all.  A two-mineral feed is classified as one
    material, and every unit built on this says so in its header.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "streams/ProcessStream.H"
#include "result/UnitProfile.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class ThermoPackage;

struct ClassifierFeed
{
    scalar F = 0.0, T = 0.0, P = 0.0, vf = 0.0;
    sVector z;                       // the FLUID's mole fractions (F is the fluid flow)
    sVector s;                       // solid molar flows [kmol/s]
    sVector fluid;                   // fluid molar flows [kmol/s] = F z
    std::vector<scalar> edges, xRep, w;   // the grid and the feed's fractions
    scalar mSolids = 0.0;            // [kg/s]
    scalar mFluid  = 0.0;            // [kg/s]
};

//  Read the unit's feed: refuses (naming `owner`) a feed with no solids, a
//  distribution not on the case's size grid, and a vapour-bearing fluid.
ClassifierFeed readClassifierFeed(const DictPtr& dict, const ThermoPackage& thermo,
                                  const std::string& owner);

//  The cumulative mass fraction of the feed passing size x [m]: the grid's
//  own within-class assumption (uniform in ln x inside a sieve class, uniform
//  in x inside the pan), so it agrees with `passingSize` and the moments.
scalar fractionPassing(const std::vector<scalar>& edges,
                       const std::vector<scalar>& w, scalar x);

struct ClassifierSplit
{
    ProcessStream coarse, fine;
    std::vector<scalar> coarseW, fineW;   // mass fractions of each product
    std::vector<scalar> coarseFlow, fineFlow;  // class mass flows [kg/s]
    scalar Y = 0.0;                       // solids mass to the coarse product
    scalar sizeClosure  = 0.0;            // max_k |coarse_k + fine_k - feed_k| / m_s
    scalar fluidClosure = 0.0;            // |coarse + fine - feed| fluid / feed fluid
};

ClassifierSplit splitOnPartition(const ClassifierFeed& feed,
                                 const std::vector<scalar>& actual,
                                 scalar fluidToCoarse,
                                 const ThermoPackage& thermo,
                                 const std::string& coarseName,
                                 const std::string& fineName);

//  The KPIs and the profile every classifier publishes, with the product
//  names it uses (`underflow`/`overflow`, `oversize`/`undersize`,
//  `coarse`/`fine`).
void publishClassification(std::map<std::string, scalar>& kpis,
                           UnitProfile& prof,
                           const ClassifierFeed& feed,
                           const std::vector<scalar>& corrected,
                           const std::vector<scalar>& actual,
                           scalar bypass, scalar fluidToCoarse,
                           const ClassifierSplit& sp,
                           const std::string& coarseWord,
                           const std::string& fineWord);

//  The class table a classifier prints at verbosity >= 2.
void printClassTable(const ClassifierFeed& feed,
                     const std::vector<scalar>& corrected,
                     const std::vector<scalar>& actual,
                     const ClassifierSplit& sp,
                     const std::string& coarseWord,
                     const std::string& fineWord);

} // namespace Choupo
