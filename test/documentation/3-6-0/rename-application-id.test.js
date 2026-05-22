const { migrateApplicationID } = require('../../../documentation/3-6-0/rename-application-id');

describe('Rename Application ID Migration', () => {
    let mockDb;
    let mockApprovedStudiesCollection;
    let mockApplicationsCollection;

    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();

        // Suppress console output during tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        // Create mock collections
        mockApprovedStudiesCollection = {
            updateMany: jest.fn(),
            updateOne: jest.fn(),
            find: jest.fn()
        };

        mockApplicationsCollection = {
            findOne: jest.fn()
        };

        // Create mock database
        mockDb = {
            collection: jest.fn((name) => {
                if (name === 'approvedStudies') {
                    return mockApprovedStudiesCollection;
                } else if (name === 'applications') {
                    return mockApplicationsCollection;
                }
            })
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('Step 1: Renaming pendingApplicationID to applicationID', () => {
        it('should rename pendingApplicationID to applicationID for documents that have it', async () => {
            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 5 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([])
            });

            const result = await migrateApplicationID(mockDb);

            expect(mockApprovedStudiesCollection.updateMany).toHaveBeenCalledWith(
                { pendingApplicationID: { $exists: true } },
                { $rename: { 'pendingApplicationID': 'applicationID' } }
            );
            expect(result.renamed).toBe(5);
            expect(result.success).toBe(true);
        });

        it('should report zero renamed when no documents have pendingApplicationID', async () => {
            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([])
            });

            const result = await migrateApplicationID(mockDb);

            expect(result.renamed).toBe(0);
            expect(result.success).toBe(true);
        });
    });

    describe('Step 2: Populating applicationID for studies without one', () => {
        it('should populate applicationID when matching application found by studyName', async () => {
            const mockStudy = {
                _id: 'study-1',
                studyName: 'Test Study',
                studyAbbreviation: 'TS'
            };
            const mockApplication = {
                _id: 'app-123',
                studyName: 'Test Study'
            };

            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([mockStudy])
            });
            mockApprovedStudiesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
            mockApplicationsCollection.findOne.mockResolvedValue(mockApplication);

            const result = await migrateApplicationID(mockDb);

            expect(mockApplicationsCollection.findOne).toHaveBeenCalledWith(
                {
                    $or: [
                        { studyName: mockStudy.studyName },
                        { studyAbbreviation: mockStudy.studyAbbreviation }
                    ]
                },
                {
                    sort: { createdAt: 1 }
                }
            );
            expect(mockApprovedStudiesCollection.updateOne).toHaveBeenCalledWith(
                { _id: mockStudy._id },
                { $set: { applicationID: mockApplication._id } }
            );
            expect(result.populated).toBe(1);
            expect(result.success).toBe(true);
        });

        it('should populate applicationID when matching application found by studyAbbreviation', async () => {
            const mockStudy = {
                _id: 'study-2',
                studyName: 'Different Name',
                studyAbbreviation: 'ABBR'
            };
            const mockApplication = {
                _id: 'app-456',
                studyAbbreviation: 'ABBR'
            };

            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([mockStudy])
            });
            mockApprovedStudiesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
            mockApplicationsCollection.findOne.mockResolvedValue(mockApplication);

            const result = await migrateApplicationID(mockDb);

            expect(result.populated).toBe(1);
            expect(result.success).toBe(true);
        });

        it('should skip study and not set applicationID when no matching application found', async () => {
            const mockStudy = {
                _id: 'study-3',
                studyName: 'Orphan Study',
                studyAbbreviation: 'OS'
            };

            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([mockStudy])
            });
            mockApplicationsCollection.findOne.mockResolvedValue(null);

            const result = await migrateApplicationID(mockDb);

            expect(mockApprovedStudiesCollection.updateOne).not.toHaveBeenCalled();
            expect(result.populated).toBe(0);
            expect(result.skipped).toBe(1);
            expect(result.success).toBe(true);
        });

        it('should process multiple studies and track counts correctly', async () => {
            const mockStudies = [
                { _id: 'study-1', studyName: 'Study 1', studyAbbreviation: 'S1' },
                { _id: 'study-2', studyName: 'Study 2', studyAbbreviation: 'S2' },
                { _id: 'study-3', studyName: 'Study 3', studyAbbreviation: 'S3' }
            ];
            const mockApp1 = { _id: 'app-1', studyName: 'Study 1' };
            const mockApp3 = { _id: 'app-3', studyName: 'Study 3' };

            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 2 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue(mockStudies)
            });
            mockApprovedStudiesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
            
            // First study matches, second doesn't, third matches
            mockApplicationsCollection.findOne
                .mockResolvedValueOnce(mockApp1)
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(mockApp3);

            const result = await migrateApplicationID(mockDb);

            expect(result.renamed).toBe(2);
            expect(result.populated).toBe(2);
            expect(result.skipped).toBe(1);
            expect(result.success).toBe(true);
        });
    });

    describe('Error handling', () => {
        it('should handle errors when renaming fails', async () => {
            const error = new Error('Database connection failed');
            mockApprovedStudiesCollection.updateMany.mockRejectedValue(error);

            const result = await migrateApplicationID(mockDb);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Database connection failed');
        });

        it('should handle errors when finding studies fails', async () => {
            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockRejectedValue(new Error('Find failed'))
            });

            const result = await migrateApplicationID(mockDb);

            expect(result.success).toBe(false);
            expect(result.errors).toContain('Find failed');
        });

        it('should continue processing and track errors when individual study update fails', async () => {
            const mockStudies = [
                { _id: 'study-1', studyName: 'Study 1', studyAbbreviation: 'S1' },
                { _id: 'study-2', studyName: 'Study 2', studyAbbreviation: 'S2' }
            ];
            const mockApp = { _id: 'app-1', studyName: 'Study 1' };

            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue(mockStudies)
            });
            
            // First application lookup succeeds, but update fails
            mockApplicationsCollection.findOne
                .mockResolvedValueOnce(mockApp)
                .mockRejectedValueOnce(new Error('Application lookup failed'));
            
            mockApprovedStudiesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });

            const result = await migrateApplicationID(mockDb);

            expect(result.populated).toBe(1);
            expect(result.errors.length).toBe(1);
            expect(result.errors[0]).toContain('Failed to process study study-2');
            expect(result.success).toBe(false);
        });

        it('should handle updateOne failure for individual study', async () => {
            const mockStudy = {
                _id: 'study-1',
                studyName: 'Test Study',
                studyAbbreviation: 'TS'
            };
            const mockApplication = { _id: 'app-123' };

            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([mockStudy])
            });
            mockApplicationsCollection.findOne.mockResolvedValue(mockApplication);
            mockApprovedStudiesCollection.updateOne.mockRejectedValue(new Error('Update failed'));

            const result = await migrateApplicationID(mockDb);

            expect(result.errors.length).toBe(1);
            expect(result.errors[0]).toContain('Failed to process study study-1');
            expect(result.success).toBe(false);
        });
    });

    describe('Result structure', () => {
        it('should return correct result structure on success', async () => {
            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 3 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([])
            });

            const result = await migrateApplicationID(mockDb);

            expect(result).toEqual({
                success: true,
                renamed: 3,
                populated: 0,
                skipped: 0,
                errors: []
            });
        });

        it('should return correct result structure on partial failure', async () => {
            const mockStudy = { _id: 'study-1', studyName: 'Study', studyAbbreviation: 'S' };

            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 1 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([mockStudy])
            });
            mockApplicationsCollection.findOne.mockRejectedValue(new Error('Lookup error'));

            const result = await migrateApplicationID(mockDb);

            expect(result.success).toBe(false);
            expect(result.renamed).toBe(1);
            expect(result.populated).toBe(0);
            expect(result.errors.length).toBe(1);
        });
    });

    describe('Database collection access', () => {
        it('should access correct collections', async () => {
            mockApprovedStudiesCollection.updateMany.mockResolvedValue({ modifiedCount: 0 });
            mockApprovedStudiesCollection.find.mockReturnValue({
                toArray: jest.fn().mockResolvedValue([])
            });

            await migrateApplicationID(mockDb);

            expect(mockDb.collection).toHaveBeenCalledWith('approvedStudies');
            expect(mockDb.collection).toHaveBeenCalledWith('applications');
        });
    });
});
