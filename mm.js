#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const http = require('http');
const url = require('url');
const { marked } = require('marked');
const packageJson = require('./package.json');

// Parse command line arguments
const args = process.argv.slice(2);

// Check for dark mode flag (legacy support)
const darkMode = args.includes('--dark') || args.includes('-d');

// Check for theme flag
let selectedTheme = null;
const themeIndex = args.findIndex(arg => arg === '--theme' || arg === '-t');
if (themeIndex !== -1 && args[themeIndex + 1]) {
    selectedTheme = args[themeIndex + 1];
}
// If dark mode flag is set but no theme specified, use 'dark' theme
if (darkMode && !selectedTheme) {
    selectedTheme = 'dark';
}

// Handle --version flag
if (args.includes('--version') || args.includes('-v')) {
    console.log(packageJson.version);
    process.exit(0);
}

// Handle --help flag
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
moremaid v${packageJson.version}
A command-line tool to view Markdown files with Mermaid diagram support

Usage: mm [options] <markdown-file-or-folder>

Options:
  -h, --help          Show this help message
  -v, --version       Show version number
  -d, --dark          Start in dark mode (shortcut for --theme dark)
  -t, --theme <name>  Select color theme:
                      light, dark, github, github-dark, dracula,
                      nord, solarized-light, solarized-dark,
                      monokai, one-dark

Examples:
  mm README.md              View a markdown file
  mm docs/guide.md          View a file in a subdirectory
  mm ~/notes/meeting.md     View a file with absolute path
  mm .                      View all markdown files in current directory (starts server)
  mm docs                   View all markdown files in docs folder (starts server)

Features:
  • Renders Mermaid diagrams (flowcharts, sequence diagrams, etc.)
  • Syntax highlighting for code blocks
  • Opens in your default browser
  • Folder mode starts a local server for navigation
  • No external server required for single files

For more information, visit: https://github.com/thieso2/moremaid
`);
    process.exit(0);
}

// Get the input file or folder (first non-flag argument, excluding theme values)
const inputPath = args.find((arg, index) => {
    // Skip flags
    if (arg.startsWith('-')) return false;
    // Skip if this is a theme value (follows --theme or -t)
    const prevArg = args[index - 1];
    if (prevArg && (prevArg === '--theme' || prevArg === '-t')) return false;
    return true;
});

if (!inputPath) {
    console.error('Error: No markdown file or folder specified');
    console.error('Usage: mm <markdown-file-or-folder>');
    console.error('Try "mm --help" for more information');
    process.exit(1);
}

// Check if path exists
if (!fs.existsSync(inputPath)) {
    console.error(`Error: Path '${inputPath}' not found`);
    process.exit(1);
}

// Determine if it's a file or directory
const stats = fs.statSync(inputPath);

if (stats.isDirectory()) {
    // Handle directory mode - start HTTP server
    startFolderServer(inputPath);
} else {
    // Handle single file mode
    handleSingleFile(inputPath);
}

// Function to handle single file mode
function handleSingleFile(filePath) {
    // Check if it's a markdown file
    if (!filePath.match(/\.(md|markdown)$/i)) {
        console.warn('Warning: File does not have a .md extension');
    }

    // Read the markdown file
    const markdown = fs.readFileSync(filePath, 'utf-8');
    const title = path.basename(filePath);

    // Generate HTML
    const html = generateHtmlFromMarkdown(markdown, title, false, false, selectedTheme);

    // Create a temporary HTML file
    const tempFile = path.join(require('os').tmpdir(), `mm-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html);

    // Determine the command to open the file based on the platform
    let openCommand;
    switch (process.platform) {
        case 'darwin': // macOS
            openCommand = 'open';
            break;
        case 'win32': // Windows
            openCommand = 'start';
            break;
        default: // Linux and others
            openCommand = 'xdg-open';
    }

    // Open the file in the default browser
    exec(`${openCommand} "${tempFile}"`, (error) => {
        if (error) {
            console.error('Error opening file:', error);
            console.log(`HTML file saved to: ${tempFile}`);
            process.exit(1);
        }

        // Clean up temp file after a delay (give browser time to load)
        setTimeout(() => {
            try {
                fs.unlinkSync(tempFile);
            } catch (err) {
                // Ignore cleanup errors
            }
        }, 5000);
    });
}

// Function to recursively find markdown files
function findMarkdownFiles(dir, baseDir = dir) {
    let files = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        // Skip hidden files and node_modules
        if (item.startsWith('.') || item === 'node_modules') continue;

        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files = files.concat(findMarkdownFiles(fullPath, baseDir));
        } else if (item.match(/\.(md|markdown)$/i)) {
            files.push(path.relative(baseDir, fullPath));
        }
    }

    return files.sort();
}

// Function to generate folder index markdown
function generateFolderIndex(folderPath, files, port = 8080) {
    const folderName = path.basename(folderPath) || 'Directory';
    let markdown = `# 📁 ${folderName}\n\n`;
    markdown += `Found ${files.length} markdown file${files.length === 1 ? '' : 's'}:\n\n`;

    // Group files by directory
    const filesByDir = {};
    files.forEach(file => {
        const dir = path.dirname(file);
        if (!filesByDir[dir]) filesByDir[dir] = [];
        filesByDir[dir].push(file);
    });

    // Generate markdown list
    Object.keys(filesByDir).sort().forEach(dir => {
        if (dir !== '.') {
            markdown += `\n## 📂 ${dir}\n\n`;
        }

        filesByDir[dir].forEach(file => {
            const fileName = path.basename(file);
            markdown += `- [${fileName}](/view?file=${encodeURIComponent(file)})\n`;
        });
    });

    markdown += '\n---\n';
    markdown += `\n*Generated by moremaid on ${new Date().toLocaleString()}*\n`;
    markdown += `\n*Server running on http://localhost:${port} • Press Ctrl+C to stop*\n`;

    return markdown;
}

// Function to generate index HTML with search functionality
function generateIndexHtmlWithSearch(folderPath, files, port, forceTheme = null) {
    const folderName = path.basename(folderPath) || 'Directory';

    // Prepare file data for JavaScript
    const fileData = files.map(file => ({
        path: file,
        fileName: path.basename(file),
        directory: path.dirname(file) === '.' ? '' : path.dirname(file)
    }));

    // Get theme CSS variables from generateHtmlFromMarkdown
    const dummyHtml = generateHtmlFromMarkdown('', 'dummy', true, true, forceTheme);
    const styleMatch = dummyHtml.match(/<style>([\s\S]*?)<\/style>/);
    const styles = styleMatch ? styleMatch[1] : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of ${folderName}</title>
    <style>
        ${styles}

        /* Search field styles */
        .search-container {
            position: relative;
            margin: 20px 0;
        }

        .search-field {
            width: 100%;
            padding: 12px 16px;
            font-size: 16px;
            border: 2px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-color);
            color: var(--text-color);
            transition: border-color 0.2s;
        }

        .search-field:focus {
            outline: none;
            border-color: var(--link-color);
        }

        .search-suggestions {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            margin-top: 4px;
            background: var(--bg-color);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            max-height: 400px;
            overflow-y: auto;
            z-index: 1000;
            display: none;
        }

        .search-suggestions.active {
            display: block;
        }

        .suggestion-item {
            padding: 10px 16px;
            cursor: pointer;
            border-bottom: 1px solid var(--border-color);
            transition: background 0.1s;
        }

        .suggestion-item:last-child {
            border-bottom: none;
        }

        .suggestion-item:hover,
        .suggestion-item.selected {
            background: var(--code-bg);
        }

        .suggestion-item .file-name {
            font-weight: 500;
            color: var(--text-color);
        }

        .suggestion-item .file-path {
            font-size: 12px;
            color: var(--file-info-color);
            margin-top: 2px;
        }

        .suggestion-item mark {
            background: var(--link-color);
            color: var(--bg-color);
            padding: 0 2px;
            border-radius: 2px;
        }

        .no-results {
            padding: 20px;
            text-align: center;
            color: var(--file-info-color);
        }

        .search-shortcut {
            position: absolute;
            right: 12px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 12px;
            color: var(--file-info-color);
            background: var(--code-bg);
            padding: 4px 8px;
            border-radius: 4px;
            pointer-events: none;
        }

        .file-list {
            transition: opacity 0.2s;
        }

        .file-list.filtering {
            opacity: 0.5;
        }

        .file-group {
            margin-bottom: 30px;
        }

        .file-group h2 {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .file-group .count {
            font-size: 14px;
            color: var(--file-info-color);
            font-weight: normal;
        }

        .hidden {
            display: none !important;
        }
    </style>
</head>
<body>
    <div class="controls-trigger"></div>
    <div class="controls">
        <div class="zoom-control">
            <button id="zoomOut" title="Zoom out">−</button>
            <span class="zoom-value" id="zoomValue">100%</span>
            <button id="zoomIn" title="Zoom in">+</button>
            <button id="zoomReset" title="Reset zoom">⟲</button>
        </div>
        <select id="themeSelector" title="Select color theme">
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="github">📘 GitHub</option>
            <option value="github-dark">📕 GitHub Dark</option>
            <option value="dracula">🧛 Dracula</option>
            <option value="nord">❄️ Nord</option>
            <option value="solarized-light">🌅 Solarized Light</option>
            <option value="solarized-dark">🌃 Solarized Dark</option>
            <option value="monokai">🎨 Monokai</option>
            <option value="one-dark">🌑 One Dark</option>
        </select>
    </div>
    <div class="container">
        <div class="file-info">
            📁 Index of ${folderName} • Generated on ${new Date().toLocaleString()}
        </div>

        <h1>📁 ${folderName}</h1>

        <div class="search-container">
            <input
                type="text"
                class="search-field"
                id="searchField"
                placeholder="Search ${files.length} markdown files... (Press '/' to focus)"
                autocomplete="off"
            />
            <span class="search-shortcut" id="searchShortcut">/</span>
            <div class="search-suggestions" id="searchSuggestions"></div>
        </div>

        <p>Found ${files.length} markdown file${files.length === 1 ? '' : 's'}:</p>

        <div class="file-list" id="fileList">
            ${generateFileListHTML(fileData)}
        </div>

        <hr>
        <p><em>Generated by moremaid on ${new Date().toLocaleString()}</em></p>
        <p><em>Server running on http://localhost:${port} • Press Ctrl+C to stop</em></p>
    </div>

    <script>
        // File data
        const allFiles = ${JSON.stringify(fileData)};

        // Search functionality
        const searchField = document.getElementById('searchField');
        const searchSuggestions = document.getElementById('searchSuggestions');
        const searchShortcut = document.getElementById('searchShortcut');
        const fileList = document.getElementById('fileList');
        let selectedIndex = -1;

        // Highlight matching text
        function highlightMatch(text, query) {
            if (!query) return text;
            // Simple case-insensitive highlighting without regex
            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            let result = '';
            let lastIndex = 0;
            let index = lowerText.indexOf(lowerQuery);

            while (index !== -1) {
                result += text.slice(lastIndex, index);
                result += '<mark>' + text.slice(index, index + query.length) + '</mark>';
                lastIndex = index + query.length;
                index = lowerText.indexOf(lowerQuery, lastIndex);
            }
            result += text.slice(lastIndex);
            return result;
        }

        // Filter files based on query
        function filterFiles(query) {
            if (!query) return allFiles;

            const lowerQuery = query.toLowerCase();
            return allFiles.filter(file => {
                const fullPath = file.directory ? file.directory + '/' + file.fileName : file.fileName;
                return fullPath.toLowerCase().includes(lowerQuery);
            }).sort((a, b) => {
                // Sort by relevance (filename matches first, then path matches)
                const aFileName = a.fileName.toLowerCase();
                const bFileName = b.fileName.toLowerCase();
                const aPath = (a.directory + '/' + a.fileName).toLowerCase();
                const bPath = (b.directory + '/' + b.fileName).toLowerCase();

                const aFileMatch = aFileName.includes(lowerQuery);
                const bFileMatch = bFileName.includes(lowerQuery);

                if (aFileMatch && !bFileMatch) return -1;
                if (!aFileMatch && bFileMatch) return 1;

                // If both match in filename or both don't, sort by position
                const aIndex = aFileMatch ? aFileName.indexOf(lowerQuery) : aPath.indexOf(lowerQuery);
                const bIndex = bFileMatch ? bFileName.indexOf(lowerQuery) : bPath.indexOf(lowerQuery);

                return aIndex - bIndex;
            });
        }

        // Update suggestions
        function updateSuggestions(query) {
            const filteredFiles = filterFiles(query);
            selectedIndex = -1;

            if (!query) {
                searchSuggestions.classList.remove('active');
                searchShortcut.style.display = 'block';
                fileList.classList.remove('filtering');
                // Show all files
                document.querySelectorAll('.file-item').forEach(item => {
                    item.classList.remove('hidden');
                });
                document.querySelectorAll('.file-group').forEach(group => {
                    group.classList.remove('hidden');
                    updateGroupCount(group);
                });
                return;
            }

            searchShortcut.style.display = 'none';
            fileList.classList.add('filtering');

            if (filteredFiles.length === 0) {
                searchSuggestions.innerHTML = '<div class="no-results">No files found</div>';
                searchSuggestions.classList.add('active');
                // Hide all files
                document.querySelectorAll('.file-item').forEach(item => {
                    item.classList.add('hidden');
                });
                document.querySelectorAll('.file-group').forEach(group => {
                    group.classList.add('hidden');
                });
                return;
            }

            // Show suggestions
            const html = filteredFiles.slice(0, 10).map((file, index) => {
                const fullPath = file.directory ? file.directory + '/' + file.fileName : file.fileName;
                const highlightedFileName = highlightMatch(file.fileName, query);
                const highlightedPath = file.directory ? highlightMatch(file.directory, query) : '';

                return \`<div class="suggestion-item" data-index="\${index}" data-path="\${file.path}">
                    <div class="file-name">\${highlightedFileName}</div>
                    \${file.directory ? \`<div class="file-path">\${highlightedPath}/</div>\` : ''}
                </div>\`;
            }).join('');

            searchSuggestions.innerHTML = html;
            searchSuggestions.classList.add('active');

            // Update file list to show only matching files
            const matchingPaths = new Set(filteredFiles.map(f => f.path));
            document.querySelectorAll('.file-item').forEach(item => {
                const filePath = item.getAttribute('data-path');
                if (matchingPaths.has(filePath)) {
                    item.classList.remove('hidden');
                } else {
                    item.classList.add('hidden');
                }
            });

            // Update group visibility
            document.querySelectorAll('.file-group').forEach(group => {
                const visibleItems = group.querySelectorAll('.file-item:not(.hidden)').length;
                if (visibleItems === 0) {
                    group.classList.add('hidden');
                } else {
                    group.classList.remove('hidden');
                    updateGroupCount(group, visibleItems);
                }
            });
        }

        // Update group file count
        function updateGroupCount(group, count = null) {
            const countEl = group.querySelector('.count');
            if (countEl) {
                const visibleCount = count !== null ? count : group.querySelectorAll('.file-item:not(.hidden)').length;
                const totalCount = group.querySelectorAll('.file-item').length;
                if (searchField.value && visibleCount < totalCount) {
                    countEl.textContent = \`(\${visibleCount}/\${totalCount})\`;
                } else {
                    countEl.textContent = \`(\${totalCount})\`;
                }
            }
        }

        // Handle suggestion click
        searchSuggestions.addEventListener('click', (e) => {
            const item = e.target.closest('.suggestion-item');
            if (item) {
                const path = item.getAttribute('data-path');
                window.location.href = '/view?file=' + encodeURIComponent(path);
            }
        });

        // Handle keyboard navigation
        searchField.addEventListener('keydown', (e) => {
            const items = searchSuggestions.querySelectorAll('.suggestion-item');

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
                updateSelectedItem(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                updateSelectedItem(items);
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault();
                const path = items[selectedIndex].getAttribute('data-path');
                window.location.href = '/view?file=' + encodeURIComponent(path);
            } else if (e.key === 'Escape') {
                searchField.value = '';
                updateSuggestions('');
                searchField.blur();
            }
        });

        // Update selected item highlighting
        function updateSelectedItem(items) {
            items.forEach((item, index) => {
                if (index === selectedIndex) {
                    item.classList.add('selected');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('selected');
                }
            });
        }

        // Handle input changes
        searchField.addEventListener('input', (e) => {
            updateSuggestions(e.target.value);
        });

        // Handle focus
        searchField.addEventListener('focus', () => {
            if (searchField.value) {
                updateSuggestions(searchField.value);
            }
        });

        // Handle blur
        searchField.addEventListener('blur', (e) => {
            // Delay to allow click on suggestion
            setTimeout(() => {
                if (!searchSuggestions.contains(e.relatedTarget)) {
                    searchSuggestions.classList.remove('active');
                }
            }, 200);
        });

        // Global keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (document.activeElement !== searchField) {
                    e.preventDefault();
                    searchField.focus();
                    searchField.select();
                }
            }
        });

        // Theme functionality (copy from generateHtmlFromMarkdown)
        const themes = {
            light: { name: 'Light', mermaid: 'default' },
            dark: { name: 'Dark', mermaid: 'dark' },
            github: { name: 'GitHub', mermaid: 'default' },
            'github-dark': { name: 'GitHub Dark', mermaid: 'dark' },
            dracula: { name: 'Dracula', mermaid: 'dark' },
            nord: { name: 'Nord', mermaid: 'dark' },
            'solarized-light': { name: 'Solarized Light', mermaid: 'default' },
            'solarized-dark': { name: 'Solarized Dark', mermaid: 'dark' },
            monokai: { name: 'Monokai', mermaid: 'dark' },
            'one-dark': { name: 'One Dark', mermaid: 'dark' }
        };

        function initTheme() {
            const forcedTheme = ${forceTheme ? `'${forceTheme}'` : 'null'};
            const savedTheme = localStorage.getItem('theme');
            const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const defaultTheme = forcedTheme || savedTheme || (systemPrefersDark ? 'dark' : 'light');
            const theme = themes[defaultTheme] ? defaultTheme : 'light';

            document.documentElement.setAttribute('data-theme', theme);
            updateThemeSelector(theme);
            return theme;
        }

        function updateThemeSelector(theme) {
            const selector = document.getElementById('themeSelector');
            if (selector) {
                selector.value = theme;
            }
        }

        function switchTheme(newTheme) {
            if (!themes[newTheme]) return;
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeSelector(newTheme);
        }

        // Initialize theme
        initTheme();

        // Theme selector change event
        document.getElementById('themeSelector').addEventListener('change', function(e) {
            switchTheme(e.target.value);
        });

        // Zoom functionality (copy from generateHtmlFromMarkdown)
        let currentZoom = 100;

        function setZoom(scale) {
            document.body.style.transform = 'scale(' + scale + ')';
            document.body.style.transformOrigin = '0 0';
            document.body.style.width = (100 / scale) + '%';
            document.body.style.height = (100 / scale) + '%';
        }

        function updateZoom(zoomLevel) {
            currentZoom = Math.max(50, Math.min(200, zoomLevel));
            const scale = currentZoom / 100;
            setZoom(scale);
            document.getElementById('zoomValue').textContent = currentZoom + '%';
            localStorage.setItem('zoom', currentZoom);
        }

        // Initialize zoom from local storage
        const savedZoom = localStorage.getItem('zoom');
        if (savedZoom) {
            currentZoom = parseInt(savedZoom);
            updateZoom(currentZoom);
        }

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', function() {
            updateZoom(currentZoom + 10);
        });

        document.getElementById('zoomOut').addEventListener('click', function() {
            updateZoom(currentZoom - 10);
        });

        document.getElementById('zoomReset').addEventListener('click', function() {
            updateZoom(100);
        });

        // Keyboard shortcuts for zoom
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    updateZoom(currentZoom + 10);
                } else if (e.key === '-') {
                    e.preventDefault();
                    updateZoom(currentZoom - 10);
                } else if (e.key === '0') {
                    e.preventDefault();
                    updateZoom(100);
                }
            }
        });
    </script>
</body>
</html>`;

    // Helper function to generate file list HTML
    function generateFileListHTML(fileData) {
        const filesByDir = {};
        fileData.forEach(file => {
            const dir = file.directory || '.';
            if (!filesByDir[dir]) filesByDir[dir] = [];
            filesByDir[dir].push(file);
        });

        let html = '';
        Object.keys(filesByDir).sort().forEach(dir => {
            const files = filesByDir[dir];
            html += '<div class="file-group">';

            if (dir !== '.') {
                html += `<h2>📂 ${dir} <span class="count">(${files.length})</span></h2>`;
            }

            html += '<ul>';
            files.forEach(file => {
                html += `<li class="file-item" data-path="${file.path}">`;
                html += `<a href="/view?file=${encodeURIComponent(file.path)}">${file.fileName}</a>`;
                html += '</li>';
            });
            html += '</ul>';
            html += '</div>';
        });

        return html;
    }
}

// Function to find an available port
function findAvailablePort(startPort = 8080, maxAttempts = 10) {
    return new Promise((resolve, reject) => {
        let currentPort = startPort;
        let attempts = 0;

        const tryPort = () => {
            if (attempts >= maxAttempts) {
                reject(new Error(`Could not find an available port after ${maxAttempts} attempts`));
                return;
            }

            const testServer = http.createServer();

            testServer.listen(currentPort, () => {
                testServer.close(() => {
                    resolve(currentPort);
                });
            });

            testServer.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    attempts++;
                    currentPort++;
                    tryPort();
                } else {
                    reject(err);
                }
            });
        };

        tryPort();
    });
}

// Function to start HTTP server for folder mode
async function startFolderServer(folderPath) {
    const baseDir = path.resolve(folderPath);

    // Try to find an available port
    let port;
    try {
        const startPort = process.env.PORT ? parseInt(process.env.PORT) : 8080;
        port = await findAvailablePort(startPort);
    } catch (error) {
        console.error('❌ Could not find an available port');
        console.error('Try specifying a different port: PORT=9000 mm ' + folderPath);
        process.exit(1);
    }

    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        if (pathname === '/' || pathname === '/index') {
            // Serve index page
            const mdFiles = findMarkdownFiles(baseDir);
            if (mdFiles.length === 0) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!DOCTYPE html>
<html>
<head>
    <title>No Files Found</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #e74c3c; margin-bottom: 10px; }
        p { color: #666; }
        .path {
            background: #f4f4f4;
            padding: 5px 10px;
            border-radius: 4px;
            font-family: monospace;
            margin-top: 10px;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📂 No Markdown Files Found</h1>
        <p>No .md or .markdown files were found in:</p>
        <div class="path">${baseDir}</div>
    </div>
</body>
</html>`);
                return;
            }

            // Generate custom HTML for index with search functionality
            const indexHtml = generateIndexHtmlWithSearch(baseDir, mdFiles, port, selectedTheme);

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexHtml);

        } else if (pathname === '/view') {
            // Serve individual markdown file
            const file = parsedUrl.query.file;
            if (!file) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>No file specified</h1>');
                return;
            }

            const filePath = path.join(baseDir, file);

            // Security check - ensure file is within base directory
            if (!filePath.startsWith(baseDir)) {
                res.writeHead(403, { 'Content-Type': 'text/html' });
                res.end('<h1>Access denied</h1>');
                return;
            }

            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>File not found</h1>');
                return;
            }

            try {
                const markdown = fs.readFileSync(filePath, 'utf-8');
                const html = generateHtmlFromMarkdown(markdown, path.basename(filePath), false, true, selectedTheme);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Error reading file: ${error.message}</h1>`);
            }

        } else if (pathname === '/favicon.ico') {
            // Handle favicon requests gracefully
            res.writeHead(204, { 'Content-Type': 'image/x-icon' });
            res.end();
        } else {
            // Better 404 page
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`<!DOCTYPE html>
<html>
<head>
    <title>404 Not Found</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #e74c3c; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        a {
            color: #3498db;
            text-decoration: none;
            padding: 10px 20px;
            border: 2px solid #3498db;
            border-radius: 4px;
            display: inline-block;
            transition: all 0.2s;
        }
        a:hover {
            background: #3498db;
            color: white;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>404 - Page Not Found</h1>
        <p>The requested path "${pathname}" was not found.</p>
        <a href="/">← Back to Index</a>
    </div>
</body>
</html>`);
        }
    });

    server.listen(port, () => {
        console.log(`🚀 Moremaid server running at http://localhost:${port}`);
        console.log(`📁 Serving markdown files from: ${baseDir}`);
        console.log('Press Ctrl+C to stop the server');

        // Open browser
        const openCommand = process.platform === 'darwin' ? 'open' :
                          process.platform === 'win32' ? 'start' :
                          'xdg-open';
        exec(`${openCommand} http://localhost:${port}`);
    });

    server.on('error', (err) => {
        console.error('Server error:', err);
        process.exit(1);
    });

    // Handle graceful shutdown
    let isShuttingDown = false;
    process.on('SIGINT', () => {
        if (isShuttingDown) {
            // Force immediate exit on second Ctrl+C
            process.exit(0);
        }
        isShuttingDown = true;
        console.log('\n👋 Stopping server...');
        server.close(() => {
            process.exit(0);
        });
        // Force exit after 1 second if server doesn't close
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    });
}

// Function to generate HTML from markdown
function generateHtmlFromMarkdown(markdown, title, isIndex, isServer, forceTheme = null) {
    // Configure marked
    marked.setOptions({
        breaks: true,
        gfm: true,
        langPrefix: 'language-'
    });

    // Convert markdown to HTML
    let htmlContent = marked.parse(markdown);

    // Fix language aliases
    const replacements = [
        ['class="language-js"', 'class="language-javascript"'],
        ['class="language-ts"', 'class="language-typescript"'],
        ['class="language-py"', 'class="language-python"'],
        ['class="language-rb"', 'class="language-ruby"'],
        ['class="language-yml"', 'class="language-yaml"'],
        ['class="language-sh"', 'class="language-bash"'],
        ['class="language-shell"', 'class="language-bash"'],
        ['class="language-cs"', 'class="language-csharp"']
    ];

    replacements.forEach(([from, to]) => {
        htmlContent = htmlContent.replace(new RegExp(from, 'g'), to);
    });

    // Process mermaid code blocks
    htmlContent = htmlContent.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
        (match, code) => {
            const decodedCode = code.replace(/&lt;/g, '<')
                                   .replace(/&gt;/g, '>')
                                   .replace(/&amp;/g, '&')
                                   .replace(/&quot;/g, '"')
                                   .replace(/&#39;/g, "'");
            return `<div class="mermaid">${decodedCode}</div>`;
        });

    // Generate complete HTML document
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <!-- Prism.js for syntax highlighting -->
    <link href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
    <!-- Core dependencies first -->
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-clike.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markup.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markup-templating.min.js"></script>
    <!-- Language components -->
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-typescript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-jsx.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-tsx.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-java.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-c.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-cpp.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-csharp.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-php.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-ruby.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-go.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-rust.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-kotlin.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-swift.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-sql.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-yaml.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-docker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-nginx.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-apache.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        /* Default Light Theme */
        :root, [data-theme="light"] {
            --bg-color: white;
            --text-color: #333;
            --heading-color: #2c3e50;
            --heading2-color: #34495e;
            --border-color: #ecf0f1;
            --code-bg: #f4f4f4;
            --code-color: #d14;
            --link-color: #3498db;
            --blockquote-color: #555;
            --table-header-bg: #f0f0f0;
            --table-border: #ddd;
            --file-info-bg: #f5f5f5;
            --file-info-color: #666;
            --mermaid-btn-bg: rgba(52, 73, 94, 0.8);
            --mermaid-btn-hover: rgba(52, 73, 94, 1);
        }

        /* Dark Theme */
        [data-theme="dark"] {
            --bg-color: #1a1a1a;
            --text-color: #e0e0e0;
            --heading-color: #61afef;
            --heading2-color: #56b6c2;
            --border-color: #3a3a3a;
            --code-bg: #2d2d2d;
            --code-color: #e06c75;
            --link-color: #61afef;
            --blockquote-color: #abb2bf;
            --table-header-bg: #2d2d2d;
            --table-border: #4a4a4a;
            --file-info-bg: #2d2d2d;
            --file-info-color: #abb2bf;
            --mermaid-btn-bg: rgba(97, 175, 239, 0.8);
            --mermaid-btn-hover: rgba(97, 175, 239, 1);
        }

        /* GitHub Theme */
        [data-theme="github"] {
            --bg-color: #ffffff;
            --text-color: #24292e;
            --heading-color: #24292e;
            --heading2-color: #24292e;
            --border-color: #e1e4e8;
            --code-bg: #f6f8fa;
            --code-color: #e36209;
            --link-color: #0366d6;
            --blockquote-color: #6a737d;
            --table-header-bg: #f6f8fa;
            --table-border: #e1e4e8;
            --file-info-bg: #f6f8fa;
            --file-info-color: #586069;
            --mermaid-btn-bg: rgba(3, 102, 214, 0.8);
            --mermaid-btn-hover: rgba(3, 102, 214, 1);
        }

        /* GitHub Dark Theme */
        [data-theme="github-dark"] {
            --bg-color: #0d1117;
            --text-color: #c9d1d9;
            --heading-color: #58a6ff;
            --heading2-color: #58a6ff;
            --border-color: #30363d;
            --code-bg: #161b22;
            --code-color: #ff7b72;
            --link-color: #58a6ff;
            --blockquote-color: #8b949e;
            --table-header-bg: #161b22;
            --table-border: #30363d;
            --file-info-bg: #161b22;
            --file-info-color: #8b949e;
            --mermaid-btn-bg: rgba(88, 166, 255, 0.8);
            --mermaid-btn-hover: rgba(88, 166, 255, 1);
        }

        /* Dracula Theme */
        [data-theme="dracula"] {
            --bg-color: #282a36;
            --text-color: #f8f8f2;
            --heading-color: #bd93f9;
            --heading2-color: #ff79c6;
            --border-color: #44475a;
            --code-bg: #44475a;
            --code-color: #ff79c6;
            --link-color: #8be9fd;
            --blockquote-color: #6272a4;
            --table-header-bg: #44475a;
            --table-border: #6272a4;
            --file-info-bg: #44475a;
            --file-info-color: #6272a4;
            --mermaid-btn-bg: rgba(189, 147, 249, 0.8);
            --mermaid-btn-hover: rgba(189, 147, 249, 1);
        }

        /* Nord Theme */
        [data-theme="nord"] {
            --bg-color: #2e3440;
            --text-color: #eceff4;
            --heading-color: #88c0d0;
            --heading2-color: #81a1c1;
            --border-color: #3b4252;
            --code-bg: #3b4252;
            --code-color: #d08770;
            --link-color: #88c0d0;
            --blockquote-color: #d8dee9;
            --table-header-bg: #3b4252;
            --table-border: #4c566a;
            --file-info-bg: #3b4252;
            --file-info-color: #d8dee9;
            --mermaid-btn-bg: rgba(136, 192, 208, 0.8);
            --mermaid-btn-hover: rgba(136, 192, 208, 1);
        }

        /* Solarized Light Theme */
        [data-theme="solarized-light"] {
            --bg-color: #fdf6e3;
            --text-color: #657b83;
            --heading-color: #073642;
            --heading2-color: #586e75;
            --border-color: #eee8d5;
            --code-bg: #eee8d5;
            --code-color: #dc322f;
            --link-color: #268bd2;
            --blockquote-color: #839496;
            --table-header-bg: #eee8d5;
            --table-border: #93a1a1;
            --file-info-bg: #eee8d5;
            --file-info-color: #839496;
            --mermaid-btn-bg: rgba(38, 139, 210, 0.8);
            --mermaid-btn-hover: rgba(38, 139, 210, 1);
        }

        /* Solarized Dark Theme */
        [data-theme="solarized-dark"] {
            --bg-color: #002b36;
            --text-color: #839496;
            --heading-color: #93a1a1;
            --heading2-color: #839496;
            --border-color: #073642;
            --code-bg: #073642;
            --code-color: #dc322f;
            --link-color: #268bd2;
            --blockquote-color: #657b83;
            --table-header-bg: #073642;
            --table-border: #586e75;
            --file-info-bg: #073642;
            --file-info-color: #657b83;
            --mermaid-btn-bg: rgba(38, 139, 210, 0.8);
            --mermaid-btn-hover: rgba(38, 139, 210, 1);
        }

        /* Monokai Theme */
        [data-theme="monokai"] {
            --bg-color: #272822;
            --text-color: #f8f8f2;
            --heading-color: #66d9ef;
            --heading2-color: #a6e22e;
            --border-color: #3e3d32;
            --code-bg: #3e3d32;
            --code-color: #f92672;
            --link-color: #66d9ef;
            --blockquote-color: #75715e;
            --table-header-bg: #3e3d32;
            --table-border: #75715e;
            --file-info-bg: #3e3d32;
            --file-info-color: #75715e;
            --mermaid-btn-bg: rgba(102, 217, 239, 0.8);
            --mermaid-btn-hover: rgba(102, 217, 239, 1);
        }

        /* One Dark Theme */
        [data-theme="one-dark"] {
            --bg-color: #282c34;
            --text-color: #abb2bf;
            --heading-color: #61afef;
            --heading2-color: #e06c75;
            --border-color: #3e4451;
            --code-bg: #3e4451;
            --code-color: #e06c75;
            --link-color: #61afef;
            --blockquote-color: #5c6370;
            --table-header-bg: #3e4451;
            --table-border: #4b5263;
            --file-info-bg: #3e4451;
            --file-info-color: #5c6370;
            --mermaid-btn-bg: rgba(97, 175, 239, 0.8);
            --mermaid-btn-hover: rgba(97, 175, 239, 1);
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 30px;
            line-height: 1.6;
            transition: background-color 0.3s, color 0.3s;
            min-height: 100vh;
            transform-origin: 0 0;
        }

        .controls-trigger {
            position: fixed;
            top: 0;
            right: 0;
            width: 150px;
            height: 100px;
            z-index: 999;
            cursor: default;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            gap: 10px;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .controls-trigger:hover ~ .controls,
        .controls:hover {
            opacity: 1;
            visibility: visible;
        }

        .controls select {
            background: var(--heading-color);
            color: var(--bg-color);
            border: none;
            border-radius: 8px;
            padding: 10px 15px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transition: transform 0.2s, opacity 0.3s;
            appearance: none;
            padding-right: 35px;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 20px;
        }

        .controls select:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .controls select:focus {
            outline: 2px solid var(--link-color);
            outline-offset: 2px;
        }

        .controls option {
            background: var(--bg-color);
            color: var(--text-color);
            padding: 10px;
        }

        .zoom-control {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--heading-color);
            color: var(--bg-color);
            border-radius: 8px;
            padding: 8px 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }

        .zoom-control button {
            background: transparent;
            color: var(--bg-color);
            border: none;
            cursor: pointer;
            font-size: 18px;
            padding: 0 4px;
            opacity: 0.8;
            transition: opacity 0.2s;
        }

        .zoom-control button:hover {
            opacity: 1;
        }

        .zoom-value {
            min-width: 45px;
            text-align: center;
            font-size: 13px;
            font-weight: 500;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        h1 {
            color: var(--heading-color);
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        h2 {
            color: var(--heading2-color);
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 5px;
        }

        h3 {
            color: var(--heading2-color);
            margin-top: 20px;
            margin-bottom: 10px;
        }

        code:not([class*="language-"]) {
            background: var(--code-bg);
            padding: 2px 5px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            color: var(--code-color);
        }

        pre {
            margin: 15px 0;
            border-radius: 5px;
            overflow: hidden;
        }

        pre code {
            padding: 0;
            background: transparent;
        }

        pre[class*="language-"] {
            margin: 15px 0;
            padding: 1em;
            border-radius: 5px;
            font-size: 14px;
            line-height: 1.5;
        }

        code[class*="language-"],
        pre[class*="language-"] {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
        }

        table {
            border-collapse: collapse;
            margin: 20px 0;
            width: 100%;
        }

        table th,
        table td {
            border: 1px solid var(--table-border);
            padding: 10px;
            text-align: left;
        }

        table th {
            background: var(--table-header-bg);
            font-weight: bold;
        }

        ul, ol {
            margin-left: 30px;
            margin-bottom: 15px;
        }

        li {
            margin: 5px 0;
        }

        blockquote {
            border-left: 4px solid var(--link-color);
            padding-left: 20px;
            margin: 20px 0;
            color: var(--blockquote-color);
            font-style: italic;
        }

        .mermaid {
            text-align: center;
            margin: 20px 0;
            position: relative;
            display: block;
            width: 100%;
        }

        .mermaid-container {
            position: relative;
            display: block;
            width: 100%;
        }

        .mermaid-container svg {
            max-width: 100%;
            height: auto;
        }

        .mermaid-fullscreen-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: var(--mermaid-btn-bg);
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 10px;
            cursor: pointer;
            font-size: 18px;
            z-index: 10;
            transition: background 0.2s;
        }

        .mermaid-fullscreen-btn:hover {
            background: var(--mermaid-btn-hover);
        }

        a {
            color: var(--link-color);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        img {
            max-width: 100%;
            height: auto;
        }

        .file-info {
            background: var(--file-info-bg);
            padding: 10px 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 14px;
            color: var(--file-info-color);
        }

        .nav-bar {
            margin-bottom: 20px;
        }

        .nav-bar a {
            text-decoration: none;
            color: var(--link-color);
            font-size: 14px;
        }

        .nav-bar a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="controls-trigger"></div>
    <div class="controls">
        <div class="zoom-control">
            <button id="zoomOut" title="Zoom out">−</button>
            <span class="zoom-value" id="zoomValue">100%</span>
            <button id="zoomIn" title="Zoom in">+</button>
            <button id="zoomReset" title="Reset zoom">⟲</button>
        </div>
        <select id="themeSelector" title="Select color theme">
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="github">📘 GitHub</option>
            <option value="github-dark">📕 GitHub Dark</option>
            <option value="dracula">🧛 Dracula</option>
            <option value="nord">❄️ Nord</option>
            <option value="solarized-light">🌅 Solarized Light</option>
            <option value="solarized-dark">🌃 Solarized Dark</option>
            <option value="monokai">🎨 Monokai</option>
            <option value="one-dark">🌑 One Dark</option>
        </select>
    </div>
    <div class="container">
        ${isServer && !isIndex ? '<div class="nav-bar"><a href="/">← Back to index</a></div>' : ''}
        <div class="file-info">
            ${isIndex ? '📁' : '📄'} ${title} • Generated on ${new Date().toLocaleString()}
        </div>
        ${htmlContent}
    </div>

    <script>
        // Theme functionality
        const themes = {
            light: { name: 'Light', mermaid: 'default' },
            dark: { name: 'Dark', mermaid: 'dark' },
            github: { name: 'GitHub', mermaid: 'default' },
            'github-dark': { name: 'GitHub Dark', mermaid: 'dark' },
            dracula: { name: 'Dracula', mermaid: 'dark' },
            nord: { name: 'Nord', mermaid: 'dark' },
            'solarized-light': { name: 'Solarized Light', mermaid: 'default' },
            'solarized-dark': { name: 'Solarized Dark', mermaid: 'dark' },
            monokai: { name: 'Monokai', mermaid: 'dark' },
            'one-dark': { name: 'One Dark', mermaid: 'dark' }
        };

        function initTheme() {
            const forcedTheme = ${forceTheme ? `'${forceTheme}'` : 'null'};
            const savedTheme = localStorage.getItem('theme');
            const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const defaultTheme = forcedTheme || savedTheme || (systemPrefersDark ? 'dark' : 'light');
            const theme = themes[defaultTheme] ? defaultTheme : 'light';

            document.documentElement.setAttribute('data-theme', theme);
            updateThemeSelector(theme);
            return theme;
        }

        function updateThemeSelector(theme) {
            const selector = document.getElementById('themeSelector');
            if (selector) {
                selector.value = theme;
            }
        }

        function switchTheme(newTheme) {
            if (!themes[newTheme]) return;

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeSelector(newTheme);

            // Reinitialize mermaid with appropriate theme
            initializeMermaid(newTheme);
        }

        // Initialize theme on load
        const currentTheme = initTheme();

        // Add change event to theme selector
        document.getElementById('themeSelector').addEventListener('change', function(e) {
            switchTheme(e.target.value);
        });

        // Zoom functionality
        let currentZoom = 100;

        function setZoom(scale) {
            document.body.style.transform = 'scale(' + scale + ')';
            document.body.style.transformOrigin = '0 0';
            document.body.style.width = (100 / scale) + '%';
            document.body.style.height = (100 / scale) + '%';
        }

        function updateZoom(zoomLevel) {
            currentZoom = Math.max(50, Math.min(200, zoomLevel));
            const scale = currentZoom / 100;
            setZoom(scale);
            document.getElementById('zoomValue').textContent = currentZoom + '%';
            localStorage.setItem('zoom', currentZoom);
        }

        // Initialize zoom from local storage
        const savedZoom = localStorage.getItem('zoom');
        if (savedZoom) {
            currentZoom = parseInt(savedZoom);
            updateZoom(currentZoom);
        }

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', function() {
            updateZoom(currentZoom + 10);
        });

        document.getElementById('zoomOut').addEventListener('click', function() {
            updateZoom(currentZoom - 10);
        });

        document.getElementById('zoomReset').addEventListener('click', function() {
            updateZoom(100);
        });

        // Keyboard shortcuts for zoom
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    updateZoom(currentZoom + 10);
                } else if (e.key === '-') {
                    e.preventDefault();
                    updateZoom(currentZoom - 10);
                } else if (e.key === '0') {
                    e.preventDefault();
                    updateZoom(100);
                }
            }
        });

        // Initialize mermaid with theme-aware settings
        function initializeMermaid(theme) {
            const themeConfig = themes[theme] || themes.light;
            const mermaidTheme = themeConfig.mermaid;

            const themeVariables = {
                light: {
                    primaryColor: '#3498db',
                    primaryTextColor: '#fff',
                    primaryBorderColor: '#2980b9',
                    lineColor: '#5a6c7d',
                    secondaryColor: '#ecf0f1',
                    tertiaryColor: '#fff'
                },
                dark: {
                    primaryColor: '#61afef',
                    primaryTextColor: '#1a1a1a',
                    primaryBorderColor: '#4b5263',
                    lineColor: '#abb2bf',
                    secondaryColor: '#2d2d2d',
                    tertiaryColor: '#3a3a3a',
                    background: '#1a1a1a',
                    mainBkg: '#61afef',
                    secondBkg: '#56b6c2',
                    tertiaryBkg: '#98c379'
                },
                github: {
                    primaryColor: '#0366d6',
                    primaryTextColor: '#fff',
                    primaryBorderColor: '#0366d6',
                    lineColor: '#586069',
                    secondaryColor: '#f6f8fa'
                },
                dracula: {
                    primaryColor: '#bd93f9',
                    primaryTextColor: '#f8f8f2',
                    primaryBorderColor: '#6272a4',
                    lineColor: '#6272a4',
                    secondaryColor: '#44475a',
                    background: '#282a36'
                },
                nord: {
                    primaryColor: '#88c0d0',
                    primaryTextColor: '#2e3440',
                    primaryBorderColor: '#5e81ac',
                    lineColor: '#4c566a',
                    secondaryColor: '#3b4252',
                    background: '#2e3440'
                },
                solarized: {
                    primaryColor: '#268bd2',
                    primaryTextColor: '#fdf6e3',
                    primaryBorderColor: '#93a1a1',
                    lineColor: '#657b83',
                    secondaryColor: '#eee8d5'
                },
                monokai: {
                    primaryColor: '#66d9ef',
                    primaryTextColor: '#272822',
                    primaryBorderColor: '#75715e',
                    lineColor: '#75715e',
                    secondaryColor: '#3e3d32',
                    background: '#272822'
                }
            };

            // Map themes to their mermaid variable sets
            let variables = themeVariables.light;
            if (theme === 'dark' || theme === 'one-dark') variables = themeVariables.dark;
            else if (theme === 'github') variables = themeVariables.github;
            else if (theme === 'github-dark') variables = { ...themeVariables.github, background: '#0d1117' };
            else if (theme === 'dracula') variables = themeVariables.dracula;
            else if (theme === 'nord') variables = themeVariables.nord;
            else if (theme === 'solarized-light') variables = themeVariables.solarized;
            else if (theme === 'solarized-dark') variables = { ...themeVariables.solarized, background: '#002b36' };
            else if (theme === 'monokai') variables = themeVariables.monokai;

            mermaid.initialize({
                startOnLoad: false,
                theme: mermaidTheme,
                themeVariables: variables
            });
        }

        // Initialize mermaid
        initializeMermaid(currentTheme);

        // Function to open mermaid in new window
        function openMermaidInNewWindow(graphDefinition) {
            const newWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const bgColors = {
                light: 'white',
                dark: '#1a1a1a',
                github: '#ffffff',
                'github-dark': '#0d1117',
                dracula: '#282a36',
                nord: '#2e3440',
                'solarized-light': '#fdf6e3',
                'solarized-dark': '#002b36',
                monokai: '#272822',
                'one-dark': '#282c34'
            };
            const bgColor = bgColors[currentTheme] || 'white';

            const html = '<!' + 'DOCTYPE html>' +
                '<html lang="en">' +
                '<head>' +
                    '<meta charset="UTF-8">' +
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
                    '<title>Mermaid Diagram</title>' +
                    '<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></' + 'script>' +
                    '<style>' +
                        'body {' +
                            'margin: 0;' +
                            'padding: 20px;' +
                            'display: flex;' +
                            'justify-content: center;' +
                            'align-items: center;' +
                            'min-height: 100vh;' +
                            'background: ' + bgColor + ';' +
                            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
                        '}' +
                        '#diagram {' +
                            'max-width: 100%;' +
                            'overflow: auto;' +
                        '}' +
                    '</style>' +
                '</head>' +
                '<body>' +
                    '<div id="diagram" class="mermaid">' + graphDefinition + '</div>' +
                    '<script>' +
                        'const theme = "' + currentTheme + '";' +
                        'const themes = ' + JSON.stringify(themes) + ';' +
                        'const themeConfig = themes[theme] || themes.light;' +
                        'const mermaidTheme = themeConfig.mermaid;' +
                        '' +
                        'const themeVariables = {' +
                            'light: { primaryColor: "#3498db", primaryTextColor: "#fff", primaryBorderColor: "#2980b9", lineColor: "#5a6c7d", secondaryColor: "#ecf0f1", tertiaryColor: "#fff" },' +
                            'dark: { primaryColor: "#61afef", primaryTextColor: "#1a1a1a", primaryBorderColor: "#4b5263", lineColor: "#abb2bf", secondaryColor: "#2d2d2d", tertiaryColor: "#3a3a3a", background: "#1a1a1a", mainBkg: "#61afef", secondBkg: "#56b6c2", tertiaryBkg: "#98c379" },' +
                            'github: { primaryColor: "#0366d6", primaryTextColor: "#fff", primaryBorderColor: "#0366d6", lineColor: "#586069", secondaryColor: "#f6f8fa" },' +
                            'dracula: { primaryColor: "#bd93f9", primaryTextColor: "#f8f8f2", primaryBorderColor: "#6272a4", lineColor: "#6272a4", secondaryColor: "#44475a", background: "#282a36" },' +
                            'nord: { primaryColor: "#88c0d0", primaryTextColor: "#2e3440", primaryBorderColor: "#5e81ac", lineColor: "#4c566a", secondaryColor: "#3b4252", background: "#2e3440" },' +
                            'solarized: { primaryColor: "#268bd2", primaryTextColor: "#fdf6e3", primaryBorderColor: "#93a1a1", lineColor: "#657b83", secondaryColor: "#eee8d5" },' +
                            'monokai: { primaryColor: "#66d9ef", primaryTextColor: "#272822", primaryBorderColor: "#75715e", lineColor: "#75715e", secondaryColor: "#3e3d32", background: "#272822" }' +
                        '};' +
                        '' +
                        'let variables = themeVariables.light;' +
                        'if (theme === "dark" || theme === "one-dark") variables = themeVariables.dark;' +
                        'else if (theme === "github") variables = themeVariables.github;' +
                        'else if (theme === "github-dark") variables = Object.assign({}, themeVariables.github, { background: "#0d1117" });' +
                        'else if (theme === "dracula") variables = themeVariables.dracula;' +
                        'else if (theme === "nord") variables = themeVariables.nord;' +
                        'else if (theme === "solarized-light") variables = themeVariables.solarized;' +
                        'else if (theme === "solarized-dark") variables = Object.assign({}, themeVariables.solarized, { background: "#002b36" });' +
                        'else if (theme === "monokai") variables = themeVariables.monokai;' +
                        '' +
                        'mermaid.initialize({' +
                            'startOnLoad: true,' +
                            'theme: mermaidTheme,' +
                            'themeVariables: variables' +
                        '});' +
                    '</' + 'script>' +
                '</body>' +
                '</html>';

            newWindow.document.write(html);
            newWindow.document.close();
        }

        // Render mermaid diagrams when page loads
        document.addEventListener('DOMContentLoaded', async function() {
            // Apply syntax highlighting
            setTimeout(() => {
                try {
                    Prism.highlightAll();
                } catch (error) {
                    console.error('Error applying syntax highlighting:', error);
                }
            }, 10);

            // Render all mermaid diagrams
            const diagrams = document.querySelectorAll('.mermaid');
            for (let i = 0; i < diagrams.length; i++) {
                const diagram = diagrams[i];
                const graphDefinition = diagram.textContent;
                const id = 'mermaid-' + Date.now() + '-' + i;

                try {
                    const { svg } = await mermaid.render(id, graphDefinition);

                    // Create container with fullscreen button
                    const container = document.createElement('div');
                    container.className = 'mermaid-container';

                    // Add the SVG
                    const svgContainer = document.createElement('div');
                    svgContainer.innerHTML = svg;
                    container.appendChild(svgContainer);

                    // Create fullscreen button
                    const fullscreenBtn = document.createElement('button');
                    fullscreenBtn.className = 'mermaid-fullscreen-btn';
                    fullscreenBtn.innerHTML = '⛶'; // Fullscreen icon
                    fullscreenBtn.title = 'Open in new window';
                    fullscreenBtn.onclick = (e) => {
                        e.stopPropagation();
                        openMermaidInNewWindow(graphDefinition);
                    };
                    container.appendChild(fullscreenBtn);

                    // Replace diagram content with container
                    diagram.innerHTML = '';
                    diagram.appendChild(container);

                } catch (error) {
                    console.error('Error rendering mermaid diagram:', error);
                    diagram.innerHTML = '<div style="color: #e74c3c; padding: 20px; background: #ffecec; border-radius: 5px;">Error rendering diagram: ' + error.message + '</div>';
                }
            }
        });
    </script>
</body>
</html>`;

    return html;
}