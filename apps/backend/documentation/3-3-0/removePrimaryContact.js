// Use the appropriate database
// use crdc-datahub;

function removePrimaryContactSubmission() {
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> removing primary contact - submissions`);

    const cursor = db.submissions.aggregate([
        {
            $lookup: {
                from: "users",
                let: {
                    email: "$conciergeEmail",
                    name: "$conciergeName"
                },
                pipeline: [
                    {
                        $addFields: {
                            fullName: {
                                $trim: {
                                    input: {
                                        $concat: [
                                            { $ifNull: ["$firstName", ""] },
                                            " ",
                                            { $ifNull: ["$lastName", ""] }
                                        ]
                                    }
                                }
                            }
                        }
                    },
                    {
                        $match: {
                            $expr: {
                                $and: [
                                    { $eq: ["$email", "$$email"] },
                                    { $eq: ["$fullName", "$$name"] },
                                    { $ne: ["$role", "User"] }
                                ]
                            }
                        }
                    }
                ],
                as: "matchedUser"
            }
        },
        {
            $match: {
                status: { $ne: "Completed" },
                matchedUser: { $ne: [] }
            }
        },
        {
            $project: { _id: 1 }
        }
    ]);

    const ids = cursor.map(doc => doc._id);

    let matched = 0;
    let updated = 0;
    ids.forEach(id => {
        const res = db.submissions.updateOne(
            { _id: id },
            {
                $set: {
                    conciergeName: "",
                    conciergeEmail: "",
                    updatedAt: new Date()
                }
            }
        );
        if (res.matchedCount > 0) {
            matched += res.matchedCount;
        }

        if (res.modifiedCount > 0) {
            updated += res.modifiedCount
        }
    });
    console.log(`Matched Records: ${matched}`);
    console.log(`Updated Records: ${updated}`);
    print("Done submission----------------------");
    print("\n");
}

function removePrimaryContactProgram() {
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> removing primary contact - program`);

    // Step 1: Find users who are NOT "DC" and have a conciergeID reference
    // Step 1: Find users who are NOT "DC" and have a conciergeID reference
    const matchedUsers = db.users.find({ role: { $ne: "Data Commons Personnel" } }, { _id: 1 }).toArray();
    const matchedUserIDs = matchedUsers.map(user => user._id);

// Step 2: Update all organizations with matching conciergeID
    const res = db.organization.updateMany(
        { conciergeID: { $in: matchedUserIDs } },
        {
            $set: {
                conciergeID: "",
                conciergeName: "",
                conciergeEmail: "",
                updateAt: new Date()
            }
        }
    );
    console.log(`Matched Records: ${res.matchedCount}`);
    console.log(`Updated Records: ${res.modifiedCount}`);
    print("Done program----------------------");
    print("\n");
}


function removePrimaryContactStudy() {
    print("\n");
    print("----------------------");
    console.log(`${new Date()} -> removing primary contact - study`);

    const matchedUsers = db.users.find({ role: { $ne: "Data Commons Personnel" } }, { _id: 1 }).toArray();
    const matchedUserIDs = matchedUsers.map(user => user._id);

// Step 2: Update all organizations with matching conciergeID
    const res = db.approvedStudies.updateMany(
        { primaryContactID: { $in: matchedUserIDs } },
        {
            $set: {
                primaryContactID: null,
                updatedAt: new Date()
            }
        }
    );
    console.log(`Matched Records: ${res.matchedCount}`);
    console.log(`Updated Records: ${res.modifiedCount}`);
    print("Done study----------------------");
    print("\n");
}


removePrimaryContactSubmission();
removePrimaryContactStudy();
removePrimaryContactProgram();

