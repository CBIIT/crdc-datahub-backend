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
        const ccEmailMsg = `${params.cc.length > 0 ? ` CC: ${params.cc.join(', ')}` : ''}`;
        const bccEmailMsg = `${params.bcc.length > 0 ? ` BCC: ${params.bcc.join(', ')}` : ''}`;
        console.log("Generating email to: "+params.to.join(', '), ccEmailMsg, bccEmailMsg);
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

    /**
     * Test email service connectivity by verifying SMTP connection
     * @returns {Promise<{status: string, message: string}>}
     */
    async verifyConnectivity() {
        if (!this.emailsEnabled) {
            return { status: 'disabled', message: 'Email service is disabled by configuration' };
        }

        try {
            const transport = createTransport(this.emailTransport);
            
            // Test SMTP connection by calling verify()
            // This will attempt to connect to the SMTP server and authenticate
            await transport.verify();
            
            return { status: 'healthy', message: 'Email service connectivity verified successfully' };
        } catch (error) {
            return { status: 'unhealthy', message: `Email service connectivity failed: ${error.message}` };
        }
    }

}

module.exports = {EmailService}
