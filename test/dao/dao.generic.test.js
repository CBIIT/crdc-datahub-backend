// Mock the prisma module before requiring GenericDAO
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
        name: 'TestModel'
    };

    return {
        TestModel: mockPrismaModel
    };
});

// Mock the orm-converter utility
jest.mock('../../dao/utils/orm-converter', () => ({
    convertMongoFilterToPrismaFilter: jest.fn((filter) => filter)
}));

describe('GenericDAO Error Handling', () => {
    let GenericDAO;
    let genericDAO;
    let consoleSpy;

    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();
        
        // Require GenericDAO fresh in each test to ensure mock is applied
        GenericDAO = require('../../dao/generic');
        
        // Create a new instance for each test
        genericDAO = new GenericDAO('TestModel');
        
        // Spy on console.error
        consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        consoleSpy.mockRestore();
    });

    describe('Error handling patterns', () => {
        it('should handle create errors with proper logging', async () => {
            const testData = { name: 'Test', value: 123 };
            const prismaError = new Error('Database connection failed');
            
            // Mock the create method to throw an error
            genericDAO.model.create.mockRejectedValue(prismaError);

            await expect(genericDAO.create(testData)).rejects.toThrow('Failed to create TestModel');
            
            expect(consoleSpy).toHaveBeenCalledWith('GenericDAO.create failed for TestModel:', {
                error: 'Database connection failed',
                dataType: 'object',
                dataKeys: ['name', 'value'],
                dataLength: null,
                stack: prismaError.stack
            });
        });

        it('should handle findById errors with proper logging', async () => {
            const testId = 'test-id-123';
            const prismaError = new Error('Invalid ID format');
            
            // Mock the findUnique method to throw an error
            genericDAO.model.findUnique.mockRejectedValue(prismaError);

            await expect(genericDAO.findById(testId)).rejects.toThrow('Failed to find TestModel by ID');
            
            expect(consoleSpy).toHaveBeenCalledWith('GenericDAO.findById failed for TestModel:', {
                error: 'Invalid ID format',
                id: testId,
                stack: prismaError.stack
            });
        });

        it('should handle update errors with proper logging', async () => {
            const testId = 'test-id-123';
            const updateData = { name: 'Updated Test' };
            const prismaError = new Error('Record not found');
            
            // Mock the update method to throw an error
            genericDAO.model.update.mockRejectedValue(prismaError);

            await expect(genericDAO.update(testId, updateData)).rejects.toThrow('Failed to update TestModel');
            
            expect(consoleSpy).toHaveBeenCalledWith('GenericDAO.update failed for TestModel:', {
                error: 'Record not found',
                id: testId,
                updateDataKeys: ['name'],
                stack: prismaError.stack
            });
        });

        it('should handle deleteMany errors with proper logging', async () => {
            const whereClause = { status: 'deleted' };
            const prismaError = new Error('Delete operation failed');
            
            // Mock the deleteMany method to throw an error
            genericDAO.model.deleteMany.mockRejectedValue(prismaError);

            await expect(genericDAO.deleteMany(whereClause)).rejects.toThrow('Failed to delete many TestModel');
            
            expect(consoleSpy).toHaveBeenCalledWith('GenericDAO.deleteMany failed for TestModel:', {
                error: 'Delete operation failed',
                where: JSON.stringify(whereClause),
                stack: prismaError.stack
            });
        });

        it('should handle count errors with proper logging', async () => {
            const whereClause = { status: 'active' };
            const prismaError = new Error('Count operation failed');
            
            // Mock the count method to throw an error
            genericDAO.model.count.mockRejectedValue(prismaError);

            await expect(genericDAO.count(whereClause)).rejects.toThrow('Failed to count TestModel');
            
            expect(consoleSpy).toHaveBeenCalledWith('GenericDAO.count failed for TestModel:', {
                error: 'Count operation failed',
                where: JSON.stringify(whereClause),
                stack: prismaError.stack
            });
        });
    });

    describe('Error message consistency', () => {
        it('should include model name in all error messages', async () => {
            const testData = { name: 'Test' };
            const prismaError = new Error('Generic database error');
            
            // Mock the create method to throw an error
            genericDAO.model.create.mockRejectedValue(prismaError);

            try {
                await genericDAO.create(testData);
            } catch (error) {
                expect(error.message).toContain('TestModel');
                expect(error.message).not.toContain('Generic database error');
            }
        });

        it('should preserve original error messages in console logs', async () => {
            const testId = 'test-id-123';
            const originalError = new Error('Original error message');
            
            // Mock the findUnique method to throw an error
            genericDAO.model.findUnique.mockRejectedValue(originalError);

            try {
                await genericDAO.findById(testId);
            } catch (error) {
                expect(error.message).not.toContain('Original error message');
            }
            
            // Verify the original error message is preserved in console logs
            expect(consoleSpy).toHaveBeenCalledWith('GenericDAO.findById failed for TestModel:', {
                error: 'Original error message',
                id: testId,
                stack: originalError.stack
            });
        });
    });

    describe('Console error logging patterns', () => {
        it('should log error details including stack trace', async () => {
            const testData = { name: 'Test' };
            const prismaError = new Error('Test error');
            prismaError.stack = 'Error stack trace';
            
            // Mock the create method to throw an error
            genericDAO.model.create.mockRejectedValue(prismaError);

            try {
                await genericDAO.create(testData);
            } catch (error) {
                // Error should be logged
            }

            // Verify that console.error was called with the expected format
            expect(consoleSpy).toHaveBeenCalledWith(
                'GenericDAO.create failed for TestModel:',
                expect.objectContaining({
                    error: 'Test error',
                    dataType: 'object',
                    dataKeys: ['name'],
                    dataLength: null,
                    stack: 'Error stack trace'
                })
            );
        });

        it('should log contextual information for different methods', async () => {
            const testId = 'test-id-123';
            const updateData = { name: 'Updated' };
            const prismaError = new Error('Update failed');
            
            // Mock the update method to throw an error
            genericDAO.model.update.mockRejectedValue(prismaError);

            try {
                await genericDAO.update(testId, updateData);
            } catch (error) {
                // Error should be logged
            }

            // Verify that console.error was called with the expected format
            expect(consoleSpy).toHaveBeenCalledWith(
                'GenericDAO.update failed for TestModel:',
                expect.objectContaining({
                    error: 'Update failed',
                    id: testId,
                    updateDataKeys: ['name']
                })
            );
        });
    });

    describe('Edge cases and error scenarios', () => {
        it('should handle null/undefined parameters gracefully', async () => {
            const prismaError = new Error('Parameter validation failed');
            
            // Mock the findFirst method to throw an error
            genericDAO.model.findFirst.mockRejectedValue(prismaError);

            try {
                await genericDAO.findFirst(null, undefined);
            } catch (error) {
                expect(error.message).toContain('Failed to find first');
                expect(error.message).not.toContain('Parameter validation failed');
            }
        });

        it('should handle empty string parameters', async () => {
            const prismaError = new Error('Empty parameter error');
            
            // Mock the count method to throw an error
            genericDAO.model.count.mockRejectedValue(prismaError);

            try {
                await genericDAO.count('');
            } catch (error) {
                expect(error.message).toContain('Failed to count');
                expect(error.message).not.toContain('Empty parameter error');
            }
        });

        it('should handle very long parameter values', async () => {
            const longSubmissionID = 'a'.repeat(1000);
            const prismaError = new Error('Parameter too long');
            
            // Mock the findFirst method to throw an error
            genericDAO.model.findFirst.mockRejectedValue(prismaError);

            try {
                await genericDAO.findFirst(longSubmissionID, 'status');
            } catch (error) {
                expect(error.message).toContain('Failed to find first');
                expect(error.message).not.toContain('Parameter too long');
            }
        });
    });
}); 