const { ApprovedStudiesService } = require('../../services/approved-studies');
const { ADMIN } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const ERROR = require('../../constants/error-constants');
const { verifySession } = require('../../verifier/user-info-verifier');
const { getDataCommonsDisplayNamesForApprovedStudy, getDataCommonsDisplayNamesForUser } = require('../../utility/data-commons-remapper');
const { getApprovedStudyByID } = require('../../dao/approvedStudy');
const TEST_CONSTANTS = require('../test-constants');
const USER = require('../../crdc-datahub-database-drivers/constants/user-constants');

// Mock dependencies
jest.mock('../../verifier/user-info-verifier');
jest.mock('../../utility/data-commons-remapper');
jest.mock('../../dao/approvedStudy');
jest.mock('../../dao/program');
jest.mock('../../dao/user');
jest.mock('../../dao/submission');

// Mock ApprovedStudies static method
jest.mock('../../crdc-datahub-database-drivers/domain/approved-studies', () => {
    const originalModule = jest.requireActual('../../crdc-datahub-database-drivers/domain/approved-studies');
    return {
        ...originalModule,
        ApprovedStudies: {
            ...originalModule.ApprovedStudies,
            createApprovedStudies: jest.fn()
        }
    };
});

describe('ApprovedStudiesService', () => {
    let service;
    let mockApprovedStudiesCollection;
    let mockUserCollection;
    let mockOrganizationService;
    let mockSubmissionCollection;
    let mockAuthorizationService;
    let mockApprovedStudyDAO;

    beforeEach(() => {
        // Initialize mock collections and services
        mockApprovedStudiesCollection = {
            aggregate: jest.fn(),
            find: jest.fn(),
            findOneAndUpdate: jest.fn(),
            insert: jest.fn(),
            update: jest.fn()
        };
        mockUserCollection = {
            aggregate: jest.fn()
        };
        mockOrganizationService = {
            findByStudyID: jest.fn(),
            organizationCollection: {
                aggregate: jest.fn()
            }
        };
        mockSubmissionCollection = {
            updateMany: jest.fn()
        };
        mockAuthorizationService = {
            getPermissionScope: jest.fn()
        };

        // Mock the DAO with getApprovedStudyByID
        mockApprovedStudyDAO = {
            getApprovedStudyByID: jest.fn()
        };

        service = new ApprovedStudiesService(
            mockApprovedStudiesCollection,
            mockUserCollection,
            mockOrganizationService,
            mockSubmissionCollection,
            mockAuthorizationService
        );
        // Inject the mock DAO
        service.approvedStudyDAO = mockApprovedStudyDAO;

        // Reset all mocks
        jest.clearAllMocks();
    });
    // Move the getApprovedStudyAPI tests here
    describe('getApprovedStudyAPI', () => {
        const mockStudyId = 'test-study-id';
        const mockParams = { _id: mockStudyId };
        const mockContext = {
            cookie: {},
            userInfo: TEST_CONSTANTS.TEST_SESSION.userInfo
        };
        const mockApprovedStudy = {
            _id: mockStudyId,
            studyName: 'Test Study',
            studyAbbreviation: 'TS',
            dbGaPID: '1234-5678-9012-345',
            controlledAccess: true,
            ORCID: '0000-0002-1825-0097',
            PI: 'Dr. Test',
            openAccess: false,
            primaryContactID: 'test-contact-id',
            useProgramPC: false,
            pendingModelChange: false,
            createdAt: '2023-01-01T00:00:00Z',
            updatedAt: '2023-01-01T00:00:00Z'
        };
        const mockPrograms = [
            {
                _id: 'test-program-id',
                name: 'Test Program',
                conciergeID: 'test-concierge-id',
                conciergeName: 'Test Concierge',
                conciergeEmail: 'concierge@test.com'
            }
        ];
        const mockPrimaryContact = {
            _id: 'test-contact-id',
            firstName: 'John',
            lastName: 'Doe',
            email: 'john.doe@test.com',
            role: 'DATA_COMMONS_PERSONNEL'
        };
        const mockDisplayNamesStudy = {
            ...mockApprovedStudy,
            dataCommonsDisplayName: 'Test Study Display Name'
        };

        beforeEach(() => {
            // Reset mocks
            jest.clearAllMocks();

            // Setup default mock implementations
            verifySession.mockReturnValue({
                verifyInitialized: jest.fn()
            });
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue(mockDisplayNamesStudy);
            getApprovedStudyByID.mockResolvedValue(mockApprovedStudy);
            service.organizationService.findByStudyID.mockResolvedValue(['test-program-id']);
            service.programDAO.findMany.mockResolvedValue(mockPrograms);
            service.userDAO.findFirst.mockResolvedValue(mockPrimaryContact);
        });

        it('should successfully get an approved study with all related data', async () => {
            const result = await service.getApprovedStudyAPI(mockParams, mockContext);

            // Verify session verification
            expect(verifySession).toHaveBeenCalledWith(mockContext);
            expect(verifySession(mockContext).verifyInitialized).toHaveBeenCalled();

            // Verify DAO calls
            expect(getApprovedStudyByID).toHaveBeenCalledWith(mockStudyId);
            expect(service.organizationService.findByStudyID).toHaveBeenCalledWith(mockStudyId);
            expect(service.programDAO.findMany).toHaveBeenCalledWith(
                { _id: { $in: ['test-program-id'] } },
                { orderBy: { id: 'desc' } }
            );
            expect(service.userDAO.findFirst).toHaveBeenCalledWith({
                _id: 'test-contact-id',
                userStatus: 'Active'
            });

            // Verify data commons remapping
            expect(getDataCommonsDisplayNamesForApprovedStudy).toHaveBeenCalledWith({
                ...mockApprovedStudy,
                programs: mockPrograms,
                primaryContact: mockPrimaryContact
            });

            // Verify result
            expect(result).toEqual(mockDisplayNamesStudy);
        });

        it('should handle study without programs', async () => {
            service.organizationService.findByStudyID.mockResolvedValue(null);

            const result = await service.getApprovedStudyAPI(mockParams, mockContext);

            // programDAO.findMany should NOT be called
            expect(service.programDAO.findMany).not.toHaveBeenCalled();
            expect(getDataCommonsDisplayNamesForApprovedStudy).toHaveBeenCalledWith({
                ...mockApprovedStudy,
                programs: null,
                primaryContact: mockPrimaryContact
            });
            expect(result).toEqual(mockDisplayNamesStudy);
        });

        it('should handle empty programs array', async () => {
            service.organizationService.findByStudyID.mockResolvedValue([]);

            const result = await service.getApprovedStudyAPI(mockParams, mockContext);

            // programDAO.findMany should NOT be called
            expect(service.programDAO.findMany).not.toHaveBeenCalled();
            expect(getDataCommonsDisplayNamesForApprovedStudy).toHaveBeenCalledWith({
                ...mockApprovedStudy,
                programs: null,
                primaryContact: mockPrimaryContact
            });
            expect(result).toEqual(mockDisplayNamesStudy);
        });

        it('should handle primary contact not found', async () => {
            service.userDAO.findFirst.mockResolvedValue(null);

            const result = await service.getApprovedStudyAPI(mockParams, mockContext);

            expect(getDataCommonsDisplayNamesForApprovedStudy).toHaveBeenCalledWith(
                expect.objectContaining({
                    ...mockApprovedStudy,
                    programs: mockPrograms,
                    primaryContact: null
                })
            );
            expect(result).toEqual(mockDisplayNamesStudy);
        });

        it('should handle study without primary contact', async () => {
            const studyWithoutContact = { ...mockApprovedStudy, primaryContactID: null };
            getApprovedStudyByID.mockResolvedValue(studyWithoutContact);
            service.userDAO.findFirst.mockReset(); // ensure it returns undefined if called
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue({
                ...studyWithoutContact,
                programs: mockPrograms,
                primaryContact: undefined
            });

            const result = await service.getApprovedStudyAPI(mockParams, mockContext);

            expect(service.userDAO.findFirst).not.toHaveBeenCalled();
            expect(result).toEqual({
                ...studyWithoutContact,
                programs: mockPrograms,
                primaryContact: undefined
            });
        });

        it('should throw error when study is not found', async () => {
            getApprovedStudyByID.mockResolvedValue(null);
            // Mock session verification
            verifySession.mockReturnValue({
                verifyInitialized: jest.fn()
            });

            // Mock permission check
            mockAuthorizationService.getPermissionScope.mockResolvedValue([{ scope: 'all' }]);

            // Mock DAO to return null
            mockApprovedStudyDAO.getApprovedStudyByID.mockResolvedValue(null);

            await expect(service.getApprovedStudyAPI(mockParams, mockContext))
                .rejects.toThrow(ERROR.APPROVED_STUDY_NOT_FOUND);
        });

        it('should throw error when study ID is missing', async () => {
            const invalidParams = { _id: null };

            await expect(service.getApprovedStudyAPI(invalidParams, mockContext))
                .rejects.toThrow(ERROR.APPROVED_STUDY_NOT_FOUND);
        });

        it('should throw error when study ID is not a string', async () => {
            const invalidParams = { _id: 123 };

            await expect(service.getApprovedStudyAPI(invalidParams, mockContext))
                .rejects.toThrow(ERROR.APPROVED_STUDY_NOT_FOUND);
        });

        it('should throw error when study ID is empty string', async () => {
            const invalidParams = { _id: '' };

            await expect(service.getApprovedStudyAPI(invalidParams, mockContext))
                .rejects.toThrow(ERROR.APPROVED_STUDY_NOT_FOUND);
        });
    });

    describe('addApprovedStudyAPI', () => {
        const mockParams = {
            name: 'New Study',
            acronym: 'NS',
            controlledAccess: true,
            openAccess: false,
            dbGaPID: '1234-5678-9012-345',
            ORCID: '0000-0002-1825-0097',
            PI: 'Dr. New',
            primaryContactID: 'contact-id',
            useProgramPC: false,
            pendingModelChange: false
        };
        const mockContext = {
            cookie: {},
            userInfo: TEST_CONSTANTS.TEST_SESSION.userInfo
        };
        const mockUserScope = { isNoneScope: () => false, isAllScope: () => true };
        const mockPrimaryContact = {
            _id: 'contact-id',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@test.com',
            role: USER.USER.ROLES.DATA_COMMONS_PERSONNEL
        };
        const mockOrg = { _id: 'org-id', name: 'NA' };
        const mockNewStudy = { _id: 'new-study-id', studyName: 'New Study', studyAbbreviation: 'NS' };
        const mockDisplayStudy = { ...mockNewStudy, dataCommonsDisplayName: 'New Study Display Name' };
        const mockDisplayUser = { ...mockPrimaryContact, dataCommonsDisplayNames: ['Jane Smith'] };

        beforeEach(() => {
            jest.clearAllMocks();
            verifySession.mockReturnValue({ verifyInitialized: jest.fn() });
            service._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
            service._validateStudyName = jest.fn().mockResolvedValue(true);
            service._findUserByID = jest.fn().mockResolvedValue(mockPrimaryContact);
            service.storeApprovedStudies = jest.fn().mockResolvedValue(mockNewStudy);
            service.organizationService.getOrganizationByName = jest.fn().mockResolvedValue(mockOrg);
            service.organizationService.storeApprovedStudies = jest.fn().mockResolvedValue();
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue(mockDisplayStudy);
            getDataCommonsDisplayNamesForUser.mockReturnValue(mockDisplayUser);
        });

        it('should successfully create a new approved study', async () => {
            const result = await service.addApprovedStudyAPI({ ...mockParams }, mockContext);
            expect(verifySession).toHaveBeenCalledWith(mockContext);
            expect(service._getUserScope).toHaveBeenCalledWith(mockContext.userInfo, ADMIN.MANAGE_STUDIES);
            expect(service._validateStudyName).toHaveBeenCalledWith('New Study');
            expect(service._findUserByID).toHaveBeenCalledWith('contact-id');
            expect(service.storeApprovedStudies).toHaveBeenCalledWith(
                'New Study', 'NS', '1234-5678-9012-345', null, true, '0000-0002-1825-0097', 'Dr. New', false, null, false, false, 'contact-id'
            );
            expect(service.organizationService.getOrganizationByName).toHaveBeenCalledWith('NA');
            expect(service.organizationService.storeApprovedStudies).toHaveBeenCalledWith('org-id', 'new-study-id');
            expect(getDataCommonsDisplayNamesForApprovedStudy).toHaveBeenCalledWith(mockNewStudy);
            expect(getDataCommonsDisplayNamesForUser).toHaveBeenCalledWith(mockPrimaryContact);
            expect(result).toEqual({ ...mockDisplayStudy, primaryContact: mockDisplayUser });
        });

        it('should throw error if user does not have permission', async () => {
            service._getUserScope = jest.fn().mockResolvedValue({ isNoneScope: () => true });
            await expect(service.addApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
        });

        it('should throw error if study name is duplicate', async () => {
            service._validateStudyName = jest.fn().mockRejectedValue(new Error(ERROR.DUPLICATE_STUDY_NAME));
            await expect(service.addApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.DUPLICATE_STUDY_NAME);
        });

        it('should throw error if primary contact is not found', async () => {
            service._findUserByID = jest.fn().mockResolvedValue(null);
            await expect(service.addApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.INVALID_PRIMARY_CONTACT);
        });

        it('should throw error if primary contact has invalid role', async () => {
            service._findUserByID = jest.fn().mockResolvedValue({ ...mockPrimaryContact, role: 'SOME_OTHER_ROLE' });
            await expect(service.addApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.INVALID_PRIMARY_CONTACT_ROLE);
        });
    });

    describe('editApprovedStudyAPI', () => {
        const mockParams = {
            studyID: 'study-id',
            name: 'Updated Study',
            acronym: 'US',
            controlledAccess: true,
            openAccess: true,
            dbGaPID: '1234-5678-9012-345',
            ORCID: '0000-0002-1825-0097',
            PI: 'Dr. Updated',
            primaryContactID: 'contact-id',
            useProgramPC: false,
            pendingModelChange: true
        };
        const mockContext = {
            cookie: {},
            userInfo: TEST_CONSTANTS.TEST_SESSION.userInfo
        };
        const mockUserScope = { isNoneScope: () => false, isAllScope: () => true };
        const mockStudy = {
            _id: 'study-id',
            studyName: 'Old Study',
            studyAbbreviation: 'OS',
            controlledAccess: false,
            openAccess: false,
            dbGaPID: 'old-gap',
            ORCID: 'old-orcid',
            PI: 'Dr. Old',
            primaryContactID: null,
            useProgramPC: false,
            pendingModelChange: false
        };
        const mockPrimaryContact = {
            _id: 'contact-id',
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane.smith@test.com',
            role: USER.USER.ROLES.DATA_COMMONS_PERSONNEL
        };
        const mockPrograms = [
            {
                _id: 'program-id',
                conciergeID: 'concierge-id',
                conciergeName: 'Concierge Name',
                conciergeEmail: 'concierge@email.com'
            }
        ];
        const mockDisplayStudy = { ...mockStudy, studyName: 'Updated Study', dataCommonsDisplayName: 'Updated Study Display Name' };

        beforeEach(() => {
            jest.clearAllMocks();
            verifySession.mockReturnValue({ verifyInitialized: jest.fn() });
            service._getUserScope = jest.fn().mockResolvedValue(mockUserScope);
            service._validateStudyName = jest.fn().mockResolvedValue(true);
            service._findUserByID = jest.fn().mockResolvedValue(mockPrimaryContact);
            service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue({ ...mockStudy });
            service.approvedStudyDAO.update = jest.fn().mockResolvedValue(true);
            service._findOrganizationByStudyID = jest.fn().mockResolvedValue(mockPrograms);
            service.submissionDAO.updateMany = jest.fn().mockResolvedValue({ acknowledged: true });
            service._getConcierge = jest.fn().mockReturnValue(['Concierge Name', 'concierge@email.com']);
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue(mockDisplayStudy);
        });

        it('should successfully update an approved study', async () => {
            const result = await service.editApprovedStudyAPI({ ...mockParams }, mockContext);
            expect(verifySession).toHaveBeenCalledWith(mockContext);
            expect(service._getUserScope).toHaveBeenCalledWith(mockContext.userInfo, ADMIN.MANAGE_STUDIES);
            expect(service.approvedStudyDAO.findFirst).toHaveBeenCalledWith('study-id');
            expect(service._validateStudyName).toHaveBeenCalledWith('Updated Study');
            expect(service._findUserByID).toHaveBeenCalledWith('contact-id');
            expect(service.approvedStudyDAO.update).toHaveBeenCalled();
            expect(service.submissionDAO.updateMany).toHaveBeenCalled();
            expect(getDataCommonsDisplayNamesForApprovedStudy).toHaveBeenCalled();
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should throw error if user does not have permission', async () => {
            service._getUserScope = jest.fn().mockResolvedValue({ isNoneScope: () => true });
            await expect(service.editApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
        });

        it('should throw error if study is not found', async () => {
            service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(null);
            await expect(service.editApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.APPROVED_STUDY_NOT_FOUND);
        });

        it('should throw error if study name is duplicate', async () => {
            service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue({ ...mockStudy, studyName: 'Other' });
            service._validateStudyName = jest.fn().mockRejectedValue(new Error(ERROR.DUPLICATE_STUDY_NAME));
            await expect(service.editApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.DUPLICATE_STUDY_NAME);
        });

        it('should throw error if primary contact is not found', async () => {
            service._findUserByID = jest.fn().mockResolvedValue(null);
            await expect(service.editApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.INVALID_PRIMARY_CONTACT);
        });

        it('should throw error if primary contact has invalid role', async () => {
            service._findUserByID = jest.fn().mockResolvedValue({ ...mockPrimaryContact, role: 'SOME_OTHER_ROLE' });
            await expect(service.editApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.INVALID_PRIMARY_CONTACT_ROLE);
        });

        it('should throw error if useProgramPC and primaryContactID are both set', async () => {
            await expect(service.editApprovedStudyAPI({ ...mockParams, useProgramPC: true, primaryContactID: 'contact-id' }, mockContext)).rejects.toThrow(ERROR.INVALID_PRIMARY_CONTACT_ATTEMPT);
        });

        it('should throw error if update fails', async () => {
            service.approvedStudyDAO.update = jest.fn().mockResolvedValue(false);
            await expect(service.editApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.FAILED_APPROVED_STUDY_UPDATE);
        });

        it('should throw error if submission update is not acknowledged', async () => {
            service.submissionDAO.updateMany = jest.fn().mockResolvedValue({ acknowledged: false });
            await expect(service.editApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow(ERROR.FAILED_PRIMARY_CONTACT_UPDATE);
        });
    });

    describe('listApprovedStudiesAPI', () => {
        const mockContext = {
            cookie: {},
            userInfo: TEST_CONSTANTS.TEST_SESSION.userInfo
        };
        const mockParams = {
            controlledAccess: 'Controlled',
            study: 'Test',
            dbGaPID: '1234',
            first: 10,
            offset: 0,
            orderBy: 'studyName',
            sortDirection: 'desc',
            programID: 'program-id'
        };
        const mockDAOResult = [{
            total: 2,
            results: [
                { _id: 'study1', studyName: 'Study 1' },
                { _id: 'study2', studyName: 'Study 2' }
            ]
        }];
        const mockDisplayList = {
            total: 2,
            studies: [
                { _id: 'study1', studyName: 'Study 1', dataCommonsDisplayName: 'Study 1' },
                { _id: 'study2', studyName: 'Study 2', dataCommonsDisplayName: 'Study 2' }
            ]
        };

        beforeEach(() => {
            jest.clearAllMocks();
            verifySession.mockReturnValue({ verifyInitialized: jest.fn() });
            service.approvedStudyDAO.listApprovedStudies = jest.fn().mockResolvedValue(mockDAOResult);
            require('../../utility/data-commons-remapper').getDataCommonsDisplayNamesForApprovedStudyList.mockReturnValue(mockDisplayList);
        });

        it('should return a list of approved studies with display names', async () => {
            const result = await service.listApprovedStudiesAPI({ ...mockParams }, mockContext);
            expect(verifySession).toHaveBeenCalledWith(mockContext);
            expect(verifySession(mockContext).verifyInitialized).toHaveBeenCalled();
            expect(service.approvedStudyDAO.listApprovedStudies).toHaveBeenCalledWith(
                'Test', 'Controlled', '1234', 'program-id', 10, 0, 'studyName', 'desc'
            );
            expect(require('../../utility/data-commons-remapper').getDataCommonsDisplayNamesForApprovedStudyList).toHaveBeenCalledWith({
                total: 2,
                studies: [
                    { _id: 'study1', studyName: 'Study 1' },
                    { _id: 'study2', studyName: 'Study 2' }
                ]
            });
            expect(result).toEqual(mockDisplayList);
        });

        it('should handle empty DAO results gracefully', async () => {
            service.approvedStudyDAO.listApprovedStudies = jest.fn().mockResolvedValue([]);
            require('../../utility/data-commons-remapper').getDataCommonsDisplayNamesForApprovedStudyList.mockReturnValue({ total: 0, studies: [] });
            const result = await service.listApprovedStudiesAPI({ ...mockParams }, mockContext);
            expect(result).toEqual({ total: 0, studies: [] });
        });

        it('should throw if verifySession fails', async () => {
            verifySession.mockImplementation(() => { throw new Error('Session error'); });
            await expect(service.listApprovedStudiesAPI({ ...mockParams }, mockContext)).rejects.toThrow('Session error');
        });
    });




});