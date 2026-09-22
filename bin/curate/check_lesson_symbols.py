#!/usr/bin/env python3
"""check_lesson_symbols -- every symbol in an EduTool equation is DEFINED.

WHY THIS EXISTS.  The owner read the EduTools and asked whether a student
would know what the symbols in the equations mean.  Measured, on the day the
question was asked: 133 symbol uses across sixteen lesson modules where the
LETTER never appears outside a formula.  Some of those are harmless -- the
Kremser lesson writes `Y = y/(1-y)` and says in words what a mole ratio is, so
the letter is bound even though a text search cannot see it -- and some are
not: the breakthrough lesson opens on a porosity and a bulk density whose
names appear nowhere in the file.

WHAT THIS GATE CHECKS, and it is deliberately narrow: that every symbol a
`formula` or a derivation `eq` uses appears in the `where` list of that step
or an earlier one.  The `where` field (methods/lessonStep.tsx) is a list of
{sym, means, unit}, drawn under the equation the way a textbook does it.

THE EQUATIONS ARE LaTeX SINCE 2026-09-22, AND THIS PARSER IS THE GAIN THAT
BOUGHT (Vitor's order was the rendering; the reliability came with it).  The
previous extractor guessed symbols out of running monospace text BY SHAPE.
It carried a regex for chemical formulas, a stop-list of short English words,
and a sentence in its own OK line admitting the filter "is occasionally wrong
in both directions" -- it was, in both:

  * `FM / MS` in the Hunter-Nash lever rule matched the chemical-formula
    shape and was skipped, so two symbols a student meets on the diagram were
    never required to be glossed.  They are glossed now, because this parser
    cannot mistake them for a substance.
  * every English word in an annotation had to be listed by hand, and
    anything the list missed was reported as an undefined symbol.

In LaTeX nothing is guessed, because the notation DECLARES what each token
is, and three declarations do the whole job:

  * `\\text{...}` is PROSE.  It is not scanned at all, so the stop-list of
    English words is gone -- a word inside an equation is now marked as one
    rather than recognised as one.
  * `\\ce{...}` (mhchem, which ships inside KaTeX) is a SUBSTANCE.  It is not
    scanned either, so the chemical-formula shape regex is gone -- and with it
    the reason `\\mathrm{VCF}`, `\\mathrm{LUB}` or `\\mathrm{NPSH}` would have
    been read as chemistry, which is exactly what a shape filter does to an
    upright multi-letter symbol.
  * everything else is a SYMBOL, built from an explicit vocabulary of
    operator commands (below).  A command outside that vocabulary REFUSES by
    name rather than being silently classed either way.

A UNIT follows from those three rather than needing a fourth: `[\\text{kW/K}]`
is prose to a reader and is not scanned, while a unit the lesson deliberately
TEACHES is written `\\mathrm{W}` and glossed -- which the Van Heerden page
does, because the point it makes about the watt is that both curves are RATES
of energy.  The gate does not decide which a unit is; the notation does, and
either way it is checked.

WHAT IT STILL CANNOT CHECK, and saying so is the point of the sentence:
  * whether a definition is CORRECT.  "X  the reflux ratio" in the drying
    lesson would pass here and be nonsense on the page.
  * whether it is USEFUL.  "R  the R in the equation" passes.
  * whether the symbol needed defining at all.
  * whether the EQUATION is right.  That it parses is checked by
    gui/tests/lessonTex.test.ts; that it is true is checked by a reader.
A gate that implied more than this would be worse than none.

THE DEBT.  `debt_registry.LESSON_SYMBOLS_UNGLOSSED` is EMPTY and is kept so.
A pinned lesson may not grow new unglossed symbols; an unpinned one must have
none.  A pin that no longer fires is removed, or it becomes a licence.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from debt_registry import LESSON_SYMBOLS_UNGLOSSED          # noqa: E402

ROOT = HERE.parent.parent
LESSONS = ROOT / "gui" / "src" / "ui" / "methods"

#  ------------------------------------------------------------------------
#  THE VOCABULARY.  Three lists, and every LaTeX command a lesson uses must
#  be in one of them or the gate refuses.  An enumeration is the point: the
#  old extractor's judgements were made by regex shape and could not be
#  audited, and these can be read.

#  Commands that are OPERATORS, RELATIONS, DELIMITERS, LAYOUT or SPACING --
#  never a quantity a reader is owed a definition of.
OPERATORS = {
    # structure and layout
    "begin", "end", "hline", "left", "right", "middle",
    "displaystyle", "textstyle", "scriptstyle", "limits", "nolimits",
    "quad", "qquad", "phantom", "hspace", "vspace", "mathstrut",
    "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr",
    # fractions, roots, functions
    "frac", "dfrac", "tfrac", "cfrac", "binom", "sqrt",
    "exp", "ln", "log", "lg", "min", "max", "inf", "sup", "lim",
    "sin", "cos", "tan", "arcsin", "arccos", "arctan",
    "sinh", "cosh", "tanh", "det", "deg",
    "sum", "prod", "int", "iint", "oint", "operatorname",
    # relations and arrows
    "le", "ge", "ne", "neq", "leq", "geq", "ll", "gg", "approx", "sim",
    "simeq", "equiv", "propto", "in", "notin", "subset", "supset",
    "to", "gets", "mapsto", "rightarrow", "leftarrow", "longrightarrow",
    "longleftarrow", "Rightarrow", "Leftarrow", "Leftrightarrow",
    "leftrightarrow", "iff", "implies", "uparrow", "downarrow",
    "rightleftharpoons", "xrightarrow", "xleftarrow",
    # operators and marks
    "cdot", "cdots", "ldots", "dots", "times", "div", "pm", "mp",
    "ast", "star", "circ", "bullet", "partial", "nabla", "infty",
    "angle", "perp", "parallel", "prime", "degree",
    "lvert", "rvert", "lVert", "rVert", "langle", "rangle",
    "lfloor", "rfloor", "lceil", "rceil",
    # the differential.  `\mathrm{d}` is handled separately, by content.
    "mathop",
}

#  Commands whose braced argument is PROSE or a SUBSTANCE and is not scanned.
OPAQUE = {"text", "textrm", "textbf", "textit", "textsf", "mbox",
          "ce", "operatorname", "phantom", "hspace", "label", "tag"}

#  Commands that MODIFY the symbol that follows: the result is one atom.
#  `\Delta T` is a quantity in its own right, not a Delta times a T, and the
#  glosses in the corpus name it that way (`\Delta H_\mathrm{rxn}`).
PREFIX = {"Delta", "bar", "overline", "dot", "ddot", "hat", "tilde", "vec",
          "widehat", "widetilde", "underline"}

#  Commands that ARE symbols: the Greek alphabet plus the few letter-like
#  forms.  Anything else refuses.
SYMBOL_COMMANDS = {
    "alpha", "beta", "gamma", "delta", "epsilon", "varepsilon", "zeta",
    "eta", "theta", "vartheta", "iota", "kappa", "lambda", "mu", "nu", "xi",
    "pi", "varpi", "rho", "varrho", "sigma", "varsigma", "tau", "upsilon",
    "phi", "varphi", "chi", "psi", "omega",
    "Gamma", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Upsilon", "Phi",
    "Psi", "Omega", "ell", "hbar", "imath", "jmath",
}

#  Spacing / punctuation escapes: one non-letter character after a backslash.
SPACING_CHARS = set(", ;:!|{}%&#_^$ ")


class Refusal(Exception):
    pass


# ---------------------------------------------------------------------------
#  Tokenising LaTeX into symbol ATOMS.
#
#  An ATOM is a base (a letter, a Greek command, an upright `\mathrm{...}`
#  multi-letter name, optionally carrying an accent or a `\Delta`) together
#  with its SUBSCRIPT.  A SUPERSCRIPT is dropped, because it is almost always
#  an exponent (`x^2`) and where it is part of the name (`q^*`) the SAME rule
#  is applied to the gloss, so the two still meet.  That is the trick that
#  makes this reliable: the formula and the gloss are the same notation run
#  through the same tokeniser, so a difference of spelling cannot survive it.

def _skip_group(src, i):
    """i points at '{'.  Return the index just past the matching '}'."""
    depth, n = 0, len(src)
    while i < n:
        if src[i] == "{":
            depth += 1
        elif src[i] == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    raise Refusal("unbalanced { }")


def _group(src, i):
    """i points at '{'.  Return (content, index just past '}')."""
    j = _skip_group(src, i)
    return src[i + 1:j - 1], j


def _norm_script(src, i):
    """Read the argument of a `_` or `^` at i (i points just past it)."""
    n = len(src)
    while i < n and src[i] == " ":
        i += 1
    if i >= n:
        return "", i
    if src[i] == "{":
        content, j = _group(src, i)
        return content.strip(), j
    if src[i] == "\\":
        j = i + 1
        while j < n and src[j].isalpha():
            j += 1
        if j < n and src[j] == "{":          # e.g. _\mathrm{lm}
            j = _skip_group(src, j)
        return src[i:j].strip(), j
    return src[i], i + 1


def atoms(tex, where):
    """Every symbol atom in this LaTeX, in order, canonicalised."""
    out, i, n = [], 0, len(tex)
    pending_prefix = None

    def emit(base, i):
        nonlocal pending_prefix
        sub = ""
        # a base may carry sub/superscripts in either order
        while i < n:
            if tex[i] == "_":
                sub, i = _norm_script(tex, i + 1)
            elif tex[i] == "^":
                _, i = _norm_script(tex, i + 1)      # exponent: dropped
            else:
                break
        if pending_prefix == "Delta":
            base = r"\Delta " + base
        elif pending_prefix:
            base = "\\%s{%s}" % (pending_prefix, base)
        pending_prefix = None
        out.append(base + ("_{%s}" % sub if sub else ""))
        return i

    while i < n:
        c = tex[i]
        if c == "\\":
            j = i + 1
            if j < n and not tex[j].isalpha():
                if tex[j] in SPACING_CHARS or tex[j] == "\\":
                    i = j + 1
                    #  `\\[4pt]` -- a row break's optional spacing argument.
                    if tex[j] == "\\" and i < n and tex[i] == "[":
                        i = tex.index("]", i) + 1
                    continue
                raise Refusal(rf"unknown escape '\{tex[j]}' in {where}")
            while j < n and tex[j].isalpha():
                j += 1
            cmd, i = tex[i + 1:j], j
            if cmd == "mathrm":
                while i < n and tex[i] == " ":
                    i += 1
                if i < n and tex[i] == "*":
                    i += 1
                if i >= n or tex[i] != "{":
                    raise Refusal(rf"\mathrm without a braced name in {where}")
                content, i = _group(tex, i)
                #  `\mathrm{d}` is the differential operator, not a symbol.
                if content.strip() == "d":
                    pending_prefix = None
                    continue
                i = emit(r"\mathrm{%s}" % content.strip(), i)
                continue
            if cmd in OPAQUE:
                while i < n and tex[i] in " *":
                    i += 1
                if i < n and tex[i] == "{":
                    i = _skip_group(tex, i)
                elif i < n and tex[i] == "[":
                    i = tex.index("]", i) + 1
                pending_prefix = None
                continue
            if cmd in PREFIX:
                pending_prefix = cmd
                continue
            if cmd in SYMBOL_COMMANDS:
                i = emit("\\" + cmd, i)
                continue
            if cmd in OPERATORS:
                #  `\begin{array}{lll}` -- drop the environment name and the
                #  column spec; they are layout, not mathematics.
                if cmd in ("begin", "end"):
                    while i < n and tex[i] == "{":
                        i = _skip_group(tex, i)
                    if cmd == "begin" and i < n and tex[i] == "{":
                        i = _skip_group(tex, i)
                pending_prefix = None
                continue
            raise Refusal(
                rf"unknown LaTeX command '\{cmd}' in {where} -- add it to "
                "OPERATORS / SYMBOL_COMMANDS / OPAQUE in this gate, or write "
                "the quantity as a symbol")
        if c.isalpha():
            i = emit(c, i + 1)
            continue
        if c in "_^":
            _, i = _norm_script(tex, i + 1)
            continue
        if c in "{} \t\n":
            #  WHITESPACE AND GROUPING DO NOT BREAK AN ACCENT.  `\Delta T` and
            #  `\dot m` are written with a space, and clearing the pending
            #  prefix here silently turned them into a bare `T` and a bare
            #  `m` -- the mass flow and the mass are different quantities and
            #  this tokeniser would have called them one.  It agreed with
            #  itself on both sides, so no gate failure could have shown it.
            i += 1
            continue
        pending_prefix = None
        i += 1
    return out


NUMERIC_SUB = re.compile(r"^(.*)_\{\d+\}$")


def covered(atom, glossed):
    """A gloss covers an atom exactly, or -- for a purely NUMERIC subscript --
    through its base.  `G_1` and `G_2` are two values of the same `G`, and a
    lesson that glosses `G` has said what both are.  A LETTER or WORD
    subscript is a different quantity (`T_\\mathrm{wb}` is not `T`) and gets
    no such licence."""
    if atom in glossed:
        return True
    m = NUMERIC_SUB.match(atom)
    return bool(m) and m.group(1) in glossed


# ---------------------------------------------------------------------------
#  Reading the lesson modules.

RAW = r'String\.raw`([^`]*)`'
STEP = re.compile(r'^\s*n:\s*\d+,\s*$', re.M)


def steps(src):
    idx = [m.start() for m in STEP.finditer(src)]
    idx.append(len(src))
    return [src[idx[i]:idx[i + 1]] for i in range(len(idx) - 1)]


def js_string(lit):
    """One double-quoted JS literal chain -> its text."""
    return "".join(re.findall(r'"((?:[^"\\]|\\.)*)"', lit)) \
        .replace('\\"', '"').replace("\\\\", "\\")


def equations(block, name):
    """Every LaTeX equation in this step, as (role, source).

    A `formula` or `eq` that is NOT a String.raw literal REFUSES.  The old
    extractor read whatever double-quoted chain it found and silently saw
    nothing when the field was renamed or reshaped -- a gate that finds zero
    formulas and reports OK is the permanently-green shape this project has
    already retired one check for."""
    out = []
    for key in ("formula", "eq"):
        for m in re.finditer(key + r':\s*(\S)', block):
            lead = m.group(1)
            if lead == '"':
                lit = re.match(r'((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)',
                               block[m.start(1):]).group(1)
                if js_string(lit).strip() == "":
                    continue            # a derivation step with no equation
                raise Refusal(
                    f"{name}: `{key}:` is a plain string literal.  A lesson "
                    "equation is LaTeX in a String.raw`...` literal -- see "
                    "methods/lessonTex.ts.  A quoted formula is LaTeX this "
                    "gate cannot read, and what it cannot read it must not "
                    "pass over in silence.")
        for m in re.finditer(key + r':\s*' + RAW, block):
            out.append((key, m.group(1)))
    return out


def glossed_in(block, name):
    """The atoms this step's `where` list defines.  A `sym` is LaTeX and is
    tokenised by the SAME tokeniser as the equation, which is what retires the
    old splitting rules: `C_\\mathrm{hot} \\,/\\, C_\\mathrm{cold}` yields two
    atoms because it contains two symbols, not because a rule about slashes
    was written down."""
    out = set()
    for raw in re.findall(r'sym:\s*"((?:[^"\\]|\\.)*)"', block):
        out |= set(atoms(js_string('"%s"' % raw), f"{name} `where`"))
    return out


def audit(path):
    src = path.read_text(encoding="utf-8")
    name = path.name
    seen, missing, n_eq = set(), [], 0
    for block in steps(src):
        seen |= glossed_in(block, name)
        for role, tex in equations(block, name):
            n_eq += 1
            for tok in atoms(tex, f"{name} `{role}`"):
                if not covered(tok, seen) and tok not in missing:
                    missing.append(tok)
    return missing, n_eq


def main() -> int:
    #  COVERAGE FOLLOWS THE ABSTRACTION, NOT THE FILENAME.  A page carrying
    #  LessonStep steps inside a `*Tool.tsx` is a lesson too, and globbing
    #  `*Lesson.ts` alone once made this gate blind to one.
    lessons = sorted(LESSONS.glob("*Lesson.ts"))
    lessons += sorted(f for f in LESSONS.glob("*Tool.tsx")
                      if "LessonStep" in f.read_text(encoding="utf-8"))
    if not lessons:
        print("check_lesson_symbols: FAILED\n  no lesson module found at "
              f"{LESSONS} -- this gate cannot run, and a check that cannot "
              "run must not pass.")
        return 1

    problems, pinned_clean, total_missing, total_eq = [], [], 0, 0
    empty = []
    for f in lessons:
        try:
            miss, n_eq = audit(f)
        except Refusal as e:
            print(f"check_lesson_symbols: FAILED\n  {e}")
            return 1
        #  A `*Lesson.ts` with no equation at all is a lesson whose formulas
        #  this gate is not reading -- a renamed field, a reshaped module, or
        #  a file that should not be globbed as a lesson.  Whatever the cause,
        #  reporting OK over it is the failure this arm exists to prevent.
        #  A `*Tool.tsx` legitimately has none once its steps live in a data
        #  module beside it.
        if n_eq == 0 and f.name.endswith("Lesson.ts"):
            empty.append(f.name)
        total_eq += n_eq
        total_missing += len(miss)
        pinned = f.name in LESSON_SYMBOLS_UNGLOSSED
        if miss and not pinned:
            problems.append(
                f"  {f.name}: {len(miss)} equation symbol(s) with no `where` "
                f"entry: {', '.join(miss)}")
        if not miss and pinned:
            pinned_clean.append(f.name)

    if empty:
        print("check_lesson_symbols: FAILED")
        print("  lesson module(s) in which this gate found NO equation at "
              "all: " + ", ".join(empty) + ".")
        print("  Either the `formula` / `eq` field has been renamed or "
              "reshaped, or the module is not a lesson.  A gate that reads "
              "nothing and reports OK is worse than no gate.")
        return 1

    if problems:
        print("check_lesson_symbols: FAILED")
        for p in problems:
            print(p)
        print("  REMEDY: add a `where: [{ sym, means, unit }]` list to the "
              "step whose equation uses them -- it renders under the "
              "equation.  `sym` is LaTeX, the same notation as the equation. "
              " A lesson that is not ready to be glossed is NAMED in "
              "debt_registry.LESSON_SYMBOLS_UNGLOSSED with its reason.")
        return 1

    if pinned_clean:
        print("check_lesson_symbols: FAILED")
        print("  glossed, but still pinned as unglossed: "
              + ", ".join(pinned_clean) + ".")
        print("  Remove them from debt_registry.LESSON_SYMBOLS_UNGLOSSED -- "
              "a pin that no longer fires is a licence.")
        return 1

    done = len(lessons) - len(LESSON_SYMBOLS_UNGLOSSED)
    print(
        f"check_lesson_symbols: OK -- {done} of {len(lessons)} lesson "
        f"module(s) gloss every symbol their {total_eq} LaTeX equation(s) "
        f"use; {len(LESSON_SYMBOLS_UNGLOSSED)} are NAMED as unglossed in the "
        f"debt registry ({total_missing} symbol(s) outstanding across them) "
        f"and none may grow a new one.  The symbols are READ FROM THE LaTeX, "
        f"not guessed from running text: `\\text{{}}` is prose and is not "
        f"scanned, `\\ce{{}}` is a substance and is not scanned, and every "
        f"other command must be one of the {len(OPERATORS)} enumerated "
        f"operators, {len(SYMBOL_COMMANDS)} symbol commands or "
        f"{len(PREFIX)} accents -- an unknown one REFUSES rather than being "
        f"classed either way.  WHAT THIS DOES NOT CHECK, and it is the half "
        f"that matters: whether a definition is CORRECT, whether it is "
        f"useful, or whether the symbol needed one -- 'X  the reflux ratio' "
        f"in the drying lesson would pass here and be nonsense on the page.  "
        f"Nor whether the EQUATION is right; that it PARSES is "
        f"gui/tests/lessonTex.test.ts, that it is TRUE is a reader.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
