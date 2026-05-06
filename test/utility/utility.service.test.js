const { UtilityService } = require('../../services/utility');

describe('UtilityService', () => {
  let utilityService;

  beforeEach(() => {
    utilityService = new UtilityService();
  });

  it('should treat an application with only ORCID and PI fields as empty', () => {
    const result = utilityService.isEmptyApplication({
      ORCID: '0000-0002-1825-0097',
      PI: 'Jane Doe'
    });

    expect(result).toBe(true);
  });

  it('should treat an application with a tracked field as non-empty', () => {
    const result = utilityService.isEmptyApplication({
      studyName: 'Example Study',
      ORCID: '0000-0002-1825-0097',
      PI: 'Jane Doe'
    });

    expect(result).toBe(false);
  });

  it('should treat an entirely empty application as empty', () => {
    const result = utilityService.isEmptyApplication({});

    expect(result).toBe(true);
  });
});
