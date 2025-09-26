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
    formatSize,
    injectWebSocketClient
} = require('./utils');
const {
    generateHtmlFromMarkdown,
    generateIndexHtmlWithSearch,
    generateFolderIndex
} = require('./html-generator');

/**
 * Start HTTP server for folder mode
 */
async function startFolderServer(folderPath, isTemp = false, selectedTheme = null) {
    const baseDir = path.resolve(folderPath);

    // Track active WebSocket connections for cleanup
    let activeConnections = new Set();
    let inactivityTimer = null;

    // For temp directories, auto-cleanup after no connections
    const INACTIVITY_TIMEOUT = isTemp ? 10000 : 0; // 10 seconds after last connection closes

    const checkForCleanup = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);

        if (isTemp && activeConnections.size === 0) {
            console.log('🔌 All connections closed');
            inactivityTimer = setTimeout(() => {
                console.log('⏰ No connections for 10 seconds, shutting down...');
                if (wss) wss.close();
                server.close();
                process.exit(0);
            }, INACTIVITY_TIMEOUT);
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
            let indexHtml = generateIndexHtmlWithSearch(baseDir, mdFiles, port, selectedTheme);

            // Inject WebSocket client code for temp mode
            if (isTemp) {
                indexHtml = injectWebSocketClient(indexHtml, isTemp);
            }

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
                let html = generateHtmlFromMarkdown(markdown, path.basename(filePath), false, true, selectedTheme);

                // Inject WebSocket client code for temp mode
                if (isTemp) {
                    html = injectWebSocketClient(html, isTemp);
                }

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

            const mdFiles = findMarkdownFiles(baseDir);
            const results = [];

            if (searchMode === 'content') {
                // Search file contents
                for (const file of mdFiles) {
                    const filePath = path.join(baseDir, file);
                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
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
    if (isTemp) {
        wss = new WebSocket.Server({ server });

        wss.on('connection', (ws) => {
            const clientId = Date.now() + Math.random();
            activeConnections.add(clientId);
            console.log(`🔗 Browser connected (${activeConnections.size} active connection${activeConnections.size !== 1 ? 's' : ''})`);

            // Clear any pending cleanup timer
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
                inactivityTimer = null;
            }

            ws.on('close', () => {
                activeConnections.delete(clientId);
                console.log(`🔌 Browser disconnected (${activeConnections.size} active connection${activeConnections.size !== 1 ? 's' : ''})`);
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
    }

    server.listen(port, () => {
        console.log(`🚀 Moremaid v${config.version} server running at http://localhost:${port}`);
        console.log(`📁 Serving ${isTemp ? 'extracted' : 'markdown'} files from: ${isTemp ? 'temporary directory' : baseDir}`);
        if (isTemp) {
            console.log('🔌 Auto-cleanup enabled when browser closes');
        }
        console.log('Press Ctrl+C to stop the server');

        // Open browser
        openInBrowser(`http://localhost:${port}`);
    });

    server.on('error', (err) => {
        console.error('Server error:', err);
        process.exit(1);
    });

    // Handle graceful shutdown (only for non-temp servers)
    if (!isTemp) {
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

    return server;
}

module.exports = {
    startFolderServer
};