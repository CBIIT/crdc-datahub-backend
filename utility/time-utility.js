module.exports = {
    getCurrentTimeYYYYMMDDSS() {
        return new Date();
    },
    subtractDaysFromNow(days) {
        const currentDate = new Date();
        currentDate.setDate(currentDate.getDate() - days);
        return currentDate;
    },
    toISO(time) {
        return new Date(time).toISOString();
    }
}