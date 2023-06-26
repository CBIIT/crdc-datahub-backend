const ERROR = {
    NOT_LOGGED_IN: "A user must be logged in to call this API",
    SESSION_NOT_INITIALIZED: "Internal error, a user is logged in but user data has not been initialized in the session",
    DATABASE_OPERATION_FAILED: "Database operation failed, please see logs for more information",
    APPLICATION_NOT_FOUND: "The provided application ID was not found in the database. Provided _id: ",
    NO_USER_APPLICATIONS: "The current user has no applications",
    UPDATE_FAILED: "Update unsuccessful"
}

module.exports = ERROR;
