const { PrismaPagination } = require('../../../crdc-datahub-database-drivers/domain/prisma-pagination');
const { SORT } = require('../../../constants/db-constants');

describe('PrismaPagination', () => {
    describe('constructor', () => {
        it('should create instance with default sort direction', () => {
            const pagination = new PrismaPagination(10, 0, 'name');
            expect(pagination._sortDirection).toBe(SORT.DESC);
        });

        it('should create instance with custom sort direction', () => {
            const pagination = new PrismaPagination(10, 0, 'name', 'ASC');
            expect(pagination._sortDirection).toBe('ASC');
        });
    });

    describe('getPagination', () => {
        it('should return pagination with direct field sorting', () => {
            const pagination = new PrismaPagination(10, 5, 'name', 'ASC');
            const result = pagination.getPagination();
            
            expect(result).toEqual({
                orderBy: { name: 'asc' },
                skip: 5,
                take: 10
            });
        });

        it('should return pagination with nested field sorting', () => {
            const pagination = new PrismaPagination(10, 5, 'organization.name', 'ASC');
            const result = pagination.getPagination();
            
            expect(result).toEqual({
                orderBy: { organization: { name: 'asc' } },
                skip: 5,
                take: 10
            });
        });

        it('should return pagination without orderBy when not specified', () => {
            const pagination = new PrismaPagination(10, 5, null, 'ASC');
            const result = pagination.getPagination();
            
            expect(result).toEqual({
                skip: 5,
                take: 10
            });
        });

        it('should handle no offset', () => {
            const pagination = new PrismaPagination(10, null, 'name', 'ASC');
            const result = pagination.getPagination();
            
            expect(result).toEqual({
                orderBy: { name: 'asc' },
                take: 10
            });
        });

        it('should handle no limit (first = -1)', () => {
            const pagination = new PrismaPagination(-1, 5, 'name', 'ASC');
            const result = pagination.getPagination();
            
            expect(result).toEqual({
                orderBy: { name: 'asc' },
                skip: 5
            });
        });
    });

    describe('getNoLimit', () => {
        it('should return orderBy without pagination for direct field', () => {
            const pagination = new PrismaPagination(10, 5, 'name', 'ASC');
            const result = pagination.getNoLimit();
            
            expect(result).toEqual({ name: 'asc' });
        });

        it('should return orderBy without pagination for nested field', () => {
            const pagination = new PrismaPagination(10, 5, 'organization.name', 'ASC');
            const result = pagination.getNoLimit();
            
            expect(result).toEqual({ organization: { name: 'asc' } });
        });

        it('should return empty object when no orderBy', () => {
            const pagination = new PrismaPagination(10, 5, null, 'ASC');
            const result = pagination.getNoLimit();
            
            expect(result).toEqual({});
        });
    });

    describe('_buildOrderBy', () => {
        it('should handle direct field sorting', () => {
            const pagination = new PrismaPagination(10, 0, 'name', 'ASC');
            const result = pagination._buildOrderBy();
            
            expect(result).toEqual({ name: 'asc' });
        });

        it('should handle nested field sorting', () => {
            const pagination = new PrismaPagination(10, 0, 'organization.name', 'ASC');
            const result = pagination._buildOrderBy();
            
            expect(result).toEqual({ organization: { name: 'asc' } });
        });

        it('should handle deeply nested field sorting', () => {
            const pagination = new PrismaPagination(10, 0, 'study.organization.name', 'ASC');
            const result = pagination._buildOrderBy();
            
            expect(result).toEqual({ study: { organization: { name: 'asc' } } });
        });

        it('should handle null orderBy', () => {
            const pagination = new PrismaPagination(10, 0, null, 'ASC');
            const result = pagination._buildOrderBy();
            
            expect(result).toEqual({});
        });
    });

    describe('_getSortDirection', () => {
        it('should return DESC for desc sort direction', () => {
            const pagination = new PrismaPagination(10, 0, 'name', 'desc');
            const result = pagination._getSortDirection();
            
            expect(result).toBe(SORT.DESC);
        });

        it('should return ASC for asc sort direction', () => {
            const pagination = new PrismaPagination(10, 0, 'name', 'ASC');
            const result = pagination._getSortDirection();
            
            expect(result).toBe(SORT.ASC);
        });

        it('should return DESC for invalid sort direction', () => {
            const pagination = new PrismaPagination(10, 0, 'name', 'invalid');
            const result = pagination._getSortDirection();
            
            expect(result).toBe(SORT.DESC);
        });
    });
});
