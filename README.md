# Somani TV Player

This project builds a Windows x64 Electron installer named `SomaniTV-Player-Setup-1.0.0-x64.exe`.

## What this version does

- Installs as a Windows desktop app.
- On first launch, asks for the **published HTTPS URL** of your Somani TV web app.
- Opens that site's `/pair` page in an Electron window.
- Saves the app URL locally and reopens `/pair` on subsequent launches.
- Provides a GitHub Actions workflow to build the Windows installer.

## Important limitations

This is the current Somani TV Player desktop wrapper. It opens the existing web pairing page. It does **not** yet implement native encrypted device-token storage, offline media caching, auto-update, licence-key validation, or native crash recovery. The browser-based pairing/player flow remains responsible for pairing and playback. Those features are not included in this version.

The installer is unsigned. Windows SmartScreen may warn users. Do not install on production displays until the URL, pairing, playback, unpairing, reboot behaviour, and licence requirements have been tested.

## Build locally on Windows

Install Node.js 22 LTS, then in this folder run:

```powershell
npm install
npm run dist:win
```

The installer appears in `dist/`.

## Build with GitHub Actions

1. Upload this project to `dradni/somani-tv-player-releases` (or another repository you control).
2. In GitHub, open **Actions** → **Build Windows installer** → **Run workflow**.
3. Download the `SomaniTV-Player-Windows-x64` artifact from the completed run. The artifact is a ZIP containing the `.exe`.
4. Test the installer on a disposable Windows machine before publishing a GitHub Release.

## Configure the app

On first launch, enter the **published HTTPS origin** for Somani TV. Do not use a Base44 Preview URL. The app will append `/pair`.

The application URL is stored in the user's Electron application-data directory, in `player-config.json`.
