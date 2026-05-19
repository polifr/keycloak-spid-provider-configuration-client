const common = require('../../src/common');

// Silences resolver logs and resets the env knobs this feature touches.
// Returns a stable `spies` object; fields are reassigned in beforeEach so tests
// can assert against the current call's spy (e.g. spies.warn.toHaveBeenCalled()).
exports.installAttributeTestHooks = function () {
    const spies = { log: null, warn: null, error: null };
    beforeEach(() => {
        spies.log = jest.spyOn(console, 'log').mockImplementation(() => {});
        spies.warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        spies.error = jest.spyOn(console, 'error').mockImplementation(() => {});
        delete common.config.requestedAttributes;
        delete common.config.requestedAttributesStrict;
    });
    afterEach(() => {
        spies.log.mockRestore();
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
    return spies;
};
