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
    Choupo::SizeGrid

Description
    THE ONE SIZE AXIS OF A CASE: a geometric sieve stack, declared once.

    A solids flowsheet is a chain of units that each receive a size
    distribution, transform it and hand it on.  That is only well posed if
    they all speak about the SAME classes -- a mill's breakage matrix b_ij,
    a screen's partition curve and a crystalliser's population balance are
    all written class by class, and two units on two different sets of
    classes can only be connected through an interpolation nobody declared.
    So the case declares the axis, once, in `system/flowsheetDict`:

        sizeGrid
        {
            xMax      2.36 mm;     // top edge: the feed's top size
            ratio     1.41421356;  // r = x_{k+1}/x_k  (sqrt 2: the Tyler series)
            nClasses  13;          // INCLUDING the pan
        }

    and every solids stream carries its mass fractions on these classes.
    The classes, in ascending order (the order `psd.diameter` has always had):

        class 0        the PAN       [0,            x_1]   x_1 = xMax / r^(n-1)
        class k >= 1   a sieve cut   [x_k,          x_{k+1}],  x_{k+1} = r x_k
        class n-1      the top cut   [xMax / r,     xMax]

    The representative size of a sieve cut is its geometric mean
    sqrt(x_k x_{k+1}); the pan's is x_1 / sqrt(r), one step further down.
    Those are the sizes the Sauter mean and every size-dependent rate use.

    THE MAPPING ONTO THE GRID CONSERVES MASS EXACTLY, by construction:

      * a continuous law (Rosin-Rammler, log-normal) is INTEGRATED in its
        mass basis over each class: w_k = F3(x_{k+1}) - F3(x_k), so the sum
        telescopes to F3(top) - F3(0) = 1 whatever the quadrature error of F3;
      * a table on other classes is RE-BINNED assuming its mass is uniform in
        ln x inside each of its own classes (uniform in x inside a pan), so
        every source class hands out fractions of itself that sum to one.

    Mass ABOVE xMax is folded into the top class and reported (the grid did
    not cover the powder -- the remedy is a larger xMax); mass below x_1 is
    the pan's by definition.  Nothing is dropped, so the solids balance a
    case prints is never moved by the axis.

    MOMENTS ARE DERIVED HERE AND NOWHERE ELSE (`psdMoments`): d10, d50, d80,
    d90 by log-interpolation of the cumulative mass between class edges (the
    same within-class assumption as the re-binning), the Sauter mean
    d32 = 1 / SUM_k (w_k / xbar_k) on the representative sizes, and the
    volume-specific surface S_v = 6 / d32.  A unit that needs a percentile
    asks this function; the GUI draws what the engine published.

    Design record: docs/design/c361-solids-processing.md.
\*---------------------------------------------------------------------------*/

#pragma once

#include "core/Dictionary.H"
#include "core/Types.H"

#include <string>
#include <vector>

namespace Choupo {

class SizeDistribution;

//  What a mapping did, so the caller can SAY it.
struct SizeGridMapReport
{
    scalar inputSum    = 0.0;   // SUM of the source fractions (1 for a law)
    scalar outputSum   = 0.0;   // SUM of the mapped fractions
    scalar foldedAbove = 0.0;   // fraction that lay above xMax, put in the top class
};

//  The derived quantities of a distribution on classes.  `valid` false when
//  the distribution carries no mass.
struct PsdMoments
{
    bool   valid = false;
    scalar d10 = 0.0, d50 = 0.0, d80 = 0.0, d90 = 0.0;   // mass-passing sizes [m]
    scalar d32 = 0.0;                                    // Sauter mean [m]
    scalar Sv  = 0.0;                                    // 6/d32 [m2/m3 of solid]
};

class SizeGrid
{
public:

    SizeGrid() = default;
    SizeGrid(scalar xMax, scalar ratio, int nClasses);

    //  From the case's `sizeGrid { xMax; ratio; nClasses; }`.  Refuses a
    //  ratio <= 1, fewer than 3 classes, or a non-positive top size.
    static SizeGrid fromDict(const DictPtr& d);

    bool   empty()    const { return edges_.empty(); }
    int    nClasses() const { return static_cast<int>(edges_.size()) - 1; }
    scalar ratio()    const { return r_; }
    scalar xMax()     const { return edges_.empty() ? 0.0 : edges_.back(); }

    //  n+1 ascending edges; edges()[0] == 0 is the pan's lower edge.
    const std::vector<scalar>& edges() const { return edges_; }

    //  n representative sizes (geometric means; the pan one step below x_1).
    const std::vector<scalar>& representative() const { return rep_; }

    //  Is this list of edges THIS grid (relative 1e-9 on every edge)?
    bool sameAs(const std::vector<scalar>& edges) const;

    //  Re-bin a table that lives on its own edges (size m+1, ascending; a
    //  first edge of 0 marks a pan).  Mass conserving; see the header.
    std::vector<scalar> mapTable(const std::vector<scalar>& srcEdges,
                                 const std::vector<scalar>& srcMass,
                                 SizeGridMapReport* rep = nullptr) const;

    //  Integrate a continuous law, in its MASS basis, over every class.
    std::vector<scalar> mapLaw(const SizeDistribution& law,
                               SizeGridMapReport* rep = nullptr) const;

private:

    scalar              r_ = 0.0;
    std::vector<scalar> edges_;
    std::vector<scalar> rep_;
};

//  Edges for a legacy table that carries only representative sizes: the
//  geometric midpoints between neighbours, the two ends one half-step out.
//  NOT a measurement -- whoever calls it must say that the edges were inferred.
std::vector<scalar> inferSizeEdges(const std::vector<scalar>& centres);

//  Representative sizes of a set of edges (geometric means; a pan class
//  [0, e1] is represented one ratio step below e1, the ratio being e2/e1).
std::vector<scalar> representativeSizes(const std::vector<scalar>& edges);

//  The size below which a mass fraction `p` (0..1) lies -- log-linear inside
//  a class, linear in x inside a pan.
scalar passingSize(const std::vector<scalar>& edges,
                   const std::vector<scalar>& massFrac, scalar p);

//  The one home of the moments.  `edges` may be empty: they are then inferred
//  from `centres` (and the caller is responsible for saying so).
PsdMoments psdMoments(const std::vector<scalar>& edges,
                      const std::vector<scalar>& centres,
                      const std::vector<scalar>& massFrac);

} // namespace Choupo
