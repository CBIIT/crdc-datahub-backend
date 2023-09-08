const {IN_PROGRESS} = require("../constants/application-constants");
const {HistoryEventBuilder} = require("../domain/history-event");
const ERROR = require("../constants/error-constants");
const {UpdateApplicationStateEvent} = require("../crdc-datahub-database-drivers/domain/log-events");


async function updateApplication(applicationCollection, application, prevStatus, userID) {
    if (prevStatus !== IN_PROGRESS) {
        application = {history: [], ...application};
        const historyEvent = HistoryEventBuilder.createEvent(userID, IN_PROGRESS, null);
        application.history.push(historyEvent);
    }
    const updateResult = await applicationCollection.update(application);
    if ((updateResult?.matchedCount || 0) < 1) {
        throw new Error(ERROR.APPLICATION_NOT_FOUND + application?._id);
    }
    return application;
}

async function logStateChange(logCollection, userInfo, application, prevStatus) {
    await logCollection.insert(
        UpdateApplicationStateEvent.create(
            userInfo?._id, userInfo?.email, userInfo?.IDP, application?._id, prevStatus, application?.status
        )
    );
}

module.exports = {
    updateApplication,
    logStateChange
};
