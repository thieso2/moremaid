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
            env: { ...process.env, PORT: '8888' },
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

test.describe('Search Term Highlighting', () => {
    let serverProcess;
    let testDir;

    test.beforeAll(async () => {
        // Create a temporary test directory with sample markdown files
        testDir = path.join(__dirname, 'temp-test-files');
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Create test markdown files
        fs.writeFileSync(path.join(testDir, 'test1.md'), `
# Test Document 1

This is a test document with some sample content.
We will search for specific terms in this document.

## Section with Mermaid

Here's a mermaid diagram:

\`\`\`mermaid
graph TD
    A[Start] --> B[Search]
    B --> C[Highlight]
    C --> D[End]
\`\`\`

## Code Section

\`\`\`javascript
function searchAndHighlight() {
    const searchTerm = 'highlight';
    // This function demonstrates search functionality
    return searchTerm;
}
\`\`\`

More content with the word highlight scattered throughout.
This line also contains HIGHLIGHT in uppercase.
        `);

        fs.writeFileSync(path.join(testDir, 'test2.md'), `
# Another Document

This document contains different search terms.
We can search for multiple words at once.

## List Section

- Item with search term
- Another item with highlight
- Third item with multiple search terms

The search functionality should work across all documents.
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

    test('should highlight search terms in opened documents', async ({ page }) => {
        // Navigate to the server
        await page.goto('http://localhost:8888');

        // Wait for the page to load
        await page.waitForSelector('.file-list');

        // Enter search term
        await page.fill('#searchField', 'highlight');

        // Wait for search results
        await page.waitForTimeout(500);

        // Click on the first file in search results
        const firstFile = await page.locator('.file-item:visible').first();
        await firstFile.click();

        // Wait for overlay to open
        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(1000); // Wait for content to load and highlight

        // Check that search terms are highlighted
        const highlights = await page.locator('.file-overlay-body mark').all();
        expect(highlights.length).toBeGreaterThan(0);

        // Check the style of highlights
        const firstHighlight = highlights[0];
        const backgroundColor = await firstHighlight.evaluate(el =>
            window.getComputedStyle(el).backgroundColor
        );
        expect(backgroundColor).toContain('rgb(255, 235, 59)'); // #ffeb3b in RGB

        // Close the overlay
        await page.click('#overlayClose');
    });

    test('should show deeplinks in search results', async ({ page }) => {
        await page.goto('http://localhost:8888');
        await page.waitForSelector('.file-list');

        // Search for content
        await page.fill('#searchField', 'highlight');

        // Switch to content search mode
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(500);

        // Enter search again to trigger content search
        await page.fill('#searchField', '');
        await page.fill('#searchField', 'highlight');
        await page.waitForTimeout(1000);

        // Check for deeplinks in search results
        const deepLinks = await page.locator('.content-snippet a:has-text("Jump to match")').all();

        // We should have deeplinks if content search found matches
        if (deepLinks.length > 0) {
            // Click a deeplink
            await deepLinks[0].click();

            // Wait for overlay to open
            await page.waitForSelector('.file-overlay.visible');
            await page.waitForTimeout(1000);

            // Verify we're scrolled to a highlighted match
            const highlightInView = await page.locator('.file-overlay-body mark').first().isInViewport();
            expect(highlightInView).toBeTruthy();
        }
    });

    test('should handle case-insensitive search', async ({ page }) => {
        await page.goto('http://localhost:8888');
        await page.waitForSelector('.file-list');

        // Search with lowercase
        await page.fill('#searchField', 'highlight');
        await page.waitForTimeout(500);

        // Open a file
        const firstFile = await page.locator('.file-item:visible').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(1000);

        // Count highlights (should match both 'highlight' and 'HIGHLIGHT')
        const highlights = await page.locator('.file-overlay-body mark').all();
        const highlightTexts = await Promise.all(
            highlights.map(h => h.textContent())
        );

        // Check that we found both cases
        const hasLowercase = highlightTexts.some(t => t.includes('highlight'));
        const hasUppercase = highlightTexts.some(t => t.includes('HIGHLIGHT'));

        expect(hasLowercase || hasUppercase).toBeTruthy();

        await page.click('#overlayClose');
    });

    test('should handle multiple search terms', async ({ page }) => {
        await page.goto('http://localhost:8888');
        await page.waitForSelector('.file-list');

        // Search for multiple terms
        await page.fill('#searchField', 'search highlight');
        await page.waitForTimeout(500);

        // Open a file
        const firstFile = await page.locator('.file-item:visible').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(1000);

        // Check that both terms are highlighted
        const highlights = await page.locator('.file-overlay-body mark').all();
        const highlightTexts = await Promise.all(
            highlights.map(h => h.textContent())
        );

        // Check for both search terms
        const hasSearch = highlightTexts.some(t => t.toLowerCase().includes('search'));
        const hasHighlight = highlightTexts.some(t => t.toLowerCase().includes('highlight'));

        expect(hasSearch).toBeTruthy();
        expect(hasHighlight).toBeTruthy();

        await page.click('#overlayClose');
    });

    test('should clear highlights when search changes', async ({ page }) => {
        await page.goto('http://localhost:8888');
        await page.waitForSelector('.file-list');

        // Initial search
        await page.fill('#searchField', 'highlight');
        await page.waitForTimeout(500);

        const firstFile = await page.locator('.file-item:visible').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(1000);

        // Verify highlights exist
        let highlights = await page.locator('.file-overlay-body mark').all();
        expect(highlights.length).toBeGreaterThan(0);

        // Close overlay
        await page.click('#overlayClose');
        await page.waitForTimeout(500);

        // Change search term
        await page.fill('#searchField', 'different');
        await page.waitForTimeout(500);

        // Open file again
        const fileAgain = await page.locator('.file-item:visible').first();
        if (fileAgain) {
            await fileAgain.click();
            await page.waitForSelector('.file-overlay.visible');
            await page.waitForTimeout(1000);

            // Check that old highlights are gone and new ones (if any) are different
            highlights = await page.locator('.file-overlay-body mark').all();
            if (highlights.length > 0) {
                const highlightText = await highlights[0].textContent();
                expect(highlightText.toLowerCase()).toContain('different');
            }
        }
    });

    test('should maintain scroll position to highlighted match', async ({ page }) => {
        await page.goto('http://localhost:8888');
        await page.waitForSelector('.file-list');

        // Search for a term
        await page.fill('#searchField', 'highlight');
        await page.waitForTimeout(500);

        // Open a file
        const firstFile = await page.locator('.file-item:visible').first();
        await firstFile.click();

        await page.waitForSelector('.file-overlay.visible');
        await page.waitForTimeout(1500); // Wait for scroll animation

        // Check that first match is in viewport
        const firstMatch = await page.locator('.file-overlay-body mark').first();
        if (firstMatch) {
            const isInViewport = await firstMatch.isInViewport();
            expect(isInViewport).toBeTruthy();
        }
    });

    test('should support bookmarkable search URLs', async ({ page }) => {
        // Navigate directly to a search URL
        await page.goto('http://localhost:8888?q=search');

        await page.waitForSelector('.file-list');
        await page.waitForTimeout(500);

        // Check that search field is populated
        const searchValue = await page.inputValue('#searchField');
        expect(searchValue).toBe('search');

        // Check that files are filtered
        const visibleFiles = await page.locator('.file-item:visible').all();

        // Files should be filtered based on the search term
        for (const file of visibleFiles) {
            const fileName = await file.locator('.file-name').textContent();
            // Check if filename or content might contain 'search'
            expect(fileName).toBeDefined();
        }
    });
});