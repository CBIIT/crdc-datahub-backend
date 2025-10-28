const {isTrue} = require("../crdc-datahub-database-drivers/utility/string-utility");

class PendingGPA {
    constructor(GPAName, isPendingGPA) {
        this.GPAName = GPAName;
        this.isPendingGPA = isTrue(isPendingGPA);
    }

    static create(GPAName, isPendingGPA) {
        return new PendingGPA(GPAName, isPendingGPA);
    }
}

module.exports = {
    PendingGPA
};