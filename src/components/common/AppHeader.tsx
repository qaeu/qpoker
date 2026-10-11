/**
 * The rail: the wordmark, the views, and the log on the table -- whose it is,
 * the stakes, how many hands, the file -- with the button that loads another.
 */

import { Tabs } from '@ark-ui/solid/tabs';
import { For, Show, type Component } from 'solid-js';

import { Upload } from 'lucide-solid';

import { APP_TABS, type AppTab } from '#utils/app/hashRoute';

import '#styles/common/AppHeader';

export interface Session {
	hero: string;
	stakes: string;
	hands: number;
	fileName: string;
}

interface AppHeaderProps {
	tab: AppTab;
	onTabChange: (tab: AppTab) => void;
	/** The log the report on the page was made from, once there is one. */
	session: Session | null;
	/** Opens the file dialog. */
	onLoad: () => void;
}

const TAB_LABELS: Record<AppTab, string> = {
	summary: 'Summary',
	review: 'Review',
	openings: 'Openings',
	ranges: 'Ranges',
};

/** The one view that is about the baseline rather than the log. */
const REFERENCE_TAB: AppTab = 'ranges';

const AppHeader: Component<AppHeaderProps> = (props) => (
	<header class="app-header">
		<Tabs.Root
			value={props.tab}
			onValueChange={(details) => props.onTabChange(details.value as AppTab)}
			class="app-header__inner"
		>
			<h1 class="app-header__title">
				pokeranalysis
				<Show when={!props.session}>
					<span class="app-header__title-sub">· hand-history coach</span>
				</Show>
			</h1>
			<Tabs.List class="app-header__tab-list">
				<For each={APP_TABS}>
					{(tab) => (
						<>
							<Show when={tab === REFERENCE_TAB}>
								<span class="app-header__rule" aria-hidden="true" />
							</Show>
							<Tabs.Trigger value={tab} class="app-header__tab">
								{TAB_LABELS[tab]}
							</Tabs.Trigger>
						</>
					)}
				</For>
			</Tabs.List>
			<Show when={props.session}>
				{(session) => (
					<p class="app-header__session">
						<span class="app-header__session-log">
							{session().hero} · {session().stakes} · {session().hands}{' '}
							{session().hands === 1 ? 'hand' : 'hands'}
						</span>
						<Show when={session().fileName}>
							<span class="app-header__session-file">{session().fileName}</span>
						</Show>
					</p>
				)}
			</Show>
			<button type="button" class="app-header__load" onClick={() => props.onLoad()}>
				<Upload aria-hidden="true" />
				<span class="app-header__load-label">
					{props.session ? 'Load another log' : 'Load a log'}
				</span>
			</button>
		</Tabs.Root>
	</header>
);

export default AppHeader;
