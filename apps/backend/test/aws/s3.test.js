const {S3Service} = require("../../services/s3-service");

// Mock AWS SDK
jest.mock('aws-sdk', () => {
    const mockS3 = {
        getSignedUrl: jest.fn(),
        upload: jest.fn(),
        getObject: jest.fn()
    };
    
    return {
        S3: jest.fn(() => mockS3)
    };
});

describe('S3 Service Tests', () => {

    let s3Service;
    let mockS3;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        
        // Get the mocked S3 instance
        const AWS = require('aws-sdk');
        mockS3 = new AWS.S3();
        
        s3Service = new S3Service();
    });

    test("should create pre-signed URL for upload", async () => {
        const mockUrl = 'https://mock-s3-url.com/upload';
        mockS3.getSignedUrl.mockImplementation((operation, params, callback) => {
            expect(operation).toBe('putObject');
            expect(params.Bucket).toBe('test-bucket');
            expect(params.Key).toBe('test-prefix/test.txt');
            expect(params.Expires).toBe(3600);
            expect(params.ACL).toBe('private');
            expect(params.ContentType).toBe('text/tab-separated-values');
            expect(params.ContentDisposition).toBe('attachment; filename="test.txt"');
            
            // Simulate successful callback
            callback(null, mockUrl);
        });

        const preSignedURL = await s3Service.createPreSignedURL("test-bucket", "test-prefix", "test.txt");
        
        expect(preSignedURL).toBe(mockUrl);
        expect(mockS3.getSignedUrl).toHaveBeenCalledTimes(1);
    });

    test("should create pre-signed URL for download", async () => {
        const mockUrl = 'https://mock-s3-url.com/download';
        mockS3.getSignedUrl.mockImplementation((operation, params, callback) => {
            expect(operation).toBe('getObject');
            expect(params.Bucket).toBe('test-bucket');
            expect(params.Key).toBe('test-prefix/test.txt');
            expect(params.Expires).toBe(3600);
            expect(params.ResponseContentDisposition).toBe('attachment; filename ="test.txt"');
            
            // Simulate successful callback
            callback(null, mockUrl);
        });

        const preSignedURL = await s3Service.createDownloadSignedURL("test-bucket", "test-prefix", "test.txt");
        
        expect(preSignedURL).toBe(mockUrl);
        expect(mockS3.getSignedUrl).toHaveBeenCalledTimes(1);
    });
});