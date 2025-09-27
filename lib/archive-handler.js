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
const { ZipFS } = require('./virtual-fs');
const config = require('./config');

// Register the encrypted zip format
archiver.registerFormat('zip-encrypted', archiverZipEncrypted);

/**
 * Handle opening and serving of zip/moremaid files without extraction
 */
async function handleZipFile(zipPath, options = {}) {
    console.log(`📦 Opening zip file: ${path.basename(zipPath)}`);

    try {
        // Load zip file into memory
        const zipFileBuffer = fs.readFileSync(zipPath);
        const zipBlob = new Blob([zipFileBuffer]);
        const fileSize = zipFileBuffer.length;

        console.log(`📊 Archive size: ${formatSize(fileSize)}`);

        // Create initial reader to check for encryption
        let zipReader = new ZipReader(new BlobReader(zipBlob));
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
                zipReader = new ZipReader(new BlobReader(zipBlob), { password });
                entries = await zipReader.getEntries();
            }
        } catch (err) {
            if (err.message && (err.message.includes('password') || err.message.includes('encrypted'))) {
                // Need password - prompt for it
                password = await promptPassword('Enter password for zip file: ');

                // Try again with password
                await zipReader.close();
                zipReader = new ZipReader(new BlobReader(zipBlob), { password });

                try {
                    entries = await zipReader.getEntries();
                } catch (err2) {
                    console.error('❌ Incorrect password or corrupted file');
                    await zipReader.close();
                    return null;
                }
            } else {
                throw err;
            }
        }

        // Count files
        const fileEntries = entries.filter(e => !e.directory);
        const markdownEntries = entries.filter(e =>
            !e.directory && e.filename.match(/\.(md|markdown)$/i)
        );

        console.log(`📊 Archive contains ${fileEntries.length} file(s)`);
        console.log(`📄 Found ${markdownEntries.length} markdown file(s)`);

        // Create ZipFS instance with the open reader
        const zipFS = new ZipFS(zipReader, entries, password, {
            cacheSize: options.cacheSize || 100 * 1024 * 1024, // 100MB default
            preCache: options.preCache || ['README.md', 'readme.md', 'index.md']
        });

        console.log('✅ Archive opened successfully (serving from memory)');
        console.log('💾 Cache size: ' + formatSize(zipFS.cache.maxSize));

        return { virtualFS: zipFS };

    } catch (error) {
        console.error('❌ Error opening zip file:', error.message);
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