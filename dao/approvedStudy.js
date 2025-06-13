const prisma = require("../prisma");

class ApprovedStudyDAO {
    async getApprovedStudyByID(id) {
        const study = await prisma.approvedStudy.findUnique({where: {id: id}})
        //prisma doesn't allow using _id, so we have to map it
        if (!study) {
            return null
        }
        return {...study, _id: study.id}
    }
    async getApprovedStudyByName(studyNme) {
        const study = await prisma.approvedStudy.findFirst({where: {studyName: studyNme}})
        //prisma doesn't allow using _id, so we have to map it
        if (!study) {
            return null
        }
        return {...study, _id: study.id}
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