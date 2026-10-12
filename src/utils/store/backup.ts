/**
 * A copy of the library to keep outside the browser: the hands' own text,
 * which is all the rest is rebuilt from. Loaded back in, it is read as the log
 * it amounts to. See docs/library.md.
 */

export const BACKUP_VERSION = 1;

export interface LibraryBackup {
	version: number;
	/** An ISO timestamp. */
	exportedAt: string;
	hero: string;
	/** Each hand's lines, oldest first. */
	hands: string[];
}

export function backupOf(
	hero: string,
	hands: readonly string[],
	now: string
): LibraryBackup {
	return { version: BACKUP_VERSION, exportedAt: now, hero, hands: [...hands] };
}

/** `qpoker-library-2026-10-12T10-00-00Z.json`. */
export const backupName = (backup: LibraryBackup): string =>
	`qpoker-library-${backup.exportedAt.replace(/:/g, '-').replace(/\.\d+/, '')}.json`;

/** The log a loaded file amounts to: a copy's hands set end to end, or the file as it is. */
export function logTextOf(file: string): string {
	if (!file.trimStart().startsWith('{')) return file;
	try {
		const backup = JSON.parse(file) as Partial<LibraryBackup>;
		if (backup.version !== BACKUP_VERSION || !Array.isArray(backup.hands)) return file;
		return backup.hands.filter((hand) => typeof hand === 'string').join('\n\n');
	} catch {
		return file;
	}
}
