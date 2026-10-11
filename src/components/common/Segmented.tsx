/**
 * One choice out of a few, all of them on show: a row of keys with the one in
 * play lit. Ark's segment group underneath, so it is a radio group to the
 * keyboard and to a screen reader.
 */

import { SegmentGroup } from '@ark-ui/solid/segment-group';
import { For, Show, type JSX } from 'solid-js';

import '#styles/common/Segmented';

export interface SegmentOption<T extends string> {
	id: T;
	label: string;
	/** How many things the option stands for, set small beside its label. */
	count?: number;
}

interface SegmentedProps<T extends string> {
	/** Names the group, and is printed before it. */
	label: string;
	options: readonly SegmentOption<T>[];
	value: T;
	onChange: (value: T) => void;
}

// A generic function rather than a `Component<Props>`, which cannot carry `T`.
function Segmented<T extends string>(props: SegmentedProps<T>): JSX.Element {
	return (
		<SegmentGroup.Root
			class="segmented"
			orientation="horizontal"
			value={props.value}
			onValueChange={(details) => {
				if (details.value !== null) props.onChange(details.value as T);
			}}
		>
			<SegmentGroup.Label class="segmented__label">{props.label}</SegmentGroup.Label>
			<div class="segmented__items">
				<For each={props.options}>
					{(option) => (
						<SegmentGroup.Item
							value={option.id}
							class="segmented__item"
							classList={{ active: props.value === option.id }}
						>
							<SegmentGroup.ItemText>{option.label}</SegmentGroup.ItemText>
							<Show when={option.count !== undefined}>
								<span class="segmented__count">{option.count}</span>
							</Show>
							<SegmentGroup.ItemHiddenInput />
						</SegmentGroup.Item>
					)}
				</For>
			</div>
		</SegmentGroup.Root>
	);
}

export default Segmented;
