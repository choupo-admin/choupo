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
Class
    Choupo::electrolyte::AqueousGraph

Description
    THE aqueous species-reaction graph, assembled from the records the ENGINE
    itself reads --- and the family views drawn from it.

    WHY THIS EXISTS.  The aqueous network is a BIPARTITE graph, not a tree:
    34 of its 57 equilibria (59 %) are metal-ligand complexes belonging to two
    chemical families at once --- CaSO4 is calcium AND sulfate, FeCO3 is iron
    AND carbonate.  Filing them by family on disk would force an owner for
    each, and whichever axis is chosen the other half of the stories goes
    incomplete: file by metal and carbonate.dat keeps 2 of its 16 equilibria;
    file by ligand and iron.dat ceases to exist.  So the records stay atomic
    (which is also what keeps sealing precise --- a case seals exactly the
    facts it reaches) and the chemical FAMILY becomes a VIEW.  A view can list
    one reaction under `iron` and under `carbonate`; a directory cannot.

    ONE PARSER.  The graph is built here, in the engine, from
    records::scanRecordDir --- the same reader, the same precedence and the
    same sealing semantics the solver obeys.  A second chemistry parser in
    Python or TypeScript would drift from this one; downstream tooling
    consumes the JSON this class emits, and never re-reads the .dat grammar.

    FAMILY PROPAGATION, AND WHY MEDIATORS EXIST.  Families are never stored on
    a record --- they are propagated from a reaction's master participants,
    using the curated roots in metadata/aqueous-navigation.dat (navigation,
    NOT thermodynamics: it lives outside data/standards/, no manifest covers
    it, so a taxonomy edit can never drift a sealed case).  A blind union
    would drop nearly every acid-base reaction into `water`, because H+/OH-
    appear in almost all of them.  Hence the rule:

        families(reaction) = U roots( masters WITHOUT a navigationRole )
        if that set is empty:
        families(reaction) = U roots( the mediator masters )

    which lands NH4 = NH3 + H in `ammonia`, Fe + H2O = FeOH+ + H+ in `iron`,
    and H2O = H+ + OH- --- where water itself is the subject --- in `water`.
    A derived species inherits the families of the reaction that forms it.

    PARAMETERS.  Pitzer/eNRTL records keep the named roles of their own
    formulation (`cation`/`anion`, `a`/`b`/`c`) --- those roles are structural
    information, and are what lets a validator check a charge against an
    interaction kind.  `referencedSpecies` is DERIVED from them here, never
    stored in the file: storing it would be a second home for the same
    reference.

\*---------------------------------------------------------------------------*/

#ifndef Choupo_AqueousGraph_H
#define Choupo_AqueousGraph_H

#include <map>
#include <set>
#include <string>
#include <vector>

namespace Choupo
{
namespace electrolyte
{

//- One node: a species, whether it owns a file or is declared by its reaction
struct GraphSpecies
{
    std::string              id;             // the catalogue key
    std::string              formula;        // display / elemental check
    double                   charge = 0.0;   // explicit, never inferred
    std::string              home;           // the file it was read from
    bool                     isMaster = false;
    std::vector<std::string> families;       // curated (master) or inherited
    std::string              navigationRole; // protonMediator, solventMediator
};

//- One edge: an equilibrium, of whichever physical kind
struct GraphReaction
{
    std::string                                    id;          // file stem
    std::string                                    recordType;  // kind kept distinct
    std::string                                    product;     // species formed
    std::vector<std::pair<std::string, double>>    masters;     // id, nu
    double                                         nuWater = 0.0;
    double                                         logK25  = 0.0;
    bool                                           hasDH   = false;
    double                                         dH      = 0.0;
    std::string                                    source;
    std::vector<std::string>                       families;    // propagated
    std::string                                    topic;       // derived
    std::string                                    home;
};

//- One interaction parameter, with its species references derived from roles
struct GraphParameter
{
    std::string              model;
    std::string              kind;               // beta/theta/psi/lambda/zeta
    std::vector<std::string> referencedSpecies;  // DERIVED from named roles
    std::string              roles;              // the roles as written
    std::string              source;
    std::string              home;
};

class AqueousGraph
{
public:

    //- Assemble from the records the engine reads (honours case/sealing)
    static AqueousGraph build();

    //- The whole graph as JSON, for docs / GUI / downstream formatting
    void writeJson(const std::string& path) const;

    //- One family's complete story, to stdout
    int printFamily(const std::string& family) const;

    //- Every family the graph knows, with its counts
    void printFamilyIndex() const;

    const std::vector<GraphSpecies>&   species()    const { return species_; }
    const std::vector<GraphReaction>&  reactions()  const { return reactions_; }
    const std::vector<GraphParameter>& parameters() const { return params_; }

    //- Diagnostics collected while building (missing roots, unknown refs)
    const std::vector<std::string>& findings() const { return findings_; }

private:

    std::vector<GraphSpecies>   species_;
    std::vector<GraphReaction>  reactions_;
    std::vector<GraphParameter> params_;
    std::vector<std::string>    findings_;

    const GraphSpecies* find(const std::string& id) const;
    std::set<std::string> familiesOf(const std::string& family) const;
};

} // namespace electrolyte
} // namespace Choupo

#endif
