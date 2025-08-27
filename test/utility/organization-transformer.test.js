const { formatNestedOrganization, formatNestedOrganizations } = require('../../utility/organization-transformer');

describe('Organization Transformer', () => {
    describe('formatNestedOrganization', () => {
        it('should format a valid nested organization object from Prisma to GraphQL format', () => {
            const prismaOrg = {
                id: 'org-123',
                name: 'Test Organization',
                abbreviation: 'TO'
            };

            const result = formatNestedOrganization(prismaOrg);

            expect(result).toEqual({
                _id: 'org-123',
                name: 'Test Organization',
                abbreviation: 'TO'
            });
        });

        it('should handle organization with missing abbreviation', () => {
            const prismaOrg = {
                id: 'org-123',
                name: 'Test Organization'
                // abbreviation is undefined
            };

            const result = formatNestedOrganization(prismaOrg);

            expect(result).toEqual({
                _id: 'org-123',
                name: 'Test Organization',
                abbreviation: undefined
            });
        });

        it('should return null for null input', () => {
            const result = formatNestedOrganization(null);
            expect(result).toBeNull();
        });

        it('should return null for undefined input', () => {
            const result = formatNestedOrganization(undefined);
            expect(result).toBeNull();
        });

        it('should return null for empty object input', () => {
            const result = formatNestedOrganization({});
            expect(result).toEqual({
                _id: undefined,
                name: undefined,
                abbreviation: undefined
            });
        });
    });

    describe('formatNestedOrganizations', () => {
        it('should format an array of nested organization objects', () => {
            const prismaOrgs = [
                {
                    id: 'org-1',
                    name: 'Organization 1',
                    abbreviation: 'O1'
                },
                {
                    id: 'org-2',
                    name: 'Organization 2',
                    abbreviation: 'O2'
                }
            ];

            const result = formatNestedOrganizations(prismaOrgs);

            expect(result).toEqual([
                {
                    _id: 'org-1',
                    name: 'Organization 1',
                    abbreviation: 'O1'
                },
                {
                    _id: 'org-2',
                    name: 'Organization 2',
                    abbreviation: 'O2'
                }
            ]);
        });

        it('should handle empty array', () => {
            const result = formatNestedOrganizations([]);
            expect(result).toEqual([]);
        });

        it('should handle null input', () => {
            const result = formatNestedOrganizations(null);
            expect(result).toEqual([]);
        });

        it('should handle undefined input', () => {
            const result = formatNestedOrganizations(undefined);
            expect(result).toEqual([]);
        });

        it('should handle array with null/undefined organizations', () => {
            const prismaOrgs = [
                {
                    id: 'org-1',
                    name: 'Organization 1',
                    abbreviation: 'O1'
                },
                null,
                undefined,
                {
                    id: 'org-2',
                    name: 'Organization 2',
                    abbreviation: 'O2'
                }
            ];

            const result = formatNestedOrganizations(prismaOrgs);

            expect(result).toEqual([
                {
                    _id: 'org-1',
                    name: 'Organization 1',
                    abbreviation: 'O1'
                },
                null,
                null,
                {
                    _id: 'org-2',
                    name: 'Organization 2',
                    abbreviation: 'O2'
                }
            ]);
        });
    });
});
