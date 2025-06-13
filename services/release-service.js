const {verifySession} = require("../verifier/user-info-verifier");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {UserScope} = require("../domain/user-scope");
const {replaceErrorString} = require("../utility/string-util");
const ERROR = require("../constants/error-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {getDataCommonsDisplayNamesForReleasedNode, getDataCommonsDisplayName, getDataCommonsOrigin} = require("../utility/data-commons-remapper");
const {APPROVED_STUDIES_COLLECTION, DATA_COMMONS_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {SORT, DIRECTION} = require("../crdc-datahub-database-drivers/constants/monogodb-constants");

class ReleaseService {
    #ALL_FILTER = "All";
    #STUDY_NODE = "study";
    constructor(releaseCollection, authorizationService) {
        this.releaseCollection = releaseCollection;
        this.authorizationService = authorizationService;
    }

    async listReleasedStudies(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this.#getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            console.warn("Failed permission verification for listing release studies, returning empty list");
            return {total: 0, studies: []};
        }

        const originalDataCommons = (params.dataCommonsDisplayNames || []).map(value => {
            const original = getDataCommonsOrigin(value);
            return original ? original : value;
        });

        const filterConditions = [
            // default filter for listing released studies
            this.#listConditions(params.name, params.dbGaPID, originalDataCommons, userScope),
            // no filter for dataCommons aggregation
            this.#listConditions(null, null, null, userScope),
        ];

        const [listConditions, dataCommonsCondition] = filterConditions;
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const combinedPipeline = [
            {$match: {nodeType: this.#STUDY_NODE, studyID: {$exists: true}}},
            {$group:{
                _id: "$studyID",
                dataCommons: { $addToSet: "$dataCommons" }
            }},
            {$unwind: { path: "$dataCommons" }},

            {$lookup: {
                from: DATA_COMMONS_COLLECTION,
                let: { dc: "$dataCommons" },
                pipeline: [
                    { $match: { $expr: { $eq: ["$dataCommons", "$$dc"] } } },
                    { $project: { _id: 0, dataCommonsDisplayName: 1 } }
                ],
                as: "matched"}
            },
            {$addFields: {
                mappedDisplayName: {
                    $cond: [
                        { $gt: [{ $size: "$matched" }, 0] },
                        { $arrayElemAt: ["$matched.dataCommonsDisplayName", 0] },
                        "$dataCommons"
                    ]
            }}},
            // Always set the mappedDisplayName asc. This array needs to be sorted on FE.
            {$sort: { mappedDisplayName: 1 }},
            {$group: {
                    _id: "$_id",
                    dataCommons: { $push: "$dataCommons" },
                    dataCommonsDisplayNames: { $push: "$mappedDisplayName" },
                    doc: { $first: "$$ROOT" }
            }},
            {$lookup: {
                from: APPROVED_STUDIES_COLLECTION,
                localField: "_id",
                foreignField: "_id",
                as: "approvedStudies"}},
            {$unwind: {
                path: "$approvedStudies"
            }},
            {$replaceRoot: {
                newRoot: {
                    $mergeObjects: [
                        "$$ROOT",
                        {dbGaPID : "$approvedStudies.dbGaPID", studyName: "$approvedStudies.studyName", studyAbbreviation: "$approvedStudies.studyAbbreviation"}
            ]}}},
            // Sort by the element of dataCommonsDisplayNames
            ...(params.orderBy === 'dataCommonsDisplayNames'
                ? [{
                    $sort: {
                        "dataCommonsDisplayNames.0": params.sortDirection?.toLowerCase() === SORT.DESC ? DIRECTION.DESC : DIRECTION.ASC  // ascending by first element
                    }
                }]
                : []),
            {"$match": listConditions},
            {$facet: {
                studies: paginationPipe.getPaginationPipeline(),
                totalCount: [{ $count: "count" }]
            }}
        ];

        const [releaseStudies, dataCommons] = await Promise.all([
            this.releaseCollection.aggregate(combinedPipeline),
            this.releaseCollection.distinct("dataCommons", {nodeType: this.#STUDY_NODE, studyID: {$exists: true}, ...dataCommonsCondition}),
        ]);

        return {
            studies: releaseStudies[0].studies,
            total: releaseStudies[0]?.totalCount[0]?.count || 0,
            dataCommonsDisplayNames: (dataCommons || [])
                .map(getDataCommonsDisplayName)
                .sort()
        }
    }

    #listConditions(studyName, dbGaPID, dataCommonsParams, userScope){
        const dataCommonsCondition = dataCommonsParams && !dataCommonsParams?.includes(this.#ALL_FILTER) ?
            { dataCommons: { $in: dataCommonsParams || [] } } : {};

        const nameCondition = studyName
            ? {
                $or: [
                    { studyName: { $regex: studyName.trim().replace(/\\/g, "\\\\"), $options: "i" } },
                    { studyAbbreviation: { $regex: studyName.trim().replace(/\\/g, "\\\\"), $options: "i" } },
                ],
            }
            : {};

        const dbGaPIDCondition = dbGaPID ? {dbGaPID: { $regex: dbGaPID?.trim().replace(/\\/g, "\\\\"), $options: "i" }} : {};

        const baseConditions = {...nameCondition,
            ...dbGaPIDCondition, ...dataCommonsCondition };

        if (userScope.isAllScope()) {
            return baseConditions;
        } else if (userScope.isStudyScope()) {
            const studyScope = userScope.getStudyScope();
            const isAllStudy = studyScope?.scopeValues?.includes(this.#ALL_FILTER);
            const studyQuery = isAllStudy ? {} : {studyID: {$in: studyScope?.scopeValues}};
            return {...baseConditions, ...studyQuery};
         } else if (userScope.isDCScope()) {
            const DCScopes = userScope.getDataCommonsScope();
            const filtered = dataCommonsParams?.filter((scope) => DCScopes.scopeValues.includes(scope));
            const dataCommonsCondition = dataCommonsParams && !dataCommonsParams?.includes(this.#ALL_FILTER) ?
                { dataCommons: { $in: filtered || [] } } : { dataCommons: { $in: DCScopes.scopeValues } };
            return {...baseConditions, ...dataCommonsCondition};
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
    }

    async #getUserScope(userInfo, aPermission) {
        const validScopes = await this.authorizationService.getPermissionScope(userInfo, aPermission);
        const userScope = UserScope.create(validScopes);

        const isStudyScope = userScope.isStudyScope();
        const isDCScope = userScope.isDCScope();
        const isValidUserScope = userScope.isNoneScope() || userScope.isAllScope() ||
            isStudyScope || isDCScope;
        if (!isValidUserScope) {
            throw new Error(replaceErrorString(ERROR.INVALID_USER_SCOPE));
        }
        return userScope;
    }
}

module.exports = {
    Release: ReleaseService
};