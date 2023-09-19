const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");
const {DatabaseConnector} = require("../crdc-datahub-database-drivers/database-connector");
const {initApplicationService} = require("../services/application-service-dep");
const schema = buildSchema(require("fs").readFileSync("resources/graphql/crdc-datahub.graphql", "utf8"));
const dbConnector = new DatabaseConnector(config.mongo_db_connection_string);
let root;
dbConnector.connect().then(async () => {
    const dataInterface = await initApplicationService(config,dbConnector);
    root = {
        version: () => {return config.version},
        saveApplication: dataInterface.saveApplication.bind(dataInterface),
        getApplication: dataInterface.getApplication.bind(dataInterface),
        reviewApplication: dataInterface.reviewApplication.bind(dataInterface),
        getMyLastApplication: dataInterface.getMyLastApplication.bind(dataInterface),
        listApplications: dataInterface.listApplications.bind(dataInterface),
        submitApplication: dataInterface.submitApplication.bind(dataInterface),
        approveApplication: dataInterface.approveApplication.bind(dataInterface),
        rejectApplication: dataInterface.rejectApplication.bind(dataInterface),
        reopenApplication: dataInterface.reopenApplication.bind(dataInterface),
        deleteApplication: dataInterface.deleteApplication.bind(dataInterface)
    };
});

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
