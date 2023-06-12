const {getCurrentTimeYYYYMMDDSS} = require("../utility/time-util");
class EventBuilder {
    constructor(status, comment, userID) {
        this._status = status;
        this._comment = comment;
        this._userID = userID;
    }

    static createEvent(event) {
        return new EventBuilder(event.status, event.comment, event.userID)
            .build();
    }

    build() {
        let event = {};
        if (this._status) event.status = this._status;
        if (this._comment) event.reviewComment = this._comment;
        if (this._userID) event.userID = this._userID;
        event.dateTime = getCurrentTimeYYYYMMDDSS();
        return event;
    }
}

module.exports = {
    EventBuilder
};