describe('release service', () => {
    let getReleaseNodeTypesMock;
    let listReleasedDataRecordsMock;

    beforeEach(() => {
        getReleaseNodeTypesMock = jest.fn();
        listReleasedDataRecordsMock = jest.fn();
    });

    it("/getReleaseNodeTypes test success", async () => {
        const mockNodeTypes = ['type1', 'type2'];
        getReleaseNodeTypesMock.mockResolvedValue(mockNodeTypes);

        const result = await getReleaseNodeTypesMock();

        expect(result).toEqual(mockNodeTypes);
        expect(getReleaseNodeTypesMock).toHaveBeenCalledTimes(1);
    });

    it("/getReleaseNodeTypes test error", async () => {
        const mockError = new Error('Failed to fetch node types');
        getReleaseNodeTypesMock.mockRejectedValue(mockError);

        await expect(getReleaseNodeTypesMock()).rejects.toThrow('Failed to fetch node types');
        expect(getReleaseNodeTypesMock).toHaveBeenCalledTimes(1);
    });

    it("/listReleasedDataRecords test success", async () => {
        const mockDataRecords = [
            {id: 1, name: 'Record 1'},
            {id: 2, name: 'Record 2'}
        ];
        listReleasedDataRecordsMock.mockResolvedValue(mockDataRecords);

        const result = await listReleasedDataRecordsMock();

        expect(result).toEqual(mockDataRecords);
        expect(listReleasedDataRecordsMock).toHaveBeenCalledTimes(1);
    });

    it("/listReleasedDataRecords test error", async () => {
        const mockError = new Error('Failed to fetch released data records');
        listReleasedDataRecordsMock.mockRejectedValue(mockError);

        await expect(listReleasedDataRecordsMock()).rejects.toThrow('Failed to fetch released data records');
        expect(listReleasedDataRecordsMock).toHaveBeenCalledTimes(1);
    });
});
