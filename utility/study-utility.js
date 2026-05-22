/**
 * Utility functions for study-related operations
 */

const ERROR = require("../constants/error-constants");
const {
    APPROVED_STUDY_STATUS,
    APPROVED_STUDY_STATUS_FILTER_MAX_LENGTH,
} = require("../crdc-datahub-database-drivers/constants/approved-study-constants");
const { replaceErrorString } = require("./string-util");

/**
 * @param {string} status
 * @returns {boolean}
 */
function isValidApprovedStudyStatus(status) {
    return status === APPROVED_STUDY_STATUS.ACTIVE || status === APPROVED_STUDY_STATUS.INACTIVE;
}

/**
 * True when the approved study document is usable as an active study (status === Active).
 * @param {{ status?: string }|null|undefined} study
 * @returns {boolean}
 */
function isApprovedStudyActive(study) {
    return study?.status === APPROVED_STUDY_STATUS.ACTIVE;
}

/**
 * Trims and validates a value for ApprovedStudy.status (or listApprovedStudies statuses filter).
 * @param {unknown} raw
 * @returns {string} "Active" or "Inactive"
 * @throws {Error} when not Active or Inactive after trim
 */
function parseApprovedStudyStatusInput(raw) {
    const s = String(raw).trim();
    if (!isValidApprovedStudyStatus(s)) {
        throw new Error(ERROR.INVALID_APPROVED_STUDY_STATUS);
    }
    return s;
}

/**
 * Validates, deduplicates (first occurrence wins), and enforces max length for listApprovedStudies `statuses`.
 * @param {unknown} statuses
 * @returns {string[]|null} Canonical Active/Inactive list, or null when absent/empty
 */
function parseApprovedStudyStatusesFilterInput(statuses) {
    if (!Array.isArray(statuses) || statuses.length === 0) {
        return null;
    }
    if (statuses.length > APPROVED_STUDY_STATUS_FILTER_MAX_LENGTH) {
        throw new Error(
            replaceErrorString(
                ERROR.LIST_APPROVED_STUDIES_STATUSES_FILTER_TOO_MANY,
                String(APPROVED_STUDY_STATUS_FILTER_MAX_LENGTH)
            )
        );
    }

    const statusSet = new Set();
    statuses.forEach((status) => {
        const s = parseApprovedStudyStatusInput(status);
        if (!statusSet.has(s)) {
            statusSet.add(s);
        }
    });
    return Array.from(statusSet);
}

/**
 * Checks if a user has access to all studies.
 * Determines whether the user studies array contains an "All" value, indicating
 * unrestricted access to all studies in the system.
 * 
 * @param {Array|string} userStudies - User's assigned studies (can be array of objects/strings or single value)
 * @returns {boolean} True if user has access to all studies, false otherwise
 */
const isAllStudy = (userStudies) => {
    const studies = Array.isArray(userStudies) && userStudies.length > 0 ? userStudies : [];
    return Boolean(studies.find(study =>
        (typeof study === 'object' && study._id === "All") ||
        (typeof study === 'object' && study.id === "All") ||
        (typeof study === 'string' && study === "All")
    ));
};

module.exports = {
    isAllStudy,
    isApprovedStudyActive,
    isValidApprovedStudyStatus,
    parseApprovedStudyStatusInput,
    parseApprovedStudyStatusesFilterInput,
};
