# Handoff for a fresh session (written 2026-11-02, local laptop going offline)

Read CLAUDE.md, PLAN.md, DEV.md 4c C200 and docs/design/an-llm-learns-choupo-from-a-brief.md first.

Unmerged work, all on origin as branches (nothing is on main yet):
- backup/pack-recycles-pressure, backup/pack-separations, backup/pack-reactors: the three packs (docs/ai/packs/*.md), each example RUN. Merge them with this branch's docs/ai/kernel.md in ONE commit (the kernel names packs that must exist; check_doc_references refuses otherwise). Contradictions each general found in older docs/ai are in their reports; record them in DEV.md C200.
- backup/boron-stage1 (C198 Stage 1, commit a8bd98684 lineage): integrate with bin/integrate; golden re-record of swro01_campoDalias was ruled acceptable (35 boron rows + 83 NaCl rows moved by 4e-5, cause measured: boron is ~1 % of pass-2 osmotic pressure); put the list in the commit.
- integ/worktree-agent-a5c22562aa834596f (C186 5b negative outlet pressure): integration was mid-validation when the laptop stopped; needs the written shared-path decision (Flowsheet.cpp), then --scope, --gui.
- backup/<agent ids> (a8318e2acf001dce2 = browser Complete-0/ (C200 B'), a9633d6c312556e84 = LLM-brief evaluation harness (C200 A), adc55b34e36500669 = GUI reads pipeHeader sheets): WORK IN PROGRESS snapshots, not validated; the generals were still running.
Not in the cloud: the native build (run `make -j1 all` first), data/tmp, the user's private memory. Kernel corrections already applied in this branch's kernel.md: absorber ports (gas first, outputs cleanGas richLiquid), shortcutColumn publishes no duties, turbine has no P_out key.
Rule from the user: any new capability must also reach docs/ai (kernel + pack) in the same commit (CLAUDE.md section 10).
