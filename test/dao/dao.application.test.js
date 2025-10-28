const ApplicationDAO = require('../../dao/application');
const prisma = require('../../prisma');

jest.mock('../../prisma', () => ({
    application: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn(),
    }
}));

jest.mock('../../dao/utils/orm-converter', () => ({
    convertIdFields: jest.fn((x) => x),
    convertMongoFilterToPrismaFilter: jest.fn((x) => x),
    handleDotNotation: jest.fn((x) => x),
    mongoSortToPrismaOrderBy: jest.fn((sortObj) => {
        // Mock implementation that returns a simple orderBy object
        const [key, direction] = Object.entries(sortObj)[0];
        return { [key]: direction === 1 ? 'asc' : 'desc' };
    })
}));

describe('ApplicationDAO', () => {
    let dao;
    beforeEach(() => {
        dao = new ApplicationDAO();
        jest.clearAllMocks();
    });

    describe('insert', () => {
        it('should insert application and return acknowledged', async () => {
            prisma.application.create.mockResolvedValue({ id: 'app1' });
            const result = await dao.insert({ foo: 'bar' });
            expect(prisma.application.create).toHaveBeenCalled();
            expect(result).toEqual({ acknowledged: true, insertedId: 'app1' });
        });
    });

    describe('update', () => {
        it('should update application by _id', async () => {
            prisma.application.update.mockResolvedValue({ id: 'app1' });
            const result = await dao.update({ _id: 'app1', foo: 'baz' });
            expect(prisma.application.update).toHaveBeenCalled();
            // Accept the actual return shape from DAO (id, _id)
            expect(result).toEqual({ id: 'app1', _id: 'app1' });
        });

        it('should update application by id', async () => {
            prisma.application.update.mockResolvedValue({ id: 'app2' });
            const result = await dao.update({ id: 'app2', bar: 'baz' });
            expect(prisma.application.update).toHaveBeenCalled();
            expect(result).toEqual({ id: 'app2', _id: 'app2' });
        });
    });

    describe('updateMany', () => {
        it('should update many applications', async () => {
            prisma.application.updateMany.mockResolvedValue({ count: 2 });
            const result = await dao.updateMany({ foo: 'bar' }, { status: 'APPROVED' });
            expect(prisma.application.updateMany).toHaveBeenCalled();
            expect(result).toEqual({ matchedCount: 2, modifiedCount: 2 });
        });
    });

    describe('aggregate', () => {
        it('should aggregate with $match, $sort, $limit', async () => {
            prisma.application.findMany.mockResolvedValue([
                { id: 'app1', foo: 1 },
                { id: 'app2', foo: 2 }
            ]);
            const pipeline = [
                { $match: { foo: 1 } },
                { $sort: { foo: -1 } },
                { $limit: 1 }
            ];
            const result = await dao.aggregate(pipeline);
            expect(prisma.application.findMany).toHaveBeenCalled();
            expect(result).toEqual([
                { id: 'app1', foo: 1, _id: 'app1' },
                { id: 'app2', foo: 2, _id: 'app2' }
            ]);
        });
    });

    describe('distinct', () => {
        it('should return distinct values for a field', async () => {
            prisma.application.findMany.mockResolvedValue([
                { status: 'APPROVED' },
                { status: 'NEW' },
                { status: 'APPROVED' }
            ]);
            const result = await dao.distinct('status');
            expect(prisma.application.findMany).toHaveBeenCalled();
            expect(result).toEqual(['APPROVED', 'NEW']);
        });

        it('should return distinct values for a nested field', async () => {
            prisma.application.findMany.mockResolvedValue([
                { applicant: { applicantName: 'Alice' } },
                { applicant: { applicantName: 'Bob' } },
                { applicant: { applicantName: 'Alice' } }
            ]);
            const result = await dao.distinct('applicant.applicantName');
            expect(prisma.application.findMany).toHaveBeenCalled();
            expect(result).toEqual(['Alice', 'Bob']);
        });
    });
});
