const { Stat } = require('../../services/data-record-service');

// Mock VALIDATION_STATUS to match the service's usage
const VALIDATION_STATUS = {
  NEW: 'New',
  ERROR: 'Error',
  WARNING: 'Warning',
  PASSED: 'Passed',
};

describe('Stat Class', () => {
  describe('Constructor', () => {
    it('should initialize all properties correctly', () => {
      const stat = new Stat('file', 10, 2, 3, 4, 1);
      expect(stat.nodeName).toBe('file');
      expect(stat.total).toBe(10);
      expect(stat.new).toBe(2);
      expect(stat.passed).toBe(3);
      expect(stat.warning).toBe(4);
      expect(stat.error).toBe(1);
    });
  });

  describe('createStat', () => {
    it('should create a Stat with all counts set to 0', () => {
      const stat = Stat.createStat('participant');
      expect(stat.nodeName).toBe('participant');
      expect(stat.total).toBe(0);
      expect(stat.new).toBe(0);
      expect(stat.passed).toBe(0);
      expect(stat.warning).toBe(0);
      expect(stat.error).toBe(0);
    });
  });

  describe('countNodeType', () => {
    let stat;
    beforeEach(() => {
      stat = Stat.createStat('file');
    });

    it('should increment new and total for NEW', () => {
      stat.countNodeType(VALIDATION_STATUS.NEW, 2);
      expect(stat.new).toBe(2);
      expect(stat.total).toBe(2);
    });

    it('should increment error and total for ERROR', () => {
      stat.countNodeType(VALIDATION_STATUS.ERROR, 3);
      expect(stat.error).toBe(3);
      expect(stat.total).toBe(3);
    });

    it('should increment warning and total for WARNING', () => {
      stat.countNodeType(VALIDATION_STATUS.WARNING, 4);
      expect(stat.warning).toBe(4);
      expect(stat.total).toBe(4);
    });

    it('should increment passed and total for PASSED', () => {
      stat.countNodeType(VALIDATION_STATUS.PASSED, 5);
      expect(stat.passed).toBe(5);
      expect(stat.total).toBe(5);
    });

    it('should not increment any property for unknown node type', () => {
      stat.countNodeType('UNKNOWN', 7);
      expect(stat.new).toBe(0);
      expect(stat.error).toBe(0);
      expect(stat.warning).toBe(0);
      expect(stat.passed).toBe(0);
      expect(stat.total).toBe(0);
    });

    it('should accumulate values on multiple calls', () => {
      stat.countNodeType(VALIDATION_STATUS.NEW, 1);
      stat.countNodeType(VALIDATION_STATUS.ERROR, 2);
      stat.countNodeType(VALIDATION_STATUS.WARNING, 3);
      stat.countNodeType(VALIDATION_STATUS.PASSED, 4);
      expect(stat.new).toBe(1);
      expect(stat.error).toBe(2);
      expect(stat.warning).toBe(3);
      expect(stat.passed).toBe(4);
      expect(stat.total).toBe(10);
    });

    it('should handle zero and negative counts', () => {
      stat.countNodeType(VALIDATION_STATUS.NEW, 0);
      expect(stat.new).toBe(0);
      expect(stat.total).toBe(0);
      stat.countNodeType(VALIDATION_STATUS.ERROR, -2);
      expect(stat.error).toBe(-2);
      expect(stat.total).toBe(-2);
    });

    it('should handle large counts', () => {
      stat.countNodeType(VALIDATION_STATUS.PASSED, 1e6);
      expect(stat.passed).toBe(1e6);
      expect(stat.total).toBe(1e6);
    });
  });
}); 