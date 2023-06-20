function verifyApplication(applicationArray) {
    return new ApplicationVerifier(applicationArray);
}

class ApplicationVerifier {
    constructor(applicationArray) {
        this.applicationArray = applicationArray;
    }

    notEmpty() {
        if (!this.applicationArray||!this.applicationArray.length) throw new Error("Application array is empty");
        return this;
    }

    state(state) {
        if (!this.applicationArray[0].status) throw new Error("Application state is undefined");
        if (this.applicationArray[0].status !== state) throw Error("Application state is invalid");
        return this;
    }
}

module.exports = {
    verifyApplication
}