/*--- SharpSplitColumn -- a USER-DEFINED distillation op living in code/.
      A black-box sharp split: the components in `topComponents` go to the
      Top with fraction `recovery`; the rest (and the complement) go to the
      Bottom. Two output streams. Built at case-run time by bin/buildCode. ---*/
#pragma once
#include "unitOperations/UnitOperation.H"
namespace Choupo {
class SharpSplitColumn : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }
    int solve(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }
private:
    inline static const std::string type_ = "sharpSplitColumn";
    std::vector<ProcessStream>    produced_;
    std::map<std::string, scalar> kpis_;
};
} // namespace Choupo
