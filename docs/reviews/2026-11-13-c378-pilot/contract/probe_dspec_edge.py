#!/usr/bin/env python3
"""probe_dspec_edge.py <repo root> <scratch dir>: the designSpec of probes.py
P18 with its target at a design point just inside the bound (rich stream 1590
kg/h, w_CO2 0.03996 against the bound 0.04): does a Newton trial cross the
bound, and does the run recover?"""
import re, sys, importlib.util
from pathlib import Path
spec = importlib.util.spec_from_file_location("probes", Path(__file__).with_name("probes.py"))
sys.argv = [sys.argv[0], sys.argv[1], sys.argv[2], "--none--"]
probes = importlib.util.module_from_spec(spec); spec.loader.exec_module(probes)
d = probes.build_dspec("edge_single", 1590.0, 0.10, False)
rc, out = probes.run(d)
W = float(re.findall(r'"W_shaft"\s*:\s*([0-9.eE+-]+)', out)[0])
print("single pass W_shaft", W, "exit", rc)
d = probes.build_dspec("edge", 230.0, 0.04, True, 10.0, W)
rc, out = probes.run(d)
probes.show("designSpec edge", rc, out, [r"alpha", r"status:", r"\[solver\]|ERROR", r"largestShare"], 10)
