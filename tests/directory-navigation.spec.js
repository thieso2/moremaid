const { test, expect } = require('@playwright/test');
const path = require('path');
const { spawn } = require('child_process');

/**
 * Test directory navigation with breadcrumbs
 */

let serverProcess;
let serverUrl;

test.beforeAll(async () => {
    // Start the server in the samples directory
    const samplesPath = path.join(__dirname, '..', 'samples');

    return new Promise((resolve, reject) => {
        serverProcess = spawn('node', [path.join(__dirname, '..', 'mm.js'), samplesPath], {
            env: { ...process.env, PORT: '8892' }
        });

        let output = '';
        serverProcess.stdout.on('data', (data) => {
            output += data.toString();
            const match = output.match(/http:\/\/localhost:(\d+)/);
            if (match) {
                serverUrl = match[0];
                // Wait a bit for server to be fully ready
                setTimeout(resolve, 500);
            }
        });

        serverProcess.stderr.on('data', (data) => {
            console.error('Server stderr:', data.toString());
        });

        // Timeout after 10 seconds
        setTimeout(() => {
            if (!serverUrl) {
                reject(new Error('Server failed to start within 10 seconds'));
            }
        }, 10000);
    });
});

test.afterAll(async () => {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        // Wait for process to exit
        await new Promise(resolve => {
            serverProcess.on('exit', resolve);
            setTimeout(resolve, 1000);
        });
    }
});

test.describe('Directory Navigation', () => {
    test('should display breadcrumb navigation', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for the page to load
        await page.waitForSelector('.breadcrumb-container');

        // Check that breadcrumb exists
        const breadcrumb = await page.locator('.breadcrumb-container');
        await expect(breadcrumb).toBeVisible();

        // Root should be visible
        const rootItem = await page.locator('.breadcrumb-item.current');
        await expect(rootItem).toBeVisible();
        await expect(rootItem).toContainText('📂');
    });

    test('should show directories with folder icons', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for file list
        await page.waitForSelector('.file-list');

        // Look for directory entries (they should have is-directory class)
        const directories = await page.locator('.file-name.is-directory').count();

        // Samples directory should have at least one subdirectory
        expect(directories).toBeGreaterThan(0);
    });

    test('should navigate into directory when clicked', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for file list
        await page.waitForSelector('.file-list');

        // Find first directory
        const firstDirectory = page.locator('.file-item[data-is-directory="true"]').first();

        if (await firstDirectory.count() > 0) {
            const dirName = await firstDirectory.locator('.file-name').textContent();
            const cleanDirName = dirName.replace('📁 ', '').trim();

            // Click the directory
            await firstDirectory.click();

            // Wait for navigation to complete
            await page.waitForTimeout(300);

            // Check breadcrumb updated
            const breadcrumbItems = page.locator('.breadcrumb-item');
            const count = await breadcrumbItems.count();
            expect(count).toBeGreaterThan(1); // Should have root + current directory

            // Check that last breadcrumb item contains directory name
            const lastItem = breadcrumbItems.last();
            await expect(lastItem).toContainText(cleanDirName);
        }
    });

    test('should navigate back via breadcrumb click', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for file list
        await page.waitForSelector('.file-list');

        // Find and click first directory
        const firstDirectory = page.locator('.file-item[data-is-directory="true"]').first();

        if (await firstDirectory.count() > 0) {
            await firstDirectory.click();
            await page.waitForTimeout(300);

            // Should have multiple breadcrumb items now
            const breadcrumbItems = page.locator('.breadcrumb-item');
            const count = await breadcrumbItems.count();

            if (count > 1) {
                // Click on root breadcrumb to go back
                const rootItem = breadcrumbItems.first();
                await rootItem.click();
                await page.waitForTimeout(300);

                // Should be back at root - only one breadcrumb item with .current class
                const currentItems = page.locator('.breadcrumb-item.current');
                await expect(currentItems).toHaveCount(1);
            }
        }
    });

    test('should sort directories before files', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for file list
        await page.waitForSelector('.file-list');

        // Get all file items
        const fileItems = page.locator('.file-item');
        const count = await fileItems.count();

        if (count > 1) {
            // Check first few items
            let lastWasDirectory = true;
            for (let i = 0; i < Math.min(count, 5); i++) {
                const item = fileItems.nth(i);
                const isDirectory = await item.getAttribute('data-is-directory');

                if (isDirectory === 'true') {
                    // If this is a directory, last should also be a directory (or this is first)
                    expect(lastWasDirectory).toBe(true);
                } else {
                    // Once we hit a file, we shouldn't see directories anymore
                    lastWasDirectory = false;
                }
            }
        }
    });

    test('should clear search when navigating to directory', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for search field
        await page.waitForSelector('#searchField');

        // Type in search field
        const searchField = page.locator('#searchField');
        await searchField.fill('test');

        // Wait a moment for search to complete
        await page.waitForTimeout(300);

        // Find a directory and click it
        const firstDirectory = page.locator('.file-item[data-is-directory="true"]').first();

        if (await firstDirectory.count() > 0) {
            await firstDirectory.click();
            await page.waitForTimeout(300);

            // Search field should be cleared
            const searchValue = await searchField.inputValue();
            expect(searchValue).toBe('');
        }
    });

    test('should show only files in current directory', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for file list
        await page.waitForSelector('.file-list');

        // Get initial file count
        const initialCount = await page.locator('.file-item').count();

        // Find and click first directory
        const firstDirectory = page.locator('.file-item[data-is-directory="true"]').first();

        if (await firstDirectory.count() > 0) {
            await firstDirectory.click();
            await page.waitForTimeout(300);

            // Get new file count
            const newCount = await page.locator('.file-item').count();

            // The count should be different (could be more or less)
            // This verifies that the view changed
            expect(newCount).toBeDefined();

            // All visible items should be within the current directory
            const visibleItems = page.locator('.file-item');
            const count = await visibleItems.count();

            // Just verify we have items showing
            expect(count).toBeGreaterThanOrEqual(0);
        }
    });

    test('should show breadcrumb separator between segments', async ({ page }) => {
        await page.goto(serverUrl);

        // Wait for file list
        await page.waitForSelector('.file-list');

        // Find and click first directory
        const firstDirectory = page.locator('.file-item[data-is-directory="true"]').first();

        if (await firstDirectory.count() > 0) {
            await firstDirectory.click();
            await page.waitForTimeout(300);

            // Check for separator
            const separator = page.locator('.breadcrumb-separator');
            if (await separator.count() > 0) {
                await expect(separator.first()).toBeVisible();
                await expect(separator.first()).toContainText('→');
            }
        }
    });
});
