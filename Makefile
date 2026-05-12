SHELL := /bin/bash

PCRE2_VERSION := 10.47

EMSDK_DIR   := emsdk
PCRE2_DIR   := pcre2
BUILD_DIR   := build
DIST_DIR    := dist

EMSDK_ENV   := source $(EMSDK_DIR)/emsdk_env.sh 2>/dev/null
CMAKE_BUILD := $(BUILD_DIR)/pcre2-cmake
WRAPPER     := src/pcre2_wrapper.c
OUTPUT_JS   := $(DIST_DIR)/pcre2.js

EMCC_FLAGS := \
	-s MODULARIZE=1 \
	-s EXPORT_NAME=PCRE2Module \
	-s EXPORT_ES6=1 \
	-s SINGLE_FILE=1 \
	-s EXPORTED_FUNCTIONS='["_malloc","_free","_pcre2_wasm_compile","_pcre2_wasm_match","_pcre2_wasm_match_all","_pcre2_wasm_replace","_pcre2_wasm_free","_pcre2_wasm_error_message","_pcre2_wasm_pattern_info"]' \
	-s EXPORTED_RUNTIME_METHODS='["cwrap","ccall","UTF8ToString","getValue","stringToUTF8","lengthBytesUTF8"]' \
	-s ALLOW_MEMORY_GROWTH=1 \
	-s ENVIRONMENT='web,node' \
	--no-entry \
	-O2

# ─── Targets ──────────────────────────────────────────────────────────────────

.PHONY: all setup build clean distclean help

all: build

help:
	@echo ""
	@echo "  make setup     — clone emsdk and pcre2"
	@echo "  make build     — compile pcre2 to WASM (runs setup if needed)"
	@echo "  make clean     — remove build artifacts"
	@echo "  make distclean — remove build artifacts + cloned dependencies"
	@echo ""

# ─── Setup ────────────────────────────────────────────────────────────────────

setup: $(EMSDK_DIR)/.emscripten $(PCRE2_DIR)/CMakeLists.txt

$(EMSDK_DIR)/.emscripten:
	@echo ">>> Cloning Emscripten SDK..."
	git clone https://github.com/emscripten-core/emsdk.git $(EMSDK_DIR)
	@echo ">>> Installing and activating latest Emscripten..."
	cd $(EMSDK_DIR) && ./emsdk install latest && ./emsdk activate latest

$(PCRE2_DIR)/CMakeLists.txt:
	@echo ">>> Cloning PCRE2 $(PCRE2_VERSION)..."
	git clone --branch pcre2-$(PCRE2_VERSION) --depth 1 https://github.com/PCRE2Project/pcre2.git $(PCRE2_DIR)

# ─── Build ────────────────────────────────────────────────────────────────────

build: $(OUTPUT_JS)

$(OUTPUT_JS): $(WRAPPER) $(CMAKE_BUILD)/libpcre2-8.a | $(DIST_DIR)
	@echo ">>> Linking wrapper + PCRE2 → WASM..."
	$(EMSDK_ENV) && emcc $(WRAPPER) \
		$(CMAKE_BUILD)/libpcre2-8.a \
		-I $(PCRE2_DIR)/src \
		-I $(CMAKE_BUILD) \
		-I $(CMAKE_BUILD)/interface \
		$(EMCC_FLAGS) \
		-o $(OUTPUT_JS)
	@echo ">>> Done: $(OUTPUT_JS) (WASM inlined)"

$(CMAKE_BUILD)/libpcre2-8.a: $(PCRE2_DIR)/CMakeLists.txt $(EMSDK_DIR)/.emscripten | $(CMAKE_BUILD)
	@echo ">>> Configuring PCRE2 with Emscripten..."
	$(EMSDK_ENV) && emcmake cmake $(PCRE2_DIR) -B $(CMAKE_BUILD) \
		-DPCRE2_BUILD_PCRE2_8=ON \
		-DPCRE2_BUILD_PCRE2_16=OFF \
		-DPCRE2_BUILD_PCRE2_32=OFF \
		-DPCRE2_BUILD_PCRE2GREP=OFF \
		-DPCRE2_BUILD_TESTS=OFF \
		-DPCRE2_SUPPORT_JIT=OFF \
		-DBUILD_SHARED_LIBS=OFF
	@echo ">>> Compiling PCRE2..."
	$(EMSDK_ENV) && emmake make -C $(CMAKE_BUILD) -j4

$(CMAKE_BUILD) $(DIST_DIR):
	mkdir -p $@

# ─── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf $(BUILD_DIR) $(DIST_DIR)

distclean: clean
	rm -rf $(EMSDK_DIR) $(PCRE2_DIR)
