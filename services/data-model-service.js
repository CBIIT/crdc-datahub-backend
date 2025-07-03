const fs = require('fs');
const path = require('path');  
const https = require("https");
const { MDFReader } = require('mdf-reader');

const CURRENT_DEF_VERSION = 'current-version';
const DEF_MODEL_FILES = 'model-files';

class DataModelService {
    constructor(dataModelInfo, modelUrl) {
        this.dataModelManifestInfo = dataModelInfo;
        this.modelDir = path.dirname(modelUrl);
    }

    /**
     * Fetches the defined properties for a specific data common, version, and type.
     * @param {*} dataCommon 
     * @param {*} version 
     * @param {*} type 
     * @returns Array
     */
    async getDefinedPropsByDataCommonAndType(dataCommon, version, type) {
        const dataModel = await this.getDataModelByDataCommonAndVersion(dataCommon, version);
        if (!dataModel) {
            return [];
        }
        const nodes =  dataModel.nodes(type);
        if (!nodes || nodes.length === 0) {
            return [];
        }
        const definedProps = nodes?.props();
        return definedProps && definedProps.length > 0 ? definedProps : null;
    }
    /**
     * Fetches the data model based on the provided data common and version.
     * If version is not provided, it defaults to the current version defined in the model manifest.
     * @param {string} dataCommon - The common identifier for the data model.
     * @param {string} [version] - The specific version of the data model. If not provided, the current version will be used.
     * @returns
     * @throws {Error} - Throws an error if the data common is not provided or if the model definition cannot be found.
     */
    async getDataModelByDataCommonAndVersion(dataCommon, version) {
        if (!dataCommon) {
            return [];
        }
        const contents = await this.dataModelManifestInfo();
        if (!contents) {
            return [];
        }
        this.modelDefinition = contents[dataCommon];
        if (!version) {
            version = this.modelDefinition[CURRENT_DEF_VERSION];
        }

        const dataModelDir = path.join(this.modelDir, dataCommon, version);
        const dataModelFileNameArr =  this.modelDefinition[DEF_MODEL_FILES];
        const dataModelFilePathArr = dataModelFileNameArr.map(fileName => path.join(dataModelDir, fileName));

        const dataModelHold = [];
        // read data model files in github by http and MDFReader
        for (let index = 0; index < dataModelFilePathArr.length; index++) {
            const filePath = dataModelFilePathArr[index];
            if (filePath.startsWith('http')) {
                // read data model files in github by http
                const fileContent = new Promise((resolve, reject) => {
                    https.get(filePath, (response) => {
                        let data = '';
                        response.on('data', (chunk) => {
                            data += chunk;
                        });
                        response.on('end', () => {
                            resolve(data);
                        });
                    }).on('error', (error) => {
                        reject(error);
                    });
                });
                dataModelHold.push(fileContent);
            } else {
                return [];
            }
        }

        if (dataModelHold.length === 0) {
            throw new Error(`Failed to find data model definition for ${dataCommon} version ${version}`);
        }

        const fileContents = await Promise.all(dataModelHold);
        return new MDFReader(...fileContents);
    }
}

module.exports = DataModelService;