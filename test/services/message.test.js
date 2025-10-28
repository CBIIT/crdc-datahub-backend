const { Message } = require('../../services/data-record-service');

describe('Message Class', () => {
  describe('Constructor', () => {
    test('should create message with type and validationID', () => {
      const message = new Message('Validate Metadata', 'validation-123');
      expect(message.type).toBe('Validate Metadata');
      expect(message.validationID).toBe('validation-123');
    });

    test('should create message with type only (no validationID)', () => {
      const message = new Message('Validate Metadata');
      expect(message.type).toBe('Validate Metadata');
      expect(message.validationID).toBeUndefined();
    });

    test('should create message with null validationID', () => {
      const message = new Message('Validate Metadata', null);
      expect(message.type).toBe('Validate Metadata');
      expect(message.validationID).toBeUndefined();
    });

    test('should create message with undefined validationID', () => {
      const message = new Message('Validate Metadata', undefined);
      expect(message.type).toBe('Validate Metadata');
      expect(message.validationID).toBeUndefined();
    });

    test('should handle empty string type', () => {
      const message = new Message('', 'validation-123');
      expect(message.type).toBe('');
      expect(message.validationID).toBe('validation-123');
    });

    test('should handle non-string type parameter', () => {
      const message = new Message(123, 'validation-123');
      expect(message.type).toBe(123);
      expect(message.validationID).toBe('validation-123');
    });
  });

  describe('createMetadataMessage Static Method', () => {
    test('should create metadata message with all parameters', () => {
      const message = Message.createMetadataMessage(
        'Validate Metadata', 
        'submission-123', 
        'NEW', 
        'validation-456'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Metadata');
      expect(message.submissionID).toBe('submission-123');
      expect(message.scope).toBe('NEW');
      expect(message.validationID).toBe('validation-456');
    });

    test('should create metadata message without scope', () => {
      const message = Message.createMetadataMessage(
        'Validate Cross-submission', 
        'submission-123', 
        null, 
        'validation-456'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Cross-submission');
      expect(message.submissionID).toBe('submission-123');
      expect(message.scope).toBeUndefined();
      expect(message.validationID).toBe('validation-456');
    });

    test('should create metadata message with empty scope', () => {
      const message = Message.createMetadataMessage(
        'Validate Metadata', 
        'submission-123', 
        '', 
        'validation-456'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Metadata');
      expect(message.submissionID).toBe('submission-123');
      expect(message.scope).toBeUndefined(); // Empty string is treated as falsy
      expect(message.validationID).toBe('validation-456');
    });

    test('should create metadata message without validationID', () => {
      const message = Message.createMetadataMessage(
        'Validate Metadata', 
        'submission-123', 
        'ALL'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Metadata');
      expect(message.submissionID).toBe('submission-123');
      expect(message.scope).toBe('ALL');
      expect(message.validationID).toBeUndefined();
    });

    test('should create metadata message with undefined scope', () => {
      const message = Message.createMetadataMessage(
        'Validate Metadata', 
        'submission-123', 
        undefined, 
        'validation-456'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Metadata');
      expect(message.submissionID).toBe('submission-123');
      expect(message.scope).toBeUndefined();
      expect(message.validationID).toBe('validation-456');
    });
  });

  describe('createFileSubmissionMessage Static Method', () => {
    test('should create file submission message with validationID', () => {
      const message = Message.createFileSubmissionMessage(
        'Validate Submission Files', 
        'submission-123', 
        'validation-456'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Submission Files');
      expect(message.submissionID).toBe('submission-123');
      expect(message.validationID).toBe('validation-456');
    });

    test('should create file submission message without validationID', () => {
      const message = Message.createFileSubmissionMessage(
        'Export Metadata', 
        'submission-123'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Export Metadata');
      expect(message.submissionID).toBe('submission-123');
      expect(message.validationID).toBeUndefined();
    });

    test('should create file submission message with null validationID', () => {
      const message = Message.createFileSubmissionMessage(
        'Validate Submission Files', 
        'submission-123', 
        null
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Submission Files');
      expect(message.submissionID).toBe('submission-123');
      expect(message.validationID).toBeUndefined();
    });

    test('should create file submission message with undefined validationID', () => {
      const message = Message.createFileSubmissionMessage(
        'Validate Submission Files', 
        'submission-123', 
        undefined
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate Submission Files');
      expect(message.submissionID).toBe('submission-123');
      expect(message.validationID).toBeUndefined();
    });
  });

  describe('createFileNodeMessage Static Method', () => {
    test('should create file node message with validationID', () => {
      const message = Message.createFileNodeMessage(
        'Validate File', 
        'data-record-123', 
        'validation-456'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate File');
      expect(message.dataRecordID).toBe('data-record-123');
      expect(message.validationID).toBe('validation-456');
    });

    test('should create file node message without validationID', () => {
      const message = Message.createFileNodeMessage(
        'Validate File', 
        'data-record-123'
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate File');
      expect(message.dataRecordID).toBe('data-record-123');
      expect(message.validationID).toBeUndefined();
    });

    test('should create file node message with null validationID', () => {
      const message = Message.createFileNodeMessage(
        'Validate File', 
        'data-record-123', 
        null
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate File');
      expect(message.dataRecordID).toBe('data-record-123');
      expect(message.validationID).toBeUndefined();
    });

    test('should create file node message with undefined validationID', () => {
      const message = Message.createFileNodeMessage(
        'Validate File', 
        'data-record-123', 
        undefined
      );
      
      expect(message).toBeInstanceOf(Message);
      expect(message.type).toBe('Validate File');
      expect(message.dataRecordID).toBe('data-record-123');
      expect(message.validationID).toBeUndefined();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle empty string parameters', () => {
      const message = Message.createMetadataMessage('', '', '', '');
      expect(message.type).toBe('');
      expect(message.submissionID).toBe('');
      expect(message.scope).toBeUndefined(); // Empty string is treated as falsy
      expect(message.validationID).toBeUndefined(); // Empty string is treated as falsy
    });

    test('should handle special characters in parameters', () => {
      const message = Message.createFileNodeMessage(
        'Validate File @#$%', 
        'data-record-123!@#', 
        'validation-456&*()'
      );
      expect(message.type).toBe('Validate File @#$%');
      expect(message.dataRecordID).toBe('data-record-123!@#');
      expect(message.validationID).toBe('validation-456&*()');
    });

    test('should handle very long parameters', () => {
      const longString = 'a'.repeat(1000);
      const message = Message.createFileSubmissionMessage(longString, longString, longString);
      expect(message.type).toBe(longString);
      expect(message.submissionID).toBe(longString);
      expect(message.validationID).toBe(longString);
    });

    test('should handle object parameters', () => {
      const obj = { id: 'test' };
      const message = Message.createMetadataMessage(obj, obj, obj, obj);
      expect(message.type).toBe(obj);
      expect(message.submissionID).toBe(obj);
      expect(message.scope).toBe(obj);
      expect(message.validationID).toBe(obj);
    });

    test('should handle array parameters', () => {
      const arr = ['test'];
      const message = Message.createFileNodeMessage(arr, arr, arr);
      expect(message.type).toBe(arr);
      expect(message.dataRecordID).toBe(arr);
      expect(message.validationID).toBe(arr);
    });
  });

  describe('Integration Tests with Real Usage Scenarios', () => {
    test('should create metadata validation message for cross-submission', () => {
      const message = Message.createMetadataMessage(
        'Validate Cross-submission',
        'phs001234.v1.p1',
        null,
        'validation-2024-01-15-001'
      );
      
      expect(message).toMatchObject({
        type: 'Validate Cross-submission',
        submissionID: 'phs001234.v1.p1',
        validationID: 'validation-2024-01-15-001'
      });
      expect(message.scope).toBeUndefined();
      expect(message.dataCommons).toBeUndefined();
    });


    test('should create file validation message for individual file', () => {
      const message = Message.createFileNodeMessage(
        'Validate File',
        'file-node-abc123',
        'validation-2024-01-15-002'
      );
      
      expect(message).toMatchObject({
        type: 'Validate File',
        dataRecordID: 'file-node-abc123',
        validationID: 'validation-2024-01-15-002'
      });
    });

    test('should create export metadata message', () => {
      const message = Message.createFileSubmissionMessage(
        'Export Metadata',
        'phs001234.v1.p1'
      );
      
      expect(message).toMatchObject({
        type: 'Export Metadata',
        submissionID: 'phs001234.v1.p1'
      });
      expect(message.validationID).toBeUndefined();
    });

    test('should create metadata validation message for new scope', () => {
      const message = Message.createMetadataMessage(
        'Validate Metadata',
        'phs001234.v1.p1',
        'NEW',
        'validation-2024-01-15-003'
      );
      
      expect(message).toMatchObject({
        type: 'Validate Metadata',
        submissionID: 'phs001234.v1.p1',
        scope: 'NEW',
        validationID: 'validation-2024-01-15-003'
      });
    });

    test('should create metadata validation message for all scope', () => {
      const message = Message.createMetadataMessage(
        'Validate Metadata',
        'phs001234.v1.p1',
        'ALL',
        'validation-2024-01-15-004'
      );
      
      expect(message).toMatchObject({
        type: 'Validate Metadata',
        submissionID: 'phs001234.v1.p1',
        scope: 'ALL',
        validationID: 'validation-2024-01-15-004'
      });
    });
  });

  describe('Type Safety and Validation', () => {
    test('should handle non-string type parameter', () => {
      const message = new Message(123, 'validation-123');
      expect(message.type).toBe(123);
      expect(message.validationID).toBe('validation-123');
    });

    test('should handle object parameters', () => {
      const obj = { id: 'test' };
      const message = Message.createMetadataMessage(obj, obj, obj, obj);
      expect(message.type).toBe(obj);
      expect(message.submissionID).toBe(obj);
      expect(message.scope).toBe(obj);
      expect(message.validationID).toBe(obj);
    });

    test('should handle array parameters', () => {
      const arr = ['test'];
      const message = Message.createFileNodeMessage(arr, arr, arr);
      expect(message.type).toBe(arr);
      expect(message.dataRecordID).toBe(arr);
      expect(message.validationID).toBe(arr);
    });

    test('should handle boolean parameters', () => {
      const message = Message.createFileSubmissionMessage(true, false, true);
      expect(message.type).toBe(true);
      expect(message.submissionID).toBe(false);
      expect(message.validationID).toBe(true);
    });

    test('should handle number parameters', () => {
      const message = Message.createMetadataMessage(123, 456, 789, 101);
      expect(message.type).toBe(123);
      expect(message.submissionID).toBe(456);
      expect(message.scope).toBe(789);
      expect(message.validationID).toBe(101);
    });
  });

  describe('Message Property Assignment Verification', () => {
    test('should verify all properties are correctly assigned for metadata message', () => {
      const message = Message.createMetadataMessage(
        'Validate Metadata',
        'submission-123',
        'NEW',
        'validation-456'
      );
      
      const expectedProperties = ['type', 'submissionID', 'scope', 'validationID'];
      expectedProperties.forEach(prop => {
        expect(message).toHaveProperty(prop);
      });
      
      expect(message.type).toBe('Validate Metadata');
      expect(message.submissionID).toBe('submission-123');
      expect(message.scope).toBe('NEW');
      expect(message.validationID).toBe('validation-456');
    });

    test('should verify all properties are correctly assigned for file submission message', () => {
      const message = Message.createFileSubmissionMessage(
        'Validate Submission Files',
        'submission-123',
        'validation-456'
      );
      
      const expectedProperties = ['type', 'submissionID', 'validationID'];
      expectedProperties.forEach(prop => {
        expect(message).toHaveProperty(prop);
      });
      
      expect(message.type).toBe('Validate Submission Files');
      expect(message.submissionID).toBe('submission-123');
      expect(message.validationID).toBe('validation-456');
    });

    test('should verify all properties are correctly assigned for file node message', () => {
      const message = Message.createFileNodeMessage(
        'Validate File',
        'data-record-123',
        'validation-456'
      );
      
      const expectedProperties = ['type', 'dataRecordID', 'validationID'];
      expectedProperties.forEach(prop => {
        expect(message).toHaveProperty(prop);
      });
      
      expect(message.type).toBe('Validate File');
      expect(message.dataRecordID).toBe('data-record-123');
      expect(message.validationID).toBe('validation-456');
    });
  });
}); 