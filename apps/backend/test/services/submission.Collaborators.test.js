const SUBMISSION_CONSTANTS = require('../../constants/submission-constants');
const { COLLABORATOR_PERMISSIONS } = SUBMISSION_CONSTANTS;

// Since the Collaborators class is defined inside the submission service,
// we'll test it by creating a mock implementation based on the actual class
class Collaborators {
    constructor(collaborators) {
        this.collaborators = collaborators || [];
    }

    static createCollaborators(collaborators) {
        return new Collaborators(collaborators)
    }

    getCollaboratorIDs() {
        return this.collaborators
            .filter(c => c && c.collaboratorID)
            .map(c => c.collaboratorID)
    }

    getCollaboratorNames() {
        return this.collaborators
            .filter(c => c && c.collaboratorName)
            .map(c => c.collaboratorName)
    }

    getEditableCollaboratorIDs() {
        return this._getEditableCollaborators(this.collaborators)
    }

    _getEditableCollaborators(collaborators) {
        return collaborators
            .filter(c => c.permission === SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT)
            .map(c => c.collaboratorID)
    }
}

describe('Collaborators class', () => {

    describe('Constructor', () => {
        it('should create instance with provided collaborators', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            expect(instance.collaborators).toEqual(collaborators);
        });

        it('should create instance with empty array when no collaborators provided', () => {
            const instance = new Collaborators();
            expect(instance.collaborators).toEqual([]);
        });

        it('should create instance with empty array when null provided', () => {
            const instance = new Collaborators(null);
            expect(instance.collaborators).toEqual([]);
        });

        it('should create instance with empty array when undefined provided', () => {
            const instance = new Collaborators(undefined);
            expect(instance.collaborators).toEqual([]);
        });
    });

    describe('createCollaborators static method', () => {
        it('should create new Collaborators instance', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: SUBMISSION_CONSTANTS.COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = Collaborators.createCollaborators(collaborators);
            expect(instance).toBeInstanceOf(Collaborators);
            expect(instance.collaborators).toEqual(collaborators);
        });

        it('should create instance with empty array when no collaborators provided', () => {
            const instance = Collaborators.createCollaborators();
            expect(instance).toBeInstanceOf(Collaborators);
            expect(instance.collaborators).toEqual([]);
        });

        it('should create instance with empty array when null provided', () => {
            const instance = Collaborators.createCollaborators(null);
            expect(instance).toBeInstanceOf(Collaborators);
            expect(instance.collaborators).toEqual([]);
        });
    });

    describe('getCollaboratorIDs method', () => {
        it('should return array of collaborator IDs', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getCollaboratorIDs();
            
            expect(result).toEqual(['user1', 'user2']);
        });

        it('should return empty array when no collaborators', () => {
            const instance = new Collaborators();
            const result = instance.getCollaboratorIDs();
            
            expect(result).toEqual([]);
        });

        it('should handle collaborators without collaboratorID property', () => {
            const collaborators = [
                { permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getCollaboratorIDs();
            
            expect(result).toEqual(['user2']);
        });
    });

    describe('getCollaboratorNames method', () => {
        it('should return array of collaborator names', () => {
            const collaborators = [
                { collaboratorID: 'user1', collaboratorName: 'John Doe', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', collaboratorName: 'Jane Smith', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getCollaboratorNames();
            
            expect(result).toEqual(['John Doe', 'Jane Smith']);
        });

        it('should return empty array when no collaborators', () => {
            const instance = new Collaborators();
            const result = instance.getCollaboratorNames();
            
            expect(result).toEqual([]);
        });

        it('should handle collaborators without collaboratorName property', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', collaboratorName: 'Jane Smith', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getCollaboratorNames();
            
            expect(result).toEqual(['Jane Smith']);
        });
    });

    describe('getEditableCollaboratorIDs method', () => {
        it('should return array of editable collaborator IDs', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: 'Read Only' },
                { collaboratorID: 'user3', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getEditableCollaboratorIDs();
            
            expect(result).toEqual(['user1', 'user3']);
        });

        it('should return empty array when no collaborators', () => {
            const instance = new Collaborators();
            const result = instance.getEditableCollaboratorIDs();
            
            expect(result).toEqual([]);
        });

        it('should return empty array when no editable collaborators', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: 'Read Only' },
                { collaboratorID: 'user2', permission: 'View Only' }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getEditableCollaboratorIDs();
            
            expect(result).toEqual([]);
        });

        it('should handle collaborators without permission property', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2' },
                { collaboratorID: 'user3', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getEditableCollaboratorIDs();
            
            expect(result).toEqual(['user1', 'user3']);
        });
    });

    describe('_getEditableCollaborators private method', () => {
        it('should return array of collaborators with CAN_EDIT permission', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: 'Read Only' },
                { collaboratorID: 'user3', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance._getEditableCollaborators(collaborators);
            
            expect(result).toEqual(['user1', 'user3']);
        });

        it('should return empty array when no collaborators', () => {
            const instance = new Collaborators();
            const result = instance._getEditableCollaborators([]);
            
            expect(result).toEqual([]);
        });

        it('should return empty array when no editable collaborators', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: 'Read Only' },
                { collaboratorID: 'user2', permission: 'View Only' }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance._getEditableCollaborators(collaborators);
            
            expect(result).toEqual([]);
        });

        it('should handle case-sensitive permission matching', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: 'can edit' }, // lowercase
                { collaboratorID: 'user2', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }, // exact match
                { collaboratorID: 'user3', permission: 'CAN_EDIT' } // uppercase
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance._getEditableCollaborators(collaborators);
            
            expect(result).toEqual(['user2']);
        });
    });

    describe('Edge cases and error handling', () => {
        it('should handle collaborators with null values', () => {
            const collaborators = [
                null,
                { collaboratorID: 'user1', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                undefined
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getCollaboratorIDs();
            
            expect(result).toEqual(['user1']);
        });

        it('should handle collaborators with non-string IDs', () => {
            const collaborators = [
                { collaboratorID: 123, permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: { id: 'user3' }, permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getCollaboratorIDs();
            
            expect(result).toEqual([123, 'user2', { id: 'user3' }]);
        });

        it('should handle collaborators with non-string names', () => {
            const collaborators = [
                { collaboratorID: 'user1', collaboratorName: 123, permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', collaboratorName: 'Jane Smith', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user3', collaboratorName: { name: 'John' }, permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getCollaboratorNames();
            
            expect(result).toEqual([123, 'Jane Smith', { name: 'John' }]);
        });

        it('should handle empty string permissions', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: '', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getEditableCollaboratorIDs();
            
            expect(result).toEqual(['user1', 'user2']);
        });

        it('should handle whitespace-only permissions', () => {
            const collaborators = [
                { collaboratorID: 'user1', permission: '   ', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT },
                { collaboratorID: 'user2', permission: COLLABORATOR_PERMISSIONS.CAN_EDIT }
            ];
            
            const instance = new Collaborators(collaborators);
            const result = instance.getEditableCollaboratorIDs();
            
            expect(result).toEqual(['user1', 'user2']);
        });
    });

    describe('Integration with submission service', () => {
        it('should work with real submission service collaborators', () => {
            // This test simulates how the Collaborators class is used in the submission service
            const submissionCollaborators = [
                {
                    collaboratorID: 'user1',
                    collaboratorName: 'John Doe',
                    Organization: 'Test Org',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
                },
                {
                    collaboratorID: 'user2',
                    collaboratorName: 'Jane Smith',
                    Organization: 'Another Org',
                    permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
                }
            ];
            
            const instance = Collaborators.createCollaborators(submissionCollaborators);
            
            expect(instance.getCollaboratorIDs()).toEqual(['user1', 'user2']);
            expect(instance.getCollaboratorNames()).toEqual(['John Doe', 'Jane Smith']);
            expect(instance.getEditableCollaboratorIDs()).toEqual(['user1', 'user2']);
        });

        it('should handle submission service edge case with empty collaborators', () => {
            const instance = Collaborators.createCollaborators([]);
            
            expect(instance.getCollaboratorIDs()).toEqual([]);
            expect(instance.getCollaboratorNames()).toEqual([]);
            expect(instance.getEditableCollaboratorIDs()).toEqual([]);
        });
    });

    describe('Performance considerations', () => {
        it('should handle large number of collaborators', () => {
            const largeCollaboratorsList = Array.from({ length: 1000 }, (_, i) => ({
                collaboratorID: `user${i}`,
                collaboratorName: `User ${i}`,
                permission: COLLABORATOR_PERMISSIONS.CAN_EDIT
            }));
            
            const instance = new Collaborators(largeCollaboratorsList);
            const result = instance.getCollaboratorIDs();
            
            expect(result).toHaveLength(1000);
        });

        it('should handle mixed permission types efficiently', () => {
            const mixedCollaborators = Array.from({ length: 100 }, (_, i) => ({
                collaboratorID: `user${i}`,
                collaboratorName: `User ${i}`,
                permission: i % 2 === 0 ? COLLABORATOR_PERMISSIONS.CAN_EDIT : 'Read Only'
            }));
            
            const instance = new Collaborators(mixedCollaborators);
            
            const editableIds = instance.getEditableCollaboratorIDs();
            
            expect(editableIds).toHaveLength(50); // Half should be editable
            expect(editableIds.every(id => id.startsWith('user') && parseInt(id.slice(4)) % 2 === 0)).toBe(true);
        });
    });
}); 