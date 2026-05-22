const { PropertyPVService } = require('../../services/property-pv-service');
const ERROR = require('../../constants/error-constants');
const { replaceErrorString } = require('../../utility/string-util');

describe('PropertyPVService.retrievePVsByPropertyName', () => {
    let service;
    let configurationService;
    let propertyPVDAO;
    let context;

    beforeEach(() => {
        jest.clearAllMocks();
        configurationService = { findByType: jest.fn() };
        propertyPVDAO = { findByPropertiesVersionAndModel: jest.fn() };
        service = new PropertyPVService(configurationService, propertyPVDAO);
        context = { userInfo: { _id: 'u1' } };
    });

    it('throws an error when the provided model is not in the DATA_COMMONS_LIST', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC', 'CTDC'] });
        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: ['p'], model: 'CDS', version: '1' },
                context
            )
        ).rejects.toThrow(
            replaceErrorString(
                replaceErrorString(ERROR.INVALID_DATA_MODEL_NOT_ALLOWED, `'CDS'`),
                'CTDC, ICDC',
                /\$accepted\$/g
            )
        );
        expect(propertyPVDAO.findByPropertiesVersionAndModel).not.toHaveBeenCalled();
    });

    it('does not require an authenticated session', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([]);

        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: ['p'], model: 'ICDC', version: '1' },
                {}
            )
        ).resolves.toEqual([]);

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalled();
    });

    it('queries with exact model string passed in', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['CDS', 'ICDC'] });
        const doc = {
            id: 'doc1',
            property: 'study_id',
            model: 'CDS',
            version: '1.0',
            permissibleValues: ['a']
        };
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([doc]);

        const result = await service.retrievePVsByPropertyName(
            { propertyNames: [' study_id '], model: 'CDS', version: ' 1.0 ' },
            context
        );

        expect(result).toEqual([doc]);
        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(
            ['study_id'],
            '1.0',
            'CDS'
        );
    });

    it('accepts GC when GC is listed and searches for model GC', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['GC', 'ICDC'] });
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([]);

        await service.retrievePVsByPropertyName(
            { propertyNames: ['p'], model: 'GC', version: '1' },
            context
        );

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(['p'], '1', 'GC');
    });

    it('returns [] when DAO finds no documents', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([]);

        const result = await service.retrievePVsByPropertyName(
            { propertyNames: ['p'], model: 'ICDC', version: '1' },
            context
        );

        expect(result).toEqual([]);
    });

    it('returns [] for empty propertyNames list without calling DAO', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });

        const result = await service.retrievePVsByPropertyName(
            { propertyNames: [], model: 'ICDC', version: '1' },
            context
        );

        expect(result).toEqual([]);
        expect(propertyPVDAO.findByPropertiesVersionAndModel).not.toHaveBeenCalled();
    });

    it('returns only hits in first-occurrence order for unique names', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        const b = {
            id: 'b',
            property: 'b',
            model: 'ICDC',
            version: '1',
            permissibleValues: ['x']
        };
        const c = {
            id: 'c',
            property: 'c',
            model: 'ICDC',
            version: '1',
            permissibleValues: ['y']
        };
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([c, b]);

        const result = await service.retrievePVsByPropertyName(
            { propertyNames: ['a', 'b', 'c', 'd'], model: 'ICDC', version: '1' },
            context
        );

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(
            ['a', 'b', 'c', 'd'],
            '1',
            'ICDC'
        );
        expect(result).toEqual([b, c]);
    });

    it('dedupes duplicate property names before querying', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        const doc = {
            id: '1',
            property: 'x',
            model: 'ICDC',
            version: '1',
            permissibleValues: []
        };
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([doc]);

        const result = await service.retrievePVsByPropertyName(
            { propertyNames: ['x', ' x ', 'x'], model: 'ICDC', version: '1' },
            context
        );

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(['x'], '1', 'ICDC');
        expect(result).toEqual([doc]);
    });

    it('throws for whitespace-only model', async () => {
        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: ['p'], model: '   ', version: '1' },
                context
            )
        ).rejects.toThrow(ERROR.RETRIEVE_PVS_INVALID_MODEL);
        expect(configurationService.findByType).not.toHaveBeenCalled();
    });

    it('throws for invalid propertyNames before config lookup', async () => {
        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: [''], model: 'ICDC', version: '1' },
                context
            )
        ).rejects.toThrow(ERROR.RETRIEVE_PVS_INVALID_PROPERTY_NAME);
        expect(configurationService.findByType).not.toHaveBeenCalled();
    });

    it('throws when propertyNames is not an array', async () => {
        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: 'study_id', model: 'ICDC', version: '1' },
                context
            )
        ).rejects.toThrow(ERROR.RETRIEVE_PVS_INVALID_PROPERTY_NAME);
        expect(configurationService.findByType).not.toHaveBeenCalled();
    });

    it('throws when propertyNames exceeds the maximum list length', async () => {
        const tooMany = Array.from({ length: 501 }, (_, i) => `p${i}`);
        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: tooMany, model: 'ICDC', version: '1' },
                context
            )
        ).rejects.toThrow(ERROR.RETRIEVE_PVS_TOO_MANY_PROPERTY_NAMES);
        expect(configurationService.findByType).not.toHaveBeenCalled();
    });

    it('accepts propertyNames at the maximum list length', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([]);
        const names = Array.from({ length: 500 }, (_, i) => `p${i}`);

        await service.retrievePVsByPropertyName(
            { propertyNames: names, model: 'ICDC', version: '1' },
            context
        );

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(names, '1', 'ICDC');
    });

    it('throws for whitespace-only version before config lookup', async () => {
        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: ['p'], model: 'ICDC', version: '   ' },
                context
            )
        ).rejects.toThrow(ERROR.RETRIEVE_PVS_INVALID_VERSION);
        expect(configurationService.findByType).not.toHaveBeenCalled();
    });

    it('uses trimmed model in the not-allowed error message', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        await expect(
            service.retrievePVsByPropertyName(
                { propertyNames: ['p'], model: '  CDS  ', version: '1' },
                context
            )
        ).rejects.toThrow(
            replaceErrorString(
                replaceErrorString(ERROR.INVALID_DATA_MODEL_NOT_ALLOWED, `'CDS'`),
                'ICDC',
                /\$accepted\$/g
            )
        );
    });

    it('extracts x.y.z from version for the DAO when embedded in a prefix', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([]);

        await service.retrievePVsByPropertyName(
            { propertyNames: ['p'], model: 'ICDC', version: 'v11.0.4' },
            context
        );

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(
            ['p'],
            '11.0.4',
            'ICDC'
        );
    });

    it('extracts first x.y.z from version when surrounded by other text', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([]);

        await service.retrievePVsByPropertyName(
            { propertyNames: ['p'], model: 'ICDC', version: 'release-2.3.4-build' },
            context
        );

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(
            ['p'],
            '2.3.4',
            'ICDC'
        );
    });

    it('falls back to trimmed version when no semver triple is present', async () => {
        configurationService.findByType.mockResolvedValue({ key: ['ICDC'] });
        propertyPVDAO.findByPropertiesVersionAndModel.mockResolvedValue([]);

        await service.retrievePVsByPropertyName(
            { propertyNames: ['p'], model: 'ICDC', version: ' 1.0 ' },
            context
        );

        expect(propertyPVDAO.findByPropertiesVersionAndModel).toHaveBeenCalledWith(
            ['p'],
            '1.0',
            'ICDC'
        );
    });
});
