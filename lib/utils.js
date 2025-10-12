/**
 * Utility functions
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const net = require('net');
const ignore = require('ignore');

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
 * Load gitignore patterns from a directory
 * @param {string} baseDir - Base directory to search for .gitignore
 * @returns {object} - ignore instance with loaded patterns
 */
function loadGitignore(baseDir) {
    const ig = ignore();

    // Always ignore these patterns
    ig.add(['.git', 'node_modules']);

    // Try to load .gitignore file
    const gitignorePath = path.join(baseDir, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        try {
            const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
            ig.add(gitignoreContent);
        } catch (e) {
            // Ignore errors reading .gitignore
        }
    }

    return ig;
}

/**
 * Check if a file matches a glob pattern
 * @param {string} filePath - File path to check
 * @param {string} pattern - Glob pattern (*.md or *)
 * @returns {boolean} - Whether the file matches the pattern
 */
function matchesPattern(filePath, pattern) {
    const fileName = path.basename(filePath);

    if (pattern === '*') {
        return true;
    }

    if (pattern === '*.md') {
        return fileName.match(/\.(md|markdown)$/i) !== null;
    }

    // Handle other patterns with simple wildcard matching
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

    const regex = new RegExp('^' + regexPattern + '$', 'i');
    return regex.test(fileName);
}

module.exports = {
    findMarkdownFiles,
    promptPassword,
    findAvailablePort,
    openInBrowser,
    formatSize,
    loadGitignore,
    matchesPattern
};