const common = require('../src/common');
const { installAttributeTestHooks } = require('./helpers/attributestesthelpers');

const spies = installAttributeTestHooks();

describe('getRequestedAttributes', () => {
    test('returns the default attribute set when env is unset', () => {
        const resolved = common.getRequestedAttributes();
        expect(resolved.map(a => a.key)).toEqual(common.DEFAULT_REQUESTED_ATTRIBUTES);
    });

    test('default list does NOT include opt-in company/IVA attributes', () => {
        const keys = common.getRequestedAttributes().map(a => a.key);
        expect(keys).not.toContain('companyName');
        expect(keys).not.toContain('companyAddress');
        expect(keys).not.toContain('ivaCode');
    });

    test('honors env override with custom comma-separated list', () => {
        common.config.requestedAttributes = 'spidCode,name,familyName,fiscalNumber,email';
        const resolved = common.getRequestedAttributes();
        expect(resolved.map(a => a.key)).toEqual(
            ['spidCode', 'name', 'familyName', 'fiscalNumber', 'email']
        );
    });

    test('trims whitespace and ignores empty entries', () => {
        common.config.requestedAttributes = '  spidCode , , name ,';
        const resolved = common.getRequestedAttributes();
        expect(resolved.map(a => a.key)).toEqual(['spidCode', 'name']);
    });

    test('strict mode (default) throws on unknown attribute', () => {
        common.config.requestedAttributes = 'name,bogus';
        expect(() => common.getRequestedAttributes()).toThrow(/Unknown SPID attribute/);
    });

    test('non-strict mode warns and skips unknown attribute', () => {
        common.config.requestedAttributes = 'name,bogus,email';
        common.config.requestedAttributesStrict = 'false';
        const resolved = common.getRequestedAttributes();
        expect(resolved.map(a => a.key)).toEqual(['name', 'email']);
        expect(spies.warn).toHaveBeenCalledWith(expect.stringContaining('bogus'));
    });

    test('every resolved entry carries an explicit samlName matching the SPID spec', () => {
        common.config.requestedAttributes =
            'spidCode,name,familyName,fiscalNumber,email,ivaCode,idCard,registeredOffice,expirationDate';
        const resolved = common.getRequestedAttributes();
        const byKey = Object.fromEntries(resolved.map(a => [a.key, a.samlName]));
        expect(byKey).toEqual({
            spidCode: 'spidCode',
            name: 'name',
            familyName: 'familyName',
            fiscalNumber: 'fiscalNumber',
            email: 'email',
            ivaCode: 'ivaCode',
            idCard: 'idCard',
            registeredOffice: 'registeredOffice',
            expirationDate: 'expirationDate'
        });
    });

    test('metadata-only attributes resolve without a mapper', () => {
        common.config.requestedAttributes = 'idCard';
        const [idCard] = common.getRequestedAttributes();
        expect(idCard.samlName).toBe('idCard');
        expect(idCard.mapper).toBeUndefined();
    });

    test('opt-in company/IVA mappers are exposed when listed', () => {
        common.config.requestedAttributes = 'companyName,companyAddress,ivaCode';
        const resolved = common.getRequestedAttributes();
        expect(resolved).toHaveLength(3);
        resolved.forEach(a => expect(a.mapper).toBeDefined());
    });
});

describe('boolEnv', () => {
    test('returns the default when env var is unset', () => {
        expect(common.boolEnv('someMissingFlag', true)).toBe(true);
        expect(common.boolEnv('someMissingFlag', false)).toBe(false);
    });

    test('treats empty string as unset', () => {
        common.config.someFlag = '';
        expect(common.boolEnv('someFlag', true)).toBe(true);
        delete common.config.someFlag;
    });

    test('parses "true"/"false" case-insensitively', () => {
        common.config.someFlag = 'TRUE';
        expect(common.boolEnv('someFlag', false)).toBe(true);
        common.config.someFlag = 'False';
        expect(common.boolEnv('someFlag', true)).toBe(false);
        delete common.config.someFlag;
    });
});
