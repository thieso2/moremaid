const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Helper to start the server for a single file
async function startServerForFile(filePath) {
    return new Promise((resolve, reject) => {
        const serverProcess = spawn('node', [
            path.join(__dirname, '../mm.js'),
            filePath,
            '--keep-running'
        ], {
            env: { ...process.env, PORT: '8891' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let serverReady = false;
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
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

test.describe('Single File Copy Button', () => {
    let serverProcess;
    let testFile;
    const testMarkdown = `# Test Document

This is a test markdown file for single file copy functionality.

## Features

- Copy raw markdown from controls
- Clean button design
- Visual feedback on copy

## Code Example

\`\`\`javascript
function test() {
    return "Hello World";
}
\`\`\`

## Mermaid Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B[Copy]
    B --> C[Clipboard]
\`\`\`

## Conclusion

This file tests the copy button in the controls area.
`;

    test.beforeAll(async () => {
        // Create a temporary test directory
        const testDir = path.join(__dirname, 'temp-test-files');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Create test markdown file
        testFile = path.join(testDir, 'single-file-test.md');
        fs.writeFileSync(testFile, testMarkdown);

        // Start the server with single file
        serverProcess = await startServerForFile(testFile);

        // Wait a bit for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    test.afterAll(async () => {
        // Kill the server process
        if (serverProcess) {
            serverProcess.kill();
            // Wait for process to terminate
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Clean up test files
        const testDir = path.join(__dirname, 'temp-test-files');
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    test('should display copy button in top right corner', async ({ page }) => {
        // Navigate to the server
        await page.goto('http://localhost:8891');

        // Wait for the page to load
        await page.waitForSelector('.container');
        await page.waitForTimeout(500);

        // Check that copy button exists and is visible (no need to open controls)
        const copyButton = page.locator('#copyButton');
        await expect(copyButton).toBeVisible();
        await expect(copyButton).toHaveAttribute('title', 'Copy raw markdown');
        await expect(copyButton).toHaveText('Copy');

        // Verify it's positioned fixed in the top right
        const box = await copyButton.boundingBox();
        expect(box).not.toBeNull();
        // Button should be near the top right (within 100px of top, and on the right side)
        expect(box.y).toBeLessThan(100);
        expect(box.x).toBeGreaterThan(600); // Should be on right side for most viewport sizes
    });

    test('should copy raw markdown to clipboard when clicked', async ({ page, context, browserName }) => {
        // Grant clipboard permissions (not supported in WebKit)
        if (browserName !== 'webkit') {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        }

        await page.goto('http://localhost:8891');
        await page.waitForSelector('.container');
        await page.waitForTimeout(500);

        // Click the copy button (no need to open controls)
        const copyButton = page.locator('#copyButton');
        await copyButton.click();

        // Wait a moment for clipboard operation
        await page.waitForTimeout(200);

        // Verify clipboard content
        const clipboardHandle = await page.evaluateHandle(() => navigator.clipboard.readText());
        const clipboardText = await clipboardHandle.jsonValue();

        expect(clipboardText.trim()).toBe(testMarkdown.trim());
    });

    test('should show visual feedback after copying', async ({ page, context, browserName }) => {
        if (browserName !== 'webkit') {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        }

        await page.goto('http://localhost:8891');
        await page.waitForSelector('.container');
        await page.waitForTimeout(500);

        const copyButton = page.locator('#copyButton');

        // Verify original text
        await expect(copyButton).toHaveText('Copy');

        // Click the copy button
        await copyButton.click();

        // Wait a moment and verify the button changed
        await page.waitForTimeout(200);
        await expect(copyButton).toHaveText('Copied!');

        // Wait for reset (2 seconds)
        await page.waitForTimeout(2100);

        // Verify button returned to original state
        await expect(copyButton).toHaveText('Copy');
    });

    test('should handle copy failure gracefully', async ({ page }) => {
        await page.goto('http://localhost:8891');
        await page.waitForSelector('.container');
        await page.waitForTimeout(500);

        // Mock clipboard API to fail
        await page.evaluate(() => {
            navigator.clipboard.writeText = () => Promise.reject(new Error('Clipboard not available'));
        });

        const copyButton = page.locator('#copyButton');
        await copyButton.click();

        // Wait a moment and verify the button shows failure
        await page.waitForTimeout(200);
        await expect(copyButton).toHaveText('Failed');

        // Wait for reset (2 seconds)
        await page.waitForTimeout(2100);

        // Verify button returned to original state
        await expect(copyButton).toHaveText('Copy');
    });

    test('should copy multiline markdown correctly', async ({ page, context, browserName }) => {
        if (browserName !== 'webkit') {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        }

        await page.goto('http://localhost:8891');
        await page.waitForSelector('.container');
        await page.waitForTimeout(500);

        const copyButton = page.locator('#copyButton');
        await copyButton.click();
        await page.waitForTimeout(200);

        // Verify clipboard content
        const clipboardHandle = await page.evaluateHandle(() => navigator.clipboard.readText());
        const clipboardText = await clipboardHandle.jsonValue();

        // Verify the markdown has multiple lines
        const lines = clipboardText.split('\n').filter(l => l.trim().length > 0);
        expect(lines.length).toBeGreaterThan(5);

        // Verify it contains expected content
        expect(clipboardText).toContain('# Test Document');
        expect(clipboardText).toContain('## Features');
        expect(clipboardText).toContain('## Code Example');
        expect(clipboardText).toContain('## Mermaid Diagram');
    });
});
