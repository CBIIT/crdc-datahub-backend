 // Convert _id fields to id
function convertIdFields(obj) {
    if (Array.isArray(obj)) {
        return obj.map(convertIdFields);
    } else if (obj instanceof Date) {
        return obj; // ✅ preserve Date object
    } else if (obj && typeof obj === 'object') {
        const newObj = {};
        for (const key in obj) {
        const value = obj[key];
        if (key === '_id') {
            newObj['id'] = convertIdFields(value);
        } else {
            newObj[key] = convertIdFields(value);
        }
        }
        return newObj;
    } else {
        return obj;
    }
}

function convertMongoFilterToPrismaFilter(mongoFilter) {
  if (!mongoFilter || typeof mongoFilter !== 'object') return mongoFilter;

  const operatorMap = {
    $eq: 'equals',
    $in: 'in',
    $nin: 'notIn',
    $lt: 'lt',
    $lte: 'lte',
    $gt: 'gt',
    $gte: 'gte',
    $ne: 'not'
  };

  const prismaFilter = {};

  for (const key in mongoFilter) {
    const value = mongoFilter[key];

    if (operatorMap[key]) {
      // Handle date conversion if value is ISO string
      prismaFilter[operatorMap[key]] = Array.isArray(value)
        ? value.map(v => tryConvertDate(v))
        : tryConvertDate(value);
    } else if (key === '$not' && typeof value === 'object') {
      prismaFilter['not'] = convertMongoFilterToPrismaFilter(value);
    } else {
      // Assume field name (e.g. createdAt: { $gt: ... })
      prismaFilter[key] = convertMongoFilterToPrismaFilter(value);
    }
  }

  return prismaFilter;
}

function tryConvertDate(val) {
  if (typeof val === 'string' && !isNaN(Date.parse(val))) {
    return new Date(val);
  }
  return val;
}

module.exports = {
    convertIdFields,
    convertMongoFilterToPrismaFilter
};