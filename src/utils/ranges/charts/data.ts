/**
 * The preflop baseline, as data. Every entry is a raise range and a call range
 * in the notation of `notation.ts`; folding is whatever is left.
 *
 * These are hand-written approximations of published rake-adjusted 6-max
 * solver output for 2.5bb opens -- not solver exports. See
 * docs/preflop-model.md for what that means for the grades built on them, and
 * for how to swap real solver ranges in: this file is the only place to change.
 */

export interface ChartEntry {
	raise: string;
	call: string;
}

export type ChartId = keyof typeof DEEP;

/** 70bb and deeper. */
export const DEEP = {
	// First in.
	rfiUtg: {
		raise:
			'55+,A2s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,65s,AJo+,KQo,ATo:0.5,KJo:0.5,44:0.5,K8s:0.5',
		call: '',
	},
	rfiHj: {
		raise:
			'33+,A2s+,K7s+,Q9s+,J9s+,T8s+,97s+,87s,76s,65s,54s,ATo+,KJo+,QJo,KTo:0.5,22:0.5,K6s:0.5,Q8s:0.5',
		call: '',
	},
	rfiCo: {
		raise:
			'22+,A2s+,K4s+,Q7s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A9o+,KTo+,QTo+,JTo,A8o:0.5,K9o:0.5,K3s:0.5,Q6s:0.5,64s:0.5',
		call: '',
	},
	rfiBtn: {
		raise:
			'22+,A2s+,K2s+,Q3s+,J5s+,T6s+,96s+,85s+,75s+,64s+,53s+,43s,A3o+,K8o+,Q9o+,J9o+,T8o+,98o,A2o:0.5,K7o:0.5,Q8o:0.5,J8o:0.5,87o:0.5,Q2s:0.5,J4s:0.5,T5s:0.5,95s:0.5,74s:0.5',
		call: '',
	},
	rfiSb: {
		raise:
			'22+,A2s+,K2s+,Q4s+,J6s+,T6s+,96s+,85s+,75s+,64s+,54s,A4o+,K8o+,Q9o+,J9o+,T9o,A3o:0.5,A2o:0.5,K7o:0.5,Q8o:0.5,T8o:0.5,98o:0.5,Q3s:0.5,J5s:0.5,53s:0.5',
		call: '',
	},

	// Facing one open, in position.
	ipVsEp: {
		raise: 'QQ+,AKs,AKo,A5s,A4s:0.5,KQs:0.5,AQs:0.5,JJ:0.5,KJs:0.3',
		call: 'JJ,TT,99,88:0.5,AQs,AJs,KQs,QJs:0.5,JTs:0.5,T9s:0.3',
	},
	btnVsEp: {
		raise: 'QQ+,AKs,AKo,JJ:0.5,AQs:0.5,A5s,A4s,KJs:0.5,KTs:0.5,76s:0.3,65s:0.3',
		call: 'JJ-55,44:0.5,AQs,AJs,ATs,KQs,KJs,KTs,QJs,QTs:0.5,JTs,T9s,98s,87s:0.5,AQo:0.5',
	},
	coVsHj: {
		raise: 'JJ+,AKs,AKo,AQs,A5s,A4s,KQs:0.5,KJs:0.5,TT:0.5,AQo:0.5,ATs:0.5,76s:0.3',
		call: 'TT-88,77:0.5,AJs,ATs,KQs,KJs,QJs,JTs,T9s:0.5',
	},
	btnVsCo: {
		raise:
			'TT+,AQs+,AKo,AQo:0.5,A5s-A2s,KQs:0.5,KJs:0.5,KTs:0.5,QJs:0.3,ATs:0.5,AJs:0.5,87s:0.3,76s:0.3,65s:0.3,AJo:0.3,KQo:0.3',
		call: '99-44,33:0.5,22:0.5,AJs,ATs,A9s:0.5,KQs,KJs,KTs,QJs,QTs,JTs,J9s:0.5,T9s,98s,87s,76s,AQo,AJo:0.5,KQo:0.5',
	},

	// Facing one open from the small blind: raise or fold.
	sbVsEp: {
		raise: 'TT+,AQs+,AKo,AJs:0.5,KQs:0.5,A5s,A4s:0.5,99:0.5,KJs:0.3',
		call: '',
	},
	sbVsCo: {
		raise: '99+,AJs+,AQo+,KQs,KJs,ATs:0.5,A5s,A4s,QJs:0.5,JTs:0.5,88:0.5,KTs:0.5,T9s:0.3',
		call: '',
	},
	sbVsBtn: {
		raise:
			'77+,A9s+,AJo+,KTs+,QTs+,JTs,KQo,A5s-A2s,T9s,98s:0.5,66:0.5,55:0.5,A8s:0.5,ATo:0.5,K9s:0.5,KJo:0.5,87s:0.3',
		call: '',
	},

	// Facing one open from the big blind.
	bbVsUtg: {
		raise: 'QQ+,AKs,AKo:0.7,A5s,A4s:0.5,KQs:0.3,JJ:0.3,65s:0.3,76s:0.3',
		call: 'JJ-22,A2s+,K8s+,Q9s+,J9s+,T8s+,97s+,86s+,75s+,65s,54s,AJo+,KQo,ATo:0.5,KJo:0.5,K7s:0.5,64s:0.5',
	},
	bbVsHj: {
		raise: 'QQ+,AKs,AKo,JJ:0.5,AQs:0.5,A5s,A4s,KQs:0.3,76s:0.3,65s:0.3,KJs:0.3',
		call: 'JJ-22,A2s+,K6s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,64s+,54s,ATo+,KJo+,QJo,KTo:0.5,K5s:0.5,Q7s:0.5',
	},
	bbVsCo: {
		raise:
			'JJ+,AKs,AKo,AQs,TT:0.5,AQo:0.5,AJs:0.5,A5s,A4s,A3s:0.5,KQs:0.5,KJs:0.5,87s:0.3,76s:0.3,65s:0.3,KTs:0.3',
		call: 'TT-22,A2s+,K3s+,Q6s+,J7s+,T7s+,96s+,85s+,75s+,64s+,53s+,43s,A9o+,KTo+,QTo+,JTo,K9o:0.5,Q9o:0.5,J9o:0.5,T9o:0.5,A8o:0.5,K2s:0.5,Q5s:0.5',
	},
	bbVsBtn: {
		raise:
			'TT+,AQs+,AKo,AQo,AJs,KQs,99:0.5,ATs:0.5,KJs:0.5,A5s-A2s,KTs:0.3,QJs:0.3,JTs:0.3,T9s:0.3,98s:0.3,87s:0.3,76s:0.3,65s:0.3,54s:0.3,AJo:0.5,KQo:0.5,K9s:0.3,Q9s:0.3',
		call: '99-22,A2s+,K2s+,Q2s+,J4s+,T6s+,95s+,85s+,74s+,63s+,53s+,43s,A2o+,K7o+,Q8o+,J8o+,T8o+,97o+,87o,76o:0.5,K6o:0.5,K5o:0.5,Q7o:0.5,J3s:0.5,T5s:0.5,86o:0.5,65o:0.3',
	},
	bbVsSb: {
		raise:
			'TT+,AQs+,AKo,AQo,AJs,KQs,99:0.5,ATs:0.5,KJs:0.5,A5s-A2s,K5s:0.3,Q8s:0.3,J8s:0.3,T8s:0.3,97s:0.3,86s:0.3,75s:0.3,64s:0.3,AJo:0.5,KQo:0.5,KJo:0.3,A8o:0.3',
		call: '99-22,A2s+,K2s+,Q2s+,J3s+,T5s+,95s+,84s+,74s+,63s+,53s+,43s,A2o+,K5o+,Q7o+,J7o+,T7o+,97o+,86o+,76o,65o:0.5,K4o:0.5,Q6o:0.5',
	},

	// The opener, facing a 3-bet. `Ip`/`Oop` is where the 3-bettor sits.
	epVs3betIp: {
		raise: 'KK+,QQ:0.5,AKs:0.5,AKo:0.5,A5s:0.5,A4s:0.3',
		call: 'QQ,JJ,TT,99:0.5,AKs,AKo,AQs,AJs:0.5,KQs,KJs:0.3,QJs:0.3,JTs:0.3,T9s:0.3',
	},
	epVs3betOop: {
		raise: 'KK+,QQ:0.5,AKs:0.5,AKo:0.5,A5s:0.5',
		call: 'QQ-88,77:0.5,AKs,AKo,AQs,AJs,ATs:0.5,KQs,KJs:0.5,QJs:0.5,JTs:0.5,T9s:0.5,98s:0.3,AQo:0.5',
	},
	coVs3betIp: {
		raise: 'QQ+,AKs,AKo:0.7,JJ:0.3,A5s:0.5,A4s:0.5,KQs:0.2,ATs:0.3',
		call: 'JJ-77,66:0.5,A5s,AQs,AJs,ATs:0.5,KQs,KJs,KTs:0.5,QJs,QTs:0.5,JTs,T9s,98s:0.5,AKo,AQo:0.5',
	},
	coVs3betOop: {
		raise: 'QQ+,AKs,AKo:0.7,JJ:0.3,A5s:0.5,A4s:0.5,AQo:0.2',
		call: 'JJ-66,55:0.5,A5s,AQs,AJs,ATs,A9s:0.3,KQs,KJs,KTs:0.5,QJs,QTs:0.5,JTs,T9s,98s,87s:0.5,AKo,AQo:0.6,KQo:0.3',
	},
	btnVs3bet: {
		raise:
			'QQ+,AKs,AKo,JJ:0.5,TT:0.3,A5s:0.5,A4s:0.5,A3s:0.5,AQo:0.3,KQo:0.2,ATo:0.2,K5s:0.2',
		call: 'JJ,TT,99-55,44:0.5,A5s,A4s,A7s+,A6s:0.3,KQs,KJs,KTs,K9s:0.5,QJs,QTs,Q9s:0.5,JTs,J9s:0.5,T9s,T8s:0.5,98s,87s,76s,65s:0.5,AQo,AJo:0.5,KQo:0.5',
	},
	sbVs3bet: {
		raise: 'QQ+,AKs,AKo,JJ:0.5,A5s:0.5,A4s:0.5,A3s:0.3,AQo:0.3,KJo:0.2',
		call: 'JJ-66,55:0.5,A5s,A4s,A8s+,KTs+,K9s:0.5,QTs+,JTs,J9s:0.5,T9s,98s,87s:0.5,AQo,AJo:0.5,KQo:0.5',
	},

	// The 3-bettor, facing a 4-bet. A raise here is all-in.
	vs4betTight: { raise: 'KK+,AKs:0.5', call: 'QQ:0.7,AKs,AKo:0.3,JJ:0.3' },
	vs4betWide: {
		raise: 'KK+,QQ:0.5,AKs,AKo:0.7,A5s:0.3',
		call: 'QQ,JJ,TT:0.5,AKo,AQs:0.7,KQs:0.3,AJs:0.3',
	},

	// An open and a 3-bet before the hand has acted.
	cold4bet: { raise: 'KK+,QQ:0.7,AKs,AKo:0.5,A5s:0.2', call: 'QQ,JJ:0.3' },

	// Limped pots.
	overLimp: {
		raise: '',
		call: '66-22,A9s-A2s,K9s:0.5,QTs,JTs,T9s,98s,87s,76s,65s,54s',
	},
	sbVsLimp: {
		raise: '22+,A2s+,K4s+,Q7s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,A9o+,KTo+,QTo+,JTo',
		call: '22+,A2s+,K2s+,Q5s+,J7s+,T7s+,96s+,85s+,75s+,64s+,54s,A2o+,K9o+,Q9o+,J9o+,T9o',
	},
	bbVsLimp: {
		raise: '99+,ATs+,KTs+,QJs,AJo+,KQo,A5s:0.5,A4s:0.5,JTs:0.5',
		call: '',
	},
	limpedVsRaise: {
		raise: '',
		call: '99-22,ATs+,KTs+,QTs+,JTs,T9s,98s,87s,76s,65s,A5s-A2s,AQo:0.5',
	},
} satisfies Record<string, ChartEntry>;

/**
 * 30bb to 70bb. Only the spots where the shorter stack changes the answer: a
 * 4-bet is now a shove, so it is made for value and called less often.
 */
export const MID: Partial<Record<ChartId, ChartEntry>> = {
	epVs3betIp: {
		raise: 'QQ+,AKs,AKo,JJ:0.5',
		call: 'JJ,TT,99:0.5,AQs,AJs:0.5,KQs:0.7,QJs:0.3,JTs:0.3',
	},
	epVs3betOop: {
		raise: 'QQ+,AKs,AKo,JJ:0.5',
		call: 'JJ,TT,99,88:0.5,AQs,AJs:0.7,KQs,KJs:0.3,QJs:0.5,JTs:0.5',
	},
	coVs3betIp: {
		raise: 'TT+,AQs+,AKo,AQo:0.3,99:0.3,A5s:0.5,AJs:0.3',
		call: '99,88-66,55:0.5,AJs,ATs,KQs,KJs,KTs:0.5,QJs,QTs:0.5,JTs,T9s:0.7,98s:0.5,AQo',
	},
	coVs3betOop: {
		raise: 'TT+,AQs+,AKo,AQo:0.3,99:0.3,A5s:0.5,AJs:0.3',
		call: '99,88-66,55:0.5,AJs,ATs,KQs,KJs,KTs:0.5,QJs,QTs:0.5,JTs,T9s:0.7,98s:0.5,AQo',
	},
	btnVs3bet: {
		raise: 'TT+,AQs+,AKo,AQo:0.5,99:0.5,A5s:0.5,AJs:0.3',
		call: '99,88-55,44:0.5,AJs,ATs,A9s:0.5,KQs,KJs,KTs,QJs,QTs,JTs,T9s,98s:0.5,AQo,AJo:0.3,KQo:0.3',
	},
	sbVs3bet: {
		raise: 'TT+,AQs+,AKo,AQo:0.5,99:0.5,A5s:0.5,AJs:0.3',
		call: '99,88-66,AJs,ATs,KQs,KJs,KTs:0.5,QJs,JTs,T9s:0.5,AQo',
	},
	vs4betTight: { raise: 'QQ+,AKs,AKo:0.7,JJ:0.3', call: '' },
	vs4betWide: { raise: 'JJ+,AKs,AKo,AQs:0.5,TT:0.5', call: '' },
	cold4bet: { raise: 'QQ+,AKs,AKo,JJ:0.5', call: '' },
};

/**
 * What a player who shoves is taken to hold, by how the pot stood. Used to
 * price a call for stacks, where a chart frequency would be the wrong tool.
 */
export const JAM_RANGES = {
	/** First in, or over limpers, for 25bb or less. */
	open: '22+,A2s+,K9s+,QTs+,JTs,T9s,ATo+,KJo+,A9o:0.5,KTo:0.5',
	/** Over one open, 30bb or less. */
	overOpenShort: '66+,A9s+,AJo+,KQs,KJs:0.5,A5s:0.5,55:0.5,KQo:0.5',
	/** Over one open, deeper than that. */
	overOpen: '99+,AQs+,AKo,AJs:0.5,AQo:0.5,88:0.5,A5s:0.5',
	/** A 4-bet shove or bigger, up to about 60bb. */
	overThreeBet: 'TT+,AQs+,AKo,99:0.5,AQo:0.3,A5s:0.3',
	/** A 4-bet shove at 60bb and beyond, and any 5-bet. */
	overThreeBetDeep: 'QQ+,AKs,AKo,JJ:0.5,A5s:0.3',
} satisfies Record<string, string>;

/** What an open-limper is taken to hold: no chart limps first in. */
export const LIMP_RANGE =
	'TT-22,A9s-A2s,KJs-K5s,Q8s+,J8s+,T7s+,97s+,86s+,75s+,65s,54s,AJo-A7o,KTo+,QTo+,JTo,T9o:0.5,JJ+:0.2,AQo+:0.2,ATs+:0.3';
