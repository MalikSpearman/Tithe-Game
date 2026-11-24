// Fills game/ from the website's fast build and makes it run offline in the desktop app.
//   node tools/prepare.js [fast build folder, default ../tithe-fast]
// The fast build (python3 tithe-site/make_fast.py) is exactly what play.tithecardgame.com serves:
// index.html plus img/ with every art/voice pack split into small cached files, so the launcher
// can update one file at a time. This script then:
//  - removes the website's cache-busting fetch wrapper (pointless inside the app)
//  - bundles the Google Fonts (Cinzel, Source Sans 3) into game/vendor/fonts
//  - bundles three.js r128 (3D card effects) instead of loading it from a CDN
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'game');
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : null;

if (SRC && SRC !== OUT) {
  if (!fs.existsSync(path.join(SRC, 'index.html'))) throw new Error('No index.html in ' + SRC);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  for (const n of ['index.html', 'favicon.ico', 'manifest.webmanifest', 'img', 'v1']) {
    const p = path.join(SRC, n);
    if (fs.existsSync(p)) fs.cpSync(p, path.join(OUT, n), { recursive: true });
  }
}
const INDEX = path.join(OUT, 'index.html');
let h = fs.readFileSync(INDEX, 'utf8');
h = h.replace(/<script>\/\* Netlify build \d+:[\s\S]*?<\/script>/, '');

fs.mkdirSync(path.join(OUT, 'vendor', 'fonts'), { recursive: true });
const FONTS = [['@fontsource/cinzel', 'cinzel', 'Cinzel', [600, 700]], ['@fontsource/source-sans-3', 'source-sans-3', 'Source Sans 3', [400, 600, 700]]];
let css = '';
for (const [pkg, slug, family, weights] of FONTS) {
  const dir = path.join(path.dirname(require.resolve(pkg + '/package.json', { paths: [ROOT, process.cwd()] })), 'files');
  for (const w of weights) for (const sub of ['latin', 'latin-ext']) {
    const fn = `${slug}-${sub}-${w}-normal.woff2`; if (!fs.existsSync(path.join(dir, fn))) continue;
    fs.copyFileSync(path.join(dir, fn), path.join(OUT, 'vendor', 'fonts', fn));
    const range = sub === 'latin'
      ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
      : 'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
    css += `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${w};src:url(fonts/${fn}) format('woff2');unicode-range:${range}}\n`;
  }
}
fs.writeFileSync(path.join(OUT, 'vendor', 'fonts.css'), css);
const nf = (h.match(/https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s>]*/g) || []).length;
h = h.replace(/https:\/\/fonts\.googleapis\.com\/css2\?[^"'\s>]*/g, 'vendor/fonts.css');

fs.copyFileSync(require.resolve('three/build/three.min.js', { paths: [ROOT, process.cwd()] }), path.join(OUT, 'vendor', 'three.min.js'));
const THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
const nt = h.split(THREE_CDN).length - 1; h = h.split(THREE_CDN).join('vendor/three.min.js');

fs.writeFileSync(INDEX, h);
const stamp = (h.match(/TITHE_STAMP=(\d+)/) || [])[1] || '?';
console.log(`game/ ready (build ${stamp}): fonts ${nf} link(s) bundled, three.js ${nt} reference(s) bundled`);
