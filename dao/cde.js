const prisma = require("../prisma");
const { SORT } = require('../constants/db-constants');
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');

class CdeDAO extends GenericDAO {
    constructor() {
        super(MODEL_NAME.CDE);
    }
    async getCdeByCodeAndVersion(query) {
        const matchedDocuments = await this.findMany({
            where: {
                OR: query
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
