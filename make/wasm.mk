# =============================================================================
#  Choupo  --  WebAssembly build (v0.25+; incremental objects 2026-07-19)
#
#  Compiles the four Choupo binaries to WebAssembly via Emscripten,
#  one .wasm per binary so each can be loaded independently by the
#  worker based on the case's `application` field.
#
#  INCREMENTAL: every source compiles ONCE into a per-mode object tree
#  (build/wasm/<mode>/obj/**.o with -MMD -MP dependency files, separate
#  from the native GCC objects); the four targets LINK the same common
#  objects plus their own application objects.  The common core is never
#  compiled four times, a touched header recompiles only its dependents,
#  and an application-only edit relinks only that target.  The four
#  binaries stay separate modules with their own EXPORT_NAME -- nothing
#  is merged, and although no static-init registration exists to be
#  discarded (Choupo registers builtins EXPLICITLY), the link still uses
#  the explicit object list, never an archive.
#
#  The curated `data/standards/` tree (components, materials, pairs) is
#  embedded into every .wasm at LINK time; a stamp file depends on every
#  FILE under data/standards, so editing a .dat relinks all four and
#  refreshes the embedded MEMFS (the directory-mtime gap is closed).
#  Case dicts are written into MEMFS by JS at runtime.
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
WASM_BUILD := build/wasm/$(WASM_MODE)
WASM_OBJ   := $(WASM_BUILD)/obj

ifeq ($(WASM_MODE),debug)
    WASM_OPT := -O0 -g3 -gsource-map -sASSERTIONS=1 -sSAFE_HEAP=1
else
    WASM_OPT := -O2
endif

# Compile-time flags (per-object).  Exceptions MUST match the link.
WASM_CXXFLAGS := -std=c++17 -fexceptions $(WASM_OPT) -Isrc -MMD -MP

# Link-time flags.  See CLAUDE.md §13 for the load-bearing rationale of
# each flag (Emscripten 3.1.6 quirks documented there).
WASM_LDFLAGS := \
	-std=c++17 -fexceptions $(WASM_OPT) \
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

# Immediate (`:=`) and SELF-CONTAINED: wasm.mk is included BEFORE the
# top-level Makefile defines SRCS, and rule PREREQUISITES expand at parse
# time -- the old deferred variables silently expanded EMPTY there, so the
# outputs never depended on the sources at all (the "wasm-clean && make
# wasm" folklore).  Finding the sources here makes the dependency real.
WASM_SRCS     := $(shell find src -name '*.cpp')
WASM_LIB_SRCS := $(filter-out src/applications/%, $(WASM_SRCS))
WASM_APP_SRCS = $(filter src/applications/$(1)/%, $(WASM_SRCS))

# Source -> per-mode object path (src/a/b.cpp -> $(WASM_OBJ)/src/a/b.o).
WASM_OBJ_OF = $(patsubst %.cpp,$(WASM_OBJ)/%.o,$(1))

WASM_LIB_OBJS   := $(call WASM_OBJ_OF,$(WASM_LIB_SRCS))
WASM_SOLVE_OBJS := $(call WASM_OBJ_OF,$(call WASM_APP_SRCS,choupoSolve))
WASM_BATCH_OBJS := $(call WASM_OBJ_OF,$(call WASM_APP_SRCS,choupoBatch))
WASM_CTRL_OBJS  := $(call WASM_OBJ_OF,$(call WASM_APP_SRCS,choupoCtrl))
WASM_PROPS_OBJS := $(call WASM_OBJ_OF,$(call WASM_APP_SRCS,choupoProps))

WASM_SOLVE_JS := $(WASM_DIR)/choupoSolve.js
WASM_BATCH_JS := $(WASM_DIR)/choupoBatch.js
WASM_CTRL_JS  := $(WASM_DIR)/choupoCtrl.js
WASM_PROPS_JS := $(WASM_DIR)/choupoProps.js

# Aggregate targets ask for BOTH group members explicitly: GNU make only
# examines the member it is asked to build, so a deleted .wasm beside a
# fresh .js would otherwise never be noticed.
WASM_ALL_OUT := $(WASM_SOLVE_JS) $(WASM_SOLVE_JS:.js=.wasm) \
                $(WASM_BATCH_JS) $(WASM_BATCH_JS:.js=.wasm) \
                $(WASM_CTRL_JS)  $(WASM_CTRL_JS:.js=.wasm) \
                $(WASM_PROPS_JS) $(WASM_PROPS_JS:.js=.wasm)

wasm: $(WASM_ALL_OUT)

# The GUI's FOUR binaries: the GUI dispatches by controlDict.application,
# so all four must be present in gui/public/wasm/ for a transient case
# (ctrl03 / batch04) to run in-browser and offer the time scrubber.  Same
# set as `wasm`; the alias is kept because the bin/ scripts + docs refer
# to it as THE GUI rebuild.
wasm-gui: $(WASM_ALL_OUT)

# The steady + props pair alone -- the fast relink when the dynamic
# binaries are already current in gui/public/wasm/.
wasm-steady-props: $(WASM_SOLVE_JS) $(WASM_SOLVE_JS:.js=.wasm) $(WASM_PROPS_JS) $(WASM_PROPS_JS:.js=.wasm)

# Steady-state binary alone (choupoSolve only).
wasm-solve: $(WASM_SOLVE_JS) $(WASM_SOLVE_JS:.js=.wasm)

# ---- content stamps: the fingerprint lives in the FILENAME ------------------
#  A prerequisite LIST captured at parse time misses DELETIONS (the removed
#  file simply leaves the list and the old stamp stays fresh), and nothing
#  invalidated objects/links when the FLAGS changed.  Each stamp's name
#  embeds a deterministic hash of what it fingerprints -- any change (edit,
#  add, DELETE, flag edit) yields a NEW filename, the stamp is missing, the
#  rule fires, stale twins are purged, and every dependent rebuilds.
#
#  standards: path + mtime + size of EVERY file under data/standards, so the
#  embedded MEMFS can never keep a removed or edited record.
WASM_STANDARDS_HASH := $(shell find data/standards -type f -printf '%p %T@ %s\n' 2>/dev/null | LC_ALL=C sort | md5sum | cut -c1-32)
WASM_STANDARDS_STAMP := $(WASM_BUILD)/standards-$(WASM_STANDARDS_HASH).stamp

$(WASM_STANDARDS_STAMP):
	@mkdir -p $(dir $@)
	@rm -f $(WASM_BUILD)/standards-*.stamp
	@touch $@

#  flags: objects depend on the effective COMPILE flags, links on the LINK
#  flags -- editing WASM_OPT/exports/includes can never reuse stale output.
WASM_CXX_HASH := $(shell printf '%s' "$(WASM_CXXFLAGS)" | md5sum | cut -c1-32)
WASM_LD_HASH  := $(shell printf '%s' "$(WASM_LDFLAGS)" | md5sum | cut -c1-32)
WASM_CXX_STAMP := $(WASM_BUILD)/cxxflags-$(WASM_CXX_HASH).stamp
WASM_LD_STAMP  := $(WASM_BUILD)/ldflags-$(WASM_LD_HASH).stamp

$(WASM_CXX_STAMP):
	@mkdir -p $(dir $@)
	@rm -f $(WASM_BUILD)/cxxflags-*.stamp
	@touch $@

$(WASM_LD_STAMP):
	@mkdir -p $(dir $@)
	@rm -f $(WASM_BUILD)/ldflags-*.stamp
	@touch $@

# ---- per-object compilation (the incremental core) -------------------------
$(WASM_OBJ)/%.o: %.cpp $(WASM_CXX_STAMP)
	@mkdir -p $(dir $@)
	@printf "  EMXX  %s\n" $<
	@$(EMXX) $(WASM_CXXFLAGS) -c $< -o $@


# ---- link rules: common objects + the app's own, unique EXPORT_NAME --------
#  Each binary's factory gets a UNIQUE name via -sEXPORT_NAME so loading
#  multiple .wasm files into one worker scope does not clobber the global.
define WASM_LINK
	@printf "  EMLD  %s  (%d objects, %s)\n" $@ $(words $(filter %.o,$^)) $(WASM_MODE)
	@$(EMXX) $(WASM_LDFLAGS) -sEXPORT_NAME=$(1) -o $@ \
		$(filter %.o,$^)
	@printf "  -->   wasm: %s\n" $(@:.js=.wasm)
endef

#  Grouped targets (GNU Make 4.3 `&:`): the .js AND the .wasm are ONE link
#  result -- a missing/corrupted .wasm beside a fresh .js re-runs the link
#  instead of declaring everything current.
$(WASM_SOLVE_JS) $(WASM_SOLVE_JS:.js=.wasm) &: $(WASM_LIB_OBJS) $(WASM_SOLVE_OBJS) $(WASM_STANDARDS_STAMP) $(WASM_LD_STAMP) | $(WASM_DIR)
	$(call WASM_LINK,createChoupoSolve)

$(WASM_BATCH_JS) $(WASM_BATCH_JS:.js=.wasm) &: $(WASM_LIB_OBJS) $(WASM_BATCH_OBJS) $(WASM_STANDARDS_STAMP) $(WASM_LD_STAMP) | $(WASM_DIR)
	$(call WASM_LINK,createChoupoBatch)

$(WASM_CTRL_JS) $(WASM_CTRL_JS:.js=.wasm) &: $(WASM_LIB_OBJS) $(WASM_CTRL_OBJS) $(WASM_STANDARDS_STAMP) $(WASM_LD_STAMP) | $(WASM_DIR)
	$(call WASM_LINK,createChoupoCtrl)

$(WASM_PROPS_JS) $(WASM_PROPS_JS:.js=.wasm) &: $(WASM_LIB_OBJS) $(WASM_PROPS_OBJS) $(WASM_STANDARDS_STAMP) $(WASM_LD_STAMP) | $(WASM_DIR)
	$(call WASM_LINK,createChoupoProps)

$(WASM_DIR):
	@mkdir -p $@

# ---- header dependencies (generated by -MMD -MP) ---------------------------
-include $(shell find $(WASM_OBJ) -name '*.d' 2>/dev/null)

wasm-clean:
	@rm -f $(WASM_DIR)/choupo*.js $(WASM_DIR)/choupo*.wasm \
	       $(WASM_DIR)/choupo*.js.map
	@rm -rf build/wasm
