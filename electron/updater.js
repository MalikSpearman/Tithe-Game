// Game-content updater used by the launcher. The installed app ships a full copy of the game (game/ + manifest.json).
// check() compares it with the manifest published in the public Tithe-Game repo; download() fetches only the
// files whose hash changed into userData/game, verifies each one, and switches over only when all of them arrived.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { net } = require('electron');

const SOURCE = process.env.TITHE_UPDATE_SOURCE || 'https://raw.githubusercontent.com/MalikSpearman/Tithe-Game/main/';

class GameFiles {
  constructor(bundledDir, liveDir) {
    this.bundled = bundledDir; this.live = liveDir;
    this.bundledMan = readJson(path.join(bundledDir, 'manifest.json')) || { version: '0.0.0', files: {} };
    this.liveMan = readJson(path.join(liveDir, 'manifest.json'));
    if (this.liveMan && cmpVer(this.liveMan.version, this.bundledMan.version) < 0) this.liveMan = null;   // the installer itself was updated
    this.remote = null; this.paused = false; this.busy = false; this.cancelled = false;
  }
  get version() { return (this.liveMan || this.bundledMan).version; }
  get manifest() { return this.liveMan || this.bundledMan; }
  resolve(rel) {
    const man = this.liveMan;
    if (man && man.files[rel]) {
      const b = this.bundledMan.files[rel];
      if (!b || b[1] !== man.files[rel][1]) { const p = path.join(this.live, 'files', rel); if (fs.existsSync(p)) return p; }
    }
    return path.join(this.bundled, rel);
  }
  hashNow(rel) { const m = this.manifest.files[rel]; return m && m[1]; }

  async check() {
    try { this.remote = JSON.parse(await fetchText(SOURCE + 'manifest.json?t=' + Date.now(), 8000)); }
    catch (e) { return { state: 'offline', local: this.version }; }
    if (!this.remote || !this.remote.files) return { state: 'offline', local: this.version };
    if (cmpVer(this.remote.version, this.version) <= 0) return { state: 'uptodate', local: this.version, remote: this.remote.version };
    const need = this.needed(this.remote);
    return { state: 'available', local: this.version, remote: this.remote.version, count: need.length, size: need.reduce((a, [, [s]]) => a + s, 0) };
  }
  needed(remote) { return Object.entries(remote.files).filter(([rel, [, h]]) => this.hashNow(rel) !== h || !fs.existsSync(this.resolve(rel))); }

  pause() { this.paused = true; }
  resume() { this.paused = false; }

  // downloads the remote version (or, with list, repairs just those files); progress({done,total,files,count,speed})
  async download(progress, list) {
    if (this.busy) return { ok: false, error: 'busy' };
    const remote = this.remote || (await this.check(), this.remote);
    if (!remote) return { ok: false, error: 'offline' };
    const need = list || this.needed(remote);
    const total = need.reduce((a, [, [s]]) => a + s, 0); let done = 0, files = 0;
    const stage = path.join(this.live, 'staging'); fs.mkdirSync(stage, { recursive: true });
    this.busy = true; this.paused = false;
    const samples = []; const rate = () => { const now = Date.now(); samples.push([now, done]); while (samples.length > 2 && now - samples[0][0] > 4000) samples.shift(); const [t0, d0] = samples[0]; return now > t0 ? (done - d0) * 1000 / (now - t0) : 0; };
    const tell = (file) => progress({ done, total, files, count: need.length, speed: rate(), file, paused: this.paused, version: remote.version });
    tell();
    try {
      const queue = need.slice();
      const worker = async () => {
        while (queue.length) {
          while (this.paused) { tell(); await sleep(400); }
          const [rel, [size, hash]] = queue.shift();
          const out = path.join(stage, rel);
          if (!(fs.existsSync(out) && sha(fs.readFileSync(out)) === hash)) {   // a paused or interrupted update resumes where it stopped
            const buf = await fetchBuf(SOURCE + 'game/' + rel.split('/').map(encodeURIComponent).join('/') + '?v=' + hash, 90000);
            if (sha(buf) !== hash) throw new Error('Checksum mismatch: ' + rel);
            fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, buf);
          }
          done += size; files++; tell(rel);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
      const dest = path.join(this.live, 'files');
      for (const [rel] of need) { const to = path.join(dest, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.renameSync(path.join(stage, rel), to); }
      fs.writeFileSync(path.join(this.live, 'manifest.json'), JSON.stringify(remote));
      this.liveMan = remote; fs.rmSync(stage, { recursive: true, force: true });
      return { ok: true, version: remote.version, count: need.length, total };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };   // staged files are kept so the next try resumes
    } finally { this.busy = false; this.paused = false; }
  }

  // re-hashes every installed file; damaged or missing ones are re-downloaded
  async verify(progress) {
    const man = this.manifest, ents = Object.entries(man.files); const bad = []; let i = 0;
    for (const [rel, [size, hash]] of ents) {
      const p = this.resolve(rel); let ok = false;
      try { ok = sha(fs.readFileSync(p)) === hash; } catch (e) {}
      if (!ok) bad.push([rel, [size, hash]]);
      if (++i % 25 === 0) { progress({ phase: 'verify', done: i, total: ents.length }); await sleep(0); }
    }
    if (!bad.length) return { ok: true, repaired: 0 };
    if (!this.remote) await this.check();
    if (!this.remote) return { ok: false, error: 'offline', bad: bad.length };
    const fix = bad.map(([rel]) => [rel, this.remote.files[rel]]).filter(x => x[1]);
    const r = await this.download(progress, fix);
    return Object.assign(r, { repaired: fix.length });
  }

  async notes() {
    try { return JSON.parse(await fetchText(SOURCE + 'notes.json?t=' + Date.now(), 6000)); } catch (e) {}
    return readJson(path.join(this.bundled, '..', 'notes.json')) || [];
  }
}

const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 32);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
function cmpVer(a, b) { const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number); for (let i = 0; i < Math.max(A.length, B.length); i++) { const d = (A[i] || 0) - (B[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), ms))]); }
async function fetchText(url, ms) { const r = await withTimeout(net.fetch(url, { cache: 'no-store' }), ms); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }
async function fetchBuf(url, ms) { let last; for (let i = 0; i < 3; i++) { try { const r = await withTimeout(net.fetch(url, { cache: 'no-store' }), ms); if (!r.ok) throw new Error('HTTP ' + r.status); return Buffer.from(await r.arrayBuffer()); } catch (e) { last = e; await sleep(800 * (i + 1)); } } throw last; }

module.exports = { GameFiles, cmpVer };
