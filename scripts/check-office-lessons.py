"""Independently open lesson exports in Writer, Impress and Calc, including uncached formulas."""
from collections import Counter
import csv
import io
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile


def run(args):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=120,
                          env={**os.environ, 'SAL_USE_VCLPLUGIN': 'svp'})


def words(value):
    return Counter(re.findall(r'\w+|[^\w\s]', value))


def main():
    root = Path('.cache/office-lessons').resolve()
    meta = json.loads((root / 'checks.json').read_text())
    office = shutil.which('soffice') or shutil.which('libreoffice')
    if not office:
        raise RuntimeError('LibreOffice is required for lesson export checks')
    output = root / 'converted'
    output.mkdir(exist_ok=True)
    # Remove caches from formula cells so Calc must perform the computation.
    for case in meta['cases']:
        source = root / (case['id'] + '.ods')
        with zipfile.ZipFile(source) as archive:
            entries = {name: archive.read(name) for name in archive.namelist()}
        xml = entries['content.xml'].decode()
        xml, count = re.subn(r'<table:table-cell\b[^>]*\btable:formula="[^"]*"[^>]*>.*?</table:table-cell>',
                            lambda m: re.sub(r' office:value="[^"]*"', '', m[0].split('>')[0]) + '/>', xml)
        if count != 2:
            raise RuntimeError('Expected two actual formulas')
        entries['content.xml'] = xml.encode()
        target = root / ('uncached-' + source.name)
        with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
    with tempfile.TemporaryDirectory(prefix='office-profile-', dir=root) as profile:
        prefix = [office, '-env:UserInstallation=' + Path(profile).as_uri(), '--headless']
        for extension, format_name in [('odt', 'pdf:writer_pdf_Export'), ('odp', 'pdf:impress_pdf_Export'), ('ods', 'csv:Text - txt - csv (StarCalc):44,34,76,1')]:
            files = [root / (d['id'] + '.' + extension) for d in meta['documents' if extension == 'odt' else 'slides']] if extension != 'ods' else [root / ('uncached-' + case['id'] + '.ods') for case in meta['cases']]
            print(run([*prefix, '--convert-to', format_name, '--outdir', str(output), *map(str, files)]).stdout.strip(), flush=True)
        print(run([*prefix, '--convert-to', 'pdf:calc_pdf_Export', '--outdir', str(output), *[str(root / (case['id'] + '.ods')) for case in meta['cases']]]).stdout.strip(), flush=True)
    for item in meta['documents']:
        pdf = output / (item['id'] + '.pdf')
        text = run(['pdftotext', str(pdf), '-']).stdout
        # PDF extraction may interleave adjacent table cells or justified words.
        # XML tests check cell order; the rendered page must retain every token.
        if words(' '.join(item['text'])) != words(text):
            raise RuntimeError('Writer lost document text: ' + item['id'])
        if text.count('\f') != 1:
            raise RuntimeError('Writer document must fit one page: ' + item['id'])
    for item in meta['slides']:
        text = run(['pdftotext', str(output / (item['id'] + '.pdf')), '-']).stdout
        pages = text.split('\f')
        if len(pages) != 4:
            raise RuntimeError('Expected three Impress slides: ' + item['id'])
        for page, expected in zip(pages, item['text']):
            if words(' '.join(expected)) != words(page):
                raise RuntimeError('Impress lost or clipped slide text: ' + item['id'])
    data = meta['rows'][1:]
    school = [row for row in data if row[1] == 1]
    mean = sum(row[3] for row in school) / len(school)
    expected = {'sum': sum(row[3] for row in data),
                'count': len([row for row in data if row[2] == 7 and row[3] > 200]),
                'selected-sum': sum(row[3] for row in school)}
    counts = [len([row for row in data if row[2] == grade]) for grade in (7, 8, 9)]
    for case in meta['cases']:
        rows = list(csv.reader(io.StringIO((output / ('uncached-' + case['id'] + '.csv')).read_text(encoding='utf-8-sig'))))
        if [[str(v) for v in row] for row in meta['rows']] != [row[:4] for row in rows]:
            raise RuntimeError('Calc changed source data')
        if not math.isclose(float(rows[1][7]), expected[case['id']], abs_tol=1e-8) or not math.isclose(float(rows[2][7]), mean, abs_tol=1e-8):
            raise RuntimeError('Calc uncached formula differs: ' + case['id'])
        if [int(rows[i][10]) for i in (1, 2, 3)] != counts:
            raise RuntimeError('Calc chart data differ')
        with zipfile.ZipFile(root / (case['id'] + '.ods')) as archive:
            chart = archive.read('Object1/content.xml')
            if b'chart:legend' not in chart or b'chart:data-label-number="value"' not in chart:
                raise RuntimeError('Editable chart is missing labels or legend')
        text = run(['pdftotext', '-bbox-layout', str(output / (case['id'] + '.pdf')), '-']).stdout
        pdf_words = ET.fromstring(text).findall('.//{*}word')
        chart_text = ' '.join((word.text or '') for word in pdf_words if float(word.get('yMin')) > 100 and float(word.get('xMin')) > 360)
        if any(str(value) not in chart_text or str(grade) + ' класс' not in chart_text for grade, value in zip((7, 8, 9), counts)):
            raise RuntimeError('Rendered chart labels are missing')
    print('Lesson exports: 3 Writer pages, 9 Impress slides, 6 uncached Calc formulas, source cells and 3 editable rendered pies verified.', flush=True)


if __name__ == '__main__':
    main()
