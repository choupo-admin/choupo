===============================================================================
  Choupo  --  Windows distribution  --  v0.14
===============================================================================

  Educational Process Simulator
  Copyright (C) 2026 Vitor Geraldes
  License: GPL-3.0-or-later   (see LICENSE)

-------------------------------------------------------------------------------
  Quick start
-------------------------------------------------------------------------------

  1. Unzip this archive anywhere.  Example: C:\Choupo

  2. Open a Command Prompt (Start menu -> "cmd").

  3. Change to the project directory:

         cd C:\Choupo

  4. Load the environment (sets CHOUPO_HOME and PATH):

         etc\setEnv.bat

  5. List available tutorials:

         listCases

  6. Run one:

         runCase tutorials\flash01_benzene_toluene

  7. Inspect the log:

         more tutorials\flash01_benzene_toluene\log.choupoSolve

-------------------------------------------------------------------------------
  Without setEnv (every command spelled out)
-------------------------------------------------------------------------------

  bin\runCase.bat   tutorials\flash01_benzene_toluene
  bin\listCases.bat
  bin\cleanCase.bat tutorials\flash01_benzene_toluene

  No environment variables to set; the .bat scripts self-locate.

-------------------------------------------------------------------------------
  What's in the archive
-------------------------------------------------------------------------------

  choupoSolve.exe   The simulator binary (static; no DLLs needed).
  bin\                   Windows batch helpers (runCase, listCases, ...).
  etc\setEnv.bat         Optional environment-setup script.
  data\                  Component and material database (text files).
  tutorials\             16 fully-worked cases.
  docs\                  PDF manuals: userGuide, developerGuide, theoryGuide.
  src\                   Full source code (GPL-3.0-or-later obligation).
  LICENSE                GPL-3.0-or-later licence text.
  HOWTO-rebuild.txt      How to rebuild the .exe from source (MSYS2).
  README-windows.txt     This file.

-------------------------------------------------------------------------------
  Documentation
-------------------------------------------------------------------------------

  Start with docs\userGuide.pdf  (12 pages, "running cases").
  Then     docs\theoryGuide.pdf  (20 pages, the maths).
  And      docs\developerGuide.pdf (16 pages, extending the code).

-------------------------------------------------------------------------------
  Troubleshooting
-------------------------------------------------------------------------------

  * "choupoSolve.exe is not recognized as an internal or external command."
    --> You forgot to run etc\setEnv.bat, or you ran it in a *different*
        CMD window.  The environment lives only in the CMD it was run in.

  * "runCase: choupoSolve.exe not found at C:\..."
    --> The .exe is missing from the archive root.  Re-unzip.

  * Antivirus flags the .exe.
    --> Unsigned MinGW binaries occasionally trigger heuristics.  The source
        is in src\; you can rebuild yourself (see HOWTO-rebuild.txt).

  * A tutorial fails with "Component does not exist: <name>".
    --> The component file is missing from data\components\.  Re-unzip; or
        check that you ran runCase from the project root (or with full paths).

-------------------------------------------------------------------------------
  Licence
-------------------------------------------------------------------------------

  Choupo is GPL-3.0-or-later.  You may use, modify and redistribute it under
  those terms.  See LICENSE for the full text.

  Source code: included in src\ inside this archive.
               Latest version: contact Vitor Geraldes.
