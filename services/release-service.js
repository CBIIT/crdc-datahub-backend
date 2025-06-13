const {verifySession} = require("../verifier/user-info-verifier");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {UserScope} = require("../domain/user-scope");
const {replaceErrorString} = require("../utility/string-util");
const ERROR = require("../constants/error-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {getDataCommonsDisplayNamesForReleasedNode} = require("../utility/data-commons-remapper");
const {APPROVED_STUDIES_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");

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

        const filterConditions = [
            // default filter for listing released studies
            this.#listStudyConditions(params.name, params.dbGaPID, params.dataCommons, userScope),
            // no filter for dataCommons aggregation
            this.#listStudyConditions(null, null, null, userScope),
        ];

        const [listConditions, dataCommonsCondition] = filterConditions;
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const combinedPipeline = [
            {$match: {nodeType: this.#STUDY_NODE, studyID: {$exists: true}}},
            {$group:{
                _id: "$studyID",
                dataCommons: { $first: "$dataCommons" }
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
            studies: (releaseStudies[0].studies || []).map((releasedStudy) => {
                return getDataCommonsDisplayNamesForReleasedNode(releasedStudy);
            }),
            total: releaseStudies[0]?.totalCount[0]?.count || 0,
            dataCommons: dataCommons?.sort() || []
        }
    }

    async listReleasedDataRecords(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this.#getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            console.warn("Failed permission verification for listing release metadata nodes, returning empty list");
            return {total: 0, properties: [], nodes: []};
        }

        const {studyID, nodeTypes, first, offset, orderBy, sortDirection, properties} = params;
        const [listConditions, nodeTypesCondition] = [
            // default filter for listing released studies
            this.#listNodesConditions(nodeTypes, userScope),
            // no filter for node types aggregation
            this.#listNodesConditions(null, userScope),
        ];
        const paginationPipe = new MongoPagination(first, offset, orderBy, sortDirection);

        const [rootKeys, parentKeys] = [[], []];
        (params?.properties || []).forEach(field => {
            if (field.includes('.')) {
                parentKeys.push(field);
            } else {
                rootKeys.push(field);
            }
        });

        const rootKeyConditions = (rootKeys || []).map(field => ({
            [`props.${field}`]: { $exists: true }
        }));

        const parentKeyConditions = (parentKeys || []).map(field => {
            const [parentType, parentIDPropName] = field.split(".");
            return { parentType, parentIDPropName };
        });

        const propertiesConditions = [...rootKeyConditions, ...parentKeyConditions];

        const commonQuery = [
            {
                $match: {
                    studyID,
                    ...listConditions,
                    ...(propertiesConditions.length > 0 ? { $and: propertiesConditions } : {})
                }
            }
        ];

        const combinedPipeline = [
            ...commonQuery,
            {$addFields: {
                parentPairs: {
                    $map: {
                        input: "$parents",
                        as: "p",
                        in: {
                            k: { $concat: ["$$p.parentType", ".", "$$p.parentIDPropName"] },
                            v: "$$p.parentIDValue"
                        }
                    }
                }
            }},
            {$unwind: {
                path: "$parentPairs"
            }},
            {$group: {
                _id: "$_id",
                props: { $first: "$props" },
                kv: {
                    $push: "$parentPairs"
                }
            }},
            {$project: {
                props: 1,
                merged: {
                    $arrayToObject: {
                        $map: {
                            input: {
                                $setUnion: {
                                    $map: {
                                        input: "$kv",
                                        as: "i",
                                        in: "$$i.k"
                                    }
                                }
                            },
                            as: "key",
                            in: {
                                k: "$$key",
                                v: {
                                    $reduce: {
                                        input: {
                                            $map: {
                                                input: {
                                                    $filter: {
                                                        input: "$kv",
                                                        as: "item",
                                                        cond: { $eq: ["$$item.k", "$$key"] }
                                                    }
                                                },
                                                as: "f",
                                                in: "$$f.v"
                                            }
                                        },
                                        initialValue: "",
                                        in: {
                                            $cond: [
                                                { $eq: ["$$value", ""] },
                                                "$$this",
                                                { $concat: ["$$value", "|", "$$this"] }
                                            ]
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }},
            { $replaceRoot: {
                newRoot: {
                    $mergeObjects: ["$props", "$merged"]
            }}},
            ...(properties?.length > 0
                ? [{
                    $project: Object.fromEntries(
                        (properties || []).map(field => [field, 1])
                    )
                }]
                : []),
            {$facet: {
                studies: paginationPipe.getPaginationPipeline(),
                totalCount: [{ $count: "count" }]
            }}
        ];

        const allPropertiesPipeline = [
            ...commonQuery,
            {$project: {
                propsKeys: {
                    $map: {
                        input: { $objectToArray: "$props" },
                        as: "kv",
                        in: "$$kv.k"
                }},
                parentKeys: {
                    $map: {
                        input: "$parents",
                        as: "p",
                        in: {
                            $concat: ["$$p.parentType", ".", "$$p.parentIDPropName"]
            }}}}},
            {$project:  {
                allKeys: { $concatArrays: ["$propsKeys", "$parentKeys"] }
            }},
            {$unwind: {
                path: "$allKeys"
            }},
            {$group: {
                _id: null,
                allProperties: { $addToSet: "$allKeys" }
            }},
        ];

        const nodeTypesPipeline = [
            ...commonQuery,
            {$group: {
                _id: "$nodeType",
                count: { $sum: 1 }
            }},
            {$project: {
                name: "$_id",
                count: 1,
                _id: 0
            }},
            {$sort: {
                count: 1
            }},
            {$facet: {
                nodes: [],
                total: [
                    {$group: {_id: null, total: { $sum: "$count" }}},
                    {$project: { _id: 0, total: 1 }}
                ]
            }},
            {$project: {
                nodes: "$nodes",
                total: { $arrayElemAt: ["$total.total", 0] }
            }},
            {$sort: { count: -1 }}
        ];

        const [releaseNodes, allProperties, groupByNodes] = await Promise.all([
            this.releaseCollection.aggregate(combinedPipeline),
            this.releaseCollection.aggregate(allPropertiesPipeline),
            this.releaseCollection.aggregate(nodeTypesPipeline)
        ]);

        return {
            total: releaseNodes[0]?.totalCount[0]?.count || 0,
            nodeTypes: {
                total: groupByNodes[0]?.total || 0,
                nodes: groupByNodes[0]?.nodes || []
            },
            properties: allProperties[0]?.allProperties || [],
            nodes: releaseNodes?.[0].studies || []
        }
    }

    #listNodesConditions(nodesParams, userScope){
        const baseConditions = nodesParams && !nodesParams?.includes(this.#ALL_FILTER) ?
            { nodeType: { $in: nodesParams || [] } } : {};
        if (userScope.isAllScope()) {
            return baseConditions;
        } else if (userScope.isStudyScope()) {
            const studyScope = userScope.getStudyScope();
            const isAllStudy = studyScope?.scopeValues?.includes(this.#ALL_FILTER);
            const studyQuery = isAllStudy ? {} : {studyID: {$in: studyScope?.scopeValues}};
            return {...baseConditions, ...studyQuery};
        } else if (userScope.isDCScope()) {
            const DCScopes = userScope.getDataCommonsScope();
            const dataCommonsCondition = { dataCommons: { $in: DCScopes.scopeValues } };
            return {...baseConditions, ...dataCommonsCondition};
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
    }


    #listStudyConditions(studyName, dbGaPID, dataCommonsParams, userScope){
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