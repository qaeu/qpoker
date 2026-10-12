import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@solidjs/testing-library';

import LogDrop, { createFilePicker, LogStatus, type FilePicker } from '#c/upload/LogDrop';

const file = (text: string, name = 'hands.txt') =>
	new File([text], name, { type: 'text/plain' });

const dragged = (...files: File[]) => ({ dataTransfer: { types: ['Files'], files } });

/** A picker with its input on the page, and something to show its state. */
function mountPicker(onLoad = vi.fn()) {
	let picker!: FilePicker;
	const view = render(() => {
		picker = createFilePicker(onLoad);
		return (
			<>
				<picker.Input />
				<LogDrop picker={picker} onCancel={() => {}} progress={null} error={null} />
			</>
		);
	});
	return { onLoad, picker: () => picker, ...view };
}

describe('createFilePicker', () => {
	it('opens the dialog of its one input', () => {
		mountPicker();
		const click = vi.spyOn(HTMLInputElement.prototype, 'click');
		fireEvent.click(screen.getByRole('button', { name: 'Choose files' }));
		expect(click).toHaveBeenCalledOnce();
		click.mockRestore();
	});

	it('reads a picked file as text, and lets several be picked', async () => {
		const { onLoad } = mountPicker();
		fireEvent.change(screen.getByLabelText('Hand history files'), {
			target: { files: [file('one hand', 'a.txt')] },
		});
		await waitFor(() =>
			expect(onLoad).toHaveBeenCalledWith([{ name: 'a.txt', text: 'one hand' }])
		);
		expect(screen.getByLabelText<HTMLInputElement>('Hand history files').multiple).toBe(
			true
		);
	});

	it('hands over every file picked together, in the order they came', async () => {
		const { onLoad } = mountPicker();
		fireEvent.change(screen.getByLabelText('Hand history files'), {
			target: { files: [file('second', 'b.txt'), file('first', 'a.txt')] },
		});
		await waitFor(() =>
			expect(onLoad).toHaveBeenCalledWith([
				{ name: 'b.txt', text: 'second' },
				{ name: 'a.txt', text: 'first' },
			])
		);
		expect(onLoad).toHaveBeenCalledOnce();
	});

	describe('a file dragged over the window', () => {
		it('is read wherever it is dropped', async () => {
			const { onLoad } = mountPicker();
			fireEvent.drop(window, dragged(file('dropped', 'b.txt')));
			await waitFor(() =>
				expect(onLoad).toHaveBeenCalledWith([{ name: 'b.txt', text: 'dropped' }])
			);
		});

		it('is read with the others dropped beside it', async () => {
			const { onLoad } = mountPicker();
			fireEvent.drop(window, dragged(file('one', 'a.txt'), file('two', 'b.txt')));
			await waitFor(() =>
				expect(onLoad).toHaveBeenCalledWith([
					{ name: 'a.txt', text: 'one' },
					{ name: 'b.txt', text: 'two' },
				])
			);
		});

		it('lights the zone until it is dropped or taken away', () => {
			const { container, picker } = mountPicker();
			const zone = container.querySelector('.log-drop')!;
			fireEvent.dragOver(window, dragged());
			expect(picker().dragging()).toBe(true);
			expect(zone.classList.contains('is-dragging')).toBe(true);

			fireEvent.dragLeave(window, { relatedTarget: null });
			expect(zone.classList.contains('is-dragging')).toBe(false);

			fireEvent.dragOver(window, dragged());
			fireEvent.drop(window, dragged());
			expect(picker().dragging()).toBe(false);
		});

		it('leaves alone a drag that carries no file', () => {
			const { onLoad, picker } = mountPicker();
			fireEvent.dragOver(window, { dataTransfer: { types: ['text/plain'], files: [] } });
			fireEvent.drop(window, { dataTransfer: { types: ['text/plain'], files: [] } });
			expect(picker().dragging()).toBe(false);
			expect(onLoad).not.toHaveBeenCalled();
		});

		it('stops listening when its owner goes', () => {
			const { onLoad, picker, unmount } = mountPicker();
			unmount();
			fireEvent.dragOver(window, dragged());
			expect(picker().dragging()).toBe(false);
			expect(onLoad).not.toHaveBeenCalled();
		});
	});
});

describe('LogDrop', () => {
	it('gives way to the run while one is in progress', () => {
		render(() => {
			const picker = createFilePicker(() => {});
			return (
				<LogDrop
					picker={picker}
					onCancel={() => {}}
					progress={{ done: 3, total: 10 }}
					error={null}
				/>
			);
		});
		expect(screen.queryByRole('button', { name: 'Choose files' })).toBeNull();
		expect(screen.getByRole('status').textContent).toContain('Grading hand 3 of 10');
	});
});

describe('LogStatus', () => {
	it('shows how far a run has got, and cancels it', () => {
		const onCancel = vi.fn();
		render(() => (
			<LogStatus progress={{ done: 3, total: 10 }} error={null} onCancel={onCancel} />
		));
		expect(screen.getByRole('status').textContent).toContain('Grading hand 3 of 10');
		expect(screen.getByRole<HTMLProgressElement>('progressbar').value).toBe(3);
		fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
		expect(onCancel).toHaveBeenCalledOnce();
	});

	it('says which log the hands are of when there are several', () => {
		render(() => (
			<LogStatus
				progress={{ done: 3, total: 10, log: 2, logs: 4 }}
				error={null}
				onCancel={() => {}}
			/>
		));
		expect(screen.getByRole('status').textContent).toContain(
			'Log 2 of 4 · grading hand 3 of 10'
		);
	});

	it('says what went wrong', () => {
		render(() => (
			<LogStatus progress={null} error="No hands found." onCancel={() => {}} />
		));
		expect(screen.getByRole('alert').textContent).toBe('No hands found.');
		expect(screen.queryByRole('status')).toBeNull();
	});

	it('is nothing at rest', () => {
		const { container } = render(() => (
			<LogStatus progress={null} error={null} onCancel={() => {}} />
		));
		expect(container.textContent).toBe('');
	});
});
