const {NotifyService} = require("../../services/notify");
const {NotificationsService} = require("../../services/notifications");
const config = require("../../config");
const notifyService = new NotifyService();
const notificationsService = new NotificationsService(notifyService);

describe('arm access notification', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    test('/user arm access notification', async () => {
        let template_params = {
            firstName: 'CRDC Test'
        }
        let messageVariables = {
            pi: 'application first & last name',
            study: 'test study',
            program: 'test program',
            url: config.emails_url
        }
        await notificationsService.submitQuestionNotification('test@gmail.com', template_params, messageVariables)
    });
});