# PDF Manager

Local desktop app for viewing PDFs and composing pages into a new file.

## What it does

- Open and view a PDF
- Organize pages (reorder, rotate, delete)
- Insert pages from other PDFs
- Combine multiple PDFs into one board, then Save as

Original files are never overwritten.

## Platforms

macOS and Windows 10 version 1809 or later. Windows 7 is out of scope.

## Develop

```bash
npm install
npm run fixtures
npm test
npm run tauri dev
```

## Stack

Tauri 2, React, TypeScript, pdf.js for rendering, pdf-lib for writing.

## Windows releases

The `Windows release` GitHub Actions workflow builds a Windows x64 NSIS
installer and uploads the `*-setup.exe` file to each published GitHub release,
including prereleases. Saving a draft does not start a build.

Before releasing, update the app version in `package.json`, `package-lock.json`,
`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, and `src-tauri/tauri.conf.json`.
Push the workflow and app changes, then create and publish a GitHub release
with a tag pointing to that commit. The installer appears in the release assets
when the workflow finishes. Failed builds can be rerun from the Actions tab;
reruns replace an existing installer with the same filename.

The workflow uses GitHub's built-in token; no additional secrets are required.
The installer is unsigned. Packaging uses Tauri's
[Windows NSIS installer](https://v2.tauri.app/distribute/windows-installer/).
