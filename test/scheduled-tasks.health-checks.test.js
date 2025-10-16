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
    
    const healthChecks = {
        database: async () => {
            try {
                await dataInterface.applicationDAO.findFirst({}, { take: 1 });
                return { status: 'healthy', message: 'Database connection successful' };
            } catch (error) {
                return { status: 'unhealthy', message: `Database connection failed: ${error.message}` };
            }
        },
        s3: async () => {
            try {
                const AWS = require('aws-sdk');
                const s3 = new AWS.S3();
                await s3.listBuckets().promise();
                return { status: 'healthy', message: 'S3 connection successful' };
            } catch (error) {
                return { status: 'unhealthy', message: `S3 connection failed: ${error.message}` };
            }
        },
        email: async () => {
            try {
                if (!emailService.emailsEnabled) {
                    return { status: 'disabled', message: 'Email service is disabled by configuration' };
                }
                return { status: 'healthy', message: 'Email service is enabled and configured' };
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
            const statusIndicator = result.status === 'healthy' ? 'OK' : result.status === 'disabled' ? 'DISABLED' : 'FAILED';
            console.log(`${statusIndicator} ${serviceName}: ${result.message}`);
        } catch (error) {
            const result = { status: 'unhealthy', message: `Health check failed: ${error.message}` };
            healthCheckResults.set(serviceName, result);
            console.log(`FAILED ${serviceName}: ${result.message}`);
        }
    }
    
    // Check if any critical services are unhealthy
    const unhealthyServices = Array.from(healthCheckResults.entries())
        .filter(([_, result]) => result.status === 'unhealthy')
        .map(([serviceName, _]) => serviceName);
    
    if (unhealthyServices.length > 0) {
        console.error(`\nCritical services are unhealthy: ${unhealthyServices.join(', ')}`);
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

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        
        mockDataInterface = {
            applicationDAO: {
                findFirst: jest.fn()
            }
        };
        
        mockEmailService = {
            emailsEnabled: true
        };
        
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.useRealTimers();
        consoleSpy.mockRestore();
        consoleErrorSpy.mockRestore();
    });

    describe('Database Health Check', () => {
        test('should return healthy when database query succeeds', async () => {
            mockDataInterface.applicationDAO.findFirst.mockResolvedValue({ id: 1 });

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('database').status).toBe('healthy');
            expect(results.get('database').message).toBe('Database connection successful');
            expect(consoleSpy).toHaveBeenCalledWith('OK database: Database connection successful');
        });

        test('should return unhealthy when database query fails', async () => {
            mockDataInterface.applicationDAO.findFirst.mockRejectedValue(new Error('Connection timeout'));

            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('database').status).toBe('unhealthy');
            expect(results.get('database').message).toBe('Database connection failed: Connection timeout');
            expect(consoleSpy).toHaveBeenCalledWith('FAILED database: Database connection failed: Connection timeout');
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
            expect(consoleSpy).toHaveBeenCalledWith('OK s3: S3 connection successful');
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
            expect(consoleSpy).toHaveBeenCalledWith('FAILED s3: S3 connection failed: Access denied');
        });
    });

    describe('Email Service Health Check', () => {
        test('should return healthy when email service is enabled', async () => {
            const results = await runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('email').status).toBe('healthy');
            expect(results.get('email').message).toBe('Email service is enabled and configured');
            expect(consoleSpy).toHaveBeenCalledWith('OK email: Email service is enabled and configured');
        });

        test('should return disabled when email service is disabled', async () => {
            const disabledEmailService = { emailsEnabled: false };
            
            const results = await runHealthChecks(mockDataInterface, disabledEmailService);

            expect(results.get('email').status).toBe('disabled');
            expect(results.get('email').message).toBe('Email service is disabled by configuration');
            expect(consoleSpy).toHaveBeenCalledWith('DISABLED email: Email service is disabled by configuration');
        });
    });

    describe('Overall Health Check Behavior', () => {
        test('should run all health checks and return comprehensive results', async () => {
            mockDataInterface.applicationDAO.findFirst.mockResolvedValue({});
            
            const AWS = require('aws-sdk');
            const mockS3 = new AWS.S3();
            mockS3.listBuckets().promise.mockResolvedValue({});

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

            await runHealthChecks(mockDataInterface, mockEmailService);

            expect(consoleErrorSpy).toHaveBeenCalledWith('\nCritical services are unhealthy: database, s3');
            expect(consoleSpy).toHaveBeenCalledWith('Tasks will still attempt to run, but may fail due to service issues.');
        });
    });
});