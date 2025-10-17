const AWS = require('aws-sdk');

/**
 * Health Check Service
 * Provides health check functionality for external services used by scheduled tasks
 */
class HealthCheckService {
    constructor(s3Instance = null) {
        // Service display names mapping
        this.SERVICE_DISPLAY_NAMES = {
            database: 'MongoDB Database',
            s3: 'AWS S3 Storage',
            email: 'Amazon Simple Email Service (SES)'
        };

        // Health check timeout (10 seconds)
        this.HEALTH_CHECK_TIMEOUT = 10 * 1000;

        // Create reusable S3 instance to avoid creating new instances for each check
        // Allow dependency injection for testing
        this.s3 = s3Instance || new AWS.S3();
    }

    /**
     * Run health checks for all external services
     * @param {Object} dataInterface - Application service instance for database checks
     * @param {Object} emailService - Email service instance for connectivity checks
     * @returns {Promise<Map>} Map of service names to health check results
     */
    async runHealthChecks(dataInterface, emailService) {
        console.log('Running Health Checks');
        const healthCheckResults = new Map();
        
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
                    await this.s3.listBuckets().promise();
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
        
        for (const [serviceName, healthCheckFn] of Object.entries(healthChecks)) {
            try {
                const result = await Promise.race([
                    healthCheckFn(),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Health check timeout')), this.HEALTH_CHECK_TIMEOUT)
                    )
                ]);
                healthCheckResults.set(serviceName, result);
                this._logHealthCheckResult(serviceName, result);
            } catch (error) {
                const result = { status: 'unhealthy', message: `Health check failed: ${error.message}` };
                healthCheckResults.set(serviceName, result);
                const displayName = this.SERVICE_DISPLAY_NAMES[serviceName] || serviceName;
                console.error(`An error occurred while running the health check for ${displayName} connection: ${error.message}`);
            }
        }
        
        this._logHealthCheckSummary(healthCheckResults);
        console.log('Health Checks Complete');
        
        return healthCheckResults;
    }

    /**
     * Log individual health check result
     * @param {string} serviceName - Name of the service
     * @param {Object} result - Health check result
     * @private
     */
    _logHealthCheckResult(serviceName, result) {
        const displayName = this.SERVICE_DISPLAY_NAMES[serviceName] || serviceName;
        
        if (result.status === 'healthy') {
            console.log(`${displayName} connection is ${result.status}: ${result.message}`);
        } else if (result.status === 'disabled') {
            console.warn(`${displayName} connection is ${result.status}: ${result.message}`);
        } else {
            console.error(`${displayName} connection is unhealthy: ${result.message}`);
        }
    }

    /**
     * Log summary of health check results
     * @param {Map} healthCheckResults - Map of health check results
     * @private
     */
    _logHealthCheckSummary(healthCheckResults) {
        // Check if any critical services are unhealthy
        const unhealthyServices = Array.from(healthCheckResults.entries())
            .filter(([_, result]) => result.status === 'unhealthy')
            .map(([serviceName, _]) => this.SERVICE_DISPLAY_NAMES[serviceName] || serviceName);
        
        if (unhealthyServices.length > 0) {
            console.error(`Critical services are unhealthy: ${unhealthyServices.join(', ')}`);
            console.log('Tasks will still attempt to run, but may fail due to service issues.');
        }
    }

    /**
     * Get service display name
     * @param {string} serviceName - Internal service name
     * @returns {string} Display name for the service
     */
    getServiceDisplayName(serviceName) {
        return this.SERVICE_DISPLAY_NAMES[serviceName] || serviceName;
    }

    /**
     * Check if a service is healthy
     * @param {Map} healthCheckResults - Map of health check results
     * @param {string} serviceName - Name of the service to check
     * @returns {boolean} True if service is healthy, false otherwise
     */
    isServiceHealthy(healthCheckResults, serviceName) {
        const result = healthCheckResults.get(serviceName);
        return result ? result.status === 'healthy' : false;
    }

    /**
     * Get unhealthy services
     * @param {Map} healthCheckResults - Map of health check results
     * @returns {Array<string>} Array of unhealthy service display names
     */
    getUnhealthyServices(healthCheckResults) {
        return Array.from(healthCheckResults.entries())
            .filter(([_, result]) => result.status === 'unhealthy')
            .map(([serviceName, _]) => this.SERVICE_DISPLAY_NAMES[serviceName] || serviceName);
    }
}

module.exports = { HealthCheckService };
