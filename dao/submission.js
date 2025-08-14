const GenericDAO = require("./generic");
const { MODEL_NAME } = require('../constants/db-constants');
const {PrismaPagination} = require("../crdc-datahub-database-drivers/domain/prisma-pagination");
const {DELETED, CANCELED, NEW, IN_PROGRESS, SUBMITTED, WITHDRAWN, RELEASED, REJECTED, COMPLETED, ARCHIVED,
    COLLABORATOR_PERMISSIONS
} = require("../constants/submission-constants");
const ERROR = require("../constants/error-constants");
const {replaceErrorString} = require("../utility/string-util");
const prisma = require("../prisma");
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
        try {
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

    async listSubmissions(userInfo, userScope, params) {
        validateListSubmissionsParams(params);

        const filterConditions = this._listConditions(userInfo, params.status, params.name, params.dbGaPID, params.dataCommons, params?.submitterName, userScope);
        
        // Create Prisma pagination
        const pagination = new PrismaPagination(params?.first, params.offset, params.orderBy, params.sortDirection);
        
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
            }
        };

        // Build where conditions for Prisma
        const whereConditions = this._buildPrismaWhereConditions(filterConditions);
        
        // Add organization filter if specified
        if (params?.organization && params?.organization !== ALL_FILTER) {
            whereConditions.organization = {
                id: params.organization
            };
        }

        try {
            // Execute main query with pagination
            const submissions = await prisma.submission.findMany({
                where: whereConditions,
                include: includeQuery,
                ...pagination.getPagination()
            });

            // Get total count
            const total = await prisma.submission.count({
                where: whereConditions
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
                studyName: submission.study?.studyName,
                studyAbbreviation: submission.study?.studyAbbreviation,
                dataFileSize: this._transformDataFileSize(submission.status, submission.dataFileSize)
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

    _listConditions(userInfo, status, submissionName, dbGaPID, dataCommonsParams, submitterName, userScope){
        const {_id, dataCommons, studies} = userInfo;
        const validSubmissionStatus = [NEW, IN_PROGRESS, SUBMITTED, RELEASED, COMPLETED, ARCHIVED, CANCELED,
            REJECTED, WITHDRAWN, DELETED];
        
        // Build base conditions for Prisma
        const baseConditions = {};

        // Status condition
        if (status && !status?.includes(ALL_FILTER)) {
            baseConditions.status = { in: status || [] };
        } else {
            baseConditions.status = { in: validSubmissionStatus };
        }

        // Name condition (regex search)
        if (submissionName) {
            baseConditions.name = {
                contains: submissionName.trim().replace(/\\/g, ''),
                mode: 'insensitive'
            };
        }

        // dbGaPID condition (regex search)
        if (dbGaPID) {
            baseConditions.dbGaPID = {
                contains: dbGaPID.trim().replace(/\\/g, ''),
                mode: 'insensitive'
            };
        }

        // Data commons condition
        if (dataCommonsParams && dataCommonsParams !== ALL_FILTER) {
            baseConditions.dataCommons = dataCommonsParams.trim();
        }

        // Submitter name condition
        if (submitterName && submitterName !== ALL_FILTER) {
            baseConditions.submitterName = submitterName.trim();
        }

        if (userScope.isAllScope()) {
            return baseConditions;
        } else if (userScope.isStudyScope()) {
            const studyScope = userScope.getStudyScope();
            if (!isAllStudy(studyScope?.scopeValues)) {
                baseConditions.studyID = { in: studyScope?.scopeValues || [] };
            }
            return baseConditions;
        } else if (userScope.isDCScope()) {
            const DCScope = userScope.getDataCommonsScope();
            if (dataCommonsParams !== ALL_FILTER && DCScope?.scopeValues?.includes(dataCommonsParams)) {
                baseConditions.dataCommons = dataCommonsParams;
            } else {
                baseConditions.dataCommons = { in: dataCommons || [] };
            }
            return baseConditions;
        } else if (userScope.isOwnScope()) {
            const userStudies = Array.isArray(studies) && studies.length > 0 ? studies : [];
            if (!isAllStudy(userStudies)) {
                const studyIDs = userStudies?.map(s => s?._id).filter(Boolean);
                baseConditions.OR = [
                    { submitterID: _id },
                    { studyID: { in: studyIDs || [] } },
                    {
                        collaborators: {
                            some: {
                                collaboratorID: _id,
                                permission: { in: [COLLABORATOR_PERMISSIONS.CAN_EDIT] }
                            }
                        }
                    }
                ];
            }
            return baseConditions;
        }
        throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
    }

    _buildPrismaWhereConditions(filterConditions) {
        // Since _listConditions now returns Prisma-compatible conditions directly,
        // we can just return them with minimal transformation
        return { ...filterConditions };
    }

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

    async _getDistinctSubmitterNames(filterConditions) {
        try {
            const submitterNames = await prisma.submission.findMany({
                where: filterConditions,
                select: { submitterName: true },
                distinct: ['submitterName']
            });
            return submitterNames.map(item => item.submitterName).filter(Boolean);
        } catch (error) {
            console.error('Error getting distinct submitterNames:', error);
            return [];
        }
    }

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

            return organizations;
        } catch (error) {
            console.error('Error getting distinct organizations:', error);
            return [];
        }
    }

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

    _transformDataFileSize(status, dataFileSize) {
        if ([DELETED, CANCELED].includes(status)) {
            return { size: 0, formatted: NA };
        }
        return dataFileSize;
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
    const invalidStatuses = (params?.status || [])
        .filter((i) => !validStatus.has(i));
    if (invalidStatuses?.length > 0) {
        throw new Error(replaceErrorString(ERROR.LIST_SUBMISSION_INVALID_STATUS_FILTER, `'${invalidStatuses.join(",")}'`));
    }
}

module.exports = SubmissionDAO