import { describe, it, expect } from 'vitest';

import { formatReport } from '#cli/format';
import { analyzeLog } from '#utils/coach/report';

import { BLINDS_HERO_UTG, handText, TOUGH_FOLD } from '../utils/history/handText';

const folds = (...names: string[]) => names.map((name) => `${name}: folds`);

/** One hand: the hero folds aces under the gun. */
const log = handText({
	id: 4242,
	heroCards: 'As Ad',
	button: 4,
	lines: [
		...BLINDS_HERO_UTG,
		'*** HOLE CARDS ***',
		...folds('hero', 'p2', 'p3', 'p4', 'p5'),
		'Uncalled bet ($0.05) returned to p6',
		'p6 collected $0.10 from pot',
	],
	pot: '0.10',
	winner: 'p6',
});

const OPTIONS = { top: 15, minSeverity: 'inaccuracy', color: false } as const;

describe('the terminal report', () => {
	const report = analyzeLog(log);

	it('heads with the session and lists the mistake', () => {
		const text = formatReport(report, OPTIONS);
		expect(text).toMatch(/^hero · \$0\.05\/\$0\.10 · 1 hands/);
		expect(text).toContain('SESSION');
		expect(text).toContain('BY POSITION');
		expect(text).toContain('LEAKS BY KIND');
		expect(text).toContain('MISTAKES (1 of 1, costliest first)');
		expect(text).toContain('BLUNDER');
		expect(text).toContain('Folded a standard open');
		expect(text).toContain('Hand #4242');
		expect(text).toContain('As Ad in the UTG');
		expect(text).toContain('You fold; the baseline is to raise.');
		expect(text).toContain('>> hero (UTG) folds <<');
	});

	it('sets the opening ranges beside the chart', () => {
		const text = formatReport(report, OPTIONS);
		expect(text).toContain('OPENING RANGES');
		expect(text).toMatch(/UTG\s+1\s+0%\s+100%\s+0/);
		expect(text).toContain('Folded inside the chart: AA UTG #4242');
		expect(text).not.toContain('Opened outside the chart');
	});

	it('uses no escape codes unless asked for colour', () => {
		expect(formatReport(report, OPTIONS)).not.toContain('\x1b[');
		expect(formatReport(report, { ...OPTIONS, color: true })).toContain('\x1b[');
	});

	it('filters by severity and caps the list', () => {
		expect(formatReport(report, { ...OPTIONS, top: 0 })).toContain('MISTAKES (0 of 1');
		const clean = analyzeLog(log.replace('As Ad', '7c 2d'));
		expect(formatReport(clean, OPTIONS)).toContain('None at this severity.');
	});

	it('lists the good plays after the mistakes, when there are any', () => {
		expect(formatReport(report, OPTIONS)).not.toContain('GOOD PLAYS');
		const praised = analyzeLog(`${log}\n${handText(TOUGH_FOLD)}`);
		const text = formatReport(praised, OPTIONS);
		expect(text.indexOf('GOOD PLAYS (1 of 1, most valuable first)')).toBeGreaterThan(
			text.indexOf('MISTAKES (1 of 1')
		);
		expect(text).toContain('GREAT PLAY');
		expect(text).toContain('Laid down a strong hand without the price');
		expect(text).toMatch(/\+\d+\.\d\dbb \(medium confidence\)/);
		expect(text).toContain('You fold, as the baseline does; to call was the mistake.');
		expect(text).toContain('>> hero (UTG) folds <<');
		expect(formatReport(praised, { ...OPTIONS, top: 0 })).toContain('GOOD PLAYS (0 of 1');
	});

	it('shows one hand in full', () => {
		const text = formatReport(report, { ...OPTIONS, handId: '4242' });
		expect(text).toMatch(/^Hand #4242 · 2026-01-02/);
		expect(text).toContain('6-handed');
		expect(text).toContain('result -0.0bb'.replace('-', ''));
		expect(text).toContain('Folded a standard open');
		expect(formatReport(report, { ...OPTIONS, handId: '1' })).toBe(
			'No hand #1 in this log.'
		);
	});
});
