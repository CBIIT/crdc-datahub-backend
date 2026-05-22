describe('bin/www.js startup', () => {
    let mockOrchestrateMigration;
    let mockCreateServer;
    let mockServer;

    const originalEnv = process.env;

    const flushPromises = () => new Promise(resolve => setImmediate(resolve));

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();

        process.env = { ...originalEnv };

        // Suppress console output during tests
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'debug').mockImplementation(() => {});
        jest.spyOn(process, 'exit').mockImplementation(() => {});

        mockOrchestrateMigration = jest.fn().mockResolvedValue({ success: true });

        mockServer = {
            listen: jest.fn(),
            on: jest.fn()
        };
        mockCreateServer = jest.fn(() => mockServer);

        jest.doMock('http', () => ({
            createServer: mockCreateServer
        }));

        jest.doMock('../../app', () => ({
            set: jest.fn()
        }));

        jest.doMock('../../documentation/3-6-0/3-6-0-migration', () => ({
            orchestrateMigration: mockOrchestrateMigration
        }));
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    async function requireWww() {
        require('../../bin/www');
        await flushPromises();
    }

    describe('SKIP_STARTUP_MIGRATIONS parsing', () => {
        it('should skip migrations when set to "true"', async () => {
            process.env.SKIP_STARTUP_MIGRATIONS = 'true';
            await requireWww();
            expect(mockOrchestrateMigration).not.toHaveBeenCalled();
        });

        it('should skip migrations when set to "TRUE" (case insensitive)', async () => {
            process.env.SKIP_STARTUP_MIGRATIONS = 'TRUE';
            await requireWww();
            expect(mockOrchestrateMigration).not.toHaveBeenCalled();
        });

        it('should skip migrations when set to "True" (mixed case)', async () => {
            process.env.SKIP_STARTUP_MIGRATIONS = 'True';
            await requireWww();
            expect(mockOrchestrateMigration).not.toHaveBeenCalled();
        });

        it('should NOT skip migrations when set to "false"', async () => {
            process.env.SKIP_STARTUP_MIGRATIONS = 'false';
            await requireWww();
            expect(mockOrchestrateMigration).toHaveBeenCalled();
        });

        it('should NOT skip migrations when set to an empty string', async () => {
            process.env.SKIP_STARTUP_MIGRATIONS = '';
            await requireWww();
            expect(mockOrchestrateMigration).toHaveBeenCalled();
        });

        it('should NOT skip migrations when unset', async () => {
            delete process.env.SKIP_STARTUP_MIGRATIONS;
            await requireWww();
            expect(mockOrchestrateMigration).toHaveBeenCalled();
        });
    });

    describe('Non-blocking migration failure', () => {
        beforeEach(() => {
            delete process.env.SKIP_STARTUP_MIGRATIONS;
        });

        it('should start server when migration returns success: false', async () => {
            mockOrchestrateMigration.mockResolvedValue({ success: false });

            await requireWww();

            expect(process.exit).not.toHaveBeenCalled();
            expect(mockCreateServer).toHaveBeenCalled();
        });

        it('should log an error when migration returns success: false', async () => {
            mockOrchestrateMigration.mockResolvedValue({ success: false });

            await requireWww();

            expect(console.error).toHaveBeenCalledWith(
                'Some data migrations failed, please check the logs for details.'
            );
        });

        it('should start server when migration throws an error', async () => {
            mockOrchestrateMigration.mockRejectedValue(new Error('Migration crashed'));

            await requireWww();

            expect(process.exit).not.toHaveBeenCalled();
            expect(mockCreateServer).toHaveBeenCalled();
        });

        it('should log an error when migration throws', async () => {
            const migrationError = new Error('Migration crashed');
            mockOrchestrateMigration.mockRejectedValue(migrationError);

            await requireWww();

            expect(console.error).toHaveBeenCalledWith(
                'An error occurred during data migration:', migrationError
            );
        });

        it('should start server normally when migration succeeds', async () => {
            mockOrchestrateMigration.mockResolvedValue({ success: true });

            await requireWww();

            expect(process.exit).not.toHaveBeenCalled();
            expect(mockCreateServer).toHaveBeenCalled();
            expect(mockServer.listen).toHaveBeenCalled();
        });
    });
});
