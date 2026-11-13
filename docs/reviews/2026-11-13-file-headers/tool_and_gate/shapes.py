# usage: shapes.py <repo-root> <scratch-dir>   -- runs the tool's own plan() on shaped inputs
import sys, os, subprocess, ast
root, out = sys.argv[1], sys.argv[2]
sys.path.insert(0, root + "/bin/curate")
import add_source_headers as A, source_headers_kinds as K
an = K.authors()
d = out + "/shapes"; os.makedirs(d, exist_ok=True)
cases = [
 ("py_shebang_coding_doc.py","script-hash",b'#!/usr/bin/env python3\n# -*- coding: latin-1 -*-\n"""Doc."""\nprint("\xe9")\n'),
 ("py_coding_line1.py","script-hash",b'# coding: utf-8\n"""Doc."""\nx=1\n'),
 ("py_doc.py","script-hash",b'"""Doc string."""\nfrom __future__ import annotations\nx=1\n'),
 ("py_bom_shebang.py","script-hash",b'\xef\xbb\xbf#!/usr/bin/env python3\n"""Doc."""\nx=1\n'),
 ("py_bom.py","script-hash",b'\xef\xbb\xbf"""Doc."""\nx=1\n'),
 ("py_crlf.py","script-hash",b'#!/usr/bin/env python3\r\n"""Doc."""\r\nx=1\r\n'),
 ("py_no_trailing_nl.py","script-hash",b'#!/usr/bin/env python3\nx=1'),
 ("py_only_shebang_nonl.py","script-hash",b'#!/usr/bin/env python3'),
 ("py_empty.py","script-hash",b''),
 ("sh_envS.sh","script-hash",b'#!/usr/bin/env -S bash -eu\necho hi\n'),
 ("sh_plain.sh","script-hash",b'set -e\necho hi\n'),
 ("y_docstart.yml","script-hash",b'---\na: 1\n'),
 ("y_directive.yml","script-hash",b'%YAML 1.2\n---\na: 1\n'),
 ("m_usestrict.mjs","script-js",b"'use strict';\nconsole.log(1)\n"),
 ("m_shebang.mjs","script-js",b"#!/usr/bin/env node\n'use strict';\nconsole.log(1)\n"),
 ("t_ref.ts","web-script",b'/// <reference types="node" />\nexport const a: number = 1;\n'),
 ("css_charset.css","web-src",b'@charset "UTF-8";\n.a{color:red}\n'),
 ("b_echo.bat","batch",b'@echo off\r\necho hi\r\n'),
 ("b_noecho.bat","batch",b'echo hi\r\n'),
 ("mk.mk","script-hash",b'all:\n\techo hi\n'),
 ("latin1.py","script-hash",b'# coding: latin-1\nx="\xe9"\n'),
 ("foreign.py","script-hash",b'# Copyright (C) 2019 Someone Else\nx=1\n'),
 ("foreign_lower.py","script-hash",b'# Copyright 2019 Someone Else\n# copyright (c) 2019 Other\nx=1\n'),
 ("foreign_noC.py","script-hash",b'# (c) 2019 Someone Else. MIT licence.\nx=1\n'),
 ("spdx_other.py","script-hash",b'# SPDX-License-Identifier: MIT\nx=1\n'),
 ("cpp_engine.H","engine-cpp",b'#pragma once\nint f();\n'),
 ("cpp_tool.cpp","tool-cpp",b'#include <cstdio>\nint main(){return 0;}\n'),
]
rows=[]
for name, kind, raw in cases:
    try:
        new, note = A.plan(kind, raw, an, name)
    except Exception as e:
        new, note = None, "EXCEPTION %r" % e
    res = new if new is not None else raw
    open(d+"/"+name,"wb").write(res)
    chk=""
    p=d+"/"+name
    if name.endswith(".py"):
        r=subprocess.run([sys.executable,"-c","import ast,sys;src=open(sys.argv[1],'rb').read();t=ast.parse(src);print(repr(ast.get_docstring(t)))",p],capture_output=True,text=True)
        r2=subprocess.run([sys.executable,"-c","import ast,sys;t=ast.parse(open(sys.argv[1],'rb').read());print(repr(ast.get_docstring(t)))","/dev/stdin"],input=raw.decode('latin-1') if False else None,capture_output=True,text=True)
        chk="parse=%s doc=%s"%(r.returncode==0,(r.stdout.strip() or r.stderr.strip().splitlines()[-1:]))
    elif name.endswith(".sh"):
        r=subprocess.run(["bash","-n",p],capture_output=True,text=True); chk="bash-n=%s"%(r.returncode==0)
    elif name.endswith(".yml"):
        r=subprocess.run([sys.executable,"-c","import yaml,sys;print(yaml.safe_load(open(sys.argv[1])))",p],capture_output=True,text=True); chk="yaml=%s %s"%(r.returncode==0,r.stdout.strip() or r.stderr.strip()[-80:])
    elif name.endswith(".mjs"):
        r=subprocess.run(["node","--check",p],capture_output=True,text=True); chk="node--check=%s %s"%(r.returncode==0, r.stderr.strip()[-100:])
    first=res.split(b"\n")[0][:40]
    rows.append((name,kind,note,repr(first),chk, b"\r\n" in res and b"\n" in res.replace(b"\r\n",b"")))
for r in rows: print(" | ".join(str(x) for x in r))
