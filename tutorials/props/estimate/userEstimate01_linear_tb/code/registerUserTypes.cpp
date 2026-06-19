/*--- the case's hook into the factory (build-time, explicit). Registers a
      PropertyOperation -- the props analogue of a custom unit op. ---*/
#include "LinearTbEstimate.H"
#include <memory>
void registerUserTypes()
{
    Choupo::PropertyOperation::registerType(
        "linearTbEstimate", []{ return std::make_unique<Choupo::LinearTbEstimate>(); });
}
