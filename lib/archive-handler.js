/**
 * Archive handling functionality for .moremaid files
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
const archiverZipEncrypted = require('archiver-zip-encrypted');
const { BlobReader, BlobWriter, ZipReader } = require('@zip.js/zip.js');
const { findMarkdownFiles, promptPassword, formatSize } = require('./utils');
const config = require('./config');

// Register the encrypted zip format
archiver.registerFormat('zip-encrypted', archiverZipEncrypted);

/**
 * Handle extraction and serving of zip/moremaid files
 */
async function handleZipFile(zipPath) {
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
                    return null;
                }
            } else {
                throw err;
            }
        }

        // Extract all entries
        let totalSize = 0;
        const extractedFiles = [];

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
                extractedFiles.push(entry.filename);
                totalSize += buffer.length;
            }
        }

        await zipReader.close();
        console.log('✅ Extraction complete');

        // Find markdown files
        const mdFiles = findMarkdownFiles(tempDir);
        console.log(`📊 Extracted ${extractedFiles.length} file(s), ${formatSize(totalSize)} total`);
        console.log(`📄 Found ${mdFiles.length} markdown file(s)`);

        return { tempDir, cleanup };
    } catch (error) {
        console.error('❌ Error extracting zip file:', error.message);
        cleanup();
        return null;
    }
}

/**
 * Pack markdown files into a .moremaid archive
 */
async function packMarkdownFiles(inputPath, isDirectory) {
    const baseDir = isDirectory ? path.resolve(inputPath) : path.dirname(path.resolve(inputPath));
    const baseName = path.basename(baseDir === '.' ? process.cwd() : baseDir);
    const outputFile = `${baseName}${config.archive.extension}`;

    // Find markdown files
    let mdFiles = [];
    if (isDirectory) {
        mdFiles = findMarkdownFiles(baseDir);
    } else {
        // Single file mode
        if (inputPath.match(config.markdown.extensions)) {
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

    console.log(`📁 Packing markdown files from ${isDirectory ? 'directory' : 'file'}: ${inputPath}`);
    console.log(`📊 Found ${mdFiles.length} file(s) to pack`);

    // Prompt for password (optional)
    const password = await promptPassword('Enter password for zip encryption (optional, press Enter to skip): ');

    // Create the zip file
    const output = fs.createWriteStream(outputFile);
    let archive;

    if (password) {
        archive = archiver('zip-encrypted', {
            zlib: { level: 9 },
            encryptionMethod: 'aes256',
            password: password
        });
    } else {
        archive = archiver('zip', {
            zlib: { level: 9 }
        });
    }

    // Listen for warnings and errors
    archive.on('warning', (err) => {
        if (err.code === 'ENOENT') {
            console.warn('Warning:', err.message);
        } else {
            throw err;
        }
    });

    archive.on('error', (err) => {
        throw err;
    });

    // Pipe archive data to the file
    archive.pipe(output);

    // Add files to the archive
    for (const file of mdFiles) {
        const fullPath = path.join(baseDir, file);
        archive.file(fullPath, { name: file });
    }

    // Also add README.md at the root if it doesn't exist
    if (!mdFiles.includes('README.md') && mdFiles.length > 0) {
        const readmeContent = `# ${baseName}

This archive contains ${mdFiles.length} markdown file(s).

## Files

${mdFiles.map(f => `- ${f}`).join('\n')}

---
*Created with Moremaid*`;
        archive.append(readmeContent, { name: 'README.md' });
    }

    // Finalize the archive
    await archive.finalize();

    // Wait for the output stream to finish
    await new Promise((resolve) => output.on('close', resolve));

    const stats = fs.statSync(outputFile);
    console.log(`📦 Created ${outputFile} (${formatSize(stats.size)})`);
    console.log(`📄 Contains ${mdFiles.length} markdown file(s)`);
    if (password) {
        console.log(`🔒 Password-protected with AES-256 encryption`);
    }
}

module.exports = {
    handleZipFile,
    packMarkdownFiles
};