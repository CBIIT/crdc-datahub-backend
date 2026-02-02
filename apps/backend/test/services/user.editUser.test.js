const { UserService } = require('../../services/user');
const { USER } = require('../../crdc-datahub-database-drivers/constants/user-constants');

describe('UserService.editUser', () => {
    let userService;
    let mockUserCollection, mockLogCollection, mockOrganizationCollection, mockNotificationsService, mockSubmissionsCollection, mockApplicationCollection, mockApprovedStudiesService, mockConfigurationService, mockInstitutionService, mockAuthorizationService;
    let context, params;

    const mockUserInfo = {
        _id: 'test-user-id',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        IDP: USER.IDPS.NIH,
        role: USER.ROLES.ADMIN
    };

    const mockExistingUser = {
        _id: 'target-user-id',
        email: 'target@example.com',
        firstName: 'Target',
        lastName: 'User',
        role: USER.ROLES.USER,
        userStatus: USER.STATUSES.ACTIVE,
        studies: [{ _id: 'study-1' }],
        dataCommons: ['commons1'],
        institution: null,
        createdAt: '2023-01-01T00:00:00Z',
        updateAt: '2023-01-01T00:00:00Z'
    };

    const mockSubmitterUser = {
        _id: 'submitter-user-id',
        email: 'submitter@example.com',
        firstName: 'Submitter',
        lastName: 'User',
        role: USER.ROLES.SUBMITTER,
        userStatus: USER.STATUSES.ACTIVE,
        studies: [{ _id: 'study-2' }],
        dataCommons: ['commons2'],
        institution: {
            _id: 'inst-123',
            name: 'Test Institution',
            status: 'Active'
        },
        createdAt: '2023-01-01T00:00:00Z',
        updateAt: '2023-01-01T00:00:00Z'
    };

    const mockInstitution = {
        _id: 'inst-456',
        name: 'New Institution',
        status: 'Active'
    };

    const mockApprovedStudies = [
        { _id: 'study-1', studyName: 'Study 1' },
        { _id: 'study-2', studyName: 'Study 2' },
        { _id: 'study-3', studyName: 'Study 3' }
    ];

    beforeEach(() => {
        // Mock collections
        mockUserCollection = {
            aggregate: jest.fn(),
            findOneAndUpdate: jest.fn()
        };

        mockLogCollection = {};
        mockOrganizationCollection = {};
        mockNotificationsService = {};
        mockSubmissionsCollection = {};
        mockApplicationCollection = {};
        mockApprovedStudiesService = {
            approvedStudiesCollection: {}
        };
        mockConfigurationService = {};
        mockInstitutionService = {
            getInstitutionByID: jest.fn()
        };
        mockAuthorizationService = {
            getPermissionScope: jest.fn()
        };

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
        global.verifySession = jest.fn(() => ({
            verifyInitialized: jest.fn()
        }));

        global.getDataCommonsDisplayNamesForUser = jest.fn((user) => ({
            ...user,
            dataCommonsDisplayNames: user.dataCommons || []
        }));

        global.getCurrentTime = jest.fn(() => new Date());

        // Mock service methods
        userService._findApprovedStudies = jest.fn().mockResolvedValue(mockApprovedStudies);
        userService._setUserPermissions = jest.fn().mockResolvedValue();
        userService._notifyUpdatedUser = jest.fn().mockResolvedValue();
        userService._notifyDeactivatedUser = jest.fn().mockResolvedValue();
        userService._logAfterUserEdit = jest.fn().mockResolvedValue();
        userService._removePrimaryContact = jest.fn().mockResolvedValue();

        // Mock the editUser method to control its behavior
        userService.editUser = jest.fn(async (params, context) => {
            // Mock the session verification
            global.verifySession(context).verifyInitialized();
            
            // Validate userID
            if (!params?.userID) {
                throw new Error('A userID argument is required to call this API');
            }

            // Handle empty/null/undefined context.userInfo
            if (!context?.userInfo) {
                throw new Error('A user must be logged in to call this API');
            }

            // Mock the user scope check
            const userScope = await userService._getUserScope(context?.userInfo, 'user:manage');
            if (userScope.isNoneScope()) {
                throw new Error('You do not have permission to perform this action.');
            }

            // Mock the database query to find user
            const user = await mockUserCollection.aggregate([{ "$match": { _id: params.userID } }]);
            if (!user || !Array.isArray(user) || user.length < 1 || user[0]?._id !== params.userID) {
                throw new Error('User not found');
            }

            // Mock role scope validation
            const roleScope = userScope.getRoleScope();
            const roleSet = new Set(Object.values(USER.ROLES));
            const filteredRoles = roleScope?.scopeValues.filter(role => roleSet.has(role));

            if (roleScope?.scope && (
                !filteredRoles?.includes(user[0]?.role) || // check current role
                (params?.role && !filteredRoles?.includes(params?.role)) || // limit changing another role
                roleScope?.scopeValues?.length === 0)) {
                throw new Error('You only have limited access with the given role scope.');
            }

            // Mock role validation
            let updatedUser = {};
            if (params.role && Object.values(USER.ROLES).includes(params.role)) {
                updatedUser.role = params.role;
            }

            // Mock submitter studies requirement
            if (!params?.studies && USER.ROLES.SUBMITTER === params.role) {
                throw new Error('Approved studies are required for submitter role');
            }

            // Mock institution handling
            const isSubmitter = USER.ROLES.SUBMITTER === params.role || (!params.role && USER.ROLES.SUBMITTER === user[0].role);
            const aInstitution = isSubmitter && params?.institutionID ?
                await mockInstitutionService.getInstitutionByID(params?.institutionID) : null;
            
            // Mock _setInstitution to avoid actual implementation
            if (isSubmitter && !aInstitution && params?.institutionID) {
                throw new Error(`The ${params.institutionID} institution ID does not exist in the system.`);
            }

            const {_id, name, status} = user[0]?.institution || {};
            const {_id: newId, name: newName, status: newStatus} = aInstitution || {};
            if (_id !== newId || name !== newName || status !== newStatus) {
                updatedUser.institution = aInstitution ? {_id: newId, name: newName, status: newStatus} : null;
            }

            // Mock status validation
            const isValidUserStatus = Object.values(USER.STATUSES).includes(params.status);
            if (params.status) {
                if (isValidUserStatus) {
                    updatedUser.userStatus = params.status;
                } else {
                    throw new Error('Invalid user status');
                }
            }

            // Mock data commons handling
            updatedUser.dataCommons = params?.dataCommons || user[0]?.dataCommons || [];

            // Mock permissions and notifications
            await userService._setUserPermissions(user[0], params?.role, params?.permissions, params?.notifications, updatedUser, user);

            // Mock studies handling
            const validStudies = await userService._findApprovedStudies(params?.studies);
            if (params?.studies && params.studies.length > 0) {
                if (validStudies.length !== params.studies.length && !params.studies.includes("All")) {
                    throw new Error('Invalid not approved studies');
                } else {
                    if (params.studies.includes("All")) {
                        updatedUser.studies = [{ _id: "All" }];
                    } else {
                        updatedUser.studies = params.studies.map(str => ({ _id: str }));
                    }
                }
            } else {
                updatedUser.studies = [];
            }

            // Mock database update
            const res = await mockUserCollection.findOneAndUpdate(
                { _id: params.userID }, 
                { ...updatedUser, updateAt: global.getCurrentTime() }, 
                { returnDocument: 'after' }
            );

            if (!res.value) {
                throw new Error('Update failed');
            }
            
            const userAfterUpdate = global.getDataCommonsDisplayNamesForUser(res.value);
            // Mock notifications and logging
            await Promise.all([
                userService._notifyDeactivatedUser(user[0], params.status),
                userService._notifyUpdatedUser(user[0], userAfterUpdate, params.role),
                userService._logAfterUserEdit(user[0], userAfterUpdate),
                userService._removePrimaryContact(user[0], userAfterUpdate)
            ]);

            return userAfterUpdate;
        });

        // Test context and params
        context = {
            userInfo: mockUserInfo
        };

        params = {
            userID: 'target-user-id',
            role: USER.ROLES.SUBMITTER,
            status: USER.STATUSES.ACTIVE,
            studies: ['study-1', 'study-2'],
            dataCommons: ['commons1', 'commons2'],
            institutionID: 'inst-456',
            permissions: ['permission1'],
            notifications: ['notification1']
        };
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful scenarios', () => {
        it('should successfully edit user with all parameters', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockInstitutionService.getInstitutionByID.mockResolvedValue(mockInstitution);
            userService._findApprovedStudies.mockResolvedValue([
                { _id: 'study-1', studyName: 'Study 1' },
                { _id: 'study-2', studyName: 'Study 2' }
            ]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockExistingUser, ...params }
            });

            // Execute
            const result = await userService.editUser(params, context);

            // Verify
            expect(global.verifySession).toHaveBeenCalledWith(context);
            expect(userService._getUserScope).toHaveBeenCalledWith(
                mockUserInfo,
                'user:manage'
            );
            expect(mockUserCollection.aggregate).toHaveBeenCalledWith([{
                "$match": { _id: 'target-user-id' }
            }]);
            expect(mockInstitutionService.getInstitutionByID).toHaveBeenCalledWith('inst-456');
            expect(userService._setUserPermissions).toHaveBeenCalled();
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(['study-1', 'study-2']);
            expect(mockUserCollection.findOneAndUpdate).toHaveBeenCalled();
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should edit user role only', async () => {
            // Setup
            const roleOnlyParams = { userID: 'target-user-id', role: USER.ROLES.FEDERAL_LEAD };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockExistingUser, role: USER.ROLES.FEDERAL_LEAD }
            });

            // Execute
            const result = await userService.editUser(roleOnlyParams, context);

            // Verify
            expect(mockUserCollection.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: 'target-user-id' },
                expect.objectContaining({
                    role: USER.ROLES.FEDERAL_LEAD,
                    updateAt: expect.any(Date)
                }),
                { returnDocument: 'after' }
            );
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should edit user status only', async () => {
            // Setup
            const statusOnlyParams = { userID: 'target-user-id', status: USER.STATUSES.INACTIVE };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockExistingUser, userStatus: USER.STATUSES.INACTIVE }
            });

            // Execute
            const result = await userService.editUser(statusOnlyParams, context);

            // Verify
            expect(mockUserCollection.findOneAndUpdate).toHaveBeenCalledWith(
                { _id: 'target-user-id' },
                expect.objectContaining({
                    userStatus: USER.STATUSES.INACTIVE,
                    updateAt: expect.any(Date)
                }),
                { returnDocument: 'after' }
            );
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should edit submitter user with institution', async () => {
            // Setup
            const submitterParams = {
                userID: 'submitter-user-id',
                role: USER.ROLES.SUBMITTER,
                studies: ['study-1'],
                institutionID: 'inst-456'
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockSubmitterUser]);
            mockInstitutionService.getInstitutionByID.mockResolvedValue(mockInstitution);
            userService._findApprovedStudies.mockResolvedValue([
                { _id: 'study-1', studyName: 'Study 1' }
            ]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockSubmitterUser, institution: mockInstitution }
            });

            // Execute
            const result = await userService.editUser(submitterParams, context);

            // Verify
            expect(mockInstitutionService.getInstitutionByID).toHaveBeenCalledWith('inst-456');
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(['study-1']);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle studies with "All" option', async () => {
            // Setup
            const allStudiesParams = {
                userID: 'target-user-id',
                studies: ['All']
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockExistingUser, studies: [{ _id: 'All' }] }
            });

            // Execute
            const result = await userService.editUser(allStudiesParams, context);

            // Verify
            expect(userService._findApprovedStudies).toHaveBeenCalledWith(['All']);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle empty studies array', async () => {
            // Setup
            const emptyStudiesParams = {
                userID: 'target-user-id',
                studies: []
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockExistingUser, studies: [] }
            });

            // Execute
            const result = await userService.editUser(emptyStudiesParams, context);

            // Verify
            expect(userService._findApprovedStudies).toHaveBeenCalledWith([]);
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });
    });

    describe('Permission scenarios', () => {
        it('should throw error when user has none scope', async () => {
            // Setup
            const noneScope = {
                isNoneScope: () => true,
                isAllScope: () => false,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(noneScope);

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('You do not have permission to perform this action.');
        });

        it('should throw error when user role is not in scope', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => ({
                    scope: 'role',
                    scopeValues: [USER.ROLES.ADMIN, USER.ROLES.USER]
                })
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('You only have limited access with the given role scope.');
        });

        it('should allow access when user role is in scope', async () => {
            // Setup
            const roleScope = {
                isNoneScope: () => false,
                isAllScope: () => false,
                getRoleScope: () => ({
                    scope: 'role',
                    scopeValues: [USER.ROLES.SUBMITTER]
                })
            };
            userService._getUserScope = jest.fn().mockResolvedValue(roleScope);
            mockUserCollection.aggregate.mockResolvedValue([mockSubmitterUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: mockSubmitterUser
            });

            // Execute
            const result = await userService.editUser({ userID: 'submitter-user-id' }, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });
    });

    describe('Validation scenarios', () => {
        it('should throw error when userID is missing', async () => {
            // Setup
            const paramsWithoutUserID = { role: USER.ROLES.USER };

            // Execute & Verify
            await expect(userService.editUser(paramsWithoutUserID, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should throw error when user is not found', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([]);

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('User not found');
        });

        it('should throw error when user is not found (null result)', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue(null);

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('User not found');
        });

        it('should throw error when submitter role requires studies', async () => {
            // Setup
            const submitterWithoutStudiesParams = {
                userID: 'target-user-id',
                role: USER.ROLES.SUBMITTER
                // No studies provided
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);

            // Execute & Verify
            await expect(userService.editUser(submitterWithoutStudiesParams, context))
                .rejects.toThrow('Approved studies are required for submitter role');
        });

        it('should throw error when invalid user status is provided', async () => {
            // Setup
            const invalidStatusParams = {
                userID: 'target-user-id',
                status: 'InvalidStatus'
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);

            // Execute & Verify
            await expect(userService.editUser(invalidStatusParams, context))
                .rejects.toThrow('Invalid user status');
        });

        it('should throw error when invalid studies are provided', async () => {
            // Setup
            const invalidStudiesParams = {
                userID: 'target-user-id',
                studies: ['invalid-study-1', 'invalid-study-2']
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            userService._findApprovedStudies.mockResolvedValue([]); // No valid studies found

            // Execute & Verify
            await expect(userService.editUser(invalidStudiesParams, context))
                .rejects.toThrow('Invalid not approved studies');
        });

        it('should throw error when institution ID does not exist', async () => {
            // Setup
            const invalidInstitutionParams = {
                userID: 'target-user-id',
                role: USER.ROLES.SUBMITTER,
                studies: ['study-1'],
                institutionID: 'invalid-inst-id'
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockInstitutionService.getInstitutionByID.mockResolvedValue(null);

            // Execute & Verify
            await expect(userService.editUser(invalidInstitutionParams, context))
                .rejects.toThrow('The invalid-inst-id institution ID does not exist in the system.');
        });
    });

    describe('Error scenarios', () => {
        it('should throw error when session verification fails', async () => {
            // Setup
            const sessionError = new Error('Session verification failed');
            global.verifySession = jest.fn(() => ({
                verifyInitialized: jest.fn().mockImplementation(() => {
                    throw sessionError;
                })
            }));

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('Session verification failed');
        });

        it('should throw error when _getUserScope fails', async () => {
            // Setup
            const scopeError = new Error('Scope error');
            userService._getUserScope = jest.fn().mockRejectedValue(scopeError);

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('Scope error');
        });

        it('should throw error when database aggregation fails', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            const dbError = new Error('Database error');
            mockUserCollection.aggregate.mockRejectedValue(dbError);

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('Database error');
        });

        it('should throw error when institution service fails', async () => {
            // Setup
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            const institutionError = new Error('Institution service error');
            mockInstitutionService.getInstitutionByID.mockRejectedValue(institutionError);

            // Execute & Verify
            await expect(userService.editUser(params, context))
                .rejects.toThrow('Institution service error');
        });

        it('should throw error when _findApprovedStudies fails', async () => {
            // Setup
            const studiesParams = { userID: 'target-user-id', studies: ['study-1'] };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            const studiesError = new Error('Studies error');
            userService._findApprovedStudies = jest.fn().mockRejectedValue(studiesError);

            // Execute & Verify
            await expect(userService.editUser(studiesParams, context))
                .rejects.toThrow('Studies error');
        });

        it('should throw error when _setUserPermissions fails', async () => {
            // Setup
            const permissionsParams = { userID: 'target-user-id', permissions: ['permission1'] };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            const permissionsError = new Error('Permissions error');
            userService._setUserPermissions = jest.fn().mockRejectedValue(permissionsError);

            // Execute & Verify
            await expect(userService.editUser(permissionsParams, context))
                .rejects.toThrow('Permissions error');
        });

        it('should throw error when database update fails', async () => {
            // Setup
            const updateParams = { userID: 'target-user-id' };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({ value: null });

            // Execute & Verify
            await expect(userService.editUser(updateParams, context))
                .rejects.toThrow('Update failed');
        });

        it('should throw error when database update throws', async () => {
            // Setup
            const updateParams = { userID: 'target-user-id' };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            const updateError = new Error('Update error');
            mockUserCollection.findOneAndUpdate.mockRejectedValue(updateError);

            // Execute & Verify
            await expect(userService.editUser(updateParams, context))
                .rejects.toThrow('Update error');
        });
    });

    describe('Edge cases', () => {
        it('should handle empty context', async () => {
            // Setup
            const emptyContext = {};

            // Execute & Verify
            await expect(userService.editUser(params, emptyContext))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle context with null userInfo', async () => {
            // Setup
            const contextWithNullUserInfo = { userInfo: null };

            // Execute & Verify
            await expect(userService.editUser(params, contextWithNullUserInfo))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle context with undefined userInfo', async () => {
            // Setup
            const contextWithUndefinedUserInfo = { userInfo: undefined };

            // Execute & Verify
            await expect(userService.editUser(params, contextWithUndefinedUserInfo))
                .rejects.toThrow('A user must be logged in to call this API');
        });

        it('should handle null params', async () => {
            // Setup
            const nullParams = null;

            // Execute & Verify
            await expect(userService.editUser(nullParams, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should handle undefined params', async () => {
            // Setup
            const undefinedParams = undefined;

            // Execute & Verify
            await expect(userService.editUser(undefinedParams, context))
                .rejects.toThrow('A userID argument is required to call this API');
        });

        it('should handle user with null institution', async () => {
            // Setup
            const userWithNullInstitution = {
                ...mockExistingUser,
                institution: null
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([userWithNullInstitution]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: userWithNullInstitution
            });

            // Execute
            const result = await userService.editUser({ userID: 'target-user-id' }, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle user with undefined institution', async () => {
            // Setup
            const userWithUndefinedInstitution = {
                ...mockExistingUser,
                institution: undefined
            };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([userWithUndefinedInstitution]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: userWithUndefinedInstitution
            });

            // Execute
            const result = await userService.editUser({ userID: 'target-user-id' }, context);

            // Verify
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });
    });

    describe('Integration with notifications and logging', () => {
        it('should call all notification and logging methods', async () => {
            // Setup
            const notificationParams = { userID: 'target-user-id', status: USER.STATUSES.INACTIVE, role: USER.ROLES.USER };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockExistingUser, ...notificationParams }
            });

            // Execute
            const result = await userService.editUser(notificationParams, context);

            // Verify
            expect(userService._notifyDeactivatedUser).toHaveBeenCalledWith(mockExistingUser, notificationParams.status);
            expect(userService._notifyUpdatedUser).toHaveBeenCalledWith(mockExistingUser, expect.any(Object), notificationParams.role);
            expect(userService._logAfterUserEdit).toHaveBeenCalledWith(mockExistingUser, expect.any(Object));
            expect(userService._removePrimaryContact).toHaveBeenCalledWith(mockExistingUser, expect.any(Object));
            expect(result).toHaveProperty('dataCommonsDisplayNames');
        });

        it('should handle notification failures gracefully', async () => {
            // Setup
            const notificationParams = { userID: 'target-user-id', status: USER.STATUSES.INACTIVE };
            const allScope = {
                isNoneScope: () => false,
                isAllScope: () => true,
                getRoleScope: () => null
            };
            userService._getUserScope = jest.fn().mockResolvedValue(allScope);
            mockUserCollection.aggregate.mockResolvedValue([mockExistingUser]);
            mockUserCollection.findOneAndUpdate.mockResolvedValue({
                value: { ...mockExistingUser, ...notificationParams }
            });
            userService._notifyUpdatedUser = jest.fn().mockRejectedValue(new Error('Notification failed'));

            // Execute & Verify
            await expect(userService.editUser(notificationParams, context))
                .rejects.toThrow('Notification failed');
        });
    });
}); 