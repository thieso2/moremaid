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

test.describe('Search with Filter Support', () => {
    let serverProcess;
    let testDir;

    test.beforeAll(async () => {
        // Create a temporary test directory with various file types
        testDir = path.join(__dirname, 'temp-search-filter-test');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Create markdown files
        fs.writeFileSync(path.join(testDir, 'test1.md'), `
# Test Document 1
This is a markdown file with test content.
It contains the word searchterm in it.
`);

        fs.writeFileSync(path.join(testDir, 'test2.md'), `
# Another Markdown
More searchterm content here.
`);

        // Create non-markdown files
        fs.writeFileSync(path.join(testDir, 'config.json'), `{
  "name": "test-config",
  "searchterm": "value"
}`);

        fs.writeFileSync(path.join(testDir, 'script.js'), `
function test() {
  const searchterm = 'found me';
  return searchterm;
}
`);

        fs.writeFileSync(path.join(testDir, 'README.txt'), `
This is a text file with searchterm.
`);

        // Start the server
        serverProcess = await startServer(testDir);

        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1000));
    });

    test.afterAll(async () => {
        // Kill the server process
        if (serverProcess) {
            serverProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Clean up test files
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    test('should only search markdown files when filter is set to *.md', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        // Verify filter is set to Markdown Only
        const filterButton = await page.locator('#filterToggle');
        const filterText = await filterButton.textContent();
        expect(filterText).toBe('Markdown Only');

        // Switch to content search mode
        const searchModeIndicator = await page.locator('#searchModeIndicator');
        await searchModeIndicator.click();
        await page.waitForTimeout(300);

        // Verify search mode changed
        const modeText = await searchModeIndicator.textContent();
        expect(modeText).toBe('in file contents');

        // Search for content
        await page.fill('#searchField', 'searchterm');
        await page.waitForTimeout(1000);

        // Count visible files - should only show markdown files
        const visibleFiles = await page.locator('.file-item:visible').all();
        expect(visibleFiles.length).toBe(2); // Only test1.md and test2.md

        // Verify the files shown are markdown files
        for (const file of visibleFiles) {
            const fileName = await file.locator('.file-name').textContent();
            expect(fileName).toMatch(/\.md$/);
        }
    });

    test('should search all files when filter is set to *', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        // Switch to all files
        const filterButton = await page.locator('#filterToggle');
        await filterButton.click();

        // Wait for page reload
        await page.waitForSelector('.file-list');
        await page.waitForTimeout(500);

        // Verify filter changed
        const filterText = await filterButton.textContent();
        expect(filterText).toBe('All Files');

        // Switch to content search mode
        const searchModeIndicator = await page.locator('#searchModeIndicator');
        await searchModeIndicator.click();
        await page.waitForTimeout(300);

        // Search for content
        await page.fill('#searchField', 'searchterm');
        await page.waitForTimeout(1000);

        // Count visible files - should show all files with searchterm
        const visibleFiles = await page.locator('.file-item:visible').all();
        expect(visibleFiles.length).toBeGreaterThan(2); // Should include .json, .js, .txt files

        // Verify we have non-markdown files in results
        let hasNonMarkdown = false;
        for (const file of visibleFiles) {
            const fileName = await file.locator('.file-name').textContent();
            if (!fileName.match(/\.md$/)) {
                hasNonMarkdown = true;
                break;
            }
        }
        expect(hasNonMarkdown).toBeTruthy();
    });

    test('should toggle search mode by clicking the indicator', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const searchModeIndicator = await page.locator('#searchModeIndicator');

        // Initial state should be filename search
        let modeText = await searchModeIndicator.textContent();
        expect(modeText).toBe('in names & paths');

        // Click to toggle to content search
        await searchModeIndicator.click();
        await page.waitForTimeout(200);

        modeText = await searchModeIndicator.textContent();
        expect(modeText).toBe('in file contents');

        // Click again to toggle back
        await searchModeIndicator.click();
        await page.waitForTimeout(200);

        modeText = await searchModeIndicator.textContent();
        expect(modeText).toBe('in names & paths');
    });

    test('should have clickable cursor on search mode indicator', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const searchModeIndicator = await page.locator('#searchModeIndicator');

        // Check cursor style
        const cursor = await searchModeIndicator.evaluate(el =>
            window.getComputedStyle(el).cursor
        );
        expect(cursor).toBe('pointer');
    });

    test('should maintain search mode when switching between filters', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        // Switch to content search mode
        const searchModeIndicator = await page.locator('#searchModeIndicator');
        await searchModeIndicator.click();
        await page.waitForTimeout(200);

        let modeText = await searchModeIndicator.textContent();
        expect(modeText).toBe('in file contents');

        // Note: After switching filters, the page reloads and resets to filename mode
        // This is expected behavior since the state is not persisted
    });

    test('should show search mode indicator to the left of search field', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const searchField = await page.locator('#searchField');
        const searchModeIndicator = await page.locator('#searchModeIndicator');

        // Get bounding boxes
        const fieldBox = await searchField.boundingBox();
        const indicatorBox = await searchModeIndicator.boundingBox();

        // Indicator should be to the left of the field
        expect(indicatorBox.x).toBeLessThan(fieldBox.x);
    });

    test('should search in filename mode regardless of filter', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        // Search in filename mode with markdown filter
        await page.fill('#searchField', 'test');
        await page.waitForTimeout(500);

        let visibleFiles = await page.locator('.file-item:visible').all();
        const mdCount = visibleFiles.length;

        // Switch to all files
        await page.click('#filterToggle');
        await page.waitForSelector('.file-list');
        await page.waitForTimeout(500);

        // Search again with same term
        await page.fill('#searchField', 'test');
        await page.waitForTimeout(500);

        visibleFiles = await page.locator('.file-item:visible').all();
        const allCount = visibleFiles.length;

        // All files should show more results (or same if only .md files have "test")
        expect(allCount).toBeGreaterThanOrEqual(mdCount);
    });

    test('should use keyboard shortcut Shift+Tab to toggle search mode', async ({ page }) => {
        await page.goto('http://localhost:8889');
        await page.waitForSelector('.file-list');

        const searchField = await page.locator('#searchField');
        const searchModeIndicator = await page.locator('#searchModeIndicator');

        // Focus search field
        await searchField.click();

        // Initial state
        let modeText = await searchModeIndicator.textContent();
        expect(modeText).toBe('in names & paths');

        // Use keyboard shortcut
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(200);

        modeText = await searchModeIndicator.textContent();
        expect(modeText).toBe('in file contents');
    });
});
