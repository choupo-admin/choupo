"""Shared helper for the review scripts: build a scratch choupoProps case with
the shipped component records and run `propertyScan1D` groups on it.

The case lives under a scratch directory given by the caller; nothing in the
tree is written.  Run from the repository root (the binary is ./choupoProps and
CHOUPO_HOME is the current directory)."""
import csv, os, shutil, subprocess

ROOT = os.getcwd()
BIN = os.path.join(ROOT, "choupoProps")

THERMO = """recordType thermophysicalPropertySystem;
schemaVersion 2;
components ( %(comps)s );
equilibrium
{
    formulation gammaPhi;
    liquid { activityModel ideal; standardState pureLiquid; }
    vapour { fugacityModel idealGas; }
}
%(pure)s
"""

ROUTES = {
    "record": "",
    "IF97": "pureFluids { water { method IF97; } }",
    "IAPWS95": "pureFluids { water { method Helmholtz; equation IAPWS95; } }",
}


def make_case(scratch, tag, comps, pure=""):
    d = os.path.join(scratch, "props_" + tag)
    shutil.rmtree(d, ignore_errors=True)
    os.makedirs(os.path.join(d, "system"))
    os.makedirs(os.path.join(d, "constant", "components"))
    for c in comps:
        shutil.copy(os.path.join(ROOT, "data/standards/components", c + ".dat"),
                    os.path.join(d, "constant/components", c + ".dat"))
    if "Helmholtz" in pure:
        shutil.copytree(os.path.join(ROOT, "data/standards/parameters/Helmholtz"),
                        os.path.join(d, "constant/parameters/Helmholtz"))
    open(os.path.join(d, "system/controlDict"), "w").write(
        'application choupoProps;\ndescription "review scratch";\nverbosity 2;\n')
    open(os.path.join(d, "constant/thermoPhysPropDict"), "w").write(
        THERMO % dict(comps=" ".join(comps), pure=pure))
    open(os.path.join(d, tag + ".cho"), "w").write("")
    return d


def scan(d, groups, comps_x, props):
    """groups: list of (P_Pa, [T_K...]); returns list of dicts per group:
    {T: {prop: value or None}}, and the log."""
    comp_txt = " ".join(f"{k} {v!r};" for k, v in comps_x.items())
    ops = []
    for i, (P, Ts) in enumerate(groups):
        ops.append(f"""    {{
        name g{i};
        type propertyScan1D;
        vary {{ variable T; points ( {' '.join(repr(float(t)) for t in Ts)} ); }}
        state {{ P {float(P)!r} Pa; composition {{ {comp_txt} }} }}
        properties ( {' '.join(props)} );
        output {{ file "g{i}.csv"; }}
    }}""")
    open(os.path.join(d, "system/propsDict"), "w").write("operations\n(\n" + "\n".join(ops) + "\n);\n")
    for i in range(len(groups)):
        f = os.path.join(d, f"g{i}.csv")
        if os.path.exists(f):
            os.remove(f)
    r = subprocess.run([BIN, d], capture_output=True, text=True, env=dict(os.environ, CHOUPO_HOME=ROOT))
    log = r.stdout + r.stderr
    out = []
    for i, (P, Ts) in enumerate(groups):
        f = os.path.join(d, f"g{i}.csv")
        res = {}
        if os.path.exists(f):
            rows = list(csv.reader(open(f)))
            hdr = rows[0]
            for T, row in zip(Ts, rows[1:]):
                vals = {}
                for p in props:
                    j = [k for k, h in enumerate(hdr) if h.split(" ")[0].split("[")[0] == p]
                    v = float(row[j[0]]) if j and row[j[0]] not in ("", "nan") else None
                    vals[p] = None if (v is None or v != v) else v
                res[T] = vals
        out.append(res)
    return out, log
