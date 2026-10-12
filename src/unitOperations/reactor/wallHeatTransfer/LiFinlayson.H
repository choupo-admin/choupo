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
    Choupo::LiFinlayson

Description
    Li & Finlayson's OVERALL bed-side coefficient for the ONE-DIMENSIONAL
    model of a wall-cooled packed tube:

        sphere    U_w d_t / lambda = 2.26 Re^0.8  Pr^0.33 exp(-6 d_p/d_t)
                  0.05 < d_p/d_t < 0.3,   20 < Re < 7600
        cylinder  U_w d_t / lambda = 1.40 Re^0.95 Pr^0.33 exp(-6 d_p/d_t)
                  0.03 < d_p/d_t < 0.2,   20 < Re < 800

    with Re = d_p rho u_s / mu = d_p G / mu (u_s the SUPERFICIAL velocity),
    d_p = 6 V_p / A_p (the equivalent particle diameter), lambda the fluid's
    conductivity.

    WHERE IT WAS READ, AND WHAT WAS NOT.  Li, C.-H. & Finlayson, B.A., "Heat
    transfer in packed beds -- a reevaluation", Chem. Eng. Sci. 32 (1977)
    1055-1066.  The PAPER was NOT read.  The two equations, their windows
    and the definitions of Re_h and d_h were read on 2026-10-12 in A.A.
    Iordanidis, "Mathematical Modeling of Catalytic Fixed Bed Reactors",
    PhD thesis, University of Twente (Twente University Press, 2002),
    Appendix 2.A, part IV ("Overall heat transfer coefficient for 1-D model
    (U_w)"), correlation 2, and the thesis's Nomenclature (Re_h = d_h rho_f
    u_s / mu, d_h = 6 V_p / A_p).  The thesis prints a Pr^0.33 factor; it
    is transcribed as printed.  That source carries, a page earlier, Li &
    Finlayson's SEPARATE wall coefficient h_w of the TWO-dimensional model
    (Nu_w = 0.19 Re^0.79 Pr^0.33 for spheres) -- a different quantity that
    needs an effective radial conductivity beside it, and the wrong one for
    a one-dimensional bed.

    THE SHAPE IS DECLARED (`operation.catalyst.shape sphere|cylinder`): the
    two forms differ by a factor of 1.2 at Re = 100 and their windows
    differ, and which the pellet is cannot be guessed.

    WHAT IT DOES NOT CARRY, said on the run: the correlation was fitted to
    beds whose tube-to-particle ratio and wall temperature were held in a
    laboratory; its scatter is not stated in the source read, so no band is
    published with it.  A point outside a window is EXTRAPOLATED and
    flagged, never clamped.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BedWallHeatTransfer.H"

#include <cmath>
#include <sstream>
#include <stdexcept>

namespace Choupo {

class LiFinlayson : public BedWallHeatTransfer
{
public:
    const std::string& type() const override { return type_; }

    std::string validityWindow() const override
    {
        return sphere_ ? "sphere: 20 < Re_p < 7600, 0.05 < d_p/d_t < 0.3"
                       : "cylinder: 20 < Re_p < 800, 0.03 < d_p/d_t < 0.2";
    }

    std::string citation() const override
    {
        return "Li & Finlayson, Chem. Eng. Sci. 32 (1977) 1055-1066 -- the"
               " 1-D overall coefficient U_w, read in Iordanidis, PhD thesis,"
               " Univ. Twente (2002), App. 2.A part IV, correlation 2 (the"
               " paper itself NOT read)";
    }

    void readParticle(const DictPtr& catalyst, const std::string& who) override
    {
        if (!catalyst || !catalyst->found("shape"))
            throw std::runtime_error(who + ": the wall correlation `LiFinlayson`"
                " has one form for spheres and one for cylinders (different"
                " constants, different windows), and the pellet's shape is not"
                " something it can guess.  Declare `operation { catalyst {"
                " shape sphere; } }` (or `cylinder`).");
        const std::string s = catalyst->lookupWord("shape");
        if (s != "sphere" && s != "cylinder")
            throw std::runtime_error(who + ": `catalyst.shape` must be `sphere`"
                " or `cylinder` for `LiFinlayson` (got '" + s + "') -- the two"
                " shapes its source correlates; any other pellet has no form"
                " here.");
        sphere_ = (s == "sphere");
    }

    Result evaluate(const Context& c) const override
    {
        Result r;
        r.Re = c.dp * c.G / c.mu;
        r.Pr = c.cp * c.mu / c.lambda;
        const scalar ratio = c.dp / c.dt;
        const scalar a = sphere_ ? 2.26 : 1.40;
        const scalar b = sphere_ ? 0.8  : 0.95;
        r.Nu = a * std::pow(r.Re, b) * std::pow(r.Pr, 0.33) * std::exp(-6.0 * ratio);
        r.U  = r.Nu * c.lambda / c.dt;

        const scalar reMax = sphere_ ? 7600.0 : 800.0;
        const scalar rLo   = sphere_ ? 0.05 : 0.03;
        const scalar rHi   = sphere_ ? 0.3  : 0.2;
        std::ostringstream note;
        if (r.Re < 20.0 || r.Re > reMax)
            note << "Re_p = " << r.Re << " outside [20, " << reMax << "]";
        if (ratio < rLo || ratio > rHi)
            note << (note.str().empty() ? "" : "; ") << "d_p/d_t = " << ratio
                 << " outside [" << rLo << ", " << rHi << "]";
        r.inValidity   = note.str().empty();
        r.validityNote = note.str();
        return r;
    }

    VerifyResult verify() const override
    {
        //  ARITHMETIC anchor: the closed form at a stated point, evaluated
        //  independently (Python, 2026-10-12) and written as a literal.  It
        //  proves the transcription of the constants and exponents, never
        //  the physics -- the catalogue holds no measured wall coefficient.
        VerifyResult v;
        v.kind = "arithmetic";
        const scalar Re = 100.0, Pr = 0.70, r = 0.10;
        const scalar a = sphere_ ? 2.26 : 1.40;
        const scalar b = sphere_ ? 0.8  : 0.95;
        v.Nu_choupo = a * std::pow(Re, b) * std::pow(Pr, 0.33) * std::exp(-6.0 * r);
        v.Nu_anchor = sphere_ ? 43.89490396647981 : 54.25424194021822;
        v.dev = std::abs(v.Nu_choupo - v.Nu_anchor) / v.Nu_anchor;
        v.anchor = std::string(sphere_ ? "sphere" : "cylinder")
                 + " form at Re_p = 100, Pr = 0.70, d_p/d_t = 0.10 -- the"
                   " closed form evaluated by hand (a transcription check)";
        return v;
    }

private:
    bool sphere_ = true;
    inline static const std::string type_ = "LiFinlayson";
};

} // namespace Choupo
