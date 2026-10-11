/**
 * The last report, kept in `localStorage` so a reload does not cost a
 * re-analysis. Versioned: a report written by an older build is dropped rather
 * than rendered wrong.
 */

import { REPORT_VERSION, type AnalysisReport } from '../coach/report';

const KEY = 'pokeranalysis:report';

interface StoredReport {
	version: number;
	savedAt: string;
	fileName: string;
	report: AnalysisReport;
}

export interface LoadedReport {
	fileName: string;
	report: AnalysisReport;
}

export function loadReport(): LoadedReport | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const stored = JSON.parse(raw) as Partial<StoredReport>;
		if (stored.version !== REPORT_VERSION || !stored.report) return null;
		if (stored.report.version !== REPORT_VERSION || !Array.isArray(stored.report.hands)) {
			return null;
		}
		return { fileName: stored.fileName ?? '', report: stored.report };
	} catch {
		return null;
	}
}

/** Returns false when the report did not fit: it is then simply not cached. */
export function saveReport(fileName: string, report: AnalysisReport): boolean {
	try {
		const stored: StoredReport = {
			version: REPORT_VERSION,
			savedAt: new Date().toISOString(),
			fileName,
			report,
		};
		localStorage.setItem(KEY, JSON.stringify(stored));
		return true;
	} catch {
		return false;
	}
}

export function clearReport(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// Nothing to clear if storage is unavailable.
	}
}
