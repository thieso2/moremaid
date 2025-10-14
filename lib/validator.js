/**
 * validator.js - Validation functions for Markdown and Mermaid syntax
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

/**
 * Extract Mermaid code blocks from markdown
 */
function extractMermaidBlocks(markdown) {
    const blocks = [];
    const regex = /```mermaid\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(markdown)) !== null) {
        blocks.push({
            content: match[1].trim(),
            startPos: match.index,
            lineNumber: markdown.substring(0, match.index).split('\n').length
        });
    }

    return blocks;
}

/**
 * Validate Mermaid syntax
 * This performs basic syntax validation by checking for common issues
 */
function validateMermaid(mermaidCode, lineNumber) {
    const errors = [];
    const lines = mermaidCode.split('\n');

    // Check if it's empty
    if (mermaidCode.trim().length === 0) {
        errors.push({
            line: lineNumber,
            message: 'Empty Mermaid block'
        });
        return errors;
    }

    // Check for diagram type declaration (first line)
    const firstLine = lines[0].trim();
    const validTypes = [
        'graph', 'flowchart', 'sequenceDiagram', 'classDiagram',
        'stateDiagram', 'stateDiagram-v2', 'erDiagram', 'journey',
        'gantt', 'pie', 'quadrantChart', 'requirementDiagram',
        'gitGraph', 'mindmap', 'timeline', 'zenuml', 'sankey-beta'
    ];

    const hasValidType = validTypes.some(type => firstLine.startsWith(type));
    if (!hasValidType) {
        errors.push({
            line: lineNumber,
            message: `Unknown or missing diagram type. First line: "${firstLine}"`
        });
    }

    // Check for unmatched brackets/braces
    const brackets = { '(': ')', '[': ']', '{': '}' };
    const stack = [];

    for (let i = 0; i < mermaidCode.length; i++) {
        const char = mermaidCode[i];
        if (brackets[char]) {
            stack.push({ char: brackets[char], pos: i });
        } else if (Object.values(brackets).includes(char)) {
            if (stack.length === 0 || stack[stack.length - 1].char !== char) {
                const lineNum = mermaidCode.substring(0, i).split('\n').length;
                errors.push({
                    line: lineNumber + lineNum - 1,
                    message: `Unmatched closing bracket '${char}'`
                });
            } else {
                stack.pop();
            }
        }
    }

    if (stack.length > 0) {
        errors.push({
            line: lineNumber,
            message: `${stack.length} unclosed bracket(s)`
        });
    }

    // Check for common syntax issues
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const currentLine = lineNumber + i;

        // Skip empty lines and comments
        if (line.length === 0 || line.startsWith('%%')) continue;

        // Check for arrows in flowcharts without proper syntax
        if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) {
            // Check for node definitions without proper syntax
            if (line.includes('-->') && !line.match(/\w+\s*-->|--+>|--+\|.+\|--+>/)) {
                errors.push({
                    line: currentLine,
                    message: 'Possible malformed arrow syntax'
                });
            }

            // Check for problematic characters in node labels
            // Mermaid has issues with labels starting with special chars like / or containing unescaped special sequences
            const nodeMatches = line.match(/(\w+)\[([^\]]+)\]/g);
            if (nodeMatches) {
                for (const match of nodeMatches) {
                    const labelMatch = match.match(/\w+\[([^\]]+)\]/);
                    if (labelMatch) {
                        const label = labelMatch[1];

                        // Check if label starts with forward slash (common issue)
                        if (label.trim().startsWith('/')) {
                            errors.push({
                                line: currentLine,
                                message: `Node label starts with '/': "${label.substring(0, 30)}..." - this may cause lexical errors`
                            });
                        }

                        // Check for unbalanced HTML-like tags in labels
                        const openBrTags = (label.match(/<br\/?>/gi) || []).length;
                        const textBefore = label.split(/<br\/?>/i);
                        if (textBefore.length > 1) {
                            // Has <br> tags, check for potential issues
                            for (let part of textBefore) {
                                if (part.trim().startsWith('/') && !part.includes('\\')) {
                                    errors.push({
                                        line: currentLine,
                                        message: `Path-like text after <br> may cause issues: "${part.trim().substring(0, 20)}..." - consider escaping or rephrasing`
                                    });
                                }
                            }
                        }

                        // Check for potential regex/division ambiguity
                        if (label.includes('/') && label.split('/').length > 2) {
                            // Multiple slashes might be interpreted as division or regex
                            const slashCount = (label.match(/\//g) || []).length;
                            if (slashCount >= 2 && !label.includes('\\/')) {
                                errors.push({
                                    line: currentLine,
                                    message: `Multiple unescaped slashes in label may cause parsing issues: "${label.substring(0, 30)}..."`
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    return errors;
}

/**
 * Validate a markdown file and its embedded Mermaid diagrams
 * @param {string} filePath - Path to the markdown file
 * @returns {object} Validation result with errors array and statistics
 */
function validateMarkdownFile(filePath) {
    const errors = [];
    const stats = {
        markdownErrors: 0,
        mermaidErrors: 0,
        mermaidBlocksChecked: 0
    };

    try {
        // Read file
        const content = fs.readFileSync(filePath, 'utf-8');

        // Try to parse markdown with marked
        try {
            marked.parse(content);
        } catch (err) {
            errors.push({
                type: 'markdown',
                line: null,
                message: `Markdown parsing error: ${err.message}`
            });
            stats.markdownErrors++;
        }

        // Extract and validate Mermaid blocks
        const mermaidBlocks = extractMermaidBlocks(content);
        stats.mermaidBlocksChecked = mermaidBlocks.length;

        for (const block of mermaidBlocks) {
            const mermaidErrors = validateMermaid(block.content, block.lineNumber);

            for (const error of mermaidErrors) {
                errors.push({
                    type: 'mermaid',
                    line: error.line,
                    message: error.message
                });
                stats.mermaidErrors++;
            }
        }

    } catch (err) {
        errors.push({
            type: 'file',
            line: null,
            message: `Cannot read file: ${err.message}`
        });
    }

    return { errors, stats };
}

/**
 * Find all markdown files in a directory recursively
 */
function findMarkdownFiles(dir) {
    const files = [];

    function scan(currentPath) {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentPath, entry.name);

            if (entry.isDirectory()) {
                // Skip node_modules and hidden directories
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    scan(fullPath);
                }
            } else if (entry.isFile() && entry.name.match(/\.md$/i)) {
                files.push(fullPath);
            }
        }
    }

    scan(dir);
    return files;
}

/**
 * Validate markdown files (single file or directory)
 * @param {string} inputPath - Path to file or directory
 * @returns {object} Overall validation results
 */
function validateMarkdown(inputPath) {
    const results = {
        files: [],
        totalStats: {
            filesChecked: 0,
            filesWithErrors: 0,
            markdownErrors: 0,
            mermaidErrors: 0,
            mermaidBlocksChecked: 0
        }
    };

    // Check if input exists
    if (!fs.existsSync(inputPath)) {
        throw new Error(`File or directory not found: ${inputPath}`);
    }

    // Determine if input is a file or directory
    const stat = fs.statSync(inputPath);
    let files = [];

    if (stat.isDirectory()) {
        files = findMarkdownFiles(inputPath);
    } else if (inputPath.match(/\.md$/i)) {
        files = [inputPath];
    } else {
        throw new Error(`Not a markdown file or directory: ${inputPath}`);
    }

    if (files.length === 0) {
        return results; // No files to validate
    }

    // Validate each file
    for (const file of files) {
        results.totalStats.filesChecked++;
        const validation = validateMarkdownFile(file);

        results.files.push({
            path: file,
            errors: validation.errors,
            stats: validation.stats
        });

        if (validation.errors.length > 0) {
            results.totalStats.filesWithErrors++;
        }

        results.totalStats.markdownErrors += validation.stats.markdownErrors;
        results.totalStats.mermaidErrors += validation.stats.mermaidErrors;
        results.totalStats.mermaidBlocksChecked += validation.stats.mermaidBlocksChecked;
    }

    return results;
}

module.exports = {
    extractMermaidBlocks,
    validateMermaid,
    validateMarkdownFile,
    findMarkdownFiles,
    validateMarkdown
};
