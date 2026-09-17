# PDFix

Modern PDF editor for **Web**, **Android**, and **iOS**.

Built with Quasar, Vue 3, Pinia, PDF.js, pdf-lib, and Capacitor.

## Features

- Open, view, and edit PDFs in the browser or on mobile
- Tools: **Text**, **Draw / Eraser**, **Shapes** (rectangle, circle, line, arrow), **Image**, **Signature**
- Editable PDF text overlays (Word-like paragraphs without breaking layout)
- Page management: reorder (drag & drop), rotate 90°, delete
- Undo / redo
- Export / save edited PDF
- Share PDF (system share sheet on native, Web Share API on supported browsers)
- Responsive UI with fit-to-width PDF viewer

## Stack

| Layer | Tech |
| --- | --- |
| UI | Quasar + Vue 3 |
| State | Pinia |
| PDF render | PDF.js |
| PDF write | pdf-lib (+ fontkit) |
| Native | Capacitor (Filesystem, Share, StatusBar, App) |

## Requirements

- Node.js `>= 22.12` (see `package.json` engines)
- For native builds: Android Studio and/or Xcode

## Setup

```bash
npm install
```

## Development (Web)

```bash
npm run dev
```

App opens at the Quasar Vite dev server URL (usually `http://localhost:9000`).

## Build (Web)

```bash
npm run build
```

Output: `dist/spa`

## Mobile (Capacitor)

Platforms live in `android/` and `ios/`. Web assets are synced from `dist/spa`.

```bash
# Build web + sync native projects
npm run build:mobile

# Open in Android Studio / Xcode
npm run cap:android
npm run cap:ios

# Sync only (after a previous build)
npm run cap:sync
```

App id: `com.pdfduzenleyici.app` · App name: **PDFix**

### File operations

Platform details are abstracted in `src/services/fileService.js`:

| API | Web | Native |
| --- | --- | --- |
| `openFile()` | File input | File input (WebView) |
| `saveFile()` | Browser download | Filesystem → Documents |
| `shareFile()` | Web Share / download fallback | Capacitor Share |

Editor UI should call these helpers (or composables) instead of branching on `Capacitor.isNativePlatform()`.

## Useful scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Quasar dev server |
| `npm run build` | Production SPA build |
| `npm run build:mobile` | Build + `cap sync` |
| `npm run lint` | Prettier + ESLint (fix) |
| `npm run lint:check` | Lint without writing |

## Project structure (high level)

```text
src/
  components/editor/   # Viewer, overlay tools, toolbars
  composables/         # Open / export / history helpers
  services/
    fileService.js     # Open / save / share (web + Capacitor)
    pdfExportService.js
  stores/editor.js     # Central editor state + undo/redo
  utils/               # PDF.js helpers, coordinates, objects
android/               # Capacitor Android project
ios/                   # Capacitor iOS project
```

## License

Private / unpublished unless otherwise specified.
# deneme
