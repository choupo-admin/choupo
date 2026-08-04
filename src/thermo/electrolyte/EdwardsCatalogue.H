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

    SPDX-License-Identifier: GPL-3.0-or-later
    Credit and attribution: see AUTHORS
-------------------------------------------------------------------------------
File
    Choupo::electrolyte::EdwardsCatalogue

Description
    Assembles the `EdwardsParameters` set that `EdwardsPitzer` computes with,
    from the curated records under `parameters/EdwardsPitzer/`.

    WHY THIS IS A SEPARATE FILE, and not a method on the model.  Edwards
    MEASURED exactly one family of parameters -- beta0 for LIKE molecule
    pairs, Eq 14 / Table 4 -- plus two tabulated single-ion and molecule-ion
    contributions (Tables 5 and 6).  EVERYTHING else in the matrix Eq 8 sums
    over is ESTIMATED by his Eqs 21-24 from those.  That arithmetic is
    CURATION, not physics: the tree never stores a derivative, and the model
    never invents one.  `EdwardsPitzer.H` says so in its own header; this
    file is where the sentence is honoured.

    THE FIVE RULES, each with the paper's equation and each ANNOUNCED when
    it fires (a student must be able to see which of the five produced any
    given number, because four of them are estimates):

      * (a,a) molecule with itself -- Eq 14, beta0 = E + F/T.  MEASURED.
        The only measured family.  Record: `<molecule>.dat`.
      * (a,b) unlike molecules -- Eq 21, beta0 = 1/2(beta0_aa + beta0_bb).
      * (+,-) unlike-sign ions -- Eq 22 (Bromley 1972),
        beta0 = beta0_+ + beta0_-, from the single-ion contributions of
        Table 5.  Records: `ion-<name>.dat`.  beta1 then follows from
        Eq 24 (Pitzer & Mayorga), beta1 = 0.018 + 3.06 beta0 -- beta1 is
        NEVER an independent datum in this model.
      * (i,j) LIKE-sign ions -- beta0 = beta1 = 0 (Bronsted 1922/1923).
        Not an absence: a stated physical assumption.
      * (m,i) molecule-ion -- Table 6 where the paper tabulates it
        (`mi-<molecule>-<ion>.dat`), otherwise Eq 23,
        beta = beta_molecule + beta_ion.  beta1 = 0 for ANY pair involving
        a molecule ("because experimental data are inadequate").

    A pair no rule can reach stays ABSENT, which Eq 8 reads as zero -- the
    paper's own default for everything it does not tabulate.  Absence is
    reported in the announcement, never silently equated with a measured
    zero.

    TEMPERATURE.  Two of the three measured families move with T and one does
    not: the molecular self-term is Eq 14's E + F/T, and Table 6's molecule-ion
    terms are EITHER a constant OR the quadratic a0 + a1 T + a2 T^2 (the table
    carries both forms, and a record declares which it is).  Only the Table 5
    single-ion contributions are T-independent, and there the paper says so
    explicitly.  So the assembled set is a function of T and is rebuilt when T
    moves, rather than one set being pretended to serve a whole column.

    T IS KELVIN throughout.  That is not an assumption: Table 7's column II
    publishes beta0(NH3,NH4+) = 0.051, which the estimation rule reproduces as
    0.0504 in kelvin and 0.0582 in Celsius.  The "0 to 170 degC" heading on
    Table 6 is its range of VALIDITY, exactly as in Tables 1 and 3.
\*---------------------------------------------------------------------------*/

#pragma once

#include "EdwardsPitzer.H"

#include <iosfwd>
#include <string>
#include <vector>

namespace Choupo {
namespace electrolyte {

//  Build the parameter set for the species actually present, at T.
//
//  `names` and `charges` are the parallel arrays of an IonState: a charge of
//  exactly 0 marks a MOLECULAR solute, anything else an ion.  The classification
//  is by the DECLARED charge and nothing else -- no name matching, no lists.
//
//  `announce`, when non-null, receives one line per resolved pair naming the
//  rule that produced it, plus a summary of the pairs no rule could reach.
EdwardsParameters assembleEdwardsParameters(const std::vector<std::string>& names,
                                            const std::vector<double>& charges,
                                            double T,
                                            std::ostream* announce = nullptr);

//  The model as the factory sees it: default-constructible, assembling its
//  parameters from the catalogue on each evaluate() (memoised per species-set
//  and T) and delegating every equation to the pure EdwardsPitzer kernel.
//
//  The split is deliberate and is the whole point of the pair of files: the
//  kernel stays a function of its parameters, testable against the paper's own
//  closed forms with no filesystem in sight, and this adapter is the only thing
//  that knows a record tree exists.
class EdwardsPitzerModel : public AqueousActivity
{
public:
    const std::string& modelName() const override;
    const std::string& pHScale()   const override;

    ActivityResult evaluate(const IonState& st, double T) const override;

    void announceParameters(const IonState& st,
                            std::ostream& os) const override;
};

} // namespace electrolyte
} // namespace Choupo
