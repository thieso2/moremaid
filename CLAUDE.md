# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moremaid is a Markdown viewer with Mermaid diagram support, implemented in two independent ways:

1. **Command-line tool** (`mm.js`) - Converts markdown to standalone HTML and opens in browser
2. **Python server** (`python/` directory) - Web server with file browser and live rendering

## Development Commands

### CLI Tool Setup and Usage
```bash
# Install dependencies
npm install

# Make executable
chmod +x mm.js

# Run locally
./mm.js <markdown-file>

# Install globally
npm install -g .
mm <markdown-file>
```

### Python Server Setup and Usage
```bash
# Navigate to python directory
cd python

# Run server (no dependencies needed, uses Python stdlib only)
python server.py

# Opens at http://localhost:8000
```

## Architecture

### CLI Tool (`mm.js`)
- Single Node.js script that generates self-contained HTML
- Embeds all assets (Prism.js for syntax highlighting, Mermaid.js for diagrams)
- Creates temporary HTML file in OS temp directory
- Opens file in default browser using platform-specific commands (`open` on macOS, `start` on Windows, `xdg-open` on Linux)
- Cleans up temp file after 5 seconds

### Python Server (`python/`)
- `server.py`: HTTP server with three endpoints:
  - `/` serves `index.html`
  - `/api/files` returns JSON tree of markdown files
  - `/api/file?path=...` returns markdown file content
- `index.html`: Single-page application that:
  - Renders file tree in sidebar from `/api/files`
  - Fetches and renders markdown on file selection
  - Uses URL hash for bookmarkable file references
  - Handles Mermaid diagram rendering with fullscreen buttons

### Shared Features
Both implementations support:
- Mermaid diagram rendering with clickable fullscreen buttons
- Syntax highlighting via Prism.js for multiple languages
- Opening Mermaid diagrams in new windows

### Key Implementation Details

**Mermaid Fullscreen**: Diagrams are wrapped in containers with absolute-positioned buttons. Click handlers use `window.open()` with generated HTML containing the diagram definition.

**Template Literal Escaping**: In `mm.js`, avoid nested template literals. Use string concatenation for JavaScript code that will be embedded in the generated HTML.

**Error Handling**: Mermaid rendering errors are caught and displayed inline where the diagram would appear.

## Sample Files

The `samples/` directory contains test markdown files with various features including Mermaid diagrams, syntax highlighting examples, and complex markdown structures for testing.
- check if all used dependencies are compatible with MIT license
- do not publish unless i ask!
- do not commit unless i ask!
- latest screenshot can always be found via : ls -t /Users/thies/Desktop/CleanShot* | head -1

