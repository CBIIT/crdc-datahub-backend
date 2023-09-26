const express = require("express");
const config = require("../config");
const {MongoDBHealthCheck} = require("../crdc-datahub-database-drivers/mongo-health-check");
const {ERROR} = require("../crdc-datahub-database-drivers/constants/error-constants");

const router = express.Router();
router.get("/ping", (req, res, next) => {
    res.send('pong');
});
router.get("/version", async (req, res, next) => {
    let body = {
        version: config.version,
        date: config.date
    };
    if (!(await MongoDBHealthCheck(config.mongo_db_connection_string))) {
        body.error = ERROR.MONGODB_HEALTH_CHECK_FAILED;
        res.status(503);
    }
    res.json(body);
});

module.exports = router;
