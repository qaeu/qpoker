#!/usr/bin/env bash
# Builds the CLI's native solver for any machine of this platform, to solver/bin/<platform>-<arch>;
# the output is checked in. `npm run build:solver:native` is the faster build for this machine only.
#
# Needs: rustup (the toolchain comes from solver/rust-toolchain.toml). Paths are remapped so no
# machine's home directory ends up in the binary.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
solver="$root/solver"

# Named as Node names them (`process.platform`-`process.arch`), for cli/solverNative.ts.
case "$(uname -s)-$(uname -m)" in
	Linux-x86_64) platform=linux-x64 cpu=x86-64-v2 ;;
	Linux-aarch64) platform=linux-arm64 cpu=generic ;;
	Darwin-x86_64) platform=darwin-x64 cpu=x86-64-v2 ;;
	Darwin-arm64) platform=darwin-arm64 cpu=apple-m1 ;;
	*) echo "No portable target for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
esac

cd "$solver"
sysroot="$(rustc --print sysroot)"
cargo_home="${CARGO_HOME:-$HOME/.cargo}"
remap="--remap-path-prefix=$solver=/solver --remap-path-prefix=$cargo_home=/cargo --remap-path-prefix=$sysroot=/rustc"
export SOURCE_DATE_EPOCH=0
export CARGO_INCREMENTAL=0

RUSTFLAGS="-C target-cpu=$cpu -C strip=symbols $remap" \
	cargo build --locked --release --bin qpoker-solver --target-dir target/portable
mkdir -p "bin/$platform"
cp target/portable/release/qpoker-solver "bin/$platform/qpoker-solver"
ls -l "bin/$platform"
