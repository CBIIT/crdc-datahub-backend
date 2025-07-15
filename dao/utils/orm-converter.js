// Only convert ISO format strings
// Covers:
// - ISO date only: 2023-12-25
// - ISO 8601 with Z timezone: 2023-12-25T10:30:00.000Z
// - ISO 8601 with timezone offset: 2023-12-25T10:30:00.000+05:30 or 2023-12-25T10:30:00.000-05:30
// - ISO 8601 without timezone: 2023-12-25T10:30:00.000
// - All formats with or without milliseconds (.000)
const isoPattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

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

  // Convert _id fields to id fields in the final result
  return convertIdFields(prismaFilter);
}

function tryConvertDate(val) {
  if (typeof val !== 'string') {
    return val;
  }

  const isIsoFormat = isoPattern.test(val);
  
  if (!isIsoFormat) {
    return val; // Not in ISO format
  }

  // Try to parse the date
  const parsedDate = new Date(val);
  
  // Check if the parsed date is valid and not NaN
  if (isNaN(parsedDate.getTime())) {
    return val; // Invalid date
  }

  return parsedDate;
}

module.exports = {
    convertIdFields,
    convertMongoFilterToPrismaFilter,
    tryConvertDate
};