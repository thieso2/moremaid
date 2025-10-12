/**
 * Virtual File System abstraction for serving files from disk or ZIP archives
 */

const fs = require('fs');
const path = require('path');
const { BlobWriter } = require('@zip.js/zip.js');
const { loadGitignore, matchesPattern } = require('./utils');

/**
 * LRU Cache implementation for file contents
 */
class LRUCache {
    constructor(maxSize = 100 * 1024 * 1024) { // 100MB default
        this.maxSize = maxSize;
        this.currentSize = 0;
        this.cache = new Map();
        this.accessOrder = [];
    }

    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }

        // Move to end (most recently used)
        const index = this.accessOrder.indexOf(key);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }
        this.accessOrder.push(key);

        return this.cache.get(key);
    }

    set(key, value, size) {
        // Remove if already exists
        if (this.cache.has(key)) {
            const existing = this.cache.get(key);
            this.currentSize -= existing.size;
            const index = this.accessOrder.indexOf(key);
            if (index > -1) {
                this.accessOrder.splice(index, 1);
            }
        }

        // Evict oldest entries if needed
        while (this.currentSize + size > this.maxSize && this.accessOrder.length > 0) {
            const oldest = this.accessOrder.shift();
            const item = this.cache.get(oldest);
            if (item) {
                this.currentSize -= item.size;
                this.cache.delete(oldest);
            }
        }

        // Add new entry
        this.cache.set(key, { content: value, size: size });
        this.accessOrder.push(key);
        this.currentSize += size;
    }

    clear() {
        this.cache.clear();
        this.accessOrder = [];
        this.currentSize = 0;
    }

    getStats() {
        return {
            size: this.currentSize,
            maxSize: this.maxSize,
            entries: this.cache.size,
            utilization: Math.round((this.currentSize / this.maxSize) * 100)
        };
    }
}

/**
 * Base class for Virtual File Systems
 */
class VirtualFS {
    async readFile(filePath) {
        throw new Error('readFile must be implemented');
    }

    async exists(filePath) {
        throw new Error('exists must be implemented');
    }

    listMarkdownFiles() {
        throw new Error('listMarkdownFiles must be implemented');
    }

    listFiles(filter = '*.md') {
        throw new Error('listFiles must be implemented');
    }

    async close() {
        // Optional cleanup
    }

    isVirtual() {
        return false;
    }
}

/**
 * Single file virtual file system (for single file mode)
 */
class SingleFileFS extends VirtualFS {
    constructor(filePath) {
        super();
        this.filePath = path.resolve(filePath);
        this.fileName = path.basename(filePath);
        this.basePath = path.dirname(this.filePath);
    }

    async readFile(filePath) {
        // Normalize path - could be just filename or with leading slash
        const normalizedPath = filePath.replace(/^\/+/, '');

        if (normalizedPath !== this.fileName) {
            throw new Error('File not found');
        }

        if (!fs.existsSync(this.filePath)) {
            throw new Error('File not found');
        }

        return fs.readFileSync(this.filePath, 'utf-8');
    }

    async exists(filePath) {
        const normalizedPath = filePath.replace(/^\/+/, '');
        return normalizedPath === this.fileName && fs.existsSync(this.filePath);
    }

    listMarkdownFiles() {
        return [this.fileName];
    }

    listFiles(filter = '*.md') {
        // Single file mode only returns the file if it matches the filter
        if (matchesPattern(this.fileName, filter)) {
            return [this.fileName];
        }
        return [];
    }

    getBasePath() {
        return this.basePath;
    }
}

/**
 * Disk-based file system (current behavior)
 */
class DiskFS extends VirtualFS {
    constructor(basePath) {
        super();
        this.basePath = path.resolve(basePath);
        this.gitignore = loadGitignore(this.basePath);
    }

    async readFile(filePath) {
        const fullPath = path.join(this.basePath, filePath);

        // Security check
        if (!fullPath.startsWith(this.basePath)) {
            throw new Error('Access denied');
        }

        if (!fs.existsSync(fullPath)) {
            throw new Error('File not found');
        }

        return fs.readFileSync(fullPath, 'utf-8');
    }

    async exists(filePath) {
        const fullPath = path.join(this.basePath, filePath);

        // Security check
        if (!fullPath.startsWith(this.basePath)) {
            return false;
        }

        return fs.existsSync(fullPath);
    }

    listMarkdownFiles(dir = this.basePath, baseDir = this.basePath) {
        return this.listFiles('*.md', dir, baseDir);
    }

    listFiles(filter = '*.md', dir = this.basePath, baseDir = this.basePath) {
        let files = [];

        if (!fs.existsSync(dir)) {
            return files;
        }

        const items = fs.readdirSync(dir);

        for (const item of items) {
            // Skip hidden files
            if (item.startsWith('.')) continue;

            const fullPath = path.join(dir, item);
            const relativePath = path.relative(baseDir, fullPath);

            // Check gitignore
            if (this.gitignore.ignores(relativePath)) {
                continue;
            }

            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                files = files.concat(this.listFiles(filter, fullPath, baseDir));
            } else if (matchesPattern(item, filter)) {
                files.push(relativePath);
            }
        }

        return files.sort();
    }

    getBasePath() {
        return this.basePath;
    }
}

/**
 * ZIP-based virtual file system
 */
class ZipFS extends VirtualFS {
    constructor(zipReader, entries, password = null, options = {}) {
        super();
        this.zipReader = zipReader;
        this.entries = entries;
        this.password = password;
        this.cache = new LRUCache(options.cacheSize || 100 * 1024 * 1024);
        this.preCache = options.preCache || ['README.md', 'readme.md', 'index.md'];
        this.stats = {
            reads: 0,
            cacheHits: 0,
            cacheMisses: 0
        };

        // Pre-cache important files
        this.preCacheFiles();
    }

    async preCacheFiles() {
        for (const fileName of this.preCache) {
            const entry = this.entries.find(e =>
                e.filename.toLowerCase() === fileName.toLowerCase() ||
                e.filename.toLowerCase().endsWith('/' + fileName.toLowerCase())
            );

            if (entry && !entry.directory) {
                try {
                    await this.readFile(entry.filename);
                } catch (e) {
                    // Ignore pre-cache errors
                }
            }
        }
    }

    async readFile(filePath) {
        this.stats.reads++;

        // Normalize path (remove leading slash if present)
        filePath = filePath.replace(/^\/+/, '');

        // Check cache first
        const cached = this.cache.get(filePath);
        if (cached) {
            this.stats.cacheHits++;
            return cached.content;
        }

        this.stats.cacheMisses++;

        // Find entry in ZIP
        const entry = this.entries.find(e => e.filename === filePath);

        if (!entry || entry.directory) {
            throw new Error(`File not found: ${filePath}`);
        }

        // Extract file content
        try {
            const writer = new BlobWriter();
            // Debug: Check if password is available
            if (entry.encrypted && !this.password) {
                throw new Error('File is encrypted but no password available');
            }
            const blob = await entry.getData(writer, { password: this.password });
            const buffer = Buffer.from(await blob.arrayBuffer());
            const content = buffer.toString('utf-8');

            // Cache the content
            this.cache.set(filePath, content, buffer.length);

            return content;
        } catch (error) {
            // Include more details in error message
            const details = entry.encrypted ? ' (file is encrypted)' : '';
            throw new Error(`Failed to read file${details}: ${error.message}`);
        }
    }

    async exists(filePath) {
        // Normalize path
        filePath = filePath.replace(/^\/+/, '');

        // Check if entry exists and is not a directory
        return this.entries.some(e => e.filename === filePath && !e.directory);
    }

    listMarkdownFiles() {
        return this.listFiles('*.md');
    }

    listFiles(filter = '*.md') {
        const files = this.entries
            .filter(entry => !entry.directory && matchesPattern(entry.filename, filter))
            .map(entry => entry.filename)
            .sort();

        return files;
    }

    async searchInFiles(query) {
        const results = [];
        const mdFiles = this.listMarkdownFiles();

        for (const file of mdFiles) {
            try {
                const content = await this.readFile(file);
                const lines = content.split('\n');
                const matches = [];

                lines.forEach((line, index) => {
                    if (line.toLowerCase().includes(query.toLowerCase())) {
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
                            text: line.trim().substring(0, 200),
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
                console.error(`Error searching in ${file}:`, error.message);
            }
        }

        return results;
    }

    async close() {
        try {
            await this.zipReader.close();
        } catch (e) {
            // Ignore close errors
        }
        this.cache.clear();
    }

    isVirtual() {
        return true;
    }

    getStats() {
        return {
            ...this.stats,
            cache: this.cache.getStats(),
            totalFiles: this.entries.filter(e => !e.directory).length,
            markdownFiles: this.listMarkdownFiles().length
        };
    }

    getBasePath() {
        // Return a virtual path for display purposes
        return '[ZIP Archive]';
    }
}

module.exports = {
    VirtualFS,
    SingleFileFS,
    DiskFS,
    ZipFS,
    LRUCache
};