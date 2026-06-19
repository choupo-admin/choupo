/*--- StoichReactor -- a USER-DEFINED unit op living in this case's code/.
      A specified-conversion (stoichiometric) reactor: converts `conversion`
      of `reactant` into `product`, 1:1 in moles. Built at case-run time by
      bin/buildCode -- not part of the Choupo source tree. ---*/
#pragma once
#include "unitOperations/UnitOperation.H"
namespace Choupo {
class StoichReactor : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }
    int solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
private:
    inline static const std::string type_ = "stoichReactor";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
};
} // namespace Choupo
