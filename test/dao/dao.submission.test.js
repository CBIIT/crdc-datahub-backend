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
            getStudyScope: jest.fn().mockReturnValue({
                scope: 'study',
                scopeValues: ['study-1', 'study-2']
            }),
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
                mockUserScope.getStudyScope.mockReturnValue({
                    scopeValues: ['study-1', 'study-2']
                });

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions).toHaveLength(1);
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1', 'study-2'] },
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
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
                mockUserScope.getStudyScope.mockReturnValue({
                    scopeValues: ['All']
                });

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);

                expect(result.submissions).toHaveLength(1);
                // Should have OR conditions for OWN scope users, even with "All" studies
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            OR: [
                                { submitterID: 'test_user_id' },
                                {
                                    collaborators: {
                                        some: {
                                            collaboratorID: 'test_user_id',
                                            permission: { in: ['Can Edit'] }
                                        }
                                    }
                                }
                            ]
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

                // The submitter name filter is applied via an OR clause in the where object,
                // so we check that the OR array exists and contains the expected structure.
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            OR: expect.any(Array)
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
                            programID: 'National Cancer Institute'
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
                            programID: 'Broad Institute'
                        })
                    })
                );
            });
        });

        describe('Filter Application', () => {
            it('should apply search filters to both submissions query and aggregations', async () => {
                const paramsWithFilters = {
                    ...mockParams,
                    name: 'Test Submission',
                    status: ['New'],
                    dataCommons: 'GDC'
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithFilters);

                // Main submissions query should include search filters
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            name: {
                                contains: 'Test Submission',
                                mode: 'insensitive'
                            },
                            status: { in: ['New'] },
                            dataCommons: 'GDC'
                        })
                    })
                );

                // Aggregation queries should also include search filters (same as main query)
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            name: {
                                contains: 'Test Submission',
                                mode: 'insensitive'
                            },
                            status: { in: ['New'] },
                            dataCommons: 'GDC'
                        }),
                        select: { dataCommons: true },
                        distinct: ['dataCommons']
                    })
                );
            });
        });

        describe('Filter Priority and Behavior', () => {
            beforeEach(() => {
                // Setup mock responses for aggregation methods
                prisma.submission.findMany
                    .mockResolvedValueOnce(mockSubmissions) // Main query
                    .mockResolvedValueOnce([{ dataCommons: 'test-commons' }]) // Data commons aggregation
                    .mockResolvedValueOnce([{ submitterName: 'Test User' }]) // Submitter names aggregation
                    .mockResolvedValueOnce([{ studyID: 'study-1' }]) // Organizations aggregation
                    .mockResolvedValueOnce([{ status: NEW }]); // Statuses aggregation
                
                prisma.submission.count.mockResolvedValue(1);
            });

            it('should apply user scope filters first, then search filters', async () => {
                mockUserScope.isOwnScope.mockReturnValue(true);
                mockUserScope.getStudyScope.mockReturnValue({
                    scopeValues: ['study-1', 'study-2']
                });

                const paramsWithFilters = {
                    ...mockParams,
                    name: 'Test',
                    status: [NEW, SUBMITTED],
                    dataCommons: 'specific-commons'
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithFilters);

                // Verify the main query includes both user scope AND search filters
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1', 'study-2'] },
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
                                {
                                    collaborators: {
                                        some: {
                                            collaboratorID: 'test_user_id',
                                            permission: { in: [COLLABORATOR_PERMISSIONS.CAN_EDIT] }
                                        }
                                    }
                                }
                            ]),
                            name: {
                                contains: 'Test',
                                mode: 'insensitive'
                            },
                            status: { in: [NEW, SUBMITTED] },
                            dataCommons: 'specific-commons'
                        })
                    })
                );
            });

            it('should apply all scope filters without user restrictions', async () => {
                mockUserScope.isAllScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);

                const paramsWithFilters = {
                    ...mockParams,
                    name: 'Test',
                    status: [NEW],
                    organization: 'org-123'
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithFilters);

                // Verify the main query includes only search filters (no user scope restrictions)
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            name: {
                                contains: 'Test',
                                mode: 'insensitive'
                            },
                            status: { in: [NEW] },
                            programID: 'org-123'
                        })
                    })
                );

                // Should NOT include user scope restrictions
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.not.objectContaining({
                            studyID: expect.anything(),
                            OR: expect.anything()
                        })
                    })
                );
            });

            it('should apply data commons scope filters correctly', async () => {
                mockUserScope.isDCScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);
                // Note: DC scope uses userInfo.dataCommons, not scope values from userScope
                mockUserInfo.dataCommons = ['GDC', 'PDC'];

                const paramsWithFilters = {
                    ...mockParams,
                    name: 'Test',
                    status: [NEW]
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithFilters);

                // Verify the main query includes both DC scope AND search filters
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['GDC', 'PDC'] },
                            name: {
                                contains: 'Test',
                                mode: 'insensitive'
                            },
                            status: { in: [NEW] }
                        })
                    })
                );
            });

            it('should apply study scope filters correctly', async () => {
                mockUserScope.isStudyScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);
                mockUserScope.getStudyScope.mockReturnValue({
                    scopeValues: ['study-1', 'study-2']
                });

                const paramsWithFilters = {
                    ...mockParams,
                    name: 'Test',
                    organization: 'org-123'
                };

                await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithFilters);

                // Verify the main query includes both study scope AND search filters
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1', 'study-2'] },
                            name: {
                                contains: 'Test',
                                mode: 'insensitive'
                            },
                            programID: 'org-123'
                        })
                    })
                );
            });

            it('should handle multiple search filters simultaneously', async () => {
                // Override the default user studies for this test
                const testUserInfo = {
                    ...mockUserInfo,
                    studies: [{ _id: 'study-1' }]
                };

                const paramsWithMultipleFilters = {
                    ...mockParams,
                    name: 'Cancer Study',
                    status: [NEW, IN_PROGRESS],
                    dbGaPID: 'phs001234',
                    dataCommons: 'GDC',
                    submitterName: 'John Doe',
                    organization: 'NCI'
                };

                await dao.listSubmissions(testUserInfo, mockUserScope, paramsWithMultipleFilters);

                // Verify all search filters are applied along with user scope
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1'] },
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
                                {
                                    collaborators: {
                                        some: {
                                            collaboratorID: 'test_user_id',
                                            permission: { in: [COLLABORATOR_PERMISSIONS.CAN_EDIT] }
                                        }
                                    }
                                }
                            ]),
                            name: {
                                contains: 'Cancer Study',
                                mode: 'insensitive'
                            },
                            status: { in: [NEW, IN_PROGRESS] },
                            dbGaPID: {
                                contains: 'phs001234',
                                mode: 'insensitive'
                            },
                            dataCommons: 'GDC',
                            submitter: {
                                is: {
                                    fullName: 'John Doe'
                                }
                            },
                            programID: 'NCI'
                        })
                    })
                );
            });

            it('should handle empty or null filter parameters gracefully', async () => {
                // Override the default user studies for this test
                const testUserInfo = {
                    ...mockUserInfo,
                    studies: [{ _id: 'study-1' }]
                };

                const paramsWithEmptyFilters = {
                    ...mockParams,
                    name: '',
                    status: null,
                    dbGaPID: undefined,
                    dataCommons: '',
                    submitterName: null,
                    organization: ''
                };

                await dao.listSubmissions(testUserInfo, mockUserScope, paramsWithEmptyFilters);

                // Verify only user scope filters are applied, no search filters
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1'] },
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
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

                // Should NOT include empty/null search filters
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.not.objectContaining({
                            name: expect.anything(),
                            status: expect.anything(),
                            dbGaPID: expect.anything(),
                            dataCommons: expect.anything(),
                            submitterName: expect.anything(),
                            programID: expect.anything()
                        })
                    })
                );
            });

            it('should not apply status filter when status is explicitly provided as empty array', async () => {
                // Override the default user studies for this test
                const testUserInfo = {
                    ...mockUserInfo,
                    studies: [{ _id: 'study-1' }]
                };

                const paramsWithEmptyStatus = {
                    ...mockParams,
                    status: []
                };

                await dao.listSubmissions(testUserInfo, mockUserScope, paramsWithEmptyStatus);

                // Verify that no status filter is applied when status array is empty
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1'] },
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
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

                // Should NOT include status filter when array is empty
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.not.objectContaining({
                            status: expect.anything()
                        })
                    })
                );
            });

            it('should not apply default status filter when status is null', async () => {
                // Override the default user studies for this test
                const testUserInfo = {
                    ...mockUserInfo,
                    studies: [{ _id: 'study-1' }]
                };

                const paramsWithNullStatus = {
                    ...mockParams,
                    status: null
                };

                await dao.listSubmissions(testUserInfo, mockUserScope, paramsWithNullStatus);

                // Verify no status filter is applied
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1'] },
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
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

                // Should NOT include status filter
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.not.objectContaining({
                            status: expect.anything()
                        })
                    })
                );
            });

            it('should apply aggregations with full filter conditions (including search filters)', async () => {
                // Override the default user studies for this test
                const testUserInfo = {
                    ...mockUserInfo,
                    studies: [{ _id: 'study-1' }]
                };

                const paramsWithFilters = {
                    ...mockParams,
                    name: 'Test',
                    status: [NEW],
                    dataCommons: 'GDC'
                };

                await dao.listSubmissions(testUserInfo, mockUserScope, paramsWithFilters);

                // Verify aggregation queries use the same filter conditions as main query
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study-1'] },
                            OR: expect.arrayContaining([
                                { submitterID: 'test_user_id' },
                                {
                                    collaborators: {
                                        some: {
                                            collaboratorID: 'test_user_id',
                                            permission: { in: [COLLABORATOR_PERMISSIONS.CAN_EDIT] }
                                        }
                                    }
                                }
                            ]),
                            name: {
                                contains: 'Test',
                                mode: 'insensitive'
                            },
                            status: { in: [NEW] },
                            dataCommons: 'GDC'
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
                        select: { submitter: true },
                        distinct: ['submitterID']
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

        describe('Data Commons Filter Intersection Logic', () => {
            beforeEach(() => {
                // Reset mocks for this test suite
                jest.clearAllMocks();
                
                // Setup mock user scope for DC scope testing
                mockUserScope.isAllScope.mockReturnValue(false);
                mockUserScope.isStudyScope.mockReturnValue(false);
                mockUserScope.isDCScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);
            });

            it('should create intersection when existing filter exists and new filter matches', async () => {
                // User has access to GDC and PDC
                const userWithDCScope = {
                    ...mockUserInfo,
                    dataCommons: ['GDC', 'PDC']
                };

                // Test with dataCommons filter that matches one of user's data commons
                const paramsWithFilter = {
                    ...mockParams,
                    dataCommons: 'GDC'
                };

                const result = await dao.listSubmissions(userWithDCScope, mockUserScope, paramsWithFilter);

                // Verify that the intersection was created
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['GDC'] }
                        })
                    })
                );
            });

            it('should apply user dataCommons scope even when filter parameter intersection is empty', async () => {
                // User has access to GDC and PDC
                const userWithDCScope = {
                    ...mockUserInfo,
                    dataCommons: ['GDC', 'PDC']
                };

                // Set user scope to be a data commons scope
                mockUserScope.isDCScope.mockReturnValue(true);
                mockUserScope.isOwnScope.mockReturnValue(false);

                // Test with dataCommons filter that does not match user's data commons
                const paramsWithFilter = {
                    ...mockParams,
                    dataCommons: 'ABC'
                };

                const result = await dao.listSubmissions(userWithDCScope, mockUserScope, paramsWithFilter);

                // Verify that user's dataCommons scope is still applied even when filter parameter doesn't match
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['GDC', 'PDC'] }
                        })
                    })
                );
            });

            it('should add new filter when no existing filter exists', async () => {
                // User has no DC scope, so no existing dataCommons filter
                mockUserScope.isDCScope.mockReturnValue(false);
                mockUserScope.isOwnScope.mockReturnValue(true);

                const paramsWithFilter = {
                    ...mockParams,
                    dataCommons: 'GDC'
                };

                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, paramsWithFilter);

                // Verify that the new filter was added
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: 'GDC'
                        })
                    })
                );
            });

            it('should handle multiple data commons in user scope correctly', async () => {
                // User has access to multiple data commons
                const userWithMultipleDC = {
                    ...mockUserInfo,
                    dataCommons: ['GDC', 'PDC', 'TARGET', 'CCLE']
                };

                const paramsWithFilter = {
                    ...mockParams,
                    dataCommons: 'TARGET'
                };

                const result = await dao.listSubmissions(userWithMultipleDC, mockUserScope, paramsWithFilter);

                // Verify that the intersection was created correctly
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['TARGET'] }
                        })
                    })
                );
            });

            it('should handle ALL_FILTER correctly (no filtering)', async () => {
                const userWithDCScope = {
                    ...mockUserInfo,
                    dataCommons: ['GDC', 'PDC']
                };

                const paramsWithAllFilter = {
                    ...mockParams,
                    dataCommons: 'All'
                };

                const result = await dao.listSubmissions(userWithDCScope, mockUserScope, paramsWithAllFilter);

                // Verify that no dataCommons filter was added when ALL_FILTER is used
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['GDC', 'PDC'] }
                        })
                    })
                );
            });

            it('should handle empty dataCommons filter correctly', async () => {
                const userWithDCScope = {
                    ...mockUserInfo,
                    dataCommons: ['GDC', 'PDC']
                };

                const paramsWithoutFilter = {
                    ...mockParams
                    // No dataCommons filter
                };

                const result = await dao.listSubmissions(userWithDCScope, mockUserScope, paramsWithoutFilter);

                // Verify that the original user scope filter is preserved
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['GDC', 'PDC'] }
                        })
                    })
                );
            });

            it('should handle null/undefined dataCommons filter correctly', async () => {
                const userWithDCScope = {
                    ...mockUserInfo,
                    dataCommons: ['GDC', 'PDC']
                };

                const paramsWithNullFilter = {
                    ...mockParams,
                    dataCommons: null
                };

                const result = await dao.listSubmissions(userWithDCScope, mockUserScope, paramsWithNullFilter);

                // Verify that the original user scope filter is preserved
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['GDC', 'PDC'] }
                        })
                    })
                );
            });

            it('should handle whitespace from dataCommons filter', async () => {
                const userWithDCScope = {
                    ...mockUserInfo,
                    dataCommons: ['GDC', 'PDC']
                };

                const paramsWithWhitespace = {
                    ...mockParams,
                    dataCommons: '  GDC  '
                };

                const result = await dao.listSubmissions(userWithDCScope, mockUserScope, paramsWithWhitespace);

                // Verify that whitespace was trimmed and intersection was created
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            dataCommons: { in: ['GDC'] }
                        })
                    })
                );
            });
        });

        describe('listSubmissions with OWN scope without study scope', () => {
            it('should throw error for users with OWN scope but no study scope', async () => {
                const mockUserInfo = {
                    _id: 'user123',
                    email: 'test@example.com',
                    role: 'researcher'
                };
                
                const mockUserScope = {
                    isAllScope: () => false,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isOwnScope: () => true,
                    getStudyScope: () => null, // No study scope
                    isNoneScope: () => false
                };
                
                const mockParams = {
                    first: 10,
                    offset: 0
                };
                
                // Should throw error because OWN scope requires study assignment
                await expect(dao.listSubmissions(mockUserInfo, mockUserScope, mockParams))
                    .rejects
                    .toThrow(ERROR.VERIFY.INVALID_PERMISSION);
            });

            it('should allow users with OWN scope and study assignment to list their own submissions', async () => {
                const mockUserInfo = {
                    _id: 'user123',
                    email: 'test@example.com',
                    role: 'researcher',
                    studies: [
                        { _id: 'study1' },
                        { _id: 'study2' }
                    ]
                };
                
                const mockUserScope = {
                    isAllScope: () => false,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isOwnScope: () => true,
                    getStudyScope: () => null, // Not used in new implementation
                    isNoneScope: () => false
                };
                
                const mockParams = {
                    first: 10,
                    offset: 0
                };
                
                // Mock Prisma responses
                const mockSubmissions = [
                    {
                        id: 'sub1',
                        name: 'Test Submission 1',
                        submitterID: 'user123',
                        status: 'NEW',
                        dataCommons: 'GDC',
                        studyID: 'study1',
                        study: {
                            studyName: 'Test Study 1',
                            studyAbbreviation: 'TS1'
                        },
                        organization: {
                            id: 'org1',
                            name: 'Test Org',
                            abbreviation: 'TO'
                        },
                        submitter: {
                            id: 'user123',
                            firstName: 'Test',
                            lastName: 'User',
                            fullName: 'Test User',
                            email: 'test@example.com'
                        },
                        concierge: null,
                        dataFileSize: null
                    }
                ];
                
                // Mock Prisma methods
                prisma.submission.findMany = jest.fn().mockResolvedValue(mockSubmissions);
                prisma.submission.count = jest.fn().mockResolvedValue(1);
                
                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);
                
                expect(result).toBeDefined();
                expect(result.submissions).toHaveLength(1);
                expect(result.total).toBe(1);
                expect(result.submissions[0]._id).toBe('sub1');
                expect(result.submissions[0].submitterID).toBe('user123');
                
                // Verify that both study assignment AND ownership conditions were applied
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            studyID: { in: ['study1', 'study2'] },
                            OR: [
                                { submitterID: 'user123' },
                                {
                                    collaborators: {
                                        some: {
                                            collaboratorID: 'user123',
                                            permission: { in: ['Can Edit'] }
                                        }
                                    }
                                }
                            ]
                        }),
                        include: expect.any(Object),
                        take: 10
                    })
                );
            });

            it('should allow users with OWN scope and "All" studies to list their own submissions without study filtering', async () => {
                const mockUserInfo = {
                    _id: 'user123',
                    email: 'test@example.com',
                    role: 'researcher',
                    studies: [
                        { _id: 'All' }
                    ]
                };
                
                const mockUserScope = {
                    isAllScope: () => false,
                    isStudyScope: () => false,
                    isDCScope: () => false,
                    isOwnScope: () => true,
                    getStudyScope: () => null, // Not used in new implementation
                    isNoneScope: () => false
                };
                
                const mockParams = {
                    first: 10,
                    offset: 0
                };
                
                // Mock Prisma responses
                const mockSubmissions = [
                    {
                        id: 'sub1',
                        name: 'Test Submission 1',
                        submitterID: 'user123',
                        status: 'NEW',
                        dataCommons: 'GDC',
                        studyID: 'study1',
                        study: {
                            studyName: 'Test Study 1',
                            studyAbbreviation: 'TS1'
                        },
                        organization: {
                            id: 'org1',
                            name: 'Test Org',
                            abbreviation: 'TO'
                        },
                        submitter: {
                            id: 'user123',
                            firstName: 'Test',
                            lastName: 'User',
                            fullName: 'Test User',
                            email: 'test@example.com'
                        },
                        concierge: null,
                        dataFileSize: null
                    }
                ];
                
                // Mock Prisma methods
                prisma.submission.findMany = jest.fn().mockResolvedValue(mockSubmissions);
                prisma.submission.count = jest.fn().mockResolvedValue(1);
                
                const result = await dao.listSubmissions(mockUserInfo, mockUserScope, mockParams);
                
                expect(result).toBeDefined();
                expect(result.submissions).toHaveLength(1);
                expect(result.total).toBe(1);
                expect(result.submissions[0]._id).toBe('sub1');
                expect(result.submissions[0].submitterID).toBe('user123');
                
                // Verify that only ownership conditions were applied (no study filtering for "All" studies)
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.objectContaining({
                            OR: [
                                { submitterID: 'user123' },
                                {
                                    collaborators: {
                                        some: {
                                            collaboratorID: 'user123',
                                            permission: { in: ['Can Edit'] }
                                        }
                                    }
                                }
                            ]
                        }),
                        include: expect.any(Object),
                        take: 10
                    })
                );
                
                // Should NOT have studyID filter when user has "All" studies
                expect(prisma.submission.findMany).toHaveBeenCalledWith(
                    expect.objectContaining({
                        where: expect.not.objectContaining({
                            studyID: expect.anything()
                        })
                    })
                );
            });
        });
    });
});