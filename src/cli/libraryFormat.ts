/**
 * The terminal rendering of what the library adds to a report: an import, the
 * trend over time, the players. Pure, like `format.ts`: data in, text out.
 */

import { moneyText } from '#utils/coach/report';
import type { Trend } from '#utils/coach/trend';
import type { PlayerProfile } from '#utils/store/profile';
import type { ImportRecord, PlayerAggregate } from '#utils/store/types';

const pct = (value: number | null): string =>
	value === null ? '-' : `${Math.round(value * 100)}%`;

const signed = (value: number, digits = 1): string => {
	const fixed = Math.abs(value).toFixed(digits);
	return (
		Number(fixed) === 0 ? fixed
		: value < 0 ? `-${fixed}`
		: `+${fixed}`
	);
};

const money = (cents: number, currency: string): string =>
	`${
		cents < 0 ? '-'
		: cents > 0 ? '+'
		: ''
	}${moneyText(Math.abs(cents), currency)}`;

const when = (timestamp: string): string => timestamp.replace('T', ' ').slice(0, 16);

const count = (hands: number): string => `${hands} ${hands === 1 ? 'hand' : 'hands'}`;

/** `a.txt: 120 hands, 19 new, 1 replaced`. */
export function formatImport(record: ImportRecord, graded: number): string {
	const replaced = record.replaced > 0 ? `, ${record.replaced} replaced` : '';
	const regraded = graded - record.added - record.replaced;
	const again = regraded > 0 ? `; ${count(regraded)} brought up to date` : '';
	return `${record.fileName}: ${count(record.hands)}, ${record.added} new${replaced}${again}`;
}

export function formatTrend(trend: Trend, top: number): string {
	const out: string[] = ['TREND'];
	if (!trend.halves) {
		out.push('  Too few graded hands to say whether the mistakes are getting rarer.');
	} else {
		const { earlier, later } = trend.halves;
		const verdict =
			trend.direction === 'better' ? 'clearly better'
			: trend.direction === 'worse' ? 'clearly worse'
			: 'no change the sample can bear';
		out.push(
			`  Mistakes cost ${signed(earlier.evLostPer100)}bb/100 over the earlier ${earlier.hands} graded hands`,
			`  and ${signed(later.evLostPer100)}bb/100 over the later ${later.hands}: ${verdict}.`
		);
		for (const shift of trend.shifts) {
			out.push(
				`  ${shift.direction === 'better' ? 'rarer' : 'more often'}: ${shift.title} `
					+ `(${shift.earlier.toFixed(1)} -> ${shift.later.toFixed(1)} per 100 hands)`
			);
		}
	}
	const listed = trend.points.slice(-top).reverse();
	out.push(
		'',
		`SITTINGS (${listed.length} of ${trend.points.length}, latest first)`,
		`  ${'Started'.padEnd(18)}${'Hands'.padEnd(7)}${'Result'.padEnd(10)}${'Mistakes'.padEnd(10)}Lost/100`
	);
	for (const point of listed) {
		const lost = point.evLostPer100 === null ? '-' : `${signed(point.evLostPer100)}bb`;
		out.push(
			`  ${when(point.session.first).padEnd(18)}${String(point.hands).padEnd(7)}${`${signed(point.netBb)}bb`.padEnd(10)}${String(point.mistakes).padEnd(10)}${lost}`
		);
	}
	out.push('', 'Costs are estimates against a baseline model, not solver output.');
	return out.join('\n');
}

export function formatPlayers(
	players: readonly PlayerAggregate[],
	heroes: readonly string[],
	top: number
): string {
	const others = players
		.filter((player) => !heroes.includes(player.name))
		.sort((a, b) => b.tally.hands - a.tally.hands);
	const rate = (player: PlayerAggregate, id: 'vpip' | 'pfr') => {
		const tally = player.tally.stats[id];
		return pct(
			tally && tally.opportunities > 0 ? tally.count / tally.opportunities : null
		);
	};
	const listed = others.slice(0, top);
	const width = Math.max(8, ...listed.map((player) => player.name.length)) + 2;
	const out = [
		`PLAYERS (${listed.length} of ${others.length}, by hands seen)`,
		`  ${'Player'.padEnd(width)}${'Hands'.padEnd(7)}${'VPIP'.padEnd(7)}${'PFR'.padEnd(7)}Last seen`,
	];
	for (const player of listed) {
		out.push(
			`  ${player.name.padEnd(width)}${String(player.tally.hands).padEnd(7)}${rate(player, 'vpip').padEnd(7)}${rate(player, 'pfr').padEnd(7)}${when(player.lastSeen)}`
		);
	}
	return out.join('\n');
}

export function formatProfile(profile: PlayerProfile): string {
	const out = [
		`${profile.name} · ${count(profile.hands)} · ${when(profile.firstSeen)} to ${when(profile.lastSeen)}`,
		...profile.money.map(
			({ currency, hands, net, heroNet }) =>
				`  Their result ${money(net, currency)}, you against them ${money(heroNet, currency)} (${count(hands)}${currency ? `, ${currency}` : ''})`
		),
		'',
		`  ${'Stat'.padEnd(22)}${'Them'.padEnd(8)}${'Baseline'.padEnd(11)}Sample`,
	];
	for (const stat of profile.session.stats) {
		const flag = stat.leak ? `  too ${stat.leak}` : '';
		const baseline = `${pct(stat.baseline)}${stat.baselineSource === 'typical' ? '*' : ''}`;
		out.push(
			`  ${stat.label.padEnd(22)}${pct(stat.value).padEnd(8)}${baseline.padEnd(11)}${stat.count}/${stat.opportunities}${flag}`
		);
	}
	out.push(
		'  Baseline: what the charts do in the spots they were in. * a typical figure.',
		''
	);
	if (profile.reads.length === 0) {
		out.push(
			'Nothing far enough from the baseline, over enough hands, to read into yet.'
		);
	} else {
		out.push('READS');
		for (const { stat, note } of profile.reads) out.push(`  ${stat.label}: ${note}`);
	}
	if (profile.showdowns.length > 0) {
		out.push('', 'SHOWN DOWN');
		for (const shown of profile.showdowns.slice(0, 15)) {
			out.push(`  ${when(shown.timestamp)}  ${shown.cards}  #${shown.handId}`);
		}
	}
	return out.join('\n');
}
