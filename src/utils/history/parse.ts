/**
 * PokerStars hand-history text -> `Hand[]`, oldest first. The parser never
 * throws on a line it does not know: it records a warning on the hand and moves
 * on, so one odd line costs a note in the report rather than the whole file.
 * See docs/history-format.md for the format and its quirks.
 */

import { parseCards } from '../cards/cards';
import { decodeHistory } from './decode';
import type { Action, Hand, Street } from './hand';

/** The divider an emailed history puts between hands. */
const SEPARATOR = /^\*+ # \d+ \*+$/;

/** PokerStars, or a site on its network that brands the same format (`Betfair Hand #`). */
const BRAND = String.raw`[A-Za-z][\w.]*(?: [A-Za-z][\w.]*)*? (?:Zoom |Home Game )?(?:Hand|Game) #`;

const HAND_START = new RegExp(String.raw`^${BRAND}\d+:`);

const HEADER = new RegExp(
	String.raw`^${BRAND}(\d+):\s+(.*?)\s+\(([^)]*)\)\s+-\s+(\d{4})\/(\d\d)\/(\d\d) (\d{1,2}):(\d\d):(\d\d)`
);
const TABLE = /^Table '(.*)' (\d+)-max(?: \(Play Money\))? Seat #(\d+) is the button/;
const SEAT = /^Seat (\d+): (.*) \(\D?([\d.,]+) in chips\)(.*)$/;
const DEALT = /^Dealt to (.*) \[([^\]]+)\]/;
const STREET_MARK = /^\*\*\* (FLOP|TURN|RIVER) \*\*\* (.*)$/;
const UNCALLED = /^Uncalled bet \(\D?([\d.,]+)\) returned to (.*)$/;
const COLLECTED = /^(.*) collected \D?([\d.,]+) from (?:the )?(?:main |side )?pot/;
const CASHED_OUT = /^(.*) cashed out the hand for \D?([\d.,]+)/;
const TOTAL_POT = /^Total pot \D?([\d.,]+).*\| Rake \D?([\d.,]+)/;
const SUMMARY_SEAT = /^Seat \d+: (.*)$/;

/** Table chatter and bookkeeping that says nothing about the hand. */
const NOISE = [
	/ (?:joins|leaves) the table/,
	/ has timed out/,
	/ will be allowed to play after the button$/,
	/ is (?:dis)?connected$/,
	/ has returned$/,
	/ (?:is sitting out|sits out)$/,
	/ said, "/,
	/ was removed from the table/,
	/^Board \[/,
	/^\*\*\* (?:HOLE CARDS|SHOW DOWN|SUMMARY) \*\*\*$/,
];

/** `$1,234.50` already stripped of its symbol -> integer cents. */
function money(text: string): number {
	return Math.round(parseFloat(text.replace(/,/g, '')) * 100);
}

function emptyHand(): Hand {
	return {
		id: '',
		timestamp: '',
		game: '',
		stakes: { smallBlind: 0, bigBlind: 0, currency: '' },
		table: '',
		maxSeats: 0,
		buttonSeat: 0,
		seats: [],
		hero: null,
		heroCards: [],
		actions: [],
		board: [],
		shown: {},
		uncalled: [],
		won: {},
		cashedOut: {},
		totalPot: 0,
		rake: 0,
		warnings: [],
		gradeable: true,
	};
}

function parseHeader(line: string, hand: Hand): void {
	const match = HEADER.exec(line);
	if (!match) {
		hand.warnings.push(`Unrecognised header: ${line}`);
		hand.gradeable = false;
		return;
	}
	const [, id, game, stakes, year, month, day, hour, minute, second] = match;
	hand.id = id;
	hand.game = game;
	hand.timestamp = `${year}-${month}-${day}T${hour.padStart(2, '0')}:${minute}:${second}`;
	const blinds = /^\D?([\d.,]+)\/\D?([\d.,]+)(?: (\w+))?$/.exec(stakes);
	if (blinds) {
		hand.stakes = {
			smallBlind: money(blinds[1]),
			bigBlind: money(blinds[2]),
			currency: blinds[3] ?? '',
		};
	}
	if (!blinds || !/Hold'em No Limit/.test(game) || /Tournament/.test(game)) {
		hand.warnings.push(`Not a No-Limit Hold'em cash hand: ${game} (${stakes})`);
		hand.gradeable = false;
	}
}

/**
 * Splits `name: rest` on a seated player's name. Names may themselves hold
 * colons and spaces, so this matches against the seat list, longest first.
 */
function splitActor(line: string, names: readonly string[]): [string, string] | null {
	for (const name of names) {
		if (line.startsWith(name + ': ')) return [name, line.slice(name.length + 2)];
	}
	return null;
}

function parsePlayerLine(
	hand: Hand,
	player: string,
	rest: string,
	street: Street,
	committed: Map<string, number>
): boolean {
	const allIn = / and is all-in$/.test(rest);
	const text = rest.replace(/ and is all-in$/, '');
	const add = (kind: Action['kind'], amount: number, to?: number) => {
		hand.actions.push({ player, street, kind, amount, to, allIn });
		if (kind !== 'post-dead') {
			committed.set(player, (committed.get(player) ?? 0) + amount);
		}
	};
	let match: RegExpExecArray | null;

	if (text === 'folds') add('fold', 0);
	else if (text === 'checks') add('check', 0);
	else if ((match = /^calls \D?([\d.,]+)$/.exec(text))) add('call', money(match[1]));
	else if ((match = /^bets \D?([\d.,]+)$/.exec(text))) add('bet', money(match[1]));
	else if ((match = /^raises \D?[\d.,]+ to \D?([\d.,]+)$/.exec(text))) {
		const to = money(match[1]);
		add('raise', to - (committed.get(player) ?? 0), to);
	} else if ((match = /^posts small blind \D?([\d.,]+)$/.exec(text))) {
		// A second small blind in a hand is a returning player's dead post.
		const live = !hand.actions.some((action) => action.kind === 'post-sb');
		add(live ? 'post-sb' : 'post-dead', money(match[1]));
	} else if ((match = /^posts big blind \D?([\d.,]+)$/.exec(text))) {
		add('post-bb', money(match[1]));
	} else if ((match = /^posts small & big blinds \D?([\d.,]+)$/.exec(text))) {
		const total = money(match[1]);
		const live = Math.min(total, hand.stakes.bigBlind);
		add('post-bb', live);
		if (total > live) add('post-dead', total - live);
	} else if (/^posts (?:the )?(?:ante|straddle)/.test(text)) {
		hand.warnings.push(`Unsupported post: ${player}: ${rest}`);
		hand.gradeable = false;
	} else if ((match = /^shows \[([^\]]+)\]/.exec(text))) {
		hand.shown[player] = parseCards(match[1]);
	} else if (/^(?:mucks hand|doesn't show hand|is sitting out|sits out)/.test(text)) {
		// Nothing to record.
	} else return false;
	return true;
}

function parseSummarySeat(hand: Hand, rest: string, names: readonly string[]): void {
	const name = names.find((candidate) => rest.startsWith(candidate + ' '));
	if (!name) return;
	const cards = /(?:showed|mucked) \[([^\]]+)\]/.exec(rest);
	if (cards) hand.shown[name] ??= parseCards(cards[1]);
	// A split or side pot pays one player on several clauses of the line.
	for (const paid of rest.matchAll(/(?:won|collected) \(\D?([\d.,]+)\)/g)) {
		hand.won[name] = (hand.won[name] ?? 0) + money(paid[1]);
	}
}

function parseHand(lines: readonly string[]): Hand {
	const hand = emptyHand();
	parseHeader(lines[0], hand);

	let names: string[] = [];
	let street: Street = 'preflop';
	let inSummary = false;
	let dealt = false;
	let committed = new Map<string, number>();

	for (const line of lines.slice(1)) {
		let match: RegExpExecArray | null;

		if (line === '*** SUMMARY ***') {
			inSummary = true;
			continue;
		}
		if (line === '*** HOLE CARDS ***') {
			dealt = true;
			continue;
		}

		if (inSummary) {
			if ((match = TOTAL_POT.exec(line))) {
				hand.totalPot = money(match[1]);
				hand.rake = money(match[2]);
			} else if ((match = /^Board \[([^\]]+)\]/.exec(line))) {
				hand.board = parseCards(match[1]);
			} else if ((match = SUMMARY_SEAT.exec(line))) {
				parseSummarySeat(hand, match[1], names);
			} else if (/^(?:FIRST|SECOND) Board|^Hand was run twice/.test(line)) {
				hand.warnings.push('Run-it-twice hand');
				hand.gradeable = false;
			} else {
				hand.warnings.push(`Unrecognised summary line: ${line}`);
			}
			continue;
		}

		if ((match = TABLE.exec(line))) {
			hand.table = match[1];
			hand.maxSeats = Number(match[2]);
			hand.buttonSeat = Number(match[3]);
		} else if (!dealt && (match = SEAT.exec(line))) {
			hand.seats.push({
				seat: Number(match[1]),
				name: match[2],
				stack: money(match[3]),
				sittingOut: /sitting out/.test(match[4]),
			});
			names = hand.seats.map((seat) => seat.name).sort((a, b) => b.length - a.length);
		} else if ((match = DEALT.exec(line))) {
			hand.hero = match[1];
			hand.heroCards = parseCards(match[2]);
		} else if ((match = STREET_MARK.exec(line))) {
			street = match[1].toLowerCase() as Street;
			committed = new Map();
			const cards = [...match[2].matchAll(/\[([^\]]+)\]/g)].flatMap((m) =>
				parseCards(m[1])
			);
			if (cards.length > hand.board.length) hand.board = cards;
		} else if (/^\*\*\* (?:FIRST|SECOND) (?:FLOP|TURN|RIVER) \*\*\*/.test(line)) {
			if (hand.gradeable) hand.warnings.push('Run-it-twice hand');
			hand.gradeable = false;
		} else if ((match = UNCALLED.exec(line))) {
			hand.uncalled.push({ player: match[2], amount: money(match[1]) });
		} else if ((match = CASHED_OUT.exec(line))) {
			hand.cashedOut[match[1]] = money(match[2]);
		} else if (COLLECTED.test(line) || NOISE.some((pattern) => pattern.test(line))) {
			// Winnings are read from the summary, which also covers a cashed-out pot.
		} else {
			const actor = splitActor(line, names);
			if (!actor || !parsePlayerLine(hand, actor[0], actor[1], street, committed)) {
				hand.warnings.push(`Unrecognised line: ${line}`);
			}
		}
	}

	if (!hand.hero || hand.heroCards.length !== 2) hand.gradeable = false;
	return hand;
}

/** Sorts oldest first. Hand ids rise with time and break a same-second tie. */
function chronological(a: Hand, b: Hand): number {
	if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
	if (a.id.length !== b.id.length) return a.id.length - b.id.length;
	return (
		a.id < b.id ? -1
		: a.id > b.id ? 1
		: 0
	);
}

/** Parses a whole history file: quoted-printable or plain, any hand order. */
export function parseHistory(raw: string): Hand[] {
	const lines = decodeHistory(raw)
		.split('\n')
		.map((line) => line.trimEnd());

	const hands: Hand[] = [];
	let block: string[] | null = null;
	const flush = () => {
		if (block) hands.push(parseHand(block));
	};
	for (const line of lines) {
		if (HAND_START.test(line)) {
			flush();
			block = [line];
		} else if (block && line !== '' && !SEPARATOR.test(line)) {
			block.push(line);
		}
	}
	flush();

	return hands.sort(chronological);
}
