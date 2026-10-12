/**
 * What is left in `localStorage` now that the hands live in the library
 * (`store/idbStore.ts`): nothing but the last report an older build cached,
 * which is dropped. It held no hand text, so there is nothing to carry over.
 */

const LEGACY_REPORT_KEY = 'qpoker:report';

export function clearLegacyReport(): void {
	try {
		localStorage.removeItem(LEGACY_REPORT_KEY);
	} catch {
		// Nothing to clear if storage is unavailable.
	}
}
