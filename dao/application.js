const prisma = require("../prisma");
const { MODEL_NAME, SORT} = require('../constants/db-constants');
const GenericDAO = require("./generic");
const {convertIdFields, convertMongoFilterToPrismaFilter,handleDotNotation} = require('./utils/orm-converter');

const {getCurrentTime, subtractDaysFromNow} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {NEW, IN_PROGRESS, INQUIRED} = require("../constants/application-constants");

class ApplicationDAO extends GenericDAO {
    constructor(applicationCollection) {
        super(MODEL_NAME.APPLICATION);
        this.applicationCollection = applicationCollection;
    }
    // Prisma can't join _id in the object.
    async updateApplicationOrg(orgID, updatedOrg){
        return await this.applicationCollection.updateMany(
            {"organization._id": orgID, "organization.name": {"$ne": updatedOrg.name}},
            {"organization.name": updatedOrg.name, updatedAt: getCurrentTime()}
        )
    }

    async insert(application) {
        const createdData = convertIdFields(application);
        const created = await this.create(createdData);
        return { acknowledged: !!created, insertedId: created.id };
    }

    async update(application) {
        // check if _id or id is present
        if (!application._id && !application.id) {
            throw new Error('Application must have an _id or id');
        }
        // remove institution object if it exists
        if (application.institution) {
            delete application.institution;
        }
        // use super.update to call the update method from GenericDAO
        return await super.update(application._id, application);
    }

    async updateMany(filter, data) {
        // Prisma expects a plain object for update, not MongoDB-style operators
        const updateDoc = Array.isArray(data)
            ? Object.assign({}, ...data)
            : data;

        filter = convertMongoFilterToPrismaFilter(filter);
        const result = await prisma.application.updateMany({
            where: filter,
            data: updateDoc
        });
        return { matchedCount: result.count, modifiedCount: result.count };
    }

    async getInactiveApplication(inactiveDays, inactiveFlagField) {
        try {
            const applications = await prisma.application.findMany({
                where: {
                    updatedAt: {
                        lt: subtractDaysFromNow(inactiveDays),
                    },
                    status: {
                        in: [NEW, IN_PROGRESS, INQUIRED]
                    },
                    // Tracks whether the notification has already been sent
                    ...(inactiveFlagField ? {[inactiveFlagField]: {not: true}} : {})
                },
                include: {
                    applicant: true,
                }
            });
            return applications.map(item => ({
                ...item,
                ...(item.id ? { _id: item.id } : {}),
                ...(item?.applicant ? {
                    applicant: {
                        ...item?.applicant,
                        applicantID: item?.applicant?.id || "",
                        applicantName: item?.applicant?.fullName || "",
                        applicantEmail: item?.applicant?.email || ""
                    }
                }
                : {}),
            }));
        } catch (error) {
            console.error('Error getting getInactiveApplication:', error);
            return [];
        }
    }
}

module.exports = ApplicationDAO;