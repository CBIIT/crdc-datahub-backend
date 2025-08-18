const SubmissionDAO = require('../../dao/submission');
const prisma = require('../../prisma');
const { NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, REJECTED, WITHDRAWN, CANCELED, DELETED } = require('../../constants/submission-constants');
const { COLLABORATOR_PERMISSIONS } = require('../../constants/submission-constants');
const ERROR = require('../../constants/error-constants');

// Mock Prisma
jest.mock('../../prisma', () => ({
    submission: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn()
    },
    program: {
        findMany: jest.fn()
    }
}));

describe('SubmissionDAO', () => {
    let dao;
    let mockUserInfo;
    let mockUserScope;

    beforeEach(() => {
        dao = new SubmissionDAO();
        jest.clearAllMocks();
        
        // Setup default mock user info
        mockUserInfo = {
            _id: 'test_user_id',
            dataCommons: ['test-commons'],
            studies: [
                { _id: 'study-1' },
                { _id: 'study-2' }
            ]
        };

        // Setup default mock user scope
        mockUserScope = {
            isAllScope: jest.fn().mockReturnValue(false),
            isStudyScope: jest.fn().mockReturnValue(false),
            isDCScope: jest.fn().mockReturnValue(false),
            isOwnScope: jest.fn().mockReturnValue(true),
            getStudyScope: jest.fn(),
            getDataCommonsScope: jest.fn()
        };
    });

    describe('findById', () => {
        it('should return submission with _id when found', async () => {
            const fakeSubmission = { id: 1, name: 'Test Submission' };
            prisma.submission.findUnique.mockResolvedValue(fakeSubmission);

            const result = await dao.findById(1);

            expect(prisma.submission.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
            expect(result).toEqual({ ...fakeSubmission, _id: fakeSubmission.id });
        });

        it('should return null when submission not found', async () => {
            prisma.submission.findUnique.mockResolvedValue(null);

            const result = await dao.findById(2);

            expect(prisma.submission.findUnique).toHaveBeenCalledWith({ where: { id: 2 } });
            expect(result).toBeNull();
        });
    });

    describe('listSubmissions', () => {
        const mockParams = {
            first: 10,
            offset: 0,
            orderBy: 'createdAt',
            sortDirection: 'desc'
        };

        const mockSubmissions = [
            {
                id: 'sub-1',
                name: 'Test Submission 1',
                status: NEW,
                dataCommons: 'test-commons',
                submitterName: 'Test User',
                studyID: 'study-1',
                dataFileSize: { size: 1024, formatted: '1 KB' },
                study: {
                    id: 'study-1',
                    studyName: 'Test Study',
                    studyAbbreviation: 'TS'
                },
                organization: {
                    id: 'org-1',
                    name: 'Test Organization',
                    abbreviation: 'TO'
                }
            }
        ];

        beforeEach(() => {
            // Setup default Prisma mocks
            prisma.submission.findMany.mockResolvedValue(mockSubmissions);
            prisma.submission.count.mockResolvedValue(1);
            prisma.program.findMany.mockResolvedValue([
                { id: 'org-1', name: 'Test Organization', abbreviation: 'TO' }
            ]);
        });

        describe('User Scope Scenarios', () => {
            it('should handle all scope users', async () => {
                mockUserScope.isAllScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions).toHaveLength(1);
                expect(result.total).toBe(1);
                expect(prisma.submission.findMany).toHaveBeenNthCalledWith(1,
                    expect.objectContaining({
                        where: expect.objectContaining({
                            status: { in: expect.arrayContaining([NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, REJECTED, WITHDRAWN, CANCELED, DELETED]) }
                        }),
                        include: expect.any(Object),
                        take: 10,
                        orderBy: { createdAt: 'desc' }
                    })
                );
            });

            it('should handle study scope users', async () => {
                mockUserScope.isStudyScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);
                mockUserScope.getStudyScope.mockReturnValue({
                    scopeValues: ['study-1', 'study-2']
                });

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions).toHaveLength(1);
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1', 'study-2'] }
                        })
                    })
                );
            });

            it('should handle data commons scope users', async () => {
                mockUserScope.isDCScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);
                mockUserScope.getDataCommonsScope.mockReturnValue({
                    scopeValues: ['test-commons']
                });

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions).toHaveLength(1);
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['test-commons'] }
                        })
                    })
                );
            });

            it('should handle own scope users with studies', async () => {
                mockUserScope.isOwnScope.mockReturnValue(true);

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions).toHaveLength(1);
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
                                { studyID: { in: ['study-1', 'study-2'] } },
                                {
                                    collaborators: {
                                        some: {
                                            collaboratorID: 'test_user_id',
                                            permission: { in: [COLLABORATOR_PERMISSIONS.CAN_EDIT] }
                                        }
                                    }
                                }
                            ])
                        })
                    })
                );
            });

            it('should handle own scope users with "All" studies', async () => {
                mockUserScope.isOwnScope.mockReturnValue(true);
                mockUserInfo.studies = [{ _id: 'All' }];

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions).toHaveLength(1);
                // Should not have OR conditions when studies include "All"
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.not.objectContaining({
                            OR: expect.anything()
                        })
                    })
                );
            });
        });

        describe('Filtering', () => {
            it('should apply status filter', async () => {
                const paramsWithStatus = { ...mockParams, status: [NEW, SUBMITTED] };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithStatus);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            status: { in: [NEW, SUBMITTED] }
                        })
                    })
                );
            });

            it('should apply name filter with case-insensitive search', async () => {
                const paramsWithName = { ...mockParams, name: 'Test' };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithName);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            name: {
                                contains: 'Test',
                                mode: 'insensitive'
                            }
                        })
                    })
                );
            });

            it('should apply dbGaPID filter with case-insensitive search', async () => {
                const paramsWithDbGaPID = { ...mockParams, dbGaPID: 'phs001234' };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithDbGaPID);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dbGaPID: {
                                contains: 'phs001234',
                                mode: 'insensitive'
                            }
                        })
                    })
                );
            });

            it('should apply data commons filter', async () => {
                const paramsWithDataCommons = { ...mockParams, dataCommons: 'specific-commons' };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithDataCommons);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: 'specific-commons'
                        })
                    })
                );
            });

            it('should apply submitter name filter', async () => {
                const paramsWithSubmitterName = { ...mockParams, submitterName: 'John Doe' };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithSubmitterName);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            submitterName: 'John Doe'
                        })
                    })
                );
            });

            it('should apply organization filter', async () => {
                const paramsWithOrganization = { ...mockParams, organization: 'National Cancer Institute' };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithOrganization);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            organization: { 
                                name: {
                                    contains: 'National Cancer Institute',
                                    mode: 'insensitive'
                                }
                            }
                        })
                    })
                );
            });

            it('should apply organization name filter', async () => {
                const paramsWithOrgName = { ...mockParams, organization: 'Broad Institute' };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithOrgName);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            organization: { 
                                name: {
                                    contains: 'Broad Institute',
                                    mode: 'insensitive'
                                }
                            }
                        })
                    })
                );
            });
        });

        describe('Pagination and Sorting', () => {
            it('should apply pagination correctly', async () => {
                const paramsWithPagination = {
                    ...mockParams,
                    first: 5,
                    offset: 10
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithPagination);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        skip: 10,
                        take: 5
                    })
                );
            });

            it('should apply sorting correctly', async () => {
                const paramsWithSorting = {
                    ...mockParams,
                    orderBy: 'name',
                    sortDirection: 'asc'
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithSorting);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        orderBy: { name: 'asc' }
                    })
                );
            });

            it('should apply organization sorting correctly', async () => {
                const paramsWithOrgSorting = {
                    ...mockParams,
                    orderBy: 'organization',
                    sortDirection: 'asc'
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithOrgSorting);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        orderBy: { organization: { name: 'asc' } }
                    })
                );
            });

            it('should handle no limit pagination', async () => {
                const paramsWithNoLimit = {
                    ...mockParams,
                    first: -1
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithNoLimit);

                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.not.objectContaining({
                        take: expect.anything()
                    })
                );
            });
        });

        describe('Data Transformation', () => {
            it('should transform submissions with _id and study info', async () => {
                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions[0]).toHaveProperty('_id', 'sub-1');
                expect(result.submissions[0]).toHaveProperty('studyName', 'Test Study');
                expect(result.submissions[0]).toHaveProperty('studyAbbreviation', 'TS');
            });

            it('should transform dataFileSize for deleted/canceled submissions', async () => {
                const deletedSubmission = {
                    ...mockSubmissions[0],
                    status: DELETED,
                    dataFileSize: { size: 2048, formatted: '2 KB' }
                };
                prisma.submission.findMany.mockResolvedValue([deletedSubmission]);

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions[0].dataFileSize).toEqual({ size: 0, formatted: 'NA' });
            });

            it('should preserve dataFileSize for active submissions', async () => {
                const activeSubmission = {
                    ...mockSubmissions[0],
                    status: NEW,
                    dataFileSize: { size: 1024, formatted: '1 KB' }
                };
                prisma.submission.findMany.mockResolvedValue([activeSubmission]);

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions[0].dataFileSize).toEqual({ size: 1024, formatted: '1 KB' });
            });
        });

        describe('Aggregations', () => {
            it('should get distinct data commons', async () => {
                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.dataCommons).toBeDefined();
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        select: { dataCommons: true },
                        distinct: ['dataCommons']
                    })
                );
            });

            it('should get distinct submitter names', async () => {
                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submitterNames).toBeDefined();
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        select: { submitterName: true },
                        distinct: ['submitterName']
                    })
                );
            });

            it('should get distinct organizations', async () => {
                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.organizations).toBeDefined();
                expect(prisma.program.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: {
                            studies: {
                                some: {
                                    id: { in: ['study-1'] }
                                }
                            }
                        },
                        select: {
                            id: true,
                            name: true,
                            abbreviation: true
                        }
                    })
                );
            });

            it('should get distinct statuses with proper sorting', async () => {
                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.statuses).toBeDefined();
                expect(typeof result.statuses).toBe('function');
                
                const sortedStatuses = result.statuses();
                expect(sortedStatuses).toBeDefined();
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        select: { status: true },
                        distinct: ['status']
                    })
                );
            });
        });

        describe('Error Handling', () => {
            it('should handle Prisma errors gracefully', async () => {
                const error = new Error('Database connection failed');
                prisma.submission.findMany.mockRejectedValue(error);

                await expect(dao.listSubmissions(mockUserInfo, mockUserScope, mockParams))
                    .rejects.toThrow('Failed to list submissions: Database connection failed');
            });

            it('should handle invalid user scope', async () => {
                mockUserScope.isAllScope.mockReturnValue(false);
                mockUserScope.isStudyScope.mockReturnValue(false);
                mockUserScope.isDCScope.mockReturnValue(false);
                mockUserScope.isOwnScope.mockReturnValue(false);

                await expect(dao.listSubmissions(mockUserInfo, mockUserScope, mockParams))
                    .rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
            });
        });
    });
});