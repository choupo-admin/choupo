/*--- the sector's hook into the factory (build-time, explicit). ---*/
#include "SharpSplitColumn.H"
#include <memory>
void registerUserTypes()
{
    Choupo::UnitOperation::registerType(
        "sharpSplitColumn", []{ return std::make_unique<Choupo::SharpSplitColumn>(); });
}
