const { test, expect } = require('@playwright/test');
const path = require('path');
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

// Helper to start the server for a directory
async function startServerForDirectory(dirPath, port) {
    return new Promise((resolve, reject) => {
        const serverProcess = spawn('node', [
            path.join(__dirname, '../mm.js'),
            dirPath
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

test.describe('Directory Mode File Window Auto-Close', () => {
    test('should close file windows opened with Ctrl+click when server stops', async ({ page, context }, testInfo) => {
        const port = 8940 + testInfo.workerIndex;
        const testDir = path.join(__dirname, '../samples');

        console.log('Starting server for directory mode test on port', port);
        const serverProcess = await startServerForDirectory(testDir, port);

        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Navigating to directory browser...');
        await page.goto(`http://localhost:${port}/`);
        await page.waitForLoadState('networkidle');

        // Wait for file list to appear
        await page.waitForSelector('.file-item', { timeout: 5000 });
        console.log('File list loaded');

        // Track console logs
        const consoleLogs = [];
        page.on('console', msg => {
            const text = msg.text();
            consoleLogs.push(text);
            console.log('Browser console:', text);
        });

        // Get initial page count
        const pagesBefore = context.pages().length;
        console.log('Pages before opening file:', pagesBefore);

        // Get first file item
        const firstFile = page.locator('.file-item').first();
        await expect(firstFile).toBeVisible();

        // Listen for new page/window opening
        const newPagePromise = context.waitForEvent('page');

        // Ctrl+click to open in new window (use Meta key on Mac, Control on others)
        const isMac = process.platform === 'darwin';
        await firstFile.click({ modifiers: [isMac ? 'Meta' : 'Control'] });
        console.log('Ctrl+clicked file');

        // Wait for the new window to open
        const fileWindow = await newPagePromise;
        await fileWindow.waitForLoadState('load');
        console.log('File window opened');

        // Verify we have 2 windows open
        const pagesAfter = context.pages().length;
        console.log('Pages after opening file:', pagesAfter);
        expect(pagesAfter).toBe(pagesBefore + 1);

        // Check that file window is tracked in main window
        const childWindowsTracked = await page.evaluate(() => {
            return window.childWindows ? window.childWindows.length : 0;
        });
        console.log('Child windows tracked:', childWindowsTracked);
        expect(childWindowsTracked).toBe(1);

        // Now kill the server to trigger WebSocket disconnect
        console.log('Stopping server...');
        serverProcess.kill();

        // Wait for server to stop
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify server is not running
        const serverRunning = await isServerRunning(port);
        expect(serverRunning).toBe(false);
        console.log('Server stopped');

        // Wait a bit for the auto-close to happen
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check if file window is closed
        const fileWindowClosed = fileWindow.isClosed();
        console.log('File window closed:', fileWindowClosed);
        expect(fileWindowClosed).toBe(true);

        console.log('Test completed successfully - file window closed when server stopped!');
    });

    test('should close multiple file windows', async ({ page, context }, testInfo) => {
        const port = 8950 + testInfo.workerIndex;
        const testDir = path.join(__dirname, '../samples');

        console.log('Starting server for multiple file windows test on port', port);
        const serverProcess = await startServerForDirectory(testDir, port);

        await new Promise(resolve => setTimeout(resolve, 1500));

        await page.goto(`http://localhost:${port}/`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.file-item', { timeout: 5000 });

        const fileItems = page.locator('.file-item');
        const fileCount = await fileItems.count();
        console.log('File items found:', fileCount);
        expect(fileCount).toBeGreaterThanOrEqual(2);

        // Open first file window
        const newPage1Promise = context.waitForEvent('page');
        const isMac = process.platform === 'darwin';
        await fileItems.first().click({ modifiers: [isMac ? 'Meta' : 'Control'] });
        const fileWindow1 = await newPage1Promise;
        await fileWindow1.waitForLoadState('load');
        console.log('First file window opened');

        // Open second file window
        const newPage2Promise = context.waitForEvent('page');
        await fileItems.nth(1).click({ modifiers: [isMac ? 'Meta' : 'Control'] });
        const fileWindow2 = await newPage2Promise;
        await fileWindow2.waitForLoadState('load');
        console.log('Second file window opened');

        // Verify 2 file windows are tracked
        const childWindowsTracked = await page.evaluate(() => {
            return window.childWindows ? window.childWindows.length : 0;
        });
        console.log('Child windows tracked:', childWindowsTracked);
        expect(childWindowsTracked).toBe(2);

        // Kill the server
        console.log('Stopping server...');
        serverProcess.kill();
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check if both file windows are closed
        expect(fileWindow1.isClosed()).toBe(true);
        expect(fileWindow2.isClosed()).toBe(true);

        console.log('All file windows closed successfully!');
    });
});
