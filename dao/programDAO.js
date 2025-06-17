const prisma = require("../prisma");
const AbstractDAO = require("./abstractDAO");
const { PROGRAM_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
class ProgramDAO extends AbstractDAO {
    constructor() {
        super(PROGRAM_COLLECTION);
    }

    async findManyByType() {
        const programs = await prisma.program.findMany({
            where: {
                id: "cd3c06c9-3156-4dee-aac9-ce8cc20216ec", // example: only active programs
            },
            include: {
                studies: true
            },
        });
// Step 2. 모든 Program.studies 안의 _id 수집
        const allStudyIds = programs.flatMap(p =>
            p.studies
                .map(s => s.id)
                .filter(Boolean)

        );


// Step 3. ApprovedStudy에서 일치하는 것만 한꺼번에 가져오기
        const studies = await prisma.approvedStudy.findMany({
            where: {
                id: { in: allStudyIds },
            },
        });

// Step 4. id → ApprovedStudy 매핑
        const studyMap = new Map(studies.map(s => [s.id, s]));

// Step 5. 각 Program에 approvedStudies 필드를 수동으로 추가
        const enrichedPrograms = programs.map(program => ({
            ...program,
            approvedStudies: program.studies
                .map(s => studyMap.get(s.id))
                .filter(Boolean)
        }));

// Step 6. 개수 계산
        const total = await prisma.program.count({
            // where: statusCondition,
        });

        return {
            results: enrichedPrograms,
            total,
        };
    }

}
module.exports = ProgramDAO
