#!/usr/bin/env node

/**
 * Moremaid - Markdown viewer with Mermaid diagram support
 * Refactored modular version
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

// Import modules
const config = require('./lib/config');
const {
    findMarkdownFiles,
    promptPassword,
    findAvailablePort,
    openInBrowser,
    formatSize
} = require('./lib/utils');
const { packMarkdownFiles, handleZipFile } = require('./lib/archive-handler');
const { generateHtmlFromMarkdown } = require('./lib/html-generator');
const { startFolderServer } = require('./lib/server');
const { SingleFileFS } = require('./lib/virtual-fs');
const { validateMarkdown } = require('./lib/validator');
const packageJson = require('./package.json');

// Parse command line arguments
const args = process.argv.slice(2);

// Parse flags
const darkMode = args.includes('--dark') || args.includes('-d');
const packMode = args.includes('--pack') || args.includes('-p');
const keepRunning = args.includes('--keep-running') || args.includes('-k');
const oneShot = args.includes('--oneshot') || args.includes('-o');
const validateMode = args.includes('--validate');
let selectedTheme = null;

const themeIndex = args.findIndex(arg => arg === '--theme' || arg === '-t');
if (themeIndex !== -1 && args[themeIndex + 1]) {
    selectedTheme = args[themeIndex + 1];
}

// Legacy dark mode support
if (darkMode && !selectedTheme) {
    selectedTheme = 'dark';
}

// Handle --version flag
if (args.includes('--version') || args.includes('-v')) {
    console.log(packageJson.version);
    process.exit(0);
}

// Handle --help flag
if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`
moremaid v${packageJson.version}
A command-line tool to view Markdown files with Mermaid diagram support

Usage:
  mm <file.md>                    View a single markdown file
  mm <directory>                   Start a server to browse markdown files
  mm <file.zip|file.moremaid>     Extract and serve archive
  mm --pack <file|directory>       Create .moremaid archive
  mm --validate <file|directory>   Validate markdown and mermaid syntax
  mm --help                        Show this help message
  mm --version                    Show version number

Options:
  -t, --theme <theme>   Set color theme
  -d, --dark           Use dark theme (legacy)
  -p, --pack           Pack files into .moremaid archive
  --validate           Validate markdown and mermaid syntax
  -k, --keep-running   Keep server running after browser closes
  -o, --oneshot        Generate temp HTML and exit (legacy single-file mode)
  -h, --help           Show help
  -v, --version        Show version

Themes:
  ${config.themes.available.join(', ')}

Typography:
  ${config.typography.available.join(', ')}

Examples:
  mm README.md
  mm docs/
  mm --theme github README.md
  mm --pack myproject/
  mm archive.moremaid
  mm --validate README.md
  mm --validate docs/
`);
    process.exit(0);
}

// Get the input file/directory (filtering out flags)
const inputArgs = args.filter((arg, index) => {
    // Skip flags and their values
    if (arg.startsWith('--') || arg.startsWith('-')) return false;
    // Skip theme value if it's right after --theme
    if (themeIndex !== -1 && index === themeIndex + 1) return false;
    return true;
});

if (inputArgs.length === 0 && !args.includes('--help') && !args.includes('-h') && !args.includes('--version') && !args.includes('-v')) {
    console.error('Error: Please provide a markdown file or directory');
    console.error('Use --help for usage information');
    process.exit(1);
}

const inputPath = inputArgs[0];

// Check if input exists
if (!fs.existsSync(inputPath)) {
    console.error(`Error: File or directory not found: ${inputPath}`);
    process.exit(1);
}

// Check for updates using dynamic import
async function checkForUpdates() {
    try {
        const updateNotifier = await import('update-notifier');
        const notifier = updateNotifier.default({
            pkg: packageJson,
            updateCheckInterval: 1000 * 60 * 60 * 24 // Check once per day
        });

        if (notifier.update) {
            notifier.notify({
                isGlobal: true,
                defer: false
            });
        }
    } catch (error) {
        // Silently fail if update-notifier is not available
    }
}

// ANSI color codes for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m'
};

/**
 * Handle validation mode
 */
function handleValidation(inputPath) {
    console.log(`${colors.blue}Validating markdown files...${colors.reset}\n`);

    try {
        const results = validateMarkdown(inputPath);

        if (results.totalStats.filesChecked === 0) {
            console.log(`${colors.yellow}No markdown files found${colors.reset}`);
            process.exit(0);
        }

        // Print results only for files with errors
        for (const fileResult of results.files) {
            if (fileResult.errors.length > 0) {
                const relativePath = path.relative(process.cwd(), fileResult.path);
                console.log(`${colors.red}✗${colors.reset} ${relativePath}`);

                for (const error of fileResult.errors) {
                    const lineInfo = error.line ? `:${error.line}` : '';
                    const typeColor = error.type === 'mermaid' ? colors.yellow : colors.red;
                    console.log(`  ${typeColor}[${error.type}]${colors.reset}${lineInfo} ${error.message}`);
                }
                console.log(''); // Add blank line between files
            }
        }

        // Print summary
        console.log('');
        console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
        console.log(`Files checked:        ${results.totalStats.filesChecked}`);
        console.log(`Files with errors:    ${results.totalStats.filesWithErrors > 0 ? colors.red : colors.green}${results.totalStats.filesWithErrors}${colors.reset}`);
        console.log(`Markdown errors:      ${results.totalStats.markdownErrors > 0 ? colors.red : colors.green}${results.totalStats.markdownErrors}${colors.reset}`);
        console.log(`Mermaid errors:       ${results.totalStats.mermaidErrors > 0 ? colors.yellow : colors.green}${results.totalStats.mermaidErrors}${colors.reset}`);
        console.log(`Mermaid blocks found: ${results.totalStats.mermaidBlocksChecked}`);

        // Exit with error code if there were errors
        if (results.totalStats.filesWithErrors > 0) {
            process.exit(1);
        }

        process.exit(0);
    } catch (error) {
        console.error(`${colors.red}Error:${colors.reset} ${error.message}`);
        process.exit(1);
    }
}

// Main execution
async function main() {
    try {
        // Check for updates (async, non-blocking)
        checkForUpdates().catch(() => {}); // Ignore errors silently

        // Handle validation mode early (before showing version)
        if (validateMode) {
            handleValidation(inputPath);
            return; // handleValidation exits, but adding return for clarity
        }

        console.log(`📊 Moremaid v${packageJson.version}`);

        const stats = fs.statSync(inputPath);

        if (packMode) {
            // Pack mode - create archive
            await packMarkdownFiles(inputPath, stats.isDirectory(), selectedTheme);
        } else if (stats.isDirectory()) {
            // Directory mode - start server
            await startFolderServer(inputPath, false, selectedTheme, keepRunning);
        } else if (inputPath.match(config.archive.supportedExtensions)) {
            // Archive mode - serve directly from ZIP
            const result = await handleZipFile(inputPath);
            if (result) {
                // Pass the VirtualFS instance to the server
                await startFolderServer(result.virtualFS, true, selectedTheme, false);
            }
        } else {
            // Single file mode
            const isMarkdown = inputPath.match(config.markdown.extensions);

            if (oneShot) {
                // Legacy mode: generate temp HTML and exit
                if (isMarkdown) {
                    handleSingleFile(inputPath);
                } else {
                    console.error('Error: --oneshot mode only supports markdown files');
                    process.exit(1);
                }
            } else {
                // New default: start server for single file
                if (isMarkdown) {
                    const singleFileFS = new SingleFileFS(inputPath);
                    await startFolderServer(singleFileFS, false, selectedTheme, keepRunning);
                } else {
                    // For non-markdown files, serve via folder mode with parent directory
                    const parentDir = path.dirname(inputPath);
                    const fileName = path.basename(inputPath);
                    console.log(`📄 Opening ${fileName} in browser...`);
                    // Use folder server but redirect to this specific file
                    await startFolderServer(parentDir, false, selectedTheme, keepRunning, fileName);
                }
            }
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Handle single file
function handleSingleFile(filePath) {
    // Check if it's a markdown file
    if (!filePath.match(config.markdown.extensions)) {
        console.warn('Warning: File does not have a .md extension');
    }

    // Read the markdown file
    const markdown = fs.readFileSync(filePath, 'utf-8');
    const title = path.basename(filePath);

    // Generate HTML
    const html = generateHtmlFromMarkdown(markdown, title, false, false, selectedTheme);

    // Create a temporary HTML file
    const tempFile = path.join(os.tmpdir(), `mm-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html);

    console.log(`📄 Opening ${path.basename(filePath)} in browser...`);

    // Open in browser
    openInBrowser(tempFile);

    // Clean up temp file after a delay
    setTimeout(() => {
        try {
            fs.unlinkSync(tempFile);
        } catch (err) {
            // Ignore cleanup errors
        }
    }, 5000);
}

// Run main function
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});