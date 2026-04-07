function generateIcon(titleString) {
    if (!titleString || typeof titleString !== 'string') return { type: 'emoji', emoji: '📄' };
    
    const lower = titleString.toLowerCase();
    
    if (lower.match(/\b(test|qa|verify)\b/)) return { type: 'emoji', emoji: '✅' };
    if (lower.match(/\b(bug|fix|error)\b/)) return { type: 'emoji', emoji: '🐞' };
    if (lower.match(/\b(auth|security|jwt|rbac)\b/)) return { type: 'emoji', emoji: '🔐' };
    if (lower.match(/\b(api|backend|server|controller|route)\b/)) return { type: 'emoji', emoji: '🛠️' };
    if (lower.match(/\b(db|schema|model|mongo)\b/)) return { type: 'emoji', emoji: '🗄️' };
    if (lower.match(/\b(docker|infra|deploy|env)\b/)) return { type: 'emoji', emoji: '🐳' };
    if (lower.match(/\b(ui|ux|design)\b/)) return { type: 'emoji', emoji: '🎨' };
    
    return { type: 'emoji', emoji: '📄' };
}

module.exports = { generateIcon };
