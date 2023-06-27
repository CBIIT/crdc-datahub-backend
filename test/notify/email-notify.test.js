const {EmailService} = require("../../services/email");
const {NotifyUser} = require("../../services/notify-user");
const config = require("../../config");
const emailService = new EmailService(config.email_transport, config.emails_enabled);
const notificationsService = new NotifyUser(emailService);

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