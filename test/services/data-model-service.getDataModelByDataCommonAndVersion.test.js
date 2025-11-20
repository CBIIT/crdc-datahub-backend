const DataModelService = require('../../services/data-model-service');
const https = require('https');
const { MDFReader } = require('mdf-reader');
const path = require('path');

// Mock Prisma to prevent initialization errors in CI
jest.mock('../../prisma', () => ({
    configuration: {
        findFirst: jest.fn(),
    },
}));

jest.mock('https');
jest.mock('mdf-reader');

describe('DataModelService.getDataModelByDataCommonAndVersion', () => {
    const CURRENT_DEF_VERSION = 'current-version';
    const DEF_MODEL_FILES = 'model-files';

    let dataModelManifestInfoMock;
    let service;
    const modelUrl = '/models/manifest.json';

    beforeEach(() => {
        dataModelManifestInfoMock = jest.fn();
        service = new DataModelService(dataModelManifestInfoMock, modelUrl);
        MDFReader.mockClear();
    });

    it('returns [] if dataCommon is not provided', async () => {
        const result = await service.getDataModelByDataCommonAndVersion(null, 'v1');
        expect(result).toEqual([]);
    });

    it('returns [] if manifest info is not available', async () => {
        dataModelManifestInfoMock.mockResolvedValue(null);
        const result = await service.getDataModelByDataCommonAndVersion('foo', 'v1');
        expect(result).toEqual([]);
    });

    it('returns [] if file path is not http (local file)', async () => {
        dataModelManifestInfoMock.mockResolvedValue({
            foo: {
                [CURRENT_DEF_VERSION]: 'v1',
                [DEF_MODEL_FILES]: ['model1.mdf']
            }
        });
        // modelDir is /models, so path.join will not start with http
        const result = await service.getDataModelByDataCommonAndVersion('foo', 'v1');
        expect(result).toEqual([]);
    });

    it('fetches remote files via https and returns MDFReader instance', async () => {
        dataModelManifestInfoMock.mockResolvedValue({
            foo: {
                [CURRENT_DEF_VERSION]: 'v1',
                [DEF_MODEL_FILES]: ['model1.mdf', 'model2.mdf']
            }
        });

        // Patch path.join to return http URLs for this test
        jest.spyOn(path, 'join').mockImplementation((...args) => {
            // Only return http for model files, not for modelDir
            if (args[args.length - 1].endsWith('.mdf')) {
                return `http://example.com/${args[args.length - 1]}`;
            }
            return '/mocked/dir';
        });

        // Mock https.get to simulate remote file fetch
        https.get.mockImplementation((url, cb) => {
            const events = {};
            const response = {
                on: (event, handler) => {
                    events[event] = handler;
                    return response;
                }
            };
            setImmediate(() => {
                if (cb) cb(response);
                setImmediate(() => {
                    events['data'] && events['data'](`content-for-${url}`);
                    setImmediate(() => {
                        events['end'] && events['end']();
                    });
                });
            });
            return { on: () => {} };
        });

        MDFReader.mockImplementation(function (...args) {
            this.args = args;
            return this;
        });

        const result = await service.getDataModelByDataCommonAndVersion('foo', 'v1');
        expect(MDFReader).toHaveBeenCalledWith(
            'content-for-http://example.com/model1.mdf',
            'content-for-http://example.com/model2.mdf'
        );
        expect(result).toBeInstanceOf(MDFReader);

        path.join.mockRestore();
    });

    it('throws error if no data model files are found', async () => {
        dataModelManifestInfoMock.mockResolvedValue({
            foo: {
                [CURRENT_DEF_VERSION]: 'v1',
                [DEF_MODEL_FILES]: []
            }
        });

        // Patch path.join to return http URLs
        jest.spyOn(path, 'join').mockImplementation((...args) => {
            return `http://example.com/${args[args.length - 1]}`;
        });

        await expect(service.getDataModelByDataCommonAndVersion('foo', 'v1'))
            .rejects
            .toThrow('Failed to find data model definition for foo version v1');

        path.join.mockRestore();
    });

    /* temporary disabled until we can fix it in GitHub Actions
    it('uses current version if version is not provided', async () => {
        dataModelManifestInfoMock.mockResolvedValue({
            foo: {
                [CURRENT_DEF_VERSION]: 'v2',
                [DEF_MODEL_FILES]: ['model1.mdf']
            }
        });

        jest.spyOn(path, 'join').mockImplementation((...args) => {
            if (args[args.length - 1].endsWith('.mdf')) {
                return `http://example.com/${args[args.length - 1]}`;
            }
            return '/mocked/dir';
        });

        https.get.mockImplementation((url, cb) => {
            const events = {};
            const response = {
                on: (event, handler) => {
                    events[event] = handler;
                    return response;
                }
            };
            setImmediate(() => {
                if (cb) cb(response);
                setImmediate(() => {
                    events['data'] && events['data'](`content-for-${url}`);
                    setImmediate(() => {
                        events['end'] && events['end']();
                    });
                });
            });
            return { on: () => {} };
        });

        MDFReader.mockImplementation(function (...args) {
            this.args = args;
            return this;
        });

        const result = await service.getDataModelByDataCommonAndVersion('foo');
        expect(MDFReader).toHaveBeenCalledWith('content-for-http://example.com/model1.mdf');
        expect(result).toBeInstanceOf(MDFReader);

        path.join.mockRestore();
    });
     */
});