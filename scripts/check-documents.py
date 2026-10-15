"""Validate all curated Writer datasets, actual tables/styles and rendered A4 pages."""
from pathlib import Path
import hashlib
import itertools
import json
import os
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile

NS = {key: 'urn:oasis:names:tc:opendocument:xmlns:' + value + ':1.0'
      for key, value in [('office', 'office'), ('text', 'text'), ('table', 'table'),
                         ('style', 'style'), ('fo', 'xsl-fo-compatible')]}


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=120,
                          env={**os.environ, 'SAL_USE_VCLPLUGIN': 'svp'})


def attr(node, namespace, name):
    return node.attrib.get('{' + NS[namespace] + '}' + name)


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def paragraph_text(node):
    result = node.text or ''
    for child in node:
        if child.tag == '{' + NS['text'] + '}s':
            result += ' ' * int(attr(child, 'text', 'c') or '1')
        else:
            result += paragraph_text(child)
        result += child.tail or ''
    return result


def validate_structure(path, expected):
    with zipfile.ZipFile(path) as archive:
        content = ET.fromstring(archive.read('content.xml'))
        styles = ET.fromstring(archive.read('styles.xml'))
    body = content.find('office:body/office:text', NS)
    require(body is not None, 'Missing Writer body: ' + str(path))
    paragraphs = body.findall('text:p', NS)
    require([paragraph_text(p) for p in paragraphs] == [expected['title'], *expected['paragraphs'],
            'Учебный идентификатор: ' + expected['id']], 'Paragraph content differs: ' + str(path))
    require([attr(p, 'text', 'style-name') for p in paragraphs] == ['Title', 'Body', 'Body', 'Note'],
            'Paragraph style assignments differ: ' + str(path))
    tables = body.findall('table:table', NS)
    require(len(tables) == 1, 'Expected one real table: ' + str(path))
    rows = tables[0].findall('.//table:table-row', NS)
    require([[paragraph_text(cell.find('text:p', NS)) for cell in row.findall('table:table-cell', NS)]
            for row in rows] == [expected['headers'], *expected['rows']], 'Table data differs: ' + str(path))
    require(len(tables[0].findall('table:table-column', NS)) == len(expected['headers']), 'Column count differs')
    for index, row in enumerate(rows):
        for cell in row.findall('table:table-cell', NS):
            require(attr(cell, 'table', 'style-name') == ('HeaderCell' if index == 0 else 'DataCell'), 'Cell style differs')
            require(attr(cell.find('text:p', NS), 'text', 'style-name') == ('Head' if index == 0 else 'Cell'), 'Cell paragraph style differs')
    defs = {attr(s, 'style', 'name'): s for s in styles.findall('.//style:style', NS)}
    auto = {attr(s, 'style', 'name'): s for s in content.findall('.//style:style', NS)}
    f = expected['format']
    page = styles.find('.//style:page-layout-properties', NS)
    for key, value in [('page-width', '21cm'), ('page-height', '29.7cm'), ('margin', '2cm')]:
        require(attr(page, 'fo', key) == value, 'A4 page/margins differ')
    require(attr(page, 'style', 'print-orientation') == 'portrait', 'Page orientation differs')
    for name, size, align in [('Title', 18, f['titleAlign']), ('Body', f['bodySize'], f['bodyAlign']),
                              ('Head', 12, 'center'), ('Cell', 12, 'start'), ('Note', 10, 'end')]:
        text = defs[name].find('style:text-properties', NS)
        props = defs[name].find('style:paragraph-properties', NS)
        require(attr(text, 'fo', 'font-family') == 'DejaVu Serif' and attr(text, 'fo', 'font-size') == str(size) + 'pt', 'Font differs: ' + name)
        require(attr(props, 'fo', 'text-align') == align, 'Alignment differs: ' + name)
    for name in ['Title', 'Head']:
        require(attr(defs[name].find('style:text-properties', NS), 'fo', 'font-weight') == 'bold', 'Bold style missing')
    require(attr(defs['Note'].find('style:text-properties', NS), 'fo', 'font-style') == 'italic', 'Italic style missing')
    props = defs['Body'].find('style:paragraph-properties', NS)
    require(attr(props, 'fo', 'text-indent') == str(f['indent']) + 'cm', 'First line indent differs')
    require(attr(props, 'fo', 'line-height') == str(f['lineHeight']) + '%', 'Line spacing differs')
    for name, key, value in [('Title', 'margin-bottom', '0.5cm'), ('Body', 'margin-bottom', '0.3cm'), ('Note', 'margin-top', '0.4cm')]:
        require(attr(defs[name].find('style:paragraph-properties', NS), 'fo', key) == value, 'Paragraph spacing differs')
    for index, width in enumerate(f['widths']):
        require(attr(auto['Col' + str(index)].find('style:table-column-properties', NS), 'style', 'column-width') == str(width) + 'cm', 'Column width differs')
    grid = auto['Grid'].find('style:table-properties', NS)
    require(attr(grid, 'style', 'width') == '17cm' and attr(grid, 'table', 'align') == 'left' and attr(grid, 'fo', 'margin-top') == '0.3cm', 'Table geometry differs')
    for name in ['HeaderCell', 'DataCell']:
        props = auto[name].find('style:table-cell-properties', NS)
        require(attr(props, 'fo', 'padding') == '0.15cm' and attr(props, 'fo', 'border') == '0.5pt solid #263238', 'Table borders/padding differ')
    require(attr(auto['HeaderCell'].find('style:table-cell-properties', NS), 'fo', 'background-color') == f['headerColor'], 'Header shading differs')


def normalize(text):
    return ' '.join(text.split())


def validate_pdf(path, expected, output):
    require(path.is_file() and path.read_bytes().startswith(b'%PDF-'), 'Writer PDF missing: ' + str(path))
    bbox = output / (path.stem + '-bbox.html')
    run(['pdftotext', '-bbox-layout', str(path), str(bbox)])
    pages = ET.parse(bbox).getroot().findall('.//{*}page')
    require(len(pages) == 1, 'Expected one page: ' + str(path))
    page = pages[0]
    factor = 72 / 2.54
    require(abs(float(page.attrib['width']) - 21 * factor) < 1 and abs(float(page.attrib['height']) - 29.7 * factor) < 1, 'Rendered A4 differs')
    words = page.findall('.//{*}word')
    for word in words:
        x0, y0, x1, y1 = [float(word.attrib[key]) for key in ['xMin', 'yMin', 'xMax', 'yMax']]
        require(x0 >= 2 * factor - 2 and x1 <= 19 * factor + 2 and y0 >= 2 * factor - 2 and y1 <= 27.7 * factor + 2, 'Rendered word outside margins: ' + (word.text or ''))
        require(y1 - y0 >= 8, 'Unexpectedly small rendered font')
    rendered = normalize(run(['pdftotext', '-layout', str(path), '-']).stdout)
    for text in [expected['title'], *expected['paragraphs'], 'Учебный идентификатор: ' + expected['id']]:
        require(normalize(text) in rendered, 'Rendered text missing: ' + text)
    # Each cell must be inside its real rendered column, on a common row baseline.
    starts = [2 * factor]
    for width in expected['format']['widths']:
        starts.append(starts[-1] + width * factor)
    previous_bottom = 0
    for row in [expected['headers'], *expected['rows']]:
        cell_options = []
        for index, cell in enumerate(row):
            own = sorted([word for word in words
                          if float(word.attrib['xMin']) >= starts[index] - 1
                          and float(word.attrib['xMax']) <= starts[index + 1] + 1
                          and float(word.attrib['yMin']) > previous_bottom],
                         key=lambda word: (round(float(word.attrib['yMin']), 1), float(word.attrib['xMin'])))
            tokens = cell.split()
            matches = [own[offset:offset + len(tokens)] for offset in range(len(own) - len(tokens) + 1)
                       if [word.text for word in own[offset:offset + len(tokens)]] == tokens]
            require(bool(matches), 'Cell not rendered inside its column: ' + cell)
            options = []
            for match in matches:
                top = min(float(word.attrib['yMin']) for word in match)
                bottom = max(float(word.attrib['yMax']) for word in match)
                if bottom - top < 45:
                    options.append((top, bottom))
            cell_options.append(options)
        candidates = []
        for boxes in itertools.product(*cell_options):
            centres = [(top + bottom) / 2 for top, bottom in boxes]
            if max(centres) - min(centres) < 2 and min(top for top, _ in boxes) > previous_bottom:
                candidates.append(boxes)
        require(bool(candidates), 'Table rows overlap or cells shifted: ' + str(path) + ': ' + repr(row))
        boxes = min(candidates, key=lambda row_boxes: min(top for top, _ in row_boxes))
        previous_bottom = max(bottom for _, bottom in boxes)
    run(['pdftoppm', '-scale-to', '1100', '-png', str(path), str(output / path.stem)])


def main():
    output = Path('.cache/document-office').resolve()
    output.mkdir(parents=True, exist_ok=True)
    soffice = shutil.which('soffice') or shutil.which('libreoffice')
    require(bool(soffice) and bool(shutil.which('pdftotext')) and bool(shutil.which('pdftoppm')), 'Required: LibreOffice Writer and poppler-utils.')
    directories = sorted(path for path in Path('samples/13-2-files').iterdir() if path.is_dir())
    require(len(directories) == 12, 'Expected twelve document sets')
    sources, formatted = [], []
    seen = set()
    for directory in directories:
        manifest = json.loads((directory / 'manifest.json').read_text())
        require(manifest['kind'] == 'curated' and manifest['generatorVersion'] == 'curated-documents-v1', 'Wrong document manifest')
        with zipfile.ZipFile(directory / 'dataset.zip') as archive:
            require(archive.testzip() is None and set(archive.namelist()) == {entry['path'] for entry in manifest['files']}, 'ZIP composition/CRC differs')
            for entry in manifest['files']:
                data = archive.read(entry['path'])
                require(data == (directory / 'files' / entry['path']).read_bytes() and len(data) == entry['size'] and hashlib.sha256(data).hexdigest() == entry['sha256'], 'Dataset hash/bytes differ: ' + entry['path'])
        checks = json.loads((directory / 'files/reference/checks.json').read_text())
        identifier = checks['id']
        require(identifier not in seen, 'Duplicate document identifier')
        seen.add(identifier)
        source = output / (identifier + '-source.odt')
        shutil.copyfile(directory / 'files/source/material.odt', source)
        sources.append((source, checks['sourceParagraphs']))
        for kind, original, expected in [('sample', 'layout/sample.odt', checks['sample']), ('reference', 'reference/answer.odt', checks['reference'])]:
            target = output / (identifier + '-' + kind + '.odt')
            shutil.copyfile(directory / 'files' / original, target)
            validate_structure(target, expected)
            formatted.append((target, expected))
    profile = (output / 'profile').as_uri()
    for files, conversion in [([path for path, _ in sources], 'txt:Text (encoded):UTF8'), ([path for path, _ in formatted], 'pdf:writer_pdf_Export')]:
        # Remove prior results so stale output cannot conceal a failed conversion.
        for path in files:
            path.with_suffix('.txt' if conversion.startswith('txt') else '.pdf').unlink(missing_ok=True)
        result = run([soffice, '-env:UserInstallation=' + profile, '--headless', '--convert-to', conversion, '--outdir', str(output), *map(str, files)])
        print(result.stdout.strip(), flush=True)
    for path, paragraphs in sources:
        require(path.with_suffix('.txt').read_text(encoding='utf-8-sig').strip().splitlines() == paragraphs, 'Source text differs: ' + str(path))
    for path, expected in formatted:
        validate_pdf(path.with_suffix('.pdf'), expected, output)
    print('LibreOffice: all 12 sources, 12 samples and 12 references opened; 24 A4 pages, all table cells, columns, margins and formatting verified.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error title=Curated document validation::' + message, flush=True)
        raise
