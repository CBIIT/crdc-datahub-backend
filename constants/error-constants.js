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
        INVALID_STATE_APPLICATION: "Application state is invalid"
    },
    INVALID_ROLE: "You do not have the correct role to perform this operation",
    INVALID_PERMISSION: "You do not have permission to view this application",
    DUPLICATE_STUDY_ABBREVIATION: "Study abbreviation must be a unique value as it already exists in the database.",
    // Approved Studies
    APPROVED_STUDIES_INSERTION: "An error occurred while attempting to insert the approved studies into the database.",
    FAILED_STORE_APPROVED_STUDIES: "The approved studies are not being stored because the questionnaire data string is not correctly parsed",
    // Create Submission
    CREATE_SUBMISSION_NO_ORGANIZATION_ASSIGNED: "The submitter/organization owner does not have an organization assigned. Thus, the data subission was not created.",
    CREATE_SUBMISSION_INSERTION_ERROR: "An error occured while attempting to insert the created data submission into the database",
    CREATE_SUBMISSION_INVALID_PARAMS: "One or more of the parameters for creating a submission is invalid."
}

module.exports = ERROR;
