const {from, of, concat, EMPTY} = require('rxjs')
const {concatMap, map, mergeMap, isEmpty, delay} = require('rxjs/operators')
const {config, patchTemplate, enrichIdpWithConfigData} = require('./src/common')
const {
    httpGrabIdPsMetadata,
    httpCallKeycloakImportConfig,
    httpCallKeycloakCreateIdP,
    httpCallKeycloakDeleteIdP,
    httpCallKeycloakCreateAllMappers,
    httpGrabKeycloaktokenOnce,
    httpCallKeycloakGetRsaKeyPriority,
    httpCallKeycloakGetRsaProviders,
    httpCallKeycloakCreateSpidRsaProvider,
    httpCallKeycloakDeleteProvider
} = require('./src/http')


const idPTemplate = JSON.parse(patchTemplate('./template/idpmodel.json'))

var getOfficialSpididPsMetadata$;

if(typeof(config.spidMetadataOfficialURL) !== 'undefined' && config.spidMetadataOfficialURL !== "") { 
    //recupero url metadati
    getOfficialSpididPsMetadata$ = from(httpGrabIdPsMetadata())
        .pipe(mergeMap(httpResponse => from(httpResponse.data.filter(idp => !config.singleIdp || idp.entity_id == config.singleIdp).map(idp => enrichIdpWithConfigData(idp)))));
    
}
else 
    getOfficialSpididPsMetadata$ = EMPTY;


if (config.createSpidTestIdP === 'true') {
    let spidTestIdPOfficialMetadata = {
        code: config.spidTestIdPAlias,
        organization_name: config.spidTestIdPAlias,
        organization_display_name: config.spidTestIdPAlias,
        registry_link: config.spidTestIdPMetadataURL,
        file_name: 'spid-saml-check.xml'
    }
    getOfficialSpididPsMetadata$ = concat(getOfficialSpididPsMetadata$, of(enrichIdpWithConfigData(spidTestIdPOfficialMetadata)));    
}

if (config.createSpidValidatorIdP === 'true') {
    let spidValidatorIdPOfficialMetadata = {
        code: config.spidValidatorIdPAlias,
        organization_name: config.spidValidatorIdPAlias,
        organization_display_name: config.spidValidatorIdPDisplayName,
        registry_link: config.spidValidatorIdPMetadataURL,
        file_name: 'validator.xml'
    }
    getOfficialSpididPsMetadata$ = concat(getOfficialSpididPsMetadata$, of(enrichIdpWithConfigData(spidValidatorIdPOfficialMetadata)))
}

if (config.createSpidDemoIdP === 'true') {
    let spidDemoIdPOfficialMetadata = {
        code: config.spidDemoIdPAlias,
        organization_name: config.spidDemoIdPAlias,
        organization_display_name: config.spidDemoIdPAlias,
        registry_link: config.spidDemoIdPMetadataURL,
        file_name: 'demo.xml'
    }
    getOfficialSpididPsMetadata$ = concat(getOfficialSpididPsMetadata$, of(enrichIdpWithConfigData(spidDemoIdPOfficialMetadata)))
}

if (config.createSpidTestDemoIdP === 'true') {
    let spidTestLocalDemoMetadata = {
        code: config.spidTestDemoIdPAlias,
        organization_name: config.spidTestDemoIdPAlias,
        organization_display_name: config.spidTestDemoIdPAlias,
        registry_link: config.spidTestDemoIdPMetadataURL,
        file_name: 'spid-saml-check-demo.xml'
    }
    getOfficialSpididPsMetadata$ = concat(getOfficialSpididPsMetadata$, of(enrichIdpWithConfigData(spidTestLocalDemoMetadata)));       
}

if (config.createSpidSpTestIdP === 'true') {
    let spidSpTestMetadata = {
        code: config.spidSpTestIdPAlias,
        organization_name: config.spidSpTestIdPAlias,
        organization_display_name: config.spidSpTestIdPAlias,
        registry_link: config.spidSpTestIdPMetadataURL,
        file_name: 'spid-sp-test.xml'
    }
    getOfficialSpididPsMetadata$ = concat(getOfficialSpididPsMetadata$, of(enrichIdpWithConfigData(spidSpTestMetadata)));       
}

getOfficialSpididPsMetadata$.pipe(isEmpty()).subscribe(noIdpToSetUp => {
    if (noIdpToSetUp) {
        console.error("No idp configured to be set up, exiting");
        process.exit(1);
    }
});

//getOfficialSpididPsMetadata$.subscribe(console.log);

//richiesta cancellazione degli idPs da keycloak
var deleteKeycloakSpidIdPs$ = getOfficialSpididPsMetadata$
    .pipe(mergeMap(spidIdPOfficialMetadata => from(httpCallKeycloakDeleteIdP(spidIdPOfficialMetadata.alias).then(httpResponse => spidIdPOfficialMetadata))))


//richiesta conversione in import-config model [idP,import-config-response]
var getKeycloakImportConfigModels$ = deleteKeycloakSpidIdPs$
    .pipe(concatMap(spidIdPOfficialMetadata => of(spidIdPOfficialMetadata)
        .pipe(
            delay(1500), // workaround for ClosedChannelException (HTTP error 503) from Keycloak 26.1
            mergeMap(spidIdPOfficialMetadata => 
                from(httpCallKeycloakImportConfig(spidIdPOfficialMetadata.metadata_url)
                    .then(httpResponse => {return [spidIdPOfficialMetadata, httpResponse.data];}))
            )
        )
    ));

//trasformazione ed arricchimento => modello per creare l'idP su keycloak
var enrichedModels$ = getKeycloakImportConfigModels$
    .pipe(map(spidIdPOfficialMetadataWithImportConfigModel => {
        let [idPOfficialMetadata, importConfigModel] = spidIdPOfficialMetadataWithImportConfigModel
        let configIdp = {...idPTemplate.config, ...importConfigModel, ...idPOfficialMetadata.config}
        let firstLevel = {
            alias: idPOfficialMetadata.alias,
            displayName: idPOfficialMetadata.displayName
        }
        let merged = {...idPTemplate, ...firstLevel}
        merged.config = configIdp
        merged.config.metadataDescriptorUrl=idPOfficialMetadata.registry_link;
        return merged
    }))

//creazione dello spid idP su keycloak
var createSpidIdPsOnKeycloak$ = enrichedModels$
    .pipe(mergeMap(idPToCreateModel => from(httpCallKeycloakCreateIdP(idPToCreateModel).then(httpResponse => [idPToCreateModel.alias, httpResponse]))))

//creazione dei mappers per lo spid id
var createKeycloackSpidIdPsMappers$ = createSpidIdPsOnKeycloak$.pipe(mergeMap(idPAliasWithHttpCreateResponse => {
    let [alias, createResponse] = idPAliasWithHttpCreateResponse
    return from(httpCallKeycloakCreateAllMappers(alias).then(response => {
        return {alias, create_response: createResponse.status, mapper_response: response}
    }))
}))

// retrieve a single keycloak token before starting
httpGrabKeycloaktokenOnce().then(token => {
    console.log('Successfully retrieved Keycloak token');
    config.token = token;
    createKeycloackSpidIdPsMappers$.subscribe(console.log);
    if (config.createSpidRsaProvider === 'true') {
        from(httpCallKeycloakGetRsaProviders()).pipe(
            mergeMap(existingSpidRsaProviders => {
                const existingSpidRsaProvider = existingSpidRsaProviders.find(provider => provider.providerId === 'spid-rsa-generated');
                const existingConfig = existingSpidRsaProvider?.config;
                var deleteOrSkip$ = of(null);
                if (existingSpidRsaProviders.length > 0) {
                    for (const provider of existingSpidRsaProviders) {
                        deleteOrSkip$ = deleteOrSkip$.pipe(
                            mergeMap(() => from(httpCallKeycloakDeleteProvider(provider.id)).pipe(
                                map(response => {
                                    if (response.status === 204) {
                                        return {status: 'deleted', detail: `Deleted existing SPID RSA Provider with id ${provider.id}`};
                                    } else {
                                        return {status: 'error', detail: `Failed to delete existing SPID RSA Provider with id ${provider.id}, status code: ${response.status}`};
                                    }
                                }),
                            ))
                        );
                    }
                } else {
                    deleteOrSkip$ = of({status: 'skipped', detail: 'No existing SPID RSA Provider found, skipping deletion'});
                }
                return deleteOrSkip$.pipe(
                    mergeMap(() => {
                        const spidRsaProviderConfig = existingConfig || {
                            algorithm: ["RS256"],
                            keySize: [2048],
                        };
                        const ipaCode = config.otherContactIpaCode;
                        if (!ipaCode) {
                            console.error('Missing otherContactIpaCode in configuration, cannot create SPID RSA Provider');
                            return of({status: 'error', detail: 'Missing otherContactIpaCode in configuration'});
                        }
                        const firstOrganizationName = config.organizationNames.split(',', 2)[0].split('|', 2)[1].trim();
                        const firstOrganizationDisplayName = config.organizationDisplayNames.split(',', 2)[0].split('|', 2)[1].trim();
                        const firstOrganizationUrl = config.organizationUrls.split(',', 2)[0].split('|', 2)[1].trim();
                        if (!firstOrganizationName || !firstOrganizationDisplayName || !firstOrganizationUrl) {
                            console.error('Missing organizationNames or organizationDisplayNames or organizationUrls in configuration, cannot create SPID RSA Provider');
                            return of({status: 'error', detail: 'Missing organizationNames or organizationDisplayNames or organizationUrls in configuration'});
                        }
                        const country = config.organizationCountry;
                        const locality = config.organizationLocation;
                        if (!country || !locality) {
                            console.error('Missing organizationCountry or organizationLocation in configuration, cannot create SPID RSA Provider');
                            return of({status: 'error', detail: 'Missing organizationCountry or organizationLocation in configuration'});
                        }
                        return from(httpCallKeycloakGetRsaKeyPriority()).pipe(
                            mergeMap(priority => from(httpCallKeycloakCreateSpidRsaProvider({
                                name: "spid-rsa-generated",
                                config: {
                                    ...spidRsaProviderConfig,
                                    priority: [(priority + 1).toString()],
                                    enabled: ["true"],
                                    active: ["true"],
                                    spidCommonName: [firstOrganizationName],
                                    spidOrganizationName: [firstOrganizationDisplayName],
                                    spidEntityId: [firstOrganizationUrl],
                                    spidIpaCode: [ipaCode],
                                    spidCountry: [country],
                                    spidLocality: [locality]
                                },
                                providerId: "spid-rsa-generated",
                                providerType: "org.keycloak.keys.KeyProvider"
                            })).pipe(
                                map(response => {
                                    return {status: response.status, detail: 'SPID RSA Provider created with priority ' + priority};
                                })
                            ))
                        );
                    })
                );
            })
        ).subscribe(result => {
            if (result.status === 'error') {
                console.error('Error creating SPID RSA Provider:', result.detail);
            } else if (result.status === 'skipped') {
                console.log('SPID RSA Provider creation skipped:', result.detail);
            } else {
                console.log('SPID RSA Provider creation result:', result.detail);
            }
        });
    }
});