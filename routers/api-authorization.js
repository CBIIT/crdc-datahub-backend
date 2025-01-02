
const {parse} = require("graphql");

const PUBLIC = 'public';

// escape public query 
const getAPINameFromReq = (req) => {
    // get all query APIs 
    if(req.body && req.body.query){
        const parsedQuery = parse(req.body.query);
        const api_list = parsedQuery.definitions.find(
            (definition) => definition.kind === 'OperationDefinition'
        ).selectionSet?.selections;
        query_api_names =  api_list.map( (api) => api.name.value )
        return query_api_names;
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
    query_api_names = getAPINameFromReq(req);
    let is_all_public = false;
    for (const api_name of query_api_names) {
        is_all_public = public_api_list.includes(api_name);
        if(!is_all_public) 
            break;
        is_all_public = true;
    }
    if (is_all_public) return;

    let userID = req.session?.userInfo?.userID;
    let userInfo = await authenticationService.verifyAuthenticated(req.session?.userInfo, req?.headers?.authorization);
    if (!userID){
        // session is not initialized
        req.session.userInfo = await userInitializationService.initializeUser(userInfo);
    }
}

module.exports  = {
    apiAuthorization,
    extractAPINames,
    PUBLIC
};

