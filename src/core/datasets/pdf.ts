/** One-page passive PDF profile, using embedded ASCII text and the standard Helvetica font. */
const encoder = new TextEncoder(),
  decoder = new TextDecoder('ascii', { fatal: true });
function literal(text: string): string {
  if (!/^[\x20-\x7e]{1,100}$/u.test(text))
    throw new Error('Недопустимый текст PDF.');
  return text.replace(/[()\\]/gu, (char) => '\\' + char);
}
export function makePdf(lines: readonly string[]): Uint8Array {
  if (!lines.length || lines.length > 20)
    throw new Error('Недопустимое число строк PDF.');
  const stream = `BT\n/F1 12 Tf\n40 760 Td\n16 TL\n${lines.map((line, i) => `${i ? 'T*\n' : ''}(${literal(line)}) Tj`).join('\n')}\nET\n`,
    objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      `<< /Length ${String(stream.length)} >>\nstream\n${stream}endstream`,
    ];
  let text = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(text.length);
    text += `${String(i + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join(
      '',
    )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF\n`;
  return encoder.encode(text);
}
export function readPdf(bytes: Uint8Array): readonly string[] {
  if (bytes.length > 10000 || bytes.some((byte) => byte > 127))
    throw new Error('PDF не соответствует текстовому профилю.');
  const text = decoder.decode(bytes),
    rows = [...text.matchAll(/^\(((?:[^()\\\n]|\\[()\\])+)\) Tj$/gmu)].map(
      (row) => (row[1] ?? '').replace(/\\([()\\])/gu, '$1'),
    );
  const canonical = makePdf(rows);
  if (
    canonical.length !== bytes.length ||
    !canonical.every((byte, i) => byte === bytes[i])
  )
    throw new Error('Повреждён или не поддерживается PDF.');
  return rows;
}
