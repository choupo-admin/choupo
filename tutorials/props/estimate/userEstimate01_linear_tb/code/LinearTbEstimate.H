/*--- LinearTbEstimate -- a USER-DEFINED property-estimation op living in the
      case's code/. Derives from PropertyOperation (the choupoProps base), so a
      student can ship their OWN estimation method, compiled at case-run time by
      bin/buildCode -- no runtime dlopen, no macros. ---*/
#pragma once
#include "propertyOps/PropertyOperation.H"
#include "core/Dictionary.H"
#include <map>
#include <string>
namespace Choupo {
class LinearTbEstimate : public PropertyOperation
{
public:
    const std::string& type() const override { return type_; }
    int run(const DictPtr& dict, const ThermoPackage& thermo, int verbosity) override;
    std::map<std::string, scalar> diagnostics() const override { return diag_; }
private:
    inline static const std::string type_ = "linearTbEstimate";
    std::map<std::string, scalar> diag_;
};
} // namespace Choupo
