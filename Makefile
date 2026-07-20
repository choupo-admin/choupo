# =============================================================================
#  Choupo  --  top-level Makefile
#
#  Build:           make          (native release; same as `make all`)
#  Build (debug):   make MODE=debug
#  Tests:           make test
#  Clean current:   make clean      (only current MODE/PLATFORM)
#  Clean all:       make distclean  (the whole build/ tree)
#  Inspect:         make print
#
#  Binaries built (one per problem class):
#      choupoSolve   --  steady-state simulation,  F(x) = 0
#      choupoBatch   --  batch / time-dependent recipe simulation
#      choupoCtrl    --  dynamic continuous + control loops (v0.24+)
#      choupoProps   --  physical-property service + parameter fitting (v0.36+)
# =============================================================================

# `make` with no target must build the NATIVE binaries.  Without this line the
# default goal would be the first rule GNU make sees -- which is whatever
# make/wasm.mk defines, because it is included before `all:` is declared below.
# A visitor's very first command would then fire up Emscripten.
.DEFAULT_GOAL := all

include make/compiler.mk
include make/rules.mk
include make/wasm.mk

SRCS         := $(shell find src -name '*.cpp')
OBJS         := $(SRCS:src/%.cpp=$(BUILD)/src/%.o)
DEPS         := $(OBJS:.o=.d)

# The objects under src/applications/<app>/ are entry points; each
# binary links the shared library objects PLUS its own application
# entry-point objects.
SOLVE_OBJS   := $(filter $(BUILD)/src/applications/choupoSolve/%, $(OBJS))
BATCH_OBJS   := $(filter $(BUILD)/src/applications/choupoBatch/%, $(OBJS))
CTRL_OBJS    := $(filter $(BUILD)/src/applications/choupoCtrl/%,  $(OBJS))
PROPS_OBJS   := $(filter $(BUILD)/src/applications/choupoProps/%, $(OBJS))

LIB_OBJS     := $(filter-out $(SOLVE_OBJS) $(BATCH_OBJS) \
                  $(CTRL_OBJS) $(PROPS_OBJS), $(OBJS))

BINARY_SOLVE := $(BUILD)/choupoSolve$(EXE)
BINARY_BATCH := $(BUILD)/choupoBatch$(EXE)
BINARY_CTRL  := $(BUILD)/choupoCtrl$(EXE)
BINARY_PROPS := $(BUILD)/choupoProps$(EXE)

# Shared engine library + per-binary linking.  On Linux the engine is a
# SHARED object (libchoupo.so); every binary --- and every per-case
# buildCode binary --- links DYNAMICALLY against it.  This is the
# shared-library model: a user binary references the engine, it does not embed it.
# Windows cross-builds keep static linking (a self-contained .exe, no DLL
# hunt).
#
# bin/buildCode links a case's own code/*.cpp against the .so + the
# choupoSolve main.o to make a per-case binary with user unit ops.
SOLVE_MAIN := $(BUILD)/src/applications/choupoSolve/main.o
ifeq ($(PLATFORM),win64MinGW)
    LIBCHOUPO :=                       # no shared lib on Windows
    LIB_DEP    := $(LIB_OBJS)           # link the objects directly (static)
    LIB_LINK   := $(LIB_OBJS)
else
    CXXFLAGS   += -fPIC                 # position-independent code for the .so
    LIBCHOUPO := $(BUILD)/libchoupo.so
    LIB_DEP    := $(LIBCHOUPO)
    # rpath '$ORIGIN' --- the binary finds libchoupo.so in its OWN dir
    # (build/<plat>/), which is where the .so is built; the root symlinks
    # resolve to the real binary location, so $ORIGIN still points there.
    LIB_LINK   := -L$(BUILD) -lchoupo -Wl,-rpath,'$$ORIGIN'
endif

# Convenience: stable symlinks at project root so commands like
#      ./choupoSolve tutorials/xyz
#      ./choupoBatch tutorials/xyz
#      ./choupoCtrl  tutorials/xyz
# keep working across build modes.
SYMLINK_SOLVE := choupoSolve$(EXE)
SYMLINK_BATCH := choupoBatch$(EXE)
SYMLINK_CTRL  := choupoCtrl$(EXE)
SYMLINK_PROPS := choupoProps$(EXE)

.PHONY: all clean distclean test print debug release windows lib

# Dev-banner identity: write generated/gitVersion.H with the short HEAD
# hash, CONTENT-COMPARED so an unchanged hash never touches the file (and
# never dirties the incremental build).  Absent git (a tarball) -> no file,
# and the banner omits the commit.
.PHONY: gitversion
gitversion:
	@h=$$(git rev-parse --short HEAD 2>/dev/null); \
	if [ -n "$$h" ]; then \
	  mkdir -p generated; \
	  printf '#pragma once\n#define CHOUPO_GIT_HASH "%s"\n' "$$h" > generated/.gitVersion.tmp; \
	  if cmp -s generated/.gitVersion.tmp generated/gitVersion.H 2>/dev/null; then \
	    rm generated/.gitVersion.tmp; \
	  else mv generated/.gitVersion.tmp generated/gitVersion.H; fi; \
	fi

all: gitversion $(SYMLINK_SOLVE) $(SYMLINK_BATCH) $(SYMLINK_CTRL) $(SYMLINK_PROPS)

# `make lib` --- the shared engine library + choupoSolve main.o that
# bin/buildCode needs to compile a case's own unit ops.
lib: $(LIB_DEP) $(SOLVE_MAIN)

ifneq ($(LIBCHOUPO),)
$(LIBCHOUPO): $(LIB_OBJS)
	@mkdir -p $(@D)
	@printf "  SO    %s\n" $@
	@$(CXX) -shared -o $@ $^ $(LDFLAGS)
endif

$(SYMLINK_SOLVE): $(BINARY_SOLVE)
	@ln -sfn $(BINARY_SOLVE) $(SYMLINK_SOLVE)
	@printf "  -->   %s -> %s\n" $(SYMLINK_SOLVE) $(BINARY_SOLVE)

$(SYMLINK_BATCH): $(BINARY_BATCH)
	@ln -sfn $(BINARY_BATCH) $(SYMLINK_BATCH)
	@printf "  -->   %s -> %s\n" $(SYMLINK_BATCH) $(BINARY_BATCH)

$(SYMLINK_CTRL): $(BINARY_CTRL)
	@ln -sfn $(BINARY_CTRL) $(SYMLINK_CTRL)
	@printf "  -->   %s -> %s\n" $(SYMLINK_CTRL) $(BINARY_CTRL)

$(SYMLINK_PROPS): $(BINARY_PROPS)
	@ln -sfn $(BINARY_PROPS) $(SYMLINK_PROPS)
	@printf "  -->   %s -> %s\n" $(SYMLINK_PROPS) $(BINARY_PROPS)

$(BINARY_SOLVE): $(SOLVE_OBJS) $(LIB_DEP)
	@mkdir -p $(@D)
	@printf "  LD    %s\n" $@
	@$(CXX) $(CXXFLAGS) -o $@ $(SOLVE_OBJS) $(LIB_LINK) $(LDFLAGS)

$(BINARY_BATCH): $(BATCH_OBJS) $(LIB_DEP)
	@mkdir -p $(@D)
	@printf "  LD    %s\n" $@
	@$(CXX) $(CXXFLAGS) -o $@ $(BATCH_OBJS) $(LIB_LINK) $(LDFLAGS)

$(BINARY_CTRL): $(CTRL_OBJS) $(LIB_DEP)
	@mkdir -p $(@D)
	@printf "  LD    %s\n" $@
	@$(CXX) $(CXXFLAGS) -o $@ $(CTRL_OBJS) $(LIB_LINK) $(LDFLAGS)

$(BINARY_PROPS): $(PROPS_OBJS) $(LIB_DEP)
	@mkdir -p $(@D)
	@printf "  LD    %s\n" $@
	@$(CXX) $(CXXFLAGS) -o $@ $(PROPS_OBJS) $(LIB_LINK) $(LDFLAGS)

-include $(DEPS)

debug:
	@$(MAKE) --no-print-directory MODE=debug all

release: all

# Cross-compile a static Windows .exe via MinGW-w64.
windows:
	@$(MAKE) --no-print-directory PLATFORM=win64MinGW all

clean:
	@rm -rf $(BUILD)
	@rm -f  $(SYMLINK_SOLVE) $(SYMLINK_BATCH) $(SYMLINK_CTRL) $(SYMLINK_PROPS)

distclean: wasm-clean
	@rm -rf build
	@rm -f  $(SYMLINK_SOLVE) $(SYMLINK_BATCH) $(SYMLINK_CTRL) $(SYMLINK_PROPS)

test: $(SYMLINK_SOLVE)
	./$(SYMLINK_SOLVE) tutorials/flash01_benzene_toluene

print:
	@echo "PLATFORM     = $(PLATFORM)"
	@echo "MODE         = $(MODE)"
	@echo "CXX          = $(CXX)"
	@echo "CXXFLAGS     = $(CXXFLAGS)"
	@echo "BUILD        = $(BUILD)"
	@echo "BINARY_SOLVE = $(BINARY_SOLVE)"
	@echo "BINARY_BATCH = $(BINARY_BATCH)"
	@echo "BINARY_CTRL  = $(BINARY_CTRL)"
	@echo "BINARY_PROPS = $(BINARY_PROPS)"
	@echo "Sources      = $(words $(SRCS)) cpp files"
	@echo "  choupoSolve entry objs: $(words $(SOLVE_OBJS))"
	@echo "  choupoBatch entry objs: $(words $(BATCH_OBJS))"
	@echo "  choupoCtrl  entry objs: $(words $(CTRL_OBJS))"
	@echo "  choupoProps entry objs: $(words $(PROPS_OBJS))"
	@echo "  shared library objs:     $(words $(LIB_OBJS))"
