/**
 * CSS styles for themes and typography
 */

const themes = {
    light: `
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
    `,
    dark: `
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
    `,
    github: `
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
    `,
    'github-dark': `
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
    `,
    dracula: `
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
    `,
    nord: `
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
    `,
    'solarized-light': `
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
    `,
    'solarized-dark': `
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
    `,
    monokai: `
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
    `,
    'one-dark': `
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
    `
};

const typography = {
    default: `
        --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        --font-code: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
        --font-size-base: 16px;
        --line-height: 1.6;
        --paragraph-spacing: 1em;
        --max-width: 800px;
        --text-align: left;
    `,
    github: `
        --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
        --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
        --font-code: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
        --font-size-base: 16px;
        --line-height: 1.5;
        --paragraph-spacing: 1em;
        --max-width: 1012px;
        --text-align: left;
    `,
    latex: `
        --font-body: 'Latin Modern Roman', 'Computer Modern', 'Georgia', serif;
        --font-heading: 'Latin Modern Roman', 'Computer Modern', 'Georgia', serif;
        --font-code: 'Latin Modern Mono', 'Computer Modern Typewriter', 'Courier New', monospace;
        --font-size-base: 12pt;
        --line-height: 1.4;
        --paragraph-spacing: 0.5em;
        --max-width: 6.5in;
        --text-align: justify;
    `,
    tufte: `
        --font-body: et-book, Palatino, 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', Georgia, serif;
        --font-heading: et-book, Palatino, 'Palatino Linotype', 'Palatino LT STD', 'Book Antiqua', Georgia, serif;
        --font-code: Consolas, 'Liberation Mono', Menlo, Courier, monospace;
        --font-size-base: 15px;
        --line-height: 1.5;
        --paragraph-spacing: 1.4em;
        --max-width: 960px;
        --text-align: left;
    `,
    medium: `
        --font-body: charter, Georgia, Cambria, 'Times New Roman', Times, serif;
        --font-heading: 'Lucida Grande', 'Lucida Sans Unicode', 'Lucida Sans', Geneva, Arial, sans-serif;
        --font-code: 'Menlo', 'Monaco', 'Courier New', Courier, monospace;
        --font-size-base: 21px;
        --line-height: 1.58;
        --paragraph-spacing: 1.58em;
        --max-width: 680px;
        --text-align: left;
    `,
    compact: `
        --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        --font-code: 'Monaco', 'Menlo', monospace;
        --font-size-base: 14px;
        --line-height: 1.4;
        --paragraph-spacing: 0.5em;
        --max-width: 100%;
        --text-align: left;
    `,
    wide: `
        --font-body: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        --font-heading: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        --font-code: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        --font-size-base: 16px;
        --line-height: 1.7;
        --paragraph-spacing: 1.2em;
        --max-width: 100%;
        --text-align: left;
    `,
    newspaper: `
        --font-body: 'Times New Roman', Times, serif;
        --font-heading: 'Georgia', 'Times New Roman', serif;
        --font-code: 'Courier New', Courier, monospace;
        --font-size-base: 16px;
        --line-height: 1.5;
        --paragraph-spacing: 0.8em;
        --max-width: 100%;
        --text-align: justify;
    `,
    terminal: `
        --font-body: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
        --font-heading: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
        --font-code: 'Fira Code', 'Source Code Pro', 'Monaco', 'Menlo', monospace;
        --font-size-base: 14px;
        --line-height: 1.5;
        --paragraph-spacing: 1em;
        --max-width: 900px;
        --text-align: left;
    `,
    book: `
        --font-body: 'Crimson Text', 'Baskerville', 'Georgia', serif;
        --font-heading: 'Crimson Text', 'Baskerville', 'Georgia', serif;
        --font-code: 'Courier New', Courier, monospace;
        --font-size-base: 18px;
        --line-height: 1.7;
        --paragraph-spacing: 1.5em;
        --max-width: 650px;
        --text-align: justify;
    `
};

function getBaseStyles() {
    return `
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
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
            color: var(--heading-color);
            margin-top: 1.5em;
            margin-bottom: 0.5em;
        }

        h1 { font-size: 2em; color: var(--heading-color); }
        h2 { font-size: 1.5em; color: var(--heading2-color); }
        h3 { font-size: 1.25em; }
        h4 { font-size: 1.1em; }
        h5 { font-size: 1em; }
        h6 { font-size: 0.9em; }

        p {
            margin-bottom: var(--paragraph-spacing);
            text-align: var(--text-align);
        }

        code {
            font-family: var(--font-code) !important;
            background: var(--code-bg);
            color: var(--code-color);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 0.9em;
        }

        pre {
            font-family: var(--font-code) !important;
            background: var(--code-bg);
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
            margin-bottom: 1em;
        }

        pre code {
            background: transparent;
            color: inherit;
            padding: 0;
        }

        blockquote {
            border-left: 4px solid var(--border-color);
            padding-left: 20px;
            margin: 20px 0;
            color: var(--blockquote-color);
            font-style: italic;
        }

        a {
            color: var(--link-color);
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        ul, ol {
            padding-left: 30px;
            margin-bottom: 1em;
        }

        li {
            margin-bottom: 0.5em;
        }

        table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 1em;
        }

        th, td {
            border: 1px solid var(--table-border);
            padding: 10px;
            text-align: left;
        }

        th {
            background: var(--table-header-bg);
            font-weight: bold;
        }

        hr {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 2em 0;
        }

        img {
            max-width: 100%;
            height: auto;
        }

        /* Book style - indent paragraphs */
        [data-typography="book"] p + p {
            text-indent: 2em;
        }

        /* Mermaid diagram styling */
        .mermaid {
            text-align: center;
            margin: 20px 0;
            position: relative;
        }

        .mermaid-container {
            position: relative;
            display: inline-block;
            width: 100%;
        }

        .mermaid-error {
            color: #ff6b6b;
            background: #ffe0e0;
            padding: 10px;
            border-radius: 5px;
            margin: 20px 0;
        }

        .mermaid-fullscreen-btn {
            position: absolute;
            top: 10px;
            right: 10px;
            background: var(--mermaid-btn-bg);
            color: white;
            border: none;
            border-radius: 5px;
            padding: 8px 12px;
            cursor: pointer;
            font-size: 14px;
            z-index: 10;
            opacity: 0;
            transition: opacity 0.3s, background 0.3s;
        }

        .mermaid-container:hover .mermaid-fullscreen-btn {
            opacity: 1;
        }

        .mermaid-fullscreen-btn:hover {
            background: var(--mermaid-btn-hover);
        }

        /* Controls styling */
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

        .controls select,
        .controls button {
            background: var(--heading-color);
            color: var(--bg-color);
            border: none;
            border-radius: 8px;
            padding: 10px 15px;
            font-size: 14px;
            cursor: pointer;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            transition: transform 0.2s, opacity 0.3s;
        }

        .controls select {
            appearance: none;
            padding-right: 35px;
            background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
            background-repeat: no-repeat;
            background-position: right 10px center;
            background-size: 20px;
        }

        .controls button:hover,
        .controls select:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }

        .zoom-controls {
            display: flex;
            gap: 5px;
            background: var(--heading-color);
            border-radius: 8px;
            padding: 5px;
        }

        .zoom-controls button {
            padding: 5px 10px;
            background: transparent;
            box-shadow: none;
        }

        .zoom-controls button:hover {
            background: rgba(255, 255, 255, 0.1);
        }

        .zoom-display {
            color: var(--bg-color);
            font-size: 14px;
            min-width: 45px;
            text-align: center;
            padding: 5px;
        }

        /* File info bar */
        .file-info {
            background: var(--file-info-bg);
            color: var(--file-info-color);
            padding: 10px 20px;
            font-size: 14px;
            border-bottom: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 100;
        }

        .file-info .file-path {
            font-family: var(--font-code);
        }

        .file-info .back-link {
            color: var(--link-color);
            text-decoration: none;
        }

        .file-info .back-link:hover {
            text-decoration: underline;
        }
    `;
}

module.exports = {
    themes,
    typography,
    getBaseStyles
};