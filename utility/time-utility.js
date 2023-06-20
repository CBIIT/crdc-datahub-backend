const moment = require('moment');
module.exports = {
    getCurrentTimeYYYYMMDDSS() {
        return moment().format('YYYY-MM-DDTHH:mm:ss');
    }
}