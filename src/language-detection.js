import { loadModule } from 'cld3-asm';

let cldIdentifier = null;

export async function initLanguageDetector() {
  const factory = await loadModule();
  cldIdentifier = factory.create(0, 1000);
}

export function detectLanguage(text) {
  if (!text?.trim() || !cldIdentifier) return null;
  try {
    const result = cldIdentifier.findLanguage(text);
    if (!result.is_reliable || result.language === 'und') return null;
    return result.language;
  } catch {
    return null;
  }
}
