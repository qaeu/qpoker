/**
 * A coarse strength ladder over the 169 starting hands, read off the charts
 * themselves: a hand's tier is the earliest seat that opens it, with three
 * rungs of premiums above and the big blind's defence below. The coach uses it
 * to size a preflop mistake -- how far a hand sits from where a range ends --
 * since a chart alone says only in or out. See docs/coach-model.md.
 */

import { CLASS_COUNT } from '../cards/combos';
import { chart } from './charts';
import { parseRange } from './notation';
import { continueRange, type Range } from './range';

/** 0 is aces and kings; `TRASH_TIER` is a hand no chart continues with. */
export const TRASH_TIER = 9;

const PREMIUMS = ['AA,KK', 'QQ,AKs,AKo', 'JJ,TT,AQs,AQo,AJs,KQs'];

/**
 * What a hand of each tier is roughly worth, in big blinds, when it enters a
 * single-raised pot. The scale the cost of folding it is read from.
 */
export const TIER_VALUE_BB = [8, 3.5, 1.6, 0.9, 0.6, 0.4, 0.25, 0.15, 0.08, 0];

let tiers: Int8Array | null = null;

function buildTiers(): Int8Array {
	const ladder: Range[] = [
		...PREMIUMS.map(parseRange),
		chart('rfiUtg').raise,
		chart('rfiHj').raise,
		chart('rfiCo').raise,
		chart('rfiBtn').raise,
		chart('rfiSb').raise,
		continueRange(chart('bbVsBtn')),
	];
	const out = new Int8Array(CLASS_COUNT).fill(TRASH_TIER);
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		const rung = ladder.findIndex((range) => range[cls] >= 0.5);
		if (rung >= 0) out[cls] = rung;
	}
	return out;
}

export function handTier(cls: number): number {
	tiers ??= buildTiers();
	return tiers[cls];
}

/** Aces down to tens, and the big suited and offsuit aces: the rungs above any chart. */
export const isPremium = (cls: number): boolean => handTier(cls) < PREMIUMS.length;

/**
 * The tier at which a range runs out: nine-tenths of its combos are this
 * strong or stronger. The stragglers past it are a range's bluffs.
 */
export function marginTier(range: Range): number {
	const byTier = new Array<number>(TRASH_TIER + 1).fill(0);
	let total = 0;
	for (let cls = 0; cls < CLASS_COUNT; cls++) {
		if (range[cls] < 0.5) continue;
		byTier[handTier(cls)] += range[cls];
		total += range[cls];
	}
	if (total === 0) return 0;
	let seen = 0;
	for (let tier = 0; tier <= TRASH_TIER; tier++) {
		seen += byTier[tier];
		if (seen >= total * 0.9) return tier;
	}
	return TRASH_TIER;
}
