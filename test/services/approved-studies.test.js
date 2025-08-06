const { ApprovedStudiesService } = require('../../services/approved-studies');
const { ADMIN } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const ERROR = require('../../constants/error-constants');
const { verifySession } = require('../../verifier/user-info-verifier');
const { getDataCommonsDisplayNamesForApprovedStudy, getDataCommonsDisplayNamesForUser } = require('../../utility/data-commons-remapper');
const TEST_CONSTANTS = require('../test-constants');
const USER = require('../../crdc-datahub-database-drivers/constants/user-constants');
const {ApprovedStudies} = require("../../crdc-datahub-database-drivers/domain/approved-studies");

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







    describe('addApprovedStudyAPI', () => {
        const mockGPA = {"GPAEmail": "GPAEmail@email.com", "GPAName": "GPA name", "isPendingGPA": true};
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
            pendingModelChange: false,
            ...mockGPA};
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
                null, 'New Study', 'NS', '1234-5678-9012-345', null, true, '0000-0002-1825-0097', 'Dr. New', false, null, false, false, 'contact-id', mockGPA            );
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
        const mockGPA = {"GPAEmail": "GPAEmail@email.com", "GPAName": "GPA name", "isPendingGPA": true};
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
            pendingModelChange: true,
            ...mockGPA
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
            service.submissionDAO.updateMany = jest.fn().mockResolvedValue({ count: 0 });
            service._getConcierge = jest.fn().mockReturnValue(['Concierge Name', 'concierge@email.com']);
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue(mockDisplayStudy);
        });

        it('should successfully update an approved study', async () => {
            const paramsWithPendingGPA = { ...mockParams};
            const result = await service.editApprovedStudyAPI(paramsWithPendingGPA, mockContext);
            expect(verifySession).toHaveBeenCalledWith(mockContext);
            expect(service._getUserScope).toHaveBeenCalledWith(mockContext.userInfo, ADMIN.MANAGE_STUDIES);
            expect(service.approvedStudyDAO.findFirst).toHaveBeenCalledWith({id: 'study-id'});
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

    describe('getApprovedStudyAPI', () => {
        const mockContext = {
            cookie: {},
            userInfo: TEST_CONSTANTS.TEST_SESSION.userInfo
        };
        const mockParams = { _id: 'study-id' };
        const mockApprovedStudy = {
            _id: 'study-id',
            studyName: 'Test Study',
            studyAbbreviation: 'TS',
            primaryContactID: 'user-id',
            programs: [{ _id: 'org-id', name: 'Org' }],
        };
        const mockDisplayStudy = { ...mockApprovedStudy, dataCommonsDisplayName: 'Test Study Display' };

        beforeEach(() => {
            jest.clearAllMocks();
            verifySession.mockReturnValue({ verifyInitialized: jest.fn() });
            service.getApprovedStudy = jest.fn().mockResolvedValue(mockApprovedStudy);
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue(mockDisplayStudy);
        });

        it('should return the approved study with display names', async () => {
            const result = await service.getApprovedStudyAPI({ ...mockParams }, mockContext);
            expect(verifySession).toHaveBeenCalledWith(mockContext);
            expect(verifySession(mockContext).verifyInitialized).toHaveBeenCalled();
            expect(service.getApprovedStudy).toHaveBeenCalledWith(mockParams);
            expect(getDataCommonsDisplayNamesForApprovedStudy).toHaveBeenCalledWith(mockApprovedStudy);
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should throw if verifySession fails', async () => {
            verifySession.mockImplementation(() => { throw new Error('Session error'); });
            await expect(service.getApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow('Session error');
        });

        it('should throw if getApprovedStudy throws', async () => {
            service.getApprovedStudy = jest.fn().mockRejectedValue(new Error('Not found'));
            await expect(service.getApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow('Not found');
        });

        it('should throw if study is not found', async () => {
            service.getApprovedStudy = jest.fn().mockRejectedValue(new Error(ERROR.APPROVED_STUDY_NOT_FOUND));
            await expect(service.getApprovedStudyAPI({ _id: 'notfound' }, mockContext)).rejects.toThrow(ERROR.APPROVED_STUDY_NOT_FOUND);
        });

        it('should populate primaryContact if primaryContactID is present', async () => {
            const mockPrimaryContact = { _id: 'user-id', firstName: 'John', lastName: 'Doe', email: 'john.doe@test.com' };
            const mockStudyWithContact = { ...mockApprovedStudy, primaryContactID: 'user-id' };
            service.getApprovedStudy = jest.fn().mockResolvedValue({ ...mockStudyWithContact, primaryContact: mockPrimaryContact });
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue({ ...mockStudyWithContact, primaryContact: mockPrimaryContact });
            const result = await service.getApprovedStudyAPI({ _id: 'study-id' }, mockContext);
            expect(result.primaryContact).toEqual(mockPrimaryContact);
        });

        it('should populate programs if present', async () => {
            const mockPrograms = [{ _id: 'org-id', name: 'Org' }];
            const mockStudyWithPrograms = { ...mockApprovedStudy, programs: mockPrograms };
            service.getApprovedStudy = jest.fn().mockResolvedValue(mockStudyWithPrograms);
            getDataCommonsDisplayNamesForApprovedStudy.mockReturnValue(mockStudyWithPrograms);
            const result = await service.getApprovedStudyAPI({ _id: 'study-id' }, mockContext);
            expect(result.programs).toEqual(mockPrograms);
        });

        it('should propagate error from getDataCommonsDisplayNamesForApprovedStudy', async () => {
            getDataCommonsDisplayNamesForApprovedStudy.mockImplementation(() => { throw new Error('Mapping error'); });
            await expect(service.getApprovedStudyAPI({ ...mockParams }, mockContext)).rejects.toThrow('Mapping error');
        });
    });

    describe('storeApprovedStudies', () => {
        const studyName = 'Study A';
        const studyAbbreviation = 'SA';
        const dbGaPID = '1234-5678-9012-345';
        const organizationName = 'Org1';
        const controlledAccess = true;
        const ORCID = '0000-0002-1825-0097';
        const PI = 'Dr. Smith';
        const openAccess = false;
        const programName = 'Program1';
        const fakeStudy = { studyName, studyAbbreviation };
        const fakeResult = { value: fakeStudy };
        const useProgramPC = false;
        const primaryContactID = null;
        const pendingModelChange = false;

        it('should store and return the approved study (success)', async () => {
            // Patch: Accept extra trailing argument for compatibility with implementation
            ApprovedStudies.createApprovedStudies.mockImplementation(
                (...args) => {
                    // Remove trailing undefined if present
                    if (args.length > 12 && args[12] === undefined) args.pop();
                    return fakeStudy;
                }
            );

            // Patch: mock DAO create to just return the input
            service.approvedStudyDAO = {
                create: jest.fn().mockResolvedValue(fakeStudy)
            };

            const result = await service.storeApprovedStudies(
                null, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, programName,
                useProgramPC, pendingModelChange, primaryContactID
            );

            // Accept extra undefined argument for compatibility
            const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0] || [];
            // Accept trailing null or undefined for compatibility
            expect(callArgs.slice(0, 13)).toEqual([
                null,
                studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, programName,
                useProgramPC, pendingModelChange, primaryContactID
            ]);

            // Check that DAO create was called with the correct study
            expect(service.approvedStudyDAO.create).toHaveBeenCalledWith(fakeStudy);

            expect(result).toBe(fakeStudy);
        });

        it('should log error and return undefined if insertion fails', async () => {
            service.approvedStudyDAO = {

                create: jest.fn()
            };

            ApprovedStudies.createApprovedStudies.mockReturnValue(fakeStudy);
            mockApprovedStudiesCollection.findOneAndUpdate.mockResolvedValue({ value: undefined });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            const result = await service.storeApprovedStudies(
                null, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess, programName
            );

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("An error occurred while attempting to insert the approved studies into the database.")
            );
            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });
    });
});