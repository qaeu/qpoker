/**
 * Everyone the hero has been dealt in with: a list by hands seen, and beside
 * it the one being read -- what they won and lost, their frequencies against
 * the charts for their own spots, what a frequency clearly off its baseline
 * invites, and the hands they showed. A read to take to the table, not a grade: nothing here changes how
 * the hero's own decisions are judged.
 */

import { createMemo, createSignal, For, Show, type Component } from 'solid-js';

import { playerHref, reviewHref } from '#utils/app/hashRoute';
import { profileOf } from '#utils/store/profile';
import type { PlayerAggregate } from '#utils/store/types';
import { moneyChange, percent, readingOf, shortTime, signClass } from '#utils/ui/format';

import '#styles/players/PlayersView';

interface PlayersViewProps {
	players: readonly PlayerAggregate[];
	/** The names the hands are graded for: the user's own, left off the list. */
	heroes: readonly string[];
	/** The player being read, from the route. */
	name: string | null;
}

/** Players listed before the search has to be used. */
const LISTED = 100;

const PlayersView: Component<PlayersViewProps> = (props) => {
	const [search, setSearch] = createSignal('');
	const others = createMemo(() =>
		props.players
			.filter((player) => !props.heroes.includes(player.name))
			.sort((a, b) => b.tally.hands - a.tally.hands)
	);
	const found = createMemo(() => {
		const wanted = search().trim().toLowerCase();
		return wanted ?
				others().filter((player) => player.name.toLowerCase().includes(wanted))
			:	others();
	});
	const current = createMemo(() => {
		const player =
			props.players.find((candidate) => candidate.name === props.name) ?? found()[0];
		return player ? profileOf(player) : null;
	});
	const stat = (player: PlayerAggregate, id: 'vpip' | 'pfr') => {
		const tally = player.tally.stats[id];
		return percent(
			tally && tally.opportunities > 0 ? tally.count / tally.opportunities : null
		);
	};

	return (
		<section class="players-view">
			<div class="players-view__panel">
				<h2 class="players-view__title">Players</h2>
				<input
					class="players-view__search"
					type="search"
					aria-label="Find a player"
					placeholder="Find a player"
					value={search()}
					onInput={(event) => setSearch(event.currentTarget.value)}
				/>
				<Show
					when={found().length > 0}
					fallback={<p class="players-view__note">No player by that name.</p>}
				>
					<table class="players-view__table">
						<thead>
							<tr>
								<th scope="col">Player</th>
								<th scope="col">Hands</th>
								<th scope="col">VPIP</th>
								<th scope="col">PFR</th>
							</tr>
						</thead>
						<tbody>
							<For each={found().slice(0, LISTED)}>
								{(player) => (
									<tr classList={{ 'is-current': player.name === current()?.name }}>
										<th scope="row">
											<a
												href={playerHref(player.name)}
												aria-current={
													player.name === current()?.name ? 'true' : undefined
												}
											>
												{player.name}
											</a>
										</th>
										<td>{player.tally.hands}</td>
										<td>{stat(player, 'vpip')}</td>
										<td>{stat(player, 'pfr')}</td>
									</tr>
								)}
							</For>
						</tbody>
					</table>
					<Show when={found().length > LISTED}>
						<p class="players-view__note">
							The {LISTED} seen most of {found().length} are listed: search for the rest.
						</p>
					</Show>
				</Show>
			</div>

			<Show when={current()} keyed>
				{(profile) => (
					<div class="players-view__panel">
						<h2 class="players-view__title">{profile.name}</h2>
						<p class="players-view__meta">
							{profile.hands} {profile.hands === 1 ? 'hand' : 'hands'} ·{' '}
							{shortTime(profile.firstSeen)} to {shortTime(profile.lastSeen)}
						</p>

						<Show when={profile.money.length > 0}>
							<table class="players-view__table players-view__money">
								<thead>
									<tr>
										<th scope="col">Money</th>
										<th scope="col">Their result</th>
										<th scope="col">You against them</th>
										<th scope="col">Hands</th>
									</tr>
								</thead>
								<tbody>
									<For each={profile.money}>
										{(row) => (
											<tr>
												<th scope="row">{row.currency || 'Chips'}</th>
												<td class={signClass(row.net)}>
													{moneyChange(row.net, row.currency)}
												</td>
												<td class={signClass(row.heroNet)}>
													{moneyChange(row.heroNet, row.currency)}
												</td>
												<td>{row.hands}</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
							<p class="players-view__note">
								Their result is over the hands you were dealt in with them. You against
								them is what passed between the two of you: exact where a pot had one
								winner or one loser, and a fair split of it otherwise.
							</p>
						</Show>

						<Show
							when={profile.reads.length > 0}
							fallback={
								<p class="players-view__note">
									Nothing in their play is far enough from the baseline, over enough
									hands, to read anything into yet.
								</p>
							}
						>
							<ul class="players-view__reads" aria-label="Reads">
								<For each={profile.reads}>
									{({ stat: read, note }) => (
										<li class="players-view__read">
											<span class="players-view__read-stat">
												{read.label} {percent(read.value)} against{' '}
												{percent(read.baseline)}
											</span>
											{note}
										</li>
									)}
								</For>
							</ul>
						</Show>

						<table class="players-view__table">
							<thead>
								<tr>
									<th scope="col">Stat</th>
									<th scope="col">Them</th>
									<th scope="col">Baseline</th>
									<th scope="col">Reading</th>
									<th scope="col">Sample</th>
								</tr>
							</thead>
							<tbody>
								<For each={profile.session.stats}>
									{(row) => (
										<tr classList={{ 'is-leak': row.leak !== null }}>
											<th scope="row">{row.label}</th>
											<td>{percent(row.value)}</td>
											<td>
												{percent(row.baseline)}
												{row.baselineSource === 'typical' ? '*' : ''}
											</td>
											<td>{readingOf(row.leak, row.opportunities)}</td>
											<td>
												{row.count}/{row.opportunities}
											</td>
										</tr>
									)}
								</For>
							</tbody>
						</table>
						<p class="players-view__note">
							The baseline is what the charts do in the very spots they were in; * marks a
							typical figure for a balanced player instead. A read is given only where the
							sample can bear it, and is a tendency, not a certainty.
						</p>

						<Show when={profile.showdowns.length > 0}>
							<h2 class="players-view__title">Shown down</h2>
							<table class="players-view__table">
								<tbody>
									<For each={profile.showdowns.slice(0, 30)}>
										{(shown) => (
											<tr>
												<th scope="row">
													<a href={reviewHref({ show: 'all', hand: shown.handId })}>
														{shortTime(shown.timestamp)}
													</a>
												</th>
												<td>{shown.cards}</td>
											</tr>
										)}
									</For>
								</tbody>
							</table>
						</Show>
					</div>
				)}
			</Show>
		</section>
	);
};

export default PlayersView;
