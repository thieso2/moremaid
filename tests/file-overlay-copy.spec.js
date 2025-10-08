const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

// Helper to start the server
async function startServer(testDir) {
    return new Promise((resolve, reject) => {
        const serverProcess = spawn('node', [
            path.join(__dirname, '../mm.js'),
            testDir,
            '--keep-running'
        ], {
            env: { ...process.env, PORT: '8890' },
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

test.describe('File Overlay Copy Button', () => {
    let serverProcess;
    let testDir;
    const testMarkdown = `# Test Document

This is a test markdown file for copy functionality.

## Features

- Bullet point 1
- Bullet point 2
- Bullet point 3

## Code Example

\`\`\`javascript
function test() {
    return "Hello World";
}
\`\`\`

## Conclusion

This file tests the copy raw markdown feature.
`;

    test.beforeAll(async () => {
        // Create a temporary test directory with sample markdown file
        testDir = path.join(__dirname, 'temp-file-copy-test');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Create test markdown file
        fs.writeFileSync(path.join(testDir, 'test.md'), testMarkdown);

        // Start the server
        serverProcess = await startServer(testDir);

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
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    test('should display copy button in file overlay header', async ({ page }) => {
        // Navigate to the server
        await page.goto('http://localhost:8890');

        // Wait for the page to load
        await page.waitForSelector('.file-list');

        // Click on the test file
        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        // Wait for overlay to open
        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Check that copy button exists
        const copyButton = page.locator('#overlayCopy');
        await expect(copyButton).toBeVisible();
        await expect(copyButton).toHaveAttribute('title', 'Copy raw markdown');
    });

    test('should copy raw markdown to clipboard when clicked', async ({ page, context, browserName }) => {
        // Grant clipboard permissions (not supported in WebKit)
        if (browserName !== 'webkit') {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        }

        await page.goto('http://localhost:8890');
        await page.waitForSelector('.file-list');

        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Click the copy button
        const copyButton = page.locator('#overlayCopy');
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

        await page.goto('http://localhost:8890');
        await page.waitForSelector('.file-list');

        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        const copyButton = page.locator('#overlayCopy');

        // Get original button content
        const originalContent = await copyButton.textContent();

        // Click the copy button
        await copyButton.click();

        // Wait a moment and verify the button changed to checkmark
        await page.waitForTimeout(200);
        const feedbackContent = await copyButton.textContent();
        expect(feedbackContent).toBe('✓');

        // Verify button has 'copied' class
        await expect(copyButton).toHaveClass(/copied/);

        // Wait for reset (2 seconds)
        await page.waitForTimeout(2100);

        // Verify button returned to original state
        const resetContent = await copyButton.textContent();
        expect(resetContent).toBe(originalContent);

        // Verify 'copied' class was removed
        await expect(copyButton).not.toHaveClass(/copied/);
    });

    test('should maintain copy functionality after file switch', async ({ page, context, browserName }) => {
        if (browserName !== 'webkit') {
            await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        }

        // Create a second test file
        const secondMarkdown = '# Second File\n\nThis is different content.';
        fs.writeFileSync(path.join(testDir, 'test2.md'), secondMarkdown);

        await page.goto('http://localhost:8890');
        await page.waitForSelector('.file-list');

        // Open first file
        const firstFile = page.locator('.file-item').filter({ hasText: 'test.md' });
        await firstFile.click();
        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Copy from first file
        let copyButton = page.locator('#overlayCopy');
        await copyButton.click();
        await page.waitForTimeout(200);

        let clipboardHandle = await page.evaluateHandle(() => navigator.clipboard.readText());
        let clipboardText = await clipboardHandle.jsonValue();
        expect(clipboardText.trim()).toBe(testMarkdown.trim());

        // Close overlay
        const closeButton = page.locator('#overlayClose');
        await closeButton.click();
        await page.waitForTimeout(500);

        // Open second file
        const secondFile = page.locator('.file-item').filter({ hasText: 'test2.md' });
        await secondFile.click();
        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Copy from second file
        copyButton = page.locator('#overlayCopy');
        await copyButton.click();
        await page.waitForTimeout(200);

        clipboardHandle = await page.evaluateHandle(() => navigator.clipboard.readText());
        clipboardText = await clipboardHandle.jsonValue();
        expect(clipboardText.trim()).toBe(secondMarkdown.trim());
    });
});
