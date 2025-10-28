function formatName(userInfo) {
    if (!userInfo) return "";
    let firstName = userInfo?.firstName || "";
    let lastName = userInfo?.lastName || "";
    lastName = lastName.trim();
    return firstName + (lastName.length > 0 ? " " + lastName : "");
}

async function setFullName() {
    const cursor = db.users.find({});
    let successCount = 0;
    let failed = [];

    while (await cursor.hasNext()) {
        const user = await cursor.next();
        const fullName = formatName(user);
        try {
            const result = await db.users.updateOne(
                { _id: user._id, fullName: {$exists: false}},
                { $set: { fullName } }
            );

            if (result.modifiedCount === 1) {
                console.log(`✅ Updated user ${user._id} -> fullName: "${fullName}"`);
                successCount++;
            }

        } catch (err) {
            console.error(`❌ Failed for user ${user._id}:`, err.message);
            failed.push({ id: user._id, error: err.message });
        }
    }

    console.log(`\nMigration finished.`);
    console.log(`✅ Success: ${successCount}`);
    if (failed.length > 0) {
        console.log(`❌ Failed: ${failed.length}`);
    }

    if (failed.length > 0) {
        console.log(`\nFailed users:`);
        console.log(JSON.stringify(failed, null, 2));
    }
}
setFullName()