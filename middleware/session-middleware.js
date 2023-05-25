const session = require('express-session');

function createSession(sessionSecret, sessionTimeout, databaseConnector) {
    return session({
        secret: sessionSecret,
        // rolling: true,
        saveUninitialized: false,
        resave: true,
        store: databaseConnector.createMongoStore(sessionTimeout)
    });
}

module.exports = createSession;
