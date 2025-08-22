function formatName(userInfo){
    if (!userInfo) return "";
    let firstName = userInfo?.firstName || "";
    let lastName = userInfo?.lastName || "";
    lastName = lastName.trim();
    return firstName + (lastName.length > 0 ? " "+lastName : "");
}

module.exports = {
    formatName
}