const moment = require('moment');
const timeFormat = 'YYYY-MM-DDTHH:mm:ss';
module.exports = {
    getCurrentTimeYYYYMMDDSS() {
        return moment().format(timeFormat);
    },
    subtractDaysFromNow(days) {
        const currentDate = moment(); // Current date and time
        return currentDate.subtract(days, 'days').format(timeFormat);
    }
}