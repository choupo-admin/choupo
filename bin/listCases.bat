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
rem  listCases.bat  --  list available tutorial cases (Windows)
rem ===========================================================================

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
for %%i in ("%ROOT%") do set "ROOT=%%~fi"
set "TUT=%ROOT%\tutorials"

if not exist "%TUT%" (
    echo listCases: '%TUT%' not found.
    exit /b 1
)

echo.
echo Tutorial cases in %TUT%:
echo.
echo   CASE                                       DESCRIPTION
echo   ----                                       -----------

pushd "%TUT%" >nul
for /d %%D in (*) do (
    set "NAME=%%~nxD"
    set "PADDED=!NAME!                                          "
    set "PADDED=!PADDED:~0,42!"
    set "FD=%%D\system\flowsheetDict"
    set "DESC=-"
    if exist "!FD!" (
        for /f "tokens=* delims= " %%L in ('findstr /R /B "^[A-Za-z]" "!FD!"') do (
            if "!DESC!"=="-" set "DESC=%%L"
        )
    )
    echo   !PADDED! !DESC!
)
popd >nul
