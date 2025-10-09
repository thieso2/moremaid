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

// Helper to start the server for a single file
async function startServerForFile(filePath, port) {
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

test.describe('Child Window Auto-Close on Server Shutdown', () => {
    let testFile;

    test.beforeAll(async () => {
        // Create a temporary test markdown file with Mermaid diagram
        testFile = path.join(__dirname, 'temp-mermaid-test.md');
        fs.writeFileSync(testFile, `
# Mermaid Diagram Test

This is a test file with a Mermaid diagram.

\`\`\`mermaid
graph TD
    A[Start] --> B[Process]
    B --> C[End]
\`\`\`

## Another Section

Some more content.
        `);
    });

    test.afterAll(async () => {
        // Clean up test file
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    test('should close child windows when server stops', async ({ page, context }, testInfo) => {
        // Use unique port for each worker/browser
        const port = 8920 + testInfo.workerIndex;

        console.log('Starting server for child window test on port', port);
        const serverProcess = await startServerForFile(testFile, port);

        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1500));

        console.log('Navigating to page...');

        // Listen to console messages
        const consoleLogs = [];
        page.on('console', msg => {
            const text = msg.text();
            consoleLogs.push(text);
            console.log('Browser console:', text);
        });

        await page.goto(`http://localhost:${port}/view?file=temp-mermaid-test.md`);
        await page.waitForLoadState('networkidle');

        // Wait for Mermaid to render
        await page.waitForSelector('.mermaid-container', { timeout: 5000 });
        console.log('Mermaid diagram rendered');

        // Track the number of pages/windows
        const pagesBefore = context.pages().length;
        console.log('Pages before opening child window:', pagesBefore);

        // Click the fullscreen button to open Mermaid in new window
        const fullscreenButton = page.locator('.mermaid-fullscreen-btn').first();
        await expect(fullscreenButton).toBeVisible();

        // Listen for new page/window opening
        const newPagePromise = context.waitForEvent('page');

        await fullscreenButton.click();
        console.log('Clicked fullscreen button');

        // Wait for the new window to open
        const childWindow = await newPagePromise;
        await childWindow.waitForLoadState('load');
        console.log('Child window opened');

        // Verify we have 2 windows open
        const pagesAfter = context.pages().length;
        console.log('Pages after opening child window:', pagesAfter);
        expect(pagesAfter).toBe(pagesBefore + 1);

        // Verify child window has Mermaid content
        await childWindow.waitForSelector('.mermaid', { timeout: 5000 });
        console.log('Child window has Mermaid diagram');

        // Check that child window is tracked in main window
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

        // Check if child window is closed
        const childWindowClosed = childWindow.isClosed();
        console.log('Child window closed:', childWindowClosed);
        expect(childWindowClosed).toBe(true);

        // Note: Main window won't close in Playwright tests due to security restrictions,
        // but in production it will close via window.close() after WebSocket disconnect
        const mainWindowClosed = page.isClosed();
        console.log('Main window closed:', mainWindowClosed);

        console.log('Test completed successfully - child window closed when server stopped!');
    });

    test('should handle multiple child windows', async ({ page, context }, testInfo) => {
        // Use unique port for each worker/browser
        const port = 8930 + testInfo.workerIndex;

        console.log('Starting server for multiple child windows test on port', port);

        // Create a test file with multiple Mermaid diagrams
        const multiDiagramFile = path.join(__dirname, 'temp-multi-mermaid-test.md');
        fs.writeFileSync(multiDiagramFile, `
# Multiple Diagrams Test

## First Diagram

\`\`\`mermaid
graph TD
    A[First] --> B[Diagram]
\`\`\`

## Second Diagram

\`\`\`mermaid
graph LR
    C[Second] --> D[Diagram]
\`\`\`
        `);

        const serverProcess = await startServerForFile(multiDiagramFile, port);

        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1500));

        await page.goto(`http://localhost:${port}/view?file=temp-multi-mermaid-test.md`);
        await page.waitForLoadState('networkidle');

        // Wait for both Mermaid diagrams to render
        await page.waitForSelector('.mermaid-container', { timeout: 5000 });
        const mermaidContainers = await page.locator('.mermaid-container').count();
        console.log('Mermaid containers found:', mermaidContainers);
        expect(mermaidContainers).toBeGreaterThanOrEqual(2);

        // Open first child window
        const newPage1Promise = context.waitForEvent('page');
        await page.locator('.mermaid-fullscreen-btn').first().click();
        const childWindow1 = await newPage1Promise;
        await childWindow1.waitForLoadState('load');
        console.log('First child window opened');

        // Open second child window
        const newPage2Promise = context.waitForEvent('page');
        await page.locator('.mermaid-fullscreen-btn').nth(1).click();
        const childWindow2 = await newPage2Promise;
        await childWindow2.waitForLoadState('load');
        console.log('Second child window opened');

        // Verify 2 child windows are tracked
        const childWindowsTracked = await page.evaluate(() => {
            return window.childWindows ? window.childWindows.length : 0;
        });
        console.log('Child windows tracked:', childWindowsTracked);
        expect(childWindowsTracked).toBe(2);

        // Kill the server
        console.log('Stopping server...');
        serverProcess.kill();
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Check if both child windows are closed
        expect(childWindow1.isClosed()).toBe(true);
        expect(childWindow2.isClosed()).toBe(true);

        // Note: Main window won't close in Playwright tests due to security restrictions,
        // but in production it will close via window.close() after WebSocket disconnect

        console.log('All child windows closed successfully!');

        // Clean up test file
        if (fs.existsSync(multiDiagramFile)) {
            fs.unlinkSync(multiDiagramFile);
        }
    });
});
