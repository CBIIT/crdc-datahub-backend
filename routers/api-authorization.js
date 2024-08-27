
const {parse} = require("graphql");

// escape public query 
const req_api_name = (req) => {
    if(req.body && req.body.query){
        const parsedQuery = parse(req.body.query);
        const api_name= parsedQuery.definitions.find(
            (definition) => definition.kind === 'OperationDefinition'
        ).selectionSet?.selections[0]?.name?.value;
        return api_name; 
    }
    else return null
}

const escape = (req, schema) => {
    const fields = schema._queryType?._fields;
    const public_api = Object.values(fields).find(
        (f) => (f.astNode.directives.length > 0) && (f.astNode.directives[0].name?.value === 'public')
      );
    return (req_api_name(req) === public_api.name)
}

async function apiAuthorization(req, authenticationService, userInitializationService, schema) {
    try {
        if (escape(req, schema)) return;
        let userID = req.session?.userInfo?.userID;
        let userInfo = await authenticationService.verifyAuthenticated(req.session?.userInfo, req?.headers?.authorization);
        if (!userID){
            // session is not initialized
            req.session.userInfo = await userInitializationService.initializeUser(userInfo);
        }
    } catch (error) {
        console.error('Failed to authorize:', error.message);
    }
}

module.exports  = {
    apiAuthorization
};

