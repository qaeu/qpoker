/**
 * The library itself: the logs that have been loaded into it, how much room
 * it takes, and the two things to do with all of it -- save a copy, or empty it.
 */

import { For, Show, type Component } from 'solid-js';

import type { ImportRecord } from '#utils/store/types';
import { shortTime } from '#utils/ui/format';

import '#styles/library/LibraryPanel';

interface LibraryPanelProps {
	imports: readonly ImportRecord[];
	hands: number;
	/** Bytes the browser reports the site as using, when it will say. */
	usage: number | null;
	onExport: () => void;
	onClear: () => void;
}

/** Imports listed, the latest first. */
const LISTED = 20;

const megabytes = (bytes: number): string => `${(bytes / 1_048_576).toFixed(1)} MB`;

const LibraryPanel: Component<LibraryPanelProps> = (props) => (
	<section class="library-panel" aria-label="Hand library">
		<h2 class="library-panel__title">The library</h2>
		<table class="library-panel__table">
			<thead>
				<tr>
					<th scope="col">Loaded</th>
					<th scope="col">File</th>
					<th scope="col">Hands</th>
					<th scope="col">New</th>
				</tr>
			</thead>
			<tbody>
				<For each={props.imports.slice(-LISTED).reverse()}>
					{(record) => (
						<tr>
							<th scope="row">{shortTime(record.importedAt.slice(0, 19))}</th>
							<td>{record.fileName || '—'}</td>
							<td>{record.hands}</td>
							<td>{record.added + record.replaced}</td>
						</tr>
					)}
				</For>
			</tbody>
		</table>
		<p class="library-panel__note">
			{props.hands} {props.hands === 1 ? 'hand' : 'hands'} from {props.imports.length}{' '}
			{props.imports.length === 1 ? 'log' : 'logs'}
			<Show when={props.usage !== null}>
				{' '}
				· {megabytes(props.usage ?? 0)} in this browser
			</Show>
			. Kept in this browser only. A hand loaded twice is counted once.
		</p>
		<div class="library-panel__actions">
			<button type="button" onClick={() => props.onExport()}>
				Save a copy
			</button>
			<button type="button" onClick={() => props.onClear()}>
				Empty the library
			</button>
		</div>
		<p class="library-panel__note">
			A copy holds every hand as it was dealt, other players' screen names included, and
			can be loaded back in like any log.
		</p>
	</section>
);

export default LibraryPanel;
