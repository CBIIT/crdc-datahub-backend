const prisma = require("../prisma");

async function getApprovedStudyByID(id) {
    const study = await prisma.approvedStudy.findUnique({where: {id: id}})
    //prisma doesn't allow using _id, so we have to map it
    if (!study) {
        return null
    }
    return {...study, _id: study.id}
}

module.exports = getApprovedStudyByID