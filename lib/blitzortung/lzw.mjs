/**
 * LZW decompression, as used by the Blitzortung websocket feed.
 *
 * The server ships each JSON message through an LZW encoder whose dictionary
 * codes are emitted as UTF-16 code units: any code unit below 256 is a literal
 * character, anything at or above 256 is a dictionary reference. Because codes
 * are written with `String.fromCharCode`, they never exceed 0xFFFF, so the
 * stream is walked one code unit at a time.
 */
export function lzwDecode(input) {
  if (input.length === 0)
    return '';
  const dictionary = new Map();
  let nextCode = 256;
  let previous = input.charAt(0);
  const out = [previous];
  for (let i = 1; i < input.length; i++) {
    const code = input.charCodeAt(i);
    // A literal, a known dictionary entry, or the classic "KwKwK" case where
    // the encoder referenced the entry it is about to define.
    const entry = code < 256 ? input.charAt(i) : dictionary.get(code) ?? previous + previous.charAt(0);
    out.push(entry);
    dictionary.set(nextCode++, previous + entry.charAt(0));
    previous = entry;
  }
  return out.join('');
}
/**
 * LZW compression matching {@link lzwDecode}. Not needed to consume the feed;
 * kept so the codec can be round-tripped in tests.
 *
 * Only Latin-1 input round-trips: the format reserves code units at or above
 * 256 for dictionary references, so a literal character above U+00FF cannot be
 * expressed. The server's JSON is ASCII, so this never affects decoding.
 */
export function lzwEncode(input) {
  if (input.length === 0)
    return '';
  const dictionary = new Map();
  let nextCode = 256;
  const out = [];
  let current = input.charAt(0);
  for (let i = 1; i < input.length; i++) {
    const char = input.charAt(i);
    const candidate = current + char;
    if (dictionary.has(candidate)) {
      current = candidate;
    }
    else {
      out.push(current.length > 1 ? dictionary.get(current) : current.charCodeAt(0));
      dictionary.set(candidate, nextCode++);
      current = char;
    }
  }
  out.push(current.length > 1 ? dictionary.get(current) : current.charCodeAt(0));
  return out.map((code) => String.fromCharCode(code)).join('');
}
