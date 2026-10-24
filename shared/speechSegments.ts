// Shared boundaries keep every audio segment authorized against the original saved reply.
export function speechSegments(text: string): string[] {
 const parts: string[] = []; let offset = 0; const limit = 1500;
 while (offset < text.length) {
  let end = Math.min(offset + limit, text.length);
  if (end < text.length) {
   const space = text.lastIndexOf(' ', end - 1);
   if (space > offset + limit / 2) end = space + 1;
   const last = text.charCodeAt(end - 1); if (last >= 0xD800 && last <= 0xDBFF) end--;
  }
  parts.push(text.slice(offset, end)); offset = end;
 }
 return parts;
}
