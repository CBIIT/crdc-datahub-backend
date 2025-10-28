const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
class S3Service {

    constructor() {
        this.s3 = new AWS.S3();
    }

    async createPreSignedURL(bucketName, prefix, fileName) {
        try {
            const params = {
                Bucket: bucketName,
                Key: `${prefix}/${fileName}`,
                Expires: 3600, // 1 hour
                ACL: 'private', // files to be publicly inaccessible
                ContentType: 'text/tab-separated-values',
                ContentDisposition: `attachment; filename="${fileName}"`,
            };
            return new Promise((resolve, reject) => {
                this.s3.getSignedUrl('putObject', params, (error, url) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(url);
                    }
                });
            });
        } catch (error) {
            console.error('Error generating pre-signed URL:', error);
        }
    }

    /**
     * createDownloadSignedURL
     * @param {*} bucketName 
     * @param {*} prefix 
     * @param {*} fileName 
     * @returns 
     */
    async createDownloadSignedURL(bucketName, prefix, fileName, outputFileName = fileName) {
        try {
            const params = {
                Bucket: bucketName,
                Key: path.join(prefix,fileName),
                Expires: 3600, // 1 hour
                ResponseContentDisposition: 'attachment; filename ="' + outputFileName + '"'
            };
            return new Promise((resolve, reject) => {
                this.s3.getSignedUrl('getObject', params, (error, url) => {
                    if (error) {
                        reject(error);
                    } else {
                        resolve(url);
                    }
                });
            });
        } catch (error) {
            console.error('Error generating pre-signed URL:', error);
        }
    }

    /**
     * Asynchronously uploads a file to an AWS S3 bucket.
     * @param {string} bucketName - The name of the S3 bucket to upload the file to.
     * @param {string} prefix - The prefix (folder path) in the S3 bucket where the file will be uploaded.
     * @param {string} fileName - The name of the file to be uploaded.
     * @param {string} filePath - The local path of the file to be uploaded.
     * @returns {Promise<Object>} A promise that resolves to the result of the upload operation if successful.
     */
    async uploadZipFile(bucketName, prefix, fileName, filePath) {
        return new Promise((resolve, reject) => {
            const fileStream = fs.createReadStream(filePath);
            const params = {
              Bucket: bucketName,
              Key: path.join(prefix,fileName), // Construct Key using prefix and fileName
              Body: fileStream,
              ContentType: "application/zip",
            };
        
            this.s3.upload(params, (err, data) => {
              if (err) {
                reject(err);
              } else {
                resolve(data);
              }
            });
          });
    }

    /**
     * downloadFile
     * @param {*} bucketName 
     * @param {*} prefix 
     * @param {*} fileName 
     * @param {*} filePath 
     * @returns {Promise<Object>} 
     */
    async downloadFile(bucketName, prefix, fileName, filePath){
        return new Promise((resolve, reject) => {
            const params = {
                Bucket: bucketName,
                Key: path.join(prefix, fileName), // Construct Key using prefix and fileName
            };
            const fileStream = fs.createWriteStream(filePath);
            const s3Stream = this.s3.getObject(params).createReadStream();

            s3Stream.on('error', (err) => {
                console.error(`Error reading from S3: ${err.message}`);
                reject(err);
            });

            fileStream.on('error', (err) => {
                console.error(`Error writing to file: ${err.message}`);
                reject(err);
            });

            fileStream.on('finish', () => {
                // console.info(`File downloaded successfully to ${filePath}`);
                resolve(filePath);
            });

            s3Stream.pipe(fileStream);
        });
    }
    /**
     * Asynchronously deletes a file from an AWS S3 bucket.
     * @param {string} bucketName - The name of the S3 bucket from which the file will be deleted.
     * @param {string} fileKey - The key (path including the filename) of the file to delete.
     * @returns {Promise<Object>} A promise that resolves to the result of the delete operation if successful.
     */
    async deleteFile(bucketName, fileKey) {
        return new Promise((resolve, reject) => {
            try {
                this.s3.deleteObject({Bucket: bucketName, Key: fileKey}, (err, data)=> {
                    if (err) {
                        console.error(`Failed to delete file "${fileKey}" from bucket "${bucketName}": ${err.message}`);
                        reject(err);
                    } else {
                        resolve(data);
                    }
                });
            } catch (err) {
                console.error(`Failed to delete file "${fileKey}" from bucket "${bucketName}": ${err.message}`);
                reject(err);
            }
        });
    }

    /**
     * Asynchronously lists objects in an S3 bucket that match a given file key prefix.
     *
     * @param {string} bucketName - The name of the S3 bucket.
     * @param {string} fileKey - The prefix of the file keys to list.
     * @returns {Promise<Object>} A promise that resolves with the list of objects if successful, or rejects with an error.
     */
    async listFile(bucketName, fileKey) {
        return new Promise((resolve, reject) => {
            this.s3.listObjects({Bucket: bucketName, Prefix: fileKey}, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    /**
     * delete objects under dir recursively
     * @param {*} bucket 
     * @param {*} dir 
     * @returns 
     */
    async deleteDirectory(bucket, dir) {
        const listParams = {
            Bucket: bucket,
            Prefix: (dir.endsWith("/"))? dir : dir + "/"
        };
    
        const listedObjects = await this.s3.listObjectsV2(listParams).promise();
    
        if (listedObjects.Contents.length === 0) return true;  //no files to delete;
    
        const deleteParams = {
            Bucket: bucket,
            Delete: { Objects: [] }
        };
    
        listedObjects.Contents.forEach(({ Key }) => {
            deleteParams.Delete.Objects.push({ Key });
        });
    
        await this.s3.deleteObjects(deleteParams).promise();
    
        if (listedObjects.IsTruncated) await this.deleteDirectory(bucket, dir); // finally delete the dir
        return true; // if no errors
    }

    /**
     * Asynchronously lists objects in an S3 bucket that match a given file key prefix.
     *
     * @param {string} bucketName - The name of the S3 bucket.
     * @param {string} dir - The prefix of the files to list.
     * @returns {Promise<Object>} A promise that resolves with the list of objects if successful, or rejects with an error.
     */
    async listFileInDir(bucketName, dir) {
        const listParams = {
            Bucket: bucketName,
            Prefix: (dir.endsWith("/")) ? dir : dir + "/"
        };

        let fileObjects = [];
        const listRecursively = async (params) => {
            try {
                const data = await this._listObjectsV2(params);
                if (data.Contents) {
                    fileObjects.push(...data.Contents);
                    if (data.IsTruncated) {  // If more objects are available, continue with the next token
                        params.ContinuationToken = data.NextContinuationToken;
                        await listRecursively(params);
                    }
                }
            } catch (err) {
                console.error(`Failed to listing files from bucket "${bucketName}": ${err.toString()}`);
                throw err;
            }
        };

        await listRecursively(listParams);  // Start recursive listing
        return fileObjects;
    }

    async _listObjectsV2(params) {
        return new Promise((resolve, reject) => {
            this.s3.listObjectsV2(params, (err, data) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(data);
                }
            });
        });
    }

    /**
     * purgeDeletedFiles
     * @param {*} bucketName 
     * @param {*} topFolder 
     * @param {*} purgeDays 
     * @returns Promise<boolean> true if no exceptions
     */
    async purgeDeletedFiles(bucketName, topFolder, purgeDays, completed_tag) {
        const now = new Date();
        // purgeDays = 0.01;// test code need to be commented out after testing
        const purgeDate = new Date(now.getTime() - purgeDays * 24 * 60 * 60 * 1000);
        // List all objects under the top folder 
        const listParams = {
            Bucket: bucketName,
            Prefix: (topFolder.endsWith("/")) ? topFolder : topFolder + "/", // Only list objects under this prefix
        };

        let isTruncated = true;
        let continuationToken = null;
        const filesToBeDelete = [];
        //1) file deletable files
        while (isTruncated) {
            listParams.ContinuationToken = continuationToken;
            const listResponse = await this.s3.listObjectsV2(listParams).promise();;
            isTruncated = listResponse.IsTruncated;
            continuationToken = listResponse.NextContinuationToken;

            // Iterate through the objects (files) listed in Contents
            for (const object of listResponse.Contents) {
                const objectKey = object.Key;

                // Skip the folder itself (if it exists as an object)
                if (objectKey.endsWith("/")) {
                    continue;
                }

                // Get the tags for the object
                const tagParams = {
                    Bucket: bucketName,
                    Key: objectKey,
                };

                const tagResponse = await this.s3.getObjectTagging(tagParams).promise();

                // Check if the object has the desired tag, {key: "Completed", value: true}
                const hasCompleteTag = tagResponse.TagSet.some(
                    (tag) => tag.Key === completed_tag?.Key && tag.Value === completed_tag?.Value
                );

                if (hasCompleteTag && object.LastModified < purgeDate) {
                    filesToBeDelete.push(objectKey);
                }
            }
        }
        //2) delete deletable files
        if (filesToBeDelete.length > 0) {
            await this._deleteObjects(bucketName, filesToBeDelete);
            console.info(`Purged ${filesToBeDelete.length} deleted data files successfully: [${filesToBeDelete}].`);
        }
        else 
            console.info("No data files to be purged.");
        return true;  // if no exceptions
    }

    async _deleteObjects(bucketName, fileKeyList) {
        const deleteParams = {
            Bucket: bucketName,
            Delete: { Objects: fileKeyList.map(fileKey => ({ Key: fileKey})) }
        };
        await this.s3.deleteObjects(deleteParams).promise();
    }
}

module.exports = {
    S3Service
}