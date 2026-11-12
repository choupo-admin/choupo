#!/usr/bin/env python3
"""Extract the engine's result JSON (between the <<<Choupo:result-begin>>> and
<<<Choupo:result-end>>> markers) from a run log.  Run: python3 extract_json.py log out.json"""
import json, sys
s = open(sys.argv[1], errors="replace").read()
a = s.rfind("<<<Choupo:result-begin>>>")
b = s.rfind("<<<Choupo:result-end>>>")
if a < 0 or b < 0:
    sys.exit("no result block in " + sys.argv[1])
J = json.loads(s[a + len("<<<Choupo:result-begin>>>"):b])
json.dump(J, open(sys.argv[2], "w"), indent=1)
