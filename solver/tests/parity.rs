//! The trimmed crate solves exactly as upstream does.
//!
//! The expected figures were printed by upstream b-inary/postflop-solver at commit
//! 9d1509fe5077d019825f833eed04b16d342dfda1 (with only the `dangerous_implicit_autorefs`
//! fix in `action_tree.rs` needed to build it on the pinned nightly), running the same
//! `parity/spots.rs`, with and without `rayon` (both gave the same numbers).

#[path = "parity/spots.rs"]
mod spots;

fn close(actual: f64, expected: f64) {
    let tolerance = 1e-5 * expected.abs().max(1.0);
    assert!(
        (actual - expected).abs() <= tolerance,
        "{actual} differs from upstream's {expected}"
    );
}

#[test]
fn raked_river_matches_upstream() {
    let s = spots::river_spot();
    assert_eq!(s.root_actions, "[Check, Bet(66), Bet(150), AllIn(900)]");
    close(s.exploitability as f64, 0.065205336);
    close(s.ev[0], 88.4977035522461);
    close(s.ev[1], 97.12757873535156);
    close(s.root_strategy_sum, 7841.591832972411);
    close(s.after_bet_strategy_sum, 10354.140550439528);
}

#[test]
fn compressed_turn_matches_upstream() {
    let s = spots::turn_spot();
    assert_eq!(s.root_actions, "[Check, Bet(275), AllIn(2000)]");
    close(s.exploitability as f64, 1.2175732);
    close(s.ev[0], 275.8903503417969);
    close(s.ev[1], 274.1098937988281);
    close(s.root_strategy_sum, 13567.616778292693);
    close(s.after_bet_strategy_sum, 5677.830174119677);
}
