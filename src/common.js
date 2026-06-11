require('dotenv').config()
const slugify = require('slugify')
const fs = require('fs')

const config = {
    ...process.env
}

const SPID_PREFIX = 'SPID ';
const SPID_ALIAS_PREFIX = 'spid-';
exports.config = config

exports.usernameMapperTemplate = require('../template/username_mm.json')
exports.lastnameMapperTemplate = require('../template/lastname_mm.json')
exports.firstnameMapperTemplate = require('../template/firstname_mm.json')

exports.spidCodeMapperTemplate = require('../template/spidcode_mm.json');
exports.emailMapperTemplate = require('../template/email_mm.json');
exports.taxIdMapperTemplate = require('../template/taxid_mm.json');
exports.genderMapperTemplate = require('../template/gender_mm.json');
exports.dateOfBirthMapperTemplate = require('../template/dateofbirth_mm.json');
exports.placeOfBirthMapperTemplate = require('../template/placeofbirth_mm.json');
exports.countyOfBirthMapperTemplate = require('../template/countyofbirth_mm.json');
exports.mobilePhoneMapperTemplate = require('../template/mobilephone_mm.json');
exports.addressMapperTemplate = require('../template/address_mm.json');
exports.digitalAddressMapperTemplate = require('../template/digitaladdress_mm.json');
exports.companyNameMapperTemplate = require('../template/companyname_mm.json');
exports.companyAddressMapperTemplate = require('../template/companyaddress_mm.json');
exports.vatNumberapperTemplate = require('../template/vatnumber_mm.json');

function boolEnv(name, defaultValue) {
    const raw = config[name];
    if (raw === undefined || raw === '') return defaultValue;
    return String(raw).toLowerCase() === 'true';
}
exports.boolEnv = boolEnv;

// SPID attribute keys -> SAML attribute name (per SPID spec) + optional Keycloak mapper template.
// The SAML name is the public contract published in SP metadata; it is intentionally decoupled
// from the mapper JSON so that mapper edits cannot silently change the federation contract.
const SPID_ATTRIBUTE_CATALOG = {
    name:             { samlName: 'name',             mapper: exports.firstnameMapperTemplate },
    familyName:       { samlName: 'familyName',       mapper: exports.lastnameMapperTemplate },
    fiscalNumber:     { samlName: 'fiscalNumber',     mapper: exports.taxIdMapperTemplate },
    spidCode:         { samlName: 'spidCode',         mapper: exports.spidCodeMapperTemplate },
    email:            { samlName: 'email',            mapper: exports.emailMapperTemplate },
    gender:           { samlName: 'gender',           mapper: exports.genderMapperTemplate },
    dateOfBirth:      { samlName: 'dateOfBirth',      mapper: exports.dateOfBirthMapperTemplate },
    placeOfBirth:     { samlName: 'placeOfBirth',     mapper: exports.placeOfBirthMapperTemplate },
    countyOfBirth:    { samlName: 'countyOfBirth',    mapper: exports.countyOfBirthMapperTemplate },
    mobilePhone:      { samlName: 'mobilePhone',      mapper: exports.mobilePhoneMapperTemplate },
    address:          { samlName: 'address',          mapper: exports.addressMapperTemplate },
    digitalAddress:   { samlName: 'digitalAddress',   mapper: exports.digitalAddressMapperTemplate },
    companyName:      { samlName: 'companyName',      mapper: exports.companyNameMapperTemplate },
    companyAddress:   { samlName: 'companyAddress',  mapper: exports.companyAddressMapperTemplate },
    ivaCode:          { samlName: 'ivaCode',          mapper: exports.vatNumberapperTemplate },
    idCard:           { samlName: 'idCard' },
    registeredOffice: { samlName: 'registeredOffice' },
    expirationDate:   { samlName: 'expirationDate' }
};

// companyName/companyAddress/ivaCode are intentionally opt-in: they are AggregatorService-only
// SPID attributes and would force a more restrictive accreditation profile if requested by default.
const DEFAULT_REQUESTED_ATTRIBUTES = [
    'spidCode', 'name', 'familyName', 'email', 'fiscalNumber', 'gender',
    'dateOfBirth', 'placeOfBirth', 'countyOfBirth', 'mobilePhone', 'address',
    'digitalAddress',
    'idCard', 'registeredOffice', 'expirationDate'
];
exports.DEFAULT_REQUESTED_ATTRIBUTES = DEFAULT_REQUESTED_ATTRIBUTES;

exports.getRequestedAttributes = function () {
    const raw = (config.requestedAttributes || '').trim();
    const strict = boolEnv('requestedAttributesStrict', true);
    const requested = raw
        ? raw.split(',').map(s => s.trim()).filter(Boolean)
        : DEFAULT_REQUESTED_ATTRIBUTES;

    const resolved = [];
    const unknown = [];
    for (const key of requested) {
        if (SPID_ATTRIBUTE_CATALOG[key]) {
            resolved.push({ key, ...SPID_ATTRIBUTE_CATALOG[key] });
        } else {
            unknown.push(key);
        }
    }
    if (unknown.length) {
        const msg = `Unknown SPID attribute(s) in 'requestedAttributes': ${unknown.join(', ')}. ` +
                    `Allowed: ${Object.keys(SPID_ATTRIBUTE_CATALOG).join(', ')}`;
        if (strict) {
            console.error(msg);
            throw new Error(msg);
        }
        console.warn(msg + ' - skipping');
    }
    return resolved;
};


exports.patchTemplate = function (templateFilePath) {
    let templateString = fs.readFileSync(templateFilePath).toString();
    return templateString.replace(/%REALM%/g, config.realm)
        .replace(/%KEYCLOAKSERVERBASEURL%/g, config.keycloakServerBaseURL)
}

exports.enrichIdpWithConfigData = function (idpOriginal) {
    let idp = {
        ipa_entity_code: idpOriginal.code,
        entity_name: idpOriginal.organization_name,
        displayName: idpOriginal.organization_display_name,
        registry_link: idpOriginal.registry_link.replace('?output=json', ''),
        metadata_url: idpOriginal.registry_link.replace('?output=json', '')
    };
    if (boolEnv('spidMetadataAlternativeURLEnabled', false) && idpOriginal.file_name) {
        idp['metadata_url']=config.spidMetadataAlternativeURLPrefix + idpOriginal.file_name;
    }
    let cleanedupSpidName = idp.entity_name.replace('TI Trust Technologies', 'Tim').replace(/ ID|SPIDItalia | S\.C\.p\.A\.| S\.p\.A\.| srl| spa| italiane|PEC/ig, '');
    idp.alias = slugify(SPID_ALIAS_PREFIX + cleanedupSpidName).toLowerCase();
    if (idp.metadata_url != config.spidValidatorIdPMetadataURL) { // do not tamper official name as per AgID guidelines
        idp.displayName = SPID_PREFIX + cleanedupSpidName;
    } 
    idp.config = {
        otherContactPhone: config.otherContactPhone,
        otherContactEmail: config.otherContactEmail,
        otherContactIpaCode: config.otherContactIpaCode,
        organizationNames: config.organizationNames,
        organizationDisplayNames: config.organizationDisplayNames,
        organizationUrls: config.organizationUrls,
        attributeConsumingServiceName: config.attributeConsumingServiceName,
        metadataDescriptorUrl: idp.metadata_url,
        useMetadataDescriptorUrl: true
    };
    return idp;
}