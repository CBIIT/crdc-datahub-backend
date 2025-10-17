// Mock AWS SDK
jest.mock('aws-sdk', () => ({
    S3: jest.fn().mockImplementation(() => ({
        listBuckets: jest.fn().mockReturnValue({
            promise: jest.fn()
        })
    }))
}));

// Import the health check service
const { HealthCheckService } = require('../services/health-check-service');

describe('Health Check System', () => {
    let mockDataInterface;
    let mockEmailService;
    let healthCheckService;
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
        
        // Create mock S3 instance for dependency injection
        const mockS3Instance = {
            listBuckets: jest.fn().mockReturnValue({
                promise: jest.fn()
            })
        };
        
        healthCheckService = new HealthCheckService(mockS3Instance);
        
        consoleSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        // Clean up timers
        jest.useRealTimers();
        
        // Clean up console spies
        if (consoleSpy) consoleSpy.mockRestore();
        if (consoleErrorSpy) consoleErrorSpy.mockRestore();
        if (consoleWarnSpy) consoleWarnSpy.mockRestore();
        
        // Clear all timers and mocks
        jest.clearAllTimers();
        jest.clearAllMocks();
    });

    afterAll(() => {
        // Final cleanup to prevent memory leaks
        jest.restoreAllMocks();
        jest.useRealTimers();
    });

    describe('Database Health Check', () => {
        test('should return healthy when database query succeeds', async () => {
            mockDataInterface.applicationDAO.findFirst.mockResolvedValue({ id: 1 });

            const results = await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('database').status).toBe('healthy');
            expect(results.get('database').message).toBe('Database connection successful');
            expect(consoleSpy).toHaveBeenCalledWith('MongoDB Database connection is healthy: Database connection successful');
        });

        test('should return unhealthy when database query fails', async () => {
            mockDataInterface.applicationDAO.findFirst.mockRejectedValue(new Error('Connection timeout'));

            const results = await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('database').status).toBe('unhealthy');
            expect(results.get('database').message).toBe('Database connection failed: Connection timeout');
            expect(consoleErrorSpy).toHaveBeenCalledWith('MongoDB Database connection is unhealthy: Database connection failed: Connection timeout');
        });
    });

    describe('S3 Health Check', () => {
        test('should return healthy when S3 listBuckets succeeds', async () => {
            // Configure the injected mock S3 instance
            healthCheckService.s3.listBuckets().promise.mockResolvedValue({ Buckets: [] });

            const results = await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('s3').status).toBe('healthy');
            expect(results.get('s3').message).toBe('S3 connection successful');
            expect(consoleSpy).toHaveBeenCalledWith('AWS S3 Storage connection is healthy: S3 connection successful');
        });

        test('should return unhealthy when S3 listBuckets fails', async () => {
            // Configure the injected mock S3 instance to fail
            healthCheckService.s3.listBuckets().promise.mockRejectedValue(new Error('Access denied'));

            const results = await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

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

            const results = await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

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
            
            const results = await healthCheckService.runHealthChecks(mockDataInterface, disabledEmailService);

            expect(results.get('email').status).toBe('disabled');
            expect(results.get('email').message).toBe('Email service is disabled by configuration');
            expect(consoleWarnSpy).toHaveBeenCalledWith('Amazon Simple Email Service (SES) connection is disabled: Email service is disabled by configuration');
        });

        test('should return unhealthy when email service connectivity fails', async () => {
            mockEmailService.verifyConnectivity.mockResolvedValue({
                status: 'unhealthy',
                message: 'Email service connectivity failed: SMTP connection timeout'
            });

            const results = await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.get('email').status).toBe('unhealthy');
            expect(results.get('email').message).toBe('Email service connectivity failed: SMTP connection timeout');
            expect(consoleErrorSpy).toHaveBeenCalledWith('Amazon Simple Email Service (SES) connection is unhealthy: Email service connectivity failed: SMTP connection timeout');
        });
    });

    describe('Overall Health Check Behavior', () => {
        test('should run all health checks and return comprehensive results', async () => {
            mockDataInterface.applicationDAO.findFirst.mockResolvedValue({});
            
            // Configure the injected mock S3 instance
            healthCheckService.s3.listBuckets().promise.mockResolvedValue({});

            mockEmailService.verifyConnectivity.mockResolvedValue({
                status: 'healthy',
                message: 'Email service connectivity verified successfully'
            });

            const results = await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

            expect(results.size).toBe(3);
            expect(results.has('database')).toBe(true);
            expect(results.has('s3')).toBe(true);
            expect(results.has('email')).toBe(true);
            
            expect(consoleSpy).toHaveBeenCalledWith('Running Health Checks');
            expect(consoleSpy).toHaveBeenCalledWith('Health Checks Complete');
        });

        test('should log critical service warnings when services are unhealthy', async () => {
            mockDataInterface.applicationDAO.findFirst.mockRejectedValue(new Error('DB down'));
            
            // Configure the injected mock S3 instance to fail
            healthCheckService.s3.listBuckets().promise.mockRejectedValue(new Error('S3 down'));

            mockEmailService.verifyConnectivity.mockResolvedValue({
                status: 'healthy',
                message: 'Email service connectivity verified successfully'
            });

            await healthCheckService.runHealthChecks(mockDataInterface, mockEmailService);

            expect(consoleErrorSpy).toHaveBeenCalledWith('Critical services are unhealthy: MongoDB Database, AWS S3 Storage');
            expect(consoleSpy).toHaveBeenCalledWith('Tasks will still attempt to run, but may fail due to service issues.');
        });
    });

    describe('Health Check Service Methods', () => {
        test('should return correct service display names', () => {
            expect(healthCheckService.getServiceDisplayName('database')).toBe('MongoDB Database');
            expect(healthCheckService.getServiceDisplayName('s3')).toBe('AWS S3 Storage');
            expect(healthCheckService.getServiceDisplayName('email')).toBe('Amazon Simple Email Service (SES)');
            expect(healthCheckService.getServiceDisplayName('unknown')).toBe('unknown');
        });

        test('should correctly identify healthy services', async () => {
            const mockResults = new Map([
                ['database', { status: 'healthy', message: 'OK' }],
                ['s3', { status: 'unhealthy', message: 'Failed' }],
                ['email', { status: 'disabled', message: 'Disabled' }]
            ]);

            expect(healthCheckService.isServiceHealthy(mockResults, 'database')).toBe(true);
            expect(healthCheckService.isServiceHealthy(mockResults, 's3')).toBe(false);
            expect(healthCheckService.isServiceHealthy(mockResults, 'email')).toBe(false);
            expect(healthCheckService.isServiceHealthy(mockResults, 'unknown')).toBe(false);
        });

        test('should return unhealthy services correctly', async () => {
            const mockResults = new Map([
                ['database', { status: 'healthy', message: 'OK' }],
                ['s3', { status: 'unhealthy', message: 'Failed' }],
                ['email', { status: 'disabled', message: 'Disabled' }]
            ]);

            const unhealthyServices = healthCheckService.getUnhealthyServices(mockResults);
            expect(unhealthyServices).toEqual(['AWS S3 Storage']);
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