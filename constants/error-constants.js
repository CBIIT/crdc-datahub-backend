const ERROR = {
    NOT_LOGGED_IN: "A user must be logged in to call this API",
    SESSION_NOT_INITIALIZED: "Internal error, a user is logged in but user data has not been initialized in the session",
    DATABASE_OPERATION_FAILED: "Database operation failed, please see logs for more information",
    // Application
    APPLICATION_NOT_FOUND: "The provided application ID was not found in the database. Provided _id: ",
    APPLICATION_CONTROLLED_ACCESS_NOT_FOUND: "The application does not store controlled access property.",
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
        // submission action
        INVALID_SUBMISSION_ACTION: "Invalid submission action:",
        INVALID_SUBMISSION_ACTION_STATUS: "Invalid submission status for the action:",
        INVALID_SUBMIT_ACTION: "Invalid submission action, user role and submission status requirements are not met.",
        INVALID_RELEASE_ACTION: "Invalid release action, cross submission validation is not passed.",
        INVALID_SUBMISSION_ACTION_ROLE: "Invalid user role for the action:",
        INVALID_SUBMISSION_ID: "submissionID can't be empty!",
        EMPTY_ROOT_PATH: "RootPath is missing in the submission",
        REJECT_ACTION_COMMENT_REQUIRED: "Reject submission action must include a comment.",
        SUBMIT_ACTION_COMMENT_REQUIRED: "Submit action must include a comment.",
        INVALID_ORGANIZATION_STATUS: "No organization assigned, or your organization is currently inactive and needs reactivation for use"
    },
    // Batch
    FAILED_NEW_BATCH_INSERTION: "An error occurred while creating a new batch",
    NEW_BATCH_NO_ORGANIZATION: "The user attempting to create a batch does not have any organizational record",
    FAILED_NEW_BATCH_NO_ROOT_PATH: "The batch creation is aborted because the current submission is missing a rootpath",
    INVALID_BATCH_PERMISSION: "You do not have permission to run a batch operation",
    SUBMISSION_NOT_EXIST: "The submission you are trying to access does not exist",
    BATCH_NOT_EXIST: "The batch you are trying to access does not exist",
    INVALID_UPDATE_BATCH_STATUS: "The batch update is aborted because the current batch status is not suitable for modification",
    FAILED_BATCH_UPDATE: "An error occurred while updating a batch",
    INVALID_BATCH_INTENTION: "Uploading data files is not allowed for a Delete submission",
    INVALID_BATCH_DATA_TYPE: "Uploading data files is not allowed for a Metadata Only submission",
    MISSING_REQUIRED_SUBMISSION_DATA: "To create a batch, please ensure that both the study ID and the metadata are included in the submission.",
    // Approved Studies
    APPROVED_STUDIES_INSERTION: "An error occurred while attempting to insert the approved studies into the database.",
    ORGANIZATION_APPROVED_STUDIES_INSERTION: "An error occurred while attempting to insert the approved studies for the organization into the database.",
    FAILED_STORE_APPROVED_STUDIES: "The approved studies are not being stored because the questionnaire data string is not correctly parsed",
    DUPLICATE_APPROVED_STUDY_NAME: "This is a duplicate study name. The $item$ study already exists in the system.",
    // Submission Permission
    INVALID_SUBMISSION_STATUS: "The batch creation is aborted because the current submission is not in the valid state to be created.",
    // Create Submission
    CREATE_SUBMISSION_NO_ORGANIZATION_ASSIGNED: "The submitter/organization owner does not have an organization assigned. Thus, the data submission was not created",
    CREATE_SUBMISSION_INSERTION_ERROR: "An error occurred while attempting to insert the created data submission into the database",
    CREATE_SUBMISSION_INVALID_PARAMS: "One or more of the parameters for creating a submission is invalid",
    CREATE_SUBMISSION_INVALID_INTENTION: "submission intention is invalid",
    CREATE_SUBMISSION_INVALID_DATA_TYPE: "submission data type is invalid",
    CREATE_SUBMISSION_INVALID_DELETE_INTENTION: "when intention is Delete, only 'Metadata Only' is allowed",
    UPDATE_SUBMISSION_ERROR:"An error occurred while attempting to update the submission in the database",
    CREATE_SUBMISSION_INVALID_DATA_COMMONS: "Invalid Data Commons for creating a submission",
    CREATE_SUBMISSION_NO_MATCHING_STUDY: "The study provided does not match an approved study within the user's organization",
    // List Submissions
    LIST_SUBMISSION_INVALID_STATUS_FILTER: "The status filter is invalid",
    INVALID_SUBMISSION_PERMISSION: "You do not have the correct permissions to list submissions",
    INVALID_STATS_SUBMISSION_PERMISSION: "You do not have permission to see the submission stats.",
    INVALID_ROLE: "You do not have the correct role to perform this operation",
    INVALID_PERMISSION: "You do not have permission to view this application",
    // Submission Notification
    NO_SUBMISSION_RECEIVER: "Submission is unable to send an email notification",
    // Validate Submission
    FAILED_VALIDATE_CROSS_SUBMISSION: "Failed to validate cross-submission",
    FAILED_VALIDATE_METADATA: "Failed to validate metadata",
    FAILED_VALIDATE_FILE: "Failed to validate data file",
    FAILED_COMPLETE_SUBMISSION: "Failed to send a complete submission message",
    FAILED_RECORD_VALIDATION_PROPERTY: "Failed to record the validation property for a submission",
    FAILED_INSERT_VALIDATION_OBJECT: "Failed to insert the validation object into the validation collection",
    NO_VALIDATION_FILE: "No file manifest(s) are uploaded for file validation",
    NO_VALIDATION_METADATA: "No metadata for validation",
    NO_NEW_VALIDATION_METADATA: "No new metadata for validation",
    INVALID_VALIDATION_STATUS: "A data record can not be validated because of its invalid status.",
    INVALID_SUBMISSION_SCOPE: "submission scope is invalid",
    INVALID_SUBMISSION_TYPE: "submission type is invalid",
    INVALID_VALIDATE_METADATA: "You do not have permission to validate the metadata",
    INVALID_PERMISSION_TO_VIEW_VALIDATION_RESULTS: "You do not have permission to view the validation results for this submission",
    INVALID_PERMISSION_TO_VIEW_NODE_TYPES: "You do not have permission to view the node types included in this submission",
    MISSING_SUBMISSION_FILE_ERRORS: "The file errors property is missing from the submission",
    // Token
    INVALID_TOKEN_EMPTY: "Invalid token: it is empty string!",
    INVALID_TOKEN_NO_USER: "Invalid token: no user info!",
    INVALID_TOKEN_NO_USER_ID: 'Invalid token: no user id!',
    INVALID_SUBMISSION_EMPTY: 'Invalid submissionID: it can not be empty string!',
    INVALID_SUBMISSION_NOT_FOUND: "Cant find the submission by submissionID",
    INVALID_NODE_NOT_FOUND: "Cant find the node by nodeID, nodeType and submissionID",
    INVALID_SUBMITTER: "The user has no permissions to upload data for the submission",
    INVALID_SESSION_OR_TOKEN: "No valid session or valid API token",
    FAILED_LIST_LOG: "Failed to get log file(s) for submission",
    // AWS
    FAILED_SQS_SEND: "Failed to send a message to aws SQS queue",
    //export dataRecords
    INVALID_EXPORT_METADATA: "You do not have permission to export submission data",
    INVALID_DATA_MODEL_VERSION: "An error occurred while trying to retrieve the data model version from the given URL",
    INVALID_DELETE_DATA_RECORDS_PERMISSION: "You do not have the correct permissions to delete data records",
    FAILED_REQUEST_DELETE_RECORDS: "Failed to send a delete data record message",
    FAILED_UPDATE_DELETE_STATUS: "Failed to update the status of data record deletion",
    // delete submission error file list
    DELETE_NO_FILE_SUBMISSION: "No extra file found",
    DELETE_NO_DATA_FILE_EXISTS: "No data files found for deletion in the bucket",
    NO_UPLOADER_CLI_CONFIG_TEMPLATE: "Data file uploader CLI config template is not found.",
    INVALID_DATA_MODEL: "No file node properties in the data model.",
    NO_SUBMISSION_BUCKET: "Unable to create a batch, no submission bucket is stored",
    FAILED_LIST_DATA_FILES: "Unable to list data files in the bucket",
    INVALID_NODE_RELATIONSHIP: "Invalid node relationship",
    INVALID_NO_PARENTS_FOUND: "No parents found for the node type",
    INVALID_NO_CHILDREN_FOUND: "No children found for the node type", 
    INVALID_NODE_STATUS_NOT_FOUND: "Invalid node status",
    MISSING_DATA_NODE_FILE_TITLE: "Orphaned file found",
    MISSING_DATA_NODE_FILE_DESC: "Data file $item$: associated metadata not found. Please upload associated metadata (aka. manifest) file.",
    // Quicksight Dashboard
    MISSING_QUICKSIGHT_USER_NAME: "A user configuration is missing for the AWS Quicksight",
    // Submission Stats
    MISSING_DATA_FILE: {
        TITLE: "Data file not found",
        CONTENTS: "Data file $item$ not found"
    }
}

module.exports = ERROR;
