// Mock dependencies first
jest.mock('../../prisma', () => ({
    approvedStudy: {
        findMany: jest.fn()
    }
}));
jest.mock('../../dao/generic');
jest.mock('../../crdc-datahub-database-drivers/domain/mongo-pagination');

const ApprovedStudyDAO = require('../../dao/approvedStudy');
const { MongoPagination } = require('../../crdc-datahub-database-drivers/domain/mongo-pagination');
const { ORGANIZATION_COLLECTION, USER_COLLECTION } = require('../../crdc-datahub-database-drivers/database-constants');
const { DIRECTION, SORT } = require('../../crdc-datahub-database-drivers/constants/monogodb-constants');

describe('ApprovedStudyDAO - listApprovedStudies', () => {
    let dao;
    let mockCollection;

    beforeEach(() => {
        mockCollection = {
            aggregate: jest.fn()
        };
        dao = new ApprovedStudyDAO(mockCollection);
        
        // Mock MongoPagination
        MongoPagination.mockImplementation(() => ({
            getPaginationPipeline: jest.fn().mockReturnValue([
                { $sort: { studyName: 1 } },
                { $skip: 0 },
                { $limit: 10 }
            ])
        }));
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Basic functionality', () => {
        it('should call aggregate with correct pipeline structure', async () => {
            const mockResult = [{
                total: 1,
                results: [{ _id: 'study1', studyName: 'Test Study' }]
            }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            expect(mockCollection.aggregate).toHaveBeenCalledTimes(1);
            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            
            // Check that pipeline has the expected stages
            expect(pipeline).toHaveLength(7); // lookup, lookup, addFields, addFields, match, facet, set
            
            // Check $lookup stages
            const lookupStages = pipeline.filter(stage => stage.$lookup);
            expect(lookupStages).toHaveLength(2);
            
            // Check program lookup
            const programLookup = lookupStages.find(stage => stage.$lookup.as === 'program');
            expect(programLookup).toBeDefined();
            expect(programLookup.$lookup.from).toBe(ORGANIZATION_COLLECTION);
            expect(programLookup.$lookup.localField).toBe('programID');
            expect(programLookup.$lookup.foreignField).toBe('_id');
            
            // Check primaryContact lookup
            const contactLookup = lookupStages.find(stage => stage.$lookup.as === 'primaryContact');
            expect(contactLookup).toBeDefined();
            expect(contactLookup.$lookup.from).toBe(USER_COLLECTION);
            expect(contactLookup.$lookup.localField).toBe('primaryContactID');
            expect(contactLookup.$lookup.foreignField).toBe('_id');
        });

        it('should return the aggregate result', async () => {
            const mockResult = [{
                total: 2,
                results: [
                    { _id: 'study1', studyName: 'Study 1' },
                    { _id: 'study2', studyName: 'Study 2' }
                ]
            }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            const result = await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            expect(result).toEqual(mockResult);
        });
    });

    describe('Filtering functionality', () => {
        it('should apply study name filter with case-insensitive regex', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                'test study', null, null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const matchStage = pipeline.find(stage => stage.$match);
            
            expect(matchStage.$match.$or).toEqual([
                { studyName: { $regex: 'test study', $options: 'i' } },
                { studyAbbreviation: { $regex: 'test study', $options: 'i' } }
            ]);
        });

        it('should apply controlled access filter correctly', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, 'Controlled', null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const matchStage = pipeline.find(stage => stage.$match);
            
            expect(matchStage.$match.controlledAccess).toBe(true);
        });

        it('should apply open access filter correctly', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, 'Open', null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const matchStage = pipeline.find(stage => stage.$match);
            
            expect(matchStage.$match.openAccess).toBe(true);
        });

        it('should not apply access filter for "All"', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, 'All', null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const matchStage = pipeline.find(stage => stage.$match);
            
            expect(matchStage.$match.controlledAccess).toBeUndefined();
            expect(matchStage.$match.openAccess).toBeUndefined();
        });

        it('should apply dbGaPID filter with case-insensitive regex', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, 'phs123', null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const matchStage = pipeline.find(stage => stage.$match);
            
            expect(matchStage.$match.dbGaPID).toEqual({
                $regex: 'phs123',
                $options: 'i'
            });
        });

        it('should apply programID filter when not "All"', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, 'program-123', 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const matchStage = pipeline.find(stage => stage.$match);
            
            expect(matchStage.$match.programID).toBe('program-123');
        });

        it('should not apply programID filter when "All"', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, 'All', 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const matchStage = pipeline.find(stage => stage.$match);
            
            expect(matchStage.$match.programID).toBeUndefined();
        });

        it('should throw error for invalid controlled access value', async () => {
            await expect(dao.listApprovedStudies(
                null, 'Invalid', null, null, 10, 0, 'studyName', 'asc'
            )).rejects.toThrow('Invalid controlled access');
        });
    });

    describe('Program field handling', () => {
        it('should convert program array to single object', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const addFieldsStage = pipeline.find(stage => 
                stage.$addFields && stage.$addFields.program
            );
            
            expect(addFieldsStage.$addFields.program).toEqual({
                $arrayElemAt: ["$program", 0]
            });
        });

        it('should handle primaryContact with useProgramPC false', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const addFieldsStage = pipeline.find(stage => 
                stage.$addFields && stage.$addFields.primaryContact && stage.$addFields.primaryContact._id
            );
            
            expect(addFieldsStage.$addFields.primaryContact._id).toEqual({
                $cond: [
                    "$useProgramPC",
                    "$program.conciergeID",
                    "$primaryContact._id"
                ]
            });
        });

        it('should handle primaryContact firstName with useProgramPC true', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const addFieldsStage = pipeline.find(stage => 
                stage.$addFields && stage.$addFields.primaryContact && stage.$addFields.primaryContact.firstName
            );
            
            const firstNameLogic = addFieldsStage.$addFields.primaryContact.firstName;
            expect(firstNameLogic.$cond[0]).toBe("$useProgramPC");
            expect(firstNameLogic.$cond[1].$ifNull[0].$arrayElemAt[0].$split[0]).toBe("$program.conciergeName");
            expect(firstNameLogic.$cond[1].$ifNull[0].$arrayElemAt[1]).toBe(0);
            expect(firstNameLogic.$cond[2]).toBe("$primaryContact.firstName");
        });

        it('should handle primaryContact lastName with useProgramPC true', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const addFieldsStage = pipeline.find(stage => 
                stage.$addFields && stage.$addFields.primaryContact && stage.$addFields.primaryContact.lastName
            );
            
            const lastNameLogic = addFieldsStage.$addFields.primaryContact.lastName;
            expect(lastNameLogic.$cond[0]).toBe("$useProgramPC");
            expect(lastNameLogic.$cond[1].$ifNull[0].$arrayElemAt[0].$split[0]).toBe("$program.conciergeName");
            expect(lastNameLogic.$cond[1].$ifNull[0].$arrayElemAt[1]).toBe(1);
            expect(lastNameLogic.$cond[2]).toBe("$primaryContact.lastName");
        });
    });

    describe('Case-insensitive sorting for program.name', () => {
        it('should create programSort field for program.name sorting', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'program.name', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const setStage = pipeline.find(stage => 
                stage.$set && stage.$set.programSort
            );
            
            expect(setStage).toBeDefined();
            expect(setStage.$set.programSort).toEqual({
                $toLower: "$program.name"
            });
        });

        it('should not create programSort field for other sorting fields', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const setStage = pipeline.find(stage => 
                stage.$set && stage.$set.programSort
            );
            
            expect(setStage).toBeUndefined();
        });

        it('should use programPipeLine for program.name sorting', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'program.name', 'desc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const facetStage = pipeline.find(stage => stage.$facet);
            
            expect(facetStage.$facet.results).toBeDefined();
            // The results should use the programPipeLine (mocked by MongoPagination)
        });

        it('should use customPaginationPipeline for non-program sorting', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'desc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            const facetStage = pipeline.find(stage => stage.$facet);
            
            expect(facetStage.$facet.results).toBeDefined();
            // The results should use the customPaginationPipeline
        });
    });

    describe('Pagination and sorting', () => {
        it('should pass correct parameters to MongoPagination', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                'test', 'Controlled', 'phs123', 'program-1', 20, 10, 'studyName', 'desc'
            );

            expect(MongoPagination).toHaveBeenCalledWith(20, 10, 'studyName', 'desc');
        });

        it('should handle program.name sorting with modified orderBy', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'program.name', 'asc'
            );

            // Should call MongoPagination with 'programSort' instead of 'program.name'
            expect(MongoPagination).toHaveBeenCalledWith(10, 0, 'programSort', 'asc');
        });
    });

    describe('Pipeline structure validation', () => {
        it('should have correct pipeline stages in order', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            
            // Expected stages in order:
            expect(pipeline[0].$lookup).toBeDefined(); // Program lookup
            expect(pipeline[1].$lookup).toBeDefined(); // PrimaryContact lookup
            expect(pipeline[2].$addFields).toBeDefined(); // Convert arrays to objects
            expect(pipeline[3].$addFields).toBeDefined(); // Build primaryContact
            expect(pipeline[4].$match).toBeDefined(); // Apply filters
            expect(pipeline[5].$facet).toBeDefined(); // Pagination and results
            expect(pipeline[6].$set).toBeDefined(); // Set total count
        });

        it('should include programSort stage when sorting by program.name', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'program.name', 'asc'
            );

            const pipeline = mockCollection.aggregate.mock.calls[0][0];
            
            // Should have 8 stages instead of 7 (extra $set for programSort)
            expect(pipeline).toHaveLength(8);
            
            // Find the programSort stage
            const programSortStage = pipeline.find(stage => 
                stage.$set && stage.$set.programSort
            );
            expect(programSortStage).toBeDefined();
        });
    });

    describe('Error handling', () => {
        it('should propagate aggregation errors', async () => {
            const error = new Error('Database connection failed');
            mockCollection.aggregate.mockRejectedValue(error);

            await expect(dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            )).rejects.toThrow('Database connection failed');
        });

        it('should handle empty results gracefully', async () => {
            const mockResult = [{ total: 0, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            const result = await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );

            expect(result).toEqual(mockResult);
        });
    });

    describe('Edge cases', () => {
        it('should handle null/undefined parameters', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, undefined, null, null, 10, 0, 'studyName', 'asc'
            );

            expect(mockCollection.aggregate).toHaveBeenCalledTimes(1);
        });

        it('should handle zero pagination parameters', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            await dao.listApprovedStudies(
                null, null, null, null, 0, 0, 'studyName', 'asc'
            );

            expect(MongoPagination).toHaveBeenCalledWith(0, 0, 'studyName', 'asc');
        });

        it('should handle different sort directions', async () => {
            const mockResult = [{ total: 1, results: [] }];
            mockCollection.aggregate.mockResolvedValue(mockResult);

            // Test ascending
            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'asc'
            );
            expect(MongoPagination).toHaveBeenCalledWith(10, 0, 'studyName', 'asc');

            // Test descending
            await dao.listApprovedStudies(
                null, null, null, null, 10, 0, 'studyName', 'desc'
            );
            expect(MongoPagination).toHaveBeenCalledWith(10, 0, 'studyName', 'desc');
        });
    });
});
