/*--- the sector's hook into the factory (build-time, explicit). ---*/
#include "StoichReactor.H"
#include <memory>
void registerUserTypes()
{
    Choupo::UnitOperation::registerType(
        "stoichReactor", []{ return std::make_unique<Choupo::StoichReactor>(); });
}
