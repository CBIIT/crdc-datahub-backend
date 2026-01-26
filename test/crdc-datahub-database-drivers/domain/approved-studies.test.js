const { ApprovedStudies } = require('../../../crdc-datahub-database-drivers/domain/approved-studies');

// Mock the time-utility module
jest.mock('../../../crdc-datahub-database-drivers/utility/time-utility', () => ({
    getCurrentTime: jest.fn(() => new Date('2026-01-26T00:00:00.000Z'))
}));

describe('ApprovedStudies Domain Object', () => {
    const baseParams = {
        applicationID: 'app-123',
        studyName: 'Test Study',
        studyAbbreviation: 'TS',
        dbGaPID: 'phs001234',
        organizationName: 'Test Organization',
        controlledAccess: true,
        ORCID: '0000-0001-2345-6789',
        PI: 'Dr. Test',
        openAccess: false,
        useProgramPC: false,
        pendingModelChange: true,
        primaryContactID: 'contact-123',
        pendingGPA: { GPAName: 'Test GPA', isPendingGPA: true },
        programID: 'program-123'
    };

    describe('constructor', () => {
        describe('applicationID handling', () => {
            it('should store applicationID when provided', () => {
                const study = new ApprovedStudies(
                    'app-123',
                    baseParams.studyName,
                    baseParams.studyAbbreviation,
                    baseParams.dbGaPID,
                    baseParams.organizationName,
                    baseParams.controlledAccess,
                    baseParams.ORCID,
                    baseParams.PI,
                    baseParams.openAccess,
                    baseParams.useProgramPC,
                    baseParams.pendingModelChange,
                    baseParams.primaryContactID,
                    baseParams.pendingGPA,
                    baseParams.programID
                );

                expect(study.applicationID).toBe('app-123');
            });

            it('should not set applicationID when null', () => {
                const study = new ApprovedStudies(
                    null,
                    baseParams.studyName,
                    baseParams.studyAbbreviation,
                    baseParams.dbGaPID,
                    baseParams.organizationName,
                    baseParams.controlledAccess,
                    baseParams.ORCID,
                    baseParams.PI,
                    baseParams.openAccess,
                    baseParams.useProgramPC,
                    baseParams.pendingModelChange,
                    baseParams.primaryContactID,
                    baseParams.pendingGPA,
                    baseParams.programID
                );

                expect(study.applicationID).toBeUndefined();
            });

            it('should not set applicationID when undefined', () => {
                const study = new ApprovedStudies(
                    undefined,
                    baseParams.studyName,
                    baseParams.studyAbbreviation,
                    baseParams.dbGaPID,
                    baseParams.organizationName,
                    baseParams.controlledAccess,
                    baseParams.ORCID,
                    baseParams.PI,
                    baseParams.openAccess,
                    baseParams.useProgramPC,
                    baseParams.pendingModelChange,
                    baseParams.primaryContactID,
                    baseParams.pendingGPA,
                    baseParams.programID
                );

                expect(study.applicationID).toBeUndefined();
            });

            it('should not set applicationID when empty string', () => {
                const study = new ApprovedStudies(
                    '',
                    baseParams.studyName,
                    baseParams.studyAbbreviation,
                    baseParams.dbGaPID,
                    baseParams.organizationName,
                    baseParams.controlledAccess,
                    baseParams.ORCID,
                    baseParams.PI,
                    baseParams.openAccess,
                    baseParams.useProgramPC,
                    baseParams.pendingModelChange,
                    baseParams.primaryContactID,
                    baseParams.pendingGPA,
                    baseParams.programID
                );

                expect(study.applicationID).toBeUndefined();
            });
        });

        describe('required fields', () => {
            it('should always set studyName', () => {
                const study = new ApprovedStudies(
                    null,
                    'My Study',
                    null,
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.studyName).toBe('My Study');
            });

            it('should always set studyAbbreviation', () => {
                const study = new ApprovedStudies(
                    null,
                    'My Study',
                    'MS',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.studyAbbreviation).toBe('MS');
            });

            it('should always set controlledAccess as boolean', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    true,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.controlledAccess).toBe(true);
            });

            it('should always set openAccess as boolean', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    true,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.openAccess).toBe(true);
            });

            it('should set createdAt and updatedAt to current time', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.createdAt).toEqual(new Date('2026-01-26T00:00:00.000Z'));
                expect(study.updatedAt).toEqual(new Date('2026-01-26T00:00:00.000Z'));
            });

            it('should always set programID', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    'program-456'
                );

                expect(study.programID).toBe('program-456');
            });
        });

        describe('optional fields', () => {
            it('should set dbGaPID when provided', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    'phs001234',
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.dbGaPID).toBe('phs001234');
            });

            it('should not set dbGaPID when null', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.dbGaPID).toBeUndefined();
            });

            it('should set originalOrg when organizationName provided', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    'Test Org',
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.originalOrg).toBe('Test Org');
            });

            it('should set ORCID when provided', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    '0000-0001-2345-6789',
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.ORCID).toBe('0000-0001-2345-6789');
            });

            it('should set PI when provided', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    'Dr. Smith',
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.PI).toBe('Dr. Smith');
            });

            it('should set primaryContactID when provided', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    'contact-123',
                    null,
                    null
                );

                expect(study.primaryContactID).toBe('contact-123');
            });
        });

        describe('pendingModelChange handling', () => {
            it('should set pendingModelChange to true when true', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    true,
                    null,
                    null,
                    null
                );

                expect(study.pendingModelChange).toBe(true);
            });

            it('should set pendingModelChange to false when false', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    null,
                    null
                );

                expect(study.pendingModelChange).toBe(false);
            });

            it('should default pendingModelChange to true when null/undefined', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false,
                    null,
                    null,
                    false,
                    false,
                    null,
                    null,
                    null,
                    null
                );

                expect(study.pendingModelChange).toBe(true);
            });
        });

        describe('pendingGPA handling', () => {
            it('should set GPAName when provided in pendingGPA', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    true,
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    { GPAName: 'Test GPA', isPendingGPA: true },
                    null
                );

                expect(study.GPAName).toBe('Test GPA');
            });

            it('should set isPendingGPA to true when controlledAccess is true and isPendingGPA is true', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    true, // controlledAccess
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    { GPAName: 'Test GPA', isPendingGPA: true },
                    null
                );

                expect(study.isPendingGPA).toBe(true);
            });

            it('should set isPendingGPA to false when controlledAccess is false', () => {
                const study = new ApprovedStudies(
                    null,
                    'Study',
                    'S',
                    null,
                    null,
                    false, // controlledAccess
                    null,
                    null,
                    false,
                    false,
                    false,
                    null,
                    { GPAName: 'Test GPA', isPendingGPA: true },
                    null
                );

                expect(study.isPendingGPA).toBe(false);
            });
        });
    });

    describe('createApprovedStudies static method', () => {
        it('should create an ApprovedStudies instance with applicationID', () => {
            const study = ApprovedStudies.createApprovedStudies(
                'app-456',
                baseParams.studyName,
                baseParams.studyAbbreviation,
                baseParams.dbGaPID,
                baseParams.organizationName,
                baseParams.controlledAccess,
                baseParams.ORCID,
                baseParams.PI,
                baseParams.openAccess,
                baseParams.useProgramPC,
                baseParams.pendingModelChange,
                baseParams.primaryContactID,
                baseParams.pendingGPA,
                baseParams.programID
            );

            expect(study).toBeInstanceOf(ApprovedStudies);
            expect(study.applicationID).toBe('app-456');
            expect(study.studyName).toBe(baseParams.studyName);
        });

        it('should create an ApprovedStudies instance without applicationID when null', () => {
            const study = ApprovedStudies.createApprovedStudies(
                null,
                baseParams.studyName,
                baseParams.studyAbbreviation,
                baseParams.dbGaPID,
                baseParams.organizationName,
                baseParams.controlledAccess,
                baseParams.ORCID,
                baseParams.PI,
                baseParams.openAccess,
                baseParams.useProgramPC,
                baseParams.pendingModelChange,
                baseParams.primaryContactID,
                baseParams.pendingGPA,
                baseParams.programID
            );

            expect(study).toBeInstanceOf(ApprovedStudies);
            expect(study.applicationID).toBeUndefined();
        });
    });
});
