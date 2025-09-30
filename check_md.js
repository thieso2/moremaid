#!/usr/bin/env node

/**
 * check_md.js - Validates Markdown files and Mermaid diagram syntax
 *
 * Usage:
 *   node check_md.js <file.md>
 *   node check_md.js <directory>
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// ANSI color codes for output
const colors = {
    reset: '\x1b[0m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    gray: '\x1b[90m'
};

// Statistics
const stats = {
    filesChecked: 0,
    filesWithErrors: 0,
    markdownErrors: 0,
    mermaidErrors: 0
};

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
            // Check for invalid arrow syntax
            if (line.includes('->') && !line.match(/--+>|==+>|\.-+>/)) {
                // This might be text content, not an error
            }

            // Check for node definitions without proper syntax
            if (line.includes('-->') && !line.match(/\w+\s*-->|--+>|--+\|.+\|--+>/)) {
                errors.push({
                    line: currentLine,
                    message: 'Possible malformed arrow syntax'
                });
            }
        }
    }

    return errors;
}

/**
 * Check markdown file for errors
 */
function checkMarkdownFile(filePath) {
    const errors = [];

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

    return errors;
}

/**
 * Print results for a file
 */
function printFileResults(filePath, errors) {
    const relativePath = path.relative(process.cwd(), filePath);

    if (errors.length === 0) {
        console.log(`${colors.green}✓${colors.reset} ${colors.gray}${relativePath}${colors.reset}`);
    } else {
        console.log(`${colors.red}✗${colors.reset} ${relativePath}`);

        for (const error of errors) {
            const lineInfo = error.line ? `:${error.line}` : '';
            const typeColor = error.type === 'mermaid' ? colors.yellow : colors.red;
            console.log(`  ${typeColor}[${error.type}]${colors.reset}${lineInfo} ${error.message}`);
        }

        stats.filesWithErrors++;
    }
}

/**
 * Main function
 */
function main() {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
${colors.blue}check_md.js${colors.reset} - Validate Markdown files and Mermaid diagrams

Usage:
  node check_md.js <file.md>       Check a single markdown file
  node check_md.js <directory>     Check all markdown files in directory

Examples:
  node check_md.js README.md
  node check_md.js docs/
  node check_md.js samples/
`);
        process.exit(0);
    }

    const inputPath = args[0];

    // Check if input exists
    if (!fs.existsSync(inputPath)) {
        console.error(`${colors.red}Error:${colors.reset} File or directory not found: ${inputPath}`);
        process.exit(1);
    }

    // Determine if input is a file or directory
    const stat = fs.statSync(inputPath);
    let files = [];

    if (stat.isDirectory()) {
        files = findMarkdownFiles(inputPath);
        console.log(`${colors.blue}Checking ${files.length} markdown file(s) in ${inputPath}${colors.reset}\n`);
    } else if (inputPath.match(/\.md$/i)) {
        files = [inputPath];
        console.log(`${colors.blue}Checking ${inputPath}${colors.reset}\n`);
    } else {
        console.error(`${colors.red}Error:${colors.reset} Not a markdown file or directory: ${inputPath}`);
        process.exit(1);
    }

    if (files.length === 0) {
        console.log(`${colors.yellow}No markdown files found${colors.reset}`);
        process.exit(0);
    }

    // Check each file
    for (const file of files) {
        stats.filesChecked++;
        const errors = checkMarkdownFile(file);
        printFileResults(file, errors);
    }

    // Print summary
    console.log('');
    console.log(`${colors.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
    console.log(`Files checked:     ${stats.filesChecked}`);
    console.log(`Files with errors: ${stats.filesWithErrors > 0 ? colors.red : colors.green}${stats.filesWithErrors}${colors.reset}`);
    console.log(`Markdown errors:   ${stats.markdownErrors > 0 ? colors.red : colors.green}${stats.markdownErrors}${colors.reset}`);
    console.log(`Mermaid errors:    ${stats.mermaidErrors > 0 ? colors.yellow : colors.green}${stats.mermaidErrors}${colors.reset}`);

    // Exit with error code if there were errors
    if (stats.filesWithErrors > 0) {
        process.exit(1);
    }
}

// Run main function
main();
