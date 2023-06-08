const ERROR = {
    NOT_LOGGED_IN: "A user must be logged in to call this API",
    SESSION_NOT_INITIALIZED: "Internal error, a user is logged in but user data has not been initialized in the session",
    CREATE_APPLICATION_FAILED: "Internal error, unable to create a new application"
}

module.exports = ERROR;
