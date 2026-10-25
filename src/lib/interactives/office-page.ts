const ns =
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"';
export function pageStyles(width: number, height: number, margin: number) {
  return `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${ns} office:version="1.3"><office:styles/><office:automatic-styles><style:page-layout style:name="pm1"><style:page-layout-properties fo:page-width="${String(width)}cm" fo:page-height="${String(height)}cm" fo:margin="${String(margin)}cm" style:print-orientation="${width > height ? 'landscape' : 'portrait'}"/></style:page-layout></office:automatic-styles><office:master-styles><style:master-page style:name="Default" style:page-layout-name="pm1"/></office:master-styles></office:document-styles>`;
}
