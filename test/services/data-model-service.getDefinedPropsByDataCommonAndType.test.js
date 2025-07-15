const DataModelService = require('../../services/data-model-service');
const config = require('../../config');

describe('DataModelService.getDefinedPropsByDataCommonAndType', () => {
    let service;
    let mockManifestInfo;
    let mockDataModel;

    beforeEach(() => {
        mockManifestInfo = jest.fn();
        service = new DataModelService(mockManifestInfo, '/models');
        // Mock getDataModelByDataCommonAndVersion for isolation
        service.getDataModelByDataCommonAndVersion = jest.fn();
    });

    it('should return [] if getDataModelByDataCommonAndVersion returns null', async () => {
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(null);
        const result = await service.getDefinedPropsByDataCommonAndType('common', 'v1', 'typeA');
        expect(result).toEqual([]);
    });

    it('should return [] if dataModel.nodes(type) returns null', async () => {
        mockDataModel = { nodes: jest.fn().mockReturnValue(null) };
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(mockDataModel);
        const result = await service.getDefinedPropsByDataCommonAndType('common', 'v1', 'typeA');
        expect(result).toEqual([]);
    });

    it('should return [] if dataModel.nodes(type) returns empty array', async () => {
        mockDataModel = { nodes: jest.fn().mockReturnValue([]) };
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(mockDataModel);
        const result = await service.getDefinedPropsByDataCommonAndType('common', 'v1', 'typeA');
        expect(result).toEqual([]);
    });

    it('should return null if nodes.props() is falsy or empty', async () => {
        const nodesMock = { props: jest.fn().mockReturnValue([]) };
        mockDataModel = { nodes: jest.fn().mockReturnValue(nodesMock) };
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(mockDataModel);
        const result = await service.getDefinedPropsByDataCommonAndType('common', 'v1', 'typeA');
        expect(result).toBeNull();
    });

    it('should return definedProps if nodes.props() returns non-empty array', async () => {
        const definedProps = ['prop1', 'prop2'];
        const nodesMock = { props: jest.fn().mockReturnValue(definedProps) };
        mockDataModel = { nodes: jest.fn().mockReturnValue(nodesMock) };
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(mockDataModel);
        const result = await service.getDefinedPropsByDataCommonAndType('common', 'v1', 'typeA');
        expect(result).toEqual(definedProps);
    });
});