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
\*---------------------------------------------------------------------------*/

#include "thermo/AtomicWeights.H"

#include <map>

namespace Choupo {

scalar atomicWeight(const std::string& symbol)
{
    // IUPAC/CIAAW 2021 conventional values [kg/kmol]; D/T isotopic masses.
    static const std::map<std::string, scalar> k = {
        { "H", 1.008 }, { "D", 2.01410177812 }, { "T", 3.01604928 },
        { "He", 4.002602 }, { "Li", 6.94 }, { "Be", 9.0121831 },
        { "B", 10.81 }, { "C", 12.011 }, { "N", 14.007 }, { "O", 15.999 },
        { "F", 18.998403162 }, { "Ne", 20.1797 }, { "Na", 22.98976928 },
        { "Mg", 24.305 }, { "Al", 26.9815384 }, { "Si", 28.085 },
        { "P", 30.973761998 }, { "S", 32.06 }, { "Cl", 35.45 },
        { "Ar", 39.95 }, { "K", 39.0983 }, { "Ca", 40.078 },
        { "Sc", 44.955907 }, { "Ti", 47.867 }, { "V", 50.9415 },
        { "Cr", 51.9961 }, { "Mn", 54.938043 }, { "Fe", 55.845 },
        { "Co", 58.933194 }, { "Ni", 58.6934 }, { "Cu", 63.546 },
        { "Zn", 65.38 }, { "Ga", 69.723 }, { "Ge", 72.630 },
        { "As", 74.921595 }, { "Se", 78.971 }, { "Br", 79.904 },
        { "Kr", 83.798 }, { "Rb", 85.4678 }, { "Sr", 87.62 },
        { "Y", 88.905838 }, { "Zr", 91.222 }, { "Nb", 92.90637 },
        { "Mo", 95.95 }, { "Tc", 97.0 }, { "Ru", 101.07 },
        { "Rh", 102.90549 }, { "Pd", 106.42 }, { "Ag", 107.8682 },
        { "Cd", 112.414 }, { "In", 114.818 }, { "Sn", 118.710 },
        { "Sb", 121.760 }, { "Te", 127.60 }, { "I", 126.90447 },
        { "Xe", 131.293 }, { "Cs", 132.90545196 }, { "Ba", 137.327 },
        { "La", 138.90547 }, { "Ce", 140.116 }, { "Pr", 140.90766 },
        { "Nd", 144.242 }, { "Pm", 145.0 }, { "Sm", 150.36 },
        { "Eu", 151.964 }, { "Gd", 157.249 }, { "Tb", 158.925354 },
        { "Dy", 162.500 }, { "Ho", 164.930329 }, { "Er", 167.259 },
        { "Tm", 168.934219 }, { "Yb", 173.045 }, { "Lu", 174.9668 },
        { "Hf", 178.486 }, { "Ta", 180.94788 }, { "W", 183.84 },
        { "Re", 186.207 }, { "Os", 190.23 }, { "Ir", 192.217 },
        { "Pt", 195.084 }, { "Au", 196.966570 }, { "Hg", 200.592 },
        { "Tl", 204.38 }, { "Pb", 207.2 }, { "Bi", 208.98040 },
        { "Po", 209.0 }, { "At", 210.0 }, { "Rn", 222.0 },
        { "Fr", 223.0 }, { "Ra", 226.0 }, { "Ac", 227.0 },
        { "Th", 232.0377 }, { "Pa", 231.03588 }, { "U", 238.02891 },
        { "Np", 237.0 }, { "Pu", 244.0 }, { "Am", 243.0 },
        { "Cm", 247.0 }, { "Bk", 247.0 }, { "Cf", 251.0 },
        { "Es", 252.0 }, { "Fm", 257.0 }, { "Md", 258.0 },
        { "No", 259.0 }, { "Lr", 262.0 }, { "Rf", 267.0 },
        { "Db", 268.0 }, { "Sg", 269.0 }, { "Bh", 270.0 },
        { "Hs", 269.0 }, { "Mt", 278.0 }, { "Ds", 281.0 },
        { "Rg", 282.0 }, { "Cn", 285.0 }, { "Nh", 286.0 },
        { "Fl", 289.0 }, { "Mc", 290.0 }, { "Lv", 293.0 },
        { "Ts", 294.0 }, { "Og", 294.0 } };
    auto it = k.find(symbol);
    return it == k.end() ? 0.0 : it->second;
}

} // namespace Choupo
