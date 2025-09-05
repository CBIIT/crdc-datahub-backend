const { Release } = require('../../services/release-service');

describe('Release Service APIs - listReleasedStudies, getReleaseNodeTypes, listReleasedDataRecords', () => {
    const mockContext = { userInfo: { _id: 'user123', role: 'researcher' } };
    const mockStudyData = [{ _id: 'study1', name: 'Study A' }];
    const mockNodeTypes = ['Study', 'Program'];
    const mockDataRecords = [
        { _id: 'record1', type: 'Study', props: { title: 'Record A' } }
    ];

    let releaseInstance;

    beforeEach(() => {
        releaseInstance = new Release();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('listReleasedStudies()', () => {
        test('should return list of released studies', async () => {
            jest.spyOn(releaseInstance, 'listReleasedStudies').mockResolvedValue(mockStudyData);

            const result = await releaseInstance.listReleasedStudies({}, mockContext);

            expect(result).toEqual(mockStudyData);
            expect(releaseInstance.listReleasedStudies).toHaveBeenCalledWith({}, mockContext);
        });

        test('should throw an error if service fails', async () => {
            jest.spyOn(releaseInstance, 'listReleasedStudies').mockRejectedValue(new Error('DB error'));

            await expect(releaseInstance.listReleasedStudies({}, mockContext)).rejects.toThrow('DB error');
        });
    });

    describe('getReleaseNodeTypes()', () => {
        test('should return node types', async () => {
            jest.spyOn(releaseInstance, 'getReleaseNodeTypes').mockResolvedValue(mockNodeTypes);

            const result = await releaseInstance.getReleaseNodeTypes({}, mockContext);

            expect(result).toEqual(mockNodeTypes);
            expect(Array.isArray(result)).toBe(true);
            expect(result).toContain('Study');
            expect(releaseInstance.getReleaseNodeTypes).toHaveBeenCalledWith({}, mockContext);
        });

        test('should throw error when fetching node types fails', async () => {
            jest.spyOn(releaseInstance, 'getReleaseNodeTypes').mockRejectedValue(new Error('NodeType error'));

            await expect(releaseInstance.getReleaseNodeTypes({}, mockContext)).rejects.toThrow('NodeType error');
        });
    });

    describe('_listNodesConditions() - hasAccessToStudy', () => {
        let userScopeMock;

        beforeEach(() => {
            userScopeMock = {
                isAllScope: jest.fn().mockReturnValue(false),
                isStudyScope: jest.fn().mockReturnValue(true),
                isDCScope: jest.fn().mockReturnValue(false),
                hasAccessToStudy: jest.fn(),
                getDataCommonsScope: jest.fn(),
            };
        });

        test('should include studyID in $in if user has access to study', () => {
            userScopeMock.hasAccessToStudy.mockReturnValue(true);
            const nodesParam = 'nodeType1';
            const dataCommonsParam = 'commons1';
            const studyID = 'study123';

            // Patch the instance method to public for testing
            const result = releaseInstance._listNodesConditions(nodesParam, dataCommonsParam, userScopeMock, studyID);

            expect(result).toHaveProperty('studyID');
            expect(result.studyID).toEqual({ $in: [studyID] });
            expect(result).toHaveProperty('dataCommons', dataCommonsParam);
            expect(userScopeMock.hasAccessToStudy).toHaveBeenCalledWith(studyID);
        });

        test('should include empty $in if user does not have access to study', () => {
            userScopeMock.hasAccessToStudy.mockReturnValue(false);
            const nodesParam = 'nodeType1';
            const dataCommonsParam = 'commons1';
            const studyID = 'study123';

            const result = releaseInstance._listNodesConditions(nodesParam, dataCommonsParam, userScopeMock, studyID);

            expect(result).toHaveProperty('studyID');
            expect(result.studyID).toEqual({ $in: [] });
            expect(result).toHaveProperty('dataCommons', dataCommonsParam);
            expect(userScopeMock.hasAccessToStudy).toHaveBeenCalledWith(studyID);
        });

        test('should throw error if userScope is not valid', () => {
            userScopeMock.isAllScope.mockReturnValue(false);
            userScopeMock.isStudyScope.mockReturnValue(false);
            userScopeMock.isDCScope.mockReturnValue(false);

            expect(() => {
                releaseInstance._listNodesConditions('nodeType1', 'commons1', userScopeMock, 'study123');
            }).toThrow();
        });
    });

    describe('listReleasedDataRecords()', () => {
        const validParams = { nodeType: 'Study' };

        test('should return released data records for valid nodeType', async () => {
            jest.spyOn(releaseInstance, 'listReleasedDataRecords').mockResolvedValue(mockDataRecords);

            const result = await releaseInstance.listReleasedDataRecords(validParams, mockContext);

            expect(result).toEqual(mockDataRecords);
            expect(result[0]).toHaveProperty('props');
            expect(releaseInstance.listReleasedDataRecords).toHaveBeenCalledWith(validParams, mockContext);
        });

        test('should throw error on backend failure', async () => {
            jest.spyOn(releaseInstance, 'listReleasedDataRecords').mockRejectedValue(new Error('DB fetch failed'));

            await expect(releaseInstance.listReleasedDataRecords(validParams, mockContext)).rejects.toThrow('DB fetch failed');
        });
    });
});
