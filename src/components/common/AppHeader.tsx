/**
 * The rail: the wordmark, the views, and which of the library's hands the page
 * is over -- a choice where there is one to make, their number where there is
 * not -- with the button that loads another log.
 */

import { Tabs } from '@ark-ui/solid/tabs';
import { For, Show, type Component } from 'solid-js';

import { Upload } from 'lucide-solid';

import Select, { type SelectOption } from '#c/common/Select';
import { APP_TABS, type AppTab } from '#utils/app/hashRoute';
import type { Scope } from '#utils/coach/sessions';

import '#styles/common/AppHeader';

export interface ScopeChoice {
	options: readonly SelectOption<Scope>[];
	value: Scope;
	onChange: (scope: Scope) => void;
}

interface AppHeaderProps {
	tab: AppTab;
	onTabChange: (tab: AppTab) => void;
	/** How many hands the library holds, or null while it holds none. */
	hands: number | null;
	/** The scopes to choose between, on a view that is over one and has a choice. */
	scope: ScopeChoice | null;
	/** Opens the file dialog. */
	onLoad: () => void;
}

const TAB_LABELS: Record<AppTab, string> = {
	summary: 'Summary',
	review: 'Review',
	openings: 'Openings',
	trends: 'Trends',
	players: 'Players',
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
				qpoker
				<Show when={props.hands === null}>
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
			<Show when={props.hands !== null}>
				<div class="app-header__hands">
					<Show
						when={props.scope}
						fallback={
							<p class="app-header__count">
								{props.hands} {props.hands === 1 ? 'hand' : 'hands'}
							</p>
						}
					>
						{(scope) => (
							<Select
								inline
								label="Hands"
								options={scope().options}
								value={scope().value}
								onChange={scope().onChange}
							/>
						)}
					</Show>
				</div>
			</Show>
			<button type="button" class="app-header__load" onClick={() => props.onLoad()}>
				<Upload aria-hidden="true" />
				<span class="app-header__load-label">
					{props.hands === null ? 'Load a log' : 'Load another log'}
				</span>
			</button>
		</Tabs.Root>
	</header>
);

export default AppHeader;
