// Writes game/manifest.json: every game file with its size and sha256, plus the version.
// The launcher compares this list with the published one and downloads only what changed.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..', 'game');
const version = process.argv[2] || require('../package.json').version;
const files = {};
(function walk(dir) {
  for (const n of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, n), st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else {
      const rel = path.relative(root, p).split(path.sep).join('/');
      if (rel === 'manifest.json') continue;
      files[rel] = [st.size, crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 32)];
    }
  }
})(root);
const out = { version, built: new Date().toISOString(), files };
fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(out));
// the launcher reads the published copy at the repo root
fs.writeFileSync(path.join(root, '..', 'manifest.json'), JSON.stringify(out));
console.log(`manifest ${version}: ${Object.keys(files).length} files, ${(Object.values(files).reduce((a, [s]) => a + s, 0) / 1048576).toFixed(1)} MB`);
