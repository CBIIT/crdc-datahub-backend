const DataModelService = require('../../services/data-model-service');
const config = require('../../config');

jest.mock('fs');
jest.mock('path');
jest.mock('js-yaml');
jest.mock('https');
jest.mock('mdf-reader', () => ({
    MDFReader: jest.fn()
}));
jest.mock('../../config');

describe('DataModelService.getDefinedPropsByDataCommonAndType', () => {
    let service;
    let mockManifest;
    let mockDataModel;

    beforeEach(() => {
        mockManifest = {
            testCommon: {
                'current-version': '1.0.0',
                'model-files': ['file1.mdf']
            }
        };
        config.model_url = '/models/model.yaml';
        service = new DataModelService(mockManifest);

        mockDataModel = {
            nodes: jest.fn()
        };
        service.getDataModelByDataCommonAndVersion = jest.fn();
    });
    it('returns null if props() is undefined', async () => {
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(mockDataModel);
        mockDataModel.nodes.mockReturnValue({ props: () => undefined });
        const result = await service.getDefinedPropsByDataCommonAndType('testCommon', '1.0.0', 'SomeType');
        expect(result).toBeNull();
    });

    it('returns null if props() is empty array', async () => {
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(mockDataModel);
        mockDataModel.nodes.mockReturnValue({ props: () => [] });
        const result = await service.getDefinedPropsByDataCommonAndType('testCommon', '1.0.0', 'SomeType');
        expect(result).toBeNull();
    });

    it('returns definedProps if props() returns non-empty array', async () => {
        const propsArr = [{ name: 'prop1' }, { name: 'prop2' }];
        service.getDataModelByDataCommonAndVersion.mockResolvedValue(mockDataModel);
        mockDataModel.nodes.mockReturnValue({ props: () => propsArr });
        const result = await service.getDefinedPropsByDataCommonAndType('testCommon', '1.0.0', 'SomeType');
        expect(result).toBe(propsArr);
    });
});