# qpoker-solver

The postflop solver behind Review's **Solve** button, built to WebAssembly in
`src/utils/solver/wasm/{st,mt}` (checked in). See `docs/solver.md` for how qpoker uses it.

## Attribution

This crate is a modified copy of **postflop-solver** by Wataru Inariba,
<https://github.com/b-inary/postflop-solver>, taken at commit
`9d1509fe5077d019825f833eed04b16d342dfda1` (October 2023). postflop-solver is licensed
under the GNU Affero General Public License, version 3 or later; its licence text is
`LICENSE` here, and this modified copy is distributed under the same terms (qpoker as a
whole is AGPL-3.0-only).

Changes from upstream:

- Removed: the bunching effect (`bunching.rs`), file save and load (`file.rs`,
  `game/serialization.rs`, the `bincode` and `zstd` dependencies), the `custom-alloc`
  allocator, and the code only those used (`AtomicFloat`, `inner_product*`,
  `into_par_iter`, `is_suit_symmetric`, the storage modes of partially loaded games).
- Added: `TreeConfig::raise_cap` (raises allowed per street after its first bet),
  `PostFlopGame::num_nodes`, `src/api.rs` (qpoker's JSON API, native and testable) and
  `src/wasm.rs` (its wasm-bindgen face, plus wasm-bindgen-rayon's `initThreadPool` in the
  threaded build).
- Fixed for the current compiler: explicit autorefs of raw pointers in `action_tree.rs`
  (a deny-by-default lint now), elided guard lifetimes.

The solving code (DCFR, isomorphism, 16-bit compression, the evaluator) is unchanged;
`tests/parity.rs` checks it solves two fixed spots exactly as upstream does.

## Building

`npm run build:solver` (`scripts/build-solver.sh`) builds both targets. It needs rustup
(the pinned nightly in `rust-toolchain.toml` installs itself), `wasm-bindgen-cli` at the
version pinned in `Cargo.toml` (`cargo install wasm-bindgen-cli --version 0.2.129
--locked`) and binaryen's `wasm-opt` (version_133). The output is byte-for-byte
reproducible with those versions; CI rebuilds it and fails on a difference.

- `st`: single-threaded, `+simd128`.
- `mt`: `wasm-bindgen-rayon`, `+atomics,+bulk-memory,+simd128`, `-Z build-std`, shared
  memory up to 4GB. Needs a cross-origin isolated page, and its calls must run in a
  worker (the threads block with `Atomics.wait`). Its results are the same as `st`'s.

## Testing

`cargo test` (in `solver/`): upstream's own tests, the parity test, and `tests/api.rs`
(the JSON API: pair order, prefix walking, the raise cap, the EV convention, and the toy
river game against theory).
