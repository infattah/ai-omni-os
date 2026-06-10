import { readFileSync, writeFileSync } from 'fs';
const content = readFileSync('src/server/server.ts', 'utf-8');

const start = content.indexOf('return `');
const end = content.indexOf('`;', start + 8);

let html = content.slice(start + 7, end);

html = html.split('\\\\').join('\x00BS\x00');
html = html.split('\\`').join('`');
html = html.split('\\${').join('${');
html = html.split('\x00BS\x00').join('\\\\');

writeFileSync('client/index.html', html);
console.log('Extracted ' + html.length + ' bytes');
