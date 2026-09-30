import { render } from 'preact';
import { App } from './App';

const root = document.getElementById('app');
if (root) {
  root.textContent = '';
  render(<App />, root);
}
