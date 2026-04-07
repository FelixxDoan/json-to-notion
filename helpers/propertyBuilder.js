function propertyBuilder(type, value) {
  if (value === undefined || value === null || value === '') return undefined;
  
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
      let ids = [];
      if (Array.isArray(value)) {
        ids = value;
      } else if (typeof value === 'string') {
        ids = value.split(',').map(v => v.trim());
      }
      return { relation: ids.map(id => ({ id })) };
    }
    default:
      return undefined;
  }
}

module.exports = { propertyBuilder };
