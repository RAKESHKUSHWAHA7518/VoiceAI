import path from 'path';
// A single storage location works identically from source and compiled builds.
export const dataPath = (...parts: string[]) => path.join(path.resolve(process.env.VOICEAI_DATA_DIR || path.join(process.cwd(), 'server/data')), ...parts);
