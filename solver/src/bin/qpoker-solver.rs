//! The solver as a native process, for qpoker's CLI (`src/cli/solverNative.ts`): no
//! wasm32 memory cap, native SIMD and every core through rayon.
//!
//! One game per process. Requests are one JSON object a line on stdin, answers one a
//! line on stdout, `{"ok": …}` or `{"error": "…"}`; the shapes inside are `api.rs`'s.
//! The process ends at end of input.
//!
//! - `{"op": "create", "input": WasmInput}` → `null`
//! - `{"op": "estimate"}` → `WasmEstimate`
//! - `{"op": "allocate", "compressed": bool}` → `null`
//! - `{"op": "step", "n": u32}` → exploitability in cents
//! - `{"op": "query"}` → `WasmQuery`

use postflop_solver::{Solver, WasmInput};
use serde::Deserialize;
use serde_json::{json, Value};
use std::io::{self, BufRead, Write};

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
enum Request {
    Create { input: WasmInput },
    Estimate,
    Allocate { compressed: bool },
    Step { n: u32 },
    Query,
}

fn answer(solver: &mut Option<Solver>, line: &str) -> Result<Value, String> {
    let request: Request = serde_json::from_str(line).map_err(|e| format!("Bad request: {e}"))?;
    if let Request::Create { input } = request {
        *solver = Some(Solver::from_input(&input)?);
        return Ok(Value::Null);
    }
    let solver = solver.as_mut().ok_or("No game: send `create` first")?;
    Ok(match request {
        Request::Create { .. } => unreachable!(),
        Request::Estimate => json!(solver.estimate()),
        Request::Allocate { compressed } => {
            solver.allocate(compressed);
            Value::Null
        }
        Request::Step { n } => json!(solver.step(n)? as f64),
        Request::Query => json!(solver.query()?),
    })
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    let mut solver = None;
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let reply = match answer(&mut solver, &line) {
            Ok(value) => json!({ "ok": value }),
            Err(message) => json!({ "error": message }),
        };
        if writeln!(stdout, "{reply}")
            .and_then(|_| stdout.flush())
            .is_err()
        {
            break;
        }
    }
}
