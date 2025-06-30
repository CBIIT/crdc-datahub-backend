const mockConfig = {
    model_url: 'https://raw.githubusercontent.com/CBIIT/crdc-datahub-models/dev2/cache/content.json'
};
jest.mock('../../config', () => ({
    model_url: mockConfig.model_url
}));

const path = require('path');
const https = require('https');
const { MDFReader } = require('mdf-reader');
const DataModelService = require('../../services/dataModelService');

jest.mock('https');
jest.mock('mdf-reader');


const CURRENT_DEF_VERSION = 'current-version';
const DEF_MODEL_FILES = 'model-files';

describe('DataModelService', () => {
    let dataModelManifestInfo;
    let service;

    beforeEach(() => {
        dataModelManifestInfo = {
            testCommon: {
                [CURRENT_DEF_VERSION]: 'v1',
                [DEF_MODEL_FILES]: ['file1.yaml', 'file2.yaml']
            }
        };
        service = new DataModelService(dataModelManifestInfo);
        MDFReader.mockClear();
    });

    it('should return null if dataCommon is not provided', () => {
        expect(service.getDataModelByDataCommonAndVersion(null, 'v1')).toBeNull();
        expect(service.getDataModelByDataCommonAndVersion(undefined, 'v1')).toBeNull();
    });

    it('should return null if dataCommon is not found in manifest', () => {
        expect(service.getDataModelByDataCommonAndVersion('notFound', 'v1')).toBeNull();
    });

    it('should create MDFReader with file contents from http', async () => {
        // Arrange
        const fileUrl = 'http://example.com/file1.yaml';
        dataModelManifestInfo.testCommon[DEF_MODEL_FILES] = [fileUrl];
        service.modelDir = '/mock/models';

        // Mock https.get to simulate http file fetch
        https.get.mockImplementation((url, cb) => {
            const res = {
                on: (event, handler) => {
                    if (event === 'data') handler('mock file content');
                    if (event === 'end') handler();
                }
            };
            cb(res);
            return { on: jest.fn() };
        });

        // Act
        service.getDataModelByDataCommonAndVersion('testCommon', 'v1');

        // Wait for all promises to resolve (simulate async)
        await new Promise(setImmediate);

        // Assert
        expect(MDFReader).toHaveBeenCalled();
    });

    it('should not push fileContent if filePath is not http', () => {
        dataModelManifestInfo.testCommon[DEF_MODEL_FILES] = ['file1.yaml'];
        service.modelDir = '/mock/models';
        service.getDataModelByDataCommonAndVersion('testCommon', 'v1');
        // MDFReader should still be called, but with no http file promises
        expect(MDFReader).toHaveBeenCalled();
    });
});