/*---------------------------------------------------------------------------*\
  YieldReactor  --  a USER-DEFINED unit operation, living in the case.

  This file is NOT part of the Choupo source tree (src/).  It is written
  by the case author (the student) and compiled into a per-case binary by
  `bin/buildCase`.  It demonstrates the build-time extension mechanism:
  derive from UnitOperation, override solve(), and register the type in
  registerUserTypes.cpp --- no runtime dlopen, no macro magic.

  What it models: a reactor with a SPECIFIED conversion (a "yield" or
  "stoichiometric" reactor), not a kinetic one.  The built-in CSTR/PFR
  need kinetics (A, Ea); sometimes you just know the conversion from a
  data sheet.  This op converts `conversion` of the limiting reactant to
  the product, 1:1 in moles.
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class YieldReactor : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>      producedStreams() const override { return produced_; }
    std::map<std::string, scalar>   kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "yieldReactor";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
};

} // namespace Choupo
