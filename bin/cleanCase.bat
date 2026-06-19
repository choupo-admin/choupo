# =============================================================================
#        \|/       C hemicals     | Open-source, glass-box chemical process simulator
#       \\|//      H eat-transfer | https://choupo.org
#      \\\|///     O perations    |
#       \\|//      U nits         | Copyright (C) 2026 Vítor Geraldes
#        \|/       P roperties    | Licence: GPL-3.0-or-later
#         |        O ptimization  |
#        /|\                      |
# -------------------------------------------------------------------------------
# License
#     This file is part of Choupo.
#
#     Choupo is free software: you can redistribute it and/or modify it
#     under the terms of the GNU General Public License as published
#     by the Free Software Foundation, either version 3 of the License, or
#     (at your option) any later version.
#
#     Choupo is distributed in the hope that it will be useful, but WITHOUT
#     ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
#     FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public
#     License for more details (https://www.gnu.org/licenses/gpl-3.0.html).
#
#     SPDX-License-Identifier: GPL-3.0-or-later
#
#     Credit and attribution: see AUTHORS
#     Required legal notices:  see NOTICE
# =============================================================================

@echo off
rem ===========================================================================
rem  cleanCase.bat  --  remove generated output from a case directory
rem
rem  Removes:
rem      log.*       (output of runCase)
rem      *.log       (legacy)
rem
rem  Source files (controlDict, flowsheetDict, thermoPackage, ...) are NEVER
rem  touched.
rem ===========================================================================

setlocal EnableDelayedExpansion

if "%~1"=="" (
    set "TARGET=%cd%"
) else (
    set "TARGET=%~f1"
)

if not exist "%TARGET%" (
    echo cleanCase: '%TARGET%' is not a directory.
    exit /b 1
)

set /a COUNT=0
for %%F in ("%TARGET%\log.*" "%TARGET%\*.log") do (
    if exist "%%F" (
        del /q "%%F" 2>nul && set /a COUNT+=1
    )
)
echo cleanCase: %COUNT% item(s) removed from %TARGET%
