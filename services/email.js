const { createTransport } = require('nodemailer');

class EmailService {

    constructor(emailTransport, emailsEnabled) {
        this.emailTransport = emailTransport;
        this.emailsEnabled = emailsEnabled;
    }

    async sendNotification(from, subject, html, to = [], cc = [], bcc = []) {

        if (!to?.length) {
            throw new Error('Missing recipient');
        }

        if (!html) {
            throw new Error('Missing HTML CONTENTS');
        }

        to = this.asArray(to);
        cc = this.asArray(cc);
        bcc = this.asArray(bcc);

        return await this.sendMail({ from, to, cc, bcc, subject, html });
    }

    async sendMail(params) {
        const transport = createTransport(this.emailTransport);
        console.log("Generating email to: "+params.to.join(', '));
        if (this.emailsEnabled){
            try{
                let result = await transport.sendMail(params);
                console.log("Email sent");
                return result;
            }
            catch (err){
                console.error("Email failed to send with ths following reason:" + err.message);
                return err;
            }
        }
        else {
            console.log("Email not sent, email is disabled by configuration");
            return true;
        }
    }

    asArray(values = []) {
        return Array.isArray(values)
            ? values
            : [values];
    }

}

module.exports = {EmailService}
