const { AWSService } = require('../../services/aws-request');
const AWS = require('aws-sdk');
const config = require('../../config');

jest.mock('aws-sdk');
jest.mock('../../config', () => ({
    role_arn: 'arn:aws:iam::123456789012:role/test-role'
}));

describe('AWSService.createTempCredentials', () => {
    let awsService;
    let assumeRoleMock;

    beforeEach(() => {
        assumeRoleMock = jest.fn();
        AWS.STS.mockImplementation(() => ({
            assumeRole: assumeRoleMock
        }));
        awsService = new AWSService();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should resolve with credentials when assumeRole succeeds', async () => {
        const fakeCreds = {
            Credentials: {
                AccessKeyId: 'AKIA_TEST',
                SecretAccessKey: 'SECRET_TEST',
                SessionToken: 'TOKEN_TEST'
            }
        };
        assumeRoleMock.mockImplementation((params, cb) => cb(null, fakeCreds));

        const result = await awsService.createTempCredentials('my-bucket', 'my/path');
        expect(result).toEqual({
            accessKeyId: 'AKIA_TEST',
            secretAccessKey: 'SECRET_TEST',
            sessionToken: 'TOKEN_TEST'
        });

        expect(assumeRoleMock).toHaveBeenCalledWith(
            expect.objectContaining({
                RoleArn: config.role_arn,
                RoleSessionName: expect.stringMatching(/^Temp_Session_/),
                Policy: expect.any(String)
            }),
            expect.any(Function)
        );
        // Check policy structure
        const policyArg = JSON.parse(assumeRoleMock.mock.calls[0][0].Policy);
        expect(policyArg.Statement[0].Resource[0]).toBe('arn:aws:s3:::my-bucket/my/path/*');
    });

    it('should reject when assumeRole returns an error', async () => {
        const error = new Error('AssumeRole failed');
        assumeRoleMock.mockImplementation((params, cb) => cb(error, null));

        await expect(
            awsService.createTempCredentials('bucket', 'root')
        ).rejects.toThrow('AssumeRole failed');
    });
});