const ApprovedStudyDAO = require('../../dao/approvedStudy');
const GenericDAO = require('../../dao/generic');

jest.mock('../../dao/generic');

describe('ApprovedStudyDAO', () => {
    let approvedStudyDAO;
    let mockFindById;

    beforeEach(() => {
        // Mock the findById method on the prototype
        mockFindById = jest.fn();
        GenericDAO.prototype.findById = mockFindById;
        approvedStudyDAO = new ApprovedStudyDAO();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('getApprovedStudyByID', () => {
        it('should call findById with the correct studyID and return the result', async () => {
            const studyID = '123';
            const mockResult = { id: studyID, name: 'Test Study' };
            mockFindById.mockResolvedValue(mockResult);

            const result = await approvedStudyDAO.getApprovedStudyByID(studyID);

            expect(mockFindById).toHaveBeenCalledWith(studyID);
            expect(result).toBe(mockResult);
        });

        it('should return null if findById returns null', async () => {
            const studyID = 'notfound';
            mockFindById.mockResolvedValue(null);

            const result = await approvedStudyDAO.getApprovedStudyByID(studyID);

            expect(mockFindById).toHaveBeenCalledWith(studyID);
            expect(result).toBeNull();
        });

        it('should propagate errors from findById', async () => {
            const studyID = 'error';
            const error = new Error('Database error');
            mockFindById.mockRejectedValue(error);

            await expect(approvedStudyDAO.getApprovedStudyByID(studyID)).rejects.toThrow('Database error');
            expect(mockFindById).toHaveBeenCalledWith(studyID);
        });
    });
});