const ERROR = require("../constants/error-constants");

function verifySession(context){
    return new SessionVerifier(context);
}

class SessionVerifier{

    constructor(context) {
        const userInfo = context?.userInfo;
        if (!userInfo) throw new Error(ERROR.NOT_LOGGED_IN);
        this.userInfo = userInfo;
    }

    verifyInitialized(){
        if (!this.userInfo.userID) throw new Error(ERROR.SESSION_NOT_INITIALIZED);
        return this;
    }

}

module.exports = {
    verifySession
};
