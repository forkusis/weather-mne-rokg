/**
 * Parse a JSON-like JavaScript literal (array/object) without eval / new Function.
 * Supports: objects, arrays, numbers, double-quoted strings, true, false, null.
 * Enough for ZHMS posljednje / stanice extracts.
 */

export function parseJsLiteral(input: string): unknown {
  const s = input.trim();
  let i = 0;

  function skipWs() {
    while (i < s.length && /[\s,]/.test(s[i]!)) i++;
  }

  function parseValue(): unknown {
    skipWs();
    if (i >= s.length) throw new Error("Unexpected end");
    const c = s[i]!;
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === "\"") return parseString();
    if (c === "-" || (c >= "0" && c <= "9")) return parseNumber();
    if (s.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (s.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (s.startsWith("null", i)) {
      i += 4;
      return null;
    }
    throw new Error(`Unexpected at ${i}: ${s.slice(i, i + 20)}`);
  }

  function parseObject(): Record<string, unknown> {
    i++; // {
    const obj: Record<string, unknown> = {};
    skipWs();
    if (s[i] === "}") {
      i++;
      return obj;
    }
    while (i < s.length) {
      skipWs();
      if (s[i] !== "\"") throw new Error("Object key must be string");
      const key = parseString();
      skipWs();
      if (s[i] !== ":") throw new Error("Expected :");
      i++;
      const val = parseValue();
      obj[key] = val;
      skipWs();
      if (s[i] === "}") {
        i++;
        break;
      }
      if (s[i] === ",") {
        i++;
        continue;
      }
      throw new Error("Expected , or }");
    }
    return obj;
  }

  function parseArray(): unknown[] {
    i++; // [
    const arr: unknown[] = [];
    skipWs();
    if (s[i] === "]") {
      i++;
      return arr;
    }
    while (i < s.length) {
      arr.push(parseValue());
      skipWs();
      if (s[i] === "]") {
        i++;
        break;
      }
      if (s[i] === ",") {
        i++;
        continue;
      }
      throw new Error("Expected , or ]");
    }
    return arr;
  }

  function parseString(): string {
    i++; // "
    let out = "";
    while (i < s.length) {
      const c = s[i]!;
      if (c === "\"") {
        i++;
        return out;
      }
      if (c === "\\") {
        i++;
        const n = s[i]!;
        if (n === "n") out += "\n";
        else if (n === "t") out += "\t";
        else if (n === "r") out += "\r";
        else out += n;
        i++;
        continue;
      }
      out += c;
      i++;
    }
    throw new Error("Unclosed string");
  }

  function parseNumber(): number {
    const start = i;
    if (s[i] === "-") i++;
    while (i < s.length && s[i]! >= "0" && s[i]! <= "9") i++;
    if (s[i] === ".") {
      i++;
      while (i < s.length && s[i]! >= "0" && s[i]! <= "9") i++;
    }
    if (s[i] === "e" || s[i] === "E") {
      i++;
      if (s[i] === "+" || s[i] === "-") i++;
      while (i < s.length && s[i]! >= "0" && s[i]! <= "9") i++;
    }
    const n = Number(s.slice(start, i));
    if (Number.isNaN(n)) throw new Error("Bad number");
    return n;
  }

  const value = parseValue();
  skipWs();
  if (i < s.length) throw new Error(`Trailing junk at ${i}`);
  return value;
}
