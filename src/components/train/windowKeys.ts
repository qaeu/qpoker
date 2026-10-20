/**
 * What a Train screen's window-wide keys stand down for: a modifier, a field being
 * typed into, and an Escape something else owns.
 */

import { TYPING } from '#utils/ui/keys';

/** A listbox or menu has the Escape that closes it. */
const ESCAPE_OWNERS = 'select, [role="listbox"], [role="menu"]';

/** Whether `event` came from a field being typed into. */
export function isTyping(event: KeyboardEvent): boolean {
	return event.target instanceof Element && event.target.closest(TYPING) !== null;
}

/** Whether `event` is an Escape that something other than the screen should take. */
export function escapeIsTaken(event: KeyboardEvent): boolean {
	return event.target instanceof Element && event.target.closest(ESCAPE_OWNERS) !== null;
}

/** Whether a modifier is held, which is not the screen's key. */
export function hasModifier(event: KeyboardEvent): boolean {
	return event.ctrlKey || event.metaKey || event.altKey;
}
