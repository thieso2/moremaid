#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const http = require('http');
const url = require('url');
const readline = require('readline');
const os = require('os');
const { marked } = require('marked');
const MiniSearch = require('minisearch');
const archiver = require('archiver');
const archiverZipEncrypted = require('archiver-zip-encrypted');
const unzipper = require('unzipper');
const { BlobReader, BlobWriter, ZipReader, TextWriter } = require('@zip.js/zip.js');
const WebSocket = require('ws');
const packageJson = require('./package.json');

// Parse command line arguments
const args = process.argv.slice(2);

// Check for dark mode flag (legacy support)
const darkMode = args.includes('--dark') || args.includes('-d');

// Check for pack flag
const packMode = args.includes('--pack') || args.includes('-p');

// Check for theme flag
let selectedTheme = null;
const themeIndex = args.findIndex(arg => arg === '--theme' || arg === '-t');
if (themeIndex !== -1 && args[themeIndex + 1]) {
    selectedTheme = args[themeIndex + 1];
}
// If dark mode flag is set but no theme specified, use 'dark' theme
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

Usage: mm [options] <markdown-file-or-folder>

Options:
  -h, --help          Show this help message
  -v, --version       Show version number
  -d, --dark          Start in dark mode (shortcut for --theme dark)
  -t, --theme <name>  Select color theme:
                      light, dark, github, github-dark, dracula,
                      nord, solarized-light, solarized-dark,
                      monokai, one-dark
  -p, --pack          Pack all markdown files into a .moremaid file
                      (prompts for optional password)

Examples:
  mm README.md              View a markdown file
  mm docs/guide.md          View a file in a subdirectory
  mm ~/notes/meeting.md     View a file with absolute path
  mm .                      View all markdown files in current directory (starts server)
  mm docs                   View all markdown files in docs folder (starts server)
  mm --pack .               Pack all markdown files (prompts for password)
  mm --pack docs            Pack all markdown files in docs folder

Features:
  • Renders Mermaid diagrams (flowcharts, sequence diagrams, etc.)
  • Syntax highlighting for code blocks
  • Opens in your default browser
  • Folder mode starts a local server for navigation
  • No external server required for single files

For more information, visit: https://github.com/thieso2/moremaid
`);
    process.exit(0);
}

// Get the input file or folder (first non-flag argument, excluding theme values)
const inputPath = args.find((arg, index) => {
    // Skip flags
    if (arg.startsWith('-')) return false;
    // Skip if this is a theme value (follows --theme or -t)
    const prevArg = args[index - 1];
    if (prevArg && (prevArg === '--theme' || prevArg === '-t')) return false;
    return true;
});

if (!inputPath) {
    console.error('Error: No markdown file or folder specified');
    console.error('Usage: mm <markdown-file-or-folder>');
    console.error('Try "mm --help" for more information');
    process.exit(1);
}

// Check if path exists
if (!fs.existsSync(inputPath)) {
    console.error(`Error: Path '${inputPath}' not found`);
    process.exit(1);
}

// Determine if it's a file or directory
const stats = fs.statSync(inputPath);

if (packMode) {
    // Handle pack mode - create zip file
    packMarkdownFiles(inputPath, stats.isDirectory());
} else if (stats.isDirectory()) {
    // Handle directory mode - start HTTP server
    startFolderServer(inputPath);
} else if (inputPath.match(/\.(zip|moremaid)$/i)) {
    // Handle zip file - extract and serve
    handleZipFile(inputPath);
} else {
    // Handle single file mode
    handleSingleFile(inputPath);
}

// Function to handle single file mode
function handleSingleFile(filePath) {
    // Check if it's a markdown file
    if (!filePath.match(/\.(md|markdown)$/i)) {
        console.warn('Warning: File does not have a .md extension');
    }

    // Read the markdown file
    const markdown = fs.readFileSync(filePath, 'utf-8');
    const title = path.basename(filePath);

    // Generate HTML
    const html = generateHtmlFromMarkdown(markdown, title, false, false, selectedTheme);

    // Create a temporary HTML file
    const tempFile = path.join(require('os').tmpdir(), `mm-${Date.now()}.html`);
    fs.writeFileSync(tempFile, html);

    // Determine the command to open the file based on the platform
    let openCommand;
    switch (process.platform) {
        case 'darwin': // macOS
            openCommand = 'open';
            break;
        case 'win32': // Windows
            openCommand = 'start';
            break;
        default: // Linux and others
            openCommand = 'xdg-open';
    }

    // Output version info and open the file
    console.log(`📊 Moremaid v${packageJson.version}`);
    console.log(`📄 Opening ${path.basename(filePath)} in browser...`);

    // Open the file in the default browser
    exec(`${openCommand} "${tempFile}"`, (error) => {
        if (error) {
            console.error('Error opening file:', error);
            console.log(`HTML file saved to: ${tempFile}`);
            process.exit(1);
        }

        // Clean up temp file after a delay (give browser time to load)
        setTimeout(() => {
            try {
                fs.unlinkSync(tempFile);
            } catch (err) {
                // Ignore cleanup errors
            }
        }, 5000);
    });
}

// Function to handle zip file extraction and serving
async function handleZipFile(zipPath) {
    console.log(`📊 Moremaid v${packageJson.version}`);
    console.log(`📦 Opening zip file: ${path.basename(zipPath)}`);

    // Create a temporary directory for extraction
    const tempDir = path.join(os.tmpdir(), `mm-extract-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Track if cleanup is done to avoid double cleanup
    let cleanupDone = false;

    // Cleanup function
    const cleanup = () => {
        if (cleanupDone) return;
        cleanupDone = true;

        console.log('\n🧹 Cleaning up temporary files...');
        try {
            // Remove the temporary directory recursively
            fs.rmSync(tempDir, { recursive: true, force: true });
            console.log('✅ Cleanup complete');
        } catch (e) {
            console.error('⚠️  Error during cleanup:', e.message);
        }
        process.exit(0);
    };

    // Register cleanup handlers
    process.on('SIGINT', cleanup);  // Ctrl+C
    process.on('SIGTERM', cleanup); // Kill signal
    process.on('exit', cleanup);    // Normal exit

    try {
        // Use zip.js for extraction (supports AES-256)
        const zipFileBuffer = fs.readFileSync(zipPath);
        const zipBlob = new Blob([zipFileBuffer]);
        const zipReader = new ZipReader(new BlobReader(zipBlob));

        let entries;
        let password = null;

        // Try to get entries without password first
        try {
            entries = await zipReader.getEntries();
            // Check if any entry is encrypted
            const hasEncrypted = entries.some(entry => entry.encrypted);

            if (hasEncrypted) {
                // Need password - prompt for it
                password = await promptPassword('Enter password for zip file: ');
                // Close and reopen with password
                await zipReader.close();
                const newZipReader = new ZipReader(new BlobReader(zipBlob), { password });
                entries = await newZipReader.getEntries();
            }
        } catch (err) {
            if (err.message && (err.message.includes('password') || err.message.includes('encrypted'))) {
                // Need password - prompt for it
                password = await promptPassword('Enter password for zip file: ');
                // Try again with password
                await zipReader.close();
                const newZipReader = new ZipReader(new BlobReader(zipBlob), { password });
                try {
                    entries = await newZipReader.getEntries();
                } catch (err2) {
                    console.error('❌ Incorrect password or corrupted file');
                    cleanup();
                    return;
                }
            } else {
                throw err;
            }
        }

        // Extract all entries
        for (const entry of entries) {
            if (!entry.directory) {
                const outputPath = path.join(tempDir, entry.filename);

                // Create directory if needed
                fs.mkdirSync(path.dirname(outputPath), { recursive: true });

                // Get file content
                const writer = new BlobWriter();
                const content = await entry.getData(writer, { password });
                const buffer = Buffer.from(await content.arrayBuffer());

                // Write to file
                fs.writeFileSync(outputPath, buffer);
            }
        }

        await zipReader.close();

        console.log('✅ Extraction complete');

        // Get statistics instead of listing files
        const extractedFiles = fs.readdirSync(tempDir);
        let totalSize = 0;
        extractedFiles.forEach(file => {
            const stats = fs.statSync(path.join(tempDir, file));
            if (stats.isFile()) {
                totalSize += stats.size;
            }
        });

        // Find markdown files in the extracted directory
        const mdFiles = findMarkdownFiles(tempDir);

        if (mdFiles.length === 0) {
            console.error('❌ No markdown files found in the zip archive');
            cleanup();
            return;
        }

        // Show extraction statistics
        const sizeKB = (totalSize / 1024).toFixed(1);
        console.log(`📊 Extracted ${extractedFiles.length} file(s), ${sizeKB} KB total`);
        console.log(`📄 Found ${mdFiles.length} markdown file(s)`);

        // Start the server with the temporary directory
        const server = await startFolderServer(tempDir, true);

        // Override server close to trigger cleanup
        const originalClose = server.close.bind(server);
        server.close = (callback) => {
            originalClose(() => {
                cleanup();
                if (callback) callback();
            });
        };

    } catch (error) {
        console.error('❌ Error extracting zip file:', error.message);
        cleanup();
    }
}

// Function to recursively find markdown files
function findMarkdownFiles(dir, baseDir = dir) {
    let files = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
        // Skip hidden files and node_modules
        if (item.startsWith('.') || item === 'node_modules') continue;

        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            files = files.concat(findMarkdownFiles(fullPath, baseDir));
        } else if (item.match(/\.(md|markdown)$/i)) {
            files.push(path.relative(baseDir, fullPath));
        }
    }

    return files.sort();
}

// Function to prompt for password with hidden input
function promptPassword(query) {
    return new Promise((resolve, reject) => {
        const input = process.stdin;
        const output = process.stdout;

        // For non-TTY (piped input), read normally
        if (!output.isTTY || !input.isTTY) {
            const rl = readline.createInterface({ input, output });
            // Write prompt to stderr so it shows even with piped input
            process.stderr.write(query);
            rl.question('', (answer) => {
                rl.close();
                resolve(answer);
            });
            return;
        }

        // For TTY, hide the input - don't use readline here as it interferes
        output.write(query);

        // Turn off echo by setting raw mode
        if (!input.setRawMode) {
            // Fallback if setRawMode is not available
            const rl = readline.createInterface({ input, output });
            rl.question('', (answer) => {
                rl.close();
                resolve(answer);
            });
            return;
        }

        input.setRawMode(true);

        // Resume stdin in raw mode without encoding
        input.resume();

        let password = '';

        const onData = (chunk) => {
            // Convert buffer to string
            const char = chunk.toString('utf8');
            // Handle Enter/Return
            if (char === '\r' || char === '\n') {
                output.write('\n');
                cleanup();
                resolve(password);
                return;
            }

            // Handle Ctrl+C
            if (char === '\u0003') {
                cleanup();
                process.exit(0);
                return;
            }

            // Handle Backspace or Delete
            if (char === '\u0008' || char === '\u007F') {
                if (password.length > 0) {
                    password = password.slice(0, -1);
                    // Erase one asterisk
                    output.write('\b \b');
                }
                return;
            }

            // Ignore other control characters
            if (char < ' ' || char > '~') return;

            // Append character (don't show anything for cleaner experience)
            password += char;
            // Optionally show asterisk - comment out if double-echoing occurs
            // output.write('*');
        };

        const cleanup = () => {
            input.removeListener('data', onData);
            input.pause();
            if (input.setRawMode) {
                input.setRawMode(false);
            }
        };

        input.on('data', onData);
    });
}

// Function to pack markdown files into a zip
async function packMarkdownFiles(inputPath, isDirectory) {
    const baseDir = isDirectory ? path.resolve(inputPath) : path.dirname(path.resolve(inputPath));
    const baseName = path.basename(baseDir === '.' ? process.cwd() : baseDir);
    const outputFile = `${baseName}.moremaid`;

    // Find markdown files
    let mdFiles = [];
    if (isDirectory) {
        mdFiles = findMarkdownFiles(baseDir);
    } else {
        // Single file mode
        if (inputPath.match(/\.(md|markdown)$/i)) {
            mdFiles = [path.basename(inputPath)];
        } else {
            console.error('Error: Input file is not a markdown file');
            process.exit(1);
        }
    }

    if (mdFiles.length === 0) {
        console.error('No markdown files found in the specified path');
        process.exit(1);
    }

    // Prompt for password to avoid command line exposure
    const finalPassword = await promptPassword('Enter password for zip encryption (optional, press Enter to skip): ');

    // Register the encrypted format if password is provided
    if (finalPassword) {
        archiver.registerFormat('zip-encrypted', archiverZipEncrypted);
    }

    // Create a file to stream archive data to
    const output = fs.createWriteStream(outputFile);
    const archive = finalPassword
        ? archiver.create('zip-encrypted', {
            zlib: { level: 9 },
            encryptionMethod: 'aes256',
            password: finalPassword
        })
        : archiver('zip', {
            zlib: { level: 9 } // Maximum compression
        });

    // Listen for all archive data to be written
    output.on('close', () => {
        const sizeKB = (archive.pointer() / 1024).toFixed(2);
        console.log(`📦 Created ${outputFile} (${sizeKB} KB)`);
        console.log(`   Contains ${mdFiles.length} markdown file(s)`);
        if (finalPassword) {
            console.log(`   🔒 Password-protected with AES-256 encryption`);
        }
    });

    // Good practice to catch warnings
    archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
            console.warn('Warning:', err);
        } else {
            throw err;
        }
    });

    // Good practice to catch this error explicitly
    archive.on('error', (err) => {
        throw err;
    });

    // Pipe archive data to the file
    archive.pipe(output);

    console.log(`📊 Moremaid v${packageJson.version}`);
    console.log(`📁 Packing markdown files from ${isDirectory ? 'directory' : 'file'}: ${inputPath}`);
    console.log(`   Found ${mdFiles.length} file(s) to pack`);

    // Add files to the archive
    mdFiles.forEach(file => {
        const fullPath = path.join(baseDir, file);
        archive.file(fullPath, { name: file });
    });

    // Create a manifest file with metadata
    const manifest = {
        version: packageJson.version,
        created: new Date().toISOString(),
        source: path.basename(baseDir),
        files: mdFiles,
        totalFiles: mdFiles.length
    };

    archive.append(JSON.stringify(manifest, null, 2), { name: 'moremaid.manifest.json' });

    // Finalize the archive
    archive.finalize();
}

// Function to generate folder index markdown
function generateFolderIndex(folderPath, files, port = 8080) {
    const folderName = path.basename(folderPath) || 'Directory';
    let markdown = `# 📁 ${folderName}\n\n`;
    markdown += `Found ${files.length} markdown file${files.length === 1 ? '' : 's'}:\n\n`;

    // Group files by directory
    const filesByDir = {};
    files.forEach(file => {
        const dir = path.dirname(file);
        if (!filesByDir[dir]) filesByDir[dir] = [];
        filesByDir[dir].push(file);
    });

    // Generate markdown list
    Object.keys(filesByDir).sort().forEach(dir => {
        if (dir !== '.') {
            markdown += `\n## 📂 ${dir}\n\n`;
        }

        filesByDir[dir].forEach(file => {
            const fileName = path.basename(file);
            markdown += `- [${fileName}](/view?file=${encodeURIComponent(file)})\n`;
        });
    });

    markdown += '\n---\n';
    markdown += `\n*Server running on http://localhost:${port} • Press Ctrl+C to stop*\n`;

    return markdown;
}

// Function to generate index HTML with search functionality
function generateIndexHtmlWithSearch(folderPath, files, port, forceTheme = null) {
    const folderName = path.basename(folderPath) || 'Directory';

    // Prepare file data WITHOUT content for initial load
    // Content will be loaded via API to avoid script injection issues
    const fileData = files.map((file, index) => {
        const fullPath = path.join(folderPath, file);
        const stats = fs.statSync(fullPath);

        // Format file size in human readable format
        const formatSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
            return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
        };

        return {
            id: index,
            path: file,
            fileName: path.basename(file),
            directory: path.dirname(file) === '.' ? '' : path.dirname(file),
            size: formatSize(stats.size),
            modified: stats.mtime.toLocaleDateString() + ' ' + stats.mtime.toLocaleTimeString()
            // Content removed - will be loaded via /api/files endpoint
        };
    });

    // Get theme CSS variables from generateHtmlFromMarkdown
    const dummyHtml = generateHtmlFromMarkdown('', 'dummy', true, true, forceTheme);
    const styleMatch = dummyHtml.match(/<style>([\s\S]*?)<\/style>/);
    const styles = styleMatch ? styleMatch[1] : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Index of ${folderName}</title>
    <style>
        ${styles}

        /* Typography Themes */
        /* Default - balanced style */
        [data-typography="default"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            --font-code: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
            --font-size-base: 16px;
            --line-height: 1.6;
            --paragraph-spacing: 1em;
            --max-width: 900px;
            --text-align: left;
        }

        /* GitHub - Clean sans-serif style */
        [data-typography="github"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            --font-code: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            --font-size-base: 16px;
            --line-height: 1.5;
            --paragraph-spacing: 16px;
            --max-width: 980px;
            --text-align: left;
        }

        /* LaTeX - Academic style with Latin Modern fonts */
        [data-typography="latex"] {
            --font-body: 'Latin Modern Roman', 'Computer Modern', 'Georgia', serif;
            --font-heading: 'Latin Modern Roman', 'Computer Modern', 'Georgia', serif;
            --font-code: 'Latin Modern Mono', 'Computer Modern Typewriter', 'Courier New', monospace;
            --font-size-base: 12pt;
            --line-height: 1.4;
            --paragraph-spacing: 0.5em;
            --max-width: 6.5in;
            --text-align: justify;
        }

        /* Tufte - Edward Tufte's elegant style */
        [data-typography="tufte"] {
            --font-body: et-book, Palatino, 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', Georgia, serif;
            --font-heading: et-book, Palatino, 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', Georgia, serif;
            --font-code: Consolas, 'Liberation Mono', Menlo, Courier, monospace;
            --font-size-base: 15px;
            --line-height: 2;
            --paragraph-spacing: 1.4rem;
            --max-width: 1400px;
            --text-align: left;
        }

        /* Medium - Blog article style */
        [data-typography="medium"] {
            --font-body: charter, Georgia, Cambria, 'Times New Roman', Times, serif;
            --font-heading: 'Lucida Grande', 'Lucida Sans Unicode', 'Lucida Sans', Geneva, Arial, sans-serif;
            --font-code: 'Menlo', 'Monaco', 'Courier New', Courier, monospace;
            --font-size-base: 21px;
            --line-height: 1.58;
            --paragraph-spacing: 1.5em;
            --max-width: 700px;
            --text-align: left;
        }

        /* Compact - Dense layout */
        [data-typography="compact"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-code: 'Monaco', 'Menlo', monospace;
            --font-size-base: 14px;
            --line-height: 1.3;
            --paragraph-spacing: 0.5em;
            --max-width: 1200px;
            --text-align: left;
        }

        /* Wide - Full width */
        [data-typography="wide"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-code: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            --font-size-base: 16px;
            --line-height: 1.6;
            --paragraph-spacing: 1em;
            --max-width: 100%;
            --text-align: left;
        }

        /* Newspaper - Multi-column layout */
        [data-typography="newspaper"] {
            --font-body: 'Times New Roman', Times, serif;
            --font-heading: 'Georgia', 'Times New Roman', serif;
            --font-code: 'Courier New', Courier, monospace;
            --font-size-base: 16px;
            --line-height: 1.4;
            --paragraph-spacing: 0.8em;
            --max-width: 100%;
            --text-align: justify;
        }

        /* Terminal - Monospace heavy */
        [data-typography="terminal"] {
            --font-body: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
            --font-heading: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
            --font-code: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
            --font-size-base: 14px;
            --line-height: 1.5;
            --paragraph-spacing: 1em;
            --max-width: 1000px;
            --text-align: left;
        }

        /* Book - Novel/book style */
        [data-typography="book"] {
            --font-body: 'Crimson Text', 'Baskerville', 'Georgia', serif;
            --font-heading: 'Crimson Text', 'Baskerville', 'Georgia', serif;
            --font-code: 'Courier New', Courier, monospace;
            --font-size-base: 18px;
            --line-height: 1.8;
            --paragraph-spacing: 0;
            --max-width: 650px;
            --text-align: justify;
        }

        /* Apply typography variables */
        body {
            font-family: var(--font-body);
            font-size: var(--font-size-base);
            line-height: var(--line-height);
        }

        .container {
            max-width: var(--max-width);
            margin: 0 auto;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: var(--font-heading);
        }

        p {
            margin-bottom: var(--paragraph-spacing);
            text-align: var(--text-align);
        }

        code, pre {
            font-family: var(--font-code) !important;
        }

        /* Book style - indent paragraphs */
        [data-typography="book"] p + p {
            text-indent: 2em;
        }

        /* Newspaper - multi-column for wide screens */
        @media (min-width: 1200px) {
            [data-typography="newspaper"] .file-list-flat {
                column-count: 3;
                column-gap: 2em;
                column-rule: 1px solid var(--border-color);
            }

            [data-typography="newspaper"] .file-item {
                break-inside: avoid;
            }
        }

        /* Search field styles */
        .search-container {
            position: fixed;
            top: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 90%;
            max-width: 600px;
            padding: 15px;
            background: var(--bg-color);
            border-bottom: 1px solid var(--border-color);
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .search-field {
            flex: 1;
            padding: 10px 14px;
            font-size: 14px;
            border: 2px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-color);
            color: var(--text-color);
            transition: border-color 0.2s;
        }

        .search-field:focus {
            outline: none;
            border-color: var(--link-color);
        }

        /* File list highlighting for search results */
        .file-item mark {
            background: var(--link-color);
            color: var(--bg-color);
            padding: 0 2px;
            border-radius: 2px;
        }

        .file-item .content-snippet {
            margin-top: 8px;
            margin-left: 20px;
            padding: 8px 12px;
            background: var(--code-bg);
            border-left: 3px solid var(--link-color);
            border-radius: 0 4px 4px 0;
            font-size: 13px;
            line-height: 1.5;
            color: var(--file-info-color);
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }

        .file-item .content-snippet mark {
            background: var(--link-color);
            color: var(--bg-color);
            padding: 1px 3px;
            border-radius: 2px;
            font-weight: 500;
        }

        .file-item .match-count {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 6px;
            background: var(--link-color);
            color: var(--bg-color);
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
        }

        .no-results {
            padding: 40px;
            text-align: center;
            color: var(--file-info-color);
            font-size: 16px;
        }

        .search-scope {
            font-size: 13px;
            color: var(--file-info-color);
            white-space: nowrap;
            padding: 4px 8px;
            border-radius: 4px;
            transition: all 0.2s;
        }

        .search-scope.content-mode {
            background: var(--link-color);
            color: var(--bg-color);
            font-weight: 500;
        }

        .file-list {
            margin-top: 80px;
        }

        /* Controls styling for index page */
        .controls-trigger {
            position: fixed;
            top: 0;
            right: 0;
            width: 150px;
            height: 100px;
            z-index: 999;
            cursor: default;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            gap: 10px;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .controls-trigger:hover ~ .controls,
        .controls:hover {
            opacity: 1;
            visibility: visible;
        }

        .controls select {
            background: var(--heading-color);
            color: var(--bg-color);
            border: none;
            border-radius: 8px;
            padding: 10px 15px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transition: transform 0.2s, opacity 0.3s;
            appearance: none;
            padding-right: 35px;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 20px;
        }

        .controls select:hover {
            transform: translateY(-2px);
        }

        .zoom-control {
            display: flex;
            align-items: center;
            gap: 5px;
            background: var(--heading-color);
            border-radius: 8px;
            padding: 5px 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }

        .zoom-control button {
            background: none;
            border: none;
            color: var(--bg-color);
            font-size: 18px;
            cursor: pointer;
            padding: 0 8px;
            line-height: 1;
            transition: opacity 0.2s;
        }

        .zoom-control button:hover {
            opacity: 0.8;
        }

        .zoom-value {
            color: var(--bg-color);
            font-size: 14px;
            min-width: 45px;
            text-align: center;
        }

        .file-list-flat {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .file-item {
            padding: 4px 0;
            line-height: 1.5;
        }

        .file-item-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .file-meta {
            color: #888;
            font-size: 0.85em;
            margin-left: 1em;
            white-space: nowrap;
        }

        .file-item a {
            color: var(--text-color);
            text-decoration: none;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 14px;
        }

        .file-item a:hover {
            color: var(--link-color);
            text-decoration: underline;
        }

        .hidden {
            display: none !important;
        }


        /* Content snippet styles */
        .content-snippet {
            margin-top: 8px;
            padding: 8px 12px;
            background: var(--code-bg);
            border-radius: 4px;
            font-size: 13px;
            line-height: 1.5;
            color: var(--file-info-color);
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .content-snippet mark {
            background: var(--link-color);
            color: var(--bg-color);
            padding: 1px 3px;
            border-radius: 2px;
            font-weight: 500;
        }

        .content-snippet .context-line {
            opacity: 0.7;
            font-style: italic;
        }

        .content-snippet .match-line {
            font-weight: 500;
        }

        .match-count {
            display: inline-block;
            margin-left: 8px;
            padding: 2px 6px;
            background: var(--link-color);
            color: var(--bg-color);
            border-radius: 10px;
            font-size: 11px;
            font-weight: bold;
        }
    </style>
</head>
<body data-typography="default">
    <div class="search-container">
        <input
            type="text"
            class="search-field"
            id="searchField"
            placeholder="Search ${files.length} files (TAB to toggle mode)"
            autocomplete="off"
        />
        <span class="search-scope" id="searchScope">in names & paths</span>
    </div>

    <div class="controls-trigger"></div>
    <div class="controls">
        <div class="zoom-control">
            <button id="zoomOut" title="Zoom out">−</button>
            <span class="zoom-value" id="zoomValue">100%</span>
            <button id="zoomIn" title="Zoom in">+</button>
            <button id="zoomReset" title="Reset zoom">⟲</button>
        </div>
        <select id="themeSelector" title="Select color theme">
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="github">📘 GitHub</option>
            <option value="github-dark">📕 GitHub Dark</option>
            <option value="dracula">🧛 Dracula</option>
            <option value="nord">❄️ Nord</option>
            <option value="solarized-light">🌅 Solarized Light</option>
            <option value="solarized-dark">🌃 Solarized Dark</option>
            <option value="monokai">🎨 Monokai</option>
            <option value="one-dark">🌑 One Dark</option>
        </select>
        <select id="typographySelector" title="Select typography theme">
            <option value="default">Default</option>
            <option value="github">GitHub</option>
            <option value="latex">LaTeX</option>
            <option value="tufte">Tufte</option>
            <option value="medium">Medium</option>
            <option value="compact">Compact</option>
            <option value="wide">Wide</option>
            <option value="newspaper">Newspaper</option>
            <option value="terminal">Terminal</option>
            <option value="book">Book</option>
        </select>
    </div>
    <div class="zoom-container" id="zoomContainer">
        <div class="container">
            <div class="file-list" id="fileList">
                ${generateFileListHTML(fileData)}
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/minisearch@7/dist/umd/index.min.js"></script>
    <script>
        // File data
        const allFiles = ${JSON.stringify(fileData)};

        // Initialize MiniSearch for filename search only
        const contentIndex = new MiniSearch({
            fields: ['fileName', 'path'],
            storeFields: ['path', 'fileName', 'directory'],
            searchOptions: {
                boost: { fileName: 2 },
                fuzzy: 0.2,
                prefix: true
            }
        });

        // Add all documents to the index
        contentIndex.addAll(allFiles);

        // Search functionality
        const searchField = document.getElementById('searchField');
        const searchScope = document.getElementById('searchScope');
        const fileList = document.getElementById('fileList');
        let searchInContent = false;

        // Get initial search state from URL
        const urlParams = new URLSearchParams(window.location.search);
        const initialQuery = urlParams.get('q') || '';
        const initialMode = urlParams.get('mode') === 'content';

        // Set initial state
        if (initialQuery) {
            searchField.value = initialQuery;
        }
        if (initialMode) {
            searchInContent = true;
            searchScope.textContent = 'in file contents';
            searchScope.classList.add('content-mode');
        }

        // Update URL without page reload
        function updateURL(query, mode) {
            const url = new URL(window.location);
            if (query) {
                url.searchParams.set('q', query);
            } else {
                url.searchParams.delete('q');
            }
            if (mode) {
                url.searchParams.set('mode', 'content');
            } else {
                url.searchParams.delete('mode');
            }
            window.history.replaceState({}, '', url);
        }

        // Highlight matching text
        function highlightMatch(text, query) {
            if (!query) return text;
            // Simple case-insensitive highlighting without regex
            const lowerText = text.toLowerCase();
            const lowerQuery = query.toLowerCase();
            let result = '';
            let lastIndex = 0;
            let index = lowerText.indexOf(lowerQuery);

            while (index !== -1) {
                result += text.slice(lastIndex, index);
                result += '<mark>' + text.slice(index, index + query.length) + '</mark>';
                lastIndex = index + query.length;
                index = lowerText.indexOf(lowerQuery, lastIndex);
            }
            result += text.slice(lastIndex);
            return result;
        }

        // Extract snippet - disabled since content search is removed
        function extractSnippet(text, query, maxLength = 150) {
            return ''; // Content search disabled
        }

        // Filter files based on query
        async function filterFiles(query) {
            if (!query) return allFiles;

            if (searchInContent) {
                // Use API for content search
                try {
                    const response = await fetch('/api/search?q=' + encodeURIComponent(query) + '&mode=content');
                    if (response.ok) {
                        const results = await response.json();
                        return results;
                    }
                } catch (error) {
                    console.error('Content search failed:', error);
                    // Fall back to filename search
                }
            }

            // Filename search (local)
            const lowerQuery = query.toLowerCase();
            return allFiles.filter(file => {
                const fullPath = file.directory ? file.directory + '/' + file.fileName : file.fileName;
                return fullPath.toLowerCase().includes(lowerQuery);
            }).sort((a, b) => {
                // Sort by relevance (filename matches first, then path matches)
                const aFileName = a.fileName.toLowerCase();
                const bFileName = b.fileName.toLowerCase();
                const aPath = (a.directory + '/' + a.fileName).toLowerCase();
                const bPath = (b.directory + '/' + b.fileName).toLowerCase();

                const aFileMatch = aFileName.includes(lowerQuery);
                const bFileMatch = bFileName.includes(lowerQuery);

                if (aFileMatch && !bFileMatch) return -1;
                if (!aFileMatch && bFileMatch) return 1;

                // If both match in filename or both don't, sort by position
                const aIndex = aFileMatch ? aFileName.indexOf(lowerQuery) : aPath.indexOf(lowerQuery);
                const bIndex = bFileMatch ? bFileName.indexOf(lowerQuery) : bPath.indexOf(lowerQuery);

                return aIndex - bIndex;
            });
        }

        // Update filtered file list
        async function updateSuggestions(query) {
            const filteredFiles = await filterFiles(query);

            // Update URL with current search state
            updateURL(query, searchInContent);

            if (!query) {
                // Show all files
                document.querySelectorAll('.file-item').forEach(item => {
                    item.classList.remove('hidden');

                    // Remove any content snippets
                    const snippets = item.querySelectorAll('.content-snippet');
                    snippets.forEach(s => s.remove());

                    const link = item.querySelector('a');
                    if (link) {
                        // Remove highlighting and match counts
                        const originalText = link.textContent.replace(/ \d+ match(es)?$/, '');
                        link.innerHTML = originalText;
                    }
                });

                // Remove "no results" message if it exists
                const noResults = fileList.querySelector('.no-results');
                if (noResults) {
                    noResults.remove();
                }
                return;
            }

            if (filteredFiles.length === 0) {
                // Hide all files
                document.querySelectorAll('.file-item').forEach(item => {
                    item.classList.add('hidden');
                });

                // Show "no results" message in the file list
                let noResults = fileList.querySelector('.no-results');
                if (!noResults) {
                    noResults = document.createElement('div');
                    noResults.className = 'no-results';
                    fileList.appendChild(noResults);
                }
                noResults.textContent = 'No files found matching "' + query + '"';
                return;
            }

            // Remove "no results" message if it exists
            const noResults = fileList.querySelector('.no-results');
            if (noResults) {
                noResults.remove();
            }

            // Update file list to show only matching files with highlighting
            const matchingFiles = new Map(filteredFiles.map(f => [f.path, f]));
            document.querySelectorAll('.file-item').forEach(item => {
                const filePath = item.getAttribute('data-path');
                const header = item.querySelector('.file-item-header');
                const link = header ? header.querySelector('a') : item.querySelector('a');
                const fileData = matchingFiles.get(filePath);

                // Remove any existing snippets
                const existingSnippets = item.querySelectorAll('.content-snippet');
                existingSnippets.forEach(s => s.remove());

                if (fileData) {
                    item.classList.remove('hidden');
                    // Add highlighting to visible files
                    if (link) {
                        // Remove any existing match count span
                        const existingCount = link.querySelector('.match-count');
                        if (existingCount) {
                            existingCount.remove();
                        }

                        // Get the clean text without match count
                        const originalText = link.textContent;
                        link.innerHTML = highlightMatch(originalText, query);

                        // Add match count for content searches
                        if (fileData.matches && fileData.matches.length > 0) {
                            // First remove any existing match count spans
                            const existingCounts = link.querySelectorAll('.match-count');
                            existingCounts.forEach(span => span.remove());

                            const countSpan = document.createElement('span');
                            countSpan.className = 'match-count';
                            countSpan.textContent = ' ' + fileData.matches.length + ' match' + (fileData.matches.length > 1 ? 'es' : '');
                            link.appendChild(countSpan);
                        }
                    }

                    // Add content snippets if available (only in content search mode)
                    if (fileData.matches && fileData.matches.length > 0 && searchInContent) {
                        // Show up to 3 snippets per file
                        const snippetsToShow = fileData.matches.slice(0, 3);
                        snippetsToShow.forEach(match => {
                            const snippet = document.createElement('div');
                            snippet.className = 'content-snippet';

                            // If we have context lines, show all 3 lines
                            if (match.contextLines && match.contextLines.length > 0) {
                                let snippetHtml = '';
                                match.contextLines.forEach(line => {
                                    const lineClass = line.isMatch ? 'match-line' : 'context-line';
                                    const lineText = line.isMatch ? highlightMatch(line.text, query) : line.text;
                                    snippetHtml += '<div class="' + lineClass + '">Line ' + line.lineNumber + ': ' + lineText + '</div>';
                                });
                                snippet.innerHTML = snippetHtml;
                            } else {
                                // Fallback to single line display
                                const lineText = match.text.trim();
                                snippet.innerHTML = 'Line ' + match.lineNumber + ': ' + highlightMatch(lineText, query);
                            }

                            item.appendChild(snippet);
                        });
                    }
                } else {
                    item.classList.add('hidden');
                    // Remove highlighting from hidden files
                    if (link) {
                        const originalText = link.textContent.replace(/ \d+ match(es)?$/, ''); // Remove match count
                        link.innerHTML = originalText;
                    }
                }
            });
        }

        // Handle keyboard navigation
        searchField.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                searchField.value = '';
                updateSuggestions('');
                searchField.blur();
            } else if (e.key === 'Tab') {
                e.preventDefault();
                searchInContent = !searchInContent;

                // Update UI
                if (searchInContent) {
                    searchScope.textContent = 'in file contents';
                    searchScope.classList.add('content-mode');
                } else {
                    searchScope.textContent = 'in names & paths';
                    searchScope.classList.remove('content-mode');
                }

                // Update URL with new mode
                updateURL(searchField.value, searchInContent);

                // Re-run search with new mode
                if (searchField.value) {
                    updateSuggestions(searchField.value);
                }
            }
        });

        // Handle input changes
        searchField.addEventListener('input', (e) => {
            updateSuggestions(e.target.value);
        });

        // Handle focus
        searchField.addEventListener('focus', () => {
            if (searchField.value) {
                updateSuggestions(searchField.value);
            }
        });



        // Global keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                if (document.activeElement !== searchField) {
                    e.preventDefault();
                    searchField.focus();
                    searchField.select();
                }
            }
        });

        // Handle browser back/forward navigation
        window.addEventListener('popstate', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const query = urlParams.get('q') || '';
            const mode = urlParams.get('mode') === 'content';

            // Update search field and mode
            searchField.value = query;
            searchInContent = mode;

            // Update UI
            if (searchInContent) {
                searchScope.textContent = 'in file contents';
                searchScope.classList.add('content-mode');
            } else {
                searchScope.textContent = 'in names & paths';
                searchScope.classList.remove('content-mode');
            }

            // Run search
            updateSuggestions(query);
        });

        // Run initial search if there's a query in the URL
        if (initialQuery) {
            updateSuggestions(initialQuery);
        }

        // Theme functionality (copy from generateHtmlFromMarkdown)
        const themes = {
            light: { name: 'Light', mermaid: 'default' },
            dark: { name: 'Dark', mermaid: 'dark' },
            github: { name: 'GitHub', mermaid: 'default' },
            'github-dark': { name: 'GitHub Dark', mermaid: 'dark' },
            dracula: { name: 'Dracula', mermaid: 'dark' },
            nord: { name: 'Nord', mermaid: 'dark' },
            'solarized-light': { name: 'Solarized Light', mermaid: 'default' },
            'solarized-dark': { name: 'Solarized Dark', mermaid: 'dark' },
            monokai: { name: 'Monokai', mermaid: 'dark' },
            'one-dark': { name: 'One Dark', mermaid: 'dark' }
        };

        function initTheme() {
            const forcedTheme = ${forceTheme ? `'${forceTheme}'` : 'null'};
            const savedTheme = localStorage.getItem('theme');
            const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const defaultTheme = forcedTheme || savedTheme || (systemPrefersDark ? 'dark' : 'light');
            const theme = themes[defaultTheme] ? defaultTheme : 'light';

            document.documentElement.setAttribute('data-theme', theme);
            updateThemeSelector(theme);
            return theme;
        }

        function updateThemeSelector(theme) {
            const selector = document.getElementById('themeSelector');
            if (selector) {
                selector.value = theme;
            }
        }

        function switchTheme(newTheme) {
            if (!themes[newTheme]) return;
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeSelector(newTheme);
        }

        // Initialize theme
        initTheme();

        // Theme selector change event
        document.getElementById('themeSelector').addEventListener('change', function(e) {
            switchTheme(e.target.value);
        });

        // Typography theme functionality
        function switchTypography(typography) {
            document.body.setAttribute('data-typography', typography);
            localStorage.setItem('preferredTypography', typography);
        }

        function loadPreferredTypography() {
            const saved = localStorage.getItem('preferredTypography') || 'default';
            switchTypography(saved);
            updateTypographySelector(saved);
        }

        function updateTypographySelector(typography) {
            const selector = document.getElementById('typographySelector');
            if (selector) {
                selector.value = typography;
            }
        }

        // Typography selector change event
        document.getElementById('typographySelector').addEventListener('change', function(e) {
            switchTypography(e.target.value);
        });

        // Load preferred typography on page load
        loadPreferredTypography();

        // Zoom functionality (copy from generateHtmlFromMarkdown)
        let currentZoom = 100;

        function setZoom(scale) {
            const zoomContainer = document.getElementById('zoomContainer');
            if (zoomContainer) {
                zoomContainer.style.transform = 'scale(' + scale + ')';
                zoomContainer.style.transformOrigin = '0 0';
                zoomContainer.style.width = (100 / scale) + '%';
                zoomContainer.style.height = (100 / scale) + '%';
            }
        }

        function updateZoom(zoomLevel) {
            currentZoom = Math.max(50, Math.min(200, zoomLevel));
            const scale = currentZoom / 100;
            setZoom(scale);
            document.getElementById('zoomValue').textContent = currentZoom + '%';
            localStorage.setItem('zoom', currentZoom);
        }

        // Initialize zoom from local storage
        const savedZoom = localStorage.getItem('zoom');
        if (savedZoom) {
            currentZoom = parseInt(savedZoom);
            updateZoom(currentZoom);
        }

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', function() {
            updateZoom(currentZoom + 10);
        });

        document.getElementById('zoomOut').addEventListener('click', function() {
            updateZoom(currentZoom - 10);
        });

        document.getElementById('zoomReset').addEventListener('click', function() {
            updateZoom(100);
        });

        // Keyboard shortcuts for zoom
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    updateZoom(currentZoom + 10);
                } else if (e.key === '-') {
                    e.preventDefault();
                    updateZoom(currentZoom - 10);
                } else if (e.key === '0') {
                    e.preventDefault();
                    updateZoom(100);
                }
            }
        });
    </script>
</body>
</html>`;

    // Helper function to generate file list HTML
    function generateFileListHTML(fileData) {
        // Sort files by full path
        const sortedFiles = fileData.sort((a, b) => a.path.localeCompare(b.path));

        let html = '<div class="file-list-flat">';
        sortedFiles.forEach(file => {
            const fullPath = file.path;
            html += `<div class="file-item" data-path="${file.path}">`;
            html += '<div class="file-item-header">';
            html += `<a href="/view?file=${encodeURIComponent(file.path)}">${fullPath}</a>`;
            if (file.size && file.modified) {
                html += `<span class="file-meta">${file.size} • ${file.modified}</span>`;
            }
            html += '</div>';
            html += '</div>';
        });
        html += '</div>';

        return html;
    }
}

// Function to find an available port
function findAvailablePort(startPort = 8080, maxAttempts = 10) {
    return new Promise((resolve, reject) => {
        let currentPort = startPort;
        let attempts = 0;

        const tryPort = () => {
            if (attempts >= maxAttempts) {
                reject(new Error(`Could not find an available port after ${maxAttempts} attempts`));
                return;
            }

            const testServer = http.createServer();

            testServer.listen(currentPort, () => {
                testServer.close(() => {
                    resolve(currentPort);
                });
            });

            testServer.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    attempts++;
                    currentPort++;
                    tryPort();
                } else {
                    reject(err);
                }
            });
        };

        tryPort();
    });
}

// Function to start HTTP server for folder mode
async function startFolderServer(folderPath, isTemp = false) {
    const baseDir = path.resolve(folderPath);

    // Track active WebSocket connections for cleanup
    let activeConnections = new Set();
    let inactivityTimer = null;

    // For temp directories, auto-cleanup after no connections
    const INACTIVITY_TIMEOUT = isTemp ? 10000 : 0; // 10 seconds after last connection closes

    const checkForCleanup = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);

        if (isTemp && activeConnections.size === 0) {
            console.log('🔌 All connections closed');
            inactivityTimer = setTimeout(() => {
                console.log('⏰ No connections for 10 seconds, shutting down...');
                if (wss) wss.close();
                server.close();
                process.exit(0);
            }, INACTIVITY_TIMEOUT);
        }
    };

    // Try to find an available port
    let port;
    try {
        const startPort = process.env.PORT ? parseInt(process.env.PORT) : 8080;
        port = await findAvailablePort(startPort);
    } catch (error) {
        console.error('❌ Could not find an available port');
        console.error('Try specifying a different port: PORT=9000 mm ' + folderPath);
        process.exit(1);
    }

    const server = http.createServer((req, res) => {
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;

        if (pathname === '/' || pathname === '/index') {
            // Serve index page
            const mdFiles = findMarkdownFiles(baseDir);
            if (mdFiles.length === 0) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<!DOCTYPE html>
<html>
<head>
    <title>No Files Found</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #e74c3c; margin-bottom: 10px; }
        p { color: #666; }
        .path {
            background: #f4f4f4;
            padding: 5px 10px;
            border-radius: 4px;
            font-family: monospace;
            margin-top: 10px;
            display: inline-block;
        }
    </style>
</head>
<body data-typography="default">
    <div class="container">
        <h1>📂 No Markdown Files Found</h1>
        <p>No .md or .markdown files were found in:</p>
        <div class="path">${baseDir}</div>
    </div>
</body>
</html>`);
                return;
            }

            // Generate custom HTML for index with search functionality
            let indexHtml = generateIndexHtmlWithSearch(baseDir, mdFiles, port, selectedTheme);

            // Inject WebSocket client code for temp mode
            if (isTemp) {
                const wsClientCode = `
<script>
(function() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + window.location.host);

    ws.onopen = function() {
        console.log('Connected to server for cleanup tracking');
    };

    ws.onclose = function() {
        console.log('Disconnected from server');
    };

    ws.onerror = function(error) {
        console.log('WebSocket error:', error);
    };

    // Respond to ping with pong
    ws.onmessage = function(event) {
        if (event.data === 'ping') {
            ws.send('pong');
        }
    };

    // Keep connection alive
    setInterval(function() {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('heartbeat');
        }
    }, 30000);
})();
</script>
`;
                // Only replace the last </body> tag, not ones inside JavaScript strings
                const lastBodyIndex = indexHtml.lastIndexOf('</body>');
                if (lastBodyIndex !== -1) {
                    indexHtml = indexHtml.slice(0, lastBodyIndex) + wsClientCode + indexHtml.slice(lastBodyIndex);
                }
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(indexHtml);

        } else if (pathname === '/view') {
            // Serve individual markdown file
            const file = parsedUrl.query.file;
            if (!file) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h1>No file specified</h1>');
                return;
            }

            const filePath = path.join(baseDir, file);

            // Security check - ensure file is within base directory
            if (!filePath.startsWith(baseDir)) {
                res.writeHead(403, { 'Content-Type': 'text/html' });
                res.end('<h1>Access denied</h1>');
                return;
            }

            if (!fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/html' });
                res.end('<h1>File not found</h1>');
                return;
            }

            try {
                const markdown = fs.readFileSync(filePath, 'utf-8');
                let html = generateHtmlFromMarkdown(markdown, path.basename(filePath), false, true, selectedTheme);

                // Inject WebSocket client code for temp mode
                if (isTemp) {
                    const wsClientCode = `
<script>
(function() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(protocol + '//' + window.location.host);

    ws.onopen = function() {
        console.log('Connected to server for cleanup tracking');
    };

    ws.onclose = function() {
        console.log('Disconnected from server');
    };

    ws.onerror = function(error) {
        console.log('WebSocket error:', error);
    };

    // Respond to ping with pong
    ws.onmessage = function(event) {
        if (event.data === 'ping') {
            ws.send('pong');
        }
    };

    // Keep connection alive
    setInterval(function() {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send('heartbeat');
        }
    }, 30000);
})();
</script>
`;
                    // Only replace the last </body> tag, not ones inside JavaScript strings
                    const lastBodyIndex = html.lastIndexOf('</body>');
                    if (lastBodyIndex !== -1) {
                        html = html.slice(0, lastBodyIndex) + wsClientCode + html.slice(lastBodyIndex);
                    }
                }

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'text/html' });
                res.end(`<h1>Error reading file: ${error.message}</h1>`);
            }

        } else if (pathname === '/api/search') {
            // Handle content search requests
            const query = parsedUrl.query.q;
            const searchMode = parsedUrl.query.mode || 'filename'; // 'filename' or 'content'

            if (!query) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'No search query provided' }));
                return;
            }

            const mdFiles = findMarkdownFiles(baseDir);
            const results = [];

            if (searchMode === 'content') {
                // Search file contents
                for (const file of mdFiles) {
                    const filePath = path.join(baseDir, file);
                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const lines = content.split('\n');
                        const matches = [];

                        // Find matching lines with context
                        lines.forEach((line, index) => {
                            if (line.toLowerCase().includes(query.toLowerCase())) {
                                // Get context: previous line, matching line, and next line
                                const contextLines = [];

                                // Previous line
                                if (index > 0) {
                                    contextLines.push({
                                        lineNumber: index,
                                        text: lines[index - 1].trim().substring(0, 200),
                                        isMatch: false
                                    });
                                }

                                // Matching line
                                contextLines.push({
                                    lineNumber: index + 1,
                                    text: line.trim().substring(0, 200),
                                    isMatch: true
                                });

                                // Next line
                                if (index < lines.length - 1) {
                                    contextLines.push({
                                        lineNumber: index + 2,
                                        text: lines[index + 1].trim().substring(0, 200),
                                        isMatch: false
                                    });
                                }

                                matches.push({
                                    lineNumber: index + 1,
                                    text: line.trim().substring(0, 200), // Keep for backward compatibility
                                    contextLines: contextLines
                                });
                            }
                        });

                        if (matches.length > 0) {
                            results.push({
                                path: file,
                                fileName: path.basename(file),
                                directory: path.dirname(file) === '.' ? '' : path.dirname(file),
                                matches: matches.slice(0, 5) // Limit to first 5 matches
                            });
                        }
                    } catch (error) {
                        // Skip files that can't be read
                        console.error(`Error reading ${file}:`, error.message);
                    }
                }
            } else {
                // Search filenames (fallback)
                for (const file of mdFiles) {
                    if (file.toLowerCase().includes(query.toLowerCase())) {
                        results.push({
                            path: file,
                            fileName: path.basename(file),
                            directory: path.dirname(file) === '.' ? '' : path.dirname(file)
                        });
                    }
                }
            }

            res.writeHead(200, {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify(results));

        } else if (pathname === '/favicon.ico') {
            // Handle favicon requests gracefully
            res.writeHead(204, { 'Content-Type': 'image/x-icon' });
            res.end();
        } else {
            // Better 404 page
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end(`<!DOCTYPE html>
<html>
<head>
    <title>404 Not Found</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: #f5f5f5;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #e74c3c; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        a {
            color: #3498db;
            text-decoration: none;
            padding: 10px 20px;
            border: 2px solid #3498db;
            border-radius: 4px;
            display: inline-block;
            transition: all 0.2s;
        }
        a:hover {
            background: #3498db;
            color: white;
        }
    </style>
</head>
<body data-typography="default">
    <div class="container">
        <h1>404 - Page Not Found</h1>
        <p>The requested path "${pathname}" was not found.</p>
        <a href="#" onclick="history.back(); return false;">← Back to Index</a>
    </div>
</body>
</html>`);
        }
    });

    // Create WebSocket server for connection tracking
    let wss = null;
    if (isTemp) {
        wss = new WebSocket.Server({ server });

        wss.on('connection', (ws) => {
            const clientId = Date.now() + Math.random();
            activeConnections.add(clientId);
            console.log(`🔗 Browser connected (${activeConnections.size} active connection${activeConnections.size !== 1 ? 's' : ''})`);

            // Clear any pending cleanup timer
            if (inactivityTimer) {
                clearTimeout(inactivityTimer);
                inactivityTimer = null;
            }

            ws.on('close', () => {
                activeConnections.delete(clientId);
                console.log(`🔌 Browser disconnected (${activeConnections.size} active connection${activeConnections.size !== 1 ? 's' : ''})`);
                checkForCleanup();
            });

            ws.on('error', () => {
                activeConnections.delete(clientId);
                checkForCleanup();
            });

            // Send ping every 30 seconds to keep connection alive
            const pingInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.ping();
                } else {
                    clearInterval(pingInterval);
                }
            }, 30000);

            ws.on('close', () => {
                clearInterval(pingInterval);
            });
        });
    }

    server.listen(port, () => {
        console.log(`🚀 Moremaid v${packageJson.version} server running at http://localhost:${port}`);
        console.log(`📁 Serving ${isTemp ? 'extracted' : 'markdown'} files from: ${isTemp ? 'temporary directory' : baseDir}`);
        if (isTemp) {
            console.log('🔌 Auto-cleanup enabled when browser closes');
        }
        console.log('Press Ctrl+C to stop the server');

        // Open browser
        const openCommand = process.platform === 'darwin' ? 'open' :
                          process.platform === 'win32' ? 'start' :
                          'xdg-open';
        exec(`${openCommand} http://localhost:${port}`);
    });

    server.on('error', (err) => {
        console.error('Server error:', err);
        process.exit(1);
    });

    // Handle graceful shutdown (only for non-temp servers)
    if (!isTemp) {
        let isShuttingDown = false;
        process.on('SIGINT', () => {
            if (isShuttingDown) {
                // Force immediate exit on second Ctrl+C
                process.exit(0);
            }
            isShuttingDown = true;
            console.log('\n👋 Stopping server...');
            server.close(() => {
                process.exit(0);
            });
            // Force exit after 1 second if server doesn't close
            setTimeout(() => {
                process.exit(0);
            }, 1000);
        });
    }

    return server;
}

// Function to generate HTML from markdown
function generateHtmlFromMarkdown(markdown, title, isIndex, isServer, forceTheme = null) {
    // Configure marked
    marked.setOptions({
        breaks: true,
        gfm: true,
        langPrefix: 'language-'
    });

    // Convert markdown to HTML
    let htmlContent = marked.parse(markdown);

    // Fix language aliases
    const replacements = [
        ['class="language-js"', 'class="language-javascript"'],
        ['class="language-ts"', 'class="language-typescript"'],
        ['class="language-py"', 'class="language-python"'],
        ['class="language-rb"', 'class="language-ruby"'],
        ['class="language-yml"', 'class="language-yaml"'],
        ['class="language-sh"', 'class="language-bash"'],
        ['class="language-shell"', 'class="language-bash"'],
        ['class="language-cs"', 'class="language-csharp"']
    ];

    replacements.forEach(([from, to]) => {
        htmlContent = htmlContent.replace(new RegExp(from, 'g'), to);
    });

    // Process mermaid code blocks
    htmlContent = htmlContent.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
        (match, code) => {
            const decodedCode = code.replace(/&lt;/g, '<')
                                   .replace(/&gt;/g, '>')
                                   .replace(/&amp;/g, '&')
                                   .replace(/&quot;/g, '"')
                                   .replace(/&#39;/g, "'");
            return `<div class="mermaid">${decodedCode}</div>`;
        });

    // Generate complete HTML document
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <!-- Prism.js for syntax highlighting -->
    <link href="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet" />
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js"></script>
    <!-- Core dependencies first -->
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-clike.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markup.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markup-templating.min.js"></script>
    <!-- Language components -->
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-python.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-javascript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-typescript.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-jsx.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-tsx.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-java.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-c.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-cpp.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-csharp.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-php.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-ruby.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-go.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-rust.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-kotlin.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-swift.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-bash.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-sql.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-yaml.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-json.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-markdown.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-docker.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-nginx.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/prismjs@1.29.0/components/prism-apache.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        /* Default Light Theme */
        :root, [data-theme="light"] {
            --bg-color: white;
            --text-color: #333;
            --heading-color: #2c3e50;
            --heading2-color: #34495e;
            --border-color: #ecf0f1;
            --code-bg: #f4f4f4;
            --code-color: #d14;
            --link-color: #3498db;
            --blockquote-color: #555;
            --table-header-bg: #f0f0f0;
            --table-border: #ddd;
            --file-info-bg: #f5f5f5;
            --file-info-color: #666;
            --mermaid-btn-bg: rgba(52, 73, 94, 0.8);
            --mermaid-btn-hover: rgba(52, 73, 94, 1);
        }

        /* Dark Theme */
        [data-theme="dark"] {
            --bg-color: #1a1a1a;
            --text-color: #e0e0e0;
            --heading-color: #61afef;
            --heading2-color: #56b6c2;
            --border-color: #3a3a3a;
            --code-bg: #2d2d2d;
            --code-color: #e06c75;
            --link-color: #61afef;
            --blockquote-color: #abb2bf;
            --table-header-bg: #2d2d2d;
            --table-border: #4a4a4a;
            --file-info-bg: #2d2d2d;
            --file-info-color: #abb2bf;
            --mermaid-btn-bg: rgba(97, 175, 239, 0.8);
            --mermaid-btn-hover: rgba(97, 175, 239, 1);
        }

        /* GitHub Theme */
        [data-theme="github"] {
            --bg-color: #ffffff;
            --text-color: #24292e;
            --heading-color: #24292e;
            --heading2-color: #24292e;
            --border-color: #e1e4e8;
            --code-bg: #f6f8fa;
            --code-color: #e36209;
            --link-color: #0366d6;
            --blockquote-color: #6a737d;
            --table-header-bg: #f6f8fa;
            --table-border: #e1e4e8;
            --file-info-bg: #f6f8fa;
            --file-info-color: #586069;
            --mermaid-btn-bg: rgba(3, 102, 214, 0.8);
            --mermaid-btn-hover: rgba(3, 102, 214, 1);
        }

        /* GitHub Dark Theme */
        [data-theme="github-dark"] {
            --bg-color: #0d1117;
            --text-color: #c9d1d9;
            --heading-color: #58a6ff;
            --heading2-color: #58a6ff;
            --border-color: #30363d;
            --code-bg: #161b22;
            --code-color: #ff7b72;
            --link-color: #58a6ff;
            --blockquote-color: #8b949e;
            --table-header-bg: #161b22;
            --table-border: #30363d;
            --file-info-bg: #161b22;
            --file-info-color: #8b949e;
            --mermaid-btn-bg: rgba(88, 166, 255, 0.8);
            --mermaid-btn-hover: rgba(88, 166, 255, 1);
        }

        /* Dracula Theme */
        [data-theme="dracula"] {
            --bg-color: #282a36;
            --text-color: #f8f8f2;
            --heading-color: #bd93f9;
            --heading2-color: #ff79c6;
            --border-color: #44475a;
            --code-bg: #44475a;
            --code-color: #ff79c6;
            --link-color: #8be9fd;
            --blockquote-color: #6272a4;
            --table-header-bg: #44475a;
            --table-border: #6272a4;
            --file-info-bg: #44475a;
            --file-info-color: #6272a4;
            --mermaid-btn-bg: rgba(189, 147, 249, 0.8);
            --mermaid-btn-hover: rgba(189, 147, 249, 1);
        }

        /* Nord Theme */
        [data-theme="nord"] {
            --bg-color: #2e3440;
            --text-color: #eceff4;
            --heading-color: #88c0d0;
            --heading2-color: #81a1c1;
            --border-color: #3b4252;
            --code-bg: #3b4252;
            --code-color: #d08770;
            --link-color: #88c0d0;
            --blockquote-color: #d8dee9;
            --table-header-bg: #3b4252;
            --table-border: #4c566a;
            --file-info-bg: #3b4252;
            --file-info-color: #d8dee9;
            --mermaid-btn-bg: rgba(136, 192, 208, 0.8);
            --mermaid-btn-hover: rgba(136, 192, 208, 1);
        }

        /* Solarized Light Theme */
        [data-theme="solarized-light"] {
            --bg-color: #fdf6e3;
            --text-color: #657b83;
            --heading-color: #073642;
            --heading2-color: #586e75;
            --border-color: #eee8d5;
            --code-bg: #eee8d5;
            --code-color: #dc322f;
            --link-color: #268bd2;
            --blockquote-color: #839496;
            --table-header-bg: #eee8d5;
            --table-border: #93a1a1;
            --file-info-bg: #eee8d5;
            --file-info-color: #839496;
            --mermaid-btn-bg: rgba(38, 139, 210, 0.8);
            --mermaid-btn-hover: rgba(38, 139, 210, 1);
        }

        /* Solarized Dark Theme */
        [data-theme="solarized-dark"] {
            --bg-color: #002b36;
            --text-color: #839496;
            --heading-color: #93a1a1;
            --heading2-color: #839496;
            --border-color: #073642;
            --code-bg: #073642;
            --code-color: #dc322f;
            --link-color: #268bd2;
            --blockquote-color: #657b83;
            --table-header-bg: #073642;
            --table-border: #586e75;
            --file-info-bg: #073642;
            --file-info-color: #657b83;
            --mermaid-btn-bg: rgba(38, 139, 210, 0.8);
            --mermaid-btn-hover: rgba(38, 139, 210, 1);
        }

        /* Monokai Theme */
        [data-theme="monokai"] {
            --bg-color: #272822;
            --text-color: #f8f8f2;
            --heading-color: #66d9ef;
            --heading2-color: #a6e22e;
            --border-color: #3e3d32;
            --code-bg: #3e3d32;
            --code-color: #f92672;
            --link-color: #66d9ef;
            --blockquote-color: #75715e;
            --table-header-bg: #3e3d32;
            --table-border: #75715e;
            --file-info-bg: #3e3d32;
            --file-info-color: #75715e;
            --mermaid-btn-bg: rgba(102, 217, 239, 0.8);
            --mermaid-btn-hover: rgba(102, 217, 239, 1);
        }

        /* One Dark Theme */
        [data-theme="one-dark"] {
            --bg-color: #282c34;
            --text-color: #abb2bf;
            --heading-color: #61afef;
            --heading2-color: #e06c75;
            --border-color: #3e4451;
            --code-bg: #3e4451;
            --code-color: #e06c75;
            --link-color: #61afef;
            --blockquote-color: #5c6370;
            --table-header-bg: #3e4451;
            --table-border: #4b5263;
            --file-info-bg: #3e4451;
            --file-info-color: #5c6370;
            --mermaid-btn-bg: rgba(97, 175, 239, 0.8);
            --mermaid-btn-hover: rgba(97, 175, 239, 1);
        }

        /* Typography Themes */
        /* Default - balanced style */
        [data-typography="default"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            --font-code: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
            --font-size-base: 16px;
            --line-height: 1.6;
            --paragraph-spacing: 1em;
            --max-width: 800px;
            --text-align: left;
        }

        /* GitHub - Clean sans-serif style */
        [data-typography="github"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
            --font-code: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
            --font-size-base: 16px;
            --line-height: 1.5;
            --paragraph-spacing: 1em;
            --max-width: 1012px;
            --text-align: left;
        }

        /* LaTeX - Academic style with Latin Modern fonts */
        [data-typography="latex"] {
            --font-body: 'Latin Modern Roman', 'Computer Modern', 'Georgia', serif;
            --font-heading: 'Latin Modern Roman', 'Computer Modern', 'Georgia', serif;
            --font-code: 'Latin Modern Mono', 'Computer Modern Typewriter', 'Courier New', monospace;
            --font-size-base: 12pt;
            --line-height: 1.4;
            --paragraph-spacing: 0.5em;
            --max-width: 6.5in;
            --text-align: justify;
        }

        /* Tufte - Edward Tufte's elegant style */
        [data-typography="tufte"] {
            --font-body: et-book, Palatino, 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', Georgia, serif;
            --font-heading: et-book, Palatino, 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', Georgia, serif;
            --font-code: Consolas, 'Liberation Mono', Menlo, Courier, monospace;
            --font-size-base: 15px;
            --line-height: 1.5;
            --paragraph-spacing: 1.4em;
            --max-width: 960px;
            --text-align: left;
        }

        /* Medium - Blog article style */
        [data-typography="medium"] {
            --font-body: charter, Georgia, Cambria, 'Times New Roman', Times, serif;
            --font-heading: 'Lucida Grande', 'Lucida Sans Unicode', 'Lucida Sans', Geneva, Arial, sans-serif;
            --font-code: 'Menlo', 'Monaco', 'Courier New', Courier, monospace;
            --font-size-base: 21px;
            --line-height: 1.58;
            --paragraph-spacing: 1.58em;
            --max-width: 680px;
            --text-align: left;
        }

        /* Compact - Dense layout */
        [data-typography="compact"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-code: 'Monaco', 'Menlo', monospace;
            --font-size-base: 14px;
            --line-height: 1.4;
            --paragraph-spacing: 0.5em;
            --max-width: 100%;
            --text-align: left;
        }

        /* Wide - Full width */
        [data-typography="wide"] {
            --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            --font-code: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            --font-size-base: 16px;
            --line-height: 1.7;
            --paragraph-spacing: 1.2em;
            --max-width: 100%;
            --text-align: left;
        }

        /* Newspaper - Multi-column layout */
        [data-typography="newspaper"] {
            --font-body: 'Times New Roman', Times, serif;
            --font-heading: 'Georgia', 'Times New Roman', serif;
            --font-code: 'Courier New', Courier, monospace;
            --font-size-base: 16px;
            --line-height: 1.5;
            --paragraph-spacing: 0.8em;
            --max-width: 100%;
            --text-align: justify;
        }

        /* Terminal - Monospace heavy */
        [data-typography="terminal"] {
            --font-body: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
            --font-heading: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
            --font-code: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
            --font-size-base: 14px;
            --line-height: 1.5;
            --paragraph-spacing: 1em;
            --max-width: 900px;
            --text-align: left;
        }

        /* Book - Novel/book style */
        [data-typography="book"] {
            --font-body: 'Crimson Text', 'Baskerville', 'Georgia', serif;
            --font-heading: 'Crimson Text', 'Baskerville', 'Georgia', serif;
            --font-code: 'Courier New', Courier, monospace;
            --font-size-base: 18px;
            --line-height: 1.7;
            --paragraph-spacing: 1.5em;
            --max-width: 650px;
            --text-align: justify;
        }

        body {
            font-family: var(--font-body);
            background: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 0;
            line-height: var(--line-height);
            font-size: var(--font-size-base);
            transition: background-color 0.3s, color 0.3s;
            min-height: 100vh;
        }

        .zoom-container {
            padding: 30px;
            transform-origin: 0 0;
            min-height: 100vh;
        }

        .container {
            max-width: var(--max-width);
            margin: 0 auto;
        }

        h1, h2, h3, h4, h5, h6 {
            font-family: var(--font-heading);
        }

        p {
            margin-bottom: var(--paragraph-spacing);
            text-align: var(--text-align);
        }

        code, pre {
            font-family: var(--font-code) !important;
        }

        /* Book style - indent paragraphs */
        [data-typography="book"] p + p {
            text-indent: 2em;
        }

        .controls-trigger {
            position: fixed;
            top: 0;
            right: 0;
            width: 150px;
            height: 100px;
            z-index: 999;
            cursor: default;
        }

        .controls {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
            display: flex;
            gap: 10px;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .controls-trigger:hover ~ .controls,
        .controls:hover {
            opacity: 1;
            visibility: visible;
        }

        .controls select {
            background: var(--heading-color);
            color: var(--bg-color);
            border: none;
            border-radius: 8px;
            padding: 10px 15px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transition: transform 0.2s, opacity 0.3s;
            appearance: none;
            padding-right: 35px;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 20px;
        }

        .controls select:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .controls select:focus {
            outline: 2px solid var(--link-color);
            outline-offset: 2px;
        }

        .controls option {
            background: var(--bg-color);
            color: var(--text-color);
            padding: 10px;
        }

        .zoom-control {
            display: flex;
            align-items: center;
            gap: 8px;
            background: var(--heading-color);
            color: var(--bg-color);
            border-radius: 8px;
            padding: 8px 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }

        .zoom-control button {
            background: transparent;
            color: var(--bg-color);
            border: none;
            cursor: pointer;
            font-size: 18px;
            padding: 0 4px;
            opacity: 0.8;
            transition: opacity 0.2s;
        }

        .zoom-control button:hover {
            opacity: 1;
        }

        .zoom-value {
            min-width: 45px;
            text-align: center;
            font-size: 13px;
            font-weight: 500;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        h1 {
            color: var(--heading-color);
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 10px;
            margin-bottom: 20px;
        }

        h2 {
            color: var(--heading2-color);
            margin-top: 30px;
            margin-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 5px;
        }

        h3 {
            color: var(--heading2-color);
            margin-top: 20px;
            margin-bottom: 10px;
        }

        code:not([class*="language-"]) {
            background: var(--code-bg);
            padding: 2px 5px;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            color: var(--code-color);
        }

        pre {
            margin: 15px 0;
            border-radius: 5px;
            overflow: hidden;
        }

        pre code {
            padding: 0;
            background: transparent;
        }

        pre[class*="language-"] {
            margin: 15px 0;
            padding: 1em;
            border-radius: 5px;
            font-size: 14px;
            line-height: 1.5;
        }

        code[class*="language-"],
        pre[class*="language-"] {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
        }

        table {
            border-collapse: collapse;
            margin: 20px 0;
            width: 100%;
        }

        table th,
        table td {
            border: 1px solid var(--table-border);
            padding: 10px;
            text-align: left;
        }

        table th {
            background: var(--table-header-bg);
            font-weight: bold;
        }

        ul, ol {
            margin-left: 30px;
            margin-bottom: 15px;
        }

        li {
            margin: 5px 0;
        }

        blockquote {
            border-left: 4px solid var(--link-color);
            padding-left: 20px;
            margin: 20px 0;
            color: var(--blockquote-color);
            font-style: italic;
        }

        .mermaid {
            text-align: center;
            margin: 20px 0;
            position: relative;
            display: block;
            width: 100%;
        }

        .mermaid-container {
            position: relative;
            display: block;
            width: 100%;
        }

        .mermaid-container svg {
            max-width: 100%;
            height: auto;
        }

        .mermaid-fullscreen-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: var(--mermaid-btn-bg);
            color: white;
            border: none;
            border-radius: 4px;
            padding: 8px 10px;
            cursor: pointer;
            font-size: 18px;
            z-index: 10;
            transition: background 0.2s;
        }

        .mermaid-fullscreen-btn:hover {
            background: var(--mermaid-btn-hover);
        }

        a {
            color: var(--link-color);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        img {
            max-width: 100%;
            height: auto;
        }

        .file-info {
            background: var(--file-info-bg);
            padding: 10px 15px;
            border-radius: 5px;
            margin-bottom: 20px;
            font-size: 14px;
            color: var(--file-info-color);
        }

        .nav-bar {
            margin-bottom: 20px;
        }

        .nav-bar a {
            text-decoration: none;
            color: var(--link-color);
            font-size: 14px;
        }

        .nav-bar a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body data-typography="default">
    <div class="controls-trigger"></div>
    <div class="controls">
        <div class="zoom-control">
            <button id="zoomOut" title="Zoom out">−</button>
            <span class="zoom-value" id="zoomValue">100%</span>
            <button id="zoomIn" title="Zoom in">+</button>
            <button id="zoomReset" title="Reset zoom">⟲</button>
        </div>
        <select id="themeSelector" title="Select color theme">
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="github">📘 GitHub</option>
            <option value="github-dark">📕 GitHub Dark</option>
            <option value="dracula">🧛 Dracula</option>
            <option value="nord">❄️ Nord</option>
            <option value="solarized-light">🌅 Solarized Light</option>
            <option value="solarized-dark">🌃 Solarized Dark</option>
            <option value="monokai">🎨 Monokai</option>
            <option value="one-dark">🌑 One Dark</option>
        </select>
        <select id="typographySelector" title="Select typography theme">
            <option value="default">Default</option>
            <option value="github">GitHub</option>
            <option value="latex">LaTeX</option>
            <option value="tufte">Tufte</option>
            <option value="medium">Medium</option>
            <option value="compact">Compact</option>
            <option value="wide">Wide</option>
            <option value="newspaper">Newspaper</option>
            <option value="terminal">Terminal</option>
            <option value="book">Book</option>
        </select>
    </div>
    <div class="zoom-container" id="zoomContainer">
        <div class="container">
            ${isServer && !isIndex ? '<div class="nav-bar"><a href="#" onclick="history.back(); return false;">← Back to index</a></div>' : ''}
            <div class="file-info">
                ${isIndex ? '📁' : '📄'} ${title} • Generated on ${new Date().toLocaleString()}
            </div>
            ${htmlContent}
        </div>
    </div>

    <script>
        // Theme functionality
        const themes = {
            light: { name: 'Light', mermaid: 'default' },
            dark: { name: 'Dark', mermaid: 'dark' },
            github: { name: 'GitHub', mermaid: 'default' },
            'github-dark': { name: 'GitHub Dark', mermaid: 'dark' },
            dracula: { name: 'Dracula', mermaid: 'dark' },
            nord: { name: 'Nord', mermaid: 'dark' },
            'solarized-light': { name: 'Solarized Light', mermaid: 'default' },
            'solarized-dark': { name: 'Solarized Dark', mermaid: 'dark' },
            monokai: { name: 'Monokai', mermaid: 'dark' },
            'one-dark': { name: 'One Dark', mermaid: 'dark' }
        };

        function initTheme() {
            const forcedTheme = ${forceTheme ? `'${forceTheme}'` : 'null'};
            const savedTheme = localStorage.getItem('theme');
            const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
            const defaultTheme = forcedTheme || savedTheme || (systemPrefersDark ? 'dark' : 'light');
            const theme = themes[defaultTheme] ? defaultTheme : 'light';

            document.documentElement.setAttribute('data-theme', theme);
            updateThemeSelector(theme);
            return theme;
        }

        function updateThemeSelector(theme) {
            const selector = document.getElementById('themeSelector');
            if (selector) {
                selector.value = theme;
            }
        }

        function switchTheme(newTheme) {
            if (!themes[newTheme]) return;

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeSelector(newTheme);

            // Reinitialize mermaid with appropriate theme
            initializeMermaid(newTheme);
        }

        // Initialize theme on load
        const currentTheme = initTheme();

        // Add change event to theme selector
        document.getElementById('themeSelector').addEventListener('change', function(e) {
            switchTheme(e.target.value);
        });

        // Typography theme functionality
        function switchTypography(typography) {
            document.body.setAttribute('data-typography', typography);
            localStorage.setItem('preferredTypography', typography);
        }

        function loadPreferredTypography() {
            const saved = localStorage.getItem('preferredTypography') || 'default';
            switchTypography(saved);
            updateTypographySelector(saved);
        }

        function updateTypographySelector(typography) {
            const selector = document.getElementById('typographySelector');
            if (selector) {
                selector.value = typography;
            }
        }

        // Typography selector change event
        document.getElementById('typographySelector').addEventListener('change', function(e) {
            switchTypography(e.target.value);
        });

        // Load preferred typography on page load
        loadPreferredTypography();

        // Zoom functionality
        let currentZoom = 100;

        function setZoom(scale) {
            const zoomContainer = document.getElementById('zoomContainer');
            if (zoomContainer) {
                zoomContainer.style.transform = 'scale(' + scale + ')';
                zoomContainer.style.transformOrigin = '0 0';
                zoomContainer.style.width = (100 / scale) + '%';
                zoomContainer.style.height = (100 / scale) + '%';
            }
        }

        function updateZoom(zoomLevel) {
            currentZoom = Math.max(50, Math.min(200, zoomLevel));
            const scale = currentZoom / 100;
            setZoom(scale);
            document.getElementById('zoomValue').textContent = currentZoom + '%';
            localStorage.setItem('zoom', currentZoom);
        }

        // Initialize zoom from local storage
        const savedZoom = localStorage.getItem('zoom');
        if (savedZoom) {
            currentZoom = parseInt(savedZoom);
            updateZoom(currentZoom);
        }

        // Zoom controls
        document.getElementById('zoomIn').addEventListener('click', function() {
            updateZoom(currentZoom + 10);
        });

        document.getElementById('zoomOut').addEventListener('click', function() {
            updateZoom(currentZoom - 10);
        });

        document.getElementById('zoomReset').addEventListener('click', function() {
            updateZoom(100);
        });

        // Keyboard shortcuts for zoom
        document.addEventListener('keydown', function(e) {
            if (e.ctrlKey || e.metaKey) {
                if (e.key === '=' || e.key === '+') {
                    e.preventDefault();
                    updateZoom(currentZoom + 10);
                } else if (e.key === '-') {
                    e.preventDefault();
                    updateZoom(currentZoom - 10);
                } else if (e.key === '0') {
                    e.preventDefault();
                    updateZoom(100);
                }
            }
        });

        // Initialize mermaid with theme-aware settings
        function initializeMermaid(theme) {
            const themeConfig = themes[theme] || themes.light;
            const mermaidTheme = themeConfig.mermaid;

            const themeVariables = {
                light: {
                    primaryColor: '#3498db',
                    primaryTextColor: '#fff',
                    primaryBorderColor: '#2980b9',
                    lineColor: '#5a6c7d',
                    secondaryColor: '#ecf0f1',
                    tertiaryColor: '#fff'
                },
                dark: {
                    primaryColor: '#61afef',
                    primaryTextColor: '#1a1a1a',
                    primaryBorderColor: '#4b5263',
                    lineColor: '#abb2bf',
                    secondaryColor: '#2d2d2d',
                    tertiaryColor: '#3a3a3a',
                    background: '#1a1a1a',
                    mainBkg: '#61afef',
                    secondBkg: '#56b6c2',
                    tertiaryBkg: '#98c379'
                },
                github: {
                    primaryColor: '#0366d6',
                    primaryTextColor: '#fff',
                    primaryBorderColor: '#0366d6',
                    lineColor: '#586069',
                    secondaryColor: '#f6f8fa'
                },
                dracula: {
                    primaryColor: '#bd93f9',
                    primaryTextColor: '#f8f8f2',
                    primaryBorderColor: '#6272a4',
                    lineColor: '#6272a4',
                    secondaryColor: '#44475a',
                    background: '#282a36'
                },
                nord: {
                    primaryColor: '#88c0d0',
                    primaryTextColor: '#2e3440',
                    primaryBorderColor: '#5e81ac',
                    lineColor: '#4c566a',
                    secondaryColor: '#3b4252',
                    background: '#2e3440'
                },
                solarized: {
                    primaryColor: '#268bd2',
                    primaryTextColor: '#fdf6e3',
                    primaryBorderColor: '#93a1a1',
                    lineColor: '#657b83',
                    secondaryColor: '#eee8d5'
                },
                monokai: {
                    primaryColor: '#66d9ef',
                    primaryTextColor: '#272822',
                    primaryBorderColor: '#75715e',
                    lineColor: '#75715e',
                    secondaryColor: '#3e3d32',
                    background: '#272822'
                }
            };

            // Map themes to their mermaid variable sets
            let variables = themeVariables.light;
            if (theme === 'dark' || theme === 'one-dark') variables = themeVariables.dark;
            else if (theme === 'github') variables = themeVariables.github;
            else if (theme === 'github-dark') variables = { ...themeVariables.github, background: '#0d1117' };
            else if (theme === 'dracula') variables = themeVariables.dracula;
            else if (theme === 'nord') variables = themeVariables.nord;
            else if (theme === 'solarized-light') variables = themeVariables.solarized;
            else if (theme === 'solarized-dark') variables = { ...themeVariables.solarized, background: '#002b36' };
            else if (theme === 'monokai') variables = themeVariables.monokai;

            mermaid.initialize({
                startOnLoad: false,
                theme: mermaidTheme,
                themeVariables: variables
            });
        }

        // Initialize mermaid
        initializeMermaid(currentTheme);

        // Function to open mermaid in new window
        function openMermaidInNewWindow(graphDefinition) {
            const newWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
            const bgColors = {
                light: 'white',
                dark: '#1a1a1a',
                github: '#ffffff',
                'github-dark': '#0d1117',
                dracula: '#282a36',
                nord: '#2e3440',
                'solarized-light': '#fdf6e3',
                'solarized-dark': '#002b36',
                monokai: '#272822',
                'one-dark': '#282c34'
            };
            const bgColor = bgColors[currentTheme] || 'white';

            const html = '<!' + 'DOCTYPE html>' +
                '<html lang="en">' +
                '<head>' +
                    '<meta charset="UTF-8">' +
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
                    '<title>Mermaid Diagram</title>' +
                    '<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></' + 'script>' +
                    '<style>' +
                        'body {' +
                            'margin: 0;' +
                            'padding: 20px;' +
                            'display: flex;' +
                            'justify-content: center;' +
                            'align-items: center;' +
                            'min-height: 100vh;' +
                            'background: ' + bgColor + ';' +
                            'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;' +
                        '}' +
                        '#diagram {' +
                            'max-width: 100%;' +
                            'overflow: auto;' +
                        '}' +
                    '</style>' +
                '</head>' +
                '<body>' +
                    '<div id="diagram" class="mermaid">' + graphDefinition + '</div>' +
                    '<script>' +
                        'const theme = "' + currentTheme + '";' +
                        'const themes = ' + JSON.stringify(themes) + ';' +
                        'const themeConfig = themes[theme] || themes.light;' +
                        'const mermaidTheme = themeConfig.mermaid;' +
                        '' +
                        'const themeVariables = {' +
                            'light: { primaryColor: "#3498db", primaryTextColor: "#fff", primaryBorderColor: "#2980b9", lineColor: "#5a6c7d", secondaryColor: "#ecf0f1", tertiaryColor: "#fff" },' +
                            'dark: { primaryColor: "#61afef", primaryTextColor: "#1a1a1a", primaryBorderColor: "#4b5263", lineColor: "#abb2bf", secondaryColor: "#2d2d2d", tertiaryColor: "#3a3a3a", background: "#1a1a1a", mainBkg: "#61afef", secondBkg: "#56b6c2", tertiaryBkg: "#98c379" },' +
                            'github: { primaryColor: "#0366d6", primaryTextColor: "#fff", primaryBorderColor: "#0366d6", lineColor: "#586069", secondaryColor: "#f6f8fa" },' +
                            'dracula: { primaryColor: "#bd93f9", primaryTextColor: "#f8f8f2", primaryBorderColor: "#6272a4", lineColor: "#6272a4", secondaryColor: "#44475a", background: "#282a36" },' +
                            'nord: { primaryColor: "#88c0d0", primaryTextColor: "#2e3440", primaryBorderColor: "#5e81ac", lineColor: "#4c566a", secondaryColor: "#3b4252", background: "#2e3440" },' +
                            'solarized: { primaryColor: "#268bd2", primaryTextColor: "#fdf6e3", primaryBorderColor: "#93a1a1", lineColor: "#657b83", secondaryColor: "#eee8d5" },' +
                            'monokai: { primaryColor: "#66d9ef", primaryTextColor: "#272822", primaryBorderColor: "#75715e", lineColor: "#75715e", secondaryColor: "#3e3d32", background: "#272822" }' +
                        '};' +
                        '' +
                        'let variables = themeVariables.light;' +
                        'if (theme === "dark" || theme === "one-dark") variables = themeVariables.dark;' +
                        'else if (theme === "github") variables = themeVariables.github;' +
                        'else if (theme === "github-dark") variables = Object.assign({}, themeVariables.github, { background: "#0d1117" });' +
                        'else if (theme === "dracula") variables = themeVariables.dracula;' +
                        'else if (theme === "nord") variables = themeVariables.nord;' +
                        'else if (theme === "solarized-light") variables = themeVariables.solarized;' +
                        'else if (theme === "solarized-dark") variables = Object.assign({}, themeVariables.solarized, { background: "#002b36" });' +
                        'else if (theme === "monokai") variables = themeVariables.monokai;' +
                        '' +
                        'mermaid.initialize({' +
                            'startOnLoad: true,' +
                            'theme: mermaidTheme,' +
                            'themeVariables: variables' +
                        '});' +
                    '</' + 'script>' +
                '</body>' +
                '</html>';

            newWindow.document.write(html);
            newWindow.document.close();
        }

        // Render mermaid diagrams when page loads
        document.addEventListener('DOMContentLoaded', async function() {
            // Apply syntax highlighting
            setTimeout(() => {
                try {
                    Prism.highlightAll();
                } catch (error) {
                    console.error('Error applying syntax highlighting:', error);
                }
            }, 10);

            // Render all mermaid diagrams
            const diagrams = document.querySelectorAll('.mermaid');
            for (let i = 0; i < diagrams.length; i++) {
                const diagram = diagrams[i];
                const graphDefinition = diagram.textContent;
                const id = 'mermaid-' + Date.now() + '-' + i;

                try {
                    const { svg } = await mermaid.render(id, graphDefinition);

                    // Create container with fullscreen button
                    const container = document.createElement('div');
                    container.className = 'mermaid-container';

                    // Add the SVG
                    const svgContainer = document.createElement('div');
                    svgContainer.innerHTML = svg;
                    container.appendChild(svgContainer);

                    // Create fullscreen button
                    const fullscreenBtn = document.createElement('button');
                    fullscreenBtn.className = 'mermaid-fullscreen-btn';
                    fullscreenBtn.innerHTML = '⛶'; // Fullscreen icon
                    fullscreenBtn.title = 'Open in new window';
                    fullscreenBtn.onclick = (e) => {
                        e.stopPropagation();
                        openMermaidInNewWindow(graphDefinition);
                    };
                    container.appendChild(fullscreenBtn);

                    // Replace diagram content with container
                    diagram.innerHTML = '';
                    diagram.appendChild(container);

                } catch (error) {
                    console.error('Error rendering mermaid diagram:', error);
                    diagram.innerHTML = '<div style="color: #e74c3c; padding: 20px; background: #ffecec; border-radius: 5px;">Error rendering diagram: ' + error.message + '</div>';
                }
            }
        });
    </script>
</body>
</html>`;

    return html;
}