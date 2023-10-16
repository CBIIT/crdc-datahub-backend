const ERROR = {
    NOT_LOGGED_IN: "A user must be logged in to call this API",
    SESSION_NOT_INITIALIZED: "Internal error, a user is logged in but user data has not been initialized in the session",
    DATABASE_OPERATION_FAILED: "Database operation failed, please see logs for more information",
    APPLICATION_NOT_FOUND: "The provided application ID was not found in the database. Provided _id: ",
    UPDATE_FAILED: "Update unsuccessful",
    VERIFY: {
        UNDEFINED_APPLICATION: "Application array is undefined",
        EMPTY_APPLICATION: "Application array is empty",
        UNDEFINED_STATUS_APPLICATION: "Application state is undefined",
        INVALID_STATE_APPLICATION: "Application state is invalid",
        // Batch
        UNDEFINED_BATCH_SUBMISSION_ID: "Batch submission ID is undefined",
        UNDEFINED_BATCH_ID: "Batch ID is undefined",
        UNDEFINED_BATCH_FILE: "Batch file is undefined",
        UNDEFINED_BATCH_METADATA_INTENTION: "Batch metadata-intention is undefined",
        UNDEFINED_BATCH_TYPE: "Batch metadata-intention is undefined",
        EMPTY_BATCH_FILE: "Batch file is empty",
        INVALID_BATCH_TYPE: "Batch type is invalid",
        INVALID_METADATA_INTENTION_TYPE: "Metadata Intention type is invalid"
    },
    // Batch
    FAILED_NEW_BATCH_INSERTION: "An error occurred while creating a new batch",
    NEW_BATCH_NO_ORGANIZATION: "The user attempting to create a batch does not have any organizational record",
    INVALID_BATCH_PERMISSION: "You do not have permission to run a batch operation",
    SUBMISSION_NOT_EXIST: "The submission you are trying to access does not exist",
    BATCH_NOT_EXIST: "The batch you are trying to access does not exist",
    INVALID_UPDATE_BATCH_STATUS: "The batch update is aborted because the current batch status is not suitable for modification",
    FAILED_BATCH_UPDATE: "An error occurred while updating a batch",
    // Approved Studies
    APPROVED_STUDIES_INSERTION: "An error occurred while attempting to insert the approved studies into the database.",
    FAILED_STORE_APPROVED_STUDIES: "The approved studies are not being stored because the questionnaire data string is not correctly parsed",
    // Create Submission
    CREATE_SUBMISSION_NO_ORGANIZATION_ASSIGNED: "The submitter/organization owner does not have an organization assigned. Thus, the data submission was not created",
    CREATE_SUBMISSION_INSERTION_ERROR: "An error occurred while attempting to insert the created data submission into the database",
    CREATE_SUBMISSION_INVALID_PARAMS: "One or more of the parameters for creating a submission is invalid",
    CREATE_SUBMISSION_INVALID_DATA_COMMONS: "Invalid Data Commons for creating a submission",
    CREATE_SUBMISSION_NO_MATCHING_STUDY: "The study provided does not match an approved study within the user's organization",
    // List Submissions
    LIST_SUBMISSION_INVALID_STATUS_FILTER: "The status filter is invalid",
    DUPLICATE_STUDY_ABBREVIATION: "Study abbreviation must be a unique value as it already exists in the database.",
    INVALID_SUBMISSION_PERMISSION: "You do not have the correct permissions to list submissions",
    INVALID_ROLE: "You do not have the correct role to perform this operation",
    INVALID_PERMISSION: "You do not have permission to view this application",
    // Token
    INVALID_TOKEN_EMPTY: "Invalid token: it is empty string!",
    INVALID_TOKEN_NO_USER: "Invalid token: no user info!",
    INVALID_TOKEN_NO_USER_ID: 'Invalid token: no user id!',
    INVALID_SUBMISSION_EMPTY: 'Invalid submissionID: it can not be empty string!',
    INVALID_SUBMISSION_NOT_FOUND: "Cant find the submission by submissionID",
    INVALID_SUBMITTER: "The user has no permissions to upload data for the submission",
    INVALID_SESSION_OR_TOKEN: "No valid session or valid API token"
}

module.exports = ERROR;
