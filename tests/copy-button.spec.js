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
            env: { ...process.env, PORT: '8889' },
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

test.describe('Copy Button Functionality', () => {
    let serverProcess;
    let testDir;

    test.beforeAll(async () => {
        // Create a temporary test directory with sample markdown files
        testDir = path.join(__dirname, 'temp-copy-test-files');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Create test markdown file with various code blocks
        fs.writeFileSync(path.join(testDir, 'code-examples.md'), `
# Code Examples

## JavaScript Example

\`\`\`javascript
function hello() {
    console.log("Hello, World!");
    return 42;
}
\`\`\`

## Python Example

\`\`\`python
def greet(name):
    print(f"Hello, {name}!")
    return True
\`\`\`

## Bash Example

\`\`\`bash
echo "Testing copy functionality"
ls -la
pwd
\`\`\`

## Inline Code

This is some text with \`inline code\` that should not have a copy button.
        `);

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

    test('should show copy button on hover over code block', async ({ page }) => {
        // Navigate to the server
        await page.goto('http://localhost:8889');

        // Wait for the page to load
        await page.waitForSelector('.file-list');

        // Click on the test file
        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        // Wait for overlay to open
        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Find a code block
        const codeWrapper = page.locator('.code-block-wrapper').first();

        // Initially, the copy button should not be visible (opacity: 0)
        const copyButton = codeWrapper.locator('.copy-btn');
        await expect(copyButton).toHaveCSS('opacity', '0');

        // Hover over the code block
        await codeWrapper.hover();

        // After hovering, the copy button should be visible (opacity: 1)
        await expect(copyButton).toHaveCSS('opacity', '1');
    });

    test('should copy code to clipboard when copy button is clicked', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Find the first code block wrapper
        const codeWrapper = page.locator('.code-block-wrapper').first();

        // Hover to make button visible
        await codeWrapper.hover();

        // Get the code text before clicking
        const codeElement = codeWrapper.locator('code').first();
        const expectedCode = await codeElement.textContent();

        // Click the copy button
        const copyButton = codeWrapper.locator('.copy-btn');
        await copyButton.click();

        // Wait a moment for clipboard operation
        await page.waitForTimeout(100);

        // Verify button text changed to "Copied!"
        await expect(copyButton).toHaveText('Copied!');

        // Verify clipboard content using Playwright's clipboard API
        const clipboardHandle = await page.evaluateHandle(() => navigator.clipboard.readText());
        const clipboardText = await clipboardHandle.jsonValue();
        expect(clipboardText.trim()).toBe(expectedCode.trim());

        // Wait for button to reset
        await page.waitForTimeout(2100);
        await expect(copyButton).toHaveText('Copy');
    });

    test('should have copy buttons for all code blocks', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Count all code block wrappers
        const codeWrappers = page.locator('.code-block-wrapper');
        const wrapperCount = await codeWrappers.count();

        // We should have at least 3 code blocks (JavaScript, Python, Bash)
        expect(wrapperCount).toBeGreaterThanOrEqual(3);

        // Each wrapper should have exactly one copy button
        for (let i = 0; i < wrapperCount; i++) {
            const wrapper = codeWrappers.nth(i);
            const copyButtons = wrapper.locator('.copy-btn');
            await expect(copyButtons).toHaveCount(1);
        }
    });

    test('should not have copy button for inline code', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Find the paragraph with inline code
        const paragraph = page.locator('p:has-text("inline code")');
        await expect(paragraph).toBeVisible();

        // Inline code should not be wrapped in code-block-wrapper
        const inlineCode = paragraph.locator('code');
        const parent = inlineCode.locator('..');
        const parentClass = await parent.getAttribute('class');

        // Parent should be <p>, not .code-block-wrapper
        expect(parentClass).not.toContain('code-block-wrapper');
    });

    test('should copy different code blocks independently', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const firstFile = await page.locator('.file-item').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(500);

        // Get all code wrappers
        const codeWrappers = page.locator('.code-block-wrapper');
        const count = await codeWrappers.count();

        if (count >= 2) {
            // Copy from first code block
            const firstWrapper = codeWrappers.nth(0);
            await firstWrapper.hover();
            const firstCode = await firstWrapper.locator('code').textContent();
            await firstWrapper.locator('.copy-btn').click();
            await page.waitForTimeout(100);

            let clipboardHandle = await page.evaluateHandle(() => navigator.clipboard.readText());
            let clipboardText = await clipboardHandle.jsonValue();
            expect(clipboardText.trim()).toBe(firstCode.trim());

            await page.waitForTimeout(500);

            // Copy from second code block
            const secondWrapper = codeWrappers.nth(1);
            await secondWrapper.hover();
            const secondCode = await secondWrapper.locator('code').textContent();
            await secondWrapper.locator('.copy-btn').click();
            await page.waitForTimeout(100);

            clipboardHandle = await page.evaluateHandle(() => navigator.clipboard.readText());
            clipboardText = await clipboardHandle.jsonValue();
            expect(clipboardText.trim()).toBe(secondCode.trim());

            // Verify the codes are different
            expect(firstCode.trim()).not.toBe(secondCode.trim());
        }
    });
});
