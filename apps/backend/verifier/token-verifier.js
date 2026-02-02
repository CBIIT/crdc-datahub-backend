const jwt = require("jsonwebtoken");

const verifyToken = (token , tokenSecret) => {
    let isValid = false;
    jwt.verify(token, tokenSecret, (error, _) => {
        if (!error) isValid = true;
    });
    return isValid;
}

const decodeToken = (token, tokenSecret) => {
    let userInfo;
    jwt.verify(token, tokenSecret, (error, encoded) => {
        userInfo = error ? {} : encoded;
    });
    return userInfo;
}

module.exports = {
    decodeToken,
    verifyToken
};