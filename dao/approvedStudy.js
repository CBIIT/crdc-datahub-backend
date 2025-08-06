const prisma = require("../prisma");
const GenericDAO = require("./generic");
const {MODEL_NAME} = require("../constants/db-constants");
const {ORGANIZATION_COLLECTION, USER_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const ERROR = require("../constants/error-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {DIRECTION, SORT} = require("../crdc-datahub-database-drivers/constants/monogodb-constants");

const CONTROLLED_ACCESS_ALL = "All";
const CONTROLLED_ACCESS_OPEN = "Open";
const CONTROLLED_ACCESS_CONTROLLED = "Controlled";
const CONTROLLED_ACCESS_OPTIONS = [CONTROLLED_ACCESS_ALL, CONTROLLED_ACCESS_OPEN, CONTROLLED_ACCESS_CONTROLLED];

class ApprovedStudyDAO extends GenericDAO  {
    _ALL = "All";
    constructor(approvedStudiesCollection) {
        super(MODEL_NAME.APPROVED_STUDY);
        this.approvedStudiesCollection = approvedStudiesCollection;
    }

    async getApprovedStudyByID(studyID) {
        return await this.findById(studyID)
    }
    // note: the generic method needs to be improved; below query does not work in the generic DAO.
    // {studyName: {
    //                 equals: studyName?.trim(),
    //                 // case-insensitive match
    //                 mode: 'insensitive'
    // }
    async findManyStudy(filter, option = {}) {
        const result = await prisma.approvedStudy.findMany({ where: filter });
        return result.map(item => ({ ...item, _id: item.id }));
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

    async listApprovedStudies(study, controlledAccess, dbGaPID, programID, first, offset, orderBy, sortDirection) {
        // set matches
        let matches = {};
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

        if (dbGaPID) {
            matches.dbGaPID = {$regex: dbGaPID, $options: 'i'};
        }

        if (programID && programID !== this._ALL) {
            matches["programs._id"] = programID;
        }

        let pipelines = [
            // Join with the program
            // The studies._id should be array in otder to use prisma.
            {"$lookup": {
                    from: ORGANIZATION_COLLECTION,
                    localField: "_id",
                    foreignField: "studies._id",
                    as: "programs"}},
            {"$lookup": {
                    from: USER_COLLECTION,
                    localField: "primaryContactID",
                    foreignField: "_id",
                    as: "primaryContact"}},
            {"$replaceRoot": {
                    newRoot: {
                        $mergeObjects: [
                            "$$ROOT",
                            {
                                primaryContact: {
                                    _id: {
                                        $cond: [
                                            "$useProgramPC",
                                            { $arrayElemAt: ["$programs.conciergeID", 0] },
                                            { $arrayElemAt: ["$primaryContact._id", 0] }
                                        ]
                                    },
                                    firstName: {
                                        $cond: [
                                            "$useProgramPC",
                                            {
                                                $ifNull: [
                                                    { $arrayElemAt: [
                                                            { $split: [
                                                                    { $arrayElemAt: ["$programs.conciergeName", 0] },
                                                                    " "
                                                                ] },
                                                            0 // first element → firstName
                                                        ] },
                                                    ""
                                                ]
                                            },
                                            { $arrayElemAt: ["$primaryContact.firstName", 0] }
                                        ]
                                    },
                                    lastName: {
                                        $cond: [
                                            "$useProgramPC",
                                            {
                                                $ifNull: [
                                                    { $arrayElemAt: [
                                                            { $split: [
                                                                    { $arrayElemAt: ["$programs.conciergeName", 0] },
                                                                    " "
                                                                ] },
                                                            1 // second element → lastName
                                                        ] },
                                                    ""
                                                ]
                                            },
                                            { $arrayElemAt: ["$primaryContact.lastName", 0] }
                                        ]
                                    }
                                }
                            }
                        ]
                    }
                }}
        ];

        pipelines.push({$match: matches});
        const pagination = new MongoPagination(first, offset, orderBy, sortDirection);
        const paginationPipe = pagination.getPaginationPipeline()
        // Added the custom sort
        const isNotStudyName = orderBy !== "studyName";
        const customPaginationPipeline = paginationPipe?.map(pagination =>
            Object.keys(pagination)?.includes("$sort") && isNotStudyName ? {...pagination, $sort: {...pagination.$sort, studyName: DIRECTION.ASC}} : pagination
        );

        const programSort = "programs.name";
        const isProgramSort = orderBy === programSort;
        const programPipeLine = paginationPipe?.map(pagination =>
            Object.keys(pagination)?.includes("$sort") && pagination.$sort === programSort ? {...pagination, $sort: {...pagination.$sort, [programSort]: sortDirection?.toLowerCase() === SORT.DESC ? DIRECTION.DESC : DIRECTION.ASC}} : pagination
        );

        // Always sort programs array inside each document by name DESC
        pipelines.push({
            $addFields: {
                programs: {
                    $cond: [
                        { $isArray: "$programs" },
                        { $sortArray: {
                                input: "$programs",
                                sortBy: { name: DIRECTION.DESC }
                            }},
                        []
                    ]
                }
            }
        });
        // This is the program’s custom sort order; the program name in the first element should be sorted.
        if (isProgramSort) {
            pipelines.push(
                { $unwind: { path: "$programs", preserveNullAndEmptyArrays: true } },
                { $sort: { "programs.name": sortDirection === SORT.DESC ? DIRECTION.DESC : DIRECTION.ASC } },
                { $group: {
                        _id: "$_id",
                        doc: { $first: "$$ROOT" },
                        programs: { $push: "$programs" }
                    }},
                { $replaceRoot: {
                        newRoot: { $mergeObjects: ["$doc", { programs: "$programs" }] }
                    }}
            );
        }

        pipelines.push({
            $facet: {
                total: [{
                    $count: "total"
                }],
                results: isProgramSort ? programPipeLine : customPaginationPipeline
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