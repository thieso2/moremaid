# Python Server Version

This directory contains the Python server implementation of the Markdown & Mermaid viewer.

## Features

- Web-based file browser for navigating markdown files
- Live server with API endpoints for file listing and content
- Sidebar navigation with folder structure
- Bookmarkable URLs for specific files
- Fullscreen support for Mermaid diagrams

## Usage

1. Navigate to this directory:
```bash
cd python
```

2. Run the server:
```bash
python server.py
```

3. Open your browser to `http://localhost:8000`

## Requirements

- Python 3.x (uses only standard library modules)
- Modern web browser

## How it works

- `server.py` - Python HTTP server that provides:
  - `/` - Serves the main HTML interface
  - `/api/files` - Returns JSON tree of markdown files in current directory
  - `/api/file?path=...` - Returns content of a specific markdown file

- `index.html` - Single-page application that:
  - Displays file tree in sidebar
  - Renders markdown with syntax highlighting (Prism.js)
  - Renders Mermaid diagrams
  - Supports bookmarkable file URLs via hash navigation