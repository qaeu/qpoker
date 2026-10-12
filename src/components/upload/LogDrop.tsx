/**
 * Where hand histories come in: dropped anywhere on the window, or picked
 * from a file dialog, one file or several at a time. `createFilePicker` owns the one file input and the
 * reading, so the header's button and the drop zone open the same dialog;
 * `LogDrop` is the zone an empty page is given over to, and `LogStatus` the
 * strip a run reports in once there is a report on the page.
 */

import { createSignal, onCleanup, onMount, Show, type Component } from 'solid-js';

import { Upload } from 'lucide-solid';

import '#styles/upload/LogDrop';

export interface Progress {
	done: number;
	total: number;
	/** Which of the logs being loaded these hands are of, from one, and how many there are. */
	log?: number;
	logs?: number;
}

/** A file as it was read. */
export interface LoadedFile {
	name: string;
	text: string;
}

export interface FilePicker {
	/** Opens the file dialog. */
	open: () => void;
	/** True while files are being dragged over the window. */
	dragging: () => boolean;
	/** The hidden input behind `open`: render it once, anywhere. */
	Input: Component;
}

interface LogStatusProps {
	onCancel: () => void;
	/** Set while an analysis is running. */
	progress: Progress | null;
	error: string | null;
}

interface LogDropProps extends LogStatusProps {
	picker: FilePicker;
}

const carriesFiles = (event: DragEvent): boolean =>
	event.dataTransfer?.types.includes('Files') ?? false;

const progressLabel = ({ done, total, log, logs }: Progress): string =>
	logs && logs > 1 ?
		`Log ${log} of ${logs} · grading hand ${done} of ${total}`
	:	`Grading hand ${done} of ${total}`;

/**
 * Reads the picked or dropped files as text and hands them to `onLoad` together,
 * in the order they came. Call it from a component: it listens on the window
 * for as long as its owner lives.
 */
export function createFilePicker(onLoad: (files: LoadedFile[]) => void): FilePicker {
	const [dragging, setDragging] = createSignal(false);
	let input: HTMLInputElement | undefined;

	const read = async (list: ArrayLike<File> | null | undefined) => {
		// Copied before anything is awaited: the input's list is emptied under it.
		const files = Array.from(list ?? []);
		if (files.length === 0) return;
		onLoad(
			await Promise.all(
				files.map(async (file) => ({ name: file.name, text: await file.text() }))
			)
		);
	};

	const onDragOver = (event: DragEvent) => {
		if (!carriesFiles(event)) return;
		// Without this the browser opens the file instead of handing it over.
		event.preventDefault();
		setDragging(true);
	};
	// Leaving for another element inside the window is not leaving.
	const onDragLeave = (event: DragEvent) => {
		if (!event.relatedTarget) setDragging(false);
	};
	const onDrop = (event: DragEvent) => {
		if (!carriesFiles(event)) return;
		event.preventDefault();
		setDragging(false);
		void read(event.dataTransfer?.files);
	};

	onMount(() => {
		window.addEventListener('dragover', onDragOver);
		window.addEventListener('dragleave', onDragLeave);
		window.addEventListener('drop', onDrop);
		onCleanup(() => {
			window.removeEventListener('dragover', onDragOver);
			window.removeEventListener('dragleave', onDragLeave);
			window.removeEventListener('drop', onDrop);
		});
	});

	const Input: Component = () => (
		<input
			ref={input}
			class="log-drop__input"
			type="file"
			accept=".txt,text/plain"
			multiple
			aria-label="Hand history files"
			onChange={(event) => {
				void read(event.currentTarget.files);
				event.currentTarget.value = '';
			}}
		/>
	);

	return { open: () => input?.click(), dragging, Input };
}

/** A run's progress and the way out of it, or what went wrong with the last one. */
export const LogStatus: Component<LogStatusProps> = (props) => (
	<>
		<Show when={props.progress}>
			{(progress) => (
				<div class="log-drop__progress" role="status">
					<span class="log-drop__progress-label">{progressLabel(progress())}</span>
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
	</>
);

const LogDrop: Component<LogDropProps> = (props) => (
	<section class="log-drop" classList={{ 'is-dragging': props.picker.dragging() }}>
		<Show when={!props.progress}>
			<Upload class="log-drop__icon" />
			<h2 class="log-drop__title">Drop a hand history</h2>
			<p class="log-drop__text">
				PokerStars hand-history files for No-Limit Hold'em cash games, as saved by the
				client or requested by email: one, or as many as you like at once. They are read
				and graded in this browser: nothing is uploaded.
			</p>
			<button type="button" class="highlight" onClick={() => props.picker.open()}>
				Choose files
			</button>
		</Show>
		<LogStatus progress={props.progress} error={props.error} onCancel={props.onCancel} />
	</section>
);

export default LogDrop;
