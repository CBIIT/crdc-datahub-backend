const { Organization } = require('../../crdc-datahub-database-drivers/services/organization');
const { ORGANIZATION } = require('../../crdc-datahub-database-drivers/constants/organization-constants');
const {ERROR : SUBMODULE_ERROR}  = require('../../crdc-datahub-database-drivers/constants/error-constants');
const ERROR = require('../../constants/error-constants');
const {replaceErrorString} = require("../../utility/string-util");

jest.mock('../../utility/data-commons-remapper', () => ({
  getDataCommonsDisplayNamesForUserOrganization: jest.fn((org) => org)
}));

// Mock DAO classes
jest.mock('../../dao/program');
jest.mock('../../dao/user');
jest.mock('../../dao/submission');
jest.mock('../../dao/application');
jest.mock('../../dao/approvedStudy');

const ProgramDAO = require('../../dao/program');
const UserDAO = require('../../dao/user');
const SubmissionDAO = require('../../dao/submission');
const ApplicationDAO = require('../../dao/application');
const ApprovedStudyDAO = require('../../dao/approvedStudy');


describe('Organization.listPrograms', () => {
  let organization;
  let mockProgramDAO;
  let mockUserDAO;
  let mockSubmissionDAO;
  let mockApplicationDAO;
  let mockApprovedStudyDAO;

  beforeEach(() => {
    mockProgramDAO = { listPrograms: jest.fn() };
    mockUserDAO = {};
    mockSubmissionDAO = {};
    mockApplicationDAO = {};
    mockApprovedStudyDAO = {};
    ProgramDAO.mockImplementation(() => mockProgramDAO);
    UserDAO.mockImplementation(() => mockUserDAO);
    SubmissionDAO.mockImplementation(() => mockSubmissionDAO);
    ApplicationDAO.mockImplementation(() => mockApplicationDAO);
    ApprovedStudyDAO.mockImplementation(() => mockApprovedStudyDAO);
    organization = new Organization(
      {}, {}, {}, {}, {}
    );
    jest.clearAllMocks();
  });

  const context = { userInfo: { email: 'test@email.com', IDP: 'test-idp' } };

  it('should return programs and total count for valid status', async () => {
    const params = {
      first: 10,
      offset: 0,
      orderBy: 'name',
      sortDirection: 'asc',
      status: ORGANIZATION.STATUSES.ACTIVE
    };
    const mockPrograms = [{ _id: 'org1', name: 'Program 1' }];
    mockProgramDAO.listPrograms.mockResolvedValue({ total: 1, results: mockPrograms });

    const result = await organization.listPrograms(params, context);
    expect(result.total).toBe(1);
    expect(result.programs).toEqual(mockPrograms);
    expect(mockProgramDAO.listPrograms).toHaveBeenCalled();
  });

  it('should throw error for invalid status', async () => {
    const params = {
      first: 10,
      offset: 0,
      orderBy: 'name',
      sortDirection: 'asc',
      status: 'INVALID_STATUS'
    };
    await expect(organization.listPrograms(params, context)).rejects.toThrow(replaceErrorString(SUBMODULE_ERROR.INVALID_PROGRAM_STATUS, params.status));
  });

  it('should throw error if not logged in', async () => {
    const params = {
      first: 10,
      offset: 0,
      orderBy: 'name',
      sortDirection: 'asc',
      status: ORGANIZATION.STATUSES.ACTIVE
    };
    const badContext = { userInfo: {} };
    await expect(organization.listPrograms(params, badContext)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
  });
});

describe('Organization.createOrganization', () => {
  let organization;
  let mockProgramDAO;
  let mockUserDAO;
  let mockSubmissionDAO;
  let mockApplicationDAO;
  let mockApprovedStudyDAO;

  beforeEach(() => {
    mockProgramDAO = { getOrganizationByName: jest.fn(), create: jest.fn() };
    mockUserDAO = { findFirst: jest.fn() };
    mockSubmissionDAO = {};
    mockApplicationDAO = {};
    mockApprovedStudyDAO = { findMany: jest.fn() };
    ProgramDAO.mockImplementation(() => mockProgramDAO);
    UserDAO.mockImplementation(() => mockUserDAO);
    SubmissionDAO.mockImplementation(() => mockSubmissionDAO);
    ApplicationDAO.mockImplementation(() => mockApplicationDAO);
    ApprovedStudyDAO.mockImplementation(() => mockApprovedStudyDAO);
    organization = new Organization(
      {}, {}, {}, {}, {}
    );
    jest.clearAllMocks();
    organization._checkRemovedStudies = jest.fn();
  });

  it('should create a new organization successfully', async () => {
    const params = {
      name: 'Test Org',
      abbreviation: 'TST',
      description: 'desc',
    };
    mockProgramDAO.getOrganizationByName.mockResolvedValue(null);
    mockProgramDAO.create.mockResolvedValue({ _id: 'orgid', name: 'Test Org', abbreviation: 'TST', description: 'desc' });
    const result = await organization.createOrganization(params);
    expect(result).toEqual({ _id: 'orgid', name: 'Test Org', abbreviation: 'TST', description: 'desc' });
    expect(mockProgramDAO.create).toHaveBeenCalled();
  });

  it('should throw error if organization name already exists', async () => {
    const params = {
      name: 'Test Org',
      abbreviation: 'TST',
      description: 'desc',
    };
    mockProgramDAO.getOrganizationByName.mockResolvedValue({ _id: 'existing' });
    await expect(organization.createOrganization(params)).rejects.toThrow('An organization with the same name already exists');
  });

  it('should throw error if organization name is invalid', async () => {
    const params = {
      name: '',
      abbreviation: 'TST',
      description: 'desc',
    };
    await expect(organization.createOrganization(params)).rejects.toThrow('The organization name you provided is invalid');
  });

  it('should throw error if abbreviation is missing', async () => {
    const params = {
      name: 'Test Org',
      abbreviation: '',
      description: 'desc',
    };
    mockProgramDAO.getOrganizationByName.mockResolvedValue(null);
    mockProgramDAO.create.mockResolvedValue(undefined);
    await expect(organization.createOrganization(params)).rejects.toThrow('Unknown error occurred while creating object');
  });

  it('should throw error if conciergeID is invalid', async () => {
    const params = {
      name: 'Test Org',
      abbreviation: 'TST',
      description: 'desc',
      conciergeID: 'user123'
    };
    mockProgramDAO.getOrganizationByName.mockResolvedValue(null);
    mockUserDAO.findFirst.mockResolvedValue(null);
    await expect(organization.createOrganization(params)).rejects.toThrow('The role you are trying to assign is invalid');
  });

  it('should create organization with concierge info', async () => {
    const params = {
      name: 'Test Org',
      abbreviation: 'TST',
      description: 'desc',
      conciergeID: 'user123'
    };
    mockProgramDAO.getOrganizationByName.mockResolvedValue(null);
    mockUserDAO.findFirst.mockResolvedValue({ _id: 'user123', firstName: 'Jane', lastName: 'Doe', email: 'jane@doe.com' });
    mockProgramDAO.create.mockResolvedValue({ _id: 'orgid', name: 'Test Org', abbreviation: 'TST', description: 'desc', conciergeID: 'user123', conciergeName: 'Jane Doe', conciergeEmail: 'jane@doe.com' });
    const result = await organization.createOrganization(params);
    expect(result).toEqual({ _id: 'orgid', name: 'Test Org', abbreviation: 'TST', description: 'desc', conciergeID: 'user123', conciergeName: 'Jane Doe', conciergeEmail: 'jane@doe.com' });
    expect(mockUserDAO.findFirst).toHaveBeenCalled();
    expect(mockProgramDAO.create).toHaveBeenCalled();
  });

  it('should create organization with studies', async () => {
    const params = {
      name: 'Test Org',
      abbreviation: 'TST',
      description: 'desc',
      studies: [{ studyID: 'study1' }, { studyID: 'study2' }]
    };
    mockProgramDAO.getOrganizationByName.mockResolvedValue(null);
    mockApprovedStudyDAO.findMany.mockResolvedValue([{ _id: 'study1' }, { _id: 'study2' }]);
    mockProgramDAO.create.mockResolvedValue({ _id: 'orgid', name: 'Test Org', abbreviation: 'TST', description: 'desc', studies: [{ _id: 'study1' }, { _id: 'study2' }] });
    const result = await organization.createOrganization(params);
    expect(result).toEqual({ _id: 'orgid', name: 'Test Org', abbreviation: 'TST', description: 'desc', studies: [{ _id: 'study1' }, { _id: 'study2' }] });
    expect(mockApprovedStudyDAO.findMany).toHaveBeenCalledWith({ id: { in: ['study1', 'study2'] } });
    expect(mockProgramDAO.create).toHaveBeenCalled();
  });
});

describe('Organization.getOrganizationAPI', () => {
  let organization;
  let mockProgramDAO;
  let mockUserDAO;
  let mockSubmissionDAO;
  let mockApplicationDAO;
  let mockApprovedStudyDAO;

  beforeEach(() => {
    mockProgramDAO = { getOrganizationByID: jest.fn() };
    mockUserDAO = {};
    mockSubmissionDAO = {};
    mockApplicationDAO = {};
    mockApprovedStudyDAO = {};
    ProgramDAO.mockImplementation(() => mockProgramDAO);
    UserDAO.mockImplementation(() => mockUserDAO);
    SubmissionDAO.mockImplementation(() => mockSubmissionDAO);
    ApplicationDAO.mockImplementation(() => mockApplicationDAO);
    ApprovedStudyDAO.mockImplementation(() => mockApprovedStudyDAO);
    organization = new Organization(
      {}, {}, {}, {}, {}
    );
    jest.clearAllMocks();
  });

  const context = { userInfo: { email: 'test@email.com', IDP: 'test-idp' } };

  it('should return the organization for a valid orgID', async () => {
    const params = { orgID: 'org123' };
    const mockOrg = { _id: 'org123', name: 'Test Org' };
    mockProgramDAO.getOrganizationByID.mockResolvedValue(mockOrg);
    const result = await organization.getOrganizationAPI(params, context);
    expect(result).toEqual(mockOrg);
    expect(mockProgramDAO.getOrganizationByID).toHaveBeenCalledWith('org123', false);
  });

  it('should throw error if orgID is missing', async () => {
    await expect(organization.getOrganizationAPI({}, context)).rejects.toThrow(ERROR.INVALID_ORG_ID);
  });

  it('should throw error if not logged in', async () => {
    const params = { orgID: 'org123' };
    const badContext = { userInfo: {} };
    await expect(organization.getOrganizationAPI(params, badContext)).rejects.toThrow(ERROR.NOT_LOGGED_IN);
  });
});
