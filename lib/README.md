# Moremaid Library

This directory contains the modular components of Moremaid. The codebase is being gradually refactored from a monolithic `mm.js` file into these organized modules.

## Structure

- **config.js** - Configuration constants and settings
- **utils.js** - Utility functions (file operations, prompts, etc.)
- **styles.js** - CSS themes and typography styles
- **archive.js** - Archive/pack functionality for .moremaid files
- **index.js** - Main library exports

## Future Modules (To Be Extracted)

- **html-generator.js** - HTML generation from markdown
- **server.js** - HTTP server and WebSocket functionality
- **file-handler.js** - Single file processing
- **search.js** - Search functionality for folder mode
- **mermaid.js** - Mermaid diagram processing

## Usage

```javascript
const moremaid = require('./lib');

// Access specific modules
const { config, utils, styles, archive } = moremaid;

// Or import directly
const config = require('./lib/config');
```

## Migration Status

The original `mm.js` file contains over 3000 lines of code. We're taking a gradual approach to refactoring:

1. ✅ Created module structure
2. ✅ Extracted configuration
3. ✅ Extracted utility functions
4. ✅ Extracted styles
5. ✅ Prepared archive module
6. ⏳ HTML generation (complex, ~1000+ lines)
7. ⏳ Server functionality (complex, WebSocket integration)
8. ⏳ Full integration and testing

## Notes

- The current `mm.js` remains fully functional
- New features should use the modular structure
- Gradual refactoring minimizes risk of breaking changes