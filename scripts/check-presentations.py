"""Open every curated source and reference in LibreOffice; inspect the rendered PDFs."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile


def run(args, timeout=120):
    return subprocess.run(args, capture_output=True, text=True, check=True, timeout=timeout,
                          env={**os.environ, 'SAL_USE_VCLPLUGIN': 'svp'})


def normalized(text):
    return ' '.join(text.split())


def main():
    root = Path('samples/13-1-files').resolve()
    output = Path('.cache/presentation-office').resolve()
    output.mkdir(parents=True, exist_ok=True)
    soffice = shutil.which('soffice') or shutil.which('libreoffice')
    if not soffice or not shutil.which('pdftotext') or not shutil.which('pdfimages') or not shutil.which('pdftoppm'):
        raise RuntimeError('Required: LibreOffice Writer/Impress and poppler-utils.')
    directories = sorted(path for path in root.iterdir() if path.is_dir())
    if len(directories) != 12:
        raise RuntimeError('Expected exactly twelve curated presentation sets.')
    sources, references, examples, checks_by_id = [], [], [], {}
    for directory in directories:
        manifest = json.loads((directory / 'manifest.json').read_text())
        if manifest['kind'] != 'curated':
            raise RuntimeError('Expected a curated manifest.')
        with zipfile.ZipFile(directory / 'dataset.zip') as archive:
            if archive.testzip() is not None or set(archive.namelist()) != {item['path'] for item in manifest['files']}:
                raise RuntimeError('ZIP integrity/composition mismatch.')
            for entry in manifest['files']:
                data = archive.read(entry['path'])
                if data != (directory / 'files' / entry['path']).read_bytes() or len(data) != entry['size'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                    raise RuntimeError('Dataset bytes/hash mismatch: ' + entry['path'])
        checks = json.loads((directory / 'files/reference/checks.json').read_text())
        identifier = checks['id']
        checks_by_id[identifier] = (checks, json.loads((directory / 'files/layout/slides.json').read_text()))
        source = output / (identifier + '-source.odt')
        reference = output / (identifier + '-reference.odp')
        shutil.copyfile(directory / 'files/source/material.odt', source)
        shutil.copyfile(directory / 'files/reference/answer.odp', reference)
        sources.append(source)
        references.append(reference)
        for score in [0, 1]:
            example = output / (identifier + '-score-' + str(score) + '.odp')
            shutil.copyfile(directory / ('files/examples/score-' + str(score) + '.odp'), example)
            examples.append((example, score + 1, checks['slides'][:score + 1]))
    profile = (output / 'profile').as_uri()
    for files, conversion in [(sources, 'txt:Text (encoded):UTF8'), (references + [path for path, _, _ in examples], 'pdf:impress_pdf_Export')]:
        result = run([soffice, '-env:UserInstallation=' + profile, '--headless', '--convert-to', conversion, '--outdir', str(output), *map(str, files)])
        print(result.stdout.strip(), flush=True)
    for identifier, (checks, layout) in checks_by_id.items():
        source_text = output / (identifier + '-source.txt')
        pdf = output / (identifier + '-reference.pdf')
        if not source_text.is_file() or source_text.read_text(encoding='utf-8-sig').strip().replace('\r\n', '\n').splitlines() != checks['sourceParagraphs']:
            raise RuntimeError('Writer source text differs: ' + identifier)
        if not pdf.is_file() or not pdf.read_bytes().startswith(b'%PDF-'):
            raise RuntimeError('Impress did not produce a PDF: ' + identifier)
        pages_text = run(['pdftotext', str(pdf), '-']).stdout.split('\f')
        if pages_text[-1].strip() or len(pages_text) != 4:
            raise RuntimeError('Expected three rendered slides: ' + identifier)
        bbox_path = output / (identifier + '-bbox.html')
        run(['pdftotext', '-bbox-layout', str(pdf), str(bbox_path)])
        pages = ET.parse(bbox_path).getroot().findall('.//{*}page')
        if len(pages) != 3:
            raise RuntimeError('Missing PDF pages: ' + identifier)
        image_counts = [0, 0, 0]
        for line in run(['pdfimages', '-list', str(pdf)]).stdout.splitlines():
            fields = line.split()
            if len(fields) > 3 and fields[0].isdigit() and fields[2] == 'image':
                image_counts[int(fields[0]) - 1] += 1
        for index, (expected, page, frames) in enumerate(zip(checks['slides'], pages, layout['slides'])):
            content = normalized(pages_text[index])
            for text in expected['text']:
                if normalized(text) not in content:
                    raise RuntimeError('Slide text missing/clipped: ' + identifier + ': ' + text)
            if image_counts[index] != expected['imageCount']:
                raise RuntimeError('Rendered image count differs: ' + identifier + ' page ' + str(index + 1) + ': ' + str(image_counts[index]) + ' expected ' + str(expected['imageCount']))
            factor = 72 / 2.54
            if abs(float(page.attrib['width']) - layout['page']['width'] * factor) > 1 or abs(float(page.attrib['height']) - layout['page']['height'] * factor) > 1:
                raise RuntimeError('Slide format differs: ' + identifier)
            boxes = [frame for frame in frames['frames'] if frame['kind'] == 'text']
            for word in page.findall('.//{*}word'):
                xmin, ymin, xmax, ymax = [float(word.attrib[key]) for key in ['xMin', 'yMin', 'xMax', 'yMax']]
                if ymax - ymin < 18 or not any(xmin >= box['x'] * factor - 2 and ymin >= box['y'] * factor - 2 and xmax <= (box['x'] + box['width']) * factor + 2 and ymax <= (box['y'] + box['height']) * factor + 2 for box in boxes):
                    raise RuntimeError('Text outside its frame or unexpectedly small: ' + identifier + ': ' + (word.text or '') + ' bbox=' + repr((xmin, ymin, xmax, ymax)) + ' frames=' + repr(boxes))
        run(['pdftoppm', '-scale-to', '960', '-png', str(pdf), str(output / identifier)])
    for path, count, slides in examples:
        pages = run(['pdftotext', str(path.with_suffix('.pdf')), '-']).stdout.split('\f')
        if len(pages) != count + 1 or pages[-1].strip():
            raise RuntimeError('Wrong rendered slide count in score example: ' + str(path))
        for text, slide in zip(pages, slides):
            if any(normalized(value) not in normalized(text) for value in slide['text']):
                raise RuntimeError('Missing text in rendered score example: ' + str(path))
    print('Impress: 12 sources, 12 complete references and 24 score examples opened; all 72 slides verified, complete references checked for images, geometry, fonts and text bounds.', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        message = str(error).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::error title=Curated presentation validation::' + message, flush=True)
        raise
