function buildContentBlocks(contentData, keyName) {
    const blocks = [];

    if (keyName) {
        blocks.push({
            object: 'block', type: 'heading_2',
            heading_2: { rich_text: [{ type: 'text', text: { content: keyName } }] }
        });
    }
    
    if (Array.isArray(contentData)) {
        // Structured block array
        for (const item of contentData) {
            if (item.type === 'paragraph') {
                blocks.push({
                    object: 'block', type: 'paragraph',
                    paragraph: { rich_text: [{ type: 'text', text: { content: String(item.content) } }] }
                });
            } else if (item.type === 'heading_1' || item.type === 'heading_2' || item.type === 'heading_3') {
                blocks.push({
                    object: 'block', type: item.type,
                    [item.type]: { rich_text: [{ type: 'text', text: { content: String(item.content) } }] }
                });
            } else if (item.type === 'to_do') {
                blocks.push({
                    object: 'block', type: 'to_do',
                    to_do: { rich_text: [{ type: 'text', text: { content: String(item.content) } }], checked: !!item.checked }
                });
            } else if (item.type === 'bulleted_list_item') {
                blocks.push({
                    object: 'block', type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ type: 'text', text: { content: String(item.content) } }] }
                });
            } else if (item.type === 'code') {
                blocks.push({
                    object: 'block', type: 'code',
                    code: { rich_text: [{ type: 'text', text: { content: String(item.content) } }], language: item.language || 'plain text' }
                });
            }
        }
    } else {
        // Flat string, fallback parsing markdown lines
        const lines = String(contentData).split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('- [ ]') || trimmed.startsWith('[ ]')) {
                const prefixLen = trimmed.startsWith('- [ ]') ? 5 : 3;
                blocks.push({
                    object: 'block', type: 'to_do',
                    to_do: { rich_text: [{ type: 'text', text: { content: trimmed.substring(prefixLen).trim() } }], checked: false }
                });
            } else if (trimmed.startsWith('- [x]') || trimmed.startsWith('[x]') || trimmed.startsWith('- [X]') || trimmed.startsWith('[X]')) {
                const prefixLen = trimmed.startsWith('-') ? 5 : 3;
                blocks.push({
                    object: 'block', type: 'to_do',
                    to_do: { rich_text: [{ type: 'text', text: { content: trimmed.substring(prefixLen).trim() } }], checked: true }
                });
            } else if (trimmed.startsWith('# ')) {
                blocks.push({
                    object: 'block', type: 'heading_1',
                    heading_1: { rich_text: [{ type: 'text', text: { content: trimmed.substring(2).trim() } }] }
                });
            } else if (trimmed.startsWith('## ')) {
                blocks.push({
                    object: 'block', type: 'heading_2',
                    heading_2: { rich_text: [{ type: 'text', text: { content: trimmed.substring(3).trim() } }] }
                });
            } else if (trimmed.startsWith('- ')) {
                 blocks.push({
                    object: 'block', type: 'bulleted_list_item',
                    bulleted_list_item: { rich_text: [{ type: 'text', text: { content: trimmed.substring(2).trim() } }] }
                });
            }
            else if (trimmed !== '') {
                blocks.push({
                    object: 'block', type: 'paragraph',
                    paragraph: { rich_text: [{ type: 'text', text: { content: line } }] }
                });
            }
        }
    }
    
    return blocks;
}

module.exports = { buildContentBlocks };
