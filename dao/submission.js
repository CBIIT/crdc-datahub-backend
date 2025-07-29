const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {APPROVED_STUDIES_COLLECTION, ORGANIZATION_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {DELETED, CANCELED, NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, COMPLETED, ARCHIVED} = require("../constants/submission-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const ERROR = require("../constants/error-constants");
const ALL_FILTER = "All";
const NA = "NA"
class SubmissionDAO extends GenericDAO {
    constructor(submissionCollection, organizationCollection) {
        super(MODEL_NAME.SUBMISSION);
        this.submissionCollection = submissionCollection;
        this.organizationCollection = organizationCollection;
    }
    // prisma is unable to join study._id
    async programLevelSubmissions(studyIDs) {
        return await this.submissionCollection.aggregate([
            {$match: {
                    studyID: { $in: studyIDs }
            }},
            {$lookup: {
                    from: APPROVED_STUDIES_COLLECTION, // adjust if the actual collection name is different
                    localField: 'studyID',
                    foreignField: '_id',
                    as: 'studyInfo'
            }},
            {$unwind: '$studyInfo'},
            {$match: {
                    // This flag indicates the program level primary contact(data concierge)
                    'studyInfo.useProgramPC': true
            }},
            {$project: {
                    _id: 1
            }}]);
    }

    async listSubmissions(userInfo, userScope, params) {
        validateListSubmissionsParams(params);

        const filterConditions = [
            // default filter for listing submissions
            this._listConditions(userInfo, params.status, params.name, params.dbGaPID, params.dataCommons, params?.submitterName, userScope),
            // no filter for dataCommons aggregation
            this._listConditions(userInfo, ALL_FILTER, null, null, ALL_FILTER, ALL_FILTER, userScope),
            // note: Aggregation of Submitter name should not be filtered by a submitterName
            this._listConditions(userInfo, params?.status, params.name, params.dbGaPID, params.dataCommons, ALL_FILTER, userScope),
            // Organization filter condition before joining an approved-studies collection
            this._listConditions(userInfo, params?.status, params.name, params.dbGaPID, params.dataCommons, params?.submitterName, userScope),
            // note: Aggregation of status name should not be filtered by statuses
            this._listConditions(userInfo, ALL_FILTER, params.name, params.dbGaPID, params.dataCommons, params?.submitterName, userScope),
        ]

        const [listConditions, dataCommonsCondition, submitterNameCondition, organizationCondition, statusCondition] = filterConditions;
        const pipeline = [{"$match": listConditions}, {
            $addFields: {
                dataFileSize: {
                    $cond: {
                        if: { $in: ["$status", [DELETED, CANCELED]] },
                        then: { size: 0, formatted: NA },
                        else: "$dataFileSize"
                    }
                }
            }},
            {
                $lookup: {
                    from: ORGANIZATION_COLLECTION,
                    let: { studyId: "$studyID" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    "$and": [
                                        {"$in": ["$$studyId", "$studies._id"]},


                                    ]
                                },

                            }
                        },
                        { $sort: { name: -1 } },
                        { $limit: 1 },
                        {
                            $project: {
                                _id: 1,
                                name: 1,
                                abbreviation: 1
                            }
                        }
                    ],
                    as: "organization"
                }
            },
            {
                $unwind: {
                    path: "$organization",
                    preserveNullAndEmptyArrays: true
                }
            },
            {"$lookup": {
                    from: APPROVED_STUDIES_COLLECTION,
                    localField: "studyID",
                    foreignField: "_id",
                    as: "study"}
            },
            {
                $unwind: {
                    path: "$study",
                    preserveNullAndEmptyArrays: true
                }
            },
            // note: FE use the root level properties; studyName, studyAbbreviation
            {
                $addFields: {
                    studyName: "$study.studyName",
                    studyAbbreviation: "$study.studyAbbreviation"
                }
            },
            ...(params?.organization && params?.organization !== ALL_FILTER
                ? [{ $match: {
                        "organization._id": params?.organization
                    } }]
                : [])
        ];
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const noPaginationPipeline = pipeline.concat(paginationPipe.getNoLimitPipeline());
        const submissionStudyIDs = await this.submissionCollection.distinct("studyID", organizationCondition);
        const promises = [
            this.submissionCollection.aggregate(pipeline.concat(paginationPipe.getPaginationPipeline())),
            this.submissionCollection.aggregate(noPaginationPipeline.concat([{ $group: { _id: "$_id" } }, { $count: "count" }])),
            this.submissionCollection.distinct("dataCommons", dataCommonsCondition),
            // note: Submitter name filter is omitted
            this.submissionCollection.distinct("submitterName", submitterNameCondition),
            // note: Organization ID filter is omitted
            // note; programDAO findMany by studies.is is not working
            this.organizationCollection.aggregate([{
                $match: {
                    "studies._id": {$in: submissionStudyIDs}
                }
            }, {
                $project: {_id: 1, name: 1, abbreviation: 1}
            }]),
            // note: Status name filter is omitted
            this.submissionCollection.distinct("status", statusCondition)
        ];

        return await Promise.all(promises).then(function (results) {
            return {
                submissions: results[0] || [],
                total: results[1]?.length > 0 ? results[1][0]?.count : 0,
                dataCommons: results[2] || [],
                submitterNames: results[3] || [],
                organizations: results[4] || [],
                statuses: () => {
                    const statusOrder = [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, COMPLETED, CANCELED, DELETED];
                    return (results[5] || [])
                        .sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status));
                }
            }
        });

    }

    _listConditions(userInfo, status, submissionName, dbGaPID, dataCommonsParams, submitterName, userScope){
        const {_id, dataCommons, studies} = userInfo;
        const validSubmissionStatus = [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
            REJECTED, WITHDRAWN, DELETED];
        const statusCondition = status && !status?.includes(ALL_FILTER) ?
            { status: { $in: status || [] } } : { status: { $in: validSubmissionStatus } };

        const nameCondition = submissionName ? {name: { $regex: submissionName?.trim().replace(/\\/g, "\\\\"), $options: "i" }} : {};
        const dbGaPIDCondition = dbGaPID ? {dbGaPID: { $regex: dbGaPID?.trim().replace(/\\/g, "\\\\"), $options: "i" }} : {};
        const dataCommonsCondition = (dataCommonsParams && dataCommonsParams !== ALL_FILTER) ? {dataCommons: dataCommonsParams?.trim()} : {};
        const submitterNameCondition = (submitterName && submitterName !== ALL_FILTER) ? {submitterName: submitterName?.trim()} : {};

        const baseConditions = { ...statusCondition, ...nameCondition,
            ...dbGaPIDCondition, ...dataCommonsCondition, ...submitterNameCondition };

        if (userScope.isAllScope()) {
            return baseConditions;
        } else if (userScope.isStudyScope()) {
            const studyScope = userScope.getStudyScope();
            const studyQuery = isAllStudy(studyScope?.scopeValues) ? {} : {studyID: {$in: studyScope?.scopeValues}};
            return {...baseConditions, ...studyQuery};
        } else if (userScope.isDCScope()) {
            const DCScope = userScope.getDataCommonsScope();
            const aFilteredDataCommon = (dataCommonsParams && DCScope?.scopeValues?.includes(dataCommonsParams)) ? [dataCommonsParams] : []
            return {...baseConditions, dataCommons: {$in: dataCommonsParams !== ALL_FILTER ? aFilteredDataCommon : dataCommons}};
        } else if (userScope.isOwnScope()) {
            const userStudies = Array.isArray(studies) && studies.length > 0 ? studies : [];
            const studyIDs = userStudies?.map(s => s?._id).filter(Boolean);
            if (isAllStudy(userStudies)) {
                return baseConditions;
            }
            return {...baseConditions, "$or": [
                    {"submitterID": _id},
                    {"studyID": {$in: studyIDs || []}},
                    {"collaborators.collaboratorID": _id, "collaborators.permission": {$in: [COLLABORATOR_PERMISSIONS.CAN_EDIT]}}]};
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
    }

}

const isAllStudy = (userStudies) => {
    const studies = Array.isArray(userStudies) && userStudies.length > 0 ? userStudies : [];
    return studies.find(study =>
        (typeof study === 'object' && study._id === "All") ||
        (typeof study === 'string' && study === "All")
    );
}

function validateListSubmissionsParams (params) {
    const validStatus = new Set([NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, REJECTED, WITHDRAWN, CANCELED, DELETED, ALL_FILTER]);
    const invalidStatues = (params?.status || [])
        .filter((i) => !validStatus.has(i));
    if (invalidStatues?.length > 0) {
        throw new Error(replaceErrorString(ERROR.LIST_SUBMISSION_INVALID_STATUS_FILTER, `'${invalidStatues.join(",")}'`));
    }
}

module.exports = SubmissionDAO