# LMF Viewer

A fast, native desktop viewer for LMF (LLM Markup Format) files built with Electrobun.

## Features

- **Preview .lmf files** - Render LMF files as SVG with live preview
- **Live updates** - Auto-refreshes when files are modified externally
- **Export** - Export to PNG, SVG, or HTML
- **File management** - Open multiple files, switch between them in sidebar
- **Source code view** - Toggle to view LMF source code
- **Responsive preview** - Preview scales to fit window

## Requirements

- **Python 3.x** - Required for LMF rendering
- **cairosvg** (optional) - Required for PNG export (`pip install cairosvg`)

## Installation

1. **Install dependencies**
   ```bash
   cd viewer
   bun install
   ```

2. **Ensure lmf.py is available**

   The viewer expects `lmf.py` to be in the parent directory:
   ```
   new_image_format/
   ├── lmf.py              # LMF renderer
   └── viewer/             # This project
   ```

3. **Run in development**
   ```bash
   bun start
   # or
   bun run dev
   ```

4. **Build for production**
   ```bash
   bun run build
   ```

## Usage

### Opening Files

- **Menu**: Click the "Open" button or press `Ctrl+O`
- **Drag & Drop**: Drag .lmf files onto the window
- **File Association**: Double-click .lmf files (automatically configured on first run)

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+/` | Toggle source code panel |
| `F5` | Refresh preview |
| `Delete` | Delete selected file |
| `Escape` | Close dialogs/menus |

### Exporting

1. Select a file from the sidebar
2. Click PNG, SVG, or HTML button
3. For PNG, select scale (1x, 2x, 3x)
4. File is saved next to the source file

### File Management

- **Switch files**: Click on a file in the sidebar
- **Close file**: Delete key (with confirmation)
- **Properties**: Right-click → Properties

## Project Structure

```
viewer/
├── src/
│   ├── bun/                    # Main process (Bun)
│   │   ├── index.ts            # App entry point
│   │   ├── window-state.ts     # Window state persistence
│   │   ├── file-manager.ts     # File operations
│   │   ├── renderer.ts         # LMF.py subprocess wrapper
│   │   └── watcher.ts          # File system watcher
│   │
│   ├── mainview/               # Browser view
│   │   ├── index.html          # Main HTML
│   │   ├── index.css           # Styles
│   │   └── index.ts            # UI logic
│   │
│   └── shared/                 # Shared types
│       └── types.ts            # RPC schema
│
├── assets/                     # App icons
├── electrobun.config.ts
├── package.json
└── associate-files.bat         # Windows file association
```

## Configuration

### Window State

Window size, position, and sidebar width are automatically saved to:
- **Windows**: `%APPDATA%/lmf-viewer/window-state.json`

### Recent Files

Recently opened files are stored in:
- **Windows**: `%APPDATA%/lmf-viewer/recent-files.json`

## Troubleshooting

### Python not found

If you see "Python not found" errors:

1. Install Python 3.x from https://python.org
2. Ensure Python is in your PATH
3. Verify with `python --version`

### Rendering fails

1. Check that `lmf.py` exists in the parent directory
2. Verify the LMF file is valid (starts with `#LMF1`)
3. Check for cairosvg if exporting PNG: `pip install cairosvg`

### File association not working

1. Rebuild and reinstall the app (the app auto-registers associations on first run)
2. Restart Windows Explorer or log out/back in
3. Check Default Apps settings in Windows Settings

### File opens in sidebar but doesn't render

This can happen if:
1. **Python not available** - Check Python status in the status bar
2. **File path issue** - Ensure the .lmf file path doesn't contain special characters
3. **Race condition** - Try opening the file again via the Open button
4. **lmf.py not found** - Ensure lmf.py is in the parent directory

The app logs detailed information to the console. Run via `bun start` to see debug output.

## Building for Production

```bash
# Build for current platform
bun run build

# Build for specific targets
bunx electrobun build --targets win-x64
```

## License

MIT
