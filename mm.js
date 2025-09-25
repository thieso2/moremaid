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
  -h, --help     Show this help message
  -v, --version  Show version number

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

// Get the input file or folder (first non-flag argument)
const inputPath = args.find(arg => !arg.startsWith('-'));

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
    const html = generateHtmlFromMarkdown(markdown, title, false, false);

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

            const indexMarkdown = generateFolderIndex(baseDir, mdFiles, port);
            const indexHtml = generateHtmlFromMarkdown(indexMarkdown, `Index of ${path.basename(baseDir) || 'Directory'}`, true, true);

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
                const html = generateHtmlFromMarkdown(markdown, path.basename(filePath), false, true);

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
function generateHtmlFromMarkdown(markdown, title, isIndex, isServer) {
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

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: white;
            padding: 30px;
            line-height: 1.6;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        h1 {
            color: #2c3e50;
            border-bottom: 2px solid #ecf0f1;
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        h2 {
            color: #34495e;
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 1px solid #ecf0f1;
            padding-bottom: 5px;
        }

        h3 {
            color: #34495e;
            margin-top: 20px;
            margin-bottom: 10px;
        }

        code:not([class*="language-"]) {
            background: #f4f4f4;
            padding: 2px 5px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            color: #d14;
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
            border: 1px solid #ddd;
            padding: 10px;
            text-align: left;
        }

        table th {
            background: #f0f0f0;
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
            border-left: 4px solid #3498db;
            padding-left: 20px;
            margin: 20px 0;
            color: #555;
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
            background: rgba(52, 73, 94, 0.8);
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
            background: rgba(52, 73, 94, 1);
        }

        a {
            color: #3498db;
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
            background: #f5f5f5;
            padding: 10px 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #666;
        }

        .nav-bar {
            margin-bottom: 20px;
        }

        .nav-bar a {
            text-decoration: none;
            color: #3498db;
            font-size: 14px;
        }

        .nav-bar a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        ${isServer && !isIndex ? '<div class="nav-bar"><a href="/">← Back to index</a></div>' : ''}
        <div class="file-info">
            ${isIndex ? '📁' : '📄'} ${title} • Generated on ${new Date().toLocaleString()}
        </div>
        ${htmlContent}
    </div>

    <script>
        // Initialize mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            themeVariables: {
                primaryColor: '#3498db',
                primaryTextColor: '#fff',
                primaryBorderColor: '#2980b9',
                lineColor: '#5a6c7d',
                secondaryColor: '#ecf0f1',
                tertiaryColor: '#fff'
            }
        });

        // Function to open mermaid in new window
        function openMermaidInNewWindow(graphDefinition) {
            const newWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');

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
                            'background: white;' +
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
                        'mermaid.initialize({' +
                            'startOnLoad: true,' +
                            'theme: "default",' +
                            'themeVariables: {' +
                                'primaryColor: "#3498db",' +
                                'primaryTextColor: "#fff",' +
                                'primaryBorderColor: "#2980b9",' +
                                'lineColor: "#5a6c7d",' +
                                'secondaryColor: "#ecf0f1",' +
                                'tertiaryColor: "#fff"' +
                            '}' +
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