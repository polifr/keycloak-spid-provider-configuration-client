const fs = require('fs');
const ejs = require('ejs');
const common = require('../src/common');
const { installAttributeTestHooks } = require('./helpers/attributestesthelpers');

installAttributeTestHooks();

let template;
let dataToMerge;
const renderContext = {
    entityid: 'http://kc-local-test:8080/auth/realms/spid',
    certificate: 'FAKE_CERT'
};

beforeAll(() => {
    template = fs.readFileSync('./template/sp_metadata.ejs').toString();
    dataToMerge = JSON.parse(fs.readFileSync('./test/mockspmetadatatomerge.json').toString());
});

function render(requestedAttributes) {
    return ejs.render(template, { idps: dataToMerge, common: renderContext, requestedAttributes });
}

function countOccurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

describe('sp_metadata.ejs attribute rendering', () => {
    test('renders one RequestedAttribute per resolved attribute, per IdP', () => {
        const attrs = [
            { key: 'spidCode', samlName: 'spidCode' },
            { key: 'name', samlName: 'name' },
            { key: 'email', samlName: 'email' }
        ];
        const xml = render(attrs);
        expect(countOccurrences(xml, '<md:RequestedAttribute Name="')).toBe(attrs.length * dataToMerge.length);
        expect(xml).toContain('Name="spidCode"');
        expect(xml).toContain('Name="name"');
        expect(xml).toContain('Name="email"');
    });

    test('omits attributes that are not in the requested list', () => {
        const xml = render([{ key: 'name', samlName: 'name' }]);
        expect(xml).toContain('Name="name"');
        expect(xml).not.toContain('Name="familyName"');
        expect(xml).not.toContain('Name="fiscalNumber"');
        expect(xml).not.toContain('Name="ivaCode"');
    });

    test('default resolved list renders idCard/registeredOffice/expirationDate (metadata-only)', () => {
        const xml = render(common.getRequestedAttributes());
        expect(xml).toContain('Name="idCard"');
        expect(xml).toContain('Name="registeredOffice"');
        expect(xml).toContain('Name="expirationDate"');
    });

    test('default resolved list does NOT render opt-in companyName/companyAddress/ivaCode', () => {
        const xml = render(common.getRequestedAttributes());
        expect(xml).not.toContain('Name="companyName"');
        expect(xml).not.toContain('Name="companyAddress"');
        expect(xml).not.toContain('Name="ivaCode"');
    });

    test('empty requestedAttributes renders zero RequestedAttribute elements', () => {
        const xml = render([]);
        expect(countOccurrences(xml, '<md:RequestedAttribute Name="')).toBe(0);
        expect(countOccurrences(xml, '<md:AttributeConsumingService')).toBe(dataToMerge.length);
    });
});
