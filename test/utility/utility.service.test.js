const { UtilityService } = require('../../services/utility');

const CORE_FIELDS = [
  'programName',
  'studyAbbreviation',
  'studyName',
  'programAbbreviation',
  'programDescription'
];

describe('UtilityService', () => {
  let utilityService;

  beforeEach(() => {
    utilityService = new UtilityService();
  });

  it('should be empty when no tracked fields present', () => {
    expect(utilityService.isEmptyApplication({})).toBe(true);
  });

  it('should treat ORCID/PI only as empty', () => {
    const result = utilityService.isEmptyApplication({
      ORCID: '0000-0002-1825-0097',
      PI: 'Jane Doe'
    });
    expect(result).toBe(true);
  });

  it.each(CORE_FIELDS)('should treat field %s present as non-empty', (field) => {
    const app = {};
    app[field] = 'some value';
    expect(utilityService.isEmptyApplication(app)).toBe(false);
  });

  it.each(CORE_FIELDS)('should treat field %s with null/undefined/empty-string as empty', (field) => {
    const appNull = {};
    appNull[field] = null;
    expect(utilityService.isEmptyApplication(appNull)).toBe(true);

    const appUndef = {};
    appUndef[field] = undefined;
    expect(utilityService.isEmptyApplication(appUndef)).toBe(true);

    const appEmpty = {};
    appEmpty[field] = '';
    expect(utilityService.isEmptyApplication(appEmpty)).toBe(true);
  });

  it('should consider whitespace-only value as non-empty by current logic', () => {
    const app = { studyName: '   ' };
    expect(utilityService.isEmptyApplication(app)).toBe(false);
  });

  it('should be non-empty when multiple core fields present', () => {
    const app = { programName: 'P', programDescription: 'D' };
    expect(utilityService.isEmptyApplication(app)).toBe(false);
  });

  it('should be empty when all core fields absent', () => {
    expect(utilityService.isEmptyApplication({ ORCID: 'x', PI: 'y' })).toBe(true);
  });
});
