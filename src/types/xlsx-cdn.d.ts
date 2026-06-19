// Declaration pour import xlsx depuis CDN jsdelivr
declare module 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm' {
  const read: (data: ArrayBuffer, opts: { type: string }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
  const utils: { sheet_to_json: (ws: unknown, opts?: { defval?: unknown }) => Record<string, string>[] };
  export { read, utils };
  export default { read, utils };
}