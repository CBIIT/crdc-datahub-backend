class ValidationHandler {
    constructor(status = true, errorMessage = null) {
        this.success =  status;
        this.message = errorMessage?.toString();
    }

    static handle(errorMessage) {
        const msg = Array.isArray(errorMessage) ? errorMessage.join('\n') : errorMessage;
        return new ValidationHandler(false, msg);
    }

    static success() {
        return new ValidationHandler();
    }
}

module.exports = {
    ValidationHandler
}