const prisma = require("../prisma");
const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');

class ApprovedStudyDAO extends GenericDAO  {
    constructor() {
        super(MODEL_NAME.APPROVED_STUDY);
    }

    async getApprovedStudyByID(studyID) {

        return await this.findById(studyID)
    }

    async getApprovedStudiesInStudies(studyIDs) {
        const studies = await prisma.approvedStudy.findMany({
            where: {
                id: {
                    in: studyIDs || []
                }
            },
        });
        //prisma doesn't allow using _id, so we have to map it
        return studies.map(study => ({...study, _id: study.id}))
    }
}

module.exports = ApprovedStudyDAO