import { Tabs } from '@ark-ui/solid/tabs';
import { For, type Component } from 'solid-js';

import { APP_TABS, type AppTab } from '#utils/app/hashRoute';

import '#styles/common/AppHeader';

interface AppHeaderProps {
	tab: AppTab;
	onTabChange: (tab: AppTab) => void;
}

const TAB_LABELS: Record<AppTab, string> = {
	summary: 'Summary',
	mistakes: 'Mistakes',
	plays: 'Good plays',
	hands: 'Hands',
	openings: 'Openings',
	ranges: 'Ranges',
};

const AppHeader: Component<AppHeaderProps> = (props) => (
	<header class="app-header">
		<Tabs.Root
			value={props.tab}
			onValueChange={(details) => props.onTabChange(details.value as AppTab)}
			class="app-header__inner"
		>
			<div class="app-header__title-row">
				<h1 class="app-header__title">
					pokeranalysis <span class="app-header__title-sub">· hand-history coach</span>
				</h1>
			</div>
			<Tabs.List class="app-header__tab-list">
				<For each={APP_TABS}>
					{(tab) => (
						<Tabs.Trigger value={tab} class="app-header__tab">
							{TAB_LABELS[tab]}
						</Tabs.Trigger>
					)}
				</For>
			</Tabs.List>
		</Tabs.Root>
	</header>
);

export default AppHeader;
