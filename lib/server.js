/**
 * Server functionality for folder mode
 */

const http = require('http');
const url = require('url');
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
    generateFolderIndex
} = require('./html-generator');
const { DiskFS } = require('./virtual-fs');

/**
 * Start HTTP server for folder mode
 * @param {string|VirtualFS} folderPathOrFS - Either a folder path or a VirtualFS instance
 * @param {boolean} isTemp - Whether this is a temporary server (for archives)
 * @param {string|null} selectedTheme - Selected theme
 */
async function startFolderServer(folderPathOrFS, isTemp = false, selectedTheme = null) {
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

    // For temp directories, auto-cleanup after no connections
    const INACTIVITY_TIMEOUT = isTemp ? 10000 : 0; // 10 seconds after last connection closes

    const checkForCleanup = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);

        if (isTemp && activeConnections.size === 0) {
            // Immediate cleanup when all connections are closed
            if (wss) wss.close();
            server.close();
            process.exit(0);
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
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        if (pathname === '/' || pathname === '/index') {
            // Serve index page
            const mdFiles = virtualFS.listMarkdownFiles();

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

            try {
                // Check if file exists
                if (!await virtualFS.exists(file)) {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    res.end('<h1>File not found</h1>');
                    return;
                }

                // Read file from VirtualFS
                const markdown = await virtualFS.readFile(file);
                const html = generateHtmlFromMarkdown(markdown, path.basename(file), false, true, selectedTheme);

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Error reading file: ${error.message}</h1>`);
            }

        } else if (pathname === '/api/search') {
            // Handle content search requests
            const query = parsedUrl.query.q;
            const searchMode = parsedUrl.query.mode || 'filename'; // 'filename' or 'content'

            if (!query) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No search query provided' }));
                return;
            }

            const mdFiles = virtualFS.listMarkdownFiles();
            const results = [];

            if (searchMode === 'content') {
                // If VirtualFS has built-in search, use it
                if (virtualFS.searchInFiles) {
                    const searchResults = await virtualFS.searchInFiles(query);
                    res.writeHead(200, {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(JSON.stringify(searchResults));
                    return;
                }

                // Otherwise, search file contents manually
                for (const file of mdFiles) {
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
                for (const file of mdFiles) {
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

    wss.on('connection', (ws) => {
        const clientId = Date.now() + Math.random();
        activeConnections.add(clientId);
        console.log(`🔗 Browser connected`);

        // Clear any pending cleanup timer
        if (inactivityTimer) {
            clearTimeout(inactivityTimer);
            inactivityTimer = null;
        }

        ws.on('close', () => {
            activeConnections.delete(clientId);
            if (activeConnections.size === 0 && isTemp) {
                console.log('🔌 Browser disconnected, shutting down...');
            } else if (activeConnections.size > 0) {
                console.log(`🔌 Browser disconnected (${activeConnections.size} active connection${activeConnections.size !== 1 ? 's' : ''})`);
            }
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
        if (isTemp) {
            console.log('🔌 Auto-cleanup enabled when browser closes');
            if (virtualFS.isVirtual()) {
                console.log('📈 In-memory serving (no temp files)');
            }
        }
        console.log('Press Ctrl+C to stop the server');

        // Open browser
        openInBrowser(`http://localhost:${port}`);
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

    if (!isTemp) {
        process.on('SIGINT', shutdown);
    }

    return server;
}

module.exports = {
    startFolderServer
};