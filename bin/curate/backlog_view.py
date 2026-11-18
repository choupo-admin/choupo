#!/usr/bin/env python3
# Copyright (C) 2026 Vítor Geraldes
# SPDX-License-Identifier: GPL-3.0-or-later
"""backlog_view: render BACKLOG.tsv as one self-contained HTML page, in priority order.

A VIEW of the backlog (DEV.md 4c C436), never a second home: every number and
word on the page is read from BACKLOG.tsv at render time.  The page shows the
items in progress (rank 0), then the open and partial items by rank, each with
its size, its reason for that place and what is missing; closed items are
counted, not listed.

    bin/curate/backlog_view.py OUT.html
"""
import csv, html, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCAN_ROOTS = ("BACKLOG.tsv",)
SIZE = {"S": ("horas", "#2f6b4f"), "M": ("um dia", "#9a5b00"), "L": ("vários dias", "#a3332b")}


def main():
    if len(sys.argv) != 2:
        print(__doc__); return 2
    rows = list(csv.DictReader((ROOT / "BACKLOG.tsv").open(), delimiter="\t"))
    open_ = [r for r in rows if r["status"] in ("OPEN", "PARTIAL")]
    open_.sort(key=lambda r: (int(r["rank"]), int(r["item"][1:])))
    count = {s: sum(1 for r in rows if r["status"] == s) for s in ("DONE", "PARTIAL", "OPEN", "DROPPED")}
    e = html.escape

    def row(r):
        sz, col = SIZE.get(r["size"], ("?", "#5d6a62"))
        rank = "▶" if r["rank"] == "0" else r["rank"]
        st = "parcial" if r["status"] == "PARTIAL" else "aberto"
        return (f'<tr><td class="k">{rank}</td><td><b>{e(r["item"])}</b> {e(r["title_pt"])}'
                f'<div class="y">{e(r["why_pt"])}</div>'
                + (f'<div class="n">Falta: {e(r["open_pt"])}</div>' if r["open_pt"] else "")
                + f'</td><td><span class="p" style="color:{col}">{sz}</span><br><span class="s">{st}</span></td></tr>')

    now = [r for r in open_ if r["rank"] == "0"]
    nxt = [r for r in open_ if 1 <= int(r["rank"]) <= 15]
    later = [r for r in open_ if int(r["rank"]) > 15]

    def table(title, lst):
        return (f"<h2>{title} <small>{len(lst)}</small></h2><table>"
                + "".join(row(r) for r in lst) + "</table>") if lst else ""

    page = f"""<!doctype html><html lang="pt"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Backlog do Choupo</title>
<style>
body{{font:14px system-ui,sans-serif;margin:0;padding:12px;background:#f6f7f4;color:#1d2420}}
@media (prefers-color-scheme:dark){{body{{background:#131815;color:#e4ebe6}} .y{{color:#7cc4a0!important}} td{{border-color:#2c352f!important}}}}
h1{{font-size:18px;margin:0 0 4px}} h2{{font-size:15px;margin:16px 0 6px}} h2 small{{font-weight:400;opacity:.6}}
.c{{opacity:.75;font-size:12.5px}} table{{border-collapse:collapse;width:100%}}
td{{padding:6px 4px;border-bottom:1px solid #dde3dc;vertical-align:top}} td.k{{width:22px;font-weight:600;opacity:.7}}
.y{{color:#2f6b4f;font-size:12.5px}} .n{{opacity:.7;font-size:12.5px}} .p{{font-size:12px;font-weight:600;white-space:nowrap}} .s{{font-size:11.5px;opacity:.6}}
</style></head><body>
<h1>Backlog do Choupo</h1>
<div class="c">Por prioridade: o valor contra o tamanho. ▶ em curso. Feitos {count['DONE']} · parciais {count['PARTIAL']} · abertos {count['OPEN']} · largados {count['DROPPED']}. Fonte: BACKLOG.tsv.</div>
{table("Em curso", now)}{table("Próximo lote", nxt)}{table("Depois", later)}
</body></html>"""
    Path(sys.argv[1]).write_text(page)
    print(f"backlog_view: wrote {sys.argv[1]} ({len(open_)} open or partial items)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
