
function getListDifference(listA, listB) {
    if (!listA || !Array.isArray(listA)) {
        throw new Error(`First list parameter must be an array but was ${listA}`);
    }
    if (!listB || !Array.isArray(listB)) {
        throw new Error(`Second list parameter must be an array but was ${listB}`);
    }
    return listA.filter((listItem) => !listB.includes(listItem));
}

module.exports = {
    getListDifference
}
