const prisma = require("../prisma");
const AbstractDAO = require("./abstractDAO");
const { PROGRAM_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {ORGANIZATION} = require("../crdc-datahub-database-drivers/constants/organization-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/prisma-utility");
class ProgramDAO extends AbstractDAO {
    _ALL = "All";
    constructor() {
        super(PROGRAM_COLLECTION);
    }

    async listPrograms(first, skip, orderBy, orderDirection, status) {
        const statusCondition = status && status !== this._ALL ?
            {status: status} : {status: {in: Object.values(ORGANIZATION.STATUSES)}};

        const [programs, total] = await Promise.all([
            prisma.program.findMany({
                where: statusCondition,
                skip,
                take: first,
                orderBy: {
                    [orderBy]: getSortDirection(orderDirection),
                },
                include: {
                    studies: true
                }
            }),
            prisma.program.count({
                where: statusCondition
            })]
        );

        return {
            programs: programs.map(program => ({
                ...program,
                _id: program?.id,
                studies: program?.studies?.map(study => ({
                    ...study,
                    _id: study.id
                })) || []
            })),
            total
        };
    }

}
module.exports = ProgramDAO
