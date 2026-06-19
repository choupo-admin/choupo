/*---------------------------------------------------------------------------*\
  ComponentSplitter  --  a USER-DEFINED unit operation (case-local code).

  Written by the case author, NOT part of the Choupo source tree.
  Compiled into a per-case binary by `runCase` / `buildCode`.

  What it models: a SHORTCUT separator.  The built-in `splitter` divides
  a stream by a fixed fraction of the TOTAL flow (every component in the
  same proportion).  This op instead splits PER COMPONENT: you give, for
  each component, the fraction recovered to the overhead; the rest goes
  to the bottoms.  It is the classic "shortcut split" used in flowsheet
  synthesis --- a stand-in for a distillation column before you size the
  real thing.  Two outlet streams; no energy balance (overhead and
  bottoms leave at the feed T, P).
\*---------------------------------------------------------------------------*/

#pragma once

#include "unitOperations/UnitOperation.H"

namespace Choupo {

class ComponentSplitter : public UnitOperation
{
public:
    const std::string& type() const override { return type_; }

    int solve(const DictPtr& dict,
              const ThermoPackage& thermo,
              int verbosity) override;

    std::vector<ProcessStream>    producedStreams() const override { return produced_; }
    std::map<std::string, scalar> kpis()            const override { return kpis_; }

private:
    inline static const std::string type_ = "componentSplitter";
    std::vector<ProcessStream>       produced_;
    std::map<std::string, scalar>    kpis_;
};

} // namespace Choupo
