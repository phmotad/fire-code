// Strips <private>...</private> blocks and # private: lines from content
// before it is sent to any LLM provider or stored as searchable observation.

const PRIVATE_BLOCK_RE = /<private>[\s\S]*?<\/private>/gi;
const PRIVATE_LINE_RE = /^.*#\s*private:.*$/gim;
const PRIVATE_ANNOTATION_RE = /\/\/\s*@private.*$/gim;

export function stripPrivate(text: string): string {
  return text
    .replace(PRIVATE_BLOCK_RE, '[redacted]')
    .replace(PRIVATE_LINE_RE, '# [redacted]')
    .replace(PRIVATE_ANNOTATION_RE, '// [redacted]')
    .trim();
}

export function hasPrivateContent(text: string): boolean {
  return (
    PRIVATE_BLOCK_RE.test(text) ||
    PRIVATE_LINE_RE.test(text) ||
    PRIVATE_ANNOTATION_RE.test(text)
  );
}

export function isPrivateFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes('.env') ||
    lower.includes('secrets') ||
    lower.includes('credentials') ||
    lower.includes('.key') ||
    lower.includes('.pem') ||
    lower.endsWith('.cert')
  );
}

// Sanitize content before indexing or sending to LLM
export function sanitizeForLLM(content: string, filePath?: string): string {
  if (filePath && isPrivateFile(filePath)) return '[file redacted — private path]';
  return stripPrivate(content);
}
