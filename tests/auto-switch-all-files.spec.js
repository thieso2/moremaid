const { test, expect } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

// Helper to start the server for lib/ directory
async function startServerForDirectory(dirPath, port) {
    return new Promise((resolve, reject) => {
        const serverProcess = spawn('node', [
            path.join(__dirname, '../mm.js'),
            dirPath,
            '--keep-running'
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

test.describe('Auto-Switch to All Files Feature', () => {
    let serverProcess;
    let port;

    test.beforeEach(async ({ page }, testInfo) => {
        // Start server serving lib/ directory (which has no markdown files)
        const libDir = path.join(__dirname, '../lib');
        port = 8850 + testInfo.workerIndex;
        console.log('Starting server on port', port, 'for directory:', libDir);
        serverProcess = await startServerForDirectory(libDir, port);

        // Wait for server to be fully ready
        await new Promise(resolve => setTimeout(resolve, 1500));
    });

    test.afterEach(async () => {
        // Clean up server
        if (serverProcess) {
            serverProcess.kill();
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    test('should auto-switch to "All Files" filter when no markdown files found', async ({ page }, testInfo) => {
        port = 8850 + testInfo.workerIndex;
        // Navigate to the server serving lib/ directory (which has no markdown files)
        await page.goto(`http://localhost:${port}/`);
        await page.waitForLoadState('networkidle');

        // Wait for file list to load
        await page.waitForSelector('.file-list-flat', { timeout: 5000 });

        // Verify that files are displayed (using .file-item selector)
        const fileItems = page.locator('.file-item');
        const fileCount = await fileItems.count();

        console.log(`Found ${fileCount} files displayed`);

        // Should show the expected .js files from lib/
        expect(fileCount).toBe(7);

        // Collect all file names to verify they match expected files
        const fileNames = [];
        for (let i = 0; i < fileCount; i++) {
            const name = await fileItems.nth(i).locator('.file-name').textContent();
            fileNames.push(name.trim());
        }

        console.log('Files displayed:', fileNames);

        // Verify expected files are present
        expect(fileNames).toContain('archive-handler.js');
        expect(fileNames).toContain('config.js');
        expect(fileNames).toContain('html-generator.js');
        expect(fileNames).toContain('server.js');
        expect(fileNames).toContain('styles.js');
        expect(fileNames).toContain('utils.js');
        expect(fileNames).toContain('virtual-fs.js');

        // Verify that the filter toggle button shows "All Files" (auto-switched)
        const filterButton = page.getByRole('button', { name: 'All Files' });
        await expect(filterButton).toBeVisible();

        console.log('Filter button shows: All Files');
        console.log('Auto-switch feature working correctly: no markdown files found, switched to All Files filter');
    });

    test('should show all file types when auto-switched', async ({ page }, testInfo) => {
        port = 8850 + testInfo.workerIndex;
        await page.goto(`http://localhost:${port}/`);
        await page.waitForLoadState('networkidle');

        // Wait for file list to load
        await page.waitForSelector('.file-list-flat', { timeout: 5000 });

        // Verify All Files filter button is visible (auto-switched)
        const filterButton = page.getByRole('button', { name: 'All Files' });
        await expect(filterButton).toBeVisible();

        // Verify all .js files are shown
        const fileItems = page.locator('.file-item');
        const fileCount = await fileItems.count();
        expect(fileCount).toBe(7);

        // Verify all file names end with .js (not .md)
        const fileNames = [];
        for (let i = 0; i < fileCount; i++) {
            const name = await fileItems.nth(i).locator('.file-name').textContent();
            fileNames.push(name.trim());
        }

        // All files should be .js files
        const allJsFiles = fileNames.every(name => name.endsWith('.js'));
        expect(allJsFiles).toBe(true);

        console.log('All files are .js files:', fileNames);
        console.log('Auto-switch correctly shows non-markdown files');
    });
});
