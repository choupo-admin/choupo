# =============================================================================
#  Choupo  --  WebAssembly build (v0.25+)
#
#  Compiles the four Choupo binaries to WebAssembly via Emscripten,
#  one .wasm per binary so each can be loaded independently by the
#  worker based on the case's `application` field.
#
#  The curated `data/standards/` tree (components, materials,
#  binaryPairs) is embedded into every .wasm; case dicts are written
#  into MEMFS by JS at runtime.
#
#  Outputs (gui/public/wasm/):
#      choupoSolve.{js,wasm}    steady-state solver
#      choupoBatch.{js,wasm}    batch + recipe solver
#      choupoCtrl.{js,wasm}     dynamic + control solver
#      choupoProps.{js,wasm}    property service + LM fit (v0.38+)
#
#  Usage:
#      make wasm                    # all four, release (-O2)
#      make wasm WASM_MODE=debug    # all four, -O0 -g, assertions
# =============================================================================

EMXX       ?= em++
WASM_MODE  ?= release
WASM_DIR   := gui/public/wasm

ifeq ($(WASM_MODE),debug)
    WASM_OPT := -O0 -g3 -gsource-map -sASSERTIONS=1 -sSAFE_HEAP=1
else
    WASM_OPT := -O2
endif

# Shared Emscripten flags.  See CLAUDE.md §13 for the load-bearing
# rationale of each flag (Emscripten 3.1.6 quirks documented there).
WASM_FLAGS_BASE := \
	-std=c++17 -fexceptions $(WASM_OPT) -Isrc \
	-sWASM=1 \
	-sALLOW_MEMORY_GROWTH=1 \
	-sMODULARIZE=1 \
	-sFORCE_FILESYSTEM=1 \
	-sENVIRONMENT=web \
	-sINVOKE_RUN=0 \
	"-sEXPORTED_FUNCTIONS=['_run_case','_malloc','_free']" \
	"-sEXPORTED_RUNTIME_METHODS=['FS','ccall','cwrap']" \
	--embed-file data/standards@/data/standards

.PHONY: wasm wasm-gui wasm-steady-props wasm-solve wasm-clean

# Deferred (`=`, not `:=`) because wasm.mk is included BEFORE the
# top-level Makefile defines SRCS.  Each binary's source list is:
#     LIB_SRCS + that binary's own src/applications/<binary>/* sources
# We compute that on-demand.
WASM_LIB_SRCS = $(filter-out src/applications/%, $(SRCS))

WASM_APP_SRCS = $(filter src/applications/$(1)/%, $(SRCS))

WASM_SOLVE_SRCS = $(WASM_LIB_SRCS) $(call WASM_APP_SRCS,choupoSolve)
WASM_BATCH_SRCS = $(WASM_LIB_SRCS) $(call WASM_APP_SRCS,choupoBatch)
WASM_CTRL_SRCS  = $(WASM_LIB_SRCS) $(call WASM_APP_SRCS,choupoCtrl)
WASM_PROPS_SRCS = $(WASM_LIB_SRCS) $(call WASM_APP_SRCS,choupoProps)

WASM_SOLVE_JS := $(WASM_DIR)/choupoSolve.js
WASM_BATCH_JS := $(WASM_DIR)/choupoBatch.js
WASM_CTRL_JS  := $(WASM_DIR)/choupoCtrl.js
WASM_PROPS_JS := $(WASM_DIR)/choupoProps.js

wasm: $(WASM_SOLVE_JS) $(WASM_BATCH_JS) $(WASM_CTRL_JS) $(WASM_PROPS_JS)

# The GUI's FOUR binaries: choupoSolve (steady flowsheets) + choupoProps (the
# PropsView) + choupoBatch (batch + recipes) + choupoCtrl (dynamic + control).
# The GUI dispatches by controlDict.application, so all four must be present in
# gui/public/wasm/ for a transient case (ctrl03 / batch04) to run in-browser
# and offer the time scrubber.  Same set as `wasm`; the alias is kept because
# the bin/ scripts + docs refer to it as THE GUI rebuild.
wasm-gui: $(WASM_SOLVE_JS) $(WASM_PROPS_JS) $(WASM_BATCH_JS) $(WASM_CTRL_JS)

# The steady + props pair alone -- the fast rebuild when only choupoSolve /
# choupoProps changed (the common src/ edit) and the dynamic binaries are
# already current in gui/public/wasm/.
wasm-steady-props: $(WASM_SOLVE_JS) $(WASM_PROPS_JS)

# Steady-state binary alone (choupoSolve only).
wasm-solve: $(WASM_SOLVE_JS)

# Each binary's factory function gets a UNIQUE name via -sEXPORT_NAME
# so that loading multiple .wasm files into the same worker scope
# does not clobber the global.  The worker picks the right factory
# by name based on which .wasm it just fetched.
$(WASM_SOLVE_JS): $(WASM_SOLVE_SRCS) data/standards | $(WASM_DIR)
	@printf "  EMXX  %s  (%d sources, %s)\n" $@ $(words $(WASM_SOLVE_SRCS)) $(WASM_MODE)
	@$(EMXX) $(WASM_FLAGS_BASE) -sEXPORT_NAME=createChoupoSolve \
		-o $@ $(WASM_SOLVE_SRCS)
	@printf "  -->   wasm: %s\n" $(@:.js=.wasm)

$(WASM_BATCH_JS): $(WASM_BATCH_SRCS) data/standards | $(WASM_DIR)
	@printf "  EMXX  %s  (%d sources, %s)\n" $@ $(words $(WASM_BATCH_SRCS)) $(WASM_MODE)
	@$(EMXX) $(WASM_FLAGS_BASE) -sEXPORT_NAME=createChoupoBatch \
		-o $@ $(WASM_BATCH_SRCS)
	@printf "  -->   wasm: %s\n" $(@:.js=.wasm)

$(WASM_CTRL_JS): $(WASM_CTRL_SRCS) data/standards | $(WASM_DIR)
	@printf "  EMXX  %s  (%d sources, %s)\n" $@ $(words $(WASM_CTRL_SRCS)) $(WASM_MODE)
	@$(EMXX) $(WASM_FLAGS_BASE) -sEXPORT_NAME=createChoupoCtrl \
		-o $@ $(WASM_CTRL_SRCS)
	@printf "  -->   wasm: %s\n" $(@:.js=.wasm)

$(WASM_PROPS_JS): $(WASM_PROPS_SRCS) data/standards | $(WASM_DIR)
	@printf "  EMXX  %s  (%d sources, %s)\n" $@ $(words $(WASM_PROPS_SRCS)) $(WASM_MODE)
	@$(EMXX) $(WASM_FLAGS_BASE) -sEXPORT_NAME=createChoupoProps \
		-o $@ $(WASM_PROPS_SRCS)
	@printf "  -->   wasm: %s\n" $(@:.js=.wasm)

$(WASM_DIR):
	@mkdir -p $@

wasm-clean:
	@rm -f $(WASM_DIR)/choupo*.js $(WASM_DIR)/choupo*.wasm \
	       $(WASM_DIR)/choupo*.js.map
