/**
 * Where a view's window-wide keys stand down: the focus is somewhere that has
 * its own use for them.
 */

/** Somewhere a letter is being typed rather than pressed. */
export const TYPING = 'input:not([type="radio"]), textarea, select, [contenteditable]';

/** Ark's segments take the arrow keys for themselves. */
export const ARROWED = '[role="radiogroup"]';
