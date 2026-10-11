import { describe, expect, it } from 'vitest';
import { render, screen } from '@solidjs/testing-library';

import Confidence from '#c/common/Confidence';

describe('Confidence', () => {
	it.each([
		['low', 'Low confidence', 1],
		['medium', 'Medium confidence', 2],
		['high', 'High confidence', 3],
	] as const)('says %s in words and lights its pips', (level, label, lit) => {
		const { container } = render(() => <Confidence level={level} />);
		expect(screen.getByText(label)).toBeTruthy();
		expect(container.querySelectorAll('.confidence__pip')).toHaveLength(3);
		expect(container.querySelectorAll('.confidence__pip.is-lit')).toHaveLength(lit);
	});
});
