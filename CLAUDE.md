# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moremaid is a Node.js CLI tool for viewing Markdown files with Mermaid diagram support. It supports three modes:
1. **Single file mode** - Serves a single markdown file with live server (default) or temp HTML (--oneshot)
2. **Folder mode** - HTTP server with file browser, search, and live rendering
3. **Archive mode** - Pack/unpack encrypted `.moremaid` files (ZIP archives)

## Development Commands

```bash
# Install dependencies
npm install

# Make executable (if needed)
chmod +x mm.js

# Run locally (single file)
./mm.js README.md

# Run locally (folder mode)
./mm.js .

# Run with theme
./mm.js file.md --theme dracula

# Pack into archive
./mm.js --pack docs/

# Install globally
npm install -g .

# Run tests (Playwright)
npm test                    # Run all tests
npm run test:ui             # Run with UI
npm run test:debug          # Debug mode
npm run test:headed         # Show browser

# Release (via GitHub Actions only)
# Push a tag: git tag v1.x.x && git push origin v1.x.x
```

## Architecture

Moremaid is a modular Node.js application with the following structure:

### Entry Point (`mm.js`)
- Parses CLI arguments and flags
- Routes to appropriate mode (single file, folder, archive, pack)
- Handles version checks via update-notifier

### Core Modules (`lib/`)

**`lib/server.js`** - HTTP server for folder and single-file mode
- Creates HTTP server with multiple endpoints:
  - `/` or `/index` - File browser index (if multiple files)
  - `/view?file=...` - Render individual markdown file
  - `/api/file?path=...` - Raw markdown content
  - `/api/search?q=...&mode=...` - Full-text search
- WebSocket server for browser connection tracking
- Auto-cleanup feature: closes server when browser disconnects (unless `--keep-running`)
- Single file mode automatically redirects to file view

**`lib/html-generator.js`** - HTML generation and templating
- `generateHtmlFromMarkdown()` - Converts markdown to full HTML page
- `generateIndexHtmlWithSearch()` - Creates file browser interface with search
- Embeds all assets inline: Prism.js, Mermaid.js, marked.js
- Supports 10 color themes and 6 typography styles
- Handles search query highlighting in rendered content

**`lib/virtual-fs.js`** - Virtual File System abstraction
- **VirtualFS** - Base class defining file system interface
- **SingleFileFS** - Single file wrapper for single-file mode
- **DiskFS** - Regular disk-based file access for folder mode
- **ZipFS** - In-memory ZIP reading with LRU cache for archive mode
  - LRU cache (100MB default) for file content caching
  - Pre-caches common files (README.md, index.md)
  - Built-in search functionality for encrypted archives
- Provides uniform API: `readFile()`, `exists()`, `listMarkdownFiles()`

**`lib/archive-handler.js`** - Archive packing and unpacking
- `packMarkdownFiles()` - Creates encrypted `.moremaid` ZIP archives
- `handleZipFile()` - Opens and serves ZIP archives in-memory
- Password prompt for encrypted archives
- Uses `@zip.js/zip.js` for browser-compatible ZIP handling

**`lib/utils.js`** - Utility functions
- `findMarkdownFiles()` - Recursive file discovery
- `findAvailablePort()` - Port scanning for server
- `openInBrowser()` - Cross-platform browser opening
- `promptPassword()` - Secure password input (hidden)

**`lib/config.js`** - Configuration constants
- Server defaults (port, timeouts)
- Supported themes and typography styles
- File extensions and patterns

**`lib/styles.js`** - CSS generation
- Returns CSS strings for themes and typography

### Key Implementation Details

**Virtual File System Pattern**: All file operations go through VirtualFS abstraction, allowing identical code paths for disk files, single files, and ZIP archives.

**Template Literal Escaping**: When generating HTML with embedded JavaScript, avoid nested template literals. Use string concatenation for JavaScript code embedded in the generated HTML.

**Auto-Cleanup Behavior**: Server tracks WebSocket connections. When all browsers disconnect, waits 500ms for reconnection before shutting down (unless `--keep-running` flag). Single-file mode always auto-cleans regardless of flag.

**Mermaid Fullscreen**: Diagrams wrapped in containers with absolute-positioned buttons. Click handlers use `window.open()` with generated HTML containing diagram definition.

**Search Implementation**: Two modes - filename search (default) and full-text search. Full-text returns context snippets (line before, match, line after) with highlighting.

**Child Window Tracking**: Mermaid fullscreen windows track parent and auto-close when parent closes using `beforeunload` event with 100ms cleanup delay.

## Testing

Tests are in `tests/` directory using Playwright. Key test files:
- `test-dir-mode.spec.js` - Directory mode navigation and search
- `directory-mode.spec.js` - Additional directory mode tests
- `single-file-auto-cleanup.spec.js` - Auto-cleanup behavior
- `child-window-auto-close.spec.js` - Child window lifecycle
- `copy-button.spec.js` - Code block copy functionality in single file mode
- `file-overlay-copy.spec.js` - Copy button in file overlay
- `single-file-copy-button.spec.js` - Single file copy functionality
- `search-highlighting.spec.js` - Search result highlighting
- `search-with-filter.spec.js` - Search with file filtering
- `filter-functionality.spec.js` - File filter UI
- `syntax-highlighting-overlay.spec.js` - Syntax highlighting in overlay
- `auto-switch-all-files.spec.js` - Auto-switch between modes

**Test Execution**: By default, tests run headless on Chromium only. While `playwright.config.js` configures all three browsers (Chromium, Firefox, WebKit), only Chromium tests should be run during development. Use `npm test` for headless Chromium tests.

## Utilities

**`check_md.js`** - Markdown and Mermaid validation tool
- Validates markdown syntax using marked parser
- Checks Mermaid diagram syntax for common errors
- Supports single file or directory scanning
- Reports bracket/brace mismatches and invalid diagram types
- Usage: `node check_md.js <file.md>` or `node check_md.js <directory>`

## Sample Files

The `samples/` directory contains test markdown files for various features:
- `syntax-test.md` - Syntax highlighting examples
- `test_syntax_highlighting.md` - Extended syntax tests
- `toml-test.md`, `protobuf-test.md` - Specific language syntax tests
- `anchors-test.md` - Markdown anchor functionality

## Development Constraints

- **Do not publish** to npm unless explicitly requested
- **Do not commit** changes unless explicitly requested
- **License compliance**: All dependencies must be MIT-compatible
- **Releases**: Only via GitHub Actions by pushing tags (e.g., `git tag v1.x.x && git push origin v1.x.x`)
- **Testing**: Create and run Playwright tests for every UI interaction
- **Screenshots**: Latest screenshot available at: `ls -t /Users/thies/Desktop/CleanShot* | head -1`