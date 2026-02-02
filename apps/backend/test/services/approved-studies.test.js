const { ApprovedStudiesService } = require('../../services/approved-studies');
const { ADMIN } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const ERROR = require('../../constants/error-constants');
const { verifySession } = require('../../verifier/user-info-verifier');
const { getDataCommonsDisplayNamesForApprovedStudy, getDataCommonsDisplayNamesForUser } = require('../../utility/data-commons-remapper');
const TEST_CONSTANTS = require('../test-constants');
const USER = require('../../crdc-datahub-database-drivers/constants/user-constants');
const {ApprovedStudies} = require("../../crdc-datahub-database-drivers/domain/approved-studies");
const { NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, CANCELED, DELETED, ARCHIVED } = require('../../constants/submission-constants');

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
            findOneByStudyID: jest.fn(),
            getOrganizationByID: jest.fn(),
            getOrganizationByName: jest.fn(),
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

        // Mock the DAO with getApprovedStudyByID and findFirst
        mockApprovedStudyDAO = {
            getApprovedStudyByID: jest.fn(),
            findFirst: jest.fn()
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
        const mockGPA = {"GPAName": "GPA name", "isPendingGPA": true};
        const mockParams = {
            name: 'New Study',
            acronym: 'NS',
            controlledAccess: true,
            openAccess: false,
            dbGaPID: 'phs001234',
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
            service.storeApprovedStudies = jest.fn().mockResolvedValue({_id: 'new-study-id'});
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
                null, 'New Study', 'NS', 'phs001234', null, true, '0000-0002-1825-0097', 'Dr. New', false, false, false, 'contact-id', mockGPA, 'org-id'            );
            expect(service.organizationService.getOrganizationByName).toHaveBeenCalledWith('NA');
            expect(result).toEqual({_id: 'new-study-id'});
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

        it('should successfully create a controlled access study without dbGaPID', async () => {
            const paramsWithoutDbGaPID = {
                ...mockParams,
                controlledAccess: true,
                dbGaPID: undefined
            };
            const result = await service.addApprovedStudyAPI(paramsWithoutDbGaPID, mockContext);
            expect(service.storeApprovedStudies).toHaveBeenCalledWith(
                null, 'New Study', 'NS', undefined, null, true, '0000-0002-1825-0097', 'Dr. New', false, false, false, 'contact-id', mockGPA, 'org-id'
            );
            expect(result).toEqual({_id: "new-study-id"});
        });

        it('should throw error when creating controlled access study without GPAName and isPendingGPA false', async () => {
            const paramsWithoutGPAName = {
                ...mockParams,
                controlledAccess: true,
                GPAName: undefined,
                isPendingGPA: false
            };
            await expect(service.addApprovedStudyAPI(paramsWithoutGPAName, mockContext)).rejects.toThrow(ERROR.INVALID_PENDING_GPA);
        });

        it('should throw error when creating controlled access study with both dbGaPID and GPAName missing and isPendingGPA false', async () => {
            const paramsWithoutBoth = {
                ...mockParams,
                controlledAccess: true,
                dbGaPID: undefined,
                GPAName: undefined,
                isPendingGPA: false
            };
            await expect(service.addApprovedStudyAPI(paramsWithoutBoth, mockContext)).rejects.toThrow(ERROR.INVALID_PENDING_GPA);
        });

        it('should successfully create a controlled access study without GPAName when isPendingGPA is true', async () => {
            const paramsWithoutGPAName = {
                ...mockParams,
                controlledAccess: true,
                GPAName: undefined,
                isPendingGPA: true
            };
            const result = await service.addApprovedStudyAPI(paramsWithoutGPAName, mockContext);
            expect(service.storeApprovedStudies).toHaveBeenCalledWith(
                null, 'New Study', 'NS', 'phs001234', null, true, '0000-0002-1825-0097', 'Dr. New', false, false, false, 'contact-id', { GPAName: undefined, isPendingGPA: true }, "org-id"
            );
            expect(result).toEqual({_id: "new-study-id"});
        });

        it('should successfully create a controlled access study with empty GPAName when isPendingGPA is true', async () => {
            const paramsWithEmptyGPAName = {
                ...mockParams,
                controlledAccess: true,
                GPAName: '',
                isPendingGPA: true
            };
            const result = await service.addApprovedStudyAPI(paramsWithEmptyGPAName, mockContext);
            expect(service.storeApprovedStudies).toHaveBeenCalledWith(
                null, 'New Study', 'NS', 'phs001234', null, true, '0000-0002-1825-0097', 'Dr. New', false, false, false, 'contact-id', { GPAName: '', isPendingGPA: true }, "org-id"
            );
            expect(result).toEqual({_id: "new-study-id"});
        });

        it('should successfully create a non-controlled access study without dbGaPID', async () => {
            const paramsWithoutDbGaPID = {
                ...mockParams,
                controlledAccess: false,
                dbGaPID: undefined,
                isPendingGPA: false
            };
            const result = await service.addApprovedStudyAPI(paramsWithoutDbGaPID, mockContext);
            expect(service.storeApprovedStudies).toHaveBeenCalledWith(
                null, 'New Study', 'NS', undefined, null, false, '0000-0002-1825-0097', 'Dr. New', false, false, false, 'contact-id', { GPAName: "GPA name", isPendingGPA: false }, "org-id"
            );
            expect(result).toEqual({_id: "new-study-id"});
        });

        it('should successfully create a non-controlled access study without GPAName', async () => {
            const paramsWithoutGPAName = {
                ...mockParams,
                controlledAccess: false,
                GPAName: undefined,
                isPendingGPA: false
            };
            const result = await service.addApprovedStudyAPI(paramsWithoutGPAName, mockContext);
            expect(service.storeApprovedStudies).toHaveBeenCalledWith(
                null, 'New Study', 'NS', 'phs001234', null, false, '0000-0002-1825-0097', 'Dr. New', false, false, false, 'contact-id', { GPAName: undefined, isPendingGPA: false }, "org-id"
            );
            expect(result).toEqual({_id: "new-study-id"});
        });
    });

    describe('editApprovedStudyAPI', () => {
        const mockGPA = {"GPAName": "GPA name", "isPendingGPA": true};
        const mockParams = {
            studyID: 'study-id',
            name: 'Updated Study',
            acronym: 'US',
            controlledAccess: true,
            openAccess: true,
            dbGaPID: 'phs000001',
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
            dbGaPID: 'phs000001',
            ORCID: 'old-orcid',
            PI: 'Dr. Old',
            primaryContactID: null,
            useProgramPC: false,
            pendingModelChange: false,
            programID: 'program-id'  // New field in relationships model
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
            // Mock the organization service to return programs when finding by study ID
            service.organizationService.findOneByStudyID = jest.fn().mockResolvedValue(mockPrograms[0]);
            service.organizationService.getOrganizationByID = jest.fn().mockResolvedValue(mockPrograms[0]);
            service.organizationService.getOrganizationByName = jest.fn().mockResolvedValue({_id: 'org-id', name: 'NA'});
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

        it('should successfully update a controlled access study without dbGaPID', async () => {
            const paramsWithoutDbGaPID = {
                ...mockParams,
                controlledAccess: true,
                dbGaPID: undefined
            };
            const result = await service.editApprovedStudyAPI(paramsWithoutDbGaPID, mockContext);
            expect(service.approvedStudyDAO.update).toHaveBeenCalled();
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should throw error when updating controlled access study without GPAName and isPendingGPA false', async () => {
            const paramsWithoutGPAName = {
                ...mockParams,
                controlledAccess: true,
                GPAName: undefined,
                isPendingGPA: false
            };
            await expect(service.editApprovedStudyAPI(paramsWithoutGPAName, mockContext)).rejects.toThrow(ERROR.INVALID_PENDING_GPA);
        });

        it('should throw error when updating controlled access study with both dbGaPID and GPAName missing and isPendingGPA false', async () => {
            const paramsWithoutBoth = {
                ...mockParams,
                controlledAccess: true,
                dbGaPID: undefined,
                GPAName: undefined,
                isPendingGPA: false
            };
            await expect(service.editApprovedStudyAPI(paramsWithoutBoth, mockContext)).rejects.toThrow(ERROR.INVALID_PENDING_GPA);
        });

        it('should successfully update a non-controlled access study without dbGaPID', async () => {
            const paramsWithoutDbGaPID = {
                ...mockParams,
                controlledAccess: false,
                dbGaPID: undefined,
                isPendingGPA: false
            };
            const result = await service.editApprovedStudyAPI(paramsWithoutDbGaPID, mockContext);
            expect(service.approvedStudyDAO.update).toHaveBeenCalled();
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should successfully update a non-controlled access study without GPAName', async () => {
            const paramsWithoutGPAName = {
                ...mockParams,
                controlledAccess: false,
                GPAName: undefined,
                isPendingGPA: false
            };
            const result = await service.editApprovedStudyAPI(paramsWithoutGPAName, mockContext);
            expect(service.approvedStudyDAO.update).toHaveBeenCalled();
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should successfully update study when dbGaPID is explicitly set to null', async () => {
            const paramsWithNullDbGaPID = {
                ...mockParams,
                controlledAccess: true,
                dbGaPID: null
            };
            const result = await service.editApprovedStudyAPI(paramsWithNullDbGaPID, mockContext);
            expect(service.approvedStudyDAO.update).toHaveBeenCalled();
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should throw error when updating study with GPAName explicitly set to empty string and isPendingGPA false', async () => {
            const paramsWithEmptyGPAName = {
                ...mockParams,
                controlledAccess: true,
                GPAName: '',
                isPendingGPA: false
            };
            await expect(service.editApprovedStudyAPI(paramsWithEmptyGPAName, mockContext)).rejects.toThrow(ERROR.INVALID_PENDING_GPA);
        });

        it('should successfully update controlled access study without GPAName when isPendingGPA is true', async () => {
            const paramsWithoutGPAName = {
                ...mockParams,
                controlledAccess: true,
                GPAName: undefined,
                isPendingGPA: true
            };
            const result = await service.editApprovedStudyAPI(paramsWithoutGPAName, mockContext);
            expect(service.approvedStudyDAO.update).toHaveBeenCalled();
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should successfully update controlled access study with empty GPAName when isPendingGPA is true', async () => {
            const paramsWithEmptyGPAName = {
                ...mockParams,
                controlledAccess: true,
                GPAName: '',
                isPendingGPA: true
            };
            const result = await service.editApprovedStudyAPI(paramsWithEmptyGPAName, mockContext);
            expect(service.approvedStudyDAO.update).toHaveBeenCalled();
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should throw error if dbGaPID in wrong format when updating the study', async () => {
            const mockParamsUpdateStudy = {
                ...mockParams,
                dbGaPID: 'phs000001.v1.p1' // invalid format
            };
            await expect(service.editApprovedStudyAPI(mockParamsUpdateStudy, mockContext))
                .rejects.toThrow(ERROR.INVALID_DB_GAP_ID);
        });

        it('should update the study successfully if dbGaPID in correct format when updating the study', async () => {
            const mockParamsUpdateStudy = {
                ...mockParams,
                dbGaPID: 'phs000002' // invalid format
            };
            const result = await service.editApprovedStudyAPI(mockParamsUpdateStudy, mockContext);
            expect(result).toEqual(mockDisplayStudy);
        });

        it('should update the study successfully if dbGaPID in correct format but with upper-case when updating the study', async () => {
            const mockParamsUpdateStudy = {
                ...mockParams,
                dbGaPID: 'Phs000002' // invalid format
            };
            const result = await service.editApprovedStudyAPI(mockParamsUpdateStudy, mockContext);
            expect(result).toEqual(mockDisplayStudy);
        });

        describe('programID assignment fixes', () => {
            it('should set programID to null when program._id is undefined', async () => {
                const programWithUndefinedId = { _id: undefined, conciergeID: 'concierge-id' };
                service._validateProgramID = jest.fn().mockResolvedValue(programWithUndefinedId);
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: 'some-id' }, mockContext);
                
                const updateCall = service.approvedStudyDAO.update.mock.calls[0];
                expect(updateCall[1].programID).toBeNull();
            });

            it('should set programID to program._id when program._id exists', async () => {
                const programWithValidId = { _id: 'valid-program-id', conciergeID: 'concierge-id' };
                service._validateProgramID = jest.fn().mockResolvedValue(programWithValidId);
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: 'valid-program-id' }, mockContext);
                
                const updateCall = service.approvedStudyDAO.update.mock.calls[0];
                expect(updateCall[1].programID).toBe('valid-program-id');
            });
        });

        describe('conciergeID assignment fix', () => {
            it('should use program.conciergeID without optional chaining when useProgramPC is true', async () => {
                const programWithConcierge = { _id: 'program-id', conciergeID: 'concierge-id-123' };
                service._validateProgramID = jest.fn().mockResolvedValue(programWithConcierge);
                
                await service.editApprovedStudyAPI({ ...mockParams, useProgramPC: true, primaryContactID: null }, mockContext);
                
                // Verify submission update was called with correct conciergeID
                const submissionUpdateCalls = service.submissionDAO.updateMany.mock.calls;
                const conciergeUpdateCall = submissionUpdateCalls.find(call => 
                    call[0].conciergeID && call[1].conciergeID === 'concierge-id-123'
                );
                expect(conciergeUpdateCall).toBeDefined();
            });

            it('should handle program.conciergeID being undefined when useProgramPC is true', async () => {
                const programWithoutConcierge = { _id: 'program-id', conciergeID: undefined };
                service._validateProgramID = jest.fn().mockResolvedValue(programWithoutConcierge);
                
                await service.editApprovedStudyAPI({ ...mockParams, useProgramPC: true, primaryContactID: null }, mockContext);
                
                // Verify conciergeID falls back to empty string
                const submissionUpdateCalls = service.submissionDAO.updateMany.mock.calls;
                const conciergeUpdateCall = submissionUpdateCalls.find(call => 
                    call[0].conciergeID && call[1].conciergeID === ''
                );
                expect(conciergeUpdateCall).toBeDefined();
            });
        });

        describe('submission programID update when study program changes', () => {

            it('should update submission programID when study programID changes', async () => {
                const oldProgramID = 'old-program-id';
                const newProgramID = 'new-program-id';
                const studyWithOldProgram = { ...mockStudy, programID: oldProgramID };
                const programWithNewId = { _id: newProgramID, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithOldProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithNewId);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 0 }) // First call for conciergeID
                    .mockResolvedValueOnce({ count: 5 }); // Second call for programID
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: newProgramID }, mockContext);
                
                // Verify submissionDAO.updateMany was called twice: once for conciergeID, once for programID
                expect(service.submissionDAO.updateMany).toHaveBeenCalledTimes(2);
                
                // Verify the programID update call
                const programIDUpdateCall = service.submissionDAO.updateMany.mock.calls[1];
                expect(programIDUpdateCall[0]).toEqual({
                    studyID: 'study-id',
                    status: {
                        in: [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, CANCELED, DELETED, ARCHIVED]
                    },
                    programID: { not: newProgramID }
                });
                expect(programIDUpdateCall[1]).toEqual({
                    programID: newProgramID,
                    updatedAt: expect.any(Date)
                });
            });

            it('should not update submission programID when study programID does not change', async () => {
                const sameProgramID = 'same-program-id';
                const studyWithProgram = { ...mockStudy, programID: sameProgramID };
                const programWithSameId = { _id: sameProgramID, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithSameId);
                service.submissionDAO.updateMany = jest.fn().mockResolvedValue({ count: 0 }); // Only conciergeID update
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: sameProgramID }, mockContext);
                
                // Verify submissionDAO.updateMany was called only once (for conciergeID)
                expect(service.submissionDAO.updateMany).toHaveBeenCalledTimes(1);
                
                // Verify the call was only for conciergeID, not programID
                const updateCall = service.submissionDAO.updateMany.mock.calls[0];
                expect(updateCall[0].conciergeID).toBeDefined();
                expect(updateCall[1].conciergeID).toBeDefined();
            });

            it('should not update submission programID when oldProgramID is null and newProgramID is null', async () => {
                const studyWithNullProgram = { ...mockStudy, programID: null };
                const naProgram = { _id: null, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithNullProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(naProgram);
                service.submissionDAO.updateMany = jest.fn().mockResolvedValue({ count: 0 }); // Only conciergeID update
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: null }, mockContext);
                
                // Verify submissionDAO.updateMany was called only once (for conciergeID)
                expect(service.submissionDAO.updateMany).toHaveBeenCalledTimes(1);
            });

            it('should use correct status filter excluding COMPLETED', async () => {
                const oldProgramID = 'old-program-id';
                const newProgramID = 'new-program-id';
                const studyWithOldProgram = { ...mockStudy, programID: oldProgramID };
                const programWithNewId = { _id: newProgramID, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithOldProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithNewId);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 0 }) // conciergeID update
                    .mockResolvedValueOnce({ count: 3 }); // programID update
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: newProgramID }, mockContext);
                
                // Verify status filter includes all valid statuses except COMPLETED
                const programIDUpdateCall = service.submissionDAO.updateMany.mock.calls[1];
                const statusList = programIDUpdateCall[0].status.in;
                expect(statusList).toContain(NEW);
                expect(statusList).toContain(IN_PROGRESS);
                expect(statusList).toContain(SUBMITTED);
                expect(statusList).toContain(WITHDRAWN);
                expect(statusList).toContain(RELEASED);
                expect(statusList).toContain(REJECTED);
                expect(statusList).toContain(CANCELED);
                expect(statusList).toContain(DELETED);
                expect(statusList).toContain(ARCHIVED);
                expect(statusList).not.toContain('Completed');
            });

            it('should only update submissions that do not already have the correct programID', async () => {
                const oldProgramID = 'old-program-id';
                const newProgramID = 'new-program-id';
                const studyWithOldProgram = { ...mockStudy, programID: oldProgramID };
                const programWithNewId = { _id: newProgramID, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithOldProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithNewId);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 0 }) // conciergeID update
                    .mockResolvedValueOnce({ count: 2 }); // programID update
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: newProgramID }, mockContext);
                
                // Verify filter includes programID: { not: newProgramID }
                const programIDUpdateCall = service.submissionDAO.updateMany.mock.calls[1];
                expect(programIDUpdateCall[0].programID).toEqual({ not: newProgramID });
            });

            it('should handle programID change from null to valid programID', async () => {
                const newProgramID = 'new-program-id';
                const studyWithNullProgram = { ...mockStudy, programID: null };
                const programWithNewId = { _id: newProgramID, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithNullProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithNewId);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 0 }) // conciergeID update
                    .mockResolvedValueOnce({ count: 3 }); // programID update
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: newProgramID }, mockContext);
                
                // Verify programID update was called
                expect(service.submissionDAO.updateMany).toHaveBeenCalledTimes(2);
                const programIDUpdateCall = service.submissionDAO.updateMany.mock.calls[1];
                expect(programIDUpdateCall[1].programID).toBe(newProgramID);
            });

            it('should handle programID change from valid programID to null', async () => {
                const oldProgramID = 'old-program-id';
                const studyWithProgram = { ...mockStudy, programID: oldProgramID };
                const naProgram = { _id: null, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(naProgram);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 0 }) // conciergeID update
                    .mockResolvedValueOnce({ count: 2 }); // programID update
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: null }, mockContext);
                
                // Verify programID update was called with null
                expect(service.submissionDAO.updateMany).toHaveBeenCalledTimes(2);
                const programIDUpdateCall = service.submissionDAO.updateMany.mock.calls[1];
                expect(programIDUpdateCall[1].programID).toBeNull();
            });

            it('should handle submission update failure gracefully without throwing', async () => {
                const oldProgramID = 'old-program-id';
                const newProgramID = 'new-program-id';
                const studyWithOldProgram = { ...mockStudy, programID: oldProgramID };
                const programWithNewId = { _id: newProgramID, conciergeID: 'concierge-id' };
                const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithOldProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithNewId);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 0 }) // conciergeID update succeeds
                    .mockResolvedValueOnce(null); // programID update fails
                
                // Should not throw error
                await expect(service.editApprovedStudyAPI({ ...mockParams, programID: newProgramID }, mockContext))
                    .resolves.toBeDefined();
                
                // Verify error was logged
                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining(ERROR.FAILED_UPDATE_SUBMISSION),
                    expect.stringContaining('StudyID: study-id')
                );
                
                consoleSpy.mockRestore();
            });

            it('should handle submission update returning count of 0', async () => {
                const oldProgramID = 'old-program-id';
                const newProgramID = 'new-program-id';
                const studyWithOldProgram = { ...mockStudy, programID: oldProgramID };
                const programWithNewId = { _id: newProgramID, conciergeID: 'concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithOldProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithNewId);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 0 }) // conciergeID update
                    .mockResolvedValueOnce({ count: 0 }); // programID update (no submissions to update)
                
                // Should not throw error
                await expect(service.editApprovedStudyAPI({ ...mockParams, programID: newProgramID }, mockContext))
                    .resolves.toBeDefined();
                
                expect(service.submissionDAO.updateMany).toHaveBeenCalledTimes(2);
            });

            it('should update both conciergeID and programID when both change', async () => {
                const oldProgramID = 'old-program-id';
                const newProgramID = 'new-program-id';
                const studyWithOldProgram = { ...mockStudy, programID: oldProgramID };
                const programWithNewId = { _id: newProgramID, conciergeID: 'new-concierge-id' };
                
                service.approvedStudyDAO.findFirst = jest.fn().mockResolvedValue(studyWithOldProgram);
                service._validateProgramID = jest.fn().mockResolvedValue(programWithNewId);
                service.submissionDAO.updateMany = jest.fn()
                    .mockResolvedValueOnce({ count: 2 }) // conciergeID update
                    .mockResolvedValueOnce({ count: 3 }); // programID update
                
                await service.editApprovedStudyAPI({ ...mockParams, programID: newProgramID, useProgramPC: true, primaryContactID: null }, mockContext);
                
                // Verify both updates were called
                expect(service.submissionDAO.updateMany).toHaveBeenCalledTimes(2);
                
                // Verify conciergeID update
                const conciergeUpdateCall = service.submissionDAO.updateMany.mock.calls[0];
                expect(conciergeUpdateCall[1].conciergeID).toBe('new-concierge-id');
                
                // Verify programID update
                const programIDUpdateCall = service.submissionDAO.updateMany.mock.calls[1];
                expect(programIDUpdateCall[1].programID).toBe(newProgramID);
            });
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
            program: { _id: 'org-id', name: 'Org' },
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
        const dbGaPID = 'phs001234';
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
            const validProgramID = 'valid-program-id-123';
            const validProgram = { _id: validProgramID, name: 'Test Program' };
            
            // Mock organization service to return a valid program
            mockOrganizationService.getOrganizationByID.mockResolvedValue(validProgram);

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
                null, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess,
                useProgramPC, pendingModelChange, primaryContactID, null, validProgramID
            );

            // Accept extra undefined argument for compatibility
            const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0] || [];
            // Accept trailing programID for compatibility
            expect(callArgs.slice(0, 13)).toEqual([
                null,
                studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess,
                useProgramPC, pendingModelChange, primaryContactID, null
            ]);

            // Check that DAO create was called with the correct study
            expect(service.approvedStudyDAO.create).toHaveBeenCalledWith(fakeStudy);

            expect(result).toBe(fakeStudy);
        });

        it('should log error and return undefined if insertion fails', async () => {
            const validProgramID = 'valid-program-id-123';
            const validProgram = { _id: validProgramID, name: 'Test Program' };
            
            // Mock organization service to return a valid program
            mockOrganizationService.getOrganizationByID.mockResolvedValue(validProgram);

            service.approvedStudyDAO = {
                create: jest.fn()
            };

            ApprovedStudies.createApprovedStudies.mockReturnValue(fakeStudy);
            mockApprovedStudiesCollection.findOneAndUpdate.mockResolvedValue({ value: undefined });
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

            const result = await service.storeApprovedStudies(
                null, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess,
                useProgramPC, pendingModelChange, primaryContactID, null, validProgramID
            );

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining("An error occurred while attempting to insert the approved studies into the database.")
            );
            expect(result).toBeUndefined();
            consoleSpy.mockRestore();
        });

        it('should pass applicationID to createApprovedStudies when provided', async () => {
            const validProgramID = 'valid-program-id-123';
            const validProgram = { _id: validProgramID, name: 'Test Program' };
            const applicationID = 'app-789';
            const studyWithAppID = { ...fakeStudy, applicationID };

            mockOrganizationService.getOrganizationByID.mockResolvedValue(validProgram);

            ApprovedStudies.createApprovedStudies.mockReturnValue(studyWithAppID);

            service.approvedStudyDAO = {
                create: jest.fn().mockResolvedValue(studyWithAppID)
            };

            const result = await service.storeApprovedStudies(
                applicationID, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess,
                useProgramPC, pendingModelChange, primaryContactID, null, validProgramID
            );

            // Verify applicationID is passed as first argument
            const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0];
            expect(callArgs[0]).toBe(applicationID);

            expect(result).toBe(studyWithAppID);
        });

        it('should pass null applicationID to createApprovedStudies when not provided', async () => {
            const validProgramID = 'valid-program-id-123';
            const validProgram = { _id: validProgramID, name: 'Test Program' };

            mockOrganizationService.getOrganizationByID.mockResolvedValue(validProgram);

            ApprovedStudies.createApprovedStudies.mockReturnValue(fakeStudy);

            service.approvedStudyDAO = {
                create: jest.fn().mockResolvedValue(fakeStudy)
            };

            await service.storeApprovedStudies(
                null, studyName, studyAbbreviation, dbGaPID, organizationName, controlledAccess, ORCID, PI, openAccess,
                useProgramPC, pendingModelChange, primaryContactID, null, validProgramID
            );

            // Verify applicationID is null as first argument
            const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0];
            expect(callArgs[0]).toBeNull();
        });

        describe('NA program fallback behavior', () => {
            const mockNAProgram = {
                _id: '437e864a-621b-40f5-b214-3dc368137081',
                name: 'NA',
                abbreviation: 'NA',
                status: 'Active'
            };

            beforeEach(() => {
                ApprovedStudies.createApprovedStudies.mockReturnValue(fakeStudy);
                service.approvedStudyDAO = {
                    create: jest.fn().mockResolvedValue(fakeStudy)
                };
            });

            it('should fall back to NA program when programID is null', async () => {
                // Mock getOrganizationByID to return null (no program found for provided ID)
                mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
                // Mock getOrganizationByName to return the NA program
                mockOrganizationService.getOrganizationByName.mockResolvedValue(mockNAProgram);

                await service.storeApprovedStudies(
                    null, studyName, studyAbbreviation, dbGaPID, organizationName, 
                    controlledAccess, ORCID, PI, openAccess, useProgramPC, 
                    pendingModelChange, primaryContactID, null, null // programID is null
                );

                // Should have looked up NA program by name
                expect(mockOrganizationService.getOrganizationByName).toHaveBeenCalledWith('NA');
                
                // Should have created the study with the NA program ID
                const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0];
                const passedProgramID = callArgs[callArgs.length - 1];
                expect(passedProgramID).toBe(mockNAProgram._id);
            });

            it('should fall back to NA program when programID is undefined', async () => {
                mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
                mockOrganizationService.getOrganizationByName.mockResolvedValue(mockNAProgram);

                await service.storeApprovedStudies(
                    null, studyName, studyAbbreviation, dbGaPID, organizationName, 
                    controlledAccess, ORCID, PI, openAccess, useProgramPC, 
                    pendingModelChange, primaryContactID, null, undefined // programID is undefined
                );

                expect(mockOrganizationService.getOrganizationByName).toHaveBeenCalledWith('NA');
                
                const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0];
                const passedProgramID = callArgs[callArgs.length - 1];
                expect(passedProgramID).toBe(mockNAProgram._id);
            });

            it('should use provided programID when it is valid', async () => {
                const validProgramID = 'valid-program-id-123';
                const validProgram = { _id: validProgramID, name: 'Test Program' };
                
                mockOrganizationService.getOrganizationByID.mockResolvedValue(validProgram);

                await service.storeApprovedStudies(
                    null, studyName, studyAbbreviation, dbGaPID, organizationName, 
                    controlledAccess, ORCID, PI, openAccess, useProgramPC, 
                    pendingModelChange, primaryContactID, null, validProgramID
                );

                // Should have validated the program by ID
                expect(mockOrganizationService.getOrganizationByID).toHaveBeenCalledWith(validProgramID);
                // Should NOT have fallen back to NA program
                expect(mockOrganizationService.getOrganizationByName).not.toHaveBeenCalled();
                
                const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0];
                const passedProgramID = callArgs[callArgs.length - 1];
                expect(passedProgramID).toBe(validProgramID);
            });

            it('should throw error when programID is null and NA program is not found', async () => {
                mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
                mockOrganizationService.getOrganizationByName.mockResolvedValue(null);
                
                const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

                await expect(service.storeApprovedStudies(
                    null, studyName, studyAbbreviation, dbGaPID, organizationName, 
                    controlledAccess, ORCID, PI, openAccess, useProgramPC, 
                    pendingModelChange, primaryContactID, null, null
                )).rejects.toThrow();

                expect(consoleSpy).toHaveBeenCalledWith(
                    expect.stringContaining('Unable to find a program with the provided programID')
                );
                consoleSpy.mockRestore();
            });

            it('should fall back to NA program when provided programID does not exist', async () => {
                const invalidProgramID = 'non-existent-program-id';
                
                // First call (getOrganizationByID) returns null - program not found
                mockOrganizationService.getOrganizationByID.mockResolvedValue(null);
                // Second call (getOrganizationByName) returns NA program
                mockOrganizationService.getOrganizationByName.mockResolvedValue(mockNAProgram);

                await service.storeApprovedStudies(
                    null, studyName, studyAbbreviation, dbGaPID, organizationName, 
                    controlledAccess, ORCID, PI, openAccess, useProgramPC, 
                    pendingModelChange, primaryContactID, null, invalidProgramID
                );

                expect(mockOrganizationService.getOrganizationByID).toHaveBeenCalledWith(invalidProgramID);
                expect(mockOrganizationService.getOrganizationByName).toHaveBeenCalledWith('NA');
                
                const callArgs = ApprovedStudies.createApprovedStudies.mock.calls[0];
                const passedProgramID = callArgs[callArgs.length - 1];
                expect(passedProgramID).toBe(mockNAProgram._id);
            });
        });
    });

    describe('validation methods', () => {
        describe('_verifyAndFormatStudyParams', () => {
            it('should not throw error when dbGaPID is missing for controlled access study', () => {
                const params = {
                    name: 'Test Study',
                    controlledAccess: true,
                    dbGaPID: undefined
                };
                expect(() => service._verifyAndFormatStudyParams(params)).not.toThrow();
            });

            it('should not throw error when dbGaPID is null for controlled access study', () => {
                const params = {
                    name: 'Test Study',
                    controlledAccess: true,
                    dbGaPID: null
                };
                expect(() => service._verifyAndFormatStudyParams(params)).not.toThrow();
            });

            it('should not throw error when dbGaPID is empty string for controlled access study', () => {
                const params = {
                    name: 'Test Study',
                    controlledAccess: true,
                    dbGaPID: ''
                };
                expect(() => service._verifyAndFormatStudyParams(params)).not.toThrow();
            });

            it('should not throw error when dbGaPID is missing for non-controlled access study', () => {
                const params = {
                    name: 'Test Study',
                    controlledAccess: false,
                    dbGaPID: undefined
                };
                expect(() => service._verifyAndFormatStudyParams(params)).not.toThrow();
            });

            it('should still validate ORCID format when provided', () => {
                const params = {
                    name: 'Test Study',
                    controlledAccess: true,
                    dbGaPID: undefined,
                    ORCID: 'invalid-orcid'
                };
                expect(() => service._verifyAndFormatStudyParams(params)).toThrow(ERROR.INVALID_ORCID);
            });
        });

        describe('_validatePendingGPA', () => {
            it('should throw error when GPAName is missing for controlled access study with isPendingGPA false', () => {
                expect(() => service._validatePendingGPA(undefined, true, false)).toThrow(ERROR.INVALID_PENDING_GPA);
            });

            it('should throw error when GPAName is null for controlled access study with isPendingGPA false', () => {
                expect(() => service._validatePendingGPA(null, true, false)).toThrow(ERROR.INVALID_PENDING_GPA);
            });

            it('should throw error when GPAName is empty string for controlled access study with isPendingGPA false', () => {
                expect(() => service._validatePendingGPA('', true, false)).toThrow(ERROR.INVALID_PENDING_GPA);
            });

            it('should throw error when GPAName is whitespace-only for controlled access study with isPendingGPA false', () => {
                expect(() => service._validatePendingGPA('   ', true, false)).toThrow(ERROR.INVALID_PENDING_GPA);
            });

            it('should not throw error when GPAName is missing for controlled access study with isPendingGPA true', () => {
                expect(() => service._validatePendingGPA(undefined, true, true)).not.toThrow();
            });

            it('should not throw error when GPAName is null for controlled access study with isPendingGPA true', () => {
                expect(() => service._validatePendingGPA(null, true, true)).not.toThrow();
            });

            it('should not throw error when GPAName is empty string for controlled access study with isPendingGPA true', () => {
                expect(() => service._validatePendingGPA('', true, true)).not.toThrow();
            });

            it('should not throw error when GPAName has valid value for controlled access study with isPendingGPA false', () => {
                expect(() => service._validatePendingGPA('Valid GPA Name', true, false)).not.toThrow();
            });

            it('should not throw error when GPAName has valid value for controlled access study with isPendingGPA true', () => {
                expect(() => service._validatePendingGPA('Valid GPA Name', true, true)).not.toThrow();
            });

            it('should not throw error when GPAName is missing for non-controlled access study', () => {
                expect(() => service._validatePendingGPA(undefined, false, false)).not.toThrow();
            });

            it('should still throw error when isPendingGPA is true for non-controlled access study', () => {
                expect(() => service._validatePendingGPA('GPA Name', false, true)).toThrow(ERROR.INVALID_PENDING_GPA);
            });
        });

    });
});