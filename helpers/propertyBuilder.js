function normalizeRelationId(idStr) {
  if (typeof idStr !== 'string') return null;
  let str = idStr.trim();
  if (!str) return null;

  // Handle Notion URLs: extract the last part
  if (str.includes('notion.so/') || str.startsWith('https://')) {
    try {
      const url = new URL(str.startsWith('http') ? str : `https://${str}`);
      str = url.pathname.split('/').pop();
    } catch {
      // Fallback if not a valid URL format but contains notion.so
      str = str.split('/').pop();
    }
  }

  // Remove query parameters if any
  str = str.split('?')[0];

  // Handle page titles in URL (e.g. view-name-1234567890abcdef1234567890abcdef)
  const dashParts = str.split('-');
  let possibleId = dashParts[dashParts.length - 1]; // last part is usually the 32-char ID

  if (possibleId && possibleId.length === 32) {
    str = possibleId;
  }

  // Strip dashes to normalize, Notion IDs are 32 hex chars
  const normalizedHex = str.replace(/-/g, '');
  
  if (normalizedHex.length === 32) {
    // Format as 8-4-4-4-12 UUID which Notion prefers
    return `${normalizedHex.slice(0, 8)}-${normalizedHex.slice(8, 12)}-${normalizedHex.slice(12, 16)}-${normalizedHex.slice(16, 20)}-${normalizedHex.slice(20)}`;
  }

  // If it's 36 chars with dashes and valid format, could just return it. The above handles that too.
  // If it does not look like a 32 char ID, return null to filter out invalid ids
  return null;
}

function propertyBuilder(type, value) {
  // Bỏ qua giá trị rỗng cho các type khác, nhưng relation array rỗng thì vẫn pass []
  if ((value === undefined || value === null || value === '') && type !== 'relation') return undefined;
  
  switch (type) {
    case 'title':
      return { title: [{ text: { content: String(value) } }] };
    case 'rich_text':
      return { rich_text: [{ text: { content: String(value) } }] };
    case 'number':
      return { number: Number(value) };
    case 'select':
      return { select: { name: String(value) } };
    case 'multi_select': {
      let items = [];
      if (Array.isArray(value)) {
        items = value;
      } else if (typeof value === 'string') {
        items = value.split(',').map(v => v.trim());
      }
      return { multi_select: items.map(v => ({ name: v })) };
    }
    case 'date': {
      if (typeof value === 'object' && value !== null) {
        return { date: { start: value.start, end: value.end } };
      }
      return { date: { start: String(value) } };
    }
    case 'checkbox':
      return { checkbox: Boolean(value) };
    case 'url':
      return { url: String(value) };
    case 'status':
      return { status: { name: String(value) } };
    case 'relation': {
      if (value === undefined || value === null || value === '') {
        return { relation: [] }; // Explicitly return empty relation
      }
      
      let ids = [];
      if (Array.isArray(value)) {
        ids = value;
      } else if (typeof value === 'string') {
        ids = value.split(',');
      }
      
      const normalizedIds = ids
        .map(id => normalizeRelationId(String(id)))
        .filter(Boolean); // Lọc bỏ giá trị null/không hợp lệ
        
      return { relation: normalizedIds.map(id => ({ id })) };
    }
    default:
      return undefined;
  }
}

module.exports = { propertyBuilder, normalizeRelationId };
