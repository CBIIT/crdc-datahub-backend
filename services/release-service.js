const {verifySession} = require("../verifier/user-info-verifier");
const USER_PERMISSION_CONSTANTS = require("../crdc-datahub-database-drivers/constants/user-permission-constants");
const {UserScope} = require("../domain/user-scope");
const {replaceErrorString} = require("../utility/string-util");
const ERROR = require("../constants/error-constants");
const {MongoPagination} = require("../crdc-datahub-database-drivers/domain/mongo-pagination");
const {getDataCommonsDisplayName, getDataCommonsOrigin} = require("../utility/data-commons-remapper");
const {APPROVED_STUDIES_COLLECTION, DATA_COMMONS_COLLECTION} = require("../crdc-datahub-database-drivers/database-constants");
const {SORT, DIRECTION} = require("../crdc-datahub-database-drivers/constants/monogodb-constants");
const {getSortDirection} = require("../crdc-datahub-database-drivers/utility/mongodb-utility");
const PROP_GROUPS = {
    MODEL_DEFINED: "model_defined",
    NOT_DEFINED: "not_defined",
    INTERNAL: "internal"
};
class ReleaseService {
    _ALL_FILTER = "All";
    _STUDY_NODE = "study";
    constructor(releaseCollection, authorizationService, dataModelService) {
        this.releaseCollection = releaseCollection;
        this.authorizationService = authorizationService;
        this.dataModelService = dataModelService;
    }

    async listReleasedStudies(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
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
            this._listStudyConditions(params.name, params.dbGaPID, originalDataCommons, userScope),
            // no filter for dataCommons aggregation
            this._listStudyConditions(null, null, null, userScope),
        ];

        const [listConditions, dataCommonsCondition] = filterConditions;
        const paginationPipe = new MongoPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        const combinedPipeline = [
            {$match: {nodeType: this._STUDY_NODE, studyID: {$exists: true}}},
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
            this.releaseCollection.distinct("dataCommons", {nodeType: this._STUDY_NODE, studyID: {$exists: true}, ...dataCommonsCondition}),
        ]);

        return {
            studies: releaseStudies[0].studies,
            total: releaseStudies[0]?.totalCount[0]?.count || 0,
            dataCommonsDisplayNames: (dataCommons || [])
                .map(getDataCommonsDisplayName)
                .sort()
        }
    }
    /**
     * API: Retrieves the total count and list of node types from the release collection for a given study.
     * @param {*} params
     * @param {*} context
     * @returns {Promise<{ total: number, nodes: Array<{ name: string, count: number }> }>}
     */
    async getReleaseNodeTypes(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            console.warn("Failed permission verification for get list node types, returning empty list");
            return {total: 0, properties: [], nodes: []};
        }
        const originDataCommons = getDataCommonsOrigin(params?.dataCommonsDisplayName) || params?.dataCommonsDisplayName;
        const userConditions = this._listNodesConditions(null, originDataCommons, userScope);
        const nodeTypesPipeline = [
            {$match: {studyID: params?.studyID, ...userConditions}},
            {$addFields: {
                IDPropName: {
                    $arrayElemAt: [
                        {
                            $map: {
                                input: {
                                    $filter: {
                                        input: { $objectToArray: "$props" },
                                        as: "kv",
                                        cond: { $eq: ["$$kv.v", "$nodeID"] }
                                    }
                                },
                                as: "matched",
                                in: "$$matched.k"
                            }
                        },
                        0
                    ]
                }
            }},
            {$group: {
                    _id: "$nodeType",
                    count: { $sum: 1 },
                    IDPropName: { $first: "$IDPropName" }
                }},
            {$project: {
                    name: "$_id",
                    count: 1,
                    _id: 0,
                    IDPropName: 1
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
            }}
        ];

        const groupByNodes = await this.releaseCollection.aggregate(nodeTypesPipeline)
        return {
            total: groupByNodes[0]?.total || 0,
            nodes: groupByNodes[0]?.nodes || []
        }
    }
    /**
     * API: List all released records from the release collection for a given study.
     * @param {*} params
     * @param {*} context
     * @returns {Promise<JSON>}
     */
    async listReleasedDataRecords(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            console.warn("Failed permission verification for listing release metadata nodes, returning empty list");
            return {total: 0, properties: [], nodes: []};
        }

        const {studyID, nodeType, first, offset, orderBy, sortDirection, properties, dataCommonsDisplayName} = params;
        const originDataCommons = getDataCommonsOrigin(dataCommonsDisplayName) || dataCommonsDisplayName;
        const listConditions = this._listNodesConditions(nodeType, originDataCommons, userScope);
        const paginationPipe = new MongoPagination(first, offset, orderBy, sortDirection);
        //
        const [rootKeys, parentKeys] = [[], []];
        (params?.properties || []).forEach(field => {
            if (field.includes('.')) {
                parentKeys.push(field);
            } else {
                rootKeys.push(field);
            }
        });
        // The listing property is located under the props.
        const rootKeyConditions = (rootKeys || []).map(field => ({
            [`props.${field}`]: { $exists: true }
        }));
        // The parent property is located under the parents.
        const parentKeyConditions = (parentKeys || []).map(field => {
            const [parentType, parentIDPropName] = field.split(".");
            return { [`parents.parentType`]: parentType, [`parents.parentIDPropName`]: parentIDPropName };
        });

        const propertiesConditions = [...rootKeyConditions, ...parentKeyConditions];
        const commonQuery = [
            {$match: {
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
                    path: "$parentPairs",
                    preserveNullAndEmptyArrays: true
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
                    }
                }},
            ...(properties?.length > 0
                ? [
                    {
                        $project: {
                            _tmp: {
                                $arrayToObject: [this._buildKvPairsDotSafe(properties)]
                            }
                        },
                    },
                    {
                        $replaceRoot: {
                            newRoot: "$_tmp"
                        }
                    },
                    ...(orderBy ?
                    [{
                        $sort: {
                            [this._dotToSafe(orderBy)]: getSortDirection(sortDirection),
                        },
                    }] : []),
                    {$project: {
                            _tmp2: {
                                $arrayToObject: [this._buildKvPairsRestore(properties)]
                            }
                        }
                    },
                    {$replaceRoot: {
                            newRoot: "$_tmp2"
                        }
                    },
                ]
                : []),
            ...(orderBy?.includes(".") ?
                [{
                    $addFields: {
                        _sortKey: {
                            $getField: {
                                field: orderBy,
                                input: "$$ROOT",
                            },
                        },
                    },
                },
                    {
                        $sort: {
                            _sortKey: getSortDirection(sortDirection),
                        },

                    },
                    {
                        $unset: "_sortKey",  // 👈 This removes the temporary sort key
                    }] : [] ) ,
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
                        }
                    },
                    parentKeys: {
                        $map: {
                            input: "$parents",
                            as: "p",
                            in: {
                                $concat: ["$$p.parentType", ".", "$$p.parentIDPropName"]
                            }
                        }
                    }
                }
            },
            {$project:  {
                    allKeys: { $concatArrays: ["$propsKeys", "$parentKeys"] }
                }
            },
            {$unwind: {
                    path: "$allKeys"
                }
            },
            {$group: {
                    _id: null,
                    allProperties: { $addToSet: "$allKeys" }
                }
            }
        ];

        const [releaseNodes, allProperties] = await Promise.all([
            this.releaseCollection.aggregate(combinedPipeline),
            this.releaseCollection.aggregate(allPropertiesPipeline),
        ]);

        return {
            total: releaseNodes[0]?.totalCount[0]?.count || 0,
            properties: allProperties[0]?.allProperties || [],
            nodes: releaseNodes?.[0].studies || []
        }
    }
    /**
     * API: Retrieves the properties for a specific node type in a study.
     * @param {*} params
     * @param {*} context
     * @returns {Promise<JSON>}
     */
    async getPropsForNodeType(params, context) {
        verifySession(context)
            .verifyInitialized();
        const userScope = await this._getUserScope(context?.userInfo, USER_PERMISSION_CONSTANTS.DATA_SUBMISSION.VIEW);
        if (userScope.isNoneScope()) {
            console.warn("Failed permission verification for get properties by type");
            return [];
        }
        const {
            studyID, 
            dataCommonsDisplayName, 
            nodeType
        } = params
        const originDataCommons = getDataCommonsOrigin(dataCommonsDisplayName) || dataCommonsDisplayName;

        return await this._getPropsByStudyDataCommonNodeType(studyID, originDataCommons, nodeType);
    }
    /**
     * _getPropsByStudyDataCommonNodeType
     * @param {*} studyID 
     * @param {*} originDataCommons 
     * @param {*} nodeType 
     * @returns 
     */
    async _getPropsByStudyDataCommonNodeType(studyID, dataCommons, nodeType) {
        let properties = [];
        // 1) get defined properties
        const modelProps = await this.dataModelService.
            getDefinedPropsByDataCommonAndType(dataCommons, null, nodeType);
        if (!modelProps || modelProps.length === 0) {
            // Return [] instead of null to match test expectation for empty model properties
            return null;
        }
        const modelPropNames = modelProps.map(prop => {
            const required = prop?.is_required  && ["yes", "true"].includes(String(prop.is_required).toLowerCase()) ? true : false;
            return {"name": prop.handle, "required": required, "group": PROP_GROUPS.MODEL_DEFINED}
        });

        properties.push(...modelPropNames)

        // 2) find properties names from release collection based on parameters
        const [nodeProps, generatedProps] = await this._getUPropNamesByStudyDataCommonNodeType(studyID, dataCommons, nodeType);
        if (!nodeProps || nodeProps.length === 0) {
            return null;
        }
        // 4) find node properties that are not defined in the model
        const dataModelNotDefined= nodeProps.filter(prop => !modelPropNames.map(mp => mp.name).includes(prop));
        const otherPropsGroup = dataModelNotDefined.filter(prop => prop.toLowerCase() !== "crdc_id").map(prop => {
            return {
                "name": prop,
                "required": false,
                "group": PROP_GROUPS.NOT_DEFINED
            };
        });
        properties.push(...otherPropsGroup);
        // 5) get generated properties
        if(dataModelNotDefined.find(prop => prop.toLowerCase() === "crdc_id")){
            properties.push({
                "name": "crdc_id",
                "required": false,
                "group": PROP_GROUPS.INTERNAL
            });
        }

        if (generatedProps.length > 0) {
            const generatedPropArray = generatedProps.map(p => ({
                "name": p,
                "required": false,
                "group":PROP_GROUPS.INTERNAL
            }));
            properties.push(...generatedPropArray);
        }
        return properties && properties.length > 0 ? properties : null;
    }
    /**
     * _getUPropNamesByStudyDataCommonNodeType
     * @param {*} studyID 
     * @param {*} dataCommonsParam 
     * @param {*} nodeType 
     * @returns 
     */
    async _getUPropNamesByStudyDataCommonNodeType(studyID, dataCommonsParam, nodeType) {
        const uniquePropObj= {};
        const uniqueGeneratedPropsObj= {};
        // create mongodb query return unique props.keys in the release collection
        const pipeline = [
            {
                $match: {
                    studyID: studyID,
                    dataCommons: dataCommonsParam,
                    nodeType: nodeType
                }
            },
            {
                // only return props as a object
                $project: {
                    props:  "$props",
                    generatedProps: "$generatedProps"
                }
            }
        ];
        const result = await this.releaseCollection.aggregate(pipeline);
        // get unique props.keys
        result.forEach(doc => {
            Object.assign(uniquePropObj, doc.props || {});
            Object.assign(uniqueGeneratedPropsObj, doc.generatedProps || {});
        });
        // convert set to array
        const uniqueProps = Object.keys(uniquePropObj);
        const uniqueGeneratedProps = Object.keys(uniqueGeneratedPropsObj);
        return [uniqueProps, uniqueGeneratedProps];
    }

    _listNodesConditions(nodesParam, dataCommonsParam, userScope){
        const baseConditions = (nodesParam) ? { nodeType: { $in: [nodesParam] || [] } } : {};
        if (userScope.isAllScope()) {
            return {...baseConditions, dataCommons: dataCommonsParam};
        } else if (userScope.isStudyScope()) {
            const studyScope = userScope.getStudyScope();
            const isAllStudy = studyScope?.scopeValues?.includes(this._ALL_FILTER);
            const studyQuery = isAllStudy ? {} : {studyID: {$in: studyScope?.scopeValues}};
            return {...baseConditions, dataCommons: dataCommonsParam, ...studyQuery};
        } else if (userScope.isDCScope()) {
            const DCScopes = userScope.getDataCommonsScope();
            const aFilteredDataCommon = (dataCommonsParam && DCScopes?.scopeValues?.includes(dataCommonsParam)) ? [dataCommonsParam] : []
            const dataCommonsCondition = { dataCommons: { $in: aFilteredDataCommon } };
            return {...baseConditions, ...dataCommonsCondition};
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
    }


    _listStudyConditions(studyName, dbGaPID, dataCommonsParams, userScope){
        const dataCommonsCondition = dataCommonsParams && !dataCommonsParams?.includes(this._ALL_FILTER) ?
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
            const isAllStudy = studyScope?.scopeValues?.includes(this._ALL_FILTER);
            const studyQuery = isAllStudy ? {} : {studyID: {$in: studyScope?.scopeValues}};
            return {...baseConditions, ...studyQuery};
         } else if (userScope.isDCScope()) {
            const DCScopes = userScope.getDataCommonsScope();
            const filtered = dataCommonsParams?.filter((scope) => DCScopes.scopeValues.includes(scope));
            const dataCommonsCondition = dataCommonsParams && !dataCommonsParams?.includes(this._ALL_FILTER) ?
                { dataCommons: { $in: filtered || [] } } : { dataCommons: { $in: DCScopes.scopeValues } };
            return {...baseConditions, ...dataCommonsCondition};
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
    }

    async _getUserScope(userInfo, aPermission) {
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

    // Convert a field name to a DOT-safe version (e.g., "a.b" → "a_DOT_b")
    _dotToSafe(field) {
        return field.replace(/\./g, "_DOT_");
    }

    // Build key-value pairs for use with $getField, using DOT-safe keys
    _buildKvPairsDotSafe(properties) {
        return properties.map(field => ({
            k: this._dotToSafe(field),
            v: { $getField: { field, input: "$$ROOT" } }
        }));
    }

    // Build key-value pairs to restore original field names from DOT-safe ones
    _buildKvPairsRestore(properties) {
        return properties.map(field => ({
            k: field,
            v: "$" + this._dotToSafe(field)
        }));
    }


}

module.exports = {
    Release: ReleaseService
};