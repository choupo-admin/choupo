/*---------------------------------------------------------------------------*\
  SystemClassifier -- see SystemClassifier.H.
  SPDX-License-Identifier: GPL-3.0-or-later
\*---------------------------------------------------------------------------*/

#include "thermo/SystemClassifier.H"
#include "thermo/Component.H"

namespace Choupo {

SystemClassification classifySystem(const std::vector<Component>& comps,
                                    const std::vector<std::string>& names,
                                    const std::string& declaredSolvent)
{
    using Kind = ComponentClassification::Kind;
    SystemClassification sc;
    sc.components.reserve(names.size());

    for (std::size_t i = 0; i < names.size(); ++i)
    {
        ComponentClassification cc;
        cc.name = names[i];
        const Component& c = comps[i];

        if (names[i] == declaredSolvent)
        {
            cc.kind = Kind::AqueousSolvent;
            cc.note = names[i] + ": declared aqueous solvent"
                      " (activity-based VLE, a_w * psat)";
        }
        else if (c.aqueousSpeciationDeclared()
                 && c.aqueousSpeciation() != "none")
        {
            cc.kind = Kind::MolecularReactive;
            cc.speciationSet = c.aqueousSpeciation();
            cc.note = names[i] + ": molecular reactive (aqueousSpeciation "
                      + cc.speciationSet + ")";
        }
        else if (c.aqueousSpeciationDeclared())        // == "none"
        {
            cc.kind = Kind::MolecularNonionising;
            cc.note = names[i] + ": molecular condensable, nonionising in"
                      " aqueous speciation";
        }
        else if (c.hasAqueousMapping())
        {
            cc.kind = Kind::ApparentElectrolyte;
            cc.note = names[i] + ": apparent electrolyte (typed bridge to"
                      " ionic species)";
        }
        else if (c.isNonvolatile())
        {
            cc.kind = Kind::Nonvolatile;
            cc.note = names[i] + ": nonvolatile (no aqueous role declared)";
        }
        else
        {
            cc.kind = Kind::Unknown;
            cc.note = names[i] + ": aqueous-speciation fact ABSENT (UNKNOWN)";
        }
        sc.components.push_back(cc);
    }

    for (const auto& cc : sc.components)
        if (cc.kind == Kind::MolecularReactive
         || cc.kind == Kind::ApparentElectrolyte)
            sc.electrolyteSystem = true;

    for (const auto& cc : sc.components)
        sc.report.push_back("[resolver] " + cc.note);

    //  An UNKNOWN molecular component may not coexist with an electrolyte
    //  network: the classifier cannot tell a spectator from a missing acid.
    if (sc.electrolyteSystem)
        for (const auto& cc : sc.components)
            if (cc.kind == Kind::Unknown)
                sc.refusals.push_back(
                    "component '" + cc.name + "' carries NO aqueous-speciation"
                    " fact, inside an electrolyte system -- curate"
                    " `aqueousSpeciation none;` (a molecular non-participant)"
                    " or `aqueousSpeciation <setName>;` (its canonical"
                    " equilibrium set) on the component record.");

    return sc;
}

} // namespace Choupo
