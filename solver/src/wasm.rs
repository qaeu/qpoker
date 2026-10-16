//! The wasm-bindgen face of `api.rs`; the contract is `src/utils/solver/wasmApi.ts`.

use crate::api::Solver;
use wasm_bindgen::prelude::*;

#[cfg(feature = "wasm-threads")]
#[allow(unused_imports)] // exported by its own #[wasm_bindgen]
pub use wasm_bindgen_rayon::init_thread_pool;

/// Builds the tree and game from a `WasmInput` JSON; throws an `Error` it can't.
#[wasm_bindgen(js_name = createSolver)]
pub fn create_solver(input_json: &str) -> Result<SolverHandle, JsError> {
    Solver::new(input_json)
        .map(|inner| SolverHandle { inner })
        .map_err(|e| JsError::new(&e))
}

/// One game being solved. `free()` releases its memory.
#[wasm_bindgen]
pub struct SolverHandle {
    inner: Solver,
}

#[wasm_bindgen]
impl SolverHandle {
    /// `WasmEstimate` JSON: bytes (32-bit and 16-bit storage) and node count.
    pub fn estimate(&self) -> String {
        self.inner.estimate_json()
    }

    /// Allocates the game's storage, 16-bit when `compressed`.
    pub fn allocate(&mut self, compressed: bool) {
        self.inner.allocate(compressed);
    }

    /// Runs `n` more DCFR iterations; returns the exploitability in cents.
    pub fn step(&mut self, n: u32) -> Result<f64, JsError> {
        self.inner
            .step(n)
            .map(|e| e as f64)
            .map_err(|e| JsError::new(&e))
    }

    /// Finalises the solve and returns the `WasmQuery` JSON for the prefix's node.
    pub fn query(&mut self) -> Result<String, JsError> {
        self.inner.query_json().map_err(|e| JsError::new(&e))
    }
}
