import type { AnalysisReport, ReportSummary } from '#utils/coach/report';

/** The summed half of a report: what a sum over stored hands is held to. */
export function summed(report: AnalysisReport): ReportSummary {
	const copy: Partial<AnalysisReport> = { ...report };
	delete copy.hands;
	delete copy.mistakes;
	delete copy.goodPlays;
	return copy as ReportSummary;
}
