# Tithe

A dark-fantasy card game where every card you play costs your deck.

This repo holds the desktop app: the playable game files (`game/`), a small Electron shell with its own launcher (`electron/`), and the files the launcher reads to update itself (`manifest.json`, `notes.json`). The game's source lives in the private `tithe` repo; the browser version is at [play.tithecardgame.com](https://play.tithecardgame.com).

## Play it

Download the latest installer from **Releases**:

- **Mac:** `Tithe-<version>-universal.dmg` (Apple Silicon and Intel). The app isn't signed yet, so the first time you open it, right-click the app and choose **Open**, then **Open** again.
- **Windows:** `Tithe Setup <version>.exe`. If SmartScreen warns you, click **More info → Run anyway**.

Saves live on your computer and carry over between updates.

## The launcher

Opening Tithe starts the launcher: key art, patch notes, your version, and a big **PLAY** button. When a new version is published, the button turns into **UPDATE** and downloads only the files that changed (it can pause and resume). Launcher settings (gear icon) cover auto-update, repairing game files, opening the game-files folder, and what the launcher does while you play.

## Publishing a game update

1. Build the web game as usual in `tithe-site` (`node tools/build.js`, `node tools/check.js`), then `python3 tithe-site/make_fast.py`.
2. In this repo: `npm install` (first time only), then
   ```bash
   node tools/prepare.js ../tithe-fast   # copies the fast build into game/ and bundles fonts + three.js
   ```
3. Bump `version` in `package.json` and add patch notes to the top of `notes.json`.
4. `node tools/manifest.js`, then commit and push to `main`.

Every launcher picks the update up the next time it opens (or within the hour if it's already open). Add `[release]` to the commit message when you also want fresh installers.

## Make new installers

Commit with `[release]` in the message (or push a `v0.1.1` tag, or use **Actions → Build & release → Run workflow**). GitHub Actions builds the Mac and Windows installers (about 10 minutes) and attaches them to a new release here.

## Run from source

```bash
npm install
npm start
```

`F11` or `Alt+Enter` toggles fullscreen and `F12` opens the developer tools.

## Layout

| Path | What it is |
| --- | --- |
| `game/index.html` | The whole game (built from `tithe-site/src`, never edited here) |
| `game/img/` | Art, voice and music, split into small cached files |
| `game/vendor/` | Bundled fonts and three.js, so the game runs offline |
| `electron/main.js` | Launcher and game windows, window mode, the `app://` file server |
| `electron/launcher.html` | The launcher screen |
| `electron/updater.js` | Checks for, downloads, verifies and repairs game files |
| `electron/preload.js` | Desktop flags for the game page (local saves, platform) |
| `manifest.json` | Every game file with its size and hash; the launcher compares against it |
| `notes.json` | Patch notes shown in the launcher |
| `tools/prepare.js`, `tools/manifest.js` | Fill `game/` from the web build; write the manifest |
| `.github/workflows/release.yml` | The installer build |
