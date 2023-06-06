const express = require("express");
const config = require("../config");

const router = express.Router();
router.get("/ping", (req, res, next) => {
    res.send('pong');
});
router.get("/version", (req, res, next) => {
    res.json({
        version: config.version,
        date: config.date
    });
});

module.exports = router;
