const prisma = require("../prisma");
const { SORT, MODEL_NAME} = require('../constants/db-constants');
const GenericDAO = require("./generic");

class CdeDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.CDE);
    }
    // CDEInfoArray: [{ CDECode: cde.CDECode, CDEVersion: cde.CDEVersion}...]
    async getCdeByCodeAndVersion(CDEInfoArray) {
        const matchedDocuments = await prisma.cDE.findMany({
            where: {
                OR: CDEInfoArray
            },
            orderBy: [
                { CDECode: SORT.ASC },
                { CDEVersion: SORT.DESC }
            ]
        })
        const results = Object.values(
            matchedDocuments.reduce((acc, doc) => {
                if (!acc[doc.CDECode]) acc[doc.CDECode] = doc;
                return acc;
            }, {})
        );
        return results.map(cde => ({...cde, _id: cde.id}))
    }
}
module.exports = CdeDAO;