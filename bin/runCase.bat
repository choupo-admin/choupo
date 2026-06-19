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
rem  runCase.bat  --  one-line case runner (Windows)
rem
rem  Runs choupoSolve.exe on the given case directory, writing the log
rem  inside that directory (log.choupoSolve).
rem
rem  Usage:
rem      bin\runCase.bat                                       (uses %cd%)
rem      bin\runCase.bat tutorials\flash01_benzene_toluene
rem ===========================================================================

setlocal EnableDelayedExpansion

rem ---- Locate the project root (parent of bin\) -----------------------------
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
for %%i in ("%ROOT%") do set "ROOT=%%~fi"
set "EXE=%ROOT%\choupoSolve.exe"
if not exist "%EXE%" set "EXE=%ROOT%\build\win64MinGW\choupoSolve.exe"

if not exist "%EXE%" (
    echo runCase: choupoSolve.exe not found at %ROOT%
    exit /b 2
)

rem ---- Resolve the case directory -------------------------------------------
if "%~1"=="" (
    set "CASE=%cd%"
) else (
    set "CASE=%~f1"
)

if not exist "%CASE%\system\controlDict"  goto :not_a_case
if not exist "%CASE%\system\flowsheetDict" goto :not_a_case

set "LOG=%CASE%\log.choupoSolve"
if exist "%LOG%" (
    echo runCase: %LOG% exists; delete it first or use cleanCase.
    exit /b 1
)

echo Running case: %CASE%
echo   log: %LOG%
set "CHOUPO_HOME=%ROOT%"
"%EXE%" "%CASE%" > "%LOG%" 2>&1
set RC=%ERRORLEVEL%

if %RC% equ 0 (
    echo   done.  Inspect with:  more "%LOG%"
) else (
    echo   FAILED ^(exit %RC%^) -- last 20 lines of log:
    powershell -NoProfile -Command "Get-Content -Tail 20 '%LOG%'"
)
exit /b %RC%

:not_a_case
echo runCase: '%CASE%' is not a case directory ^(missing system\controlDict or system\flowsheetDict^).
exit /b 1
