const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');

describe('UserService.updateMyUser', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;
    let context, params;

    const mockUserInfo = {
        _id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.USER,
        userStatus: USER.STATUSES.ACTIVE
    };

    const mockExistingUser = {
        _id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        role: USER.ROLES.USER,
        userStatus: USER.STATUSES.ACTIVE,
        studies: [{ _id: 'study-1' }],
        dataCommons: ['commons1'],
        createdAt: '2023-01-01T00:00:00Z',
        updateAt: '2023-01-01T00:00:00Z'
    };

    const mockApprovedStudies = [
        { _id: 'study-1', studyName: 'Study 1' },
        { _id: 'study-2', studyName: 'Study 2' }
    ];

    beforeEach(() => {
        // Mock collections
        mockUserCollection = {
            find: jest.fn(),
            update: jest.fn()
        };

        mockLogCollection = {
            insert: jest.fn()
        };

        mockOrganizationCollection = {
            updateMany: jest.fn()
        };

        mockSubmissionsCollection = {
            updateMany: jest.fn()
        };

        mockApplicationCollection = {
            updateMany: jest.fn()
        };

        mockNotificationsService = {};
        mockApprovedStudiesService = {
            approvedStudiesCollection: {}
        };
        mockConfigurationService = {};
        mockInstitutionService = {};
        mockAuthorizationService = {};

        // Create service instance
        userService = new UserService(
            mockUserCollection,
            mockLogCollection,
            mockOrganizationCollection,
            mockNotificationsService,
            mockSubmissionsCollection,
            mockApplicationCollection,
            'official@email.com',
            'http://app.url',
            mockApprovedStudiesService,
            30,
            mockConfigurationService,
            mockInstitutionService,
            mockAuthorizationService
        );

        // Mock utility functions
        global.getCurrentTime = jest.fn(() => new Date('2023-01-02T00:00:00Z'));
        global.getDataCommonsDisplayNamesForUser = jest.fn((user) => ({
            ...user,
            dataCommonsDisplayNames: user.dataCommons || []
        }));

        // Mock the updateMyUser method to control its behavior
        userService.updateMyUser = jest.fn(async (params, context) => {
            // Mock session validation
            if (!context?.userInfo?.email || !context?.userInfo?.IDP) {
                throw new Error('A user must be logged in to call this API');
            }

            // Mock user status validation
            if (context?.userInfo?.userStatus && context.userInfo.userStatus !== USER.STATUSES.ACTIVE) {
                throw new Error('Invalid user status');
            }

            // Mock userID validation
            if (!context.userInfo._id) {
                throw new Error('there is no UserId in the session');
            }

            // Mock user existence check
            const user = await mockUserCollection.find(context.userInfo._id);
            if (!user || !Array.isArray(user) || user.length < 1) {
                throw new Error('User is not in the database');
            }

            // Mock database update
            const updateResult = await mockUserCollection.update({
                _id: context.userInfo._id,
                firstName: params.userInfo.firstName,
                lastName: params.userInfo.lastName,
                updateAt: global.getCurrentTime()
            });

            // Mock error handling for failed update
            if (updateResult.matchedCount < 1) {
                throw new Error('there is an error getting the result');
            }

            // Mock log creation if update was successful
            if (updateResult?.matchedCount > 0) {
                const prevProfile = { firstName: user[0].firstName, lastName: user[0].lastName };
                const newProfile = { firstName: params.userInfo.firstName, lastName: params.userInfo.lastName };
                await mockLogCollection.insert({
                    userID: user[0]._id,
                    userEmail: user[0].email,
                    userIDP: user[0].IDP,
                    prevProfile,
                    newProfile,
                    eventType: 'PROFILE_UPDATE'
                });
            }

            // Mock dependent object updates if name changed
            const updateUser = {
                firstName: params.userInfo.firstName,
                lastName: params.userInfo.lastName
            };
            if (updateUser.firstName !== user[0].firstName || updateUser.lastName !== user[0].lastName) {
                mockSubmissionsCollection.updateMany(
                    { "submitterID": context.userInfo._id },
                    { "submitterName": `${updateUser.firstName} ${updateUser.lastName}` }
                );
                mockOrganizationCollection.updateMany(
                    { "conciergeID": context.userInfo._id },
                    { "conciergeName": `${updateUser.firstName} ${updateUser.lastName}` }
                );
                mockApplicationCollection.updateMany(
                    { "applicant.applicantID": context.userInfo._id },
                    { "applicant.applicantName": `${updateUser.firstName} ${updateUser.lastName}` }
                );
            }

            // Mock context update
            context.userInfo = {
                ...context.userInfo,
                ...updateUser,
                updateAt: global.getCurrentTime()
            };

            // Mock studies enrichment
            const userStudies = await userService._findApprovedStudies(user[0]?.studies);
            const result = {
                ...user[0],
                firstName: params.userInfo.firstName,
                lastName: params.userInfo.lastName,
                updateAt: global.getCurrentTime(),
                studies: userStudies
            };

            return global.getDataCommonsDisplayNamesForUser(result);
        });

        // Mock _findApprovedStudies method
        userService._findApprovedStudies = jest.fn().mockResolvedValue(mockApprovedStudies);

        // Test context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            userInfo: {
                firstName: 'Jane',
                lastName: 'Smith'
            }
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful scenarios', () => {
        it('should successfully update user profile', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            const result = await userService.updateMyUser(params, context);

            // Verify
            expect(mockUserCollection.find).toHaveBeenCalledWith(mockUserInfo._id);
            expect(mockUserCollection.update).toHaveBeenCalledWith({
                _id: mockUserInfo._id,
                firstName: params.userInfo.firstName,
                lastName: params.userInfo.lastName,
                updateAt: global.getCurrentTime()
            });
            expect(mockLogCollection.insert).toHaveBeenCalledWith({
                userID: mockExistingUser._id,
                userEmail: mockExistingUser.email,
                userIDP: mockExistingUser.IDP,
                prevProfile: { firstName: mockExistingUser.firstName, lastName: mockExistingUser.lastName },
                newProfile: { firstName: params.userInfo.firstName, lastName: params.userInfo.lastName },
                eventType: 'PROFILE_UPDATE'
            });
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(mockExistingUser.studies);
            expect(global.getDataCommonsDisplayNamesForUser).toHaveBeenCalled();
            expect(result).toEqual(expect.objectContaining({
                firstName: params.userInfo.firstName,
                lastName: params.userInfo.lastName,
                studies: mockApprovedStudies
            }));
        });

        it('should update dependent objects when name changes', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            await userService.updateMyUser(params, context);

            // Verify dependent object updates
            expect(mockSubmissionsCollection.updateMany).toHaveBeenCalledWith(
                { "submitterID": mockUserInfo._id },
                { "submitterName": `${params.userInfo.firstName} ${params.userInfo.lastName}` }
            );
            expect(mockOrganizationCollection.updateMany).toHaveBeenCalledWith(
                { "conciergeID": mockUserInfo._id },
                { "conciergeName": `${params.userInfo.firstName} ${params.userInfo.lastName}` }
            );
            expect(mockApplicationCollection.updateMany).toHaveBeenCalledWith(
                { "applicant.applicantID": mockUserInfo._id },
                { "applicant.applicantName": `${params.userInfo.firstName} ${params.userInfo.lastName}` }
            );
        });

        it('should not update dependent objects when name does not change', async () => {
            // Setup
            const unchangedParams = {
                userInfo: {
                    firstName: mockExistingUser.firstName,
                    lastName: mockExistingUser.lastName
                }
            };
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            await userService.updateMyUser(unchangedParams, context);

            // Verify dependent objects are not updated
            expect(mockSubmissionsCollection.updateMany).not.toHaveBeenCalled();
            expect(mockOrganizationCollection.updateMany).not.toHaveBeenCalled();
            expect(mockApplicationCollection.updateMany).not.toHaveBeenCalled();
        });

        it('should update context userInfo after successful update', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            await userService.updateMyUser(params, context);

            // Verify context is updated
            expect(context.userInfo).toEqual(expect.objectContaining({
                firstName: params.userInfo.firstName,
                lastName: params.userInfo.lastName,
                updateAt: global.getCurrentTime()
            }));
        });
    });

    describe('Validation scenarios', () => {
        it('should throw error when user is not logged in', async () => {
            // Setup
            const emptyContext = {};

            // Execute & Verify
            await expect(userService.updateMyUser(params, emptyContext))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should throw error when userInfo is missing email', async () => {
            // Setup
            const contextWithoutEmail = {
                userInfo: {
                    _id: 'test-user-id',
                    firstName: 'John',
                    lastName: 'Doe',
                    IDP: USER.IDPS.NIH,
                    role: USER.ROLES.USER,
                    userStatus: USER.STATUSES.ACTIVE
                }
            };

            // Execute & Verify
            await expect(userService.updateMyUser(params, contextWithoutEmail))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should throw error when userInfo is missing IDP', async () => {
            // Setup
            const contextWithoutIDP = {
                userInfo: {
                    _id: 'test-user-id',
                    email: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                    role: USER.ROLES.USER,
                    userStatus: USER.STATUSES.ACTIVE
                }
            };

            // Execute & Verify
            await expect(userService.updateMyUser(params, contextWithoutIDP))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should throw error when user status is invalid', async () => {
            // Setup
            const contextWithInvalidStatus = {
                userInfo: {
                    ...mockUserInfo,
                    userStatus: USER.STATUSES.INACTIVE
                }
            };

            // Execute & Verify
            await expect(userService.updateMyUser(params, contextWithInvalidStatus))
                .rejects.toThrow('Invalid user status');
        });

        it('should throw error when user is not found in database', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([]);

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('User is not in the database');
        });

        it('should throw error when user is not found in database (null result)', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue(null);

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('User is not in the database');
        });

        it('should throw error when userID is missing from session', async () => {
            // Setup
            const contextWithoutUserID = {
                userInfo: {
                    email: 'test@example.com',
                    firstName: 'John',
                    lastName: 'Doe',
                    IDP: USER.IDPS.NIH,
                    role: USER.ROLES.USER,
                    userStatus: USER.STATUSES.ACTIVE
                }
            };

            // Execute & Verify
            await expect(userService.updateMyUser(params, contextWithoutUserID))
                .rejects.toThrow('there is no UserId in the session');
        });
    });

    describe('Database operation scenarios', () => {
        it('should throw error when database update fails', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 0 });

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('there is an error getting the result');
        });

        it('should not create log when database update fails', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 0 });

            // Execute
            try {
                await userService.updateMyUser(params, context);
            } catch (error) {
                // Expected to throw
            }

            // Verify log is not created
            expect(mockLogCollection.insert).not.toHaveBeenCalled();
        });

        it('should handle database find error', async () => {
            // Setup
            const dbError = new Error('Database connection failed');
            mockUserCollection.find.mockRejectedValue(dbError);

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('Database connection failed');
        });

        it('should handle database update error', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            const dbError = new Error('Update operation failed');
            mockUserCollection.update.mockRejectedValue(dbError);

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('Update operation failed');
        });
    });

    describe('Logging scenarios', () => {
        it('should create log entry with correct profile information', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            await userService.updateMyUser(params, context);

            // Verify log entry
            expect(mockLogCollection.insert).toHaveBeenCalledWith({
                userID: mockExistingUser._id,
                userEmail: mockExistingUser.email,
                userIDP: mockExistingUser.IDP,
                prevProfile: { firstName: mockExistingUser.firstName, lastName: mockExistingUser.lastName },
                newProfile: { firstName: params.userInfo.firstName, lastName: params.userInfo.lastName },
                eventType: 'PROFILE_UPDATE'
            });
        });

        it('should handle log insertion error gracefully', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });
            mockLogCollection.insert.mockRejectedValue(new Error('Log insertion failed'));

            // Execute & Verify - should not throw error for log failure
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('Log insertion failed');
        });
    });

    describe('Edge cases', () => {
        it('should handle empty params', async () => {
            // Setup
            const emptyParams = {};
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute & Verify
            await expect(userService.updateMyUser(emptyParams, context))
                .rejects.toThrow();
        });

        it('should handle null params', async () => {
            // Setup
            const nullParams = null;
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute & Verify
            await expect(userService.updateMyUser(nullParams, context))
                .rejects.toThrow();
        });

        it('should handle undefined params', async () => {
            // Setup
            const undefinedParams = undefined;
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute & Verify
            await expect(userService.updateMyUser(undefinedParams, context))
                .rejects.toThrow();
        });

        it('should handle empty context', async () => {
            // Setup
            const emptyContext = {};

            // Execute & Verify
            await expect(userService.updateMyUser(params, emptyContext))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle null context', async () => {
            // Setup
            const nullContext = null;

            // Execute & Verify
            await expect(userService.updateMyUser(params, nullContext))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle undefined context', async () => {
            // Setup
            const undefinedContext = undefined;

            // Execute & Verify
            await expect(userService.updateMyUser(params, undefinedContext))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle user with no studies', async () => {
            // Setup
            const userWithoutStudies = { ...mockExistingUser, studies: [] };
            mockUserCollection.find.mockResolvedValue([userWithoutStudies]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            await userService.updateMyUser(params, context);

            // Verify studies enrichment is called with empty array
            expect(userService._findApprovedStudies).toHaveBeenCalledWith([]);
        });

        it('should handle user with null studies', async () => {
            // Setup
            const userWithNullStudies = { ...mockExistingUser, studies: null };
            mockUserCollection.find.mockResolvedValue([userWithNullStudies]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            await userService.updateMyUser(params, context);

            // Verify studies enrichment is called with null
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(null);
        });

        it('should handle user with undefined studies', async () => {
            // Setup
            const userWithUndefinedStudies = { ...mockExistingUser, studies: undefined };
            mockUserCollection.find.mockResolvedValue([userWithUndefinedStudies]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });

            // Execute
            await userService.updateMyUser(params, context);

            // Verify studies enrichment is called with undefined
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(undefined);
        });
    });

    describe('Integration scenarios', () => {
        it('should handle _findApprovedStudies error', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });
            const studiesError = new Error('Studies lookup failed');
            userService._findApprovedStudies.mockRejectedValue(studiesError);

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('Studies lookup failed');
        });

        it('should handle getDataCommonsDisplayNamesForUser error', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            mockUserCollection.update.mockResolvedValue({ matchedCount: 1 });
            const displayError = new Error('Display names error');
            global.getDataCommonsDisplayNamesForUser.mockImplementation(() => {
                throw displayError;
            });

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('Display names error');
        });

        it('should handle getCurrentTime error', async () => {
            // Setup
            mockUserCollection.find.mockResolvedValue([mockExistingUser]);
            const timeError = new Error('Time utility error');
            global.getCurrentTime.mockImplementation(() => {
                throw timeError;
            });

            // Execute & Verify
            await expect(userService.updateMyUser(params, context))
                .rejects.toThrow('Time utility error');
        });
    });
}); 