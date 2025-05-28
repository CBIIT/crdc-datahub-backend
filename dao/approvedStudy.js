const prisma = require("../prisma");

async function getApprovedStudyByID(id) {
    const study = await prisma.approvedStudies.findUnique({where: {id: id}})
    //prisma doesn't allow using _id, so we have to map it
    return {...study, _id: study.id}
}

module.exports = getApprovedStudyByID