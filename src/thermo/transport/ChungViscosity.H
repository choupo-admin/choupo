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
    Choupo::ChungViscosity

Description
    Low-pressure gas viscosity by Chung, Ajlan, Lee & Starling (1988) --
    the corresponding-states realisation of Chapman-Enskog kinetic theory
    that estimates the collision parameters from Tc, Vc and omega:

        eta [muP] = 40.785 F_c sqrt(M T) / (V_c^(2/3) Omega_v)

        Omega_v = 1.16145/T*^0.14874 + 0.52487/e^(0.77320 T*)
                                     + 2.16178/e^(2.43787 T*)    (Neufeld 1972)
        T*      = 1.2593 T / T_c
        F_c     = 1 - 0.2756 omega                (the NON-POLAR truncation)

    PRIMARY: Chung, T.-H., Ajlan, M., Lee, L. L. and Starling, K. E. (1988),
    Ind. Eng. Chem. Res. 27(4), 671-679.  Transcribed here from Reid,
    Prausnitz & Poling, The Properties of Gases and Liquids, 4th ed. (1987),
    eq. 9-4.10, which is the ROUTE and not the source.  Collision integral:
    Neufeld, Janzen & Aziz (1972), J. Chem. Phys. 57(3), 1100-1102, stated
    by its authors for 0.3 <= T* <= 100 -- evaluated from its one home,
    transport/NeufeldOmega.H, which ChapmanEnskog shares.

    TWO THINGS THIS IMPLEMENTATION DOES THAT THE PAPER DOES NOT, and both are
    ANNOUNCED through the AdvisoryLog, once per component per run, naming the
    component (2026-09-05; until then they were a comment):

      (i)  V_c is ESTIMATED.  No record in the catalogue carries a critical
           volume, so V_c = Z_c R T_c / P_c with Z_c = 0.2918 - 0.0928 omega
           -- a correlation for a datum the correlation was written to READ.
      (ii) The polar (mu_r) and association (kappa) terms are DROPPED.  The
           full F_c of the 1988 paper is 1 - 0.2756 omega + 0.059035 mu_r^4
           + kappa; this engine applies the non-polar F_c to every component,
           polar or not, because no record carries a dipole moment either.
           Chung reports the non-polar form to about 1.5 % on non-polar gases
           and degrades on polar ones; this code cannot tell which it has.

    Neither changed a number: the arithmetic is what it was, said aloud.
    Returns Pa.s.
\*---------------------------------------------------------------------------*/

#pragma once

#include "TransportModel.H"

namespace Choupo {

class ChungViscosity : public TransportModel
{
public:
    explicit ChungViscosity(const DictPtr& /*dict*/) {}

    const std::string& modelName() const override { return name_; }
    const std::string& validityWindow() const override { return window_; }
    const std::string& citation() const override { return cite_; }
    scalar viscosityGasPure(const Component& c, scalar T_K) const override;
    CorrelationVerify verify() const override;
    std::string windowNote(const Component& c, scalar T_K) const override;

    //  THE KERNELS, public and static: the same arithmetic the hot path
    //  calls, reachable by the bench, the gate and verify() without a
    //  Component.  One home for the formula.  `neufeldOmega` is a thin call
    //  into neufeld::omega22 (NeufeldOmega.H, the fit's ONE home since
    //  2026-09-06, shared with ChapmanEnskog); it stays on this class so the
    //  kernel reads as the paper writes it.
    static scalar neufeldOmega(scalar Tstar);
    static scalar kernel(scalar M_g_per_mol, scalar Tc_K, scalar Pc_bar,
                         scalar omega, scalar T_K);          // Pa.s

private:
    inline static const std::string name_ = "Chung";
    inline static const std::string window_ =
        "dilute (low-pressure) gas; T* = 1.2593 T/Tc inside the Neufeld "
        "fit's stated domain 0.3 <= T* <= 100; NON-POLAR truncation (the "
        "polar and association terms of the full correlation are not "
        "applied) with Vc ESTIMATED from Zc(omega), both announced per run";
    inline static const std::string cite_ =
        "Chung, T.-H., Ajlan, M., Lee, L. L. and Starling, K. E. (1988), "
        "Ind. Eng. Chem. Res. 27(4), 671-679 [primary]; transcribed via "
        "Reid, Prausnitz & Poling, The Properties of Gases and Liquids, 4th "
        "ed. (1987), eq. 9-4.10; collision integral Neufeld, P. D., Janzen, "
        "A. R. and Aziz, R. A. (1972), J. Chem. Phys. 57(3), 1100-1102";
};

} // namespace Choupo
