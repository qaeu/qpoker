#!/usr/bin/env bash
# Builds the solver crate (solver/) to src/utils/solver/wasm/{st,mt}; the output is checked in.
#
# Needs: rustup (the toolchain comes from solver/rust-toolchain.toml), wasm-bindgen-cli at the
# version pinned in solver/Cargo.toml, and binaryen's wasm-opt (version_133 in CI). The
# output is reproducible for the same toolchain, wasm-bindgen and wasm-opt versions: paths
# are remapped so no machine's home directory ends up in the binary.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
solver="$root/solver"
out="$root/src/utils/solver/wasm"
target=wasm32-unknown-unknown
bindgen_version="$(sed -n 's/^wasm-bindgen = { version = "=\([0-9.]*\)".*/\1/p' "$solver/Cargo.toml")"

command -v wasm-bindgen >/dev/null || { echo "wasm-bindgen-cli $bindgen_version is needed" >&2; exit 1; }
command -v wasm-opt >/dev/null || { echo "wasm-opt (binaryen) is needed" >&2; exit 1; }
if ! wasm-bindgen --version | grep -q " $bindgen_version\$"; then
	echo "wasm-bindgen-cli $bindgen_version is needed, found $(wasm-bindgen --version)" >&2
	exit 1
fi

cd "$solver"
sysroot="$(rustc --print sysroot)"
cargo_home="${CARGO_HOME:-$HOME/.cargo}"
remap="--remap-path-prefix=$solver=/solver --remap-path-prefix=$cargo_home=/cargo --remap-path-prefix=$sysroot=/rustc"
export SOURCE_DATE_EPOCH=0
export CARGO_INCREMENTAL=0

# Features the browsers that run the app all have (2023+), and that rustc enables anyway.
wasm_opt_features="--enable-simd --enable-bulk-memory --enable-nontrapping-float-to-int \
	--enable-sign-ext --enable-mutable-globals --enable-multivalue --enable-reference-types"

bindgen() { # <wasm> <dir>
	rm -rf "$2"
	wasm-bindgen --target web --out-dir "$2" --out-name qpoker_solver "$1"
	# shellcheck disable=SC2086
	wasm-opt -O3 $wasm_opt_features $3 "$2/qpoker_solver_bg.wasm" -o "$2/qpoker_solver_bg.wasm"
}

echo "Single-threaded (+simd128)"
RUSTFLAGS="-C target-feature=+simd128 $remap" \
	cargo build --locked --release --target $target --no-default-features --features wasm \
	--target-dir target/st
bindgen "target/st/$target/release/postflop_solver.wasm" "$out/st" ""

echo "Threaded (+atomics,+bulk-memory,+simd128, wasm-bindgen-rayon)"
# Shared, imported memory up to the 4GB wasm32 allows; the TLS exports are what
# wasm-bindgen's thread transform needs. (This nightly's rustc does not add these itself.)
mt_link="--shared-memory --import-memory --max-memory=4294967296 --export=__wasm_init_tls \
	--export=__tls_size --export=__tls_align --export=__tls_base"
mt_link_args="$(for a in $mt_link; do printf -- '-C link-arg=%s ' "$a"; done)"
RUSTFLAGS="-C target-feature=+atomics,+bulk-memory,+simd128 $mt_link_args$remap" \
	cargo build --locked --release --target $target --no-default-features --features wasm-threads \
	--target-dir target/mt -Z build-std=panic_abort,std
bindgen "target/mt/$target/release/postflop_solver.wasm" "$out/mt" "--enable-threads"

# wasm-bindgen-rayon's worker imports its package as the directory `../../..`, which only
# a bundler resolves; name the glue file so a plain browser or Node can load it too.
sed -i "s#import('../../..')#import('../../../qpoker_solver.js')#" "$out"/mt/snippets/*/src/workerHelpers.js
grep -q "import('../../../qpoker_solver.js')" "$out"/mt/snippets/*/src/workerHelpers.js
ls -l "$out"/st "$out"/mt
