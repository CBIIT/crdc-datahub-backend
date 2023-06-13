const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {Application} = require("../services/application");
const {MongoQueries} = require("../crdc-datahub-database-drivers/mongo-queries");

const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbService = new MongoQueries(config.mongo_db_connection_string);
const dataInterface = new Application(dbService);
const root = {
    version: () => {return config.version},
    submitApplication: dataInterface.submitApplication.bind(dataInterface),
    approveApplication: dataInterface.approveApplication.bind(dataInterface),
    rejectApplication: dataInterface.rejectApplication.bind(dataInterface),
    reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
    deleteApplication: dataInterface.deleteApplication.bind(dataInterface)
};

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
