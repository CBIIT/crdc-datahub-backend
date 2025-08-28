const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {PrismaPagination} = require("../crdc-datahub-database-drivers/domain/prisma-pagination");
const {SUBMISSION_ORDER_BY_MAP} = require("../constants/submission-constants");
const {DELETED, CANCELED, NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, COMPLETED, ARCHIVED,
    COLLABORATOR_PERMISSIONS
} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");
const {formatNestedOrganization, formatNestedOrganizations} = require("../utility/organization-transformer");
const prisma = require("../prisma");
const { isAllStudy } = require("../utility/study-utility");
const {subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const ALL_FILTER = "All";
const NA = "NA"
class SubmissionDAO extends GenericDAO {
    constructor(submissionCollection, organizationCollection) {
        super(MODEL_NAME.SUBMISSION);
        this.submissionCollection = submissionCollection;
        this.organizationCollection = organizationCollection;
    }

    async programLevelSubmissions(studyIDs) {
        try {
            // If no study IDs provided, return empty array
            if (!studyIDs || studyIDs.length === 0) {
                return [];
            }
            
            // Use Prisma to find submissions with study info
            const submissions = await prisma.submission.findMany({
                where: {
                    studyID: {
                        in: studyIDs
                    }
                },
                include: {
                    study: {
                        select: {
                            id: true,
                            useProgramPC: true
                        }
                    }
                }
            });
            
            // Filter submissions where study.useProgramPC is true
            const programLevelSubmissions = submissions.filter(submission => 
                submission.study?.useProgramPC === true
            );
            
            // Return only the IDs as expected by the original method
            return programLevelSubmissions.map(submission => ({ _id: submission.id }));
        } catch (error) {
            console.error('Error in programLevelSubmissions:', error);
            return [];
        }
    }

    /**
     * Lists submissions with pagination, filtering, and aggregation support.
     * This method implements a two-stage filtering approach:
     * 1. Base filtering by user scope and permissions (access control)
     * 2. Additional filtering by search parameters (name, status, organization, etc.)
     * 
     * The method ensures that aggregations (distinct values) are only filtered by user scope,
     * while the main submissions query includes both scope and search filters for accurate results.
     * 
     * @param {Object} userInfo - User information object containing user details
     * @param {string} userInfo._id - User's unique identifier
     * @param {Array<string>} userInfo.dataCommons - Array of data commons the user has access to
     * @param {Object} userScope - User scope object defining access permissions
     * @param {Object} params - Query parameters for filtering and pagination
     * @param {string} [params.organization] - Organization ID to filter by
     * @param {Array<string>} [params.status] - Array of submission statuses to filter by
     * @param {string} [params.name] - Submission name to search for (case-insensitive)
     * @param {string} [params.dbGaPID] - dbGaP ID to search for (case-insensitive)
     * @param {string} [params.dataCommons] - Data commons identifier to filter by
     * @param {string} [params.submitterName] - Submitter name to filter by
     * @param {string} [params.orderBy] - Field to order results by
     * @param {number} [params.first] - Number of results to return (pagination)
     * @param {number} [params.offset] - Number of results to skip (pagination)
     * @param {string} [params.sortDirection] - Sort direction ('asc' or 'desc')
     * @returns {Object} Object containing submissions, total count, and aggregation data
     * @returns {Array<Object>} returns.submissions - Array of submission objects
     * @returns {number} returns.total - Total count of submissions matching filters
     * @returns {Array<string>} returns.dataCommons - Distinct data commons values
     * @returns {Array<string>} returns.submitterNames - Distinct submitter names
     * @returns {Array<string>} returns.organizations - Distinct organization names
     * @returns {Function} returns.statuses - Function returning sorted distinct statuses
     * @throws {Error} When database query fails or validation errors occur
     */
    async listSubmissions(userInfo, userScope, params) {
        validateListSubmissionsParams(params);

        // Filter by user scope only
        const baseConditions = this._generateListSubmissionConditions(userInfo, userScope);
        // filter by user scope and search filters
        const filterConditions = this._addFiltersToBaseConditions(userInfo, { ...baseConditions }, params.organization, params.status, params.name, params.dbGaPID, params.dataCommons, params?.submitterName);
        // Map orderBy to proper Prisma field names
        const mappedOrderBy = params?.orderBy ? SUBMISSION_ORDER_BY_MAP[params.orderBy] || params.orderBy : undefined;
        // Create Prisma pagination with mapped orderBy
        const pagination = new PrismaPagination(params?.first, params.offset, mappedOrderBy, params.sortDirection);
        // Build the main query with includes
        const includeQuery = {
            study: {
                select: {
                    id: true,
                    studyName: true,
                    studyAbbreviation: true
                }
            },
            organization: {
                select: {
                    id: true,
                    name: true,
                    abbreviation: true
                }
            },
            submitter: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    fullName: true,
                    email: true
                }
            },
            concierge: {
                select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    fullName: true,
                    email: true
                }
            }
        };
        try {
            // Execute main query with pagination
            const submissions = await prisma.submission.findMany({
                where: filterConditions,
                include: includeQuery,
                ...pagination.getPagination()
            });

            // Get total count
            const total = await prisma.submission.count({
                where: filterConditions
            });

            // Get distinct values for aggregations
            const [dataCommons, submitterNames, organizations, statuses] = await Promise.all([
                this._getDistinctDataCommons(filterConditions),
                this._getDistinctSubmitterNames(filterConditions),
                this._getDistinctOrganizations(filterConditions),
                this._getDistinctStatuses(filterConditions)
            ]);

            // Transform submissions to match expected format
            const transformedSubmissions = submissions.map(submission => ({
                ...submission,
                _id: submission.id,
                studyName: submission?.study?.studyName,
                studyAbbreviation: submission?.study?.studyAbbreviation,
                dataFileSize: this._transformDataFileSize(submission.status, submission.dataFileSize),
                // Transform organization to match GraphQL schema (map id to _id)
                organization: formatNestedOrganization(submission.organization),
                submitterName: submission?.submitter?.fullName || "",
                conciergeName: submission?.concierge?.fullName || "",
                conciergeEmail: submission?.concierge?.email || "",
            }));

            return {
                submissions: transformedSubmissions,
                total: total,
                dataCommons: dataCommons,
                submitterNames: submitterNames,
                organizations: organizations,
                statuses: () => {
                    const statusOrder = [NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, COMPLETED, CANCELED, DELETED];
                    return statuses
                        .sort((a, b) => statusOrder.indexOf(a) - statusOrder.indexOf(b));
                }
            };
        } catch (error) {
            console.error('Error in listSubmissions:', error);
            throw new Error(`Failed to list submissions: ${error.message}`);
        }
    }

    /**
     * Generates base database query conditions based on user scope and permissions.
     * This method handles the core access control logic for submissions based on user scope.
     * 
     * @param {Object} userInfo - User information object containing user details
     * @param {string} userInfo._id - User's unique identifier
     * @param {Array<string>} userInfo.dataCommons - Array of data commons the user has access to
     * @param {Object} userScope - User scope object defining access permissions
     * @returns {Object} Base Prisma query conditions for filtering submissions by user scope
     * @throws {Error} When user scope is invalid or permission verification fails
     */
    _generateListSubmissionConditions(userInfo, userScope) {
        const baseConditions = {};
        if (userScope.isAllScope()) {
            // No filtering required for all scope
        } 
        else if (userScope.isStudyScope()) {
            const studyScope = userScope.getStudyScope();
            // If not assigned all studies then add assigned studies filters
            if (!isAllStudy(studyScope?.scopeValues)) {
                const studyIDs = studyScope?.scopeValues || [];
                // Only add studyID filter if there are actual study IDs to filter by
                if (studyIDs.length > 0) {
                    baseConditions.studyID = { in: studyIDs };
                }
            }
        } 
        else if (userScope.isDCScope()) {
            baseConditions.dataCommons = { in: userInfo?.dataCommons || [] };
        } 
        else if (userScope.isOwnScope()) {
            // For OWN scope, user must be assigned to the study AND (be submitter OR be collaborator)
            const userStudies = userInfo?.studies || [];
            
            if (!isAllStudy(userStudies)) {
                const userStudyIDs = userStudies.map(study => study._id);
                if (userStudyIDs && userStudyIDs.length > 0) {
                    baseConditions.studyID = { in: userStudyIDs };
                }
                else {
                    // No study scope means user cannot access any submissions with OWN scope
                    throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
                }
            }
            
            // User must be the submitter OR a collaborator with edit permission
            baseConditions.OR = [
                { submitterID: userInfo._id },
                {
                    collaborators: {
                        some: {
                            collaboratorID: userInfo._id,
                            permission: { in: [COLLABORATOR_PERMISSIONS.CAN_EDIT] }
                        }
                    }
                }
            ];
        } 
        else {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return baseConditions;
    }

    /**
     * Adds search and filter conditions to base user scope conditions.
     * This method applies various search filters (name, status, organization, etc.) to the base conditions
     * that were generated based on user scope. It handles parameter validation and sanitization.
     * 
     * @param {Object} userInfo - User information object containing user details
     * @param {Array<string>} userInfo.dataCommons - Array of data commons the user has access to
     * @param {Object} baseConditions - Base Prisma query conditions from user scope filtering
     * @param {string} organization - Organization ID to filter by (maps to programID field)
     * @param {Array<string>|null} status - Array of submission statuses to filter by, or null for no filter
     * @param {string} submissionName - Submission name to search for (case-insensitive regex)
     * @param {string} dbGaPID - dbGaP ID to search for (case-insensitive regex)
     * @param {string} dataCommonsFilter - Data commons identifier to filter by
     * @param {string} submitterName - Submitter name to filter by
     * @returns {Object} Combined Prisma query conditions including both user scope and search filters
     */
    _addFiltersToBaseConditions(userInfo, baseConditions, organization, status, submissionName, dbGaPID, dataCommonsFilter, submitterName) {
        const validSubmissionStatus = [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
            REJECTED, WITHDRAWN, DELETED];
        // Add organization filter if specified
        // Note: organization parameter expects organization ID to filter by programID field
        if (organization && organization !== ALL_FILTER) {
            baseConditions.programID = organization.trim();
        }
        // Add status filter if specified
        if (status && !status?.includes(ALL_FILTER)) {
            // Only add status filter if there are actual statuses to filter by
            if (status.length > 0) {
                baseConditions.status = { in: status };
            }
        } else if (status !== null) {
            // Only set default status filter if status parameter was explicitly provided
            baseConditions.status = { in: validSubmissionStatus };
        }
        // Add filter for submission name if specified
        // This filter is a regex search on the submission name (case-insensitive)
        if (submissionName) {
            baseConditions.name = {
                contains: submissionName.trim().replace(/\\/g, ''),
                mode: 'insensitive'
            };
        }
        // Add filter for dbGaPID if specified
        // This filter is a regex search on the submission name (case-insensitive)
        if (dbGaPID) {
            baseConditions.dbGaPID = {
                contains: dbGaPID.trim().replace(/\\/g, ''),
                mode: 'insensitive'
            };
        }
        // Add filter for dataCommons if specified
        if (dataCommonsFilter && dataCommonsFilter !== ALL_FILTER) {
            if (baseConditions.dataCommons) {
                // If an existing filter exists, create intersection of the two filter sets
                const existingValues = baseConditions.dataCommons.in || [];
                const newValue = dataCommonsFilter.trim();
                const intersection = existingValues.filter(value => value === newValue);
                // Only add dataCommons filter if intersection contains values
                if (intersection.length > 0) {
                    baseConditions.dataCommons = { in: intersection };
                }
            } else {
                // If no existing filter exists, add the new value
                baseConditions.dataCommons = dataCommonsFilter.trim();
            }
        }
        // Add filter for submitterName if specified
        if (submitterName && submitterName !== ALL_FILTER) {
            baseConditions.submitter = {
                is: {
                    fullName: submitterName.trim()
                }
            };
        }
        return baseConditions;
    }

    /**
     * Retrieves distinct data commons values from submissions based on filter conditions.
     * This method is used for aggregation queries and should typically receive base conditions
     * (user scope only) rather than full filter conditions to ensure accurate aggregation results.
     * 
     * @param {Object} filterConditions - Prisma query conditions for filtering submissions
     * @returns {Promise<Array<string>>} Array of distinct data commons identifiers
     */
    async _getDistinctDataCommons(filterConditions) {
        try {
            const dataCommons = await prisma.submission.findMany({
                where: filterConditions,
                select: { dataCommons: true },
                distinct: ['dataCommons']
            });
            return dataCommons.map(item => item.dataCommons).filter(Boolean);
        } catch (error) {
            console.error('Error getting distinct dataCommons:', error);
            return [];
        }
    }

    /**
     * Retrieves distinct submitter names from submissions based on filter conditions.
     * This method is used for aggregation queries and should typically receive base conditions
     * (user scope only) rather than full filter conditions to ensure accurate aggregation results.
     * 
     * @param {Object} filterConditions - Prisma query conditions for filtering submissions
     * @returns {Promise<Array<string>>} Array of distinct submitter names
     */
    async _getDistinctSubmitterNames(filterConditions) {
        try {
            const submissions = await prisma.submission.findMany({
                where: filterConditions,
                select: { submitter: true },
                distinct: ['submitterID']
            });
            const submitterNames = submissions
                .map(sub => sub?.submitter?.fullName)
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b)); // sort ascending

            return Array.from(new Set(submitterNames));

        } catch (error) {
            console.error('Error getting distinct submitterNames:', error);
            return [];
        }
    }

    /**
     * Retrieves distinct organizations from submissions based on filter conditions.
     * This method performs a two-step query: first gets distinct study IDs from submissions,
     * then retrieves the organizations that have those studies. It's used for aggregation
     * queries and should typically receive base conditions (user scope only).
     * 
     * @param {Object} filterConditions - Prisma query conditions for filtering submissions
     * @returns {Promise<Array<Object>>} Array of organization objects with id, name, and abbreviation
     */
    async _getDistinctOrganizations(filterConditions) {
        try {
            // Get study IDs from submissions
            const studyIDs = await prisma.submission.findMany({
                where: filterConditions,
                select: { studyID: true },
                distinct: ['studyID']
            });

            const studyIDList = studyIDs.map(item => item.studyID);

            // Get organizations that have these studies
            const organizations = await prisma.program.findMany({
                where: {
                    studies: {
                        some: {
                            id: { in: studyIDList }
                        }
                    }
                },
                select: {
                    id: true,
                    name: true,
                    abbreviation: true
                }
            });

            // Transform organizations to match GraphQL schema (map id to _id)
            return formatNestedOrganizations(organizations);
        } catch (error) {
            console.error('Error getting distinct organizations:', error);
            return [];
        }
    }

    /**
     * Retrieves distinct submission statuses based on filter conditions.
     * This method is used for aggregation queries and should typically receive base conditions
     * (user scope only) rather than full filter conditions to ensure accurate aggregation results.
     * 
     * @param {Object} filterConditions - Prisma query conditions for filtering submissions
     * @returns {Promise<Array<string>>} Array of distinct submission statuses
     */
    async _getDistinctStatuses(filterConditions) {
        try {
            const statuses = await prisma.submission.findMany({
                where: filterConditions,
                select: { status: true },
                distinct: ['status']
            });
            return statuses.map(item => item.status).filter(Boolean);
        } catch (error) {
            console.error('Error getting distinct statuses:', error);
            return [];
        }
    }

    /**
     * Transforms data file size based on submission status.
     * Returns zero size for deleted or canceled submissions, otherwise returns the original size.
     * 
     * @param {string} status - Submission status
     * @param {Object} dataFileSize - Original data file size object
     * @returns {Object} Transformed data file size object
     */
    _transformDataFileSize(status, dataFileSize) {
        if ([DELETED, CANCELED].includes(status)) {
            return { size: 0, formatted: NA };
        }
        return dataFileSize;
    }

    async getInactiveSubmission(inactiveDays, inactiveFlagField) {
        try {
            const submissions = await prisma.submission.findMany({
                where: {
                    accessedAt: {
                        lt: subtractDaysFromNow(inactiveDays),
                    },
                    status: {
                        in: [NEW, IN_PROGRESS, REJECTED, WITHDRAWN]
                    },
                    // Tracks whether the notification has already been sent
                    [inactiveFlagField]: {not: true}
                }
            });

            return submissions.map(item => ({
                ...item,
                ...(item.id ? { _id: item.id } : {})
            }));
        } catch (error) {
            console.error('Error getting getInactiveSubmission:', error);
            return [];
        }
    }

    async getDeleteSubmissions(inactiveSubmissionDays) {
        try {
            const query = {
                where: {
                    status: {
                        in: [IN_PROGRESS, NEW, REJECTED, WITHDRAWN]
                    },
                    accessedAt: {
                        not: null,
                        lt: subtractDaysFromNow(inactiveSubmissionDays)
                    }
                }
            };
            return await prisma.submission.findMany(query);
        }  catch (error) {
            console.error('Error getting getDeleteSubmissions:', error);
            return [];
        }
    }

    async archiveCompletedSubmissions(completedSubmissionDays) {
        try {
            const targetRetentionDate = new Date();
            targetRetentionDate.setDate(targetRetentionDate.getDate() - completedSubmissionDays);
            return await prisma.submission.findMany({
                where: {
                    status: COMPLETED,
                    updatedAt: {
                        lte: targetRetentionDate
                    }
                }
            });
        } catch (error) {
            console.error('Error getting archiveCompletedSubmissions:', error);
            return [];
        }
    }
}



/**
 * Validates parameters for the listSubmissions method.
 * Checks that all provided status values are valid submission statuses.
 * 
 * @param {Object} params - Query parameters object
 * @param {Array<string>} [params.status] - Array of status values to validate
 * @throws {Error} When invalid status values are provided
 */
function validateListSubmissionsParams (params) {
    const validStatus = new Set([NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, REJECTED, WITHDRAWN, CANCELED, DELETED, ALL_FILTER]);
    const invalidStatuses = (params?.status || [])
        .filter((i) => !validStatus.has(i));
    if (invalidStatuses?.length > 0) {
        throw new Error(replaceErrorString(ERROR.LIST_SUBMISSION_INVALID_STATUS_FILTER, `'${invalidStatuses.join(",")}'`));
    }
}

module.exports = SubmissionDAO