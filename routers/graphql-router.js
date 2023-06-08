const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/data-interface");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");

const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string);
const application = new Application(dbService);
const root = {
    version: () => {return config.version},
    submitApplication: application.submitApplication.bind(application),
    approveApplication: application.approveApplication.bind(application),
    rejectApplication: application.rejectApplication.bind(application),
    reopenApplication: application.reopenApplication.bind(application),
    deleteApplication: application.deleteApplication.bind(application)
};

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
