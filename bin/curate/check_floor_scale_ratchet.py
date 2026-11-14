#!/usr/bin/env python3
"""Gate: no NEW division by a quantity floored with a tiny literal.

    bin/curate/check_floor_scale_ratchet.py            # check
    bin/curate/check_floor_scale_ratchet.py --write    # re-pin (say why in the commit)

THE RULE (2026-09-08, CLAUDE.md section 6: "the numerical FLOOR is not a
scale").  A floor written beside a quantity to keep a division finite,
`/ std::max(x, 1e-30)`, turns into the SCALE of the ratio exactly when x is
absent -- and then a round-off residual reads as a number of any size (a
pure helium bed published a carbon dioxide closure of 41 246 936; the
campaign called a correct run NON-CONVERGED over 7e-22 kmol: CI-00, DEV.md
4c, 2026-11-13).  Where there is no scale, publish the ABSOLUTE residual
and no ratio; or normalise by the terms the equation balances, as
src/solver/Convergence.H does.  Never a floor as the denominator.

WHAT IS COUNTED, per file of src/ (.cpp and .H; block comments, comment
lines and `//` tails blanked; judged per STATEMENT, the code joined up to
each `;`, so a call split over lines is one site): a `/` (or `/=`) whose
right operand is a `std::max(...)` call (with or without `<type>`) that has
among its arguments -- two arguments in either order, or the braced
three-or-more form `std::max({ a, b, 1e-15 })` -- a positive literal at or
below 1e-12, bare or wrapped as `scalar(...)`, `double(...)`,
`static_cast<...>(...)` or `<type>{...}`.  The debt is pinned per file in
bin/curate/floor_scale_ratchet_debt.tsv; the ratchet is TWO-SIDED: a count
above its pin fails, a count below it fails asking for the pin to be
lowered in the same commit, a file not in the table with a count fails.

IT DOES NOT CLASSIFY: a pinned site may be harmless (a quantity that is
never zero where it is read) or a CI-00 waiting to happen; the gate says
neither, it only stops the number growing.

WHAT IT CANNOT SEE, said here and in its claim: a floor carried by a named
variable (`scale = std::max(x, 1e-12); r = res / scale;`), a floor larger
than 1e-12, a floor spelled as a named constant, `std::fmax`, a ternary
guard (`x > 0 ? r / x : 0`, which is not a floor and not counted), and
anything outside src/.

ITS OWN FIXTURES (every run): the shapes that must be caught, and the
shapes that must not, are classified first; the gate FAILS if any answer
is wrong.

SABOTAGES, each by hand, restored:
  S1 `const scalar zz = a / std::max(b, 1.0e-30);` added to a source file
     -> FAIL (NEW, count above its pin)
  S2 one floored division removed from a pinned file without lowering its
     pin -> FAIL (PAID, lower the pin)
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEBT = ROOT / "bin" / "curate" / "floor_scale_ratchet_debt.tsv"
NAME = "check_floor_scale_ratchet"
SCAN = ROOT / "src"
LIMIT = 1.0e-12
DIV_MAX = re.compile(r"/=?\s*std::max\s*(<[^<>()]*>)?\s*\(")
NUM = r"[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?"
FLOOR = re.compile(
    r"(?:(?:scalar|double|float)\s*[({]\s*|static_cast\s*<[^<>]*>\s*\(\s*)?"
    r"(" + NUM + r")\s*[)}]?")
BLOCK = re.compile(r"/\*.*?\*/", re.S)
COMMENT = re.compile(r"^\s*(//|\*)")
STRING = re.compile(r'"(\\.|[^"\\])*"')

MUST = [
    "r = a / std::max(b, 1.0e-30);",
    "r = a / std::max(1e-30, b);",
    "r = a / std::max(b, scalar(1.0e-30));",
    "r = a / std::max(b, static_cast<scalar>(1e-20));",
    "r = a / std::max<scalar>(b, 1e-15);",
    "r = std::abs(aF - a0)\n    / std::max({ a0, aF, 1.0e-15 });",
    "r /= std::max(b, 1e-12);",
    "f(a / std::max(b, scalar{1e-14}), c);",
]
MUST_NOT = [
    "r = a / std::max(b, 1.0e-6);",
    "r = a / std::max(b, c);",
    "r = std::max(b, 1e-30);",
    "r = a * std::max(b, 1e-30);",
    "r = (b > 0.0) ? a / b : 0.0;",
    "// r = a / std::max(b, 1e-30);",
    "/* r = a / std::max(b, 1e-30); */",
    'msg = "a / std::max(b, 1e-30);";',
    "r = a / std::max(b, 0.0);",
]


def call_args(text, open_paren):
    """Top-level arguments of the call whose `(` is at `open_paren`."""
    depth, args, cur = 0, [], []
    for i in range(open_paren, len(text)):
        c = text[i]
        if c in "([{":
            depth += 1
            if depth == 1:
                continue
        elif c in ")]}":
            depth -= 1
            if depth == 0:
                args.append("".join(cur).strip())
                return args
        elif c == "," and depth == 1:
            args.append("".join(cur).strip())
            cur = []
            continue
        cur.append(c)
    return None


def is_floor(arg):
    m = FLOOR.fullmatch(arg.strip())
    if not m:
        return False
    v = float(m.group(1))
    return 0.0 < v <= LIMIT


def floored(stmt):
    n = 0
    for m in DIV_MAX.finditer(stmt):
        args = call_args(stmt, m.end() - 1)
        if not args:
            continue
        if len(args) == 1 and args[0].startswith("{") and args[0].endswith("}"):
            args = [a.strip() for a in args[0][1:-1].split(",")]
        if any(is_floor(a) for a in args):
            n += 1
    return n


def classify(text):
    text = BLOCK.sub(lambda m: "\n" * m.group(0).count("\n"), text)
    lines = []
    for line in text.splitlines():
        lines.append("" if COMMENT.match(line)
                     else STRING.sub('""', line.split("//")[0]))
    return sum(floored(s) for s in " ".join(lines).split(";"))


def count():
    found, files = {}, 0
    for p in sorted(SCAN.rglob("*")):
        if p.suffix not in (".cpp", ".H") or not p.is_file():
            continue
        files += 1
        n = classify(p.read_text(errors="replace"))
        if n:
            found[p.relative_to(ROOT).as_posix()] = n
    return found, files


def main() -> int:
    wrong = [f for f in MUST if classify(f) != 1] \
        + [f for f in MUST_NOT if classify(f) != 0]
    if wrong:
        print(f"{NAME}: FAIL -- {len(wrong)} fixture(s) misclassified:")
        for f in wrong:
            print(f"  WRONG  {f!r}")
        return 1
    found, files = count()
    if files < 300:
        print(f"{NAME}: FAIL -- only {files} source files under src/; a collapsed"
              " scan cannot vouch for anything")
        return 1
    if "--write" in sys.argv[1:]:
        lines = ["# file\tcount -- the debt of check_floor_scale_ratchet (CI-00d, 2026-11-13);",
                 "# divisions by std::max(<quantity>, <literal <= 1e-12>).  It may only",
                 "# shrink: lower a count in the commit that removes a site."]
        lines += [f"{k}\t{v}" for k, v in sorted(found.items())]
        DEBT.write_text("\n".join(lines) + "\n")
        print(f"{NAME}: WROTE {len(found)} pin(s) to {DEBT.relative_to(ROOT)}")
        return 0
    if not DEBT.exists():
        print(f"{NAME}: FAIL -- {DEBT.relative_to(ROOT)} is missing")
        return 1
    pins = {}
    for line in DEBT.read_text().splitlines():
        if line and not line.startswith("#"):
            f, n = line.split("\t")
            pins[f] = int(n)
    grew = [(f, pins.get(f, 0), v) for f, v in found.items() if v > pins.get(f, 0)]
    shrank = [(f, n, found.get(f, 0)) for f, n in pins.items() if found.get(f, 0) < n]
    if grew or shrank:
        print(f"{NAME}: FAIL -- {len(grew)} file(s) divide by a floored quantity beyond"
              f" their pin, {len(shrank)} pin(s) above what the file now holds.")
        for f, pin, now in sorted(grew):
            print(f"  NEW     {f}: {now} (pinned {pin}) -- the numerical floor is not a"
                  " scale (2026-09-08): where there is no scale publish the absolute"
                  " residual and no ratio, or normalise by the terms the equation"
                  " balances as src/solver/Convergence.H does")
        for f, pin, now in sorted(shrank):
            print(f"  PAID    {f}: {now} (pinned {pin}) -- lower the pin in"
                  f" {DEBT.relative_to(ROOT)} in this commit")
        return 1
    print(f"{NAME}: OK -- {files} files of src/ hold {sum(found.values())} division(s)"
          f" by a quantity floored with a literal <= 1e-12 (std::max, two-argument"
          f" either order or braced list, the literal bare or cast) in {len(found)}"
          f" file(s), each within its pin; none new; {len(MUST)} must-catch and"
          f" {len(MUST_NOT)} must-not fixtures right.  NOT CLASSIFIED: whether a pinned"
          " site is harmless or a floor acting as a scale.  NOT CHECKED: a floor held"
          " by a named variable and divided by later, a floor above 1e-12 or spelled"
          " as a named constant, std::fmax, anything outside src/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
