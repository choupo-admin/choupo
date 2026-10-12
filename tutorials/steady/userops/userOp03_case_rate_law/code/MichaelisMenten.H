/*---------------------------------------------------------------------------*\
  MichaelisMenten  --  a USER-DEFINED rate law, living in the case.

  This file is NOT part of the Choupo source tree (src/).  It is written by
  the case author and compiled into a per-case binary by `bin/buildCode`,
  which links code/registerUserTypes.cpp in place of the engine's empty
  stub.  It demonstrates the build-time extension mechanism for KINETICS
  (DEV.md 4c C67): derive from ReactionRate, override netRate(), and
  register the type in registerUserTypes.cpp -- no runtime dlopen, no macro
  magic, the same explicit factory the built-in laws use.

      r = Vmax c_S / (Km + c_S)          [kmol/(m3 s), per reactor volume]

  The same law is written as `type expression;` in constant/reactions
  (`mm_expr`), and that is the route to prefer whenever a law IS a formula:
  it runs on the site, this does not.  This route is for a law that is not
  -- an inner solve, a loop -- and the witness uses a formula only so the
  answer can be checked by hand.

  What a law is handed (thermo/reaction/ReactionRate.H, `RateState`): T, P,
  the concentrations in the CALLER's amount unit (`amountPerKmol` says
  which -- 1000 in a cstr or pfr, which work in mol) and the mole fractions.
  What it returns: the EXTENT rate in that same convention.
\*---------------------------------------------------------------------------*/

#pragma once

#include "thermo/reaction/ReactionRate.H"

#include <cstddef>
#include <string>

namespace Choupo {

class ThermoPackage;

class MichaelisMenten : public ReactionRate
{
public:
    MichaelisMenten(const DictPtr& rxn, const ThermoPackage& thermo,
                    const std::string& who);

    const std::string& typeName() const override;
    scalar netRate(const ThermoPackage& thermo, const RateState& s) const override;
    bool   hasRateConstant() const override { return true; }
    scalar rateConstant(const ThermoPackage&, const RateState&) const override
    { return Vmax_; }

    //  Per reactor volume: a reactor that also declares `catalystLoading`
    //  is refused by the base class's checkLoading().
    std::string declaredBasis() const override { return "reactorVolume"; }

private:
    std::size_t iS_   = 0;      // the substrate
    scalar      Vmax_ = 0.0;    // kmol/(m3 s), SI
    scalar      Km_   = 0.0;    // kmol/m3, SI
};

} // namespace Choupo
