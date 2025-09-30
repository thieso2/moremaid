# Moremaid Refactoring Plan

## Current Architecture Problems

### 1. Monolithic Structure
- **Single 3,403-line file** (`lib/html-generator.js`) contains everything
- Mixes server-side generation with client-side code
- CSS embedded as string literals (lines 104-1464)
- JavaScript embedded as strings (lines 2089+)
- No clear separation of concerns

### 2. Brittle CSS
- Global selectors without namespacing
- Inline styles mixed with external styles
- Hard-coded values instead of variables
- :hover states difficult to manage
- No CSS isolation between components

### 3. JavaScript Issues
- Code generation through string concatenation
- Global scope pollution
- No module system
- Mixed ES5/ES6 syntax
- Error-prone template literal escaping

### 4. Development Experience
- No build pipeline
- No hot reload
- No type safety
- Manual asset embedding
- No development/production modes

## Proposed Architecture

### 1. Directory Structure
```
moremaid/
├── src/
│   ├── client/              # Client-side code
│   │   ├── components/       # UI components
│   │   │   ├── FileTree.js
│   │   │   ├── MarkdownViewer.js
│   │   │   ├── MermaidDiagram.js
│   │   │   └── CodeBlock.js
│   │   ├── styles/          # CSS modules
│   │   │   ├── components/
│   │   │   ├── themes/
│   │   │   └── base.css
│   │   ├── utils/           # Client utilities
│   │   └── index.js         # Entry point
│   ├── server/              # Server-side code
│   │   ├── generators/      # HTML generators
│   │   │   ├── markdown.js
│   │   │   └── folder.js
│   │   ├── templates/       # HTML templates
│   │   └── index.js
│   └── shared/              # Shared code
│       ├── constants.js
│       └── themes.js
├── dist/                    # Built files
├── webpack.config.js        # Build config
└── package.json
```

### 2. Build System

#### Webpack/Vite Configuration
```javascript
// webpack.config.js
module.exports = {
  entry: './src/client/index.js',
  output: {
    path: './dist',
    filename: '[name].[contenthash].js'
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      },
      {
        test: /\.js$/,
        use: 'babel-loader'
      }
    ]
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/server/templates/index.html'
    })
  ]
};
```

Benefits:
- Asset bundling and optimization
- Tree shaking
- Code splitting
- CSS modules support
- Development server with hot reload

### 3. Component-Based Architecture

#### Example: MermaidDiagram Component
```javascript
// src/client/components/MermaidDiagram.js
import styles from './MermaidDiagram.module.css';

export class MermaidDiagram {
  constructor(element, code) {
    this.element = element;
    this.code = code;
    this.init();
  }

  init() {
    const container = document.createElement('div');
    container.className = styles.container;

    const diagram = document.createElement('div');
    diagram.className = styles.diagram;

    const button = this.createFullscreenButton();

    container.appendChild(diagram);
    container.appendChild(button);

    this.element.replaceWith(container);
    this.render(diagram);
  }

  createFullscreenButton() {
    const button = document.createElement('button');
    button.className = styles.fullscreenButton;
    button.onclick = () => this.openFullscreen();
    return button;
  }

  render(target) {
    mermaid.render('diagram', this.code, (svg) => {
      target.innerHTML = svg;
    });
  }
}
```

### 4. Template System

Replace string concatenation with proper templates:

```javascript
// src/server/templates/markdown.ejs
<!DOCTYPE html>
<html>
<head>
  <title><%= title %></title>
  <% if (isDevelopment) { %>
    <link rel="stylesheet" href="/dist/styles.css">
  <% } else { %>
    <style><%= compiledStyles %></style>
  <% } %>
</head>
<body>
  <div id="content">
    <%- content %>
  </div>
  <script src="/dist/bundle.js"></script>
</body>
</html>
```

### 5. TypeScript Migration

#### Phase 1: Add TypeScript Support
```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM"],
    "jsx": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

#### Phase 2: Gradual Migration
1. Rename `.js` files to `.ts` one by one
2. Add type definitions
3. Fix type errors
4. Add interfaces for data structures

#### Example Types
```typescript
interface Theme {
  name: string;
  colors: {
    background: string;
    foreground: string;
    accent: string;
  };
}

interface MarkdownOptions {
  theme: Theme;
  enableMermaid: boolean;
  syntaxHighlight: boolean;
}
```

### 6. CSS Architecture

#### CSS Custom Properties
```css
/* src/client/styles/base.css */
:root {
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Typography */
  --font-mono: 'Monaco', 'Consolas', monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, sans-serif;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}
```

#### BEM Naming Convention
```css
/* Block */
.file-tree {}

/* Element */
.file-tree__item {}
.file-tree__icon {}
.file-tree__label {}

/* Modifier */
.file-tree__item--selected {}
.file-tree__item--folder {}
```

#### CSS Modules
```css
/* src/client/components/FileTree.module.css */
.container {
  padding: var(--spacing-md);
}

.item {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm);
  transition: background var(--transition-fast);
}

.item:hover {
  background: var(--hover-background);
}
```

### 7. JavaScript Improvements

#### ES6 Modules
```javascript
// src/client/utils/markdown.js
export function parseMarkdown(content) {
  // Implementation
}

export function renderMermaid(code) {
  // Implementation
}

// src/client/index.js
import { parseMarkdown, renderMermaid } from './utils/markdown.js';
```

#### Event System
```javascript
// src/client/utils/EventBus.js
export class EventBus {
  constructor() {
    this.events = {};
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(cb => cb(data));
    }
  }
}
```

## Implementation Plan

### Phase 1: Setup (Week 1)
1. Set up Webpack/Vite build system
2. Create directory structure
3. Set up development environment
4. Configure ESLint and Prettier

### Phase 2: Extract Components (Week 2)
1. Extract CSS into separate files
2. Create CSS modules
3. Extract JavaScript into modules
4. Create component classes

### Phase 3: Template System (Week 3)
1. Set up template engine (EJS/Handlebars)
2. Convert HTML generation to templates
3. Create reusable partials
4. Add template caching

### Phase 4: TypeScript (Week 4)
1. Add TypeScript configuration
2. Convert utilities to TypeScript
3. Add type definitions
4. Convert components to TypeScript

### Phase 5: Testing & Optimization (Week 5)
1. Add unit tests for components
2. Add integration tests
3. Optimize build for production
4. Add performance monitoring

## Benefits

### Immediate Benefits
- Easier debugging with source maps
- Faster development with hot reload
- Better error messages
- Cleaner codebase

### Long-term Benefits
- Easier to add new features
- Reduced bugs from type safety
- Better performance from optimization
- Easier onboarding for new developers
- Testable components

## Migration Strategy

### Incremental Approach
1. **Keep current system working** while building new one
2. **Feature flag** to switch between old/new
3. **Gradual migration** of features
4. **Parallel testing** before switchover

### Backward Compatibility
- Maintain same CLI interface
- Keep same output format
- Preserve all current features
- Add deprecation warnings

## Tools & Dependencies

### Development Dependencies
```json
{
  "devDependencies": {
    "webpack": "^5.x",
    "webpack-cli": "^4.x",
    "webpack-dev-server": "^4.x",
    "babel-loader": "^8.x",
    "css-loader": "^6.x",
    "style-loader": "^3.x",
    "postcss": "^8.x",
    "postcss-loader": "^6.x",
    "typescript": "^4.x",
    "ts-loader": "^9.x",
    "@types/node": "^16.x",
    "eslint": "^8.x",
    "prettier": "^2.x"
  }
}
```

### Runtime Dependencies
- Keep minimal for production
- Bundle everything for CLI tool
- Lazy load for web version

## Success Metrics

### Code Quality
- Reduce file size by 50%
- Improve lighthouse score to 95+
- Achieve 80% test coverage
- Zero TypeScript errors

### Developer Experience
- Build time < 2 seconds
- Hot reload < 500ms
- Clear error messages
- Comprehensive documentation

### User Experience
- Same or better performance
- No breaking changes
- Smooth migration path
- Better error handling

## Risks & Mitigation

### Risk: Breaking Changes
**Mitigation**: Extensive testing, feature flags, gradual rollout

### Risk: Performance Regression
**Mitigation**: Performance benchmarks, optimization phase

### Risk: Increased Complexity
**Mitigation**: Good documentation, clear architecture

### Risk: Dependencies
**Mitigation**: Lock versions, security audits, minimal dependencies

## Next Steps

1. **Review and approve** this plan
2. **Create feature branch** for refactoring
3. **Set up build system** first
4. **Start with one component** as proof of concept
5. **Iterate based on feedback**

## Notes

- Consider using Vite over Webpack for faster builds
- Evaluate if React/Vue would be beneficial
- Consider WebAssembly for Mermaid rendering
- Look into Service Workers for offline support
- Consider monorepo structure with Lerna/Nx