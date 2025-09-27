# Changes

## v1.5.1 (2025-09-27)

### Bug Fixes
- **Critical: Fixed directory browsing**: WebSocket now connects for all localhost servers, not just temp/archive servers
- Files now display correctly when browsing local directories with `mm --server .`
- Resolved issue where file list would not appear in browser when using server mode

## v1.5.0 (2025-09-27)

### UI/UX Improvements
- **New File Viewer Overlay**: Files opened from search now display in a full-window overlay with smooth animations and a close button instead of navigating away
- **Enhanced Keyboard Navigation**:
  - SHIFT+TAB toggles between search modes (filename/content)
  - TAB switches focus between search field and file list
  - Arrow keys navigate the file list
  - ENTER opens the selected file
  - ESC only closes overlay (no longer clears search)
- **Visual Focus Indicators**: Clear visual indicators show which element has keyboard focus
- **Fixed Search Bar**: Search bar is now permanently visible at the top of the screen
- **Improved Scrolling**: Fixed issue where list content would scroll under the search field

### Architecture Changes
- **Removed Frameset**: Eliminated frameset wrapper, WebSocket now managed directly in main page
- **Direct WebSocket Integration**: Connection handling moved to main interface for better performance

### Server Improvements
- **Better Disconnect Messages**: Cleaner, more concise server disconnect notifications
- **Connection Status**: Immediate "Connection Lost" overlay when server stops

### Bug Fixes
- Fixed double-line navigation when using arrow keys
- Fixed TAB key incorrectly moving selection instead of just focus
- Prevented list content from scrolling under search field
- Fixed focus management when switching between search field and file list

### New Files
- Added `IDEAS.md` for project ideas and future enhancements
- Added `samples/anchors-test.md` for testing anchor functionality