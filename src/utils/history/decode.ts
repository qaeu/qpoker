/**
 * A hand history requested by email arrives quoted-printable: trailing spaces
 * as `=20`, and every line over 76 columns folded with a `=` soft break --
 * often mid-word. This undoes that. A history saved by the client itself has
 * none of it and passes through with only its line endings normalised.
 */

const SOFT_BREAK = /=\r?\n/;

/** True when the text carries quoted-printable soft breaks or `=20` line ends. */
export function isQuotedPrintable(text: string): boolean {
	return SOFT_BREAK.test(text) || /=20\r?\n/.test(text);
}

function decodeQuotedPrintable(text: string): string {
	const joined = text.replace(/=\r?\n/g, '');
	const decoder = new TextDecoder('utf-8');
	// Runs of escapes are decoded together: a non-ASCII screen name is several
	// bytes of one UTF-8 character.
	return joined.replace(/(?:=[0-9A-Fa-f]{2})+/g, (run) => {
		const bytes = new Uint8Array(run.length / 3);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = parseInt(run.slice(i * 3 + 1, i * 3 + 3), 16);
		}
		return decoder.decode(bytes);
	});
}

/** Raw file text -> clean `\n`-terminated lines' worth of text. */
export function decodeHistory(raw: string): string {
	const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
	const decoded = isQuotedPrintable(text) ? decodeQuotedPrintable(text) : text;
	return decoded.replace(/\r\n?/g, '\n');
}
