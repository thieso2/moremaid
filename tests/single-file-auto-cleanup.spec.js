const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');

// Helper to check if server is running
async function isServerRunning(port) {
    return new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
            resolve(true);
        });
        req.on('error', () => {
            resolve(false);
        });
        req.setTimeout(100, () => {
            req.destroy();
            resolve(false);
        });
    });
}

// Helper to start the server for a single file (without --keep-running)
async function startServerForSingleFile(filePath, port) {
    return new Promise((resolve, reject) => {
        const serverProcess = spawn('node', [
            path.join(__dirname, '../mm.js'),
            filePath
        ], {
            env: { ...process.env, PORT: port.toString() },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let serverReady = false;
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('Server output:', output);
            if (output.includes('server running at')) {
                serverReady = true;
                resolve(serverProcess);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error('Server error:', data.toString());
        });

        serverProcess.on('error', reject);

        // Timeout after 10 seconds
        setTimeout(() => {
            if (!serverReady) {
                serverProcess.kill();
                reject(new Error('Server failed to start within 10 seconds'));
            }
        }, 10000);
    });
}

test.describe('Single File Mode WebSocket Connection', () => {
    let testFile;

    test.beforeAll(async () => {
        // Create a temporary test markdown file
        testFile = path.join(__dirname, 'temp-single-file-test.md');
        fs.writeFileSync(testFile, `
# Single File Test

This is a test file for verifying WebSocket in single file mode.

## Code Example

\`\`\`javascript
console.log("Testing WebSocket connection");
\`\`\`
        `);
    });

    test.afterAll(async () => {
        // Clean up test file
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    test('should establish WebSocket connection in single file mode', async ({ page }, testInfo) => {
        // Use unique port for each worker/browser
        const port = 8910 + testInfo.workerIndex;

        console.log('Starting server for WebSocket connection test on port', port);
        const serverProcess = await startServerForSingleFile(testFile, port);

        // Wait a bit for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Navigating to page...');

        // Listen to console messages BEFORE navigating
        const consoleLogs = [];
        page.on('console', msg => {
            const text = msg.text();
            consoleLogs.push(text);
            if (text.includes('WebSocket')) {
                console.log('Browser console:', text);
            }
        });

        await page.goto(`http://localhost:${port}/view?file=temp-single-file-test.md`);
        await page.waitForLoadState('networkidle');

        // Wait for WebSocket connection
        await page.waitForTimeout(2000);

        // Check that WebSocket is available in page context
        const wsExists = await page.evaluate(() => {
            return window.ws !== null && window.ws !== undefined;
        });
        expect(wsExists).toBe(true);

        // Check WebSocket state
        const wsState = await page.evaluate(() => {
            return window.ws ? window.ws.readyState : -1;
        });
        // WebSocket.OPEN === 1
        expect(wsState).toBe(1);

        console.log('WebSocket connection confirmed');

        // Close page and clean up
        await page.close();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Clean up process
        if (!serverProcess.killed) {
            serverProcess.kill();
        }
    });
});
