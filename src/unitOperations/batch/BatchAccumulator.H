/*---------------------------------------------------------------------------*\
       \|/       C hemicals     | Open-source, glass-box chemical process simulator
      \\|//      H eat-transfer | https://choupo.org
     \\\|///     O perations    |
      \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
       \|/       P roperties    | Licence: GPL-3.0-or-later
        |        O ptimization  |
       /|\                      |
-------------------------------------------------------------------------------
License
    This file is part of Choupo.

    Choupo is free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Choupo is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
    FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
    License for more details (https://www.gnu.org/licenses/gpl-3.0.html).

    SPDX-License-Identifier: GPL-3.0-or-later

    Credit and attribution: see AUTHORS
    Required legal notices:  see NOTICE
-------------------------------------------------------------------------------
Class
    Choupo::BatchAccumulator

Description
    A passive batch vessel --- a receiver / accumulator tank.  It does
    nothing on its own (`step()` is a no-op): its contents change ONLY by
    being charged, either by a recipe `transfer` or, continuously, by a
    still that routes its condensed vapour here via `dischargeTo`.
    So it is the distillate-receiver tank of a batch distillation: open the
    still's `dischargeTo` onto an accumulator and the collected distillate
    (amount + composition) accumulates step by step.

    Starts empty by convention (`totalMoles 0`); a non-zero initial charge
    with a composition block is also accepted.
\*---------------------------------------------------------------------------*/

#pragma once

#include "BatchUnitOperation.H"

namespace Choupo {

class BatchAccumulator : public BatchUnitOperation
{
public:
    BatchAccumulator() = default;

    const std::string& type() const override { return type_; }

    void initialise(const DictPtr&        unitDict,
                    const ThermoPackage&  thermo,
                    const DictPtr&        reactionsDict) override;

    // Passive: only chargeFrom() (recipe transfer or a still's continuous
    // dischargeTo) changes the contents.
    void step(scalar /*t*/, scalar /*dt*/) override {}

    const BatchState& state() const override { return state_; }

protected:
    BatchState& mutableState() override { return state_; }

private:
    inline static const std::string type_ = "batchAccumulator";

    BatchState state_;
};

} // namespace Choupo
