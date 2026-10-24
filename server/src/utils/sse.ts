import { StringDecoder } from 'string_decoder';

/** Network chunks are arbitrary byte boundaries, including inside UTF-8 codepoints. */
export async function* completeSSEFrames(stream: AsyncIterable<Buffer | string>): AsyncGenerator<string> {
  const decoder = new StringDecoder('utf8');
  let buffer = '';
  for await (const chunk of stream) {
    buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
    if (buffer.length > 1024 * 1024) throw new Error('Provider stream exceeded the frame limit');
    let boundary: RegExpExecArray | null;
    while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
      yield buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary[0].length);
    }
  }
  buffer += decoder.end();
  if (buffer.trim()) yield buffer;
}
