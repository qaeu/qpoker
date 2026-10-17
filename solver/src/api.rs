//! qpoker's solver API: JSON in, JSON out, callable natively (tests) and from `wasm.rs`.
//!
//! The shapes are `src/utils/solver/wasmApi.ts`, which is the contract. Money is integer
//! cents throughout, so the solver's chip unit is one cent.

use crate::action_tree::*;
use crate::bet_size::*;
use crate::card::*;
use crate::game::*;
use crate::range::*;
use crate::solver::*;
use crate::utility::*;
use serde::{Deserialize, Serialize};

/// Number of two-card combos, the length of every per-hand array.
pub const NUM_PAIRS: usize = 52 * 51 / 2;

/// One action on the line, as the contract writes it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WasmAction {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub to: Option<f64>,
}

/// An action at the queried node; `to` as in `WasmAction`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NodeAction {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to: Option<i32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WasmStreetSizes {
    pub bet: String,
    pub raise: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmInput {
    pub board: Vec<u8>,
    pub oop_range: Vec<f32>,
    pub ip_range: Vec<f32>,
    pub pot: f64,
    pub stack: f64,
    pub rake_rate: f64,
    pub rake_cap: f64,
    pub flop: Option<WasmStreetSizes>,
    pub turn: Option<WasmStreetSizes>,
    pub river: Option<WasmStreetSizes>,
    pub raise_cap: u32,
    pub all_in_threshold: f64,
    pub add_all_in: bool,
    #[serde(default)]
    pub prefix: Vec<WasmAction>,
    /// Buckets a player a river board, river decisions stored per bucket; 0 for none.
    #[serde(default)]
    pub river_buckets: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WasmEstimate {
    pub bytes: u64,
    pub bytes_compressed: u64,
    pub nodes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct WasmQuery {
    pub player: u8,
    pub actions: Vec<NodeAction>,
    pub pot: i64,
    pub strategy: Vec<f32>,
    pub ev: Vec<f32>,
    pub equity: Vec<f32>,
    pub weights: Vec<f32>,
}

/// A game built from a `WasmInput`, with the prefix's actions in its tree.
pub struct Solver {
    game: PostFlopGame,
    /// The prefix as postflop-solver actions, the ones in the tree.
    line: Vec<Action>,
    iteration: u32,
    finalized: bool,
}

/// Money in cents from JSON: a whole, positive number that fits the solver's `i32`.
fn cents(value: f64, name: &str) -> Result<i32, String> {
    if !value.is_finite() || value.fract() != 0.0 || value <= 0.0 || value > i32::MAX as f64 / 4.0 {
        return Err(format!(
            "{name} must be a positive whole number of cents: {value}"
        ));
    }
    Ok(value as i32)
}

fn street_sizes(sizes: &Option<WasmStreetSizes>) -> Result<[BetSizeOptions; 2], String> {
    match sizes {
        None => Ok(Default::default()),
        Some(s) => {
            let options = BetSizeOptions::try_from((s.bet.as_str(), s.raise.as_str()))?;
            Ok([options.clone(), options])
        }
    }
}

/// Tracks the line through the street the way `ActionTree`'s build does, to turn the
/// contract's `to` amounts into the tree's actions.
struct LineState {
    /// Chips behind for each player since the root.
    stack: [i32; 2],
    /// The latest bet on this street (the bettor's street total), or 0.
    prev_amount: i32,
    player: usize,
    allin: bool,
    /// The street is over (both checked, a call, or a fold).
    closed: bool,
}

impl LineState {
    fn new(stack: i32) -> Self {
        Self {
            stack: [stack, stack],
            prev_amount: 0,
            player: 0,
            allin: false,
            closed: false,
        }
    }

    /// The tree's action for `action`, or why it can't be taken here.
    fn translate(&self, action: &WasmAction) -> Result<Action, String> {
        if self.closed {
            return Err(format!("`{}` after the street is over", action.kind));
        }
        let p = self.player;
        let to_call = self.stack[p] - self.stack[p ^ 1];
        let max_amount = self.stack[p ^ 1] + self.prev_amount;
        let min_amount = (self.prev_amount + to_call).clamp(1, max_amount.max(1));
        let facing_bet = self.prev_amount > 0;
        let to = || -> Result<i32, String> {
            let to = action
                .to
                .ok_or_else(|| format!("`{}` needs `to`", action.kind))?;
            if !to.is_finite() || to <= 0.0 {
                return Err(format!("`{}` to {to}", action.kind));
            }
            Ok(to.round().min(i32::MAX as f64) as i32)
        };
        Ok(match action.kind.as_str() {
            "fold" if facing_bet => Action::Fold,
            "check" if !facing_bet => Action::Check,
            "call" if facing_bet => Action::Call,
            "bet" | "raise" | "allin" => {
                let to = to()?;
                if self.allin {
                    return Err(format!("`{}` after an all-in", action.kind));
                }
                // Below the minimum (a short all-in): the minimum.
                let amount = to.max(min_amount);
                if facing_bet && to <= self.prev_amount {
                    // All in for no more than the bet: a call.
                    Action::Call
                } else if action.kind == "allin" || amount >= max_amount {
                    Action::AllIn(max_amount)
                } else if facing_bet {
                    Action::Raise(amount)
                } else {
                    Action::Bet(amount)
                }
            }
            kind => {
                let state = if facing_bet {
                    "facing a bet"
                } else {
                    "not facing a bet"
                };
                return Err(format!("`{kind}` is not legal {state}"));
            }
        })
    }

    fn apply(&mut self, action: Action) {
        let p = self.player;
        match action {
            Action::Fold => self.closed = true,
            Action::Check => {
                if p == 1 {
                    self.closed = true;
                }
            }
            Action::Call => {
                self.stack[p] = self.stack[p ^ 1];
                self.closed = true;
            }
            Action::Bet(amount) | Action::Raise(amount) | Action::AllIn(amount) => {
                let to_call = self.stack[p] - self.stack[p ^ 1];
                self.stack[p] -= amount - self.prev_amount + to_call;
                self.prev_amount = amount;
                self.allin = matches!(action, Action::AllIn(_));
            }
            _ => unreachable!(),
        }
        self.player ^= 1;
    }
}

fn to_node_action(action: Action) -> NodeAction {
    let (kind, to) = match action {
        Action::Fold => ("fold", None),
        Action::Check => ("check", None),
        Action::Call => ("call", None),
        Action::Bet(a) => ("bet", Some(a)),
        Action::Raise(a) => ("raise", Some(a)),
        Action::AllIn(a) => ("allin", Some(a)),
        _ => unreachable!("no chance action at a decision"),
    };
    NodeAction { kind, to }
}

/// Spreads a per-hand array (the game's `private_cards` order) over the 1326 pair indices.
fn to_pairs(hands: &[(Card, Card)], values: &[f32], rows: usize, out: &mut Vec<f32>) {
    let n = hands.len();
    out.clear();
    out.resize(rows * NUM_PAIRS, 0.0);
    for row in 0..rows {
        for (i, &(c1, c2)) in hands.iter().enumerate() {
            let v = values[row * n + i];
            out[row * NUM_PAIRS + card_pair_to_index(c1, c2)] = if v.is_finite() { v } else { 0.0 };
        }
    }
}

impl Solver {
    /// Builds the tree and the game from the contract's JSON.
    pub fn new(input_json: &str) -> Result<Self, String> {
        let input: WasmInput =
            serde_json::from_str(input_json).map_err(|e| format!("Bad solver input: {e}"))?;
        Self::from_input(&input)
    }

    pub fn from_input(input: &WasmInput) -> Result<Self, String> {
        let pot = cents(input.pot, "pot")?;
        let stack = cents(input.stack, "stack")?;
        let initial_state = match input.board.len() {
            3 => BoardState::Flop,
            4 => BoardState::Turn,
            5 => BoardState::River,
            n => return Err(format!("The board must have 3, 4 or 5 cards, not {n}")),
        };
        if input.oop_range.len() != NUM_PAIRS || input.ip_range.len() != NUM_PAIRS {
            return Err(format!("Each range must have {NUM_PAIRS} weights"));
        }
        if !(0.0..=1.0).contains(&input.rake_rate) || !(input.rake_cap >= 0.0) {
            return Err("Rake must be a rate in 0..1 and a cap of 0 or more".to_string());
        }
        if !(input.all_in_threshold >= 0.0) {
            return Err("The all-in threshold must be 0 or more".to_string());
        }

        let board = &input.board;
        let card_config = CardConfig {
            range: [
                Range::from_raw_data(&input.oop_range)?,
                Range::from_raw_data(&input.ip_range)?,
            ],
            flop: [board[0], board[1], board[2]],
            turn: board.get(3).copied().unwrap_or(NOT_DEALT),
            river: board.get(4).copied().unwrap_or(NOT_DEALT),
        };

        // A rake cap of 0 means none: no pot can exceed the root's pot plus both stacks.
        let rake_cap = match input.rake_cap {
            c if c > 0.0 => c,
            _ => pot as f64 + 2.0 * stack as f64,
        };
        // With `addAllIn`, a threshold no node's all-in can exceed (pot only grows).
        let add_allin_threshold = match input.add_all_in {
            true => stack as f64 / pot as f64 + 1.0,
            false => 0.0,
        };

        let tree_config = TreeConfig {
            initial_state,
            starting_pot: pot,
            effective_stack: stack,
            rake_rate: input.rake_rate,
            rake_cap,
            flop_bet_sizes: street_sizes(&input.flop)?,
            turn_bet_sizes: street_sizes(&input.turn)?,
            river_bet_sizes: street_sizes(&input.river)?,
            turn_donk_sizes: None,
            river_donk_sizes: None,
            add_allin_threshold,
            force_allin_threshold: input.all_in_threshold,
            // The caller chose the sizes; keep each one.
            merging_threshold: 0.0,
            raise_cap: Some(input.raise_cap),
        };

        let mut tree = ActionTree::new(tree_config)?;
        let mut state = LineState::new(stack);
        let mut line = Vec::with_capacity(input.prefix.len());
        for action in &input.prefix {
            let action = state.translate(action)?;
            if !tree.available_actions().contains(&action) {
                // The actual size (or a raise past the cap): put it in the tree.
                tree.add_action(action)?;
            }
            tree.play(action)?;
            state.apply(action);
            line.push(action);
        }
        if tree.is_terminal_node() || tree.is_chance_node() {
            return Err("The prefix does not end at a decision on the root's street".to_string());
        }

        let game =
            PostFlopGame::with_river_buckets(card_config, tree, input.river_buckets as usize)?;
        Ok(Self {
            game,
            line,
            iteration: 0,
            finalized: false,
        })
    }

    pub fn estimate(&self) -> WasmEstimate {
        let (bytes, bytes_compressed) = self.game.memory_usage();
        WasmEstimate {
            bytes,
            bytes_compressed,
            nodes: self.game.num_nodes(),
        }
    }

    pub fn estimate_json(&self) -> String {
        serde_json::to_string(&self.estimate()).unwrap()
    }

    pub fn allocate(&mut self, compressed: bool) {
        self.game.allocate_memory(compressed);
    }

    /// Runs `n` DCFR iterations and returns the exploitability in cents.
    pub fn step(&mut self, n: u32) -> Result<f32, String> {
        if self.finalized {
            return Err("The solve is already finalised".to_string());
        }
        if self.game.is_memory_allocated().is_none() {
            return Err("Memory is not allocated".to_string());
        }
        for _ in 0..n {
            solve_step(&self.game, self.iteration);
            self.iteration += 1;
        }
        Ok(compute_exploitability(&self.game))
    }

    pub fn iterations(&self) -> u32 {
        self.iteration
    }

    /// Finalises (once) and reads the node the prefix leads to.
    pub fn query(&mut self) -> Result<WasmQuery, String> {
        if self.game.is_memory_allocated().is_none() {
            return Err("Memory is not allocated".to_string());
        }
        if !self.finalized {
            finalize(&mut self.game);
            self.finalized = true;
        }

        let game = &mut self.game;
        game.back_to_root();
        for action in &self.line {
            let index = game
                .available_actions()
                .iter()
                .position(|a| a == action)
                .ok_or_else(|| format!("Action {action:?} is not in the tree"))?;
            game.play(index);
        }
        game.cache_normalized_weights();

        let player = game.current_player();
        let actions = game.available_actions();
        let num_actions = actions.len();
        let hands = game.private_cards(player);
        let total = game.total_bet_amount();
        let pot = game.tree_config().starting_pot as i64 + total[0] as i64 + total[1] as i64;

        let mut weights = Vec::new();
        to_pairs(hands, game.normalized_weights(player), 1, &mut weights);
        let mut equity = Vec::new();
        to_pairs(hands, &game.equity(player), 1, &mut equity);
        let mut strategy = Vec::new();
        to_pairs(hands, &game.strategy(), num_actions, &mut strategy);
        // EV convention: postflop-solver's `expected_values_detail` for the acting player
        // adds back (starting pot) / 2 plus what they have put in since the root to the raw
        // counterfactual payoff (which is net of their whole contribution, half the root pot
        // included). That leaves exactly the contract's figure: what they win from the pot
        // at the end, after rake, less what they put in from this node on. A fold is 0.
        // The solver's chip is a cent, so this is cents; no conversion is needed.
        let mut ev = Vec::new();
        to_pairs(
            hands,
            &game.expected_values_detail(player),
            num_actions,
            &mut ev,
        );

        // A hand in the starting range keeps its strategy, equity and EV even where its own
        // reach here is zero: all three depend on the opponent's reach alone. Pairs outside
        // the range or on the board stay zero (`to_pairs`).

        Ok(WasmQuery {
            player: player as u8,
            actions: actions.into_iter().map(to_node_action).collect(),
            pot,
            strategy,
            ev,
            equity,
            weights,
        })
    }

    pub fn query_json(&mut self) -> Result<String, String> {
        let query = self.query()?;
        serde_json::to_string(&query).map_err(|e| e.to_string())
    }
}

/// The contract's pair index of two card ids.
pub fn pair_index(c1: Card, c2: Card) -> usize {
    card_pair_to_index(c1, c2)
}
