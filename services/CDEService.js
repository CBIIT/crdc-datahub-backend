const CDE_CODE = "CDECode";
const CDE_VERSION = "CDEVersion";
const CDE_FULL_NAME = "CDEFullName";
const PERMISSIBLE_VALUES = "PermissibleValues";
const CREATED_AT = "createdAt";
const UPDATED_AT = "updatedAt";
const DB_ID = "_id";
/**
 * CDE Service
 * @class CDE
 */
class CDE {
    constructor(cdeCollection) {
        this.name = "CDE";
        this.CDE_collection = cdeCollection;
    }
    /**
     * API: getCDEs
     * @param {*} params 
     * @returns [CDE]
     */
    async getCDEs(params) {
        const conditions = params?.CDEInfo.map(cde => ({
            CDECode: cde.CDECode,
            CDEVersion: cde.CDEVersion
          }))
        const query = {"$or": conditions}
        return await this.#find_cde_by_code_version(query); 
    }

    async #find_cde_by_code_version(query) {
        const return_data_fields = {$project: {DB_ID: 1, CDE_FULL_NAME:1, CDECode:1, CDEVersion:1,PERMISSIBLE_VALUES: 1, CREATED_AT: 1, UPDATED_AT: 1} };
        return this.CDE_collection.aggregate([{"$match": query}, return_data_fields]);
    }
}

module.exports = {
    CDE
};