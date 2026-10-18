import { VERSION } from './version.js';

document.getElementById('version').textContent = 'v' + VERSION;
const app = document.getElementById('app');
app.replaceChildren();
const p = document.createElement('p');
p.textContent = 'Genopbygning i gang – spillet flyttes over fra den gamle version trin for trin.';
app.append(p);
document.body.dataset.klar = 'ja';
