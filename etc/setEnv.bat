@echo off
rem ===========================================================================
rem  setEnv.bat  --  Windows equivalent of etc\bashrc
rem
rem  Sets CHOUPO_HOME and adds bin\ to PATH for the current CMD
rem  session, so that runCase, listCases and cleanCase are callable without
rem  the bin\ prefix.
rem
rem  Usage (run from project root, in a CMD prompt):
rem      etc\setEnv.bat
rem
rem  Or call it from your own CMD startup script.
rem ===========================================================================

set "SCRIPT_DIR=%~dp0"
for %%i in ("%SCRIPT_DIR%..") do set "CHOUPO_HOME=%%~fi"
set "PATH=%CHOUPO_HOME%;%CHOUPO_HOME%\bin;%PATH%"

echo Choupo environment loaded.
echo   CHOUPO_HOME = %CHOUPO_HOME%
echo   Commands available  : runCase, listCases, cleanCase, choupoSolve
