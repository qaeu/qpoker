/**
 * Where a hand history comes in: dropped on the felt, or picked from a file
 * dialog. Reads the file as text and hands it up; while an analysis runs it
 * shows the run's progress and a way out of it.
 */

import { createSignal, Show, type Component } from 'solid-js';

import { Upload } from 'lucide-solid';

import '#styles/upload/LogDrop';

export interface Progress {
	done: number;
	total: number;
}

interface LogDropProps {
	onLoad: (fileName: string, text: string) => void;
	onCancel: () => void;
	/** Set while an analysis is running. */
	progress: Progress | null;
	error: string | null;
	/** A smaller zone, for when a report is already on the page. */
	compact?: boolean;
}

const LogDrop: Component<LogDropProps> = (props) => {
	const [dragging, setDragging] = createSignal(false);
	let input: HTMLInputElement | undefined;

	const read = async (file: File | undefined) => {
		if (!file) return;
		props.onLoad(file.name, await file.text());
	};

	return (
		<section
			class="log-drop"
			classList={{ 'is-dragging': dragging(), 'log-drop--compact': props.compact }}
			onDragOver={(event) => {
				event.preventDefault();
				setDragging(true);
			}}
			onDragLeave={() => setDragging(false)}
			onDrop={(event) => {
				event.preventDefault();
				setDragging(false);
				void read(event.dataTransfer?.files[0]);
			}}
		>
			<Show
				when={props.progress}
				fallback={
					<>
						<Show when={!props.compact}>
							<Upload class="log-drop__icon" />
							<h2 class="log-drop__title">Drop a hand history</h2>
							<p class="log-drop__text">
								A PokerStars hand-history file for No-Limit Hold'em cash games, as saved
								by the client or requested by email. It is read and graded in this
								browser: nothing is uploaded.
							</p>
						</Show>
						<button type="button" class="highlight" onClick={() => input?.click()}>
							{props.compact ? 'Load another log' : 'Choose a file'}
						</button>
						<input
							ref={input}
							class="log-drop__input"
							type="file"
							accept=".txt,text/plain"
							aria-label="Hand history file"
							onChange={(event) => {
								void read(event.currentTarget.files?.[0]);
								event.currentTarget.value = '';
							}}
						/>
					</>
				}
			>
				{(progress) => (
					<div class="log-drop__progress" role="status">
						<span class="log-drop__progress-label">
							Grading hand {progress().done} of {progress().total}
						</span>
						<progress
							class="log-drop__bar"
							value={progress().done}
							max={Math.max(1, progress().total)}
						/>
						<button type="button" onClick={() => props.onCancel()}>
							Cancel
						</button>
					</div>
				)}
			</Show>
			<Show when={props.error}>
				<p class="log-drop__error" role="alert">
					{props.error}
				</p>
			</Show>
		</section>
	);
};

export default LogDrop;
