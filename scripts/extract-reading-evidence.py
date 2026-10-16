"""Extract short public-domain narrative evidence, not official question statements."""
import hashlib
from html.parser import HTMLParser
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('exam_source', ROOT / 'scripts/extract-exam-data.py')
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)


class Text(HTMLParser):
    def __init__(self, payload):
        super().__init__(convert_charrefs=True)
        self.data, self.hidden = [], 0
        try:
            text = payload.decode('utf-8-sig')
        except UnicodeDecodeError:
            text = payload.decode('cp1251')
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden -= 1

    def handle_data(self, data):
        if not self.hidden:
            self.data.append(data)


def main():
    chekov = 'Проза/Чехов/Чехов Антон Павлович - Полное собрание рассказов.htm'
    gogol = 'Проза/Гоголь/Мертвые души.pdf'
    evidence, previous_hashes = [], None
    for year in [2025, 2026, 2027]:
        archive = ROOT / f'.cache/fipi/inf_9_{year}.zip'
        assert hashlib.sha256(archive.read_bytes()).hexdigest() == source.ARCHIVE_HASHES[year]
        with zipfile.ZipFile(archive) as book:
            files = dict(source.dataset(book, 11))
        hashes = {path: hashlib.sha256(files[path]).hexdigest() for path in [chekov, gogol]}
        assert previous_hashes is None or hashes == previous_hashes
        previous_hashes = hashes
        if year == 2026:
            member, response = gogol, 'character'
            with tempfile.NamedTemporaryFile(suffix='.pdf') as pdf:
                pdf.write(files[member])
                pdf.flush()
                text = subprocess.run(['pdftotext', '-layout', pdf.name, '-'], check=True, capture_output=True).stdout.decode()
            text = re.sub(r'(?<=[а-яё])-\s*\n\s*(?=[а-яё])', '', text, flags=re.I)
            text = re.sub(r'\s+', ' ', text)
            at = text.index('разбойница')
            speaker = text.rfind('Плюшкина', 0, at)
            start = text.rfind('. ', 0, speaker) + 2
            excerpt = text[start:text.index('?', at)+1]
        else:
            member, response = chekov, 'nickname' if year == 2025 else 'role'
            text = re.sub(r'\s+', ' ', ' '.join(Text(files[member]).data))
            pattern = r'Щенок Тщетный, взятый «приучаться»,[^.]+\.' if year == 2025 else r'Елдырин, – обращается надзиратель к городовому, –[^.]+\.'
            excerpt = re.search(pattern, text).group(0)
        evidence.append({'fixtureId': f'D{year}-11', 'year': year, 'member': member, 'sha256': hashes[member], 'response': response, 'excerpt': excerpt})
    target = ROOT / 'tests/fixtures/exam/data/reading-evidence.json'
    target.write_text(json.dumps(evidence, ensure_ascii=False, indent=2)+'\n')
    print('Extracted three reading excerpts; original source hashes agree across 2025–2027.')


if __name__ == '__main__':
    main()
