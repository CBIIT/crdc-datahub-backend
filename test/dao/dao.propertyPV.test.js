const PropertyPVDAO = require('../../dao/propertyPV');

describe('PropertyPVDAO.findByPropertiesVersionAndModel', () => {
    let dao;
    let collection;

    const expectedPipeline = (propertyNames, version, model) => [
        {
            $match: {
                property: { $in: propertyNames },
                version,
                model,
            },
        },
        {
            $project: {
                id: '$_id',
                property: '$property',
                model: '$model',
                version: '$version',
                permissibleValues: '$PermissibleValues',
                createdAt: '$createdAt',
                updatedAt: '$updatedAt',
            },
        },
    ];

    beforeEach(() => {
        collection = {
            aggregate: jest.fn(),
        };
        dao = new PropertyPVDAO(collection);
        jest.clearAllMocks();
    });

    it('returns [] for empty propertyNames without querying', async () => {
        const result = await dao.findByPropertiesVersionAndModel([], '1', 'ICDC');
        expect(result).toEqual([]);
        expect(collection.aggregate).not.toHaveBeenCalled();
    });

    it('maps BSON PermissibleValues null to permissibleValues null', async () => {
        collection.aggregate.mockResolvedValue([
            {
                _id: 'id1',
                property: 'study_id',
                model: 'ICDC',
                version: '1.0',
                PermissibleValues: null,
                id: 'id1',
                permissibleValues: null,
                createdAt: new Date('2020-01-01'),
                updatedAt: new Date('2020-01-02'),
            },
        ]);

        const result = await dao.findByPropertiesVersionAndModel(['study_id'], '1.0', 'ICDC');

        expect(result).toHaveLength(1);
        expect(result[0].permissibleValues).toBeNull();
        expect(result[0].property).toBe('study_id');
        expect(result[0].id).toBe('id1');
        expect(result[0]._id).toBe('id1');
        expect(collection.aggregate).toHaveBeenCalledWith(
            expectedPipeline(['study_id'], '1.0', 'ICDC')
        );
    });

    it('preserves empty array PermissibleValues', async () => {
        collection.aggregate.mockResolvedValue([
            {
                _id: 'id1',
                property: 'p',
                model: 'ICDC',
                version: '1',
                PermissibleValues: [],
                id: 'id1',
                permissibleValues: [],
            },
        ]);

        const result = await dao.findByPropertiesVersionAndModel(['p'], '1', 'ICDC');

        expect(result[0].permissibleValues).toEqual([]);
    });

    it('maps missing PermissibleValues key to permissibleValues null', async () => {
        collection.aggregate.mockResolvedValue([
            {
                _id: 'id1',
                property: 'p',
                model: 'ICDC',
                version: '1',
                id: 'id1',
                permissibleValues: null,
            },
        ]);

        const result = await dao.findByPropertiesVersionAndModel(['p'], '1', 'ICDC');

        expect(result[0].permissibleValues).toBeNull();
    });

    it('passes through non-null PermissibleValues arrays', async () => {
        collection.aggregate.mockResolvedValue([
            {
                _id: 'id1',
                property: 'p',
                model: 'ICDC',
                version: '1',
                PermissibleValues: ['a', 'b'],
                id: 'id1',
                permissibleValues: ['a', 'b'],
            },
        ]);

        const result = await dao.findByPropertiesVersionAndModel(['p'], '1', 'ICDC');

        expect(result[0].permissibleValues).toEqual(['a', 'b']);
    });
});
