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
    This file is part of Choupo (GPL-3.0-or-later).
-------------------------------------------------------------------------------
Class
    Choupo::ExtractionShortcutOp

Description
    The Kremser-Souders-Brown extraction shortcut of
    `unitOperations/separation/ExtractionShortcut.H` as a bench: the
    arithmetic of a worked example, printed with its intermediate terms, on
    declared numbers.  No property package is needed -- the op evaluates a
    formula and says so.

        {
            name  ex;  type extractionShortcut;
            inputs
            {
                Xf 0.25;  Xr 0.01;  Ys 0.001;  K 0.656;
                extractionFactor 1.85;      // OR  slopes { m1 0.833; mr 0.656; S 199.8; F 80; }
            }
            pseudoSolute { S 199.8; E 198.7; F 80; R 67.5; Ye 0.0983; }   // optional: case B
        }

    Published (diagnostics): `N`, `E`, `fractionTaken`, `fractionRequired`
    (Treybal's form beside the hand ratio), `N_or`, and with `pseudoSolute`
    also `XfB`, `YsB` and `N_caseB`.
\*---------------------------------------------------------------------------*/
/* SPDX-License-Identifier: GPL-3.0-or-later */

#pragma once

#include "PropertyOperation.H"

#include <map>
#include <string>

namespace Choupo {

class ExtractionShortcutOp : public PropertyOperation
{
public:
    ExtractionShortcutOp() = default;

    const std::string& type() const override { return type_; }

    int run(const DictPtr& dict,
            const ThermoPackage& thermo,
            int verbosity) override;

    std::map<std::string, scalar> diagnostics() const override { return diag_; }

private:
    inline static const std::string type_ = "extractionShortcut";
    std::map<std::string, scalar>   diag_;
};

} // namespace Choupo
