/**
 * HTML generation functionality
 */

const { marked } = require('marked');
const fs = require('fs');
const path = require('path');
const MiniSearch = require('minisearch');
const { formatSize } = require('./utils');
const { themes, typography, getBaseStyles } = require('./styles');

function generateHtmlFromMarkdown(markdown, title, isIndex, isServer, forceTheme = null) {
    // Configure marked with custom renderer for headers with IDs
    const renderer = new marked.Renderer();

    // Override heading renderer to add IDs for fragment navigation
    renderer.heading = function(text, level) {
        // Generate ID from text (lowercase, replace spaces with dashes, remove special chars)
        const id = text.toLowerCase()
            .replace(/[^\w\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-')      // Replace spaces with dashes
            .replace(/-+/g, '-')       // Replace multiple dashes with single dash
            .trim();

        return `<h${level} id="${id}">${text}</h${level}>`;
    };

    marked.setOptions({
        breaks: true,
        gfm: true,
        langPrefix: 'language-',
        renderer: renderer
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
            --bg-color-rgb: 255, 255, 255;
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
            --bg-color-rgb: 26, 26, 26;
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
            --bg-color-rgb: 255, 255, 255;
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
            --bg-color-rgb: 13, 17, 23;
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
            --bg-color-rgb: 40, 42, 54;
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
            --bg-color-rgb: 46, 52, 64;
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
            --bg-color-rgb: 253, 246, 227;
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
            --bg-color-rgb: 0, 43, 54;
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
            --bg-color-rgb: 39, 40, 34;
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
            --bg-color-rgb: 40, 44, 52;
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
            padding: 80px 30px 30px 30px;
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
            bottom: 10px;
            left: 10px;
            width: 30px;
            height: 30px;
            z-index: 2001;
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
            font-size: 24px;
            color: var(--text-color);
            opacity: 0.3;
            transition: opacity 0.2s;
        }

        .controls-trigger:hover {
            opacity: 0.6;
        }

        .controls {
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 2002;
            display: flex;
            gap: 10px;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .controls.visible {
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

        .controls /* Hover effect removed */

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

        .zoom-control /* Hover effect removed */

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
            /* border-left removed */
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

        /* Hover effect removed */

        a {
            color: var(--link-color);
            text-decoration: none;
        }

        /* Hover effect removed */

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

        .nav-bar /* Hover effect removed */
    </style>
</head>
<body data-typography="default">
    <button class="controls-trigger">⚙</button>
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
            // Try regular zoom container first
            const zoomContainer = document.getElementById('zoomContainer');
            if (zoomContainer) {
                zoomContainer.style.transform = 'scale(' + scale + ')';
                zoomContainer.style.transformOrigin = '0 0';
                zoomContainer.style.width = (100 / scale) + '%';
                zoomContainer.style.height = (100 / scale) + '%';
            }

            // Also check if we're in overlay mode and apply zoom to overlay body instead
            const overlayBody = document.querySelector('.file-overlay-body');
            if (overlayBody && document.querySelector('.file-overlay.visible')) {
                // Apply zoom directly to the body content
                overlayBody.style.zoom = scale;
                overlayBody.style.transform = 'none';  // Clear any transform
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

        // Controls trigger
        const controlsTrigger = document.querySelector('.controls-trigger');
        const controls = document.querySelector('.controls');
        let controlsVisible = false;

        controlsTrigger.addEventListener('click', function() {
            controlsVisible = !controlsVisible;
            if (controlsVisible) {
                controls.classList.add('visible');
            } else {
                controls.classList.remove('visible');
            }
        });

        // Click outside to close
        document.addEventListener('click', function(e) {
            if (!controlsTrigger.contains(e.target) && !controls.contains(e.target)) {
                controlsVisible = false;
                controls.classList.remove('visible');
            }
        });

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
function generateIndexHtmlWithSearch(folderPath, files, port, forceTheme = null) {
    const folderName = path.basename(folderPath) || 'Directory';

    // Prepare file data WITHOUT content for initial load
    // Content will be loaded via API to avoid script injection issues
    // Helper function to format time ago
    const formatTimeAgo = (date) => {
        const now = new Date();
        const then = new Date(date);
        const seconds = Math.floor((now - then) / 1000);

        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes === 1 ? '1 min ago' : `${minutes} mins ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
        const weeks = Math.floor(days / 7);
        if (weeks < 4) return weeks === 1 ? 'last week' : `${weeks} weeks ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return months === 1 ? 'last month' : `${months} months ago`;
        const years = Math.floor(days / 365);
        return years === 1 ? 'last year' : `${years} years ago`;
    };

    const fileData = files.map((file, index) => {
        let size = '';
        let sizeBytes = 0;
        let modified = '';
        let modifiedDisplay = '';
        let modifiedFull = '';
        let stats = null;

        // Only get stats for disk-based files (not virtual/ZIP files)
        if (!folderPath.includes('[ZIP Archive]')) {
            try {
                const fullPath = path.join(folderPath, file);
                stats = fs.statSync(fullPath);

                // Format file size in human readable format
                const formatSize = (bytes) => {
                    if (bytes < 1024) return bytes + 'B';
                    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
                    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
                    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + 'GB';
                };

                size = formatSize(stats.size);
                sizeBytes = stats.size;
                // Store ISO format for sorting
                modified = stats.mtime.toISOString();
                // Human-readable time ago
                modifiedDisplay = formatTimeAgo(stats.mtime);
                // Full date for tooltip
                modifiedFull = new Date(stats.mtime).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                // Ignore stat errors for virtual files
            }
        }

        return {
            id: index,
            path: file,
            fileName: path.basename(file),
            directory: path.dirname(file) === '.' ? '' : path.dirname(file),
            size: size,
            sizeBytes: sizeBytes,
            modified: modified,
            modifiedDisplay: modifiedDisplay,
            modifiedFull: modifiedFull
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
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
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
            left: 0;
            right: 0;
            padding: 10px 20px;
            background: var(--bg-color);
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }

        .search-field {
            width: 100%;
            max-width: 500px;
            padding: 8px 12px;
            font-size: 13px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-color);
            color: var(--text-color);
            transition: border-color 0.2s, box-shadow 0.2s;
        }

        .search-field:focus {
            outline: none;
            border-color: var(--link-color);
            box-shadow: 0 0 0 3px rgba(var(--link-color-rgb, 0, 123, 255), 0.2);
        }

        /* When navigating files, dim the search field border to show focus has moved */
        .search-field.files-focused {
            border-color: var(--border-color);
            box-shadow: none;
        }

        .search-mode {
            font-size: 11px;
            color: var(--file-info-color);
            white-space: nowrap;
            padding: 3px 6px;
            background: var(--code-bg);
            border-radius: 4px;
            opacity: 0.7;
            transition: opacity 0.2s;
        }

        .search-help {
            font-size: 11px;
            color: var(--file-info-color);
            opacity: 0.5;
            white-space: nowrap;
            margin-left: 10px;
        }

        .search-help kbd {
            display: inline-block;
            padding: 2px 4px;
            font-size: 10px;
            font-family: monospace;
            background: var(--code-bg);
            border: 1px solid var(--border-color);
            border-radius: 3px;
        }

        /* Hover effect removed */

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
            /* border-left removed */
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

        .search-help {
            font-size: 10px;
            color: var(--file-info-color);
            opacity: 0.6;
            white-space: nowrap;
        }

        .search-help kbd {
            display: inline-block;
            padding: 2px 4px;
            font-family: monospace;
            font-size: 10px;
            background: var(--code-bg);
            border: 1px solid var(--border-color);
            border-radius: 3px;
            box-shadow: 0 1px 1px rgba(0,0,0,0.1);
        }

        .file-list {
            margin-top: 0;
        }

        /* Completely disable ALL hover effects on file list */
        /* Hover effect removed */

        /* Keep file-item-row background transparent on hover */
            background: transparent !important;
            color: inherit !important;
            transform: none !important;
        }

        /* Don't change any styles for snippets on hover */
            background: inherit !important;
            color: inherit !important;
            opacity: inherit !important;
            transform: none !important;
        }

        .file-item * {
            pointer-events: none;
        }

        .file-item {
            pointer-events: auto;
        }

        .file-item.selected {
            background: var(--code-bg);
            outline: 3px solid var(--link-color);
            outline-offset: -1px;
            border-radius: 4px;
            box-shadow: 0 0 0 4px rgba(var(--link-color-rgb, 0, 123, 255), 0.1);
            transition: opacity 0.2s, outline-color 0.2s;
        }

        /* Dim selected file when list is not focused */
        .file-list:not(.list-focused) .file-item.selected {
            outline-color: var(--border-color);
            opacity: 0.6;
            box-shadow: none;
        }

        /* Controls styling for index page */
        .controls-trigger {
            position: fixed;
            bottom: 10px;
            left: 10px;
            width: 30px;
            height: 30px;
            z-index: 2001;
            cursor: pointer;
            background: none;
            border: none;
            padding: 0;
            font-size: 24px;
            color: var(--text-color);
            opacity: 0.3;
            transition: opacity 0.2s;
        }

        .controls-trigger:hover {
            opacity: 0.6;
        }

        .controls {
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 2002;
            display: flex;
            gap: 10px;
            align-items: center;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        }

        .controls.visible {
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

        .controls /* Hover effect removed */

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

        .zoom-control /* Hover effect removed */

        .zoom-value {
            color: var(--bg-color);
            font-size: 14px;
            min-width: 45px;
            text-align: center;
        }


        .file-list {
            padding-top: 0;
        }

        .file-list-flat {
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        .file-list-header {
            display: flex;
            padding: 8px 0;
            border-bottom: 2px solid var(--border-color);
            font-weight: 600;
            font-size: 12px;
            color: var(--file-info-color);
            margin-bottom: 8px;
        }

        .file-list-header > div {
            cursor: default;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* Disable header hover effect */
        .file-list-header > /* Hover effect removed */

        .file-list-header .sort-arrow {
            font-size: 10px;
            opacity: 0.5;
        }

        .file-list-header .sort-arrow.active {
            opacity: 1;
            color: var(--link-color);
        }

        .col-name {
            flex: 1;
        }

        .col-size {
            width: 80px;
            text-align: right;
            padding-right: 16px;
            justify-content: flex-end;
        }

        .col-modified {
            width: 120px;
            text-align: right;
            justify-content: flex-end;
        }

        .file-item {
            display: block;
            padding: 4px 0;
            line-height: 1.5;
            cursor: default;
        }

        .file-item-row {
            display: flex;
            align-items: center;
        }

        .file-name {
            flex: 1;
            color: var(--text-color);
            text-decoration: none;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 14px;
        }

        .file-size, .file-modified {
            color: var(--text-muted);
            font-size: 12px;
            opacity: 0.6;
        }

        .file-size {
            width: 80px;
            text-align: right;
            padding-right: 16px;
        }

        .file-modified {
            width: 120px;
            text-align: right;
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

        .content-snippet .context-line,
        .content-snippet .match-line {
            display: block !important;
            width: 100%;
            margin: 2px 0;
            clear: both;
        }

        .content-snippet .context-line {
            opacity: 0.7;
            font-style: italic;
        }

        .content-snippet .match-line {
            font-weight: 600;
            background: rgba(52, 152, 219, 0.1);
            padding: 2px 4px;
            border-radius: 2px;
        }

        /* Disable all hover effects and preserve snippet styles */
        .content-snippet {
            pointer-events: none !important;
            isolation: isolate !important;
        }

        /* Preserve snippet container background at all times */
        .file-item .content-snippet,
            background: var(--code-bg) !important;
            /* border-left removed */
        }

        /* Preserve match line background even when parent changes */
        .file-item .content-snippet .match-line,
            background: rgba(52, 152, 219, 0.1) !important;
            font-weight: 600 !important;
            padding: 2px 4px !important;
        }

        /* Preserve context line styles */
        .file-item .content-snippet .context-line,
            opacity: 0.7 !important;
            font-style: italic !important;
            background: transparent !important;
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

        /* File overlay styles */
        .file-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            backdrop-filter: blur(4px);
            z-index: 2000;
            display: none;
            opacity: 0;
            transition: opacity 0.3s ease;
        }

        .file-overlay.visible {
            display: block;
        }

        .file-overlay.active {
            opacity: 1;
        }

        .file-overlay-content {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: var(--bg-color);
            transform: translateY(100%);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: auto;
        }

        .file-overlay.active .file-overlay-content {
            transform: translateY(0);
        }

        .file-overlay-header {
            position: sticky;
            top: 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 20px;
            background: var(--bg-color);
            border-bottom: 1px solid var(--border-color);
            z-index: 10;
        }

        .file-overlay-title {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
            font-size: 12px;
            color: var(--file-info-color);
            margin: 0;
            opacity: 0.8;
        }

        .file-overlay-close {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: var(--heading-color);
            color: var(--bg-color);
            border: none;
            font-size: 18px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s ease, opacity 0.2s ease;
        }

        /* Hover effect removed */

        .file-overlay-body {
            padding: 30px;
            max-width: 1200px;
            margin: 0 auto;
        }

        .file-overlay-loading {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 200px;
            font-size: 18px;
            color: var(--file-info-color);
        }

        @keyframes slideUp {
            from {
                transform: translateY(100%);
                opacity: 0;
            }
            to {
                transform: translateY(0);
                opacity: 1;
            }
        }

        @keyframes fadeIn {
            from {
                opacity: 0;
            }
            to {
                opacity: 1;
            }
        }
    </style>
</head>
<body data-typography="default">
    <div class="search-container">
        <input
            type="text"
            class="search-field"
            id="searchField"
            placeholder="Search ${files.length} files"
            autocomplete="off"
        />
        <span class="search-mode" id="searchModeIndicator">in names & paths</span>
        <span class="search-help">
            <kbd>TAB</kbd> focus • <kbd>SHIFT+TAB</kbd> mode • <kbd>↑↓</kbd> select • <kbd>ENTER</kbd> open • <kbd>Ctrl/Cmd+Click</kbd> new tab
        </span>
    </div>

    <button class="controls-trigger">⚙</button>
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
                ${generateFileListHTML(fileData, 'name-asc')}
            </div>
        </div>
    </div>

    <!-- File overlay -->
    <div class="file-overlay" id="fileOverlay">
        <div class="file-overlay-content">
            <div class="file-overlay-header">
                <h2 class="file-overlay-title" id="overlayTitle"></h2>
                <button class="file-overlay-close" id="overlayClose" title="Close (ESC)">×</button>
            </div>
            <div class="file-overlay-body" id="overlayBody">
                <div class="file-overlay-loading">Loading...</div>
            </div>
        </div>
    </div>

    <!-- Connection lost overlay -->
    <div id="connectionLost" style="
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(10px);
        z-index: 10000;
        justify-content: center;
        align-items: center;
    ">
        <div style="
            background: var(--bg-color);
            padding: 40px;
            border-radius: 12px;
            text-align: center;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        ">
            <h2 style="color: #e74c3c; margin: 0 0 10px 0;">Connection Lost</h2>
            <p style="margin: 0; color: var(--text-color);">Server has stopped - you can close the window</p>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/minisearch@7/dist/umd/index.min.js"></script>
    <script>
        // File data
        const allFiles = ${JSON.stringify(fileData)};

        // Initialize Mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default'
        });

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
        const fileList = document.getElementById('fileList');
        const searchModeIndicator = document.getElementById('searchModeIndicator');
        let searchMode = 'filename'; // 'filename' or 'content'

        // Get initial search state from URL
        const urlParams = new URLSearchParams(window.location.search);
        const initialQuery = urlParams.get('q') || '';

        // Set initial state
        if (initialQuery) {
            searchField.value = initialQuery;
        }

        // Focus search field on load
        setTimeout(() => searchField.focus(), 100);

        // Global keyboard handler for CMD+K to focus search
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchField.focus();
                searchField.select();
            }
            // Handle arrow keys globally for list navigation
            else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !overlay.classList.contains('visible')) {
                // Always prevent default scrolling
                e.preventDefault();

                // Only handle if focus is not in search field AND not already handled by fileListFocus
                // The fileListFocus element handles arrow keys when list has focus
                if (document.activeElement !== searchField && document.activeElement !== fileListFocus) {
                    updateVisibleFiles();
                    if (e.key === 'ArrowDown' && selectedFileIndex < visibleFiles.length - 1) {
                        selectFile(selectedFileIndex + 1);
                    } else if (e.key === 'ArrowUp' && selectedFileIndex > 0) {
                        selectFile(selectedFileIndex - 1);
                    }
                }
            }

            // Update cursor for file items when modifier keys are pressed
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
                const hoveredItem = document.querySelector('.file-item:hover');
                if (hoveredItem) {
                    hoveredItem.style.cursor = 'copy';
                }
            }
        });

        // Global keyboard handler for modifier key release
        document.addEventListener('keyup', (e) => {
            // Reset cursor when modifier keys are released
            if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
                const hoveredItem = document.querySelector('.file-item:hover');
                if (hoveredItem) {
                    hoveredItem.style.cursor = 'default';
                }
            }
        });

        // Update URL without page reload
        function updateURL(query) {
            const url = new URL(window.location);
            if (query) {
                url.searchParams.set('q', query);
            } else {
                url.searchParams.delete('q');
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

        // Toggle search mode
        function toggleSearchMode() {
            searchMode = searchMode === 'filename' ? 'content' : 'filename';
            searchModeIndicator.textContent = searchMode === 'filename' ? 'in names & paths' : 'in file contents';

            // Re-run the search with the new mode
            const query = searchField.value.trim();
            if (query) {
                updateSuggestions(query);
            }
        }

        // Filter files based on query
        async function filterFiles(query) {
            if (!query) return allFiles;

            // Content search (via API)
            if (searchMode === 'content' && query.length >= 2) {
                try {
                    const response = await fetch('/api/search?q=' + encodeURIComponent(query) + '&mode=content');
                    if (!response.ok) {
                        throw new Error('HTTP error! status: ' + response.status);
                    }
                    const results = await response.json();
                    return results;
                } catch (error) {
                    console.error('Content search failed:', error);
                    // Fallback to filename search
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
            updateURL(query);

            if (!query) {
                // Show all files
                document.querySelectorAll('.file-item').forEach(item => {
                    item.classList.remove('hidden');

                    // Remove any content snippets
                    const snippets = item.querySelectorAll('.content-snippet');
                    snippets.forEach(s => s.remove());

                    const fileName = item.querySelector('.file-name');
                    if (fileName) {
                        // Remove highlighting and match counts
                        const originalText = fileName.textContent.replace(/ \d+ match(es)?$/, '');
                        fileName.innerHTML = originalText;
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
                const fileName = item.querySelector('.file-name');
                const fileData = matchingFiles.get(filePath);

                // Remove any existing snippets
                const existingSnippets = item.querySelectorAll('.content-snippet');
                existingSnippets.forEach(s => s.remove());

                if (fileData) {
                    item.classList.remove('hidden');
                    // Add highlighting to visible files
                    if (fileName) {
                        // Remove any existing match count span
                        const existingCount = fileName.querySelector('.match-count');
                        if (existingCount) {
                            existingCount.remove();
                        }

                        // Get the clean text without match count
                        const originalText = fileName.textContent;
                        fileName.innerHTML = highlightMatch(originalText, query);

                        // Add match count for content searches
                        if (fileData.matches && fileData.matches.length > 0) {
                            // First remove any existing match count spans
                            const existingCounts = fileName.querySelectorAll('.match-count');
                            existingCounts.forEach(span => span.remove());

                            const countSpan = document.createElement('span');
                            countSpan.className = 'match-count';
                            countSpan.textContent = ' ' + fileData.matches.length + ' match' + (fileData.matches.length > 1 ? 'es' : '');
                            fileName.appendChild(countSpan);
                        }
                    }

                    // Add content snippets if available
                    if (fileData.matches && fileData.matches.length > 0) {
                        // Create a container for all snippets
                        const allSnippetsContainer = document.createElement('div');
                        allSnippetsContainer.style.cssText = 'margin-top: 8px !important; margin-left: 20px !important; pointer-events: none !important; isolation: isolate !important;';

                        // Show up to 3 snippets per file
                        const snippetsToShow = fileData.matches.slice(0, 3);
                        snippetsToShow.forEach((match, matchIndex) => {
                            const snippet = document.createElement('div');
                            snippet.className = 'content-snippet';
                            snippet.style.cssText = 'margin-bottom: 12px !important; padding: 8px 12px !important; background: var(--code-bg) !important; border-radius: 4px !important;';

                            // If we have context lines, show all 3 lines
                            if (match.contextLines && match.contextLines.length > 0) {
                                // Add title showing line number range
                                const lineNumbers = match.contextLines.map(l => l.lineNumber);
                                const minLine = Math.min(...lineNumbers);
                                const maxLine = Math.max(...lineNumbers);
                                const titleDiv = document.createElement('div');
                                titleDiv.style.cssText = 'font-size: 11px; color: var(--file-info-color); margin-bottom: 8px; font-weight: 600; opacity: 0.8;';
                                titleDiv.textContent = 'Lines ' + minLine + '-' + maxLine;
                                snippet.appendChild(titleDiv);

                                // Create each line as a separate block element
                                match.contextLines.forEach((line, lineIndex) => {
                                    const lineDiv = document.createElement('div');
                                    lineDiv.className = line.isMatch ? 'match-line' : 'context-line';
                                    // Force block display and add margin between lines
                                    lineDiv.style.cssText = 'display: block !important; margin: 4px 0 !important; padding: 2px 4px !important; line-height: 1.4 !important;';

                                    // Add the line content without line number prefix
                                    if (line.isMatch) {
                                        lineDiv.innerHTML = highlightMatch(line.text, query);
                                        lineDiv.style.background = 'rgba(52, 152, 219, 0.1) !important';
                                        lineDiv.style.fontWeight = '600 !important';
                                    } else {
                                        lineDiv.textContent = line.text;
                                        lineDiv.style.opacity = '0.7 !important';
                                        lineDiv.style.fontStyle = 'italic !important';
                                    }

                                    snippet.appendChild(lineDiv);
                                });
                            } else {
                                // Fallback to single line display
                                const titleDiv = document.createElement('div');
                                titleDiv.style.cssText = 'font-size: 11px; color: var(--file-info-color); margin-bottom: 8px; font-weight: 600; opacity: 0.8;';
                                titleDiv.textContent = 'Line ' + match.lineNumber;
                                snippet.appendChild(titleDiv);

                                const lineDiv = document.createElement('div');
                                lineDiv.className = 'match-line';
                                lineDiv.style.cssText = 'display: block !important;';
                                const lineText = match.text.trim();
                                lineDiv.innerHTML = highlightMatch(lineText, query);
                                snippet.appendChild(lineDiv);
                            }

                            allSnippetsContainer.appendChild(snippet);
                        });

                        item.appendChild(allSnippetsContainer);
                    }
                } else {
                    item.classList.add('hidden');
                    // Remove highlighting from hidden files
                    if (fileName) {
                        const originalText = fileName.textContent.replace(/ \d+ match(es)?$/, ''); // Remove match count
                        fileName.innerHTML = originalText;
                    }
                }
            });

            // Re-attach click handlers after updating the file list
            setupFileClickHandlers();
        }

        // Track selected file index for keyboard navigation
        let selectedFileIndex = -1;
        let visibleFiles = [];
        let focusMode = 'search'; // 'search' or 'list'
        let currentSortMethod = 'name-asc'; // Default sort

        // Create a hidden focusable element for the file list
        const fileListFocus = document.createElement('div');
        fileListFocus.setAttribute('tabindex', '0');
        fileListFocus.style.position = 'absolute';
        fileListFocus.style.width = '1px';
        fileListFocus.style.height = '1px';
        fileListFocus.style.opacity = '0';
        fileListFocus.style.pointerEvents = 'none';
        fileList.insertBefore(fileListFocus, fileList.firstChild);

        function updateVisibleFiles() {
            visibleFiles = Array.from(document.querySelectorAll('.file-item:not(.hidden)'));
        }

        function setFocusMode(mode) {
            focusMode = mode;
            if (mode === 'list') {
                // Move actual focus to the hidden element to stop cursor blinking
                fileListFocus.focus();
                searchField.classList.add('files-focused');
                // Add class to show list is focused
                fileList.classList.add('list-focused');
                // Don't auto-select first item when switching focus
            } else {
                // Return focus to search field
                searchField.focus();
                searchField.classList.remove('files-focused');
                // Remove class to show list is not focused
                fileList.classList.remove('list-focused');
            }
        }

        function selectFile(index) {
            // Clear previous selection
            document.querySelectorAll('.file-item.selected').forEach(item => {
                item.classList.remove('selected');
            });

            if (index >= 0 && index < visibleFiles.length) {
                selectedFileIndex = index;
                const selectedItem = visibleFiles[index];
                selectedItem.classList.add('selected');

                // Scroll into view if needed
                selectedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                selectedFileIndex = -1;
            }
        }

        function openSelectedFile() {
            console.log('openSelectedFile called:', {
                selectedFileIndex,
                visibleFilesLength: visibleFiles.length,
                activeElement: document.activeElement?.id || document.activeElement?.className
            });
            if (selectedFileIndex >= 0 && selectedFileIndex < visibleFiles.length) {
                const selectedItem = visibleFiles[selectedFileIndex];
                const filePath = selectedItem.dataset.path;
                if (filePath) {
                    showOverlay(filePath);
                }
            }
        }

        // Handle keyboard navigation in search field
        searchField.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && e.shiftKey) {
                // SHIFT+TAB to toggle search mode
                e.preventDefault();
                toggleSearchMode();
            } else if (e.key === 'Tab' && !e.shiftKey) {
                // TAB to switch focus to file list and select first item if none selected
                e.preventDefault();
                updateVisibleFiles();
                setFocusMode('list');
                if (selectedFileIndex === -1 && visibleFiles.length > 0) {
                    selectFile(0);
                }
            } else if (e.key === 'ArrowDown') {
                // If there's text in the field, move cursor to end
                if (searchField.value) {
                    e.preventDefault();
                    searchField.setSelectionRange(searchField.value.length, searchField.value.length);
                } else if (visibleFiles.length > 0) {
                    // If field is empty, go to list and select first item
                    e.preventDefault();
                    updateVisibleFiles();
                    setFocusMode('list');
                    if (selectedFileIndex === -1) {
                        selectFile(0);
                    } else if (selectedFileIndex < visibleFiles.length - 1) {
                        selectFile(selectedFileIndex + 1);
                    }
                }
            } else if (e.key === 'ArrowUp') {
                // Move cursor to beginning of field
                if (searchField.value) {
                    e.preventDefault();
                    searchField.setSelectionRange(0, 0);
                }
            } else if (e.key === 'Enter') {
                // Enter opens the selected file
                console.log('Enter pressed on searchField');
                e.preventDefault();
                openSelectedFile();
            }
        });

        // Handle keyboard navigation in file list
        fileListFocus.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey) {
                // TAB returns to search field
                e.preventDefault();
                setFocusMode('search');
            } else if (e.key === 'Tab' && e.shiftKey) {
                // Prevent SHIFT+TAB in list
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                updateVisibleFiles();
                if (selectedFileIndex < visibleFiles.length - 1) {
                    selectFile(selectedFileIndex + 1);
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                updateVisibleFiles();
                if (selectedFileIndex > 0) {
                    selectFile(selectedFileIndex - 1);
                }
                // Stay on first item when pressing up from first item
            } else if (e.key === 'Enter') {
                console.log('Enter pressed on fileListFocus');
                e.preventDefault();
                openSelectedFile();
            }
        });

        // Handle input changes
        searchField.addEventListener('input', (e) => {
            updateSuggestions(e.target.value);
            // Reset selection when search changes
            selectedFileIndex = -1;
            selectFile(-1);
            // Ensure we're in search mode when typing
            if (focusMode !== 'search') {
                setFocusMode('search');
            }
        });

        // Handle column header clicks for sorting
        function setupSortHandlers() {
            const headers = document.querySelectorAll('.file-list-header > div');
            headers.forEach(header => {
                header.addEventListener('click', (e) => {
                    const sortType = header.dataset.sort;
                    let newSortMethod = currentSortMethod;

                    if (sortType === 'name') {
                        newSortMethod = currentSortMethod === 'name-asc' ? 'name-desc' : 'name-asc';
                    } else if (sortType === 'size') {
                        newSortMethod = currentSortMethod === 'size-asc' ? 'size-desc' : 'size-asc';
                    } else if (sortType === 'date') {
                        newSortMethod = currentSortMethod === 'date-desc' ? 'date-asc' : 'date-desc';
                    }

                    currentSortMethod = newSortMethod;
                    // Regenerate the file list with new sort order
                    const fileListEl = document.getElementById('fileList');
                    fileListEl.innerHTML = generateFileListHTML(allFiles, currentSortMethod);
                    // Re-insert the focus element that was removed when innerHTML was replaced
                    fileListEl.insertBefore(fileListFocus, fileListEl.firstChild);
                    setupSortHandlers(); // Re-attach handlers
                    setupFileClickHandlers(); // Re-attach file click handlers
                    // Re-run current search if any
                    const query = searchField.value.trim();
                    if (query) {
                        updateSuggestions(query);
                    }
                });
            });
        }

        // Setup file click handlers
        function setupFileClickHandlers() {
            const fileItems = document.querySelectorAll('.file-item');
            fileItems.forEach(item => {
                // Add cursor style changes on modifier key hold
                item.addEventListener('mouseenter', (e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                        item.style.cursor = 'copy';
                    }
                });

                item.addEventListener('mouseleave', (e) => {
                    item.style.cursor = 'default';
                });

                item.addEventListener('mousemove', (e) => {
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                        item.style.cursor = 'copy';
                    } else {
                        item.style.cursor = 'default';
                    }
                });

                item.addEventListener('click', (e) => {
                    e.preventDefault();
                    const filePath = item.dataset.path;

                    // Check for modifier keys or middle click
                    const openInNewWindow = e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1;

                    if (openInNewWindow && filePath) {
                        // Open in new window/tab
                        const url = window.location.origin + '/view?file=' + encodeURIComponent(filePath);
                        window.open(url, '_blank');
                    } else {
                        // Original behavior - open in overlay
                        // Switch focus to list when clicking
                        if (focusMode !== 'list') {
                            setFocusMode('list');
                        }
                        // Select the clicked item
                        updateVisibleFiles();
                        const index = visibleFiles.indexOf(item);
                        if (index !== -1) {
                            selectFile(index);
                        }
                        // Open the file in overlay
                        if (filePath) {
                            showOverlay(filePath);
                        }
                    }
                });

                // Handle middle mouse button (auxclick event)
                item.addEventListener('auxclick', (e) => {
                    if (e.button === 1) { // Middle button
                        e.preventDefault();
                        const filePath = item.dataset.path;
                        if (filePath) {
                            const url = window.location.origin + '/view?file=' + encodeURIComponent(filePath);
                            window.open(url, '_blank');
                        }
                    }
                });
            });
        }

        setupSortHandlers();
        setupFileClickHandlers();

        // Helper function to format time ago
        function formatTimeAgo(date) {
            const now = new Date();
            const then = new Date(date);
            const seconds = Math.floor((now - then) / 1000);

            if (seconds < 60) return 'just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return minutes === 1 ? '1 min ago' : \`\${minutes} mins ago\`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return hours === 1 ? '1 hour ago' : \`\${hours} hours ago\`;
            const days = Math.floor(hours / 24);
            if (days < 7) return days === 1 ? 'yesterday' : \`\${days} days ago\`;
            const weeks = Math.floor(days / 7);
            if (weeks < 4) return weeks === 1 ? 'last week' : \`\${weeks} weeks ago\`;
            const months = Math.floor(days / 30);
            if (months < 12) return months === 1 ? 'last month' : \`\${months} months ago\`;
            const years = Math.floor(days / 365);
            return years === 1 ? 'last year' : \`\${years} years ago\`;
        }

        // Helper function to generate file list HTML (needed for sorting)
        function generateFileListHTML(fileData, sortMethod = 'name-asc') {
            // Sort files based on selected method
            let sortedFiles = [...fileData];

            switch(sortMethod) {
                case 'name-asc':
                    sortedFiles.sort((a, b) => a.path.localeCompare(b.path));
                    break;
                case 'name-desc':
                    sortedFiles.sort((a, b) => b.path.localeCompare(a.path));
                    break;
                case 'date-desc':
                    sortedFiles.sort((a, b) => {
                        if (!a.modified && !b.modified) return a.path.localeCompare(b.path);
                        if (!a.modified) return 1;
                        if (!b.modified) return -1;
                        return new Date(b.modified) - new Date(a.modified);
                    });
                    break;
                case 'date-asc':
                    sortedFiles.sort((a, b) => {
                        if (!a.modified && !b.modified) return a.path.localeCompare(b.path);
                        if (!a.modified) return 1;
                        if (!b.modified) return -1;
                        return new Date(a.modified) - new Date(b.modified);
                    });
                    break;
                case 'size-desc':
                    sortedFiles.sort((a, b) => {
                        if (!a.sizeBytes && !b.sizeBytes) return a.path.localeCompare(b.path);
                        if (!a.sizeBytes) return 1;
                        if (!b.sizeBytes) return -1;
                        return b.sizeBytes - a.sizeBytes;
                    });
                    break;
                case 'size-asc':
                    sortedFiles.sort((a, b) => {
                        if (!a.sizeBytes && !b.sizeBytes) return a.path.localeCompare(b.path);
                        if (!a.sizeBytes) return 1;
                        if (!b.sizeBytes) return -1;
                        return a.sizeBytes - b.sizeBytes;
                    });
                    break;
                default:
                    sortedFiles.sort((a, b) => a.path.localeCompare(b.path));
            }

            // Determine which arrows to show based on current sort method
            const getArrow = (column, ascending, descending) => {
                if (sortMethod === ascending) return '<span class="sort-arrow active">▲</span>';
                if (sortMethod === descending) return '<span class="sort-arrow active">▼</span>';
                return '<span class="sort-arrow">◆</span>';
            };

            let html = '<div class="file-list-flat">';

            // Add clickable header
            html += '<div class="file-list-header">';
            html += \`<div class="col-name" data-sort="name">\${getArrow('name', 'name-asc', 'name-desc')} Name</div>\`;
            html += \`<div class="col-size" data-sort="size">Size \${getArrow('size', 'size-asc', 'size-desc')}</div>\`;
            html += \`<div class="col-modified" data-sort="date">Modified \${getArrow('date', 'date-desc', 'date-asc')}</div>\`;
            html += '</div>';

            sortedFiles.forEach(file => {
                const fullPath = file.path;
                html += \`<div class="file-item" data-path="\${file.path}">\`;
                html += '<div class="file-item-row">';
                html += \`<div class="file-name">\${fullPath}</div>\`;
                html += \`<div class="file-size">\${file.size || ''}</div>\`;

                // Handle modified date
                let modifiedHtml = '';
                if (file.modified) {
                    const timeAgo = formatTimeAgo(file.modified);
                    const fullDate = new Date(file.modified).toLocaleString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                    modifiedHtml = \`<div class="file-modified" title="\${fullDate}">\${timeAgo}</div>\`;
                } else if (file.modifiedDisplay) {
                    const title = file.modifiedFull ? \` title="\${file.modifiedFull}"\` : '';
                    modifiedHtml = \`<div class="file-modified"\${title}>\${file.modifiedDisplay}</div>\`;
                } else {
                    modifiedHtml = '<div class="file-modified"></div>';
                }
                html += modifiedHtml;
                html += '</div>'; // Close file-item-row
                html += '</div>';
            });
            html += '</div>';

            return html;
        }

        // Handle focus
        searchField.addEventListener('focus', () => {
            // Set focus mode to search when field gets direct focus
            if (focusMode !== 'search') {
                focusMode = 'search';
                searchField.classList.remove('files-focused');
            }
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

            // Global Enter key handler as fallback
            if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                // Only handle if not in search field or file list (those have their own handlers)
                if (document.activeElement !== searchField && document.activeElement !== fileListFocus) {
                    // Check if we have a selected file and we're in the list view
                    if (selectedFileIndex >= 0 && !document.querySelector('.file-overlay.visible')) {
                        console.log('Global Enter fallback triggered');
                        e.preventDefault();
                        openSelectedFile();
                    }
                }
            }
        });

        // Handle browser back/forward navigation
        window.addEventListener('popstate', () => {
            const urlParams = new URLSearchParams(window.location.search);
            const query = urlParams.get('q') || '';

            // Update search field
            searchField.value = query;

            // Run search
            updateSuggestions(query);
        });

        // Run initial search if there's a query in the URL
        if (initialQuery) {
            updateSuggestions(initialQuery);
        }

        // Mouse hover selection DISABLED - no hover effects on list
        // fileList.addEventListener('mousemove', (e) => {
        //     const fileItem = e.target.closest('.file-item');
        //     if (fileItem && !fileItem.classList.contains('hidden')) {
        //         updateVisibleFiles();
        //         const index = visibleFiles.indexOf(fileItem);
        //         if (index !== -1 && index !== selectedFileIndex) {
        //             selectFile(index);
        //         }
        //     }
        // });

        // Click handler is now handled by setupFileClickHandlers()
        // which properly handles .file-item divs with data-path attributes

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
            // Try regular zoom container first
            const zoomContainer = document.getElementById('zoomContainer');
            if (zoomContainer) {
                zoomContainer.style.transform = 'scale(' + scale + ')';
                zoomContainer.style.transformOrigin = '0 0';
                zoomContainer.style.width = (100 / scale) + '%';
                zoomContainer.style.height = (100 / scale) + '%';
            }

            // Also check if we're in overlay mode and apply zoom to overlay body instead
            const overlayBody = document.querySelector('.file-overlay-body');
            if (overlayBody && document.querySelector('.file-overlay.visible')) {
                // Apply zoom directly to the body content
                overlayBody.style.zoom = scale;
                overlayBody.style.transform = 'none';  // Clear any transform
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

        // Controls trigger
        const controlsTrigger = document.querySelector('.controls-trigger');
        const controls = document.querySelector('.controls');
        let controlsVisible = false;

        controlsTrigger.addEventListener('click', function() {
            controlsVisible = !controlsVisible;
            if (controlsVisible) {
                controls.classList.add('visible');
            } else {
                controls.classList.remove('visible');
            }
        });

        // Click outside to close
        document.addEventListener('click', function(e) {
            if (!controlsTrigger.contains(e.target) && !controls.contains(e.target)) {
                controlsVisible = false;
                controls.classList.remove('visible');
            }
        });

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

        // Function to open mermaid in new window
        function openMermaidInNewWindow(graphDefinition) {
            const newWindow = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes');
            const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

            const html = '<!DOCTYPE html>' +
                '<html>' +
                '<head>' +
                    '<title>Mermaid Diagram</title>' +
                    '<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></' + 'script>' +
                    '<style>' +
                        'body { margin: 20px; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: ' + (currentTheme === 'dark' ? '#1a1a1a' : 'white') + '; }' +
                        '.mermaid { max-width: 100%; }' +
                    '</style>' +
                '</head>' +
                '<body>' +
                    '<div class="mermaid">' + graphDefinition + '</div>' +
                    '<script>' +
                        'mermaid.initialize({ startOnLoad: true, theme: "' + (currentTheme === 'dark' ? 'dark' : 'default') + '" });' +
                    '</' + 'script>' +
                '</body>' +
                '</html>';

            newWindow.document.write(html);
            newWindow.document.close();
        }

        // File overlay functionality
        const overlay = document.getElementById('fileOverlay');
        const overlayTitle = document.getElementById('overlayTitle');
        const overlayBody = document.getElementById('overlayBody');
        const overlayClose = document.getElementById('overlayClose');

        // State preservation for overlay
        let savedSearchState = null;

        function saveSearchState() {
            savedSearchState = {
                searchTerm: searchField.value,
                selectedFileIndex: selectedFileIndex,
                scrollPosition: window.pageYOffset
            };
        }

        function restoreSearchState() {
            if (savedSearchState) {
                // Restore search field value
                searchField.value = savedSearchState.searchTerm;

                // Update URL
                updateURL(savedSearchState.searchTerm);

                // Re-run search to restore results
                updateSuggestions(savedSearchState.searchTerm);

                // Restore selected file after a small delay to let DOM update
                setTimeout(() => {
                    updateVisibleFiles();
                    if (savedSearchState.selectedFileIndex >= 0 && savedSearchState.selectedFileIndex < visibleFiles.length) {
                        selectFile(savedSearchState.selectedFileIndex);
                    }

                    // Restore scroll position
                    window.scrollTo(0, savedSearchState.scrollPosition);
                }, 50);

                savedSearchState = null;
            }
        }

        function showOverlay(filePath) {
            // Save current search state before opening overlay
            saveSearchState();

            // Show overlay with animation
            overlay.classList.add('visible');
            // Removed document.body.style.overflow = 'hidden' to allow browser find to work properly
            // The overlay-content has its own scrolling via 'overflow: auto'

            // Set title
            overlayTitle.textContent = filePath;

            // Show loading state
            overlayBody.innerHTML = '<div class="file-overlay-loading">Loading...</div>';

            // Trigger animation after a small delay to ensure CSS transition works
            setTimeout(() => {
                overlay.classList.add('active');
            }, 10);

            // Fetch and display file content
            fetch('/api/file?path=' + encodeURIComponent(filePath))
                .then(response => response.text())
                .then(markdown => {
                    // Convert markdown to HTML (reuse the existing conversion logic)
                    const tempDiv = document.createElement('div');

                    // Create an iframe to render the markdown
                    fetch('/view?file=' + encodeURIComponent(filePath))
                        .then(response => response.text())
                        .then(html => {
                            // Extract just the content part
                            const parser = new DOMParser();
                            const doc = parser.parseFromString(html, 'text/html');
                            const content = doc.querySelector('.container');

                            if (content) {
                                // Remove nav-bar and file-info from overlay content
                                const contentHtml = content.innerHTML;
                                const cleanedHtml = contentHtml
                                    .replace(/<div class="nav-bar"[^>]*>.*?<\\/div>/g, '')
                                    .replace(/<div class="file-info"[^>]*>.*?<\\/div>/g, '');
                                overlayBody.innerHTML = cleanedHtml;

                                // Re-render mermaid diagrams
                                if (typeof mermaid !== 'undefined') {
                                    const mermaidElements = overlayBody.querySelectorAll('.mermaid');
                                    mermaidElements.forEach(async (element, index) => {
                                        const graphDefinition = element.textContent;
                                        const id = 'mermaid-overlay-' + Date.now() + '-' + index;

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
                                            fullscreenBtn.innerHTML = '⛶';
                                            fullscreenBtn.title = 'Open in new window';
                                            fullscreenBtn.onclick = (e) => {
                                                e.stopPropagation();
                                                openMermaidInNewWindow(graphDefinition);
                                            };
                                            container.appendChild(fullscreenBtn);

                                            // Replace element content
                                            element.innerHTML = '';
                                            element.appendChild(container);
                                        } catch (error) {
                                            console.error('Error rendering mermaid diagram:', error);
                                            element.innerHTML = '<div style="color: #e74c3c; padding: 20px; background: #ffecec; border-radius: 5px;">Error rendering diagram: ' + error.message + '</div>';
                                        }
                                    });
                                }

                                // Re-initialize Prism for syntax highlighting
                                if (typeof Prism !== 'undefined') {
                                    Prism.highlightAllUnder(overlayBody);
                                }

                                // Reapply current zoom to overlay after content is loaded
                                setTimeout(() => {
                                    const scale = currentZoom / 100;
                                    setZoom(scale);
                                }, 50);
                            } else {
                                // Fallback: display raw markdown in a pre tag
                                overlayBody.innerHTML = '<pre><code>' + escapeHtml(markdown) + '</code></pre>';

                                // Reapply current zoom to overlay after content is loaded
                                setTimeout(() => {
                                    const scale = currentZoom / 100;
                                    setZoom(scale);
                                }, 50);
                            }
                        })
                        .catch(error => {
                            console.error('Error loading formatted content:', error);
                            overlayBody.innerHTML = '<pre><code>' + escapeHtml(markdown) + '</code></pre>';
                        });
                })
                .catch(error => {
                    overlayBody.innerHTML = '<div class="file-overlay-loading">Error loading file: ' + error.message + '</div>';

                    // Reapply current zoom to overlay after content is loaded
                    setTimeout(() => {
                        const scale = currentZoom / 100;
                        setZoom(scale);
                    }, 50);
                });
        }

        function hideOverlay() {
            // Start hide animation
            overlay.classList.remove('active');

            // Wait for animation to complete before hiding
            setTimeout(() => {
                overlay.classList.remove('visible');
                // Removed resetting of document.body.style.overflow since we no longer set it

                // Restore the saved search state
                restoreSearchState();
            }, 300);
        }

        function escapeHtml(text) {
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#039;'
            };
            return text.replace(/[&<>"']/g, m => map[m]);
        }

        // Close button click handler
        overlayClose.addEventListener('click', hideOverlay);

        // Close on ESC key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && overlay.classList.contains('visible')) {
                hideOverlay();
            }
        });

        // Close on backdrop click
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                hideOverlay();
            }
        });

        // Intercept file link clicks
        document.addEventListener('click', function(e) {
            // Check if clicked element is a file link
            const link = e.target.closest('.file-item a[href^="/view?file="]');
            if (link) {
                e.preventDefault();
                const url = new URL(link.href, window.location);
                const filePath = url.searchParams.get('file');
                if (filePath) {
                    showOverlay(filePath);
                }
            }
        });

        // WebSocket connection for server mode
        if (window.location.hostname === 'localhost' && window.location.port) {
            let ws = null;
            let reconnectAttempts = 0;
            const maxReconnectAttempts = 5;

            function connectWebSocket() {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                ws = new WebSocket(protocol + '//' + window.location.host + '/ws');

                ws.onopen = () => {
                    console.log('🔗 WebSocket connected');
                    // Hide connection lost overlay if shown
                    const connectionLostOverlay = document.getElementById('connectionLost');
                    if (connectionLostOverlay) {
                        connectionLostOverlay.style.display = 'none';
                    }
                };

                ws.onclose = () => {
                    console.log('🔌 WebSocket disconnected - server has stopped');

                    // Immediately show connection lost message
                    const connectionLostOverlay = document.getElementById('connectionLost');
                    if (connectionLostOverlay) {
                        connectionLostOverlay.style.display = 'flex';
                    }

                    // Do not attempt to reconnect
                    console.log('❌ Server connection lost - please restart the server');
                };

                ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                };

                // Keep connection alive with ping
                const pingInterval = setInterval(() => {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send('ping');
                    } else {
                        clearInterval(pingInterval);
                    }
                }, 30000);
            }

            // Start WebSocket connection for temp mode
            connectWebSocket();
        }
    </script>
</body>
</html>`;

    // Helper function to generate file list HTML
    function generateFileListHTML(fileData, sortMethod = 'name-asc') {
        // Sort files based on selected method
        let sortedFiles = [...fileData];

        switch(sortMethod) {
            case 'name-asc':
                sortedFiles.sort((a, b) => a.path.localeCompare(b.path));
                break;
            case 'name-desc':
                sortedFiles.sort((a, b) => b.path.localeCompare(a.path));
                break;
            case 'date-desc':
                sortedFiles.sort((a, b) => {
                    if (!a.modified && !b.modified) return a.path.localeCompare(b.path);
                    if (!a.modified) return 1;
                    if (!b.modified) return -1;
                    return new Date(b.modified) - new Date(a.modified);
                });
                break;
            case 'date-asc':
                sortedFiles.sort((a, b) => {
                    if (!a.modified && !b.modified) return a.path.localeCompare(b.path);
                    if (!a.modified) return 1;
                    if (!b.modified) return -1;
                    return new Date(a.modified) - new Date(b.modified);
                });
                break;
            case 'size-desc':
                sortedFiles.sort((a, b) => {
                    if (!a.sizeBytes && !b.sizeBytes) return a.path.localeCompare(b.path);
                    if (!a.sizeBytes) return 1;
                    if (!b.sizeBytes) return -1;
                    return b.sizeBytes - a.sizeBytes;
                });
                break;
            case 'size-asc':
                sortedFiles.sort((a, b) => {
                    if (!a.sizeBytes && !b.sizeBytes) return a.path.localeCompare(b.path);
                    if (!a.sizeBytes) return 1;
                    if (!b.sizeBytes) return -1;
                    return a.sizeBytes - b.sizeBytes;
                });
                break;
            default:
                sortedFiles.sort((a, b) => a.path.localeCompare(b.path));
        }

        // Determine which arrows to show based on current sort method
        const getArrow = (column, ascending, descending) => {
            if (sortMethod === ascending) return '<span class="sort-arrow active">▲</span>';
            if (sortMethod === descending) return '<span class="sort-arrow active">▼</span>';
            return '<span class="sort-arrow">◆</span>';
        };

        let html = '<div class="file-list-flat">';

        // Add clickable header
        html += '<div class="file-list-header">';
        html += `<div class="col-name" data-sort="name">${getArrow('name', 'name-asc', 'name-desc')} Name</div>`;
        html += `<div class="col-size" data-sort="size">Size ${getArrow('size', 'size-asc', 'size-desc')}</div>`;
        html += `<div class="col-modified" data-sort="date">Modified ${getArrow('date', 'date-desc', 'date-asc')}</div>`;
        html += '</div>';

        sortedFiles.forEach(file => {
            const fullPath = file.path;
            html += `<div class="file-item" data-path="${file.path}">`;
            html += '<div class="file-item-row">';
            html += `<div class="file-name">${fullPath}</div>`;
            html += `<div class="file-size">${file.size || ''}</div>`;
            const title = file.modifiedFull ? ` title="${file.modifiedFull}"` : '';
            html += `<div class="file-modified"${title}>${file.modifiedDisplay || ''}</div>`;
            html += '</div>'; // Close file-item-row
            html += '</div>';
        });
        html += '</div>';

        return html;
    }
}
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

module.exports = {
    generateHtmlFromMarkdown,
    generateIndexHtmlWithSearch,
    generateFolderIndex
};
