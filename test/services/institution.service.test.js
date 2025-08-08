const { InstitutionService } = require('../../services/institution-service');
const { INSTITUTION } = require('../../crdc-datahub-database-drivers/constants/organization-constants');
const ERROR = require('../../constants/error-constants');
const { ADMIN } = require('../../crdc-datahub-database-drivers/constants/user-permission-constants');
const { TEST_SESSION } = require('../test-constants');

jest.mock('../../verifier/user-info-verifier', () => ({
  verifySession: jest.fn()
}));
const { verifySession } = require('../../verifier/user-info-verifier');
const { replaceErrorString } = require('../../utility/string-util');

const mockAuthorizationService = {
  getPermissionScope: jest.fn()
};

const mockInstitutionDAO = {
  findFirst: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
  listInstitution: jest.fn(),
  findMany: jest.fn()
};

jest.mock('../../dao/institution', () => {
  return jest.fn().mockImplementation(() => mockInstitutionDAO);
});

const validContext = { ...TEST_SESSION };
const validUserScope = {
  isNoneScope: () => false,
  isAllScope: () => true
};
const noneScope = {
  isNoneScope: () => true,
  isAllScope: () => false
};

function setupVerifySession(initialized = true) {
  verifySession.mockReturnValue({
    verifyInitialized: jest.fn().mockImplementation(function () {
      if (!initialized) throw new Error(ERROR.SESSION_NOT_INITIALIZED);
      return this;
    })
  });
}

describe('InstitutionService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InstitutionService({}, mockAuthorizationService);
    setupVerifySession(true);
    mockAuthorizationService.getPermissionScope.mockResolvedValue([{ scope: 'all', scopeValues: [] }]);
  });

  describe('listInstitutions', () => {
    it('returns institutions from DAO', async () => {
      const params = { name: 'foo', offset: 0, first: 10, orderBy: 'name', sortDirection: 'asc', status: INSTITUTION.STATUSES.ACTIVE };
      const expected = { institutions: [{ name: 'foo' }], total: 1 };
      mockInstitutionDAO.listInstitution.mockResolvedValue(expected);
      const result = await service.listInstitutions(params, validContext);
      expect(result).toBe(expected);
      expect(mockInstitutionDAO.listInstitution).toHaveBeenCalledWith(
        params.name, params.offset, params.first, params.orderBy, params.sortDirection, params.status
      );
    });
    it('throws if session is not initialized', async () => {
      setupVerifySession(false);
      await expect(service.listInstitutions({}, validContext)).rejects.toThrow(ERROR.SESSION_NOT_INITIALIZED);
    });
  });

  describe('getInstitution', () => {
    it('returns institution if found and user has permission', async () => {
      mockAuthorizationService.getPermissionScope.mockResolvedValue([{ scope: 'all', scopeValues: [] }]);
      mockInstitutionDAO.findFirst.mockResolvedValue({ _id: 'id1', name: 'foo' });
      const params = { _id: 'id1' };
      const result = await service.getInstitution(params, validContext);
      expect(result).toEqual({ _id: 'id1', name: 'foo' });
    });
    it('throws if user has no permission', async () => {
      mockAuthorizationService.getPermissionScope.mockResolvedValue([{ scope: 'none', scopeValues: [] }]);
      service._getUserScope = jest.fn().mockResolvedValue(noneScope);
      await expect(service.getInstitution({ _id: 'id1' }, validContext)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });
    it('throws if institution not found', async () => {
      mockInstitutionDAO.findFirst.mockResolvedValue(null);
      await expect(service.getInstitution({ _id: 'notfound' }, validContext)).rejects.toThrow(replaceErrorString(ERROR.INSTITUTION_ID_NOT_EXIST, 'notfound'));
    });
  });

  describe('createInstitution', () => {
    beforeEach(() => {
      service._getUserScope = jest.fn().mockResolvedValue(validUserScope);
      // Patch: mock the aggregate method for _findOneByCaseInsensitiveName
      service.institutionCollection.aggregate = jest.fn().mockResolvedValue([]);
    });
    it('creates institution successfully', async () => {
      mockInstitutionDAO.findFirst.mockResolvedValue(null);
      mockInstitutionDAO.create.mockResolvedValue({ _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.ACTIVE });
      const params = { name: 'foo', status: INSTITUTION.STATUSES.ACTIVE };
      const result = await service.createInstitution(params, validContext);
      expect(result).toEqual({ _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.ACTIVE });
    });
    it('throws if user has no permission', async () => {
      service._getUserScope = jest.fn().mockResolvedValue(noneScope);
      await expect(service.createInstitution({ name: 'foo' }, validContext)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });
    it('throws if name is empty', async () => {
      await expect(service.createInstitution({ name: '   ' }, validContext)).rejects.toThrow(ERROR.EMPTY_INSTITUTION_NAME);
    });
    it('throws if status is invalid', async () => {
      await expect(service.createInstitution({ name: 'foo', status: 'bad' }, validContext)).rejects.toThrow(ERROR.INVALID_INSTITUTION_STATUS.replace('$item$', 'bad'));
    });
    it('throws if institution name is duplicate', async () => {
      mockInstitutionDAO.findFirst.mockResolvedValue({ _id: 'id1', name: 'duplicate' });
      service.institutionCollection.aggregate = jest.fn().mockResolvedValue([{name: "duplicate"}]);
      await expect(service.createInstitution({ name: 'foo' }, validContext)).rejects.toThrow(ERROR.DUPLICATE_INSTITUTION_NAME);
    });
    it('throws if name is too long', async () => {
      mockInstitutionDAO.findFirst.mockResolvedValue(null);
      const longName = 'a'.repeat(101);
      await expect(service.createInstitution({ name: longName }, validContext)).rejects.toThrow(ERROR.MAX_INSTITUTION_NAME_LIMIT);
    });
    it('throws if DAO create fails', async () => {
      mockInstitutionDAO.findFirst.mockResolvedValue(null);
      mockInstitutionDAO.create.mockResolvedValue(null);
      await expect(service.createInstitution({ name: 'foo' }, validContext)).rejects.toThrow(ERROR.FAILED_CREATE_INSTITUTION);
    });
  });

  describe('updateInstitution', () => {
    beforeEach(() => {
      service._getUserScope = jest.fn().mockResolvedValue(validUserScope);
      service.institutionCollection.aggregate = jest.fn().mockResolvedValue([]);
    });
    it('updates institution successfully', async () => {
      const params = { _id: 'id1', name: 'bar', status: INSTITUTION.STATUSES.ACTIVE };
      const existing = { _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.INACTIVE };
      mockInstitutionDAO.findFirst.mockResolvedValueOnce(existing); // getInstitutionByID
      mockInstitutionDAO.updateMany.mockResolvedValue({ count: 1 });
      mockInstitutionDAO.findFirst.mockResolvedValueOnce({ ...existing, ...params }); // final fetch
      const result = await service.updateInstitution(params, validContext);
      expect(result).toEqual({ ...existing, ...params });
    });
    it('returns original if no changes', async () => {
      const params = { _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.INACTIVE };
      const existing = { _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.INACTIVE };
      mockInstitutionDAO.findFirst.mockResolvedValue(existing);
      const result = await service.updateInstitution(params, validContext);
      expect(result).toEqual(existing);
    });
    it('throws if user has no permission', async () => {
      service._getUserScope = jest.fn().mockResolvedValue(noneScope);
      await expect(service.updateInstitution({ _id: 'id1', name: 'foo' }, validContext)).rejects.toThrow(ERROR.VERIFY.INVALID_PERMISSION);
    });
    
    it('throws if institution not found', async () => {
      mockInstitutionDAO.findFirst.mockResolvedValueOnce(null);
      await expect(service.updateInstitution({ _id: 'notfound', name: 'foo' }, validContext)).rejects.toThrow(replaceErrorString(ERROR.INSTITUTION_ID_NOT_EXIST, 'notfound'));
    });
    it('throws if name is empty', async () => {
      const existing = { _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.INACTIVE };
      mockInstitutionDAO.findFirst.mockResolvedValue(existing);
      await expect(service.updateInstitution({ _id: 'id1', name: '   ' }, validContext)).rejects.toThrow(ERROR.EMPTY_INSTITUTION_NAME);
    });
    it('throws if name is too long', async () => {
      const existing = { _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.INACTIVE };
      mockInstitutionDAO.findFirst.mockResolvedValue(existing);
      await expect(service.updateInstitution({ _id: 'id1', name: 'a'.repeat(101) }, validContext)).rejects.toThrow(ERROR.MAX_INSTITUTION_NAME_LIMIT);
    });
    it('throws if duplicate name', async () => {
      const existing = { _id: 'id1', name: 'duplicate', status: INSTITUTION.STATUSES.INACTIVE };
      mockInstitutionDAO.findFirst.mockResolvedValueOnce(existing);
      service.institutionCollection.aggregate = jest.fn().mockResolvedValue([{name: "duplicate"}]);
      mockInstitutionDAO.findFirst.mockResolvedValueOnce({ _id: 'id2', name: 'bar' });
      await expect(service.updateInstitution({ _id: 'id1', name: 'bar' }, validContext)).rejects.toThrow(ERROR.DUPLICATE_INSTITUTION_NAME);
    });
    it('throws if status is invalid', async () => {
      const existing = { _id: 'id1', name: 'foo', status: INSTITUTION.STATUSES.INACTIVE };
      mockInstitutionDAO.findFirst.mockResolvedValue(existing);
      await expect(service.updateInstitution({ _id: 'id1', name: 'foo', status: 'bad' }, validContext)).rejects.toThrow(ERROR.INVALID_INSTITUTION_STATUS.replace('$item$', 'bad'));
    });
  });
});
