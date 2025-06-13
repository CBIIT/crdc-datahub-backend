function ConvertDateStringToDate(collectionName) {
  const collection = db.getCollection(collectionName);

  collection.find({
    $or: [
      { createdAt: { $type: "string" } },
      { updateAt: { $type: "string" } }
    ]
  }).forEach(doc => {
    const update = {};

    if (typeof doc.createdAt === "string") {
      const createdDate = new Date(doc.createdAt);
      if (!isNaN(createdDate.getTime())) {
        update.createdAt = createdDate;
      } else {
        print(`Invalid createdAt for _id ${doc._id}: ${doc.createdAt}`);
      }
    }

    if (typeof doc.updateAt === "string") {
      const updatedDate = new Date(doc.updateAt);
      if (!isNaN(updatedDate.getTime())) {
        update.updateAt = updatedDate;
      } else {
        print(`Invalid updatedAt for _id ${doc._id}: ${doc.updatedAt}`);
      }
    }

    if (Object.keys(update).length > 0) {
      collection.updateOne(
        { _id: doc._id },
        { $set: update }
      );
    }
  });

  print(`Finished converting date strings in ${collectionName}`);
}

ConvertDateStringToDate("users")