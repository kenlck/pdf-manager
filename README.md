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
