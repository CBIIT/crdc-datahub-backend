function formatName(userInfo){
    if (!userInfo) return "";
    let firstName = userInfo?.firstName || "";
    let lastName = userInfo?.lastName || "";
    lastName = lastName.trim();
    return firstName + (lastName.length > 0 ? " "+lastName : "");
}

function splitName(userName) {
    const parts = String(userName || "").trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return ["", ""];
    }
    if (parts.length === 1) {
        return [parts[0], ""];
    }

    return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

module.exports = {
    formatName,
    splitName
}