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
        return this.CDE_collection.aggregate([{"$match": query}]);
    }
}

module.exports = {
    CDE
};