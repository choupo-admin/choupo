# =============================================================================
#  Choupo  --  pattern rules
# =============================================================================
#  Output layout:
#      build/<platform><mode>/src/<rel-path>/<file>.o
#      build/<platform><mode>/src/<rel-path>/<file>.d   (auto dep)
#      build/<platform><mode>/choupoSolve         (binary)
#
#  A symlink ./choupoSolve at the project root points to the latest
#  binary, so tutorials can be run with the familiar
#      ./choupoSolve tutorials/<case>
# =============================================================================

# Flag stamps (see compiler.mk): minting a stamp clears its stale siblings,
# so a flag change ripples exactly as far as it must -- objects for the
# compile stamp, links for the link stamp.
$(COMPILE_STAMP):
	@mkdir -p $(BUILD)
	@rm -f $(BUILD)/.stamp-cxx-*
	@touch $@

$(LINK_STAMP):
	@mkdir -p $(BUILD)
	@rm -f $(BUILD)/.stamp-ld-*
	@touch $@

# Object & dependency emission (every object depends on the COMPILE stamp:
# changing the compiler or a compile flag rebuilds them all)
$(BUILD)/src/%.o: src/%.cpp $(COMPILE_STAMP)
	@mkdir -p $(@D)
	@printf "  CXX   %s\n" $<
	@$(CXX) $(CXXFLAGS) -MMD -MP -c $< -o $@
