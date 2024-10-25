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
        const conditions = params?.CDEInfo.filter(c=>c?.CDEVersion).map(cde => ({
            CDECode: cde.CDECode,
            CDEVersion: cde.CDEVersion
          })).concat(params?.CDEInfo.filter(c=>!c?.CDEVersion).map(cde => ({
            CDECode: cde.CDECode
          })));
          
        const query = {"$or": conditions}
        return await this.#find_cde_by_code_version(query); 
    }

    async #find_cde_by_code_version(query) {
        const pipelines = [{"$match": query}];
        pipelines.push({"$sort": {CDECode: 1, CDEVersion: -1}});
        pipelines.push({"$group": {"_id": "$CDECode", "latestDocument": {"$first": "$$ROOT"}}});
        pipelines.push({"$replaceRoot": {"newRoot": "$latestDocument"}});
        return this.CDE_collection.aggregate(pipelines);
    }
}

module.exports = {
    CDE
};