const {buildSchema} = require('graphql');
const {createHandler} = require("graphql-http/lib/use/express");
const config = require("../config");

const schema = buildSchema(require("fs").readFileSync("resources/graphql/placeholder.graphql", "utf8"));

const root = {
    version: () => {return config.version}
};

module.exports = (req, res) => {
    createHandler({
        schema: schema,
        rootValue: root,
        context: req.session
    })(req,res);
};
