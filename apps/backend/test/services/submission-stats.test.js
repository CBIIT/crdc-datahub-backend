const { SubmissionStats } = require('../../services/data-record-service');

describe('SubmissionStats Class', () => {
  describe('Constructor', () => {
    test('should initialize with submissionID and empty stats array', () => {
      const submissionStats = new SubmissionStats('submission-123');
      
      expect(submissionStats.submissionID).toBe('submission-123');
      expect(submissionStats.stats).toEqual([]);
      expect(Array.isArray(submissionStats.stats)).toBe(true);
    });

    test('should handle empty string submissionID', () => {
      const submissionStats = new SubmissionStats('');
      
      expect(submissionStats.submissionID).toBe('');
      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle null submissionID', () => {
      const submissionStats = new SubmissionStats(null);
      
      expect(submissionStats.submissionID).toBe(null);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle undefined submissionID', () => {
      const submissionStats = new SubmissionStats(undefined);
      
      expect(submissionStats.submissionID).toBe(undefined);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle numeric submissionID', () => {
      const submissionStats = new SubmissionStats(12345);
      
      expect(submissionStats.submissionID).toBe(12345);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle object submissionID', () => {
      const obj = { id: 'test' };
      const submissionStats = new SubmissionStats(obj);
      
      expect(submissionStats.submissionID).toBe(obj);
      expect(submissionStats.stats).toEqual([]);
    });
  });

  describe('createSubmissionStats Static Method', () => {
    test('should create SubmissionStats instance with submissionID', () => {
      const submissionStats = SubmissionStats.createSubmissionStats('submission-456');
      
      expect(submissionStats).toBeInstanceOf(SubmissionStats);
      expect(submissionStats.submissionID).toBe('submission-456');
      expect(submissionStats.stats).toEqual([]);
    });

    test('should create SubmissionStats instance with empty string', () => {
      const submissionStats = SubmissionStats.createSubmissionStats('');
      
      expect(submissionStats).toBeInstanceOf(SubmissionStats);
      expect(submissionStats.submissionID).toBe('');
      expect(submissionStats.stats).toEqual([]);
    });

    test('should create SubmissionStats instance with null', () => {
      const submissionStats = SubmissionStats.createSubmissionStats(null);
      
      expect(submissionStats).toBeInstanceOf(SubmissionStats);
      expect(submissionStats.submissionID).toBe(null);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should create SubmissionStats instance with undefined', () => {
      const submissionStats = SubmissionStats.createSubmissionStats(undefined);
      
      expect(submissionStats).toBeInstanceOf(SubmissionStats);
      expect(submissionStats.submissionID).toBe(undefined);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should create SubmissionStats instance with numeric ID', () => {
      const submissionStats = SubmissionStats.createSubmissionStats(789);
      
      expect(submissionStats).toBeInstanceOf(SubmissionStats);
      expect(submissionStats.submissionID).toBe(789);
      expect(submissionStats.stats).toEqual([]);
    });
  });

  describe('addStats Method', () => {
    let submissionStats;

    beforeEach(() => {
      submissionStats = new SubmissionStats('submission-123');
    });

    test('should add a single stat to the stats array', () => {
      const stat = { nodeName: 'participant', total: 10, new: 2, passed: 5, warning: 2, error: 1 };
      
      submissionStats.addStats(stat);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(stat);
      expect(submissionStats.stats[0].nodeName).toBe('participant');
    });

    test('should add multiple stats to the stats array', () => {
      const stat1 = { nodeName: 'participant', total: 10, new: 2, passed: 5, warning: 2, error: 1 };
      const stat2 = { nodeName: 'sample', total: 20, new: 5, passed: 10, warning: 3, error: 2 };
      const stat3 = { nodeName: 'file', total: 15, new: 3, passed: 8, warning: 2, error: 2 };
      
      submissionStats.addStats(stat1);
      submissionStats.addStats(stat2);
      submissionStats.addStats(stat3);
      
      expect(submissionStats.stats).toHaveLength(3);
      expect(submissionStats.stats[0]).toBe(stat1);
      expect(submissionStats.stats[1]).toBe(stat2);
      expect(submissionStats.stats[2]).toBe(stat3);
    });

    test('should handle adding null stat', () => {
      submissionStats.addStats(null);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(null);
    });

    test('should handle adding undefined stat', () => {
      submissionStats.addStats(undefined);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(undefined);
    });

    test('should handle adding empty object stat', () => {
      const emptyStat = {};
      submissionStats.addStats(emptyStat);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(emptyStat);
    });

    test('should handle adding primitive values', () => {
      submissionStats.addStats('string stat');
      submissionStats.addStats(123);
      submissionStats.addStats(true);
      
      expect(submissionStats.stats).toHaveLength(3);
      expect(submissionStats.stats[0]).toBe('string stat');
      expect(submissionStats.stats[1]).toBe(123);
      expect(submissionStats.stats[2]).toBe(true);
    });

    test('should handle adding array stat', () => {
      const arrayStat = [1, 2, 3, 'test'];
      submissionStats.addStats(arrayStat);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(arrayStat);
    });

    test('should handle adding function stat', () => {
      const functionStat = () => 'test function';
      submissionStats.addStats(functionStat);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(functionStat);
    });
  });

  describe('Integration Tests', () => {
    test('should work with Stat objects from the same module', () => {
      const { Stat } = require('../../services/data-record-service');
      
      const submissionStats = SubmissionStats.createSubmissionStats('submission-789');
      const participantStat = Stat.createStat('participant');
      const sampleStat = Stat.createStat('sample');
      
      // Add some counts to the stats
      participantStat.countNodeType('New', 5);
      participantStat.countNodeType('Passed', 10);
      sampleStat.countNodeType('Error', 2);
      sampleStat.countNodeType('Warning', 3);
      
      submissionStats.addStats(participantStat);
      submissionStats.addStats(sampleStat);
      
      expect(submissionStats.submissionID).toBe('submission-789');
      expect(submissionStats.stats).toHaveLength(2);
      expect(submissionStats.stats[0]).toBe(participantStat);
      expect(submissionStats.stats[1]).toBe(sampleStat);
      expect(submissionStats.stats[0].nodeName).toBe('participant');
      expect(submissionStats.stats[1].nodeName).toBe('sample');
    });

    test('should handle large number of stats', () => {
      const submissionStats = new SubmissionStats('large-submission');
      const stats = [];
      
      // Create 1000 stats
      for (let i = 0; i < 1000; i++) {
        const stat = { nodeName: `node-${i}`, total: i, new: i % 5, passed: i % 10, warning: i % 3, error: i % 2 };
        stats.push(stat);
        submissionStats.addStats(stat);
      }
      
      expect(submissionStats.stats).toHaveLength(1000);
      expect(submissionStats.stats[999].nodeName).toBe('node-999');
      expect(submissionStats.stats[999].total).toBe(999);
    });

    test('should maintain stats order when adding multiple stats', () => {
      const submissionStats = new SubmissionStats('ordered-submission');
      const stat1 = { nodeName: 'first', order: 1 };
      const stat2 = { nodeName: 'second', order: 2 };
      const stat3 = { nodeName: 'third', order: 3 };
      
      submissionStats.addStats(stat1);
      submissionStats.addStats(stat2);
      submissionStats.addStats(stat3);
      
      expect(submissionStats.stats[0].order).toBe(1);
      expect(submissionStats.stats[1].order).toBe(2);
      expect(submissionStats.stats[2].order).toBe(3);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very long submissionID', () => {
      const longID = 'a'.repeat(10000);
      const submissionStats = new SubmissionStats(longID);
      
      expect(submissionStats.submissionID).toBe(longID);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle special characters in submissionID', () => {
      const specialID = 'submission-123!@#$%^&*()_+-=[]{}|;:,.<>?';
      const submissionStats = new SubmissionStats(specialID);
      
      expect(submissionStats.submissionID).toBe(specialID);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle unicode characters in submissionID', () => {
      const unicodeID = 'submission-🚀-测试-🎉';
      const submissionStats = new SubmissionStats(unicodeID);
      
      expect(submissionStats.submissionID).toBe(unicodeID);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should handle very large stat objects', () => {
      const submissionStats = new SubmissionStats('large-stat-submission');
      const largeStat = {
        nodeName: 'large-node',
        data: new Array(10000).fill('test data'),
        metadata: {
          deep: {
            nested: {
              object: {
                with: {
                  lots: {
                    of: {
                      properties: 'value'
                    }
                  }
                }
              }
            }
          }
        }
      };
      
      submissionStats.addStats(largeStat);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(largeStat);
      expect(submissionStats.stats[0].data).toHaveLength(10000);
    });

    test('should handle circular reference in stat object', () => {
      const submissionStats = new SubmissionStats('circular-submission');
      const circularStat = { nodeName: 'circular' };
      circularStat.self = circularStat; // Create circular reference
      
      submissionStats.addStats(circularStat);
      
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(circularStat);
      expect(submissionStats.stats[0].self).toBe(circularStat);
    });
  });

  describe('Property Verification', () => {
    test('should verify all properties are correctly assigned', () => {
      const submissionStats = new SubmissionStats('test-submission');
      
      const expectedProperties = ['submissionID', 'stats'];
      expectedProperties.forEach(prop => {
        expect(submissionStats).toHaveProperty(prop);
      });
      
      expect(submissionStats.submissionID).toBe('test-submission');
      expect(Array.isArray(submissionStats.stats)).toBe(true);
      expect(submissionStats.stats).toEqual([]);
    });

    test('should verify stats array is mutable', () => {
      const submissionStats = new SubmissionStats('mutable-submission');
      
      // Verify initial state
      expect(submissionStats.stats).toEqual([]);
      
      // Add a stat
      const stat = { nodeName: 'test' };
      submissionStats.addStats(stat);
      
      // Verify the array was modified
      expect(submissionStats.stats).toHaveLength(1);
      expect(submissionStats.stats[0]).toBe(stat);
      
      // Verify we can modify the array directly
      submissionStats.stats.push({ nodeName: 'direct' });
      expect(submissionStats.stats).toHaveLength(2);
    });
  });
}); 