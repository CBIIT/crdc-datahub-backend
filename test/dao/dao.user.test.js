const UserDAO = require('../../dao/user');
const prisma = require('../../prisma');

jest.mock('../../prisma', () => ({
    user: {
        findUnique: jest.fn(),
    },
}));

describe('UserDAO.findByIdAndStatus', () => {
    let userDAO;

    beforeEach(() => {
        userDAO = new UserDAO();
        jest.clearAllMocks();
    });

    it('should return user with _id when found', async () => {
        const mockUser = { id: 1, name: 'Alice', userStatus: 'ACTIVE' };
        prisma.user.findUnique.mockResolvedValue(mockUser);

        const result = await userDAO.findByIdAndStatus(1, 'ACTIVE');

        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: 1, userStatus: 'ACTIVE' },
        });
        expect(result).toEqual({ ...mockUser, _id: mockUser.id });
    });

    it('should return null when user is not found', async () => {
        prisma.user.findUnique.mockResolvedValue(null);

        const result = await userDAO.findByIdAndStatus(2, 'INACTIVE');

        expect(prisma.user.findUnique).toHaveBeenCalledWith({
            where: { id: 2, userStatus: 'INACTIVE' },
        });
        expect(result).toBeNull();
    });
});