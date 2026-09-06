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
    Choupo::ModifiedEucken

Description
    Low-pressure gas thermal conductivity by the MODIFIED Eucken relation,
    in the form Svehla (1962) states as his equation (2), report page 3,
    and used for every polyatomic value in his Table III:

        lambda = (R/M) [ 15/4 + 1.32 (Cp/R - 5/2) ] eta
               = lambda' + lambda''
        lambda'  = (15/4) (R/M) eta                 translational, eq. (3)
        lambda'' = 1.32 (R/M)(Cp/R - 5/2) eta       internal,      eq. (4)

    Cp the molar ideal-gas heat capacity, eta the pure gas viscosity, M the
    molar mass.  Rearranged on Cv = Cp - R this is the textbook
    lambda = (eta/M)(1.32 Cv + 1.77 R); the form implemented is Svehla's,
    because his is the equation that was READ (his appendix B derives it).
    Plain Eucken (transport/Eucken.H) is (Cp + 5R/4) eta / M, which on the
    same split reads (15/4)R + 1.00 (Cp - 5R/2): the internal modes carry
    the factor 1.00.  The modified form separates the two contributions and
    weights the internal one by 1.32.  The two agree EXACTLY on a monatomic
    gas (Cp = 5R/2, lambda'' = 0) and differ on every polyatomic one -- which
    is why a second registered model makes the bench's conductivity spread
    a real number for the first time.

    THE ANCHOR THEORY SUPPLIES.  With Cp = 5R/2 the bracket is 15/4 and
    lambda = (15/4) R eta / M exactly -- the Chapman-Enskog monatomic result
    (Chapman & Cowling), the same identity Eucken's verify() holds.  A wrong
    3.75 fails there.  Before returning it, verify() also reproduces
    Svehla's OWN printed lambda for N2 at 300 K (report page 90) from his
    printed eta and Cp/R through eq. (2) and his Table II calorie (report
    page 26: 1 g-cal/(cm s K) = 4.185 J/(cm s K)); that is an ARITHMETIC
    guard on the 1.32 and the unit chain, measured 0.05 % (his lambda is
    printed to three figures), declared at 0.2 %.

    Svehla's summary (report page 1) says of this correction: "Though this
    correction may be rather poor at low temperatures, it becomes more
    satisfactory with increasing temperature."  That sentence is the
    window; nothing here is compared with a measured conductivity.

    PRIMARY: Svehla, R. A. (1962), NASA TR R-132, eqs. (2)-(4), report page
    3, appendix B [equation read; public domain]; Eucken, A. (1913), Physik.
    Z. 14, 324-332 [the original relation]; monatomic limit after Chapman &
    Cowling (1939).
\*---------------------------------------------------------------------------*/

#pragma once

#include "ThermalConductivityModel.H"

namespace Choupo {

class ModifiedEucken : public ThermalConductivityModel
{
public:
    explicit ModifiedEucken(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }

    scalar conductivityGasPure(const Component& c, scalar T_K,
                               scalar mu_pure,
                               scalar cp_ig_pure) const override;
    CorrelationVerify verify() const override;

    //  The kernel, public and static: one home for eq. (2).
    static scalar kernel(scalar cp_ig_J_per_molK, scalar mu_PaS,
                         scalar M_kg_per_mol);                // W/(m K)

    //  Svehla's Table II calorie, report page 26: 1 g-cal = 4.185 J.  His
    //  own conversion, used to read his printed lambda; not a physics claim.
    static constexpr scalar SVEHLA_CAL_J = 4.185;
    //  The reproduction guard's declared tolerance (his lambda has three
    //  significant figures; 0.05 % was measured 2026-09-06).
    static constexpr scalar SVEHLA_TOLERANCE = 2.0e-3;

private:
    inline static const std::string name_ = "modifiedEucken";
    inline static const std::string window_ =
        "dilute (low-pressure) gas; EXACT for a monatomic gas (Cp = 5R/2 "
        "gives the Chapman-Enskog (15/4) R mu / M) and the form Svehla 1962 "
        "used for every polyatomic gas in NASA TR R-132, whose own summary "
        "says it 'may be rather poor at low temperatures' and improves as T "
        "rises; needs the record's idealGasHeatCapacity and a gas viscosity";
    inline static const std::string cite_ =
        "Svehla, R. A. (1962), Estimated viscosities and thermal "
        "conductivities of gases at high temperatures, NASA TR R-132, eqs. "
        "(2)-(4) report page 3 and appendix B [equation read; public domain]; "
        "Eucken, A. (1913), Physik. Z. 14, 324-332 [the relation]; monatomic "
        "limit after Chapman, S. and Cowling, T. G., The Mathematical Theory "
        "of Non-uniform Gases (1939)";
};

} // namespace Choupo
