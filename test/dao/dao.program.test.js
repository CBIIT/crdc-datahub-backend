const ProgramDAO = require('../../dao/program');

// Mock Prisma
jest.mock('../../prisma', () => ({
    program: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        name: 'Program'
    },
}));

describe('ProgramDAO', () => {
    let programDAO;
    let mockOrganizationCollection;
    let mockPrisma;

    beforeEach(() => {
        mockOrganizationCollection = {
            findOne: jest.fn(),
            aggregate: jest.fn()
        };

        programDAO = new ProgramDAO(mockOrganizationCollection);
        
        // Override the organizationCollection property directly
        programDAO.organizationCollection = mockOrganizationCollection;
        
        // Get the mocked Prisma client
        mockPrisma = require('../../prisma');
        
        jest.clearAllMocks();
    });

    describe('getOrganizationByName', () => {
        const testCases = [
            // Basic functionality
            {
                name: 'should find organization with exact match',
                inputName: 'Cancer Research Program',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should find organization with case-insensitive match',
                inputName: 'cancer research program',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^cancer research program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should find organization with mixed case',
                inputName: 'CaNcEr ReSeArCh PrOgRaM',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^CaNcEr ReSeArCh PrOgRaM$', 'i') } },
                shouldFind: true
            },

            // Whitespace handling
            {
                name: 'should handle leading whitespace',
                inputName: '  Cancer Research Program',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle trailing whitespace',
                inputName: 'Cancer Research Program  ',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle multiple spaces between words',
                inputName: 'Cancer   Research   Program',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer   Research   Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle tabs',
                inputName: '\tCancer Research Program\t',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research Program$', 'i') } },
                shouldFind: true
            },

            // Special characters
            {
                name: 'should handle apostrophes',
                inputName: "Children's Cancer Research",
                dbName: "Children's Cancer Research",
                expectedQuery: { name: { $regex: new RegExp("^Children's Cancer Research$", 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle hyphens',
                inputName: 'Multi-Center Cancer Study',
                dbName: 'Multi-Center Cancer Study',
                expectedQuery: { name: { $regex: new RegExp('^Multi-Center Cancer Study$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle parentheses',
                inputName: 'Cancer Research (NIH Funded)',
                dbName: 'Cancer Research (NIH Funded)',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research (NIH Funded)$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle ampersands',
                inputName: 'Cancer & Immunology Research',
                dbName: 'Cancer & Immunology Research',
                expectedQuery: { name: { $regex: new RegExp('^Cancer & Immunology Research$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle periods',
                inputName: 'Dr. Smith Cancer Program',
                dbName: 'Dr. Smith Cancer Program',
                expectedQuery: { name: { $regex: new RegExp('^Dr. Smith Cancer Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle exclamation marks',
                inputName: 'Cancer Research Initiative!',
                dbName: 'Cancer Research Initiative!',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research Initiative!$', 'i') } },
                shouldFind: true
            },

            // Regex special characters that need escaping
            {
                name: 'should handle regex special characters - brackets',
                inputName: '[Cancer Research] Program',
                dbName: '[Cancer Research] Program',
                expectedQuery: { name: { $regex: new RegExp('^[Cancer Research] Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle regex special characters - braces',
                inputName: '{Cancer} Research Program',
                dbName: '{Cancer} Research Program',
                expectedQuery: { name: { $regex: new RegExp('^{Cancer} Research Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle regex special characters - pipe',
                inputName: 'Cancer Research|Immunology',
                dbName: 'Cancer Research|Immunology',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research|Immunology$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle regex special characters - question mark',
                inputName: 'Cancer Research? Program',
                dbName: 'Cancer Research? Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research? Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle regex special characters - plus',
                inputName: 'Cancer Research+ Program',
                dbName: 'Cancer Research+ Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research+ Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle regex special characters - asterisk',
                inputName: 'Cancer Research* Program',
                dbName: 'Cancer Research* Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research* Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle regex special characters - dollar sign',
                inputName: 'Cancer Research$ Program',
                dbName: 'Cancer Research$ Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research$ Program$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle regex special characters - caret',
                inputName: 'Cancer Research^ Program',
                dbName: 'Cancer Research^ Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research^ Program$', 'i') } },
                shouldFind: true
            },

            // Edge cases
            {
                name: 'should handle empty string',
                inputName: '',
                dbName: '',
                expectedQuery: { name: { $regex: new RegExp('^$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle only whitespace',
                inputName: '   ',
                dbName: '',
                expectedQuery: { name: { $regex: new RegExp('^$', 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle very long organization name',
                inputName: 'A'.repeat(500),
                dbName: 'A'.repeat(500),
                expectedQuery: { name: { $regex: new RegExp(`^${'A'.repeat(500)}$`, 'i') } },
                shouldFind: true
            },
            {
                name: 'should handle unicode characters',
                inputName: 'Cáncer Research Program™',
                dbName: 'Cáncer Research Program™',
                expectedQuery: { name: { $regex: new RegExp('^Cáncer Research Program™$', 'i') } },
                shouldFind: true
            },

            // No match cases
            {
                name: 'should not match partial name',
                inputName: 'Cancer',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer$', 'i') } },
                shouldFind: false
            },
            {
                name: 'should not match when partial match at end',
                inputName: 'Research Program',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Research Program$', 'i') } },
                shouldFind: false
            },
            {
                name: 'should not match when partial match in middle',
                inputName: 'Research',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Research$', 'i') } },
                shouldFind: false
            },
            {
                name: 'should not match completely different name',
                inputName: 'Diabetes Research',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Diabetes Research$', 'i') } },
                shouldFind: false
            },
            {
                name: 'should not match when name has extra characters',
                inputName: 'Cancer Research Program Extra',
                dbName: 'Cancer Research Program',
                expectedQuery: { name: { $regex: new RegExp('^Cancer Research Program Extra$', 'i') } },
                shouldFind: false
            }
        ];

        testCases.forEach(testCase => {
            it(testCase.name, async () => {
                // Setup mock
                const mockResult = testCase.shouldFind ? { 
                    id: 'org123', 
                    name: testCase.dbName,
                    studyProgramLeadName: 'Dr. Test',
                    studyProgramLeadEmail: 'test@example.com'
                } : null;
                
                mockPrisma.program.findFirst.mockResolvedValue(mockResult);

                // Execute
                const result = await programDAO.getOrganizationByName(testCase.inputName);

                // Verify query was called with expected parameters
                expect(mockPrisma.program.findFirst).toHaveBeenCalledWith({
                    where: { name: testCase.inputName?.trim() }
                });

                // Verify result
                if (testCase.shouldFind) {
                    expect(result).toEqual({ ...mockResult, _id: mockResult.id });
                } else {
                    expect(result).toBeNull();
                }
            });
        });

        // Edge case: null/undefined input
        it('should handle null input', async () => {
            mockPrisma.program.findFirst.mockResolvedValue(null);
            
            const result = await programDAO.getOrganizationByName(null);
            
            expect(mockPrisma.program.findFirst).toHaveBeenCalledWith({
                where: { name: undefined }
            });
            expect(result).toBeNull();
        });

        it('should handle undefined input', async () => {
            mockPrisma.program.findFirst.mockResolvedValue(null);
            
            const result = await programDAO.getOrganizationByName(undefined);
            
            expect(mockPrisma.program.findFirst).toHaveBeenCalledWith({
                where: { name: undefined }
            });
            expect(result).toBeNull();
        });

        // Error handling
        it('should handle database errors gracefully', async () => {
            const dbError = new Error('Database connection failed');
            mockPrisma.program.findFirst.mockRejectedValue(dbError);

            await expect(programDAO.getOrganizationByName('Test Program'))
                .rejects.toThrow('Failed to find first Program');
        });

        // Test - multiple concurrent calls
        it('should handle multiple rapid calls', async () => {
            const testNames = [
                'Cancer Research Program',
                'Diabetes Research Program',
                'Neurology Study Program',
                'Cardiology Research Program',
                'Immunology Study Program'
            ];

            mockPrisma.program.findFirst.mockResolvedValue({ 
                id: 'org123', 
                name: 'Test Program' 
            });

            const results = await Promise.all(testNames.map(name => 
                programDAO.getOrganizationByName(name)
            ));

            expect(mockPrisma.program.findFirst).toHaveBeenCalledTimes(testNames.length);
            expect(results).toHaveLength(testNames.length);
            expect(results.every(result => result._id === 'org123')).toBe(true);
        });

        // Integration-style test
        it('should work correctly with realistic organization names', async () => {
            const realisticNames = [
                "NIH Cancer Research Program",
                "Children's Hospital Oncology Research",
                "Multi-Center Lung Cancer Trial (MCLT)",
                "Breast Cancer Research Foundation",
                "American Cancer Society Research Program",
                "Stanford Cancer Institute",
                "MD Anderson Cancer Center Research"
            ];

            // Mock returning different results for each call
            let callCount = 0;
            mockPrisma.program.findFirst.mockImplementation(() => {
                callCount++;
                return Promise.resolve({ 
                    id: `org${callCount}`, 
                    name: realisticNames[callCount - 1]
                });
            });

            // Test each realistic name
            for (let i = 0; i < realisticNames.length; i++) {
                const result = await programDAO.getOrganizationByName(realisticNames[i]);
                
                expect(result).toEqual({
                    id: `org${i + 1}`,
                    name: realisticNames[i],
                    _id: `org${i + 1}`
                });
                
                expect(mockPrisma.program.findFirst).toHaveBeenCalledWith({
                    where: { name: realisticNames[i] }
                });
            }
        });
    });

    describe('getOrganizationByID', () => {
        it('should find organization by ID', async () => {
            const mockOrg = {
                id: 'org123',
                name: 'Test Organization',
                studyProgramLeadName: 'Dr. Test',
                studyProgramLeadEmail: 'test@example.com'
            };

            mockPrisma.program.findUnique.mockResolvedValue(mockOrg);

            const result = await programDAO.getOrganizationByID('org123');

            expect(mockPrisma.program.findUnique).toHaveBeenCalledWith({
                where: { id: 'org123' }
            });
            expect(result).toEqual({ ...mockOrg, _id: mockOrg.id });
        });

        it('should return null when organization not found', async () => {
            mockPrisma.program.findUnique.mockResolvedValue(null);

            const result = await programDAO.getOrganizationByID('nonexistent');

            expect(result).toBeNull();
        });

        it('should handle database errors', async () => {
            const dbError = new Error('Database connection failed');
            mockPrisma.program.findUnique.mockRejectedValue(dbError);

            await expect(programDAO.getOrganizationByID('org123'))
                .rejects.toThrow('Failed to find Program by ID');
        });
    });
});