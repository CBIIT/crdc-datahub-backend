const {Release} = require('../../services/release-service');

const PROP_GROUPS = {
    MODEL_DEFINED: "model_defined",
    NOT_DEFINED: "not_defined",
    INTERNAL: "internal"
};
jest.mock('../../services/release-service', () => {
    // Use the actual class, but allow us to mock instance methods
    const Actual = jest.requireActual('../../services/release-service');
    return Actual;
});

const mockVerifySession = jest.fn(() => ({
    verifyInitialized: jest.fn()
}));
const mockGetDataCommonsOrigin = jest.fn();
const USER_PERMISSION_CONSTANTS = {
    DATA_SUBMISSION: { VIEW: 'VIEW' }
};

global.verifySession = mockVerifySession;
global.getDataCommonsOrigin = mockGetDataCommonsOrigin;
global.USER_PERMISSION_CONSTANTS = USER_PERMISSION_CONSTANTS;

describe('ReleaseService.getPropsForNodeType', () => {
    let releaseService;
    let mockGetUserScope;
    let mockGetPropsByStudyDataCommonNodeType;

    beforeEach(() => {
        mockGetUserScope = jest.fn();
        mockGetPropsByStudyDataCommonNodeType = jest.fn();

        releaseService = new Release({}, {}, {});
        releaseService._getUserScope = mockGetUserScope;
        releaseService._getPropsByStudyDataCommonNodeType = mockGetPropsByStudyDataCommonNodeType;
    });

    it('should return [] if userScope.isNoneScope() is true', async () => {
        mockGetUserScope.mockResolvedValue({ isNoneScope: () => true });
        const params = { studyID: 's1', dataCommonsDisplayName: 'dc1', nodeType: 'type1' };
        // Provide userInfo with _id to pass verifyInitialized
        const context = { userInfo: { id: 1, _id: 1 } };

        const result = await releaseService.getPropsForNodeType(params, context);

        expect(result).toEqual([]);
    });

    it('should return the result from _getPropsByStudyDataCommonNodeType', async () => {
        mockGetUserScope.mockResolvedValue({ isNoneScope: () => false });
        const expected = [{ name: 'foo', required: true, group: PROP_GROUPS.MODEL_DEFINED }];
        mockGetPropsByStudyDataCommonNodeType.mockResolvedValue(expected);
        mockGetDataCommonsOrigin.mockReturnValue(undefined);

        const params = { studyID: 'studyY', dataCommonsDisplayName: 'dcDisplay', nodeType: 'nodeT' };
        // Provide userInfo with _id to pass verifyInitialized
        const context = { userInfo: { id: 3, _id: 3 } };

        const result = await releaseService.getPropsForNodeType(params, context);

        expect(result).toBe(expected);
    });

    it('should use dataCommonsDisplayName if getDataCommonsOrigin returns falsy', async () => {
        mockGetUserScope.mockResolvedValue({ isNoneScope: () => false });
        mockGetPropsByStudyDataCommonNodeType.mockResolvedValue([]);
        mockGetDataCommonsOrigin.mockReturnValue('');

        const params = { studyID: 'studyZ', dataCommonsDisplayName: 'dcDisplay', nodeType: 'nodeT' };
        // Provide userInfo with _id to pass verifyInitialized
        const context = { userInfo: { id: 4, _id: 4 } };

        await releaseService.getPropsForNodeType(params, context);

        expect(mockGetPropsByStudyDataCommonNodeType).toHaveBeenCalledWith('studyZ', 'dcDisplay', 'nodeT');
    });
});
describe('_getPropsByStudyDataCommonNodeType', () => {
    let releaseService;
    let mockDataModelService;
    let mockReleaseCollection;

    beforeEach(() => {
        mockDataModelService = {
            getDefinedPropsByDataCommonAndType: jest.fn()
        };
        mockReleaseCollection = {}; // not used directly in this method
        releaseService = new Release();
        releaseService.dataModelService = mockDataModelService;
        // Patch PROP_GROUPS on the instance for test
        releaseService.PROP_GROUPS = PROP_GROUPS;
        // Patch the method under test to use PROP_GROUPS from above
        global.PROP_GROUPS = PROP_GROUPS;
        // Mock _getUPropNamesByStudyDataCommonNodeType
        releaseService._getUPropNamesByStudyDataCommonNodeType = jest.fn();
    });

    afterEach(() => {
        delete global.PROP_GROUPS;
    });
    it('returns only model defined properties if no extra or generated props', async () => {
        mockDataModelService.getDefinedPropsByDataCommonAndType.mockResolvedValue([
            { handle: 'propA', is_required: 'yes' },
            { handle: 'propB', is_required: 'no' }
        ]);
        releaseService._getUPropNamesByStudyDataCommonNodeType.mockResolvedValue([['propA', 'propB'], []]);
        const result = await releaseService._getPropsByStudyDataCommonNodeType('study1', 'commons1', 'NodeTypeA');
        expect(result).toEqual([
            { name: 'propA', required: true, group: PROP_GROUPS.MODEL_DEFINED },
            { name: 'propB', required: false, group: PROP_GROUPS.MODEL_DEFINED }
        ]);
    });

    it('returns model defined and extra node properties (not in model)', async () => {
        mockDataModelService.getDefinedPropsByDataCommonAndType.mockResolvedValue([
            { handle: 'propA', is_required: 'yes' }
        ]);
        releaseService._getUPropNamesByStudyDataCommonNodeType.mockResolvedValue([['propA', 'extraProp'], []]);
        const result = await releaseService._getPropsByStudyDataCommonNodeType('study1', 'commons1', 'NodeTypeA');
        expect(result).toEqual([
            { name: 'propA', required: true, group: PROP_GROUPS.MODEL_DEFINED },
            { name: 'extraProp', required: false, group: PROP_GROUPS.NOT_DEFINED }
        ]);
    });

    it('puts crdc_id in Internal group if present as extra property', async () => {
        mockDataModelService.getDefinedPropsByDataCommonAndType.mockResolvedValue([
            { handle: 'propA', is_required: 'no' }
        ]);
        releaseService._getUPropNamesByStudyDataCommonNodeType.mockResolvedValue([['propA', 'crdc_id'], []]);
        const result = await releaseService._getPropsByStudyDataCommonNodeType('study1', 'commons1', 'NodeTypeA');
        expect(result).toEqual([
            { name: 'propA', required: false, group: PROP_GROUPS.MODEL_DEFINED },
            { name: 'crdc_id', required: false, group: PROP_GROUPS.INTERNAL }
        ]);
    });

    it('adds generated properties to Internal group', async () => {
        mockDataModelService.getDefinedPropsByDataCommonAndType.mockResolvedValue([
            { handle: 'propA', is_required: 'yes' }
        ]);
        releaseService._getUPropNamesByStudyDataCommonNodeType.mockResolvedValue([['propA'], ['genProp1', 'genProp2']]);
        const result = await releaseService._getPropsByStudyDataCommonNodeType('study1', 'commons1', 'NodeTypeA');
        expect(result).toEqual([
            { name: 'propA', required: true, group: PROP_GROUPS.MODEL_DEFINED },
            { name: 'genProp1', required: false, group: PROP_GROUPS.INTERNAL },
            { name: 'genProp2', required: false, group: PROP_GROUPS.INTERNAL }
        ]);
    });

    it('handles required property as boolean correctly', async () => {
        mockDataModelService.getDefinedPropsByDataCommonAndType.mockResolvedValue([
            { handle: 'propA', is_required: true },
            { handle: 'propB', is_required: false },
            { handle: 'propC', is_required: 'YES' },
            { handle: 'propD', is_required: 'no' }
        ]);
        releaseService._getUPropNamesByStudyDataCommonNodeType.mockResolvedValue([['propA', 'propB', 'propC', 'propD'], []]);
        const result = await releaseService._getPropsByStudyDataCommonNodeType('study1', 'commons1', 'NodeTypeA');
        expect(result).toEqual([
            { name: 'propA', required: true, group: PROP_GROUPS.MODEL_DEFINED },
            { name: 'propB', required: false, group: PROP_GROUPS.MODEL_DEFINED },
            { name: 'propC', required: true, group: PROP_GROUPS.MODEL_DEFINED },
            { name: 'propD', required: false, group: PROP_GROUPS.MODEL_DEFINED }
        ]);
    });
});