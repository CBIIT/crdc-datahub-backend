db.release.updateMany(
  { entityType: { $type: "array" } }, // only where it's an array
  [
    {
      $set: {
        entityType: { $arrayElemAt: ["$entityType", 0] } // take first element
      }
    }
  ]
)