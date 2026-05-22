const { Application } = require('../../services/application');

const mockLogCollection = { insert: jest.fn() };
const mockApplicationCollection = {};
const mockApprovedStudiesService = {};
const mockUserService = {
  getUsersByNotifications: jest.fn(),
  getUserByID: jest.fn(),
  userCollection: {
    find: jest.fn(),
    aggregate: jest.fn()
  }
};
const mockDbService = {};
const mockNotificationsService = {
  finalRemindApplicationsNotification: jest.fn(),
  remindApplicationsNotification: jest.fn()
};
const mockEmailParams = {
  inactiveDays: 180,
  inactiveNewApplicationDays: 30,
  url: 'http://test.com',
  officialEmail: 'test@example.com',
  inactiveApplicationNotifyDays: [7, 15, 30]
};
const mockOrganizationService = {};
const mockConfigurationService = {};

describe('remindApplicationSubmission', () => {
  let applicationService;
  let mockApplicationDAO;

  beforeEach(() => {
    jest.clearAllMocks();

    jest.spyOn(console, 'log').mockImplementation(() => { });
    jest.spyOn(console, 'error').mockImplementation(() => { });

    global.DELETED = 'DELETED';
    global.NEW = 'New';
    global.EMAIL_NOTIFICATIONS = {
      SUBMISSION_REQUEST: {
        REQUEST_EXPIRING: 'REQUEST_EXPIRING'
      }
    };
    global.ROLES = {
      FEDERAL_LEAD: 'FEDERAL_LEAD',
      DATA_COMMONS_PERSONNEL: 'DATA_COMMONS_PERSONNEL',
      ADMIN: 'ADMIN'
    };

    mockApplicationDAO = {
      getInactiveApplication: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn()
    };

    applicationService = new Application(
      mockLogCollection,
      mockApplicationCollection,
      mockApprovedStudiesService,
      mockUserService,
      mockDbService,
      mockNotificationsService,
      mockEmailParams,
      mockOrganizationService,
      null,
      mockConfigurationService,
      null
    );

    applicationService.applicationDAO = mockApplicationDAO;
    applicationService.userDAO = { findFirst: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Dual-window reminder logic', () => {
    it('should fetch applications from both default and short windows', async () => {
      // All empty - no reminders to send
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([]) // final default
        .mockResolvedValueOnce([]); // final short

      mockApplicationDAO.updateMany.mockResolvedValue({ matchedCount: 0 });

      // No interval reminders
      for (let i = 0; i < 6; i++) {
        mockApplicationDAO.getInactiveApplication.mockResolvedValueOnce([]);
      }

      await applicationService.remindApplicationSubmission();

      // Should have called getInactiveApplication at least twice (final default + final short)
      const calls = mockApplicationDAO.getInactiveApplication.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      // First two calls should be for final reminders
      expect(calls[0][1]).toBe('finalInactiveReminder'); // default window
      expect(calls[1][1]).toBe('finalInactiveReminder'); // short window
    });

    it('passes studyName NA for blank New SRF inactive reminders', async () => {
      const mockBlankNewApp = {
        _id: 'app-blank-new',
        applicantID: 'user-blank',
        studyAbbreviation: undefined,
        studyName: undefined,
        programName: undefined,
        status: 'New',
        ORCID: undefined,
        PI: undefined,
        programAbbreviation: undefined,
        programDescription: undefined,
        history: [],
        updatedAt: new Date('2023-01-01')
      };

      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([]) // final default
        .mockResolvedValueOnce([]) // final short
        .mockResolvedValueOnce([]) // day 7 default (180 - 7)
        .mockResolvedValueOnce([mockBlankNewApp]) // day 7 short (30 - 7)
        .mockResolvedValueOnce([]) // day 15 default
        .mockResolvedValueOnce([]) // day 15 short
        .mockResolvedValueOnce([]); // day 30 default

      mockApplicationDAO.update.mockResolvedValue({ matchedCount: 1 });

      mockUserService.getUsersByNotifications.mockResolvedValue([]);
      mockUserService.getUserByID.mockResolvedValue({
        firstName: 'Blank',
        lastName: 'User',
        email: 'blank@example.com',
        notifications: ['submission_request:expiring']
      });
      mockUserService.userCollection.find.mockResolvedValue([]);
      applicationService.userDAO.findFirst.mockResolvedValue(null);

      await applicationService.remindApplicationSubmission();

      expect(mockNotificationsService.remindApplicationsNotification).toHaveBeenCalledWith(
        'blank@example.com',
        [],
        [],
        expect.objectContaining({
          firstName: 'Blank User',
          studyName: 'NA'
        }),
        expect.objectContaining({
          remainDays: 7,
          inactiveDays: 23,
          url: 'http://test.com'
        })
      );
    });

    it('should only send short window reminders for blank New SRFs', async () => {
      const mockBlankNewApp = {
        _id: 'app-blank-new',
        applicantID: 'user-blank',
        studyAbbreviation: undefined,
        studyName: undefined,
        programName: undefined,
        status: 'New',
        ORCID: undefined,
        PI: undefined,
        programAbbreviation: undefined,
        programDescription: undefined,
        history: [],
        updatedAt: new Date('2023-01-01')
      };

      const mockRegularApp = {
        _id: 'app-regular',
        applicantID: 'user-regular',
        studyName: 'Regular Study',
        status: 'In Progress',
        history: [],
        updatedAt: new Date('2023-01-01')
      };

      // Final reminders
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([mockRegularApp]) // final default - has study name
        .mockResolvedValueOnce([mockBlankNewApp, mockRegularApp]); // final short - both present

      mockApplicationDAO.updateMany.mockResolvedValue({ matchedCount: 0 });

      // No interval reminders
      for (let i = 0; i < 6; i++) {
        mockApplicationDAO.getInactiveApplication.mockResolvedValueOnce([]);
      }

      mockUserService.getUsersByNotifications.mockResolvedValue([
        { _id: 'user-blank', email: 'blank@example.com' },
        { _id: 'user-regular', email: 'regular@example.com' }
      ]);

      mockUserService.getUserByID.mockResolvedValue({
        _id: 'user-test',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com'
      });

      mockUserService.userCollection.find.mockResolvedValue([]);
      applicationService.userDAO.findFirst.mockResolvedValue(null);

      await applicationService.remindApplicationSubmission();

      // getInactiveApplication should have been called
      expect(mockApplicationDAO.getInactiveApplication).toHaveBeenCalled();
    });

    it('should track and deduplicate reminders across intervals', async () => {
      const mockApp = {
        _id: 'app-tracked',
        applicantID: 'user-tracked',
        studyAbbreviation: 'TRACK',
        status: 'In Progress',
        history: [],
        updatedAt: new Date('2023-01-01')
      };

      // Final reminders
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([]) // final default
        .mockResolvedValueOnce([]); // final short

      mockApplicationDAO.updateMany.mockResolvedValue({ matchedCount: 0 });

      // Same app appears in multiple intervals (simulating it's returning at different reminder intervals)
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([mockApp]) // 7 days default
        .mockResolvedValueOnce([]) // 7 days short
        .mockResolvedValueOnce([mockApp]) // 15 days default
        .mockResolvedValueOnce([]) // 15 days short
        .mockResolvedValueOnce([mockApp]) // 30 days default
        .mockResolvedValueOnce([]); // 30 days short

      mockApplicationDAO.update.mockResolvedValue({ matchedCount: 1 });

      mockUserService.getUserByID.mockResolvedValue({
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        notifications: ['REQUEST_EXPIRING']
      });

      mockUserService.getUsersByNotifications.mockResolvedValue([]);
      mockUserService.userCollection.find.mockResolvedValue([{ id: 'user-tracked', email: 'test@example.com' }]);
      applicationService.userDAO.findFirst.mockResolvedValue({ id: 'user-tracked', email: 'test@example.com' });

      await applicationService.remindApplicationSubmission();

      // Should have called update for the deduped app
      expect(mockApplicationDAO.update).toHaveBeenCalled();
    });

    it('should set reminder flags after sending emails', async () => {
      const mockApp = {
        _id: 'app-flag-test',
        applicantID: 'user-flag-test',
        studyAbbreviation: 'FLAG',
        status: 'In Progress',
        history: [],
        updatedAt: new Date('2023-01-01')
      };

      // Final reminders
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([]) // final default
        .mockResolvedValueOnce([]); // final short

      mockApplicationDAO.updateMany.mockResolvedValue({ matchedCount: 0 });

      // 7-day interval has app
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([mockApp]) // 7 days default
        .mockResolvedValueOnce([]) // 7 days short
        .mockResolvedValueOnce([]) // 15 days default
        .mockResolvedValueOnce([]) // 15 days short
        .mockResolvedValueOnce([]) // 30 days default
        .mockResolvedValueOnce([]); // 30 days short

      mockApplicationDAO.update.mockResolvedValue({ matchedCount: 1 });

      mockUserService.getUserByID.mockResolvedValue({
        firstName: 'Flag',
        lastName: 'Test',
        email: 'flag@example.com',
        notifications: ['REQUEST_EXPIRING']
      });

      mockUserService.getUsersByNotifications.mockResolvedValue([]);
      mockUserService.userCollection.find.mockResolvedValue([{ id: 'user-flag-test', email: 'flag@example.com' }]);
      applicationService.userDAO.findFirst.mockResolvedValue({ id: 'user-flag-test', email: 'flag@example.com' });

      await applicationService.remindApplicationSubmission();

      // Verify update was called with reminder flags
      expect(mockApplicationDAO.update).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: 'app-flag-test'
        })
      );
    });

    it('should skip short window queries when day >= shortDays to prevent bulk matches', async () => {
      // Final reminders
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([]) // final default
        .mockResolvedValueOnce([]); // final short

      mockApplicationDAO.updateMany.mockResolvedValue({ matchedCount: 0 });

      // For interval reminders with [7, 15, 30] and shortDays=30:
      // day=7: query both (7 < 30) ✓
      // day=15: query both (15 < 30) ✓
      // day=30: skip short (30 >= 30) ✗ prevents getInactiveApplication(0, ...)
      mockApplicationDAO.getInactiveApplication
        .mockResolvedValueOnce([]) // 7 days default
        .mockResolvedValueOnce([]) // 7 days short (should be called)
        .mockResolvedValueOnce([]) // 15 days default
        .mockResolvedValueOnce([]) // 15 days short (should be called)
        .mockResolvedValueOnce([]); // 30 days default
      // 30 days short should NOT be called

      mockApplicationDAO.update.mockResolvedValue({ matchedCount: 0 });

      await applicationService.remindApplicationSubmission();

      // Verify getInactiveApplication was called exactly 7 times:
      // 2 final (default + short) + 5 interval (only 1 short query for 7 and 15, skipped for 30)
      expect(mockApplicationDAO.getInactiveApplication).toHaveBeenCalledTimes(7);

      // Verify it was called for 7 days short
      expect(mockApplicationDAO.getInactiveApplication).toHaveBeenCalledWith(23, 'inactiveReminder_7');
      // Verify it was called for 15 days short
      expect(mockApplicationDAO.getInactiveApplication).toHaveBeenCalledWith(15, 'inactiveReminder_15');
      // Verify it was NOT called with 0 (which would match too many apps)
      const allCalls = mockApplicationDAO.getInactiveApplication.mock.calls;
      const zeroOrNegativeCalls = allCalls.filter(([days]) => days <= 0);
      expect(zeroOrNegativeCalls).toHaveLength(0);
    });
  });
});
