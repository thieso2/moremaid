/**
 * Configuration and constants
 */

const packageJson = require('../package.json');

const config = {
    version: packageJson.version,
    inactivityTimeout: 10000, // 10 seconds for temp directory cleanup
    themes: {
        available: ['light', 'dark', 'github', 'github-dark', 'dracula', 'nord',
                   'solarized-light', 'solarized-dark', 'monokai', 'one-dark'],
        default: 'light'
    },
    typography: {
        available: ['default', 'github', 'latex', 'tufte', 'medium',
                   'compact', 'wide', 'newspaper', 'terminal', 'book'],
        default: 'default'
    },
    server: {
        defaultPort: 8080,
        maxPortAttempts: 10
    },
    archive: {
        extension: '.moremaid',
        supportedExtensions: /\.(zip|moremaid)$/i
    },
    markdown: {
        extensions: /\.(md|markdown)$/i
    }
};

module.exports = config;