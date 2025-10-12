const { test, expect } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');

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

test.describe('File Filter Functionality', () => {
    let testDir;
    let serverProcess;

    test.beforeEach(async ({ page }, testInfo) => {
        // Create a temporary test directory with various file types
        testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moremaid-test-'));

        // Create test files
        fs.writeFileSync(path.join(testDir, 'test1.md'), '# Test Markdown 1\n\nThis is a test markdown file.');
        fs.writeFileSync(path.join(testDir, 'test2.md'), '# Test Markdown 2\n\nAnother markdown file.');
        fs.writeFileSync(path.join(testDir, 'test.js'), 'console.log("Hello, World!");');
        fs.writeFileSync(path.join(testDir, 'test.py'), 'print("Hello, Python!")');
        fs.writeFileSync(path.join(testDir, 'test.json'), '{"name": "test", "value": 123}');

        console.log('Created test directory:', testDir);
        console.log('Test files:', fs.readdirSync(testDir));

        const port = 8800 + testInfo.workerIndex;
        console.log('Starting server on port', port);
        serverProcess = await startServerForDirectory(testDir, port);

        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1500));
    });

    test.afterEach(async () => {
        // Clean up
        if (serverProcess) {
            serverProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Remove test directory
        if (testDir && fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
            console.log('Cleaned up test directory');
        }
    });

    test('should show filter dropdown with *.md and * options', async ({ page }, testInfo) => {
        const port = 8800 + testInfo.workerIndex;

        await page.goto(`http://localhost:${port}/`);
        await page.waitForLoadState('networkidle');

        // Check that filter dropdown exists
        const filterDropdown = page.locator('#filterDropdown');
        await expect(filterDropdown).toBeVisible();

        // Check that it has the expected options by counting them
        const mdOption = filterDropdown.locator('option[value="*.md"]');
        const allOption = filterDropdown.locator('option[value="*"]');

        // Check that options exist (count > 0)
        await expect(mdOption).toHaveCount(1);
        await expect(allOption).toHaveCount(1);

        // Check that *.md is selected by default
        const selectedValue = await filterDropdown.inputValue();
        expect(selectedValue).toBe('*.md');

        console.log('Filter dropdown rendered correctly with default *.md selection');
    });

    test('should only show markdown files when *.md filter is selected', async ({ page }, testInfo) => {
        const port = 8800 + testInfo.workerIndex;

        await page.goto(`http://localhost:${port}/`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.file-item', { timeout: 5000 });

        // Count visible files
        const fileItems = page.locator('.file-item');
        const fileCount = await fileItems.count();

        // Should only show 2 .md files
        expect(fileCount).toBe(2);

        // Check that both are .md files
        const firstFileName = await fileItems.first().locator('.file-name').textContent();
        const secondFileName = await fileItems.nth(1).locator('.file-name').textContent();

        expect(firstFileName).toMatch(/\.md$/);
        expect(secondFileName).toMatch(/\.md$/);

        console.log('Only markdown files shown with *.md filter');
    });

    test('should show all files when * filter is selected', async ({ page }, testInfo) => {
        const port = 8800 + testInfo.workerIndex;

        await page.goto(`http://localhost:${port}/?filter=*`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.file-item', { timeout: 5000 });

        // Count visible files
        const fileItems = page.locator('.file-item');
        const fileCount = await fileItems.count();

        // Should show all 5 files
        expect(fileCount).toBe(5);

        console.log('All files shown with * filter');
    });

    test('should reload page when filter is changed', async ({ page }, testInfo) => {
        const port = 8800 + testInfo.workerIndex;

        await page.goto(`http://localhost:${port}/`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.file-item', { timeout: 5000 });

        // Initial count should be 2 (only .md files)
        let fileItems = page.locator('.file-item');
        let fileCount = await fileItems.count();
        expect(fileCount).toBe(2);

        // Change filter to *
        const filterDropdown = page.locator('#filterDropdown');
        await filterDropdown.selectOption('*');

        // Wait for page reload
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.file-item', { timeout: 5000 });

        // Now should show all 5 files
        fileItems = page.locator('.file-item');
        fileCount = await fileItems.count();
        expect(fileCount).toBe(5);

        // Verify URL updated
        const url = page.url();
        expect(url).toContain('filter=*');

        console.log('Page reloaded with new filter and URL updated');
    });

    test('should display non-markdown files with syntax highlighting', async ({ page }, testInfo) => {
        const port = 8800 + testInfo.workerIndex;

        // Navigate with * filter to see all files
        await page.goto(`http://localhost:${port}/?filter=*`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.file-item', { timeout: 5000 });

        // Find and click on test.js (use exact file name match)
        const jsFile = page.locator('.file-item').filter({ has: page.locator('.file-name', { hasText: /^test\.js$/ }) });
        await expect(jsFile).toBeVisible();
        await jsFile.click();

        // Wait for file view to load
        await page.waitForLoadState('networkidle');

        // Wait a bit for Prism.js to load and apply highlighting
        await page.waitForTimeout(1000);

        // Check for syntax highlighting
        const codeBlock = page.locator('pre code[class*="language-"]');
        await expect(codeBlock).toBeVisible({ timeout: 10000 });

        // Verify it's JavaScript language
        const className = await codeBlock.getAttribute('class');
        expect(className).toContain('language-javascript');

        // Check that content is displayed
        const codeContent = await codeBlock.textContent();
        expect(codeContent).toContain('console.log');

        // Check for copy button
        const copyButton = page.locator('.copy-btn');
        await expect(copyButton).toBeVisible();

        // Check for back button
        const backButton = page.locator('.back-btn');
        await expect(backButton).toBeVisible();

        console.log('Non-markdown file displayed with syntax highlighting');
    });

    test('should respect gitignore patterns', async ({ page }, testInfo) => {
        const port = 8800 + testInfo.workerIndex;

        // Create a .gitignore file
        fs.writeFileSync(path.join(testDir, '.gitignore'), '*.json\n');
        fs.writeFileSync(path.join(testDir, 'ignored.json'), '{"ignored": true}');

        // Restart server to pick up gitignore
        if (serverProcess) {
            serverProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        serverProcess = await startServerForDirectory(testDir, port);
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Navigate with * filter
        await page.goto(`http://localhost:${port}/?filter=*`);
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.file-item', { timeout: 5000 });

        // Get all file names
        const fileItems = page.locator('.file-item');
        const fileCount = await fileItems.count();

        // Collect all file names
        const fileNames = [];
        for (let i = 0; i < fileCount; i++) {
            const name = await fileItems.nth(i).locator('.file-name').textContent();
            fileNames.push(name);
        }

        console.log('Files shown:', fileNames);

        // Verify no .json files are shown (they should be gitignored)
        const jsonFiles = fileNames.filter(name => name.endsWith('.json'));
        expect(jsonFiles.length).toBe(0);

        console.log('Gitignore patterns respected - no .json files shown');
    });
});
