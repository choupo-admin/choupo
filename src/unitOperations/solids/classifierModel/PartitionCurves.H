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
    Choupo::PartitionCurve   (selectable: whiten, rosinRammler, tabulated)

Description
    THE PARTITION CURVE OF A SIZE CLASSIFIER, AS A SELECTABLE OBJECT
    (DEV.md 4c C361 slice 3; docs/design/c361-solids-processing.md).

    A classifier is described, class by class on the case's size grid, by
    the fraction of each class of the feed that reports to the COARSE
    product (King 2001, section 4.2, p. 86: "the classification function
    c(d_pi) is defined as the mass fraction of material in size interval i
    in the feed which finally leaves in the oversize stream").  Two curves
    are kept apart, because the literature keeps them apart:

      CORRECTED  c_k   the fraction that reports to the coarse product BY
                       CLASSIFICATION -- what this object returns;
      ACTUAL     a_k = R + (1 - R) c_k
                       what the coarse product really receives, R being the
                       BYPASS: the fraction of EVERY class short-circuited to
                       the coarse product.  In a hydrocyclone R is the water
                       recovery to underflow (Kelsall's assumption, Wills &
                       Napier-Munn 2006 eq. 9.15, p. 214, written forward);
                       Nageswararao et al. 2004 eq. 21 is the same algebra
                       written for the overflow, E_oa = C (1 - c), C = 1 - R.

    The unit applies the bypass; this object knows only the corrected curve.
    A continuous curve is evaluated at each class's REPRESENTATIVE size (the
    geometric mean of its edges, King's d_pi); a tabulated curve is given
    class by class and evaluated nowhere else.

    Models:
      whiten        c(d) = 1 - (e^a - 1) / (e^(a d/d50c) + e^a - 2)
                    (Nageswararao, Wiseman & Napier-Munn 2004, eq. 21, p.
                    681, the Whiten form, written for the corrected
                    recovery to underflow).  d50c and the sharpness a.
      rosinRammler  c(d) = 1 - exp(-0.693 (d/d50)^m)
                    (King 2001 eq. 4.41, p. 89; Plitt's form, Nageswararao et
                    al. 2004 eq. 20 with ln 2).  d50 and the sharpness m.
      tabulated     c_k declared class by class (`corrected ( ... )`, the pan
                    first, nClasses values in [0, 1]) -- what a test reports
                    when no law is fitted, and the form of Herbst &
                    Fuerstenau's classifier matrix C (1980, p. 18).
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"
#include "unitOperations/solids/millModel/MillModels.H"   // MillAnchor

#include <functional>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace Choupo {

class PartitionCurve
{
public:
    using Factory = std::function<std::unique_ptr<PartitionCurve>()>;

    virtual ~PartitionCurve() = default;

    virtual const std::string& type() const = 0;
    virtual const std::string& citation() const = 0;
    virtual const std::string& validityWindow() const = 0;

    //  Read the parameters.  `nClasses` is the case grid's, so a tabulated
    //  curve can refuse a list of the wrong length.  `owner` names the unit
    //  in a refusal.
    virtual void readParameters(const DictPtr& partition, std::size_t nClasses,
                                const std::string& owner) = 0;

    //  The CUT SIZE when it comes from somewhere else (a correlation that
    //  predicts d50c, Nageswararao eq. 14): a curve with a cut size takes it,
    //  a tabulated one refuses.
    virtual void setCutSize(scalar d50c) = 0;

    //  Whether the curve's parameters include the cut size (false for a
    //  curve that must receive it from setCutSize before use).
    virtual bool hasCutSize() const = 0;

    //  The corrected fraction to the coarse product of each class, from its
    //  edges (n+1, ascending, the pan's lower edge 0) and representative
    //  sizes (n).
    virtual std::vector<scalar> corrected(const std::vector<scalar>& edges,
                                          const std::vector<scalar>& xRep) const = 0;

    virtual std::string describe() const = 0;

    virtual MillAnchor verify() const = 0;

    static void registerType(const std::string& name, Factory f);
    static std::unique_ptr<PartitionCurve> New(const std::string& name,
                                               const std::string& owner);
    static std::vector<std::string> availableTypes();
    static void registerBuiltins();

private:
    static std::map<std::string, Factory>& registry();
};

//  The sizes at which a partition, given class by class at the representative
//  sizes, crosses a level (0.5 for d50, 0.25 / 0.75 for the imperfection):
//  linear in ln x between neighbouring classes, the first crossing from the
//  fine end.  0 when the curve does not cross the level.
scalar partitionSize(const std::vector<scalar>& xRep,
                     const std::vector<scalar>& partition, scalar level);

} // namespace Choupo
