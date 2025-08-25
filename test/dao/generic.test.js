const GenericDAO = require('../../dao/generic');
const prisma = require('../../prisma');

jest.mock('../../prisma', () => ({
    testModel: {
        create: jest.fn(),
        createMany: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
    }
}));

const TEST_MODEL = 'testModel';

describe('GenericDAO', () => {
    let dao;
    beforeEach(() => {
        dao = new GenericDAO(TEST_MODEL);
        jest.clearAllMocks();
    });

    it('should create a record', async () => {
        prisma.testModel.create.mockResolvedValue({ id: '1', foo: 'bar' });
        const res = await dao.create({ foo: 'bar' });
        expect(res).toEqual({ id: '1', foo: 'bar', _id: '1' });
    });

    it('should create many records', async () => {
        prisma.testModel.createMany.mockResolvedValue({ count: 2 });
        const res = await dao.createMany([{ foo: 1 }, { foo: 2 }]);
        expect(res).toEqual({ count: 2 });
    });

    it('should find by id', async () => {
        prisma.testModel.findUnique.mockResolvedValue({ id: '1', foo: 'bar' });
        const res = await dao.findById('1');
        expect(res).toEqual({ id: '1', foo: 'bar', _id: '1' });
    });

    it('should return null if not found by id', async () => {
        prisma.testModel.findUnique.mockResolvedValue(null);
        const res = await dao.findById('notfound');
        expect(res).toBeNull();
    });

    it('should find all', async () => {
        prisma.testModel.findMany.mockResolvedValue([{ id: '1', foo: 1 }, { id: '2', foo: 2 }]);
        const res = await dao.findAll();
        expect(res).toEqual([
            { id: '1', foo: 1, _id: '1' },
            { id: '2', foo: 2, _id: '2' }
        ]);
    });

    it('should find first', async () => {
        prisma.testModel.findFirst.mockResolvedValue({ id: '1', foo: 1 });
        const res = await dao.findFirst({ foo: 1 });
        expect(res).toEqual({ id: '1', foo: 1, _id: '1' });
    });

    it('should return null if not found in findFirst', async () => {
        prisma.testModel.findFirst.mockResolvedValue(null);
        const res = await dao.findFirst({ foo: 1 });
        expect(res).toBeNull();
    });

    it('should find many', async () => {
        prisma.testModel.findMany.mockResolvedValue([{ id: '1', foo: 1 }, { id: '2', foo: 2 }]);
        const res = await dao.findMany({ foo: { $in: [1, 2] } });
        expect(res).toEqual([
            { id: '1', foo: 1, _id: '1' },
            { id: '2', foo: 2, _id: '2' }
        ]);
    });

    it('should update a record', async () => {
        prisma.testModel.update.mockResolvedValue({ id: '1', foo: 'baz' });
        const res = await dao.update('1', { foo: 'baz' });
        expect(res).toEqual({ id: '1', foo: 'baz', _id: '1' });
    });

    it('should update many records', async () => {
        prisma.testModel.updateMany.mockResolvedValue({ count: 2 });
        const res = await dao.updateMany({ foo: 1 }, { foo: 2 });
        expect(res).toEqual({ count: 2 });
    });

    it('should delete a record', async () => {
        prisma.testModel.delete.mockResolvedValue({ id: '1', foo: 'bar' });
        const res = await dao.delete('1');
        expect(res).toEqual({ id: '1', foo: 'bar' });
    });

    it('should delete many records', async () => {
        prisma.testModel.deleteMany.mockResolvedValue({ count: 2 });
        const res = await dao.deleteMany({ foo: 1 });
        expect(res).toEqual({ count: 2 });
    });

    it('should count records', async () => {
        prisma.testModel.count.mockResolvedValue(2);
        const res = await dao.count({ foo: 'bar' });
        expect(res).toBe(2);
        expect(prisma.testModel.count).toHaveBeenCalledWith({ where: { foo: 'bar' } });
    });

    it('should get distinct values', async () => {
        // Simulate flat field
        prisma.application = { findMany: jest.fn().mockResolvedValue([{ foo: 1 }, { foo: 2 }, { foo: 1 }]) };
        dao.model = prisma.application;
        const res = await dao.distinct('foo', {});
        expect(res).toEqual([1, 2]);
    });

    it('should get distinct values for nested field', async () => {
        prisma.application = { findMany: jest.fn().mockResolvedValue([
            { parent: { child: 'a' } },
            { parent: { child: 'b' } },
            { parent: { child: 'a' } }
        ]) };
        dao.model = prisma.application;
        const res = await dao.distinct('parent.child', {});
        expect(res).toEqual(['a', 'b']);
    });

    it('should aggregate with $match', async () => {
        prisma.application = { findMany: jest.fn().mockResolvedValue([{ id: '1', foo: 1 }]) };
        dao.model = prisma.application;
        const res = await dao.aggregate([{ $match: { foo: 1 } }]);
        expect(res).toEqual([{ id: '1', foo: 1, _id: '1' }]);
    });
});
