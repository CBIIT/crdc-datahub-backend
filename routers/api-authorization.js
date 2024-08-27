
const {parse} = require("graphql");

const PUBLIC = 'public';

// escape public query 
const getAPINameFromReq = (req) => {
    if(req.body && req.body.query){
        const parsedQuery = parse(req.body.query);
        const api_name= parsedQuery.definitions.find(
            (definition) => definition.kind === 'OperationDefinition'
        ).selectionSet?.selections[0]?.name?.value;
        return api_name; 
    }
    else return null
}

function extractAPINames(schema, api_type = PUBLIC){
    const fields = schema._queryType?._fields;
    const public_api_list = Object.values(fields).filter(
        (f) => (f.astNode.directives.length > 0) && (f.astNode.directives[0].name?.value === api_type)
      );
    return public_api_list.map( (api) => api.name )
}

async function apiAuthorization(req, authenticationService, userInitializationService, public_api_list) {
    try {
        if (getAPINameFromReq(req) in public_api_list) return;
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
    apiAuthorization,
    extractAPINames,
    PUBLIC
};

