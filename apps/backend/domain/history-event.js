const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
class HistoryEventBuilder {
    constructor(userID, status, comment) {
        this._userID = userID;
        this._status = status;
        this._comment = comment;
    }

    static createEvent(userID, status, comment) {
        return new HistoryEventBuilder(userID, status, comment)
            .build();
    }

    build() {
        let event = {};
        if (this._status) event.status = this._status;
        if (this._comment) event.reviewComment = this._comment;
        if (this._userID != null) event.userID = this._userID;
        event.dateTime = getCurrentTime();
        return event;
    }
}

module.exports = {
    HistoryEventBuilder
};