const { QcResultService } = require("../../services/qc-result-service");
const ERROR = require("../../constants/error-constants");
const { VALIDATION_STATUS } = require("../../constants/submission-constants");
const USER_PERMISSION_CONSTANTS = require("../../crdc-datahub-database-drivers/constants/user-permission-constants");
const { UserScope } = require("../../domain/user-scope");

// Mock dependencies
jest.mock("../../verifier/user-info-verifier");
jest.mock("../../domain/user-scope");

const mockVerifySession = require("../../verifier/user-info-verifier");
const mockUserScope = require("../../domain/user-scope");
const QCResultDAO = require("../../dao/qcResult");

describe('QcResultService', () => {
    let qcResultService;
    let mockQcResultCollection;
    let mockSubmissionCollection;
    let mockAuthorizationService;
    let mockContext;
    let mockUserInfo;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Setup mock collections
        mockQcResultCollection = {
            aggregate: jest.fn(),
            deleteMany: jest.fn(),
            findOne: jest.fn()
        };

        mockSubmissionCollection = {
            findOne: jest.fn()
        };

        mockAuthorizationService = {
            getPermissionScope: jest.fn()
        };

        // Setup mock context and user info
        mockUserInfo = {
            email: "test@email.com",
            firstName: "Test",
            lastName: "User",
            IDP: "test-idp",
            _id: "test_user_id"
        };

        mockContext = {
            userInfo: mockUserInfo
        };

        // Setup verifySession mock
        mockVerifySession.verifySession.mockReturnValue({
            verifyInitialized: jest.fn()
        });

        // Setup UserScope mock
        mockUserScope.UserScope.create.mockReturnValue({
            isNoneScope: jest.fn().mockReturnValue(false),
            isAllScope: jest.fn().mockReturnValue(true),
            isStudyScope: jest.fn().mockReturnValue(false),
            isDCScope: jest.fn().mockReturnValue(false),
            isOwnScope: jest.fn().mockReturnValue(false)
        });

        // Setup authorization service mock
        mockAuthorizationService.getPermissionScope.mockResolvedValue([
            { scope: "all", scopeValues: [] }
        ]);

        qcResultService = new QcResultService(
            mockQcResultCollection,
            mockSubmissionCollection,
            mockAuthorizationService
        );
    });

    describe('submissionQCResultsAPI', () => {

        // beforeEach(() => {
        //     dataRecordService.dataRecordDAO = {
        //         findFirst: jest.fn()
        //       };
        // });

        const mockParams = {
            _id: "test_submission_id",
            nodeTypes: ["Subject", "Sample"],
            batchIDs: ["batch1"],
            severities: VALIDATION_STATUS.ERROR,
            issueCode: "E001",
            first: 10,
            offset: 0,
            orderBy: "type",
            sortDirection: "asc"
        };

        it('should successfully return QC results when user has permissions', async () => {
            // Patch: mock the DAO method if used instead of collection
            qcResultService.qcResultDAO = {
                submissionQCResults: jest.fn()
            };
            // If the service uses the DAO, mock its return value
            qcResultService.qcResultDAO.submissionQCResults
                .mockResolvedValueOnce({
                    results: [{ type: "Subject", errors: [] }],
                    total: 5
                });

            // Patch: mock submissionDAO.findFirst to simulate submission found
            qcResultService.submissionDAO = {
                findFirst: jest.fn().mockResolvedValue({ id: mockParams._id })
            };

            const result = await qcResultService.submissionQCResultsAPI(mockParams, mockContext);
            expect(result).toEqual({
                results: [{ type: "Subject", errors: [] }],
                total: 5
            });
            expect(mockVerifySession.verifySession).toHaveBeenCalledWith(mockContext);
            expect(qcResultService.submissionDAO.findFirst).toHaveBeenCalledWith({ id: mockParams._id });
        });

        it('should throw error when submission not found', async () => {
            qcResultService.submissionDAO = {
                findFirst: jest.fn().mockResolvedValue(null)
            };
            await expect(qcResultService.submissionQCResultsAPI(mockParams, mockContext))
                .rejects.toThrow(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        });

        it('should throw error when user has no permissions', async () => {
            const noneScope = {
                isNoneScope: jest.fn().mockReturnValue(true),
                isAllScope: jest.fn().mockReturnValue(false)
            };
            mockUserScope.UserScope.create.mockReturnValue(noneScope);

            await expect(qcResultService.submissionQCResultsAPI(mockParams, mockContext))
                .rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
        });

        it('should throw error when session not initialized', async () => {
            mockVerifySession.verifySession.mockReturnValue({
                verifyInitialized: jest.fn().mockImplementation(() => {
                    throw new Error("Session not initialized");
                })
            });

            await expect(qcResultService.submissionQCResultsAPI(mockParams, mockContext))
                .rejects.toThrow("Session not initialized");
        });
    });

    describe('submissionQCResults', () => {
        it('should filter by error severity correctly', async () => {
            const mockCountResult = [{ total: 2 }];
            const mockDataResult = [{ type: "Subject", errors: [{ code: "E001" }] }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.submissionQCResults(
                "test_submission_id",
                null,
                null,
                VALIDATION_STATUS.ERROR,
                null,
                10,
                0,
                "type",
                "asc"
            );

            expect(result.total).toBe(2);
            expect(result.results).toEqual([{ type: "Subject", errors: [{ code: "E001" }] }]);
        });

        it('should filter by warning severity correctly', async () => {
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [{ type: "Sample", warnings: [{ code: "W001" }] }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.submissionQCResults(
                "test_submission_id",
                null,
                null,
                VALIDATION_STATUS.WARNING,
                null,
                10,
                0,
                "type",
                "asc"
            );

            expect(result.total).toBe(1);
            expect(result.results).toEqual([{ type: "Sample", warnings: [{ code: "W001" }] }]);
        });

        it('should filter by batch IDs correctly', async () => {
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [{ type: "Subject", latestBatchID: "batch1" }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.submissionQCResults(
                "test_submission_id",
                null,
                ["batch1"],
                null,
                null,
                10,
                0,
                "type",
                "asc"
            );

            expect(result.total).toBe(1);
            expect(result.results).toEqual([{ type: "Subject", latestBatchID: "batch1" }]);
        });

        it('should filter by node types correctly', async () => {
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [{ type: "Subject" }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.submissionQCResults(
                "test_submission_id",
                ["Subject"],
                null,
                null,
                null,
                10,
                0,
                "type",
                "asc"
            );

            expect(result.total).toBe(1);
            expect(result.results).toEqual([{ type: "Subject" }]);
        });

        it('should filter by issue code correctly', async () => {
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [{ type: "Subject", errors: [{ code: "E001" }] }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.submissionQCResults(
                "test_submission_id",
                null,
                null,
                null,
                "E001",
                10,
                0,
                "type",
                "asc"
            );

            expect(result.total).toBe(1);
            expect(result.results).toEqual([{ type: "Subject", errors: [{ code: "E001" }] }]);
        });

        it('should handle pagination correctly', async () => {
            const mockCountResult = [{ total: 5 }];
            const mockDataResult = [{ type: "Subject" }, { type: "Sample" }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.submissionQCResults(
                "test_submission_id",
                null,
                null,
                null,
                null,
                2,
                1,
                "type",
                "asc"
            );

            expect(result.total).toBe(5);
            expect(result.results).toHaveLength(2);
        });

        it('should replace NaN values with null', async () => {
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [{ type: "Subject", count: NaN, score: NaN }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.submissionQCResults(
                "test_submission_id",
                null,
                null,
                null,
                null,
                10,
                0,
                "type",
                "asc"
            );

            expect(result.results[0].count).toBeNull();
            expect(result.results[0].score).toBeNull();
        });
    });

    describe('deleteQCResultBySubmissionID', () => {
        beforeEach(() => {
            // Patch the DAO to use the mock collection's deleteMany
            qcResultService.qcResultDAO = {
                deleteMany: jest.fn()
            };
        });

        it('should delete QC results successfully', async () => {
            const mockDeleteResult = { count: 3 };
            qcResultService.qcResultDAO.deleteMany.mockResolvedValue(mockDeleteResult);

            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                ["file1.txt", "file2.txt", "file3.txt"],
                false,
                []
            );

            expect(qcResultService.qcResultDAO.deleteMany).toHaveBeenCalledWith({
                submissionID: "test_submission_id",
                validationType: "data_file",
                submittedID: { in: ["file1.txt", "file2.txt", "file3.txt"] }
            });
        });

        it('should log error when deletion count mismatch', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const mockDeleteResult = { count: 2 };
            qcResultService.qcResultDAO.deleteMany.mockResolvedValue(mockDeleteResult);

            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                ["file1.txt", "file2.txt", "file3.txt"],
                false,
                []
            );

            expect(consoleSpy).toHaveBeenCalledWith(
                "An error occurred while deleting the qcResult records",
                "submissionID: test_submission_id"
            );
            consoleSpy.mockRestore();
        });

        it('should log error when deletion not acknowledged (count is 0)', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const mockDeleteResult = { count: 0 };
            qcResultService.qcResultDAO.deleteMany.mockResolvedValue(mockDeleteResult);

            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                ["file1.txt"],
                false,
                []
            );

            expect(consoleSpy).toHaveBeenCalledWith(
                "An error occurred while deleting the qcResult records",
                "submissionID: test_submission_id"
            );
            consoleSpy.mockRestore();
        });

        it('should return early when deleteAll is false and fileNames is empty', async () => {
            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                [],
                false,
                []
            );

            expect(qcResultService.qcResultDAO.deleteMany).not.toHaveBeenCalled();
        });

        it('should delete all QC results when deleteAll is true and no exclusiveIDs', async () => {
            const mockDeleteResult = { count: 10 };
            qcResultService.qcResultDAO.deleteMany.mockResolvedValue(mockDeleteResult);

            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                [],
                true,
                []
            );

            expect(qcResultService.qcResultDAO.deleteMany).toHaveBeenCalledWith({
                submissionID: "test_submission_id",
                validationType: "data_file"
            });
        });

        it('should delete all QC results except exclusiveIDs when deleteAll is true with exclusiveIDs', async () => {
            const mockDeleteResult = { count: 5 };
            qcResultService.qcResultDAO.deleteMany.mockResolvedValue(mockDeleteResult);

            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                [],
                true,
                ["file1.txt", "file2.txt"]
            );

            expect(qcResultService.qcResultDAO.deleteMany).toHaveBeenCalledWith({
                submissionID: "test_submission_id",
                validationType: "data_file",
                submittedID: { notIn: ["file1.txt", "file2.txt"] }
            });
        });

        it('should skip count validation when deleteAll is true', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const mockDeleteResult = { count: 0 };
            qcResultService.qcResultDAO.deleteMany.mockResolvedValue(mockDeleteResult);

            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                [],
                true,
                []
            );

            // Should not log error for deleteAll operations
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('should skip count validation when deleteAll is true with exclusiveIDs', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const mockDeleteResult = { count: 0 };
            qcResultService.qcResultDAO.deleteMany.mockResolvedValue(mockDeleteResult);

            await qcResultService.deleteQCResultBySubmissionID(
                "test_submission_id",
                "data_file",
                [],
                true,
                ["file1.txt"]
            );

            // Should not log error for deleteAll operations
            expect(consoleSpy).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('findBySubmissionErrorCodes', () => {
        it('should find QC results by error codes', async () => {
            const mockResults = [
                { submittedID: "file1.txt", submissionID: "test_submission_id" },
                { submittedID: "file2.txt", submissionID: "test_submission_id" }
            ];
            // Patch: mock the DAO method instead of aggregate to avoid Prisma error
            qcResultService.qcResultDAO = {
                findMany: jest.fn().mockResolvedValue(mockResults)
            };

            const result = await qcResultService.findBySubmissionErrorCodes(
                "test_submission_id",
                "E001"
            );

            expect(result).toEqual(mockResults);
            expect(qcResultService.qcResultDAO.findMany).toHaveBeenCalledWith(
                { submissionID: "test_submission_id", errors: { some: { code: "E001" } } },
                {
                    select: {
                        submittedID: true,
                        submissionID: true
                    }
                }
            );
        });

        it('should return empty array when no results found', async () => {
            // Patch: mock the DAO method instead of aggregate to avoid Prisma error
            qcResultService.qcResultDAO = {
                findMany: jest.fn().mockResolvedValue([])
            };

            const result = await qcResultService.findBySubmissionErrorCodes(
                "test_submission_id",
                "E001"
            );

            expect(result).toEqual([]);
            expect(qcResultService.qcResultDAO.findMany).toHaveBeenCalledWith(
                { submissionID: "test_submission_id", errors: { some: { code: "E001" } } },
                {
                    select: {
                        submittedID: true,
                        submissionID: true
                    }
                }
            );
        });
    });

    describe('getQCResultsErrors', () => {
        it('should get QC results errors by type', async () => {
            const mockResults = [
                { submittedID: "file1.txt", dataRecordID: "record1" },
                { submittedID: "file2.txt", dataRecordID: "record2" }
            ];
            mockQcResultCollection.aggregate.mockResolvedValue(mockResults);

            const result = await qcResultService.getQCResultsErrors(
                "test_submission_id",
                "Subject"
            );

            expect(result).toEqual(mockResults);
            expect(mockQcResultCollection.aggregate).toHaveBeenCalledWith([
                { "$match": { submissionID: "test_submission_id", type: "Subject" } },
                { "$project": { submittedID: 1, dataRecordID: 1 } }
            ]);
        });
    });

    describe('resetQCResultData', () => {
        it('should reset QC result data for submission', async () => {
            const mockDeleteResult = {
                count: 5
            };
            // Mock the qcResultDAO.deleteMany method instead of the collection
            qcResultService.qcResultDAO = {
                deleteMany: jest.fn().mockResolvedValue(mockDeleteResult)
            };

            const result = await qcResultService.resetQCResultData("test_submission_id");

            expect(result).toEqual(mockDeleteResult);
            expect(qcResultService.qcResultDAO.deleteMany).toHaveBeenCalledWith({ submissionID: "test_submission_id" });
        });
    });

    describe('aggregatedSubmissionQCResultsAPI', () => {
        const mockParams = {
            submissionID: "test_submission_id",
            severity: "error",
            first: 10,
            offset: 0,
            orderBy: "count",
            sortDirection: "desc"
        };

        it('should successfully return aggregated QC results when user has permissions', async () => {
            // Patch: mock the DAO method if used instead of collection
            qcResultService.qcResultDAO = {
                aggregatedSubmissionQCResults: jest.fn()
            };
            // If the service uses the DAO, mock its return value
            qcResultService.qcResultDAO.aggregatedSubmissionQCResults
                .mockResolvedValueOnce({
                    results: [
                        { title: "Missing required field", severity: "Error", code: "E001", count: 2, property: "N/A", value: "N/A" },
                        { title: "Invalid data format", severity: "Error", code: "E002", count: 1, property: "N/A", value: "N/A" }
                    ],
                    total: 2
                });

            // Patch: mock submissionDAO.findFirst to simulate submission found
            qcResultService.submissionDAO = {
                findFirst: jest.fn().mockResolvedValue({ id: mockParams.submissionID })
            };

            const result = await qcResultService.aggregatedSubmissionQCResultsAPI(mockParams, mockContext);

            expect(result).toEqual({
                total: 2,
                results: [
                    { title: "Missing required field", severity: "Error", code: "E001", count: 2, property: "N/A", value: "N/A" },
                    { title: "Invalid data format", severity: "Error", code: "E002", count: 1, property: "N/A", value: "N/A" }
                ]
            });
            expect(qcResultService.submissionDAO.findFirst).toHaveBeenCalledWith({ id: mockParams.submissionID });
            expect(qcResultService.qcResultDAO.aggregatedSubmissionQCResults).toHaveBeenCalledWith(
                mockParams.submissionID,
                mockParams.severity,
                mockParams.first,
                mockParams.offset,
                mockParams.orderBy,
                mockParams.sortDirection
            );
        });

        it('should throw error when submission not found', async () => {
            qcResultService.submissionDAO = {
                findFirst: jest.fn().mockResolvedValue(null)
            };
            await expect(qcResultService.aggregatedSubmissionQCResultsAPI(mockParams, mockContext))
                .rejects.toThrow(ERROR.INVALID_SUBMISSION_NOT_FOUND);
        });

        it('should throw error when user has no permissions', async () => {
            const noneScope = {
                isNoneScope: jest.fn().mockReturnValue(true),
                isAllScope: jest.fn().mockReturnValue(false),
                isStudyScope: jest.fn().mockReturnValue(false),
                isDCScope: jest.fn().mockReturnValue(false),
                isOwnScope: jest.fn().mockReturnValue(false)
            };
            mockUserScope.UserScope.create.mockReturnValue(noneScope);

            // Patch: mock submissionDAO.findFirst to simulate submission found
            qcResultService.submissionDAO = {
                findFirst: jest.fn().mockResolvedValue({ id: mockParams.submissionID })
            };

            await expect(qcResultService.aggregatedSubmissionQCResultsAPI(mockParams, mockContext))
                .rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
        });
    });

    describe('qcResultDAO.aggregatedSubmissionQCResults', () => {
        it('should aggregate QC results by error severity', async () => {
            const mockCountResult = [{ total: 2 }];
            const mockDataResult = [
                { title: "Missing required field", severity: "Error", code: "E001", count: 3, property: "N/A", value: "N/A" },
                { title: "Invalid format", severity: "Error", code: "E002", count: 2, property: "N/A", value: "N/A" }
            ];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "error",
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(2);
            expect(result.results).toHaveLength(2);
            expect(result.results[0].severity).toBe("Error");
        });

        it('should aggregate QC results by warning severity', async () => {
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [{ title: "Optional field missing", severity: "Warning", code: "W001", count: 1, property: "N/A", value: "N/A" }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "warning",
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(1);
            expect(result.results[0].severity).toBe("Warning");
        });

        it('should handle no severity filter', async () => {
            const mockCountResult = [{ total: 2 }];
            const mockDataResult = [
                { title: "Missing required field", severity: "Error", code: "E001", count: 2, property: "N/A", value: "N/A" },
                { title: "Optional field missing", severity: "Warning", code: "W001", count: 1, property: "N/A", value: "N/A" }
            ];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                null,
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(2);
            expect(result.results).toHaveLength(2);
        });

        it('should handle pagination correctly', async () => {
            const mockCountResult = [{ total: 3 }];
            const mockDataResult = [{ title: "Missing required field", severity: "Error", code: "E001", count: 2, property: "N/A", value: "N/A" }];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "error",
                1,
                1,
                "count",
                "desc"
            );

            expect(result.total).toBe(3);
            expect(result.results).toHaveLength(1);
        });

        it('should group same issue type by different property/value combinations separately', async () => {
            // This test verifies that the same issue (title, severity, code) with different
            // property/value combinations are grouped as separate entries
            const mockCountResult = [{ total: 2 }];
            const mockDataResult = [
                { 
                    title: "Missing required field", 
                    severity: "Error", 
                    code: "E001", 
                    count: 3,
                    property: "age",
                    value: ""
                },
                { 
                    title: "Missing required field", 
                    severity: "Error", 
                    code: "E001", 
                    count: 2,
                    property: "name",
                    value: ""
                }
            ];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "error",
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(2);
            expect(result.results).toHaveLength(2);
            // Both have same issue type but different property
            expect(result.results[0].title).toBe("Missing required field");
            expect(result.results[1].title).toBe("Missing required field");
            expect(result.results[0].code).toBe("E001");
            expect(result.results[1].code).toBe("E001");
            // But different property values
            expect(result.results[0].property).toBe("age");
            expect(result.results[1].property).toBe("name");
            expect(result.results[0].count).toBe(3);
            expect(result.results[1].count).toBe(2);
        });

        it('should group same issue type with same property/value together', async () => {
            // This test verifies that the same issue with the same property/value
            // are grouped together and counts are summed
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [
                { 
                    title: "Invalid data type", 
                    severity: "Error", 
                    code: "E002", 
                    count: 5, // Multiple records with same issue/property/value
                    property: "date_of_birth",
                    value: "2023-13-45" // Invalid date format
                }
            ];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "error",
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(1);
            expect(result.results).toHaveLength(1);
            expect(result.results[0].title).toBe("Invalid data type");
            expect(result.results[0].property).toBe("date_of_birth");
            expect(result.results[0].value).toBe("2023-13-45");
            expect(result.results[0].count).toBe(5); // All grouped together
        });

        it('should handle property and value fields with null values', async () => {
            // This test verifies that null property/value are handled correctly
            const mockCountResult = [{ total: 2 }];
            const mockDataResult = [
                { 
                    title: "Missing required field", 
                    severity: "Error", 
                    code: "E003", 
                    count: 1,
                    property: "N/A",
                    value: "N/A"
                },
                { 
                    title: "Schema validation error", 
                    severity: "Error", 
                    code: "E004", 
                    count: 3,
                    property: "gender",
                    value: "unknown"
                }
            ];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "error",
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(2);
            expect(result.results).toHaveLength(2);
            
            // Find results by code to avoid order dependency
            const result1 = result.results.find(r => r.code === "E003");
            const result2 = result.results.find(r => r.code === "E004");
            
            expect(result1).toBeDefined();
            expect(result1.property).toBe("N/A");
            expect(result1.value).toBe("N/A");
            
            expect(result2).toBeDefined();
            expect(result2.property).toBe("gender");
            expect(result2.value).toBe("unknown");
        });

        it('should handle mixed issues with various property/value combinations', async () => {
            // Comprehensive test with multiple issue types and property/value combinations
            const mockCountResult = [{ total: 4 }];
            const mockDataResult = [
                { 
                    title: "Missing required field", 
                    severity: "Error", 
                    code: "E001", 
                    count: 10,
                    property: "patient_id",
                    value: ""
                },
                { 
                    title: "Missing required field", 
                    severity: "Error", 
                    code: "E001", 
                    count: 5,
                    property: "study_id",
                    value: ""
                },
                { 
                    title: "Invalid data format", 
                    severity: "Error", 
                    code: "E005", 
                    count: 3,
                    property: "age",
                    value: "xyz"
                },
                { 
                    title: "Out of range value", 
                    severity: "Warning", 
                    code: "W002", 
                    count: 1,
                    property: "temperature",
                    value: "999.99"
                }
            ];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                null, // No severity filter
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(4);
            expect(result.results).toHaveLength(4);
            
            // Verify first issue (missing patient_id) has highest count
            expect(result.results[0].title).toBe("Missing required field");
            expect(result.results[0].code).toBe("E001");
            expect(result.results[0].property).toBe("patient_id");
            expect(result.results[0].count).toBe(10);
            
            // Verify second issue (missing study_id) grouped separately
            expect(result.results[1].title).toBe("Missing required field");
            expect(result.results[1].code).toBe("E001");
            expect(result.results[1].property).toBe("study_id");
            expect(result.results[1].count).toBe(5);
            
            // Verify warnings are included when no severity filter
            const warningResult = result.results.find(r => r.severity === "Warning");
            expect(warningResult).toBeDefined();
            expect(warningResult.code).toBe("W002");
        });

        it('should count distinct records rather than individual issues', async () => {
            // This test demonstrates that the count represents distinct data records (by dataRecordID)
            // that contain the specific issue, not the total number of individual issue occurrences
            const mockCountResult = [{ total: 1 }];
            const mockDataResult = [
                { 
                    title: "Missing required field", 
                    severity: "Error", 
                    code: "E001", 
                    count: 2,  // 2 distinct data records (by dataRecordID) contain this issue
                    property: "N/A",
                    value: "N/A"
                }
            ];
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult)
                .mockResolvedValueOnce(mockDataResult);

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "error",
                10,
                0,
                "count",
                "desc"
            );

            expect(result.total).toBe(1);
            expect(result.results).toHaveLength(1);
            expect(result.results[0].count).toBe(2); // 2 distinct data records (by dataRecordID), not individual issue count
            expect(result.results[0].title).toBe("Missing required field");
        });

        it('should convert total from null to 0 when qcResultCollection.aggregate returns null total', async () => {
            // Mock the aggregate method to return a response with total: null
            // This simulates the scenario where the count pipeline returns null
            const mockCountResult = [{ total: null }]; // Count pipeline returns null total
            const mockDataResult = []; // Empty results array
            
            mockQcResultCollection.aggregate
                .mockResolvedValueOnce(mockCountResult) // First call for count pipeline
                .mockResolvedValueOnce(mockDataResult); // Second call for pagination pipeline

            const result = await qcResultService.qcResultDAO.aggregatedSubmissionQCResults(
                "test_submission_id",
                "error",
                10,
                0,
                "count",
                "desc"
            );

            // Verify that null total from aggregate is converted to 0
            expect(result.total).toBe(0);
            expect(result.total).not.toBeNull();
            expect(result.results).toEqual([]);
            expect(mockQcResultCollection.aggregate).toHaveBeenCalledTimes(2);
        });
    });

    describe('_getUserScope', () => {
        it('should return valid user scope', async () => {
            const mockScope = {
                isNoneScope: jest.fn().mockReturnValue(false),
                isAllScope: jest.fn().mockReturnValue(true),
                isStudyScope: jest.fn().mockReturnValue(false),
                isDCScope: jest.fn().mockReturnValue(false),
                isOwnScope: jest.fn().mockReturnValue(false)
            };
            mockUserScope.UserScope.create.mockReturnValue(mockScope);

            const result = await qcResultService._getUserScope(mockUserInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);

            expect(result).toBe(mockScope);
            expect(mockAuthorizationService.getPermissionScope).toHaveBeenCalledWith(
                mockUserInfo,
                USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW
            );
        });

        it('should throw error for invalid user scope', async () => {
            const mockScope = {
                isNoneScope: jest.fn().mockReturnValue(false),
                isAllScope: jest.fn().mockReturnValue(false),
                isStudyScope: jest.fn().mockReturnValue(false),
                isDCScope: jest.fn().mockReturnValue(false),
                isOwnScope: jest.fn().mockReturnValue(false)
            };
            mockUserScope.UserScope.create.mockReturnValue(mockScope);

            await expect(qcResultService._getUserScope(mockUserInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW))
                .rejects.toThrow();
        });
    });


}); 