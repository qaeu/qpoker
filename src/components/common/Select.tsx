/**
 * One choice out of a list too long, or too changeable, to set out as keys: a
 * native select under its printed label. Native on purpose -- the platform's
 * own menu is the right one on a phone, and it is a listbox to the keyboard
 * and a screen reader without any help. See docs/design-language.md.
 */

import { For, type JSX } from 'solid-js';

import '#styles/common/Select';

export interface SelectOption<T extends string> {
	id: T;
	label: string;
}

interface SelectProps<T extends string> {
	/** Names the control, and is printed with it. */
	label: string;
	options: readonly SelectOption<T>[];
	value: T;
	onChange: (value: T) => void;
	/** The label beside the control rather than over it, as in a toolbar. */
	inline?: boolean;
}

// A generic function rather than a `Component<Props>`, which cannot carry `T`.
function Select<T extends string>(props: SelectProps<T>): JSX.Element {
	return (
		<label class="select" classList={{ 'select--inline': props.inline }}>
			<span class="select__label">{props.label}</span>
			<select
				class="select__control"
				value={props.value}
				onChange={(event) => props.onChange(event.currentTarget.value as T)}
			>
				<For each={props.options}>
					{(option) => (
						<option value={option.id} selected={option.id === props.value}>
							{option.label}
						</option>
					)}
				</For>
			</select>
		</label>
	);
}

export default Select;
