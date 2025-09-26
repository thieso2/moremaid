/**
 * Utility functions
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const net = require('net');

/**
 * Recursively find markdown files in a directory
 */
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

/**
 * Prompt for password with hidden input
 */
function promptPassword(query) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;
        const output = process.stdout;

        // For non-TTY (piped input), read normally
        if (!output.isTTY || !input.isTTY) {
            const rl = readline.createInterface({ input, output });
            // Write prompt to stderr so it shows even with piped input
            process.stderr.write(query);
            rl.question('', (answer) => {
                rl.close();
                resolve(answer);
            });
            return;
        }

        // For TTY, hide the input
        output.write(query);

        // Turn off echo by setting raw mode
        if (!input.setRawMode) {
            // Fallback if setRawMode is not available
            const rl = readline.createInterface({ input, output });
            rl.question('', (answer) => {
                rl.close();
                resolve(answer);
            });
            return;
        }

        input.setRawMode(true);
        input.resume();

        let password = '';

        const onData = (chunk) => {
            const char = chunk.toString('utf8');

            // Handle Enter/Return
            if (char === '\r' || char === '\n') {
                output.write('\n');
                cleanup();
                resolve(password);
                return;
            }

            // Handle Ctrl+C
            if (char === '\u0003') {
                cleanup();
                process.exit(0);
                return;
            }

            // Handle Backspace or Delete
            if (char === '\u0008' || char === '\u007F') {
                if (password.length > 0) {
                    password = password.slice(0, -1);
                    output.write('\b \b');
                }
                return;
            }

            // Ignore other control characters
            if (char < ' ' || char > '~') return;

            // Append character (don't show anything)
            password += char;
        };

        const cleanup = () => {
            input.removeListener('data', onData);
            input.pause();
            if (input.setRawMode) {
                input.setRawMode(false);
            }
        };

        input.on('data', onData);
    });
}

/**
 * Find an available port starting from the given port
 */
function findAvailablePort(startPort = 8080, maxAttempts = 10) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const tryPort = () => {
            if (attempts >= maxAttempts) {
                reject(new Error(`Could not find available port after ${maxAttempts} attempts`));
                return;
            }

            const port = startPort + attempts;
            const server = net.createServer();

            server.listen(port, () => {
                server.close(() => {
                    resolve(port);
                });
            });

            server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    attempts++;
                    tryPort();
                } else {
                    reject(err);
                }
            });
        };

        tryPort();
    });
}

/**
 * Open file/URL in default browser based on platform
 */
function openInBrowser(target) {
    const { exec } = require('child_process');

    const openCommand = process.platform === 'darwin' ? 'open' :
                       process.platform === 'win32' ? 'start' :
                       'xdg-open';

    exec(`${openCommand} "${target}"`, (error) => {
        if (error) {
            console.error('Error opening in browser:', error);
        }
    });
}

/**
 * Format file size in human readable format
 */
function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

/**
 * Inject WebSocket client code for connection tracking
 */
function injectWebSocketClient(html, isTemp) {
    if (!isTemp) return html;

    const wsClientCode = `
<script>
(function() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + window.location.host);

    ws.onopen = function() {
        console.log('Connected to server for cleanup tracking');
    };

    ws.onclose = function() {
        console.log('Disconnected from server');
    };

    ws.onerror = function(error) {
        console.log('WebSocket error:', error);
    };

    // Respond to ping with pong
    ws.onmessage = function(event) {
        if (event.data === 'ping') {
            ws.send('pong');
        }
    };

    // Keep connection alive
    setInterval(function() {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('heartbeat');
        }
    }, 30000);
})();
</script>
`;

    // Only replace the last </body> tag, not ones inside JavaScript strings
    const lastBodyIndex = html.lastIndexOf('</body>');
    if (lastBodyIndex !== -1) {
        html = html.slice(0, lastBodyIndex) + wsClientCode + html.slice(lastBodyIndex);
    }

    return html;
}

module.exports = {
    findMarkdownFiles,
    promptPassword,
    findAvailablePort,
    openInBrowser,
    formatSize,
    injectWebSocketClient
};