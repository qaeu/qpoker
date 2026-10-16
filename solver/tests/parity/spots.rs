// Shared by the upstream baseline program and qpoker's parity test (tests/parity.rs).
#![allow(dead_code)]
use postflop_solver::*;

pub struct Summary {
    pub exploitability: f32,
    pub ev: [f64; 2],
    pub root_strategy_sum: f64,
    pub root_actions: String,
    pub after_bet_strategy_sum: f64,
}

fn summarise(mut game: PostFlopGame, iterations: u32) -> Summary {
    for i in 0..iterations {
        solve_step(&game, i);
    }
    let exploitability = compute_exploitability(&game);
    finalize(&mut game);
    game.cache_normalized_weights();
    let mut ev = [0.0; 2];
    for p in 0..2 {
        let e = game.expected_values(p);
        let w = game.normalized_weights(p);
        ev[p] = compute_average(&e, w) as f64;
    }
    let s = game.strategy();
    let root_strategy_sum = s
        .iter()
        .enumerate()
        .map(|(i, &x)| (i % 97) as f64 * x as f64)
        .sum();
    let root_actions = format!("{:?}", game.available_actions());
    game.play(1);
    let s = game.strategy();
    let after_bet_strategy_sum = s
        .iter()
        .enumerate()
        .map(|(i, &x)| (i % 89) as f64 * x as f64)
        .sum();
    Summary {
        exploitability,
        ev,
        root_strategy_sum,
        root_actions,
        after_bet_strategy_sum,
    }
}

/// A raked river spot, 32-bit storage.
pub fn river_spot() -> Summary {
    let card_config = CardConfig {
        range: [
            "66+,A8s+,A5s-A4s,AJo+,K9s+,KQo,QTs+,JTs,96s+,85s+,75s+,65s,54s"
                .parse()
                .unwrap(),
            "QQ-22,AQs-A2s,ATo+,K5s+,KJo+,Q8s+,J8s+,T7s+,96s+,86s+,75s+,64s+,53s+"
                .parse()
                .unwrap(),
        ],
        flop: flop_from_str("Td9d6h").unwrap(),
        turn: card_from_str("Qc").unwrap(),
        river: card_from_str("2s").unwrap(),
    };
    let sizes = BetSizeOptions::try_from(("33%, 75%, a", "2.5x")).unwrap();
    let tree_config = TreeConfig {
        initial_state: BoardState::River,
        starting_pot: 200,
        effective_stack: 900,
        rake_rate: 0.05,
        rake_cap: 30.0,
        river_bet_sizes: [sizes.clone(), sizes],
        add_allin_threshold: 1.5,
        force_allin_threshold: 0.15,
        merging_threshold: 0.1,
        ..Default::default()
    };
    let tree = ActionTree::new(tree_config).unwrap();
    let mut game = PostFlopGame::with_config(card_config, tree).unwrap();
    game.allocate_memory(false);
    summarise(game, 300)
}

/// An unraked turn spot, 16-bit storage.
pub fn turn_spot() -> Summary {
    let card_config = CardConfig {
        range: [
            "22+,A2s+,A8o+,K7s+,KTo+,Q8s+,QTo+,J8s+,JTo,T8s+,97s+,87s,76s,65s"
                .parse()
                .unwrap(),
            "TT-22,AJs-A2s,AJo-ATo,K9s+,KQo,QTs+,JTs,T9s,98s,87s,76s"
                .parse()
                .unwrap(),
        ],
        flop: flop_from_str("Ks7h3d").unwrap(),
        turn: card_from_str("8c").unwrap(),
        river: NOT_DEALT,
    };
    let sizes = BetSizeOptions::try_from(("50%, a", "3x")).unwrap();
    let tree_config = TreeConfig {
        initial_state: BoardState::Turn,
        starting_pot: 550,
        effective_stack: 2000,
        turn_bet_sizes: [sizes.clone(), sizes.clone()],
        river_bet_sizes: [sizes.clone(), sizes],
        add_allin_threshold: 1.5,
        force_allin_threshold: 0.15,
        merging_threshold: 0.1,
        ..Default::default()
    };
    let tree = ActionTree::new(tree_config).unwrap();
    let mut game = PostFlopGame::with_config(card_config, tree).unwrap();
    game.allocate_memory(true);
    summarise(game, 120)
}
