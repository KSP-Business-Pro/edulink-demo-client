declare module 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm' {
  export function read(data: ArrayBuffer, opts: { type: string }): { SheetNames: string[]; Sheets: Record<string, unknown> };
  export const utils: { sheet_to_json: (ws: unknown, opts?: { defval?: unknown }) => Record<string, string>[] };
}