const {getCurrentTime} = require("../crdc-datahub-database-drivers/utility/time-utility");
const {SUBMITTED} = require("../constants/submission-constants");

/**
 * Builds immutable history-event objects used for application/submission state timelines.
 */
class HistoryEventBuilder {
    /**
     * HistoryEventBuilder constructor.
     *
     * @param {string|null|undefined} userID User responsible for the state transition.
     * @param {string|null|undefined} status State value to record on the event.
     * @param {string|null|undefined} comment Optional review comment.
     * @param {Date|undefined} dateTime Optional explicit event timestamp.
     * @param {boolean|undefined} isAdminSubmit When set, Submitted events include isAdminSubmit (true/false); omit to leave the property off the event.
     */
    constructor(userID, status, comment, dateTime, isAdminSubmit) {
        this._userID = userID;
        this._status = status;
        this._comment = comment;
        this._dateTime = dateTime;
        this._isAdminSubmit = isAdminSubmit;
    }

    /**
     * Convenience factory for building a history-event payload.
     *
     * @param {string|null|undefined} userID User responsible for the state transition.
     * @param {string|null|undefined} status State value to record on the event.
     * @param {string|null|undefined} comment Optional review comment.
     * @param {Date|undefined} dateTime Optional explicit event timestamp.
     * @param {boolean|undefined} isAdminSubmit For Submitted status only; pass true/false to set isAdminSubmit; omit for no isAdminSubmit field.
     * @returns {{status?: string, reviewComment?: string, userID?: string, dateTime: Date, isAdminSubmit?: boolean}}
     */
    static createEvent(userID, status, comment, dateTime = undefined, isAdminSubmit = undefined) {
        return new HistoryEventBuilder(userID, status, comment, dateTime, isAdminSubmit)
            .build();
    }

    /**
     * Creates the serialized history-event object.
     *
     * @returns {{status?: string, reviewComment?: string, userID?: string, dateTime: Date, isAdminSubmit?: boolean}}
     */
    build() {
        let event = {};
        if (this._status) event.status = this._status;
        if (this._comment) event.reviewComment = this._comment;
        if (this._userID != null) event.userID = this._userID;
        if (this._dateTime instanceof Date) {
            event.dateTime = this._dateTime
        } else {
            event.dateTime = getCurrentTime();
        }
        if (this._status === SUBMITTED && this._isAdminSubmit !== undefined) {
            event.isAdminSubmit = this._isAdminSubmit === true;
        }
        return event;
    }
}

module.exports = {
    HistoryEventBuilder
};