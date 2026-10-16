//! An open-source postflop solver library.
//!
//! Vendored into qpoker from b-inary/postflop-solver (see README.md); bunching, file
//! save/load and the custom allocator removed, a raise cap and a JSON/wasm-bindgen API
//! (`api`, `wasm`) added.
//!
//! # Examples
//!
//! See the [examples] directory.
//!
//! [examples]: https://github.com/b-inary/postflop-solver/tree/main/examples
//!
//! # Implementation details
//! - **Algorithm**: The solver uses the state-of-the-art [Discounted CFR] algorithm.
//!   Currently, the value of γ is set to 3.0 instead of the 2.0 recommended in the original paper.
//!   Also, the solver resets the cumulative strategy when the number of iterations is a power of 4.
//! - **Performance**: The solver engine is highly optimized for performance with maintainable code.
//!   The engine supports multithreading by default, and it takes full advantage of unsafe Rust in hot spots.
//!   The developer reviews the assembly output from the compiler and ensures that SIMD instructions are used as much as possible.
//!   Combined with the algorithm described above, the performance surpasses paid solvers such as PioSOLVER and GTO+.
//! - **Isomorphism**: The solver does not perform any abstraction.
//!   However, isomorphic chances (turn and river deals) are combined into one.
//!   For example, if the flop is monotone, the three non-dealt suits are isomorphic,
//!   allowing us to skip the calculation for two of the three suits.
//! - **Precision**: 32-bit floating-point numbers are used in most places.
//!   When calculating summations, temporary values use 64-bit floating-point numbers.
//!   There is also a compression option where each game node stores the values
//!   by 16-bit integers with a single 32-bit floating-point scaling factor.
//!
//! [Discounted CFR]: https://arxiv.org/abs/1809.04040
//!
//! # Crate features
//! - `rayon`: Uses [rayon] crate for parallelization.
//!   Enabled by default.
//! - `wasm`: The wasm-bindgen API in `wasm.rs` (see `src/utils/solver/wasmApi.ts` in qpoker).
//! - `wasm-threads`: `wasm` plus wasm-bindgen-rayon's `initThreadPool`.
//!
//! [rayon]: https://github.com/rayon-rs/rayon
mod action_tree;
mod api;
mod bet_size;
mod card;
mod game;
mod hand;
mod hand_table;
mod interface;
mod mutex_like;
mod range;
mod sliceop;
mod solver;
mod utility;

#[cfg(feature = "wasm")]
mod wasm;

pub use action_tree::*;
pub use api::*;
pub use bet_size::*;
pub use card::*;
pub use game::*;
pub use interface::*;
pub use mutex_like::*;
pub use range::*;
pub use solver::*;
pub use utility::*;
