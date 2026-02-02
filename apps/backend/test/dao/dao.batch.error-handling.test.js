const BatchDAO = require('../../dao/batch');

// Mock the prisma module
jest.mock('../../prisma', () => {
    const mockPrismaModel = {
        create: jest.fn(),
        createMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
        name: 'Batch'
    };

    return {
        batch: mockPrismaModel
    };
});

describe('BatchDAO Error Handling', () => {
    let batchDAO;
    let consoleSpy;
    let mockPrismaModel;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Get the mock model
        mockPrismaModel = require('../../prisma').batch;
        
        // Create a new instance for each test
        batchDAO = new BatchDAO();
        
        // Spy on console.error
        consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });
    describe('deleteBatchesBySubmissionID method', () => {
        it('should handle constraint violation errors', async () => {
            const submissionID = 'sub-123';
            const constraintError = new Error('Foreign key constraint violation');
            
            mockPrismaModel.deleteMany.mockRejectedValue(constraintError);

            await expect(batchDAO.deleteBatchesBySubmissionID(submissionID)).rejects.toThrow('Failed to delete batches');
        });

        it('should handle invalid submissionID errors', async () => {
            const invalidSubmissionID = undefined;
            // The method may not call deleteMany if submissionID is invalid, so we don't need to mock deleteMany here

            await expect(batchDAO.deleteBatchesBySubmissionID(invalidSubmissionID)).resolves.toBeUndefined();
        });
    });

    describe('findByStatus method', () => {
        it('should handle Prisma findFirst errors gracefully', async () => {
            const submissionID = 'sub-123';
            const status = 'Uploaded';
            const prismaError = new Error('Query execution failed');
            
            mockPrismaModel.findFirst.mockRejectedValue(prismaError);

            await expect(batchDAO.findByStatus(submissionID, status)).rejects.toThrow('Failed to find batch by status');
            
            expect(consoleSpy).toHaveBeenCalledWith('BatchDAO.findByStatus failed:', {
                error: 'Query execution failed',
                submissionID,
                status,
                stack: prismaError.stack
            });
        });

        it('should handle database connection errors', async () => {
            const submissionID = 'sub-123';
            const status = 'Uploaded';
            const connectionError = new Error('Connection timeout');
            
            mockPrismaModel.findFirst.mockRejectedValue(connectionError);

            await expect(batchDAO.findByStatus(submissionID, status)).rejects.toThrow('Failed to find batch by status');
        });

        it('should handle invalid status parameter errors', async () => {
            const submissionID = 'sub-123';
            const status = 'InvalidStatus';
            const parameterError = new Error('Invalid status parameter');
            
            mockPrismaModel.findFirst.mockRejectedValue(parameterError);

            await expect(batchDAO.findByStatus(submissionID, status)).rejects.toThrow('Failed to find batch by status');
        });
    });

    describe('getNextDisplayID method', () => {
        it('should handle Prisma count errors gracefully', async () => {
            const submissionID = 'sub-123';
            const prismaError = new Error('Count operation failed');
            
            mockPrismaModel.count.mockRejectedValue(prismaError);

            await expect(batchDAO.getNextDisplayID(submissionID)).rejects.toThrow('Failed to get next display ID');
            
            expect(consoleSpy).toHaveBeenCalledWith('BatchDAO.getNextDisplayID failed:', {
                error: 'Count operation failed',
                submissionID,
                stack: prismaError.stack
            });
        });

        it('should handle database connection errors', async () => {
            const submissionID = 'sub-123';
            const connectionError = new Error('Database connection lost');
            
            mockPrismaModel.count.mockRejectedValue(connectionError);

            await expect(batchDAO.getNextDisplayID(submissionID)).rejects.toThrow('Failed to get next display ID');
        });

        it('should handle invalid submissionID errors', async () => {
            const submissionID = 'invalid-id';
            const validationError = new Error('Invalid submission ID');
            
            mockPrismaModel.count.mockRejectedValue(validationError);

            await expect(batchDAO.getNextDisplayID(submissionID)).rejects.toThrow('Failed to get next display ID');
        });
    });

    describe('getLastFileBatchID method', () => {
        it('should handle Prisma findFirst errors gracefully', async () => {
            const submissionID = 'sub-123';
            const fileName = 'test.csv';
            const prismaError = new Error('Query execution failed');
            
            // Mock findFirst to fail (MongoDB array query fails)
            mockPrismaModel.findFirst.mockRejectedValue(prismaError);

            await expect(batchDAO.getLastFileBatchID(submissionID, fileName)).rejects.toThrow('Failed to get last file batch ID');
            
            expect(consoleSpy).toHaveBeenCalledWith('BatchDAO.getLastFileBatchID failed:', {
                error: 'Query execution failed',
                submissionID,
                fileName,
                maxBatches: 10,
                stack: prismaError.stack
            });
        });

        it('should handle database connection errors', async () => {
            const submissionID = 'sub-123';
            const fileName = 'test.csv';
            const connectionError = new Error('Connection timeout');
            
            mockPrismaModel.findFirst.mockRejectedValue(connectionError);

            await expect(batchDAO.getLastFileBatchID(submissionID, fileName)).rejects.toThrow('Failed to get last file batch ID');
        });

        it('should handle invalid parameters gracefully', async () => {
            const submissionID = 'sub-123';
            const fileName = 'test.csv';
            const parameterError = new Error('Invalid parameters');
            
            mockPrismaModel.findFirst.mockRejectedValue(parameterError);

            await expect(batchDAO.getLastFileBatchID(submissionID, fileName)).rejects.toThrow('Failed to get last file batch ID');
        });

        it('should handle custom maxBatches parameter', async () => {
            const submissionID = 'sub-123';
            const fileName = 'test.csv';
            const maxBatches = 5;
            const limitError = new Error('Query limit exceeded');
            
            mockPrismaModel.findFirst.mockRejectedValue(limitError);

            await expect(batchDAO.getLastFileBatchID(submissionID, fileName, maxBatches)).rejects.toThrow('Failed to get last file batch ID');
        });
    });

    describe('Inherited method error handling', () => {
        it('should handle create errors from GenericDAO', async () => {
            const batchData = { name: 'Test Batch', submissionID: 'sub-123' };
            const prismaError = new Error('Create operation failed');
            
            mockPrismaModel.create.mockRejectedValue(prismaError);

            await expect(batchDAO.create(batchData)).rejects.toThrow('Failed to create Batch');
        });

        it('should handle update errors from GenericDAO', async () => {
            const batchId = 'batch-123';
            const updateData = { name: 'Updated Batch' };
            const prismaError = new Error('Update operation failed');
            
            mockPrismaModel.update.mockRejectedValue(prismaError);

            await expect(batchDAO.update(batchId, updateData)).rejects.toThrow('Failed to update Batch');
        });

        it('should handle findById errors from GenericDAO', async () => {
            const batchId = 'batch-123';
            const prismaError = new Error('Find operation failed');
            
            mockPrismaModel.findUnique.mockRejectedValue(prismaError);

            await expect(batchDAO.findById(batchId)).rejects.toThrow('Failed to find Batch by ID');
        });

        it('should handle findMany errors from GenericDAO', async () => {
            const filter = { status: 'active' };
            const options = { orderBy: { createdAt: 'desc' } };
            const prismaError = new Error('FindMany operation failed');
            
            mockPrismaModel.findMany.mockRejectedValue(prismaError);

            await expect(batchDAO.findMany(filter, options)).rejects.toThrow('Failed to find many Batch');
        });

        it('should handle count errors from GenericDAO', async () => {
            const where = { status: 'active' };
            const prismaError = new Error('Count operation failed');
            
            mockPrismaModel.count.mockRejectedValue(prismaError);

            await expect(batchDAO.count(where)).rejects.toThrow('Failed to count Batch');
        });
    });

    describe('Error message consistency', () => {
        it('should include "Batch" model name in all error messages', async () => {
            const testData = { submissionID: 'sub-123' };
            const prismaError = new Error('Generic error');
            
            mockPrismaModel.create.mockRejectedValue(prismaError);

            try {
                await batchDAO.create(testData);
            } catch (error) {
                expect(error.message).toContain('Batch');
            }
        });

        it('should preserve original error messages in console logs', async () => {
            const submissionID = 'sub-123';
            const originalError = new Error('Original error message');
            
            mockPrismaModel.count.mockRejectedValue(originalError);

            try {
                await batchDAO.getNextDisplayID(submissionID);
            } catch (error) {
                expect(error.message).not.toContain('Original error message');
            }
            
            // Verify the original error message is preserved in console logs
            expect(consoleSpy).toHaveBeenCalledWith('BatchDAO.getNextDisplayID failed:', {
                error: 'Original error message',
                submissionID,
                stack: originalError.stack
            });
        });
    });

    describe('Console error logging consistency', () => {
        it('should log all error details including contextual information', async () => {
            const submissionID = 'sub-123';
            const status = 'Uploaded';
            const prismaError = new Error('Test error');
            prismaError.stack = 'Error stack trace';
            
            mockPrismaModel.findFirst.mockRejectedValue(prismaError);

            try {
                await batchDAO.findByStatus(submissionID, status);
            } catch (error) {
                // Error should be logged
            }

            expect(consoleSpy).toHaveBeenCalledWith(
                'BatchDAO.findByStatus failed:',
                expect.objectContaining({
                    error: 'Test error',
                    submissionID: 'sub-123',
                    status: 'Uploaded',
                    stack: 'Error stack trace'
                })
            );
        });

        it('should log different error contexts for different methods', async () => {
            const submissionID = 'sub-123';
            const fileName = 'test.tsv';
            const prismaError = new Error('Query failed');
            
            mockPrismaModel.findFirst.mockRejectedValue(prismaError);

            try {
                await batchDAO.getLastFileBatchID(submissionID, fileName);
            } catch (error) {
                // Error should be logged
            }

            expect(consoleSpy).toHaveBeenCalledWith(
                'BatchDAO.getLastFileBatchID failed:',
                expect.objectContaining({
                    error: 'Query failed',
                    submissionID: 'sub-123',
                    fileName: 'test.tsv',
                    maxBatches: 10
                })
            );
        });
    });

    describe('Edge cases and error scenarios', () => {
        it('should handle null/undefined parameters gracefully', async () => {
            const prismaError = new Error('Parameter validation failed');
            
            mockPrismaModel.findFirst.mockRejectedValue(prismaError);

            try {
                await batchDAO.findByStatus(null, undefined);
            } catch (error) {
                expect(error.message).toContain('Failed to find batch by status');
                expect(error.message).not.toContain('Parameter validation failed');
            }
        });

        it('should handle empty string parameters', async () => {
            const prismaError = new Error('Empty parameter error');
            
            mockPrismaModel.count.mockRejectedValue(prismaError);

            try {
                await batchDAO.getNextDisplayID('');
            } catch (error) {
                expect(error.message).toContain('Failed to get next display ID');
                expect(error.message).not.toContain('Empty parameter error');
            }
        });

        it('should handle very long parameter values', async () => {
            const longSubmissionID = 'a'.repeat(1000);
            const prismaError = new Error('Parameter too long');
            
            mockPrismaModel.findFirst.mockRejectedValue(prismaError);

            try {
                await batchDAO.findByStatus(longSubmissionID, 'status');
            } catch (error) {
                expect(error.message).toContain('Failed to find batch by status');
                expect(error.message).not.toContain('Parameter too long');
            }
        });
    });
}); 