const mockConfig = {
    model_url: 'https://raw.githubusercontent.com/CBIIT/crdc-datahub-models/dev2/cache/content.json'
};
jest.mock('../../config', () => ({
    model_url: mockConfig.model_url
}));

const fs = require('fs');
const https = require('https');
const path = require('path');
const DataModelService = require('../../services/dataModelService');
const { MDFReader } = require('mdf-reader');

jest.mock('fs');
jest.mock('https');
jest.mock('mdf-reader', () => ({
    MDFReader: jest.fn()
}));


describe('DataModelService.getDataModelByDataCommonAndVersion', () => {
    const mockManifest = {
        testCommon: {
            'current-version': 'v1',
            'model-files': ['file1.mdf', 'file2.mdf']
        }
    };
    const modelUrl = '/models/manifest.json';
    let service;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new DataModelService(
            jest.fn().mockResolvedValue(mockManifest),
            modelUrl
        );
    });

    it('reads local files and returns MDFReader instance', async () => {
        fs.readFileSync.mockImplementation((filePath, encoding) => {
            expect(encoding).toBe('utf8');
            return `content-of-${path.basename(filePath)}`;
        });
        MDFReader.mockImplementation((...args) => ({ args }));

        const result = await service.getDataModelByDataCommonAndVersion('testCommon', 'v1');
        expect(fs.readFileSync).toHaveBeenCalledTimes(2);
        expect(MDFReader).toHaveBeenCalledWith('content-of-file1.mdf', 'content-of-file2.mdf');
        expect(result.args).toEqual(['content-of-file1.mdf', 'content-of-file2.mdf']);
    });

    it('throws error if no model files are found', async () => {
        const emptyManifest = {
            testCommon: {
                'current-version': 'v1',
                'model-files': []
            }
        };
        service = new DataModelService(jest.fn().mockResolvedValue(emptyManifest), modelUrl);

        await expect(
            service.getDataModelByDataCommonAndVersion('testCommon', 'v1')
        ).rejects.toThrow('Failed to find data model definition for testCommon version v1');
    });

    it('uses current-version if version is not provided', async () => {
        fs.readFileSync.mockReturnValue('file-content');
        MDFReader.mockImplementation((...args) => ({ args }));

        await service.getDataModelByDataCommonAndVersion('testCommon');
        // Should use 'v1' from manifest
        expect(fs.readFileSync.mock.calls[0][0]).toContain(path.join('testCommon', 'v1', 'file1.mdf'));
    });
});