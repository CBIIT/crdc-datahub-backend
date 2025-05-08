function getUnmappedStudies() {
    let result = db.organization.aggregate([
            {
                $unwind:
                /**
                 * path: Path to the array field.
                 * includeArrayIndex: Optional name for index.
                 * preserveNullAndEmptyArrays: Optional
                 *   toggle to unwind null and empty values.
                 */
                    {
                        path: "$studies"
                    }
            },
            {
                $group:
                /**
                 * _id: The id of the group.
                 * fieldN: The first field name.
                 */
                    {
                        _id: "id",
                        studies: {
                            $addToSet: "$studies._id"
                        }
                    }
            }
    ]).next();
    let mappedStudies = result?.studies || [];
    result = db.approvedStudies.aggregate([
        {
            $match: {
                _id: {
                    $nin: mappedStudies
                }
            }
        },
        {
            $group:{
                _id: "studies",
                studies: {
                    $addToSet: "$_id"
                }
            }
        }
    ]).next();
    let unmappedStudies = result?.studies || [];
    console.log(`Found ${unmappedStudies.length} unique unmapped studies`);
    return unmappedStudies
}
function addStudiesToNAProgram(initialNaProgram) {
    let unmappedStudies = getUnmappedStudies();
    let naProgram = db.organization.findOne({_id: initialNaProgram._id});
    if (!naProgram) {
        naProgram = initialNaProgram;
    }
    naProgram.studies = naProgram.studies || [];
    unmappedStudies.forEach(studyId => {
        naProgram.studies.push({"_id": studyId});
    });
    db.organization.replaceOne({_id: naProgram._id}, naProgram, {upsert: true});
    console.log(`${unmappedStudies.length} studies mapped to NA program.`);
}
let initialNaProgram = {
    "_id": "437e864a-621b-40f5-b214-3dc368137081",
    "name": "NA",
    "abbreviation": "NA",
    "description": "This is a catch-all place for all studies without a program associated.",
    "status": "Active",
    "bucketName": "crdc-hub-dev-submission",
    "rootPath": "437e864a-621b-40f5-b214-3dc368137081",
    "createdAt": {
        "$date": "2025-05-06T00:00:00.000Z"
    },
    "updateAt": {
        "$date": "2025-05-06T00:00:00.000Z"
    },
    "studies": [],
    "readOnly": true
};
addStudiesToNAProgram(initialNaProgram);