"""Independently inspect actual review ZIPs and solve their student-facing questions."""
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path, PurePosixPath
import re
import struct
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'docs/reviews/t3.15-files'


class Paragraphs(HTMLParser):
    def __init__(self, payload):
        super().__init__(convert_charrefs=True)
        self.blocks, self.tag, self.parts = [], None, []
        self.feed(payload.decode('utf-8'))

    def handle_starttag(self, tag, attrs):
        assert tag in ('html', 'head', 'meta', 'title', 'body', 'h1', 'h2', 'p')
        assert not any(key in ('href', 'src') or key.startswith('on') for key, _ in attrs)
        if tag in ('p', 'h2'):
            self.tag, self.parts = tag, []

    def handle_data(self, data):
        if self.tag:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag == self.tag:
            self.blocks.append((tag, ''.join(self.parts)))
            self.tag, self.parts = None, []


def tiff(payload):
    assert payload[:4] == b'II*\x00'
    position, = struct.unpack_from('<I', payload, 4)
    count, = struct.unpack_from('<H', payload, position)
    fields = {}
    for i in range(count):
        tag, kind, n, value = struct.unpack_from('<HHII', payload, position+2+i*12)
        assert tag not in fields and n == 1 and kind in (3, 4, 5)
        fields[tag] = value
    assert struct.unpack_from('<I', payload, position+2+count*12)[0] == 0
    width, height = fields[256], fields[257]
    assert 1 <= width <= 512 and 1 <= height <= 512
    assert fields[258] == 8 and fields[259] == 1 and fields[262] == 1 and fields[277] == 1
    offset, size = fields[273], fields[279]
    assert size == width * height and offset + size == len(payload)
    pixels = payload[offset:offset+size]
    assert max(pixels) - min(pixels) > 100 and len(set(pixels)) >= 5


def jpeg(payload):
    assert payload[:2] == b'\xff\xd8' and payload[-2:] == b'\xff\xd9'
    position, dimensions = 2, None
    while position < len(payload):
        assert payload[position] == 255
        marker = payload[position+1]
        size = int.from_bytes(payload[position+2:position+4], 'big')
        assert size >= 2 and position+2+size <= len(payload)
        if marker == 192:
            bits, height, width, channels = struct.unpack_from('>BHHB', payload, position+4)
            assert bits == 8 and channels == 3
            dimensions = width, height
        if marker == 218:
            break
        position += size + 2
    assert dimensions == (96, 72)


def reading(task, blocks):
    author, hero, episode = re.search(r'автора «([^»]+)» герой «([^»]+)» ([^.]+)\.', task['statement']).groups()
    results = []
    for path, document in blocks.items():
        if not path.startswith('Тексты/'+author+'/') or ('p', 'Автор: '+author+'.') not in document:
            continue
        context = []
        for tag, paragraph in document:
            if tag == 'h2':
                context = []
            else:
                context.append(paragraph)
                if hero+' '+episode+'.' not in paragraph:
                    continue
                adjective, speaker = re.search(r'«Это (\w+) труд», — сказал (\w+)\.', paragraph).groups()
                role, name = re.search(r'Местный (\w+) (\w+) встретил гостя', ' '.join(context)).groups()
                assert name == speaker
                question = task['statement']
                nickname = re.search(r'Щенка, бегавшего рядом, звали (\w+)\.', ' '.join(context)).group(1)
                results.append(nickname if 'Как звали щенка' in question else speaker if 'Какова фамилия' in question else role)
    assert len(results) == 1
    return results[0]


def selection(task, files):
    folders = [PurePosixPath(folder) for folder in re.findall(r'^- (.+)$', task['statement'], re.M)]
    extensions = set(re.findall(r'\.(?:htm|tiff|jpeg|pdf)\b', task['statement']))
    return str(sum(any(folder in path.parents for folder in folders) and path.suffix.lower() in extensions for path in map(PurePosixPath, files)))


def main():
    cases = json.loads((ROOT / 'answers.json').read_text())
    archives, parsed, formats = {}, {}, {'htm': 0, 'tiff': 0, 'jpeg': 0, 'pdf': 0}
    native_images = 0
    try:
        from PIL import Image
    except ImportError:
        Image = None
    for case in cases:
        archive_name = case['archive']
        if archive_name not in archives:
            data = (ROOT / archive_name).read_bytes()
            assert len(data) < 1_048_576
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                assert archive.testzip() is None
                assert len(set(archive.namelist())) == len(archive.namelist()) <= 100
                files = {name: archive.read(name) for name in archive.namelist()}
            archives[archive_name], parsed[archive_name] = files, {}
            for path, payload in files.items():
                kind = PurePosixPath(path).suffix[1:]
                if kind in formats:
                    formats[kind] += 1
                if kind == 'htm':
                    parsed[archive_name][path] = Paragraphs(payload).blocks
                elif kind == 'tiff':
                    tiff(payload)
                elif kind == 'jpeg':
                    jpeg(payload)
                elif kind == 'pdf':
                    with tempfile.NamedTemporaryFile(suffix='.pdf') as document:
                        document.write(payload)
                        document.flush()
                        text = subprocess.run(['pdftotext', document.name, '-'], check=True, capture_output=True).stdout.decode()
                    assert 'River observations' in text and 'Water level:' in text
                if Image is not None and kind in ('tiff', 'jpeg'):
                    with Image.open(io.BytesIO(payload)) as image:
                        image.load()
                        assert image.width > 0 and image.height > 0
                        native_images += 1
        files = archives[archive_name]
        manifest = json.loads((ROOT / case['manifest']).read_text())
        task = case['task']
        assert manifest['id'] == task['datasetId'] and manifest['seed'] == task['seed']
        assert set(files) == {entry['path'] for entry in manifest['files']}
        for entry in manifest['files']:
            payload = files[entry['path']]
            assert len(payload) == entry['size'] and hashlib.sha256(payload).hexdigest() == entry['sha256']
            assert entry['license'] == 'CC0-1.0'
        actual = reading(task, parsed[archive_name]) if task['taskNumber'] == 11 else selection(task, files)
        assert actual == task['answer']['value'], (task['id'], actual)
    assert len(cases) == 20 and len(archives) == 2
    assert len(archives['11/dataset.zip']) == 42 and len(archives['12/dataset.zip']) == 96
    reading_words = sum(len(re.findall(r'\w+', text)) for blocks in parsed['11/dataset.zip'].values() for _, text in blocks)
    print(json.dumps({'solved': len(cases), 'archives': len(archives), 'files': sum(map(len, archives.values())), 'formats': formats, 'reading_words': reading_words, 'native_image_decodes': native_images}, ensure_ascii=False))


if __name__ == '__main__':
    main()
