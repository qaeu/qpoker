/* @refresh reload */
import { render } from 'solid-js/web';
import App from './App';
import { browserIsolation, registerIsolation } from './utils/app/isolation';

const root = document.getElementById('root');

if (import.meta.env.DEV && !(root instanceof HTMLElement)) {
	throw new Error(
		'Root element not found. Did you forget to add it to your index.html? Or maybe the id attribute got misspelled?'
	);
}

render(() => <App />, root!);

// The solver's threads need the page to be cross-origin isolated; a host that
// cannot send the headers gets them from a service worker.
void registerIsolation(browserIsolation());
