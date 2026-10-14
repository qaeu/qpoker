/**
 * The 13x13 starting-hand grid, each cell filled by how often the strategy
 * raises and calls the hand: pairs on the diagonal, suited above, offsuit
 * below. One cell can be marked as the hand in question, and a second range
 * outlined over the fill.
 */

import { For, type Component } from 'solid-js';

import { className } from '#utils/cards/combos';
import type { Range, Strategy } from '#utils/ranges/range';

import '#styles/ranges/RangeGrid';

interface RangeGridProps {
	strategy: Strategy;
	/** A class name to mark, e.g. `AKo`. */
	marked?: string;
	/** What a hand that is neither raised nor called does: `folds`, or `checks`. */
	rest?: string;
	/** A second range to read the fill against: its hands are drawn with a rule round them. */
	outline?: Range;
	/** Which cells are set faint. By default, those that are never played. */
	faint?: (cls: number) => boolean;
	/** A cell's tooltip, in place of the strategy's frequencies. */
	describe?: (cls: number) => string;
}

const CELLS = Array.from({ length: 169 }, (_, cls) => cls);

const share = (value: number): string => `${Math.round(value * 100)}%`;

const RangeGrid: Component<RangeGridProps> = (props) => (
	<div
		class="range-grid"
		classList={{ 'range-grid--checks': props.rest === 'checks' }}
		role="grid"
		aria-label="Starting-hand range"
	>
		<For each={CELLS}>
			{(cls) => {
				const name = className(cls);
				const raise = () => props.strategy.raise[cls];
				const call = () => props.strategy.call[cls];
				return (
					<span
						class="range-grid__cell"
						classList={{
							'is-marked': props.marked === name,
							// A hand that checks is still played.
							'is-empty':
								props.faint?.(cls) ?? (props.rest !== 'checks' && raise() + call() === 0),
							'is-outlined': (props.outline?.[cls] ?? 0) >= 0.5,
						}}
						role="gridcell"
						title={
							props.describe?.(cls)
							?? `${name}: raises ${share(raise())}, calls ${share(call())}, ${props.rest ?? 'folds'} ${share(Math.max(0, 1 - raise() - call()))}`
						}
						// The fill is data, not styling: two bars whose widths are the frequencies.
						style={{ '--raise': raise(), '--call': call() }}
					>
						{name}
					</span>
				);
			}}
		</For>
	</div>
);

export default RangeGrid;
