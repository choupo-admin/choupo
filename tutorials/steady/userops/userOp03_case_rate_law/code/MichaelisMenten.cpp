/*---------------------------------------------------------------------------*\
  MichaelisMenten.cpp  --  see MichaelisMenten.H.  Case-local code.
\*---------------------------------------------------------------------------*/

#include "MichaelisMenten.H"

#include "core/Dimensions.H"
#include "thermo/ThermoPackage.H"

#include <stdexcept>

namespace Choupo {

MichaelisMenten::MichaelisMenten(const DictPtr& rxn, const ThermoPackage& thermo,
                                 const std::string& who)
{
    auto kin = rxn->subDict("kinetics");
    //  Every key this law reads, and it refuses the rest: a key nothing reads
    //  is a comment that looks like a declaration.
    for (const auto& key : kin->keys())
        if (key != "type" && key != "species" && key != "Vmax" && key != "Km")
            throw std::runtime_error(who + ": michaelisMenten reads `species`,"
                " `Vmax` and `Km`; `" + key + "` is not read.");
    iS_   = thermo.indexOf(kin->lookupWord("species"));
    //  Units are checked by the dictionary: Vmax a volumetric reaction rate,
    //  Km a concentration -- both arrive in SI (kmol/(m3 s), kmol/m3).
    Vmax_ = kin->lookupScalar("Vmax", Dims::reactionRate);
    Km_   = kin->lookupScalar("Km",   Dims::concentration);
    if (!(Vmax_ > 0.0) || !(Km_ > 0.0))
        throw std::runtime_error(who + ": michaelisMenten needs Vmax > 0 and Km > 0.");
}

const std::string& MichaelisMenten::typeName() const
{
    static const std::string s = "michaelisMenten";
    return s;
}

scalar MichaelisMenten::netRate(const ThermoPackage&, const RateState& s) const
{
    //  The caller's concentration -> kmol/m3, the law in SI, the answer back
    //  in the caller's amount unit.
    const scalar c = (*s.conc)[iS_] / s.amountPerKmol;
    const scalar r = Vmax_ * c / (Km_ + c);              // kmol/(m3 s)
    return r * s.amountPerKmol;
}

} // namespace Choupo
