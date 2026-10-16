//! The JSON layer behind the WASM build (`src/api.rs`), against `wasmApi.ts`'s contract.

use postflop_solver::*;
use serde_json::{json, Value};

fn card(s: &str) -> u8 {
    card_from_str(s).unwrap()
}

fn board(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| card(&s[i..i + 2]))
        .collect()
}

/// 1326 weights: `w` on every combo of the given cards' ranks pattern, dead combos zero.
fn range(board: &[u8], hands: &[(&str, f32)]) -> Vec<f32> {
    let mut r = vec![0.0; NUM_PAIRS];
    for &(hand, w) in hands {
        let (r1, r2) = (hand.as_bytes()[0] as char, hand.as_bytes()[1] as char);
        for s1 in "cdhs".chars() {
            for s2 in "cdhs".chars() {
                let c1 = card(&format!("{r1}{s1}"));
                let c2 = card(&format!("{r2}{s2}"));
                if c1 == c2 || board.contains(&c1) || board.contains(&c2) {
                    continue;
                }
                r[card_pair_to_index(c1, c2)] = w;
            }
        }
    }
    r
}

/// A river input with the toy polar game's ranges (see `describe toy river`).
fn toy_input(bet: &str, prefix: Value) -> Value {
    let b = board("Ks7h4cQd2s");
    json!({
        "board": b,
        // Nuts (KK, a set: 3 combos) and air (65: 16 combos).
        "oopRange": range(&b, &[("KK", 1.0), ("65", 1.0)]),
        // Bluff-catchers only (QJ, a pair of queens: 12 combos).
        "ipRange": range(&b, &[("QJ", 1.0)]),
        "pot": 1000,
        "stack": 20000,
        "rakeRate": 0.0,
        "rakeCap": 0,
        "river": { "bet": bet, "raise": "" },
        "raiseCap": 0,
        "allInThreshold": 0.0,
        "addAllIn": false,
        "prefix": prefix,
    })
}

fn solve(input: &Value, target: f32) -> (Solver, f32) {
    let mut solver = Solver::new(&input.to_string()).unwrap();
    solver.allocate(false);
    let mut expl = f32::MAX;
    while solver.iterations() < 3000 && expl > target {
        expl = solver.step(25).unwrap();
    }
    (solver, expl)
}

fn query(solver: &mut Solver) -> Value {
    serde_json::from_str(&solver.query_json().unwrap()).unwrap()
}

fn floats(v: &Value) -> Vec<f64> {
    v.as_array()
        .unwrap()
        .iter()
        .map(|x| x.as_f64().unwrap())
        .collect()
}

/// Weighted mean of row `action` of an actions × 1326 array over `weights`.
fn mean(values: &[f64], weights: &[f64], action: usize, filter: impl Fn(usize) -> bool) -> f64 {
    let (mut sum, mut total) = (0.0, 0.0);
    for i in 0..NUM_PAIRS {
        if filter(i) && weights[i] > 0.0 {
            sum += values[action * NUM_PAIRS + i] * weights[i];
            total += weights[i];
        }
    }
    sum / total
}

mod pair_index {
    use super::*;

    #[test]
    fn follows_the_contract_formula() {
        let mut seen = vec![false; NUM_PAIRS];
        for c1 in 0..52u8 {
            for c2 in c1 + 1..52 {
                let i = card_pair_to_index(c1, c2);
                let (a, b) = (c1 as usize, c2 as usize);
                assert_eq!(i, a * (101 - a) / 2 + b - 1);
                assert_eq!(card_pair_to_index(c2, c1), i);
                assert_eq!(index_to_card_pair(i), (c1, c2));
                assert!(!seen[i]);
                seen[i] = true;
            }
        }
        assert_eq!(card_pair_to_index(0, 1), 0);
        assert_eq!(card_pair_to_index(50, 51), 1325);
    }

    #[test]
    fn card_ids_are_rank_times_four_plus_suit_cdhs() {
        assert_eq!(card("2c"), 0);
        assert_eq!(card("2s"), 3);
        assert_eq!(card("3d"), 5);
        assert_eq!(card("Ah"), 50);
        assert_eq!(card("As"), 51);
    }

    #[test]
    fn query_arrays_are_in_pair_order() {
        let (mut solver, _) = solve(&toy_input("75%", json!([])), 5.0);
        let q = query(&mut solver);
        let weights = floats(&q["weights"]);
        assert_eq!(weights.len(), NUM_PAIRS);
        assert_eq!(floats(&q["equity"]).len(), NUM_PAIRS);
        assert_eq!(floats(&q["strategy"]).len(), 2 * NUM_PAIRS);
        assert_eq!(floats(&q["ev"]).len(), 2 * NUM_PAIRS);
        let kk = card_pair_to_index(card("Kc"), card("Kd"));
        let k_dead = card_pair_to_index(card("Kc"), card("Ks"));
        let six_five = card_pair_to_index(card("6h"), card("5c"));
        let not_in_range = card_pair_to_index(card("Ac"), card("Ad"));
        assert!(weights[kk] > 0.0 && weights[six_five] > 0.0);
        assert_eq!(weights[k_dead], 0.0);
        assert_eq!(weights[not_in_range], 0.0);
        // A set wins every showdown; 65 loses every one.
        assert!((floats(&q["equity"])[kk] - 1.0).abs() < 1e-6);
        assert!(floats(&q["equity"])[six_five].abs() < 1e-6);
        // Strategy and EV are zero where the weight is.
        assert_eq!(floats(&q["strategy"])[not_in_range], 0.0);
        assert_eq!(floats(&q["ev"])[NUM_PAIRS + not_in_range], 0.0);
    }
}

/// Polar range (nuts + air) against pure bluff-catchers, one bet of `s` pot: the bettor
/// bluffs `s / (1 + 2s)` of their bets and the caller calls `1 / (1 + s)`.
mod toy_river {
    use super::*;

    fn check(bet: &str, s: f64) {
        let (mut root, expl) = solve(&toy_input(bet, json!([])), 0.05);
        assert!(expl <= 0.05, "exploitability {expl}");
        let q = query(&mut root);
        assert_eq!(q["player"], 0);
        let bet_to = (1000.0 * s).round() as i64;
        assert_eq!(
            q["actions"],
            json!([{ "kind": "check" }, { "kind": "bet", "to": bet_to }])
        );
        let strategy = floats(&q["strategy"]);
        let weights = floats(&q["weights"]);
        let ev = floats(&q["ev"]);
        let is_kk = |i: usize| {
            let (c1, c2) = index_to_card_pair(i);
            c1 >> 2 == 11 && c2 >> 2 == 11
        };
        let kk_bets = mean(&strategy, &weights, 1, is_kk);
        let air_bets = mean(&strategy, &weights, 1, |i| !is_kk(i));
        let (kk, air) = (3.0 * kk_bets, 16.0 * air_bets);
        let bluff_share = air / (kk + air);
        assert!(kk_bets > 0.99, "the nuts bet: {kk_bets}");
        assert!(
            (bluff_share - s / (1.0 + 2.0 * s)).abs() < 0.01,
            "bluffs {bluff_share}"
        );

        // EV convention: a bluff is worth what checking is (0), a value bet
        // pot + s·pot·(call frequency).
        let call = 1.0 / (1.0 + s);
        assert!(mean(&ev, &weights, 1, |i| !is_kk(i)).abs() < 0.01 * 1000.0);
        let value = mean(&ev, &weights, 1, is_kk);
        assert!(
            (value - 1000.0 * (1.0 + s * call)).abs() < 0.01 * 1000.0,
            "value {value}"
        );

        let prefix = json!([{ "kind": "bet", "to": bet_to }]);
        let (mut facing, _) = solve(&toy_input(bet, prefix), 0.05);
        let q = query(&mut facing);
        assert_eq!(q["player"], 1);
        assert_eq!(q["pot"], 1000 + bet_to);
        assert_eq!(
            q["actions"],
            json!([{ "kind": "fold" }, { "kind": "call" }])
        );
        let strategy = floats(&q["strategy"]);
        let weights = floats(&q["weights"]);
        let ev = floats(&q["ev"]);
        let calls = mean(&strategy, &weights, 1, |_| true);
        assert!((calls - call).abs() < 0.01, "calls {calls}, theory {call}");
        // Folding is 0; calling a bet that makes them indifferent is worth 0 too.
        assert_eq!(mean(&ev, &weights, 0, |_| true), 0.0);
        assert!(mean(&ev, &weights, 1, |_| true).abs() < 0.01 * 1000.0);
    }

    #[test]
    fn three_quarter_pot() {
        check("75%", 0.75);
    }

    #[test]
    fn pot() {
        check("100%", 1.0);
    }

    #[test]
    fn is_deterministic() {
        let input = toy_input("75%", json!([]));
        let run = || {
            let mut solver = Solver::new(&input.to_string()).unwrap();
            solver.allocate(false);
            let e = solver.step(100).unwrap();
            (e, solver.query_json().unwrap())
        };
        assert_eq!(run(), run());
    }
}

mod ev_convention {
    use super::*;

    /// Two players with the same hand chop: what they put in from the node on comes back,
    /// less half the rake, so a call's EV counts the whole pot.
    #[test]
    fn counts_from_the_node_after_rake() {
        let b = board("Ks7h4cQd2s");
        let input = json!({
            "board": b,
            "oopRange": range(&b, &[("AA", 1.0)]),
            "ipRange": range(&b, &[("AA", 1.0)]),
            "pot": 1000, "stack": 5000, "rakeRate": 0.05, "rakeCap": 100,
            "river": { "bet": "50%", "raise": "" },
            "raiseCap": 0, "allInThreshold": 0.0, "addAllIn": false,
            "prefix": [{ "kind": "bet", "to": 500 }],
        });
        let (mut solver, _) = solve(&input, 0.01);
        let q = query(&mut solver);
        let weights = floats(&q["weights"]);
        let ev = floats(&q["ev"]);
        // Calling makes the pot 2000, raked 100: each gets 950 back for the 500 put in.
        let call = mean(&ev, &weights, 1, |_| true);
        assert!((call - 450.0).abs() < 0.5, "call EV {call}");
        assert_eq!(mean(&ev, &weights, 0, |_| true), 0.0);
    }
}

mod prefix {
    use super::*;

    fn input(prefix: Value, raise_cap: u32) -> Value {
        let b = board("Td9d6hQc2s");
        let mut v = json!({
            "board": b,
            "oopRange": range(&b, &[("AA", 1.0), ("KJ", 1.0), ("87", 1.0), ("54", 0.5)]),
            "ipRange": range(&b, &[("QQ", 1.0), ("AQ", 1.0), ("KT", 1.0), ("33", 1.0)]),
            "pot": 1000, "stack": 9000, "rakeRate": 0.05, "rakeCap": 300,
            "river": { "bet": "33%, 75%", "raise": "2.5x" },
            "raiseCap": raise_cap, "allInThreshold": 0.1, "addAllIn": true,
            "prefix": prefix,
        });
        v["flop"] = json!({ "bet": "50%", "raise": "3x" });
        v
    }

    fn actions_at(prefix: Value, raise_cap: u32) -> Value {
        let mut solver = Solver::new(&input(prefix, raise_cap).to_string()).unwrap();
        solver.allocate(true);
        solver.step(3).unwrap();
        query(&mut solver)
    }

    #[test]
    fn walks_to_an_actual_size_added_to_the_tree() {
        let q = actions_at(
            json!([{ "kind": "check" }, { "kind": "bet", "to": 420 }]),
            3,
        );
        assert_eq!(q["player"], 0);
        assert_eq!(q["pot"], 1420);
        assert_eq!(
            q["actions"],
            json!([
                { "kind": "fold" }, { "kind": "call" },
                { "kind": "raise", "to": 1050 }, { "kind": "allin", "to": 9000 }
            ])
        );
    }

    #[test]
    fn keeps_a_size_already_in_the_tree() {
        let a = actions_at(json!([{ "kind": "bet", "to": 330 }]), 3);
        assert_eq!(a["pot"], 1330);
        let root = actions_at(json!([]), 3);
        assert_eq!(
            root["actions"],
            json!([
                { "kind": "check" }, { "kind": "bet", "to": 330 },
                { "kind": "bet", "to": 750 }, { "kind": "allin", "to": 9000 }
            ])
        );
    }

    #[test]
    fn an_allin_over_the_effective_stack_is_the_effective_allin() {
        let q = actions_at(json!([{ "kind": "allin", "to": 12000 }]), 3);
        assert_eq!(q["pot"], 10000);
        assert_eq!(
            q["actions"],
            json!([{ "kind": "fold" }, { "kind": "call" }])
        );
    }

    #[test]
    fn stops_raising_at_the_cap() {
        let line = json!([{ "kind": "bet", "to": 330 }, { "kind": "raise", "to": 825 }]);
        // One raise allowed: after it, only fold and call (and no all-in either).
        let q = actions_at(line.clone(), 1);
        assert_eq!(
            q["actions"],
            json!([{ "kind": "fold" }, { "kind": "call" }])
        );
        // Two allowed: a re-raise.
        let q = actions_at(line, 2);
        assert_eq!(q["actions"].as_array().unwrap().len(), 4);
        // None allowed: facing the bet, fold or call.
        let q = actions_at(json!([{ "kind": "bet", "to": 330 }]), 0);
        assert_eq!(
            q["actions"],
            json!([{ "kind": "fold" }, { "kind": "call" }])
        );
    }

    #[test]
    fn adds_a_raise_past_the_cap_that_was_made() {
        let line = json!([{ "kind": "bet", "to": 330 }, { "kind": "raise", "to": 1000 }]);
        let q = actions_at(line, 0);
        assert_eq!(q["player"], 0);
        assert_eq!(q["pot"], 2330);
        assert_eq!(
            q["actions"],
            json!([{ "kind": "fold" }, { "kind": "call" }])
        );
    }

    #[test]
    fn refuses_an_illegal_or_finished_line() {
        let refuse = |prefix: Value| Solver::new(&input(prefix, 3).to_string()).err().unwrap();
        assert!(refuse(json!([{ "kind": "call" }])).contains("not legal"));
        assert!(
            refuse(json!([{ "kind": "bet", "to": 330 }, { "kind": "check" }]))
                .contains("not legal")
        );
        assert!(refuse(json!([{ "kind": "bet" }])).contains("needs `to`"));
        assert!(refuse(json!([{ "kind": "check" }, { "kind": "check" }])).contains("decision"));
        assert!(
            refuse(json!([{ "kind": "bet", "to": 330 }, { "kind": "call" }])).contains("decision")
        );
        assert!(
            refuse(json!([{ "kind": "bet", "to": 330 }, { "kind": "fold" }])).contains("decision")
        );
    }
}

mod input {
    use super::*;

    fn base() -> Value {
        let b = board("Td9d6hQc");
        json!({
            "board": b,
            "oopRange": range(&b, &[("AK", 1.0)]),
            "ipRange": range(&b, &[("QQ", 1.0)]),
            "pot": 1000, "stack": 3000, "rakeRate": 0.0, "rakeCap": 0,
            "turn": { "bet": "50%", "raise": "" },
            "river": { "bet": "50%", "raise": "" },
            "raiseCap": 0, "allInThreshold": 0.0, "addAllIn": true, "prefix": [],
        })
    }

    #[test]
    fn takes_the_root_street_from_the_board() {
        let solver = Solver::new(&base().to_string()).unwrap();
        let e: Value = serde_json::from_str(&solver.estimate_json()).unwrap();
        assert!(e["bytes"].as_u64().unwrap() > e["bytesCompressed"].as_u64().unwrap());
        assert!(e["nodes"].as_u64().unwrap() > 10);
    }

    #[test]
    fn refuses_bad_input() {
        let refuse = |patch: Value| {
            let mut v = base();
            for (k, x) in patch.as_object().unwrap() {
                v[k] = x.clone();
            }
            Solver::new(&v.to_string()).err().unwrap()
        };
        assert!(refuse(json!({ "board": [0, 1] })).contains("3, 4 or 5"));
        assert!(refuse(json!({ "board": [0, 0, 1] })).contains("unique"));
        assert!(refuse(json!({ "pot": 10.5 })).contains("whole number"));
        assert!(refuse(json!({ "stack": 0 })).contains("positive"));
        assert!(refuse(json!({ "oopRange": [1.0] })).contains("1326"));
        assert!(refuse(json!({ "ipRange": vec![0.0; NUM_PAIRS] })).contains("empty"));
        assert!(refuse(json!({ "turn": { "bet": "2x", "raise": "" } })).len() > 0);
        assert!(Solver::new("{").is_err());
    }

    #[test]
    fn refuses_steps_before_allocation_and_after_the_query() {
        let mut solver = Solver::new(&base().to_string()).unwrap();
        assert!(solver.step(1).is_err());
        assert!(solver.query_json().is_err());
        solver.allocate(false);
        solver.step(2).unwrap();
        let first = solver.query_json().unwrap();
        assert_eq!(solver.query_json().unwrap(), first);
        assert!(solver.step(1).is_err());
    }
}

mod unreached {
    use super::*;

    /// The nuts never check, so facing a bet after a check they have no reach; their
    /// equity and EV still come from the opponent's range and are reported.
    #[test]
    fn a_hand_never_played_to_the_node_keeps_its_values() {
        let b = board("Ks7h4cQd2s");
        let input = json!({
            "board": b,
            "oopRange": range(&b, &[("KK", 1.0), ("65", 1.0), ("33", 1.0)]),
            "ipRange": range(&b, &[("QJ", 1.0), ("77", 1.0)]),
            "pot": 1000, "stack": 20000, "rakeRate": 0.0, "rakeCap": 0,
            "river": { "bet": "75%", "raise": "" },
            "raiseCap": 0, "allInThreshold": 0.0, "addAllIn": false,
            "prefix": [{ "kind": "check" }, { "kind": "bet", "to": 750 }],
        });
        let (mut solver, _) = solve(&input, 0.05);
        let q = query(&mut solver);
        assert_eq!(q["player"], 0);
        let weights = floats(&q["weights"]);
        let equity = floats(&q["equity"]);
        let ev = floats(&q["ev"]);
        let kk = card_pair_to_index(card("Kh"), card("Kd"));
        assert_eq!(weights[kk], 0.0, "the nuts never check");
        assert!((equity[kk] - 1.0).abs() < 1e-4, "equity {}", equity[kk]);
        // Calling wins the 2500 pot for the 750 put in.
        assert!(
            (ev[NUM_PAIRS + kk] - 1750.0).abs() < 1.0,
            "call EV {}",
            ev[NUM_PAIRS + kk]
        );
        assert_eq!(ev[kk], 0.0);
    }
}
