// Builds the standalone prototype page: inlines src/knotEngine.js into src/app.template.html
// and writes docs/index.html (served by GitHub Pages from the /docs folder).
//   node prototype/build.mjs
import fs from 'fs';
const here = (p) => new URL(p, import.meta.url);
const engine = fs.readFileSync(here('./src/knotEngine.js'), 'utf8').replace(/^export /gm, '');
const tpl = fs.readFileSync(here('./src/app.template.html'), 'utf8');
fs.mkdirSync(here('../docs/'), { recursive: true });
fs.writeFileSync(here('../docs/index.html'), tpl.replace('/*ENGINE*/', () => engine));
console.log('wrote docs/index.html');
