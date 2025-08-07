const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");

class PendingGPA {
    constructor(GPAName, GPAEmail, isPendingGPA) {
        this.GPAName = GPAName;
        this.GPAEmail = GPAEmail;
        this.isPendingGPA = isTrue(isPendingGPA);
    }

    static create(GPAName, GPAEmail, isPendingGPA) {
        return new PendingGPA(GPAName, GPAEmail, isPendingGPA);
    }
}

module.exports = {
    PendingGPA
};