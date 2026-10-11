/**
 * Where a hand history comes in: dropped anywhere on the window, or picked
 * from a file dialog. `createFilePicker` owns the one file input and the
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
}

export interface FilePicker {
	/** Opens the file dialog. */
	open: () => void;
	/** True while a file is being dragged over the window. */
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

/**
 * Reads a picked or dropped file as text and hands it to `onLoad`. Call it
 * from a component: it listens on the window for as long as its owner lives.
 */
export function createFilePicker(
	onLoad: (fileName: string, text: string) => void
): FilePicker {
	const [dragging, setDragging] = createSignal(false);
	let input: HTMLInputElement | undefined;

	const read = async (file: File | undefined) => {
		if (!file) return;
		onLoad(file.name, await file.text());
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
		void read(event.dataTransfer?.files[0]);
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
			aria-label="Hand history file"
			onChange={(event) => {
				void read(event.currentTarget.files?.[0]);
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
	</>
);

const LogDrop: Component<LogDropProps> = (props) => (
	<section class="log-drop" classList={{ 'is-dragging': props.picker.dragging() }}>
		<Show when={!props.progress}>
			<Upload class="log-drop__icon" />
			<h2 class="log-drop__title">Drop a hand history</h2>
			<p class="log-drop__text">
				A PokerStars hand-history file for No-Limit Hold'em cash games, as saved by the
				client or requested by email. It is read and graded in this browser: nothing is
				uploaded.
			</p>
			<button type="button" class="highlight" onClick={() => props.picker.open()}>
				Choose a file
			</button>
		</Show>
		<LogStatus progress={props.progress} error={props.error} onCancel={props.onCancel} />
	</section>
);

export default LogDrop;
