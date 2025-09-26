/**
 * Main library exports
 *
 * This provides a clean interface for accessing all moremaid functionality.
 * Future refactoring can move code here gradually.
 */

module.exports = {
    config: require('./config'),
    utils: require('./utils'),
    styles: require('./styles'),
    archive: require('./archive')
};