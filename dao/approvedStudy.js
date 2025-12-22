const prisma = require("../prisma");
const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
const {ORGANIZATION_COLLECTION, USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const ERROR = require("../constants/error-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {DIRECTION, SORT} = require("../crdc-datahub-database-drivers/constants/monogodb-constants");
const {sanitizeMongoDBInput} = require("../utility/string-util");

const CONTROLLED_ACCESS_ALL = "All";
const CONTROLLED_ACCESS_OPEN = "Open";
const CONTROLLED_ACCESS_CONTROLLED = "Controlled";
const CONTROLLED_ACCESS_OPTIONS = [CONTROLLED_ACCESS_ALL, CONTROLLED_ACCESS_OPEN, CONTROLLED_ACCESS_CONTROLLED];

class ApprovedStudyDAO extends GenericDAO  {
    _ALL = "All";
    constructor(approvedStudiesCollection = null) {
        super(MODEL_NAME.APPROVED_STUDY);
        this.approvedStudiesCollection = approvedStudiesCollection;
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

    async listApprovedStudies(studyName, controlledAccess, dbGaPIDInput, programID, first, offset, orderBy, sortDirection) {
        // set matches
        let matches = {};
        const study = sanitizeMongoDBInput(studyName);
        if (study)
            matches.$or = [{studyName: {$regex: study, $options: 'i'}}, {studyAbbreviation: {$regex: study, $options: 'i'}}];
        if (controlledAccess) {
            if (!CONTROLLED_ACCESS_OPTIONS.includes(controlledAccess)) {
                throw new Error(ERROR.INVALID_CONTROLLED_ACCESS);
            }
            if (controlledAccess !== CONTROLLED_ACCESS_ALL)
            {
                if (controlledAccess === CONTROLLED_ACCESS_CONTROLLED)
                {
                    matches.controlledAccess = true;
                }
                else
                {
                    matches.openAccess = true;
                }
            }
        }
        const dbGaPID = sanitizeMongoDBInput(dbGaPIDInput);
        if (dbGaPID) {
            matches.dbGaPID = {$regex: dbGaPID, $options: 'i'};
        }

        if (programID && programID !== this._ALL) {
            matches["programID"] = programID;
        }

        let pipelines = [
            // Join with the program using the programID as the foreign field
            {"$lookup": {
                    from: ORGANIZATION_COLLECTION,
                    localField: "programID",
                    foreignField: "_id",
                    as: "program"}},
            {"$lookup": {
                    from: USER_COLLECTION,
                    localField: "primaryContactID",
                    foreignField: "_id",
                    as: "primaryContact"}},
            {"$addFields": {
                    program: { $arrayElemAt: ["$program", 0] },
                    primaryContact: { $arrayElemAt: ["$primaryContact", 0] }
                }},
            {"$addFields": {
                    primaryContact: {
                        _id: {
                            $cond: [
                                "$useProgramPC",
                                "$program.conciergeID",
                                "$primaryContact._id"
                            ]
                        },
                        firstName: {
                            $cond: [
                                "$useProgramPC",
                                {
                                    $ifNull: [
                                        { $arrayElemAt: [
                                                { $split: ["$program.conciergeName", " "] },
                                                0 // first element → firstName
                                            ] },
                                        ""
                                    ]
                                },
                                "$primaryContact.firstName"
                            ]
                        },
                        lastName: {
                            $cond: [
                                "$useProgramPC",
                                {
                                    $ifNull: [
                                        { $arrayElemAt: [
                                                { $split: ["$program.conciergeName", " "] },
                                                1 // second element → lastName
                                            ] },
                                        ""
                                    ]
                                },
                                "$primaryContact.lastName"
                            ]
                        }
                    }
                }}
        ];

        pipelines.push({$match: matches});
        let sortField = orderBy;
        if (sortField === "program.name") {
            pipelines.push({
                $set: {
                    programSort: {
                        $toLower: "$program.name"
                    }
                }
            });
            sortField = "programSort";
        }
        const pagination = new MongoPagination(first, offset, sortField, sortDirection);
        const paginationPipe = pagination.getPaginationPipeline()
        // Added the custom sort
        const isNotStudyName = orderBy !== "studyName";
        const customPaginationPipeline = paginationPipe?.map(pagination =>
            Object.keys(pagination)?.includes("$sort") && isNotStudyName ? {...pagination, $sort: {...pagination.$sort, studyName: DIRECTION.ASC}} : pagination
        );

        pipelines.push({
            $facet: {
                total: [{
                    $count: "total"
                }],
                results: customPaginationPipeline
            }
        });
        pipelines.push({
            $set: {
                total: {
                    $first: "$total.total",
                }
            }
        });

        return await this.approvedStudiesCollection.aggregate(pipelines);
    }

}

module.exports = ApprovedStudyDAO