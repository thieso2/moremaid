/**
 * Server functionality for folder mode
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const MiniSearch = require('minisearch');
const { exec } = require('child_process');

const config = require('./config');
const {
    findMarkdownFiles,
    findAvailablePort,
    openInBrowser,
    formatSize
} = require('./utils');
const {
    generateHtmlFromMarkdown,
    generateIndexHtmlWithSearch,
    generateFolderIndex,
    generateCodeView
} = require('./html-generator');
const { DiskFS, SingleFileFS } = require('./virtual-fs');

/**
 * Start HTTP server for folder mode
 * @param {string|VirtualFS} folderPathOrFS - Either a folder path or a VirtualFS instance
 * @param {boolean} isTemp - Whether this is a temporary server (for archives)
 * @param {string|null} selectedTheme - Selected theme
 * @param {boolean} keepRunning - Whether to keep server running after browser closes
 * @param {string|null} specificFile - Optional specific file to open directly
 */
async function startFolderServer(folderPathOrFS, isTemp = false, selectedTheme = null, keepRunning = false, specificFile = null) {
    // Determine if we're using a VirtualFS or disk path
    let virtualFS;
    let baseDir;

    if (typeof folderPathOrFS === 'string') {
        // Create DiskFS for regular folder mode
        baseDir = path.resolve(folderPathOrFS);
        virtualFS = new DiskFS(baseDir);
    } else {
        // Use provided VirtualFS (for ZIP mode)
        virtualFS = folderPathOrFS;
        baseDir = virtualFS.getBasePath();
    }

    // Track active WebSocket connections for cleanup
    let activeConnections = new Set();
    let inactivityTimer = null;

    // Determine if auto-cleanup should be enabled
    // In single file mode, always enable auto-cleanup regardless of --keep-running flag
    const isSingleFileMode = virtualFS instanceof SingleFileFS;
    const autoCleanup = isSingleFileMode || !keepRunning;

    const checkForCleanup = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);

        if (autoCleanup && activeConnections.size === 0) {
            // Wait a bit before cleanup to allow for page reloads
            console.log('🔌 Browser disconnected, waiting for reconnection...');
            inactivityTimer = setTimeout(() => {
                // Check again if still no connections
                if (activeConnections.size === 0) {
                    console.log('⏰ No reconnection, shutting down...');
                    if (wss) wss.close();
                    server.close();
                    process.exit(0);
                }
            }, 500); // 500ms grace period for reloads
        }
    };

    // Try to find an available port
    let port;
    try {
        const startPort = process.env.PORT ? parseInt(process.env.PORT) : config.server.defaultPort;
        port = await findAvailablePort(startPort, config.server.maxPortAttempts);
    } catch (error) {
        console.error('❌ Could not find an available port');
        console.error('Try specifying a different port: PORT=9000 mm ' + folderPath);
        process.exit(1);
    }

    const server = http.createServer(async (req, res) => {
        const parsedUrl = new URL(req.url, `http://localhost:${port}`);
        const pathname = parsedUrl.pathname;

        if (pathname === '/' || pathname === '/index') {
            // Serve index page
            let filter = parsedUrl.searchParams.get('filter') || '*.md';
            let files = virtualFS.listFiles(filter);

            // If no files found with *.md filter, automatically switch to all files
            if (files.length === 0 && filter === '*.md') {
                filter = '*';
                files = virtualFS.listFiles(filter);

                // If still no files, show error
                if (files.length === 0) {
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
<body data-typography="default">
    <div class="container">
        <h1>📂 No Files Found</h1>
        <p>No files were found in:</p>
        <div class="path">${baseDir}</div>
    </div>
</body>
</html>`);
                    return;
                }
            }

            // If only one file, redirect directly to it
            if (files.length === 1) {
                res.writeHead(302, { 'Location': `/view?file=${encodeURIComponent(files[0])}` });
                res.end();
                return;
            }

            if (files.length === 0) {
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
<body data-typography="default">
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
            const indexHtml = await generateIndexHtmlWithSearch(baseDir, files, port, selectedTheme, filter, virtualFS);

            res.writeHead(200, {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            });
            res.end(indexHtml);

        } else if (pathname === '/view') {
            // Serve individual file (markdown or other)
            const file = parsedUrl.searchParams.get('file');
            const searchQuery = parsedUrl.searchParams.get('search') || null;
            if (!file) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>No file specified</h1>');
                return;
            }

            try {
                // Check if file exists
                if (!await virtualFS.exists(file)) {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end('<h1>File not found</h1>');
                    return;
                }

                // Read file from VirtualFS
                const content = await virtualFS.readFile(file);
                const fileName = path.basename(file);

                // Get file stats (last modified, size)
                const fileStats = await virtualFS.getFileStats(file);

                // Check if file is markdown
                const isMarkdown = fileName.match(/\.(md|markdown)$/i);

                let html;
                if (isMarkdown) {
                    html = generateHtmlFromMarkdown(content, fileName, false, true, selectedTheme, searchQuery, fileStats);
                } else {
                    // Generate syntax-highlighted code view
                    // Hide back button in single file mode or when opened directly via specificFile
                    const showBackButton = !isSingleFileMode && !specificFile;
                    html = generateCodeView(content, fileName, selectedTheme, showBackButton, fileStats);
                }

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Error reading file: ${error.message}</h1>`);
            }

        } else if (pathname === '/api/file') {
            // Handle raw markdown file requests
            const filePath = parsedUrl.searchParams.get('path');
            if (!filePath) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('No file path specified');
                return;
            }

            try {
                // Check if file exists
                if (!await virtualFS.exists(filePath)) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File not found');
                    return;
                }

                // Read file from VirtualFS
                const markdown = await virtualFS.readFile(filePath);

                res.writeHead(200, {
                    'Content-Type': 'text/plain; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(markdown);
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Error reading file: ${error.message}`);
            }

        } else if (pathname === '/api/search') {
            // Handle content search requests
            const query = parsedUrl.searchParams.get('q');
            const searchMode = parsedUrl.searchParams.get('mode') || 'filename'; // 'filename' or 'content'
            const filter = parsedUrl.searchParams.get('filter') || '*.md';

            if (!query) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No search query provided' }));
                return;
            }

            // Use the filter to determine which files to search
            const filesToSearch = virtualFS.listFiles(filter);
            const results = [];

            if (searchMode === 'content') {
                // If VirtualFS has built-in search, use it
                if (virtualFS.searchInFiles) {
                    const searchResults = await virtualFS.searchInFiles(query, filter);
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify(searchResults));
                    return;
                }

                // Otherwise, search file contents manually
                for (const file of filesToSearch) {
                    try {
                        const content = await virtualFS.readFile(file);
                        const lines = content.split('\n');
                        const matches = [];

                        // Find matching lines with context
                        lines.forEach((line, index) => {
                            if (line.toLowerCase().includes(query.toLowerCase())) {
                                // Get context: previous line, matching line, and next line
                                const contextLines = [];

                                // Previous line
                                if (index > 0) {
                                    contextLines.push({
                                        lineNumber: index,
                                        text: lines[index - 1].trim().substring(0, 200),
                                        isMatch: false
                                    });
                                }

                                // Matching line
                                contextLines.push({
                                    lineNumber: index + 1,
                                    text: line.trim().substring(0, 200),
                                    isMatch: true
                                });

                                // Next line
                                if (index < lines.length - 1) {
                                    contextLines.push({
                                        lineNumber: index + 2,
                                        text: lines[index + 1].trim().substring(0, 200),
                                        isMatch: false
                                    });
                                }

                                matches.push({
                                    lineNumber: index + 1,
                                    text: line.trim().substring(0, 200), // Keep for backward compatibility
                                    contextLines: contextLines
                                });
                            }
                        });

                        if (matches.length > 0) {
                            results.push({
                                path: file,
                                fileName: path.basename(file),
                                directory: path.dirname(file) === '.' ? '' : path.dirname(file),
                                matches: matches.slice(0, 5) // Limit to first 5 matches
                            });
                        }
                    } catch (error) {
                        // Skip files that can't be read
                        console.error(`Error reading ${file}:`, error.message);
                    }
                }
            } else {
                // Search filenames (fallback)
                for (const file of filesToSearch) {
                    if (file.toLowerCase().includes(query.toLowerCase())) {
                        results.push({
                            path: file,
                            fileName: path.basename(file),
                            directory: path.dirname(file) === '.' ? '' : path.dirname(file)
                        });
                    }
                }
            }

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(results));

        } else if (pathname === '/api/pdf') {
            // Handle PDF generation requests
            const filePath = parsedUrl.searchParams.get('path');
            if (!filePath) {
                res.writeHead(400, { 'Content-Type': 'text/plain' });
                res.end('No file path specified');
                return;
            }

            try {
                // Check if file exists
                if (!await virtualFS.exists(filePath)) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File not found');
                    return;
                }

                // Read markdown file
                const markdown = await virtualFS.readFile(filePath);
                const fileName = path.basename(filePath);

                // Get file stats for modification time display
                const fileStats = await virtualFS.getFileStats(filePath);

                // Generate HTML from markdown
                const html = generateHtmlFromMarkdown(markdown, fileName, false, true, selectedTheme, null, fileStats);

                // Add CSS to hide UI elements in PDF
                const htmlWithHiddenUI = html.replace(
                    '</head>',
                    `<style>
                        .file-buttons-container,
                        .copy-file-btn,
                        .download-pdf-btn,
                        .file-info,
                        #settingsButton,
                        .controls {
                            display: none !important;
                        }
                    </style>
                    </head>`
                );

                // Launch Puppeteer and generate PDF
                const puppeteer = require('puppeteer');
                const browser = await puppeteer.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });

                try {
                    const page = await browser.newPage();
                    await page.setContent(htmlWithHiddenUI, { waitUntil: 'networkidle2' });

                    // Generate PDF with reasonable defaults and footer
                    const cleanFileName = fileName.replace(/\\.md$/, '');
                    const pdfBuffer = await page.pdf({
                        format: 'A4',
                        margin: {
                            top: '20mm',
                            right: '20mm',
                            bottom: '25mm',
                            left: '20mm'
                        },
                        printBackground: true,
                        footerTemplate: `
                            <div style="width: 100%; font-size: 10px; padding: 0 20mm; display: flex; justify-content: space-between; align-items: center;">
                                <span>${cleanFileName}</span>
                                <span><span class="pageNumber"></span> of <span class="totalPages"></span></span>
                            </div>
                        `,
                        displayHeaderFooter: true
                    });

                    res.writeHead(200, {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': 'attachment; filename="' + fileName.replace(/\\.md$/, '.pdf') + '"',
                        'Content-Length': pdfBuffer.length,
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(pdfBuffer);
                } finally {
                    await browser.close();
                }
            } catch (error) {
                console.error('PDF generation error:', error);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Error generating PDF: ${error.message}`);
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
        h1 { color: #e74c3c; }
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
<body data-typography="default">
    <div class="container">
        <h1>404 - Page Not Found</h1>
        <p>The requested path "${pathname}" was not found.</p>
        <a href="#" onclick="history.back(); return false;">← Back to Index</a>
    </div>
</body>
</html>`);
        }
    });

    // Create WebSocket server for connection tracking
    let wss = null;
    wss = new WebSocket.Server({ server, path: '/ws' });

    wss.on('connection', (ws, req) => {
        const clientId = Date.now() + Math.random();
        activeConnections.add(clientId);
        console.log(`🔗 Browser connected (${activeConnections.size} total connections) from ${req.headers.origin || 'unknown'}`);

        // Clear any pending cleanup timer
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        ws.on('close', () => {
            activeConnections.delete(clientId);
            if (activeConnections.size > 0) {
                console.log(`🔌 Browser disconnected (${activeConnections.size} active connection${activeConnections.size !== 1 ? 's' : ''})`);
            }
            // The cleanup function will handle the messaging for temp servers
            checkForCleanup();
        });

        ws.on('error', () => {
            activeConnections.delete(clientId);
            checkForCleanup();
        });

        // Send ping every 30 seconds to keep connection alive
        const pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.ping();
            } else {
                clearInterval(pingInterval);
            }
        }, 30000);

        ws.on('close', () => {
            clearInterval(pingInterval);
        });
    });

    server.listen(port, () => {
        console.log(`🚀 Moremaid v${config.version} server running at http://localhost:${port}`);
        console.log(`📁 Serving ${isTemp ? 'archive' : 'markdown'} files from: ${virtualFS.isVirtual() ? 'memory (ZIP)' : baseDir}`);
        if (autoCleanup) {
            if (isSingleFileMode) {
                console.log('🔌 Auto-cleanup enabled (single file mode - closes when browser disconnects)');
            } else {
                console.log('🔌 Auto-cleanup enabled (closes when browser disconnects)');
            }
        } else {
            console.log('♾️  Server will keep running (--keep-running flag)');
        }
        if (virtualFS.isVirtual()) {
            console.log('📈 In-memory serving (no temp files)');
        }
        console.log('Press Ctrl+C to stop the server');

        // Open browser
        const browserUrl = specificFile
            ? `http://localhost:${port}/view?file=${encodeURIComponent(specificFile)}`
            : `http://localhost:${port}`;
        openInBrowser(browserUrl);
    });

    server.on('error', (err) => {
        console.error('Server error:', err);
        process.exit(1);
    });

    // Handle graceful shutdown
    let isShuttingDown = false;
    const shutdown = async () => {
        if (isShuttingDown) {
            // Force immediate exit on second Ctrl+C
            process.exit(0);
        }
        isShuttingDown = true;
        console.log('\n👋 Stopping server...');

        // Close VirtualFS if needed
        if (virtualFS && virtualFS.close) {
            try {
                await virtualFS.close();
                if (virtualFS.isVirtual()) {
                    console.log('📦 Archive closed');
                }
            } catch (e) {
                // Ignore close errors
            }
        }

        server.close(() => {
            process.exit(0);
        });

        // Force exit after 1 second if server doesn't close
        setTimeout(() => {
            process.exit(0);
        }, 1000);
    };

    // Always allow manual shutdown with Ctrl+C
    process.on('SIGINT', shutdown);

    return server;
}

module.exports = {
    startFolderServer
};