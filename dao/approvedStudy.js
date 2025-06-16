const prisma = require("../prisma");
const GenericDAO = require("./generic");

class ApprovedStudyDAO extends GenericDAO  {
    constructor() {
        super("approvedStudy");
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