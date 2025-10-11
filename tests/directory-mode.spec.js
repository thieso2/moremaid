const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const { setTimeout } = require('timers/promises');

let serverProcess;
let port;

test.describe('Directory Mode Navigation', () => {
    test.beforeAll(async () => {
        // Start server with test directory
        port = 8889; // Use a different port to avoid conflicts
        serverProcess = spawn('./mm.js', ['/tmp/moremaid-test'], {
            env: { ...process.env, PORT: port.toString() },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        // Wait for server to start
        await setTimeout(2000);

        // Check if server started successfully
        if (serverProcess.exitCode !== null) {
            throw new Error('Server failed to start');
        }
    });

    test.afterAll(async () => {
        if (serverProcess && !serverProcess.killed) {
            serverProcess.kill('SIGTERM');
            await setTimeout(500);
        }
    });

    test('should display view mode toggle buttons', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);

        // Check for toggle buttons
        const flatBtn = page.locator('#flatModeBtn');
        const dirBtn = page.locator('#dirModeBtn');

        await expect(flatBtn).toBeVisible();
        await expect(dirBtn).toBeVisible();

        // Flat mode should be active by default
        await expect(flatBtn).toHaveClass(/active/);
        await expect(dirBtn).not.toHaveClass(/active/);
    });

    test('should switch to directory mode', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);

        // Click directory mode button
        await page.click('#dirModeBtn');

        // Check that directory mode is active
        await expect(page.locator('#dirModeBtn')).toHaveClass(/active/);
        await expect(page.locator('#flatModeBtn')).not.toHaveClass(/active/);

        // Should show directory items
        await expect(page.locator('.dir-item')).toHaveCount(3); // docs, examples, README.md
    });

    test('should display directories and files in directory mode', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Check for folders (docs, examples)
        const folders = page.locator('.dir-item.folder');
        await expect(folders).toHaveCount(2);

        // Check for file in root (README.md)
        const files = page.locator('.dir-item.file');
        await expect(files).toHaveCount(1);

        // Verify folder names
        await expect(page.locator('.dir-item.folder:has-text("docs")')).toBeVisible();
        await expect(page.locator('.dir-item.folder:has-text("examples")')).toBeVisible();

        // Verify file name
        await expect(page.locator('.dir-item.file:has-text("README.md")')).toBeVisible();
    });

    test('should navigate into a directory', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Click on docs folder
        await page.click('.dir-item.folder:has-text("docs")');

        // Wait for navigation
        await setTimeout(300);

        // Should show subdirectories (api, guides)
        await expect(page.locator('.dir-item.folder:has-text("api")')).toBeVisible();
        await expect(page.locator('.dir-item.folder:has-text("guides")')).toBeVisible();

        // Breadcrumb should be visible
        await expect(page.locator('#breadcrumbContainer')).toBeVisible();
        await expect(page.locator('.breadcrumb-current:has-text("docs")')).toBeVisible();
    });

    test('should display breadcrumb navigation', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Navigate to docs/api
        await page.click('.dir-item.folder:has-text("docs")');
        await setTimeout(300);
        await page.click('.dir-item.folder:has-text("api")');
        await setTimeout(300);

        // Check breadcrumbs
        await expect(page.locator('.breadcrumb-link:has-text("Root")')).toBeVisible();
        await expect(page.locator('.breadcrumb-link:has-text("docs")')).toBeVisible();
        await expect(page.locator('.breadcrumb-current:has-text("api")')).toBeVisible();

        // Should show files in api directory
        await expect(page.locator('.dir-item.file:has-text("endpoints.md")')).toBeVisible();
        await expect(page.locator('.dir-item.file:has-text("authentication.md")')).toBeVisible();
    });

    test('should navigate back using breadcrumbs', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Navigate deep
        await page.click('.dir-item.folder:has-text("docs")');
        await setTimeout(300);
        await page.click('.dir-item.folder:has-text("api")');
        await setTimeout(300);

        // Click on "docs" in breadcrumb
        await page.click('.breadcrumb-link:has-text("docs")');
        await setTimeout(300);

        // Should be back in docs directory
        await expect(page.locator('.breadcrumb-current:has-text("docs")')).toBeVisible();
        await expect(page.locator('.dir-item.folder:has-text("api")')).toBeVisible();
        await expect(page.locator('.dir-item.folder:has-text("guides")')).toBeVisible();
    });

    test('should navigate to root using breadcrumb', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Navigate deep
        await page.click('.dir-item.folder:has-text("docs")');
        await setTimeout(300);

        // Click on Root in breadcrumb
        await page.click('.breadcrumb-link:has-text("Root")');
        await setTimeout(300);

        // Should be at root
        await expect(page.locator('#breadcrumbContainer')).not.toBeVisible();
        await expect(page.locator('.dir-item.folder:has-text("docs")')).toBeVisible();
        await expect(page.locator('.dir-item.folder:has-text("examples")')).toBeVisible();
    });

    test('should open file in directory mode', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Navigate to docs/api
        await page.click('.dir-item.folder:has-text("docs")');
        await setTimeout(300);
        await page.click('.dir-item.folder:has-text("api")');
        await setTimeout(300);

        // Click on a file
        await page.click('.dir-item.file:has-text("endpoints.md")');

        // File overlay should open
        await expect(page.locator('#fileOverlay')).toHaveClass(/visible/);
        await expect(page.locator('#overlayTitle')).toContainText('endpoints.md');
    });

    test('should persist view mode in localStorage', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);

        // Switch to directory mode
        await page.click('#dirModeBtn');
        await setTimeout(200);

        // Reload page
        await page.reload();
        await setTimeout(500);

        // Should still be in directory mode
        await expect(page.locator('#dirModeBtn')).toHaveClass(/active/);
        await expect(page.locator('.dir-item')).toBeVisible();
    });

    test('should switch back to flat mode', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);

        // Switch to directory mode first
        await page.click('#dirModeBtn');
        await setTimeout(200);

        // Switch back to flat mode
        await page.click('#flatModeBtn');
        await setTimeout(200);

        // Should show flat list
        await expect(page.locator('#flatModeBtn')).toHaveClass(/active/);
        await expect(page.locator('.file-list-flat')).toBeVisible();
        await expect(page.locator('#breadcrumbContainer')).not.toBeVisible();

        // Should show all files in flat list
        await expect(page.locator('.file-item')).toHaveCount(5); // All 5 files
    });

    test('should display file count in directory items', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Check that folder has file count badge
        const docsFolder = page.locator('.dir-item.folder:has-text("docs")');
        await expect(docsFolder.locator('.dir-count')).toBeVisible();
        await expect(docsFolder.locator('.dir-count')).toContainText('3'); // 3 files total in docs
    });

    test('should hide breadcrumbs when switching to flat mode', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await page.click('#dirModeBtn');

        // Navigate into a directory
        await page.click('.dir-item.folder:has-text("docs")');
        await setTimeout(300);

        // Breadcrumbs should be visible
        await expect(page.locator('#breadcrumbContainer')).toBeVisible();

        // Switch to flat mode
        await page.click('#flatModeBtn');
        await setTimeout(200);

        // Breadcrumbs should be hidden
        await expect(page.locator('#breadcrumbContainer')).not.toBeVisible();
    });
});
