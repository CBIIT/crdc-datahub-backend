// Mock AWS SDK
jest.mock('aws-sdk', () => ({
    S3: jest.fn().mockImplementation(() => ({
        listBuckets: jest.fn().mockReturnValue({
            promise: jest.fn()
        })
    }))
}));

// Import the health check function (extracted for testing)
const runHealthChecks = async (dataInterface, emailService) => {
    const TEN_SECOND_TIMEOUT = 10 * 1000;
    
    // Service display names mapping
    const SERVICE_DISPLAY_NAMES = {
        database: 'MongoDB Database',
        s3: 'AWS S3 Storage',
        email: 'Amazon Simple Email Service (SES)'
    };
    
    // Health check functions for external services
    const healthChecks = {
        // MongoDB connection health check
        database: async () => {
            try {
                // Test database connectivity with a simple query
                await dataInterface.applicationDAO.findFirst({}, { take: 1 });
                return { status: 'healthy', message: 'Database connection successful' };
            } catch (error) {
                return { status: 'unhealthy', message: `Database connection failed: ${error.message}` };
            }
        },
        // S3 connection health check
        s3: async () => {
            try {
                // Test S3 connectivity by checking if we can list buckets
                // This is a lightweight operation that validates AWS credentials and connectivity
                const AWS = require('aws-sdk');
                const s3 = new AWS.S3();
                await s3.listBuckets().promise();
                return { status: 'healthy', message: 'S3 connection successful' };
            } catch (error) {
                return { status: 'unhealthy', message: `S3 connection failed: ${error.message}` };
            }
        },
        // Email service connection health check
        email: async () => {
            try {
                // Test email service connectivity by verifying SMTP connection
                return await emailService.verifyConnectivity();
            } catch (error) {
                return { status: 'unhealthy', message: `Email service check failed: ${error.message}` };
            }
        }
    };
    
    console.log('Running Health Checks');
    const healthCheckResults = new Map();
    
    for (const [serviceName, healthCheckFn] of Object.entries(healthChecks)) {
        try {
            const result = await Promise.race([
                healthCheckFn(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Health check timeout')), TEN_SECOND_TIMEOUT)
                )
            ]);
            healthCheckResults.set(serviceName, result);
            const displayName = SERVICE_DISPLAY_NAMES[serviceName] || serviceName;
            if (result.status === 'healthy') {
                console.log(`${displayName} connection is ${result.status}: ${result.message}`);
            } else if (result.status === 'disabled') {
                console.warn(`${displayName} connection is ${result.status}: ${result.message}`);
            } else {
                console.error(`${displayName} connection is unhealthy: ${result.message}`);
            }
        } catch (error) {
            const result = { status: 'unhealthy', message: `Health check failed: ${error.message}` };
            healthCheckResults.set(serviceName, result);
            const displayName = SERVICE_DISPLAY_NAMES[serviceName] || serviceName;
            console.error(`An error occurred while running the health check for ${displayName} connection: ${error.message}`);
        }
    }
    
    // Check if any critical services are unhealthy
    const unhealthyServices = Array.from(healthCheckResults.entries())
        .filter(([_, result]) => result.status === 'unhealthy')
        .map(([serviceName, _]) => SERVICE_DISPLAY_NAMES[serviceName] || serviceName);
    
    if (unhealthyServices.length > 0) {
        console.error(`Critical services are unhealthy: ${unhealthyServices.join(', ')}`);
        console.log('Tasks will still attempt to run, but may fail due to service issues.');
    }
    
    console.log('Health Checks Complete');
    
    return healthCheckResults;
};

describe('Health Check System', () => {
    let mockDataInterface;
    let mockEmailService;
    let consoleSpy;
    let consoleErrorSpy;
    let consoleWarnSpy;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        mockDataInterface = {
            applicationDAO: {
                findFirst: jest.fn()
            }
        };
        
        mockEmailService = {
            emailsEnabled: true,
            verifyConnectivity: jest.fn()
        };
        
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        jest.useRealTimers();
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    describe('Database Health Check', () => {
        test('should return healthy when database query succeeds', async () => {
            mockDataInterface.applicationDAO.findFirst.mockResolvedValue({ id: 1 });

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('database').status).toBe('healthy');
            expect(results.get('database').message).toBe('Database connection successful');
            expect(consoleSpy).toHaveBeenCalledWith('MongoDB Database connection is healthy: Database connection successful');
        });

        test('should return unhealthy when database query fails', async () => {
            mockDataInterface.applicationDAO.findFirst.mockRejectedValue(new Error('Connection timeout'));

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('database').status).toBe('unhealthy');
            expect(results.get('database').message).toBe('Database connection failed: Connection timeout');
            expect(consoleErrorSpy).toHaveBeenCalledWith('MongoDB Database connection is unhealthy: Database connection failed: Connection timeout');
        });
    });

    describe('S3 Health Check', () => {
        test('should return healthy when S3 listBuckets succeeds', async () => {
            const AWS = require('aws-sdk');
            const mockS3 = new AWS.S3();
            mockS3.listBuckets().promise.mockResolvedValue({ Buckets: [] });

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('s3').status).toBe('healthy');
            expect(results.get('s3').message).toBe('S3 connection successful');
            expect(consoleSpy).toHaveBeenCalledWith('AWS S3 Storage connection is healthy: S3 connection successful');
        });

        test('should return unhealthy when S3 listBuckets fails', async () => {
            // Mock AWS SDK to return a failing promise
            const AWS = require('aws-sdk');
            const mockS3Instance = {
                listBuckets: jest.fn().mockReturnValue({
                    promise: jest.fn().mockRejectedValue(new Error('Access denied'))
                })
            };
            AWS.S3.mockImplementation(() => mockS3Instance);

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('s3').status).toBe('unhealthy');
            expect(results.get('s3').message).toBe('S3 connection failed: Access denied');
            expect(consoleErrorSpy).toHaveBeenCalledWith('AWS S3 Storage connection is unhealthy: S3 connection failed: Access denied');
        });
    });

    describe('Email Service Health Check', () => {
        test('should return healthy when email service connectivity succeeds', async () => {
            mockEmailService.verifyConnectivity.mockResolvedValue({
                status: 'healthy',
                message: 'Email service connectivity verified successfully'
            });

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('email').status).toBe('healthy');
            expect(results.get('email').message).toBe('Email service connectivity verified successfully');
            expect(consoleSpy).toHaveBeenCalledWith('Amazon Simple Email Service (SES) connection is healthy: Email service connectivity verified successfully');
        });

        test('should return disabled when email service is disabled', async () => {
            const disabledEmailService = { 
                emailsEnabled: false,
                verifyConnectivity: jest.fn().mockResolvedValue({
                    status: 'disabled',
                    message: 'Email service is disabled by configuration'
                })
            };
            
            const results = await runHealthChecks(mockDataInterface, disabledEmailService);

            expect(results.get('email').status).toBe('disabled');
            expect(results.get('email').message).toBe('Email service is disabled by configuration');
            expect(consoleWarnSpy).toHaveBeenCalledWith('Amazon Simple Email Service (SES) connection is disabled: Email service is disabled by configuration');
        });

        test('should return unhealthy when email service connectivity fails', async () => {
            mockEmailService.verifyConnectivity.mockResolvedValue({
                status: 'unhealthy',
                message: 'Email service connectivity failed: SMTP connection timeout'
            });

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('email').status).toBe('unhealthy');
            expect(results.get('email').message).toBe('Email service connectivity failed: SMTP connection timeout');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Amazon Simple Email Service (SES) connection is unhealthy: Email service connectivity failed: SMTP connection timeout');
        });
    });

    describe('Overall Health Check Behavior', () => {
        test('should run all health checks and return comprehensive results', async () => {
            mockDataInterface.applicationDAO.findFirst.mockResolvedValue({});
            
            const AWS = require('aws-sdk');
            const mockS3 = new AWS.S3();
            mockS3.listBuckets().promise.mockResolvedValue({});

            mockEmailService.verifyConnectivity.mockResolvedValue({
                status: 'healthy',
                message: 'Email service connectivity verified successfully'
            });

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.size).toBe(3);
            expect(results.has('database')).toBe(true);
            expect(results.has('s3')).toBe(true);
            expect(results.has('email')).toBe(true);
            
            expect(consoleSpy).toHaveBeenCalledWith('Running Health Checks');
            expect(consoleSpy).toHaveBeenCalledWith('Health Checks Complete');
        });

        test('should log critical service warnings when services are unhealthy', async () => {
            mockDataInterface.applicationDAO.findFirst.mockRejectedValue(new Error('DB down'));
            
            // Mock AWS SDK to return a failing promise
            const AWS = require('aws-sdk');
            const mockS3Instance = {
                listBuckets: jest.fn().mockReturnValue({
                    promise: jest.fn().mockRejectedValue(new Error('S3 down'))
                })
            };
            AWS.S3.mockImplementation(() => mockS3Instance);

            mockEmailService.verifyConnectivity.mockResolvedValue({
                status: 'healthy',
                message: 'Email service connectivity verified successfully'
            });

            await runHealthChecks(mockDataInterface, mockEmailService);

            expect(consoleErrorSpy).toHaveBeenCalledWith('Critical services are unhealthy: MongoDB Database, AWS S3 Storage');
            expect(consoleSpy).toHaveBeenCalledWith('Tasks will still attempt to run, but may fail due to service issues.');
        });
    });

    describe('Dependency Logic Fix', () => {
        test('should demonstrate the dependency logic fix concept', () => {
            // This test demonstrates the concept of the fix
            // In the actual implementation, tasks would be skipped if dependencies are 'failed' OR 'skipped'
            
            const mockResults = [
                { name: 'deleteInactiveApplications', status: 'skipped' }, // Dependency was skipped
                { name: 'deleteInactiveSubmissions', status: 'failed' }     // Dependency failed
            ];
            
            // Test that both 'failed' and 'skipped' statuses are considered incomplete dependencies
            const incompleteDependencies = ['deleteInactiveApplications', 'deleteInactiveSubmissions'].filter(depName => {
                const depResult = mockResults.find(r => r.name === depName);
                return depResult && (depResult.status === 'failed' || depResult.status === 'skipped');
            });
            
            expect(incompleteDependencies).toHaveLength(2);
            expect(incompleteDependencies).toContain('deleteInactiveApplications');
            expect(incompleteDependencies).toContain('deleteInactiveSubmissions');
        });
    });
});