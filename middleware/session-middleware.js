const session = require('express-session');
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");

function createSession(sessionSecret, sessionTimeout, connectionString) {
    const mySession = session({
        secret: sessionSecret,
        // rolling: true,
        saveUninitialized: false,
        resave: true,
        store: DatabaseConnector.createMongoStore(connectionString, sessionTimeout)
    });
    return mySession;
}

module.exports = createSession;
