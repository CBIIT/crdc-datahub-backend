const ERROR = require("../constants/error-constants");
const {ORGANIZATION} = require("../crdc-datahub-database-drivers/constants/organization-constants");

function verifySession(context){
    return new UserInfoVerifier(context);
}

class UserInfoVerifier {

    constructor(context) {
        const userInfo = context?.userInfo;
        if (!userInfo) throw new Error(ERROR.NOT_LOGGED_IN);
        this.userInfo = userInfo;
    }

    verifyInitialized(){
        if (!this?.userInfo?._id) throw new Error(ERROR.SESSION_NOT_INITIALIZED);
        return this;
    }

    verifyRole(roles) {
        if (!roles.includes(this?.userInfo?.role)) throw new Error(ERROR.INVALID_ROLE);
        return this;
    }

    verifyPermission(permission) {
        if (permission instanceof String) permission = [permission];
        if (!this?.userInfo?.permissions?.some(item => permission.includes(item))) {
            throw new Error(ERROR.VERIFY.INVALID_PERMISSION);
        }
        return this;
    }
}
module.exports = {
    verifySession
};
