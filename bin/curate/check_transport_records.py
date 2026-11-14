#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""check_transport_records.py -- DEV.md 4c C327.

Every liquidViscosity / liquidThermalConductivity record that
bin/curate/transport_fit.py wrote into data/standards/components is held to
its dataset (data/curation/batches/transport_c327/constant/transportDataset.json)
and, where the ThermoML archive cache is reachable, REFIT from the archive:

  * the stored A..E and Tmin/Tmax equal the dataset's parameters and window;
  * D = E = 0 for viscosity, A = E = 0 for conductivity as written;
  * provenance carries origin fitted, review { by none; }, fitGradeBasis
    inSample, a fitGrade equal to the C285 limits (5/10/20 %) on the stated
    max relative error, the C300 cap words (singleTemperature /
    singleLaboratory) exactly when the evidence calls for them, Trange equal
    to the record window, and the stated max error equal to the dataset's;
  * nothing is shipped below `warning` or with fewer than two parameters;
  * with the archive: the refit parameters, max error and window equal the
    stored ones (1e-6 relative).  Without it the line says so -- the
    structural arms still run, and the missing arm is never reported as PASS.

DEV.md 4c C328 adds the surfaceTension arm: every stored
`surfaceTension { A; B; Tc; n; Tmin; Tmax; }` record (sigma = A tau^n +
B tau^(n+1), A = s0, B = 0) is held to the dataset by the same arms
(parameters, window, labels, grade limits, cap words, Trange, stated max
error), refit from the archive where reachable, and THREE SABOTAGES are
applied in memory to a record and must each be refused by name:
parameter-A-changed, grade-label-flipped, window-moved.

Exit 0 pass, 1 fail.  Writes nothing.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import transport_fit  # noqa: E402

if __name__ == "__main__":
    refit = "--no-refit" not in sys.argv
    rc = transport_fit.cmd_verify(refit)
    rc2 = transport_fit.cmd_verify_sigma(refit)
    sys.exit(1 if (rc or rc2) else 0)
