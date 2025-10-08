const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

test.describe('Syntax Highlighting in Overlay', () => {
    let serverProcess;
    const testPort = 8891;
    const testFile = path.join(__dirname, '..', 'samples', 'test-syntax.md');

    test.beforeAll(async () => {
        // Create test file with code blocks
        const testContent = `# Test Syntax Highlighting

## JavaScript Code

\`\`\`javascript
const hello = () => {
  console.log('Hello, world!');
  return 42;
};
\`\`\`

## Python Code

\`\`\`python
def hello():
    print("Hello, world!")
    return 42
\`\`\`
`;
        fs.writeFileSync(testFile, testContent);

        // Start server
        return new Promise((resolve, reject) => {
            serverProcess = spawn('node', [
                path.join(__dirname, '..', 'mm.js'),
                path.join(__dirname, '..', 'samples')
            ], {
                env: { ...process.env, PORT: testPort.toString() },
                stdio: 'pipe'
            });

            let serverReady = false;

            serverProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('Server:', output);
                if (output.includes('Server running') || output.includes('http://localhost')) {
                    serverReady = true;
                    setTimeout(resolve, 1000);
                }
            });

            serverProcess.stderr.on('data', (data) => {
                console.error('Server error:', data.toString());
            });

            setTimeout(() => {
                if (!serverReady) {
                    serverProcess.kill();
                    reject(new Error('Server failed to start within 10 seconds'));
                }
            }, 10000);
        });
    });

    test.afterAll(async () => {
        if (serverProcess) {
            serverProcess.kill();
        }
        // Clean up test file
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
    });

    test('should apply syntax highlighting in overlay mode', async ({ page }) => {
        await page.goto(`http://localhost:${testPort}`);

        // Wait for file list to load
        await page.waitForSelector('.file-list', { timeout: 5000 });

        // Find and click the test file
        const fileItem = page.locator('.file-item').filter({ hasText: 'test-syntax.md' });
        await fileItem.click();

        // Wait for overlay to open
        await page.waitForSelector('.file-overlay.visible', { timeout: 5000 });
        await page.waitForTimeout(500); // Give Prism time to highlight

        // Check that code blocks have Prism syntax highlighting classes
        const codeBlocks = page.locator('.file-overlay-body pre code[class*="language-"]');
        const count = await codeBlocks.count();

        // Should have at least 2 code blocks (JavaScript and Python)
        expect(count).toBeGreaterThanOrEqual(2);

        // Check JavaScript code block has highlighting
        const jsCodeBlock = page.locator('.file-overlay-body code.language-javascript');
        await expect(jsCodeBlock).toBeVisible();

        // Verify Prism has applied token classes
        const jsTokens = page.locator('.file-overlay-body code.language-javascript .token');
        const jsTokenCount = await jsTokens.count();
        expect(jsTokenCount).toBeGreaterThan(0);

        // Check Python code block has highlighting
        const pyCodeBlock = page.locator('.file-overlay-body code.language-python');
        await expect(pyCodeBlock).toBeVisible();

        // Verify Prism has applied token classes to Python code
        const pyTokens = page.locator('.file-overlay-body code.language-python .token');
        const pyTokenCount = await pyTokens.count();
        expect(pyTokenCount).toBeGreaterThan(0);
    });

    test('should have copy buttons in overlay mode', async ({ page }) => {
        await page.goto(`http://localhost:${testPort}`);

        // Wait for file list to load
        await page.waitForSelector('.file-list', { timeout: 5000 });

        // Find and click the test file
        const fileItem = page.locator('.file-item').filter({ hasText: 'test-syntax.md' });
        await fileItem.click();

        // Wait for overlay to open
        await page.waitForSelector('.file-overlay.visible', { timeout: 5000 });
        await page.waitForTimeout(500);

        // Check that code blocks have copy buttons
        const copyButtons = page.locator('.file-overlay-body .copy-btn');
        const count = await copyButtons.count();

        // Should have copy buttons for both code blocks
        expect(count).toBeGreaterThanOrEqual(2);
    });
});
