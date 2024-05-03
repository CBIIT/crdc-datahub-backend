class ValidationHandler {
    constructor(status = true, errorMessage = null) {
        this.success =  status;
        this.message = errorMessage?.toString();
    }

    static handle(errorMessage) {
        const msg = Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage;
        return new ValidationHandler(false, msg);
    }

    static success(msg) {
        return msg ? new ValidationHandler(true, msg) : new ValidationHandler();
    }
}

module.exports = {
    ValidationHandler
}