const ERROR = require("../constants/error-constants");

function verifyApplication(applicationArray) {
    return new ApplicationVerifier(applicationArray);
}

class ApplicationVerifier {
    constructor(applicationArray) {
        if (applicationArray && !Array.isArray(applicationArray)){
            applicationArray = [applicationArray];
        }
        this.applicationArray = applicationArray;
    }

    isUndefined() {
        if (!Array.isArray(this.applicationArray)) throw new Error(ERROR.VERIFY.UNDEFINED_APPLICATION);
        return this;
    }

    notEmpty() {
        if (!this.applicationArray||!this.applicationArray?.length) throw new Error(ERROR.VERIFY.EMPTY_APPLICATION);
        return this;
    }

    state(state) {
        if (!Array.isArray(state)){
            state = [state];
        }
        if (!this.applicationArray[0].status) throw new Error(ERROR.VERIFY.UNDEFINED_STATUS_APPLICATION);
        if (!state.includes(this.applicationArray[0].status)) throw Error(ERROR.VERIFY.INVALID_STATE_APPLICATION);
        return this;
    }
}

module.exports = {
    verifyApplication
}