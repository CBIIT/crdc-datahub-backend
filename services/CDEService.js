const CdeDAO = require("../dao/cde");
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
    constructor() {
        this.name = "CDE";
        this.cdeDAO = new CdeDAO();
    }
    /**
     * API: getCDEs
     * @param {*} params 
     * @returns [CDE]
     */
    async getCDEs(params) {
        if (!params?.CDEInfo || !Array.isArray(params?.CDEInfo) || params?.CDEInfo.length === 0) return [];
        const CDEInfoArray = params?.CDEInfo.filter(c=>c?.CDEVersion).map(cde => ({
            CDECode: cde.CDECode,
            CDEVersion: cde.CDEVersion
          })).concat(params?.CDEInfo.filter(c=>!c?.CDEVersion).map(cde => ({
            CDECode: cde.CDECode
          })));
        return await this.cdeDAO.getCdeByCodeAndVersion(CDEInfoArray); 
    }
}

module.exports = {
    CDE
};