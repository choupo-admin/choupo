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
    Choupo::Ppr78Kij

Description
    THE GROUP-CONTRIBUTION kij OF PPR78 / E-PPR78, EVALUATED ONCE AT A
    DECLARED TEMPERATURE AND WRITTEN INTO THE CASE as a kij SET record the
    phi-phi builder reads (`recordType eosBinaryInteractionSet`).

    WHY AN OP THAT WRITES A FILE, and not a kij(T) inside the cubic (DEV.md
    4c C123, Vitor's ruling of 2026-10-20: "Rota P, kij a T declarada").  A
    temperature-dependent kij evaluated silently inside the EoS is a number
    nobody can read; the route Vitor chose is that every kij a unit runs on
    is a CONSTANT in a file the student opens, evaluated at the temperature
    the unit declares, and the run says which file and which temperature.
    This op is the one place the group arithmetic lives: it reads the
    group-interaction table the case carries as a cited record, the
    molecules' group decompositions, the components' Tc/Pc/omega through the
    engine's OWN PR78 (`PR::mixingLedger` supplies a_i(T) and b_i -- one
    home, so the a_i that prices kij is the a_i the flash runs), and writes
    the matrix with every intermediate beside each value.

    THE EQUATION (Jaubert, Privat & Mutelet, AIChE J. 56 (2010) 3225, Eq. 7;
    Xu, Lasala, Privat & Jaubert, Int. J. Greenh. Gas Control 56 (2017) 126,
    Eq. 4 -- the same form, a different table):

        k_ij(T) = [ E_ij(T) - (delta_i - delta_j)^2 ] / ( 2 delta_i delta_j )
        delta_i = sqrt(a_i(T)) / b_i
        E_ij(T) = -1/2 SUM_k SUM_l (alpha_ik - alpha_jk)(alpha_il - alpha_jl)
                       A_kl (298.15 / T)^(B_kl / A_kl - 1)

    alpha_ik = (occurrences of group k in molecule i) / (groups in molecule
    i); A_kl = A_lk, B_kl = B_lk in MPa (the tables' own unit; multiplied by
    1e6 here because a_i / b_i^2 is in Pa -- the articles leave that factor
    to the reader, and the transcription's checker confirmed it is forced by
    dimensions); A_kk = B_kk = 0, and the k = l terms are SKIPPED, not
    evaluated (0/0 in the exponent, zero prefactor).  A pair whose two
    molecules share every group has E_ij = 0 and a kij set by the delta term
    alone -- which is the equation's own answer, not a gap.

    Dictionary form:

        {
            name        kij_FL2;
            type        ppr78Kij;
            groupTable  "constant/parameters/PPR78/jaubert2010.dat";
            T           322.039 K;              // the unit's declared T
            components  ( N2 CO2 CH4 ... );     // optional: default = the case's
            output      { record "constant/parameters/PengRobinson/ppr78_FL2.dat"; }
        }

    The group table is a record of `recordType ppr78GroupTable` carrying
    `method`, `eos`, `source` (the article, per value), `Tref`, `groups`,
    `interactions ( { k; l; A; B; } ... )` in MPa, `decompositions { <comp>
    { <group> <count>; ... } }` and, optionally, `dataWindows ( { k; l;
    T ( lo hi ); } ... )` -- the T range of the data each pair's parameters
    were fitted on (E-PPR78's Table 2).  A pair needed and not in the table
    REFUSES by name (the table prints "N.A." for three of its pairs); a
    component with no decomposition refuses; a decomposition naming an
    unknown group refuses.  A pair evaluated OUTSIDE its data window is
    written `extrapolated yes;` with the window, and the builder repeats
    that on every run that reads the set.

    WHAT IS NOT DONE.  No SRK transfer (the 2017 article's Eq. 8 gives one;
    the case is PR78 and nothing else reads this), no kij(T) inside the
    cubic, no decomposition is guessed from a formula -- the decompositions
    are DECLARED in the table record, by the curator, because the articles
    print none and a group count derived from a name would be the name-
    identity crossing this project bans.
\*---------------------------------------------------------------------------*/

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>
#include <vector>

namespace Choupo {

class Ppr78Kij : public PropertyOperation
{
public:
    Ppr78Kij() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }
    std::vector<std::string> headline() const override { return headline_; }

private:
    inline static const std::string  type_ = "ppr78Kij";
    std::map<std::string, scalar>    diag_;
    std::vector<std::string>         headline_;
};

} // namespace Choupo
