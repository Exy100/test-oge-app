"""Open the generated sample in LibreOffice and check its converted content."""
import csv
import io
import hashlib
import zipfile
import xml.etree.ElementTree as ET
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path('.cache/dataset-sample').resolve()
manifest = json.loads((root / 'manifest.json').read_text())
with zipfile.ZipFile(root / 'dataset.zip') as archive:
    if archive.testzip() is not None:
        raise RuntimeError('Outer ZIP CRC check failed.')
    if set(archive.namelist()) != {entry['path'] for entry in manifest['files']}:
        raise RuntimeError('Archive file list differs from manifest.')
    for entry in manifest['files']:
        data = archive.read(entry['path'])
        if len(data) != entry['size'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
            raise RuntimeError('Manifest size/hash mismatch: ' + entry['path'])
        if data != (root / entry['path']).read_bytes():
            raise RuntimeError('Archive differs from standalone file.')
        if entry['format'] in ('odt', 'odp', 'ods'):
            with zipfile.ZipFile(io.BytesIO(data)) as odf:
                first = odf.infolist()[0]
                if first.filename != 'mimetype' or first.compress_type != zipfile.ZIP_STORED or first.extra or odf.testzip() is not None:
                    raise RuntimeError('Invalid ODF ZIP packaging.')
                for name in ['content.xml', 'styles.xml', 'META-INF/manifest.xml']:
                    ET.fromstring(odf.read(name))
reference = json.loads((root / 'reference/ответ.json').read_text())
expected_text = (root / 'texts/условие.txt').read_text().strip()
soffice = shutil.which('soffice') or shutil.which('libreoffice')
pdftotext = shutil.which('pdftotext')
if not soffice or not pdftotext:
    raise SystemExit('Required: LibreOffice Writer/Calc/Impress and poppler-utils.')
with tempfile.TemporaryDirectory(prefix='office-check-', dir=root.parent) as temp:
    output = Path(temp)
    profile = (output / 'profile').as_uri()
    def convert(source, format_name, extension):
        result = subprocess.run([
            soffice, '-env:UserInstallation=' + profile, '--headless',
            '--convert-to', format_name, '--outdir', str(output), str(source)
        ], capture_output=True, text=True, timeout=60,
           env={**os.environ, 'SAL_USE_VCLPLUGIN': 'gen'})
        target = output / (source.stem + extension)
        if result.returncode or not target.is_file() or target.stat().st_size == 0:
            raise RuntimeError('LibreOffice conversion failed: ' + result.stdout + result.stderr)
        return target
    text = convert(root / 'document/описание.odt', 'txt:Text (encoded):UTF8', '.txt')
    actual_text = text.read_text(encoding='utf-8-sig').strip().replace('\r\n', '\n')
    if actual_text != expected_text:
        raise RuntimeError('ODT text differs from source: ' + repr(actual_text))
    sheet = convert(root / 'tables/цены.ods', 'csv:Text - txt - csv (StarCalc):44,34,76,1', '.csv')
    rows = list(csv.reader(io.StringIO(sheet.read_text(encoding='utf-8-sig'))))
    if rows[0] != ['Товар', 'Цена'] or [int(row[1]) for row in rows[1:]] != reference['prices']:
        raise RuntimeError('ODS cells differ from source.')
    if sum(int(row[1]) for row in rows[1:]) != reference['total']:
        raise RuntimeError('ODS total differs from reference.')
    pdf = convert(root / 'presentation/обзор.odp', 'pdf:impress_pdf_Export', '.pdf')
    if not pdf.read_bytes().startswith(b'%PDF-'):
        raise RuntimeError('Impress did not produce a PDF.')
    extracted = subprocess.run([pdftotext, str(pdf), '-'], capture_output=True, text=True, check=True, timeout=30).stdout
    if extracted.count('\f') != 2:
        raise RuntimeError('Expected exactly two presentation pages.')
    for text in expected_text.splitlines() + ['Работа с данными', 'Открой таблицу и вычисли сумму цен.']:
        if text not in extracted:
            raise RuntimeError('ODP slide text missing: ' + text)
print('LibreOffice: ODT text, ODS cells and totals, ODP slide text verified.')
