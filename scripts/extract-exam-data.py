"""Extract data, never statements, from locally downloaded official FIPI archives.

Usage: python3 scripts/extract-exam-data.py
The original archives/PDFs stay in ignored .cache/fipi. No network access.
"""
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / 'tests/fixtures/exam/data'
YEARS = [2025, 2026, 2027]
ARCHIVE_HASHES = {
    2025: '33102039c6f1c73d87da4e261b01391c7d127033f544413a952aba1408104b61',
    2026: '4a8dbaf2c73b2e756730b393f5ea9377f5db56fe6d14fd172fd2d88029737447',
    2027: 'a21e76159262999e149551451326821a6a527259c730db5ad17e6e27b0464d46',
}
NS = {'table': 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
      'office': 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
      'text': 'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def section(name, number):
    return f'/{number} задание/' in name or f'/{number}_задание/' in name


def dataset(archive, number):
    """2025 ships nested ZIPs; later editions ship the expanded catalogues."""
    result = []
    for item in archive.infolist():
        if item.is_dir() or not section(item.filename, number):
            continue
        if item.filename.lower().endswith('.zip'):
            with zipfile.ZipFile(io.BytesIO(archive.read(item))) as inner:
                for child in inner.infolist():
                    if child.is_dir():
                        continue
                    name = child.filename
                    if not child.flag_bits & 0x800:
                        # Some Python runtimes already honour the Unicode path extra field.
                        if not any('\u0400' <= char <= '\u04ff' for char in name):
                            name = name.encode('cp437').decode('cp866')
                    result.append((name, inner.read(child)))
        else:
            marker = f'{number} задание/' if f'{number} задание/' in item.filename else f'{number}_задание/'
            result.append((item.filename.split(marker, 1)[1], archive.read(item)))
    return sorted(result)


def ods_rows(data, year):
    with zipfile.ZipFile(io.BytesIO(data)) as ods:
        document = ET.fromstring(ods.read('content.xml'))
    sheet = document.find('.//table:table', NS)
    if sheet is None:
        raise ValueError('No source sheet')
    records = []
    for row in sheet.findall('table:table-row', NS):
        values = []
        for cell in row:
            repeat = int(cell.get(f'{{{NS["table"]}}}number-columns-repeated', '1'))
            if len(values) >= 6 or repeat > 100:
                break
            value = cell.get(f'{{{NS["office"]}}}value')
            if value is None:
                value = ''.join(cell.itertext()).strip()
            values.extend([value] * repeat)
        if len(values) < 4:
            continue
        if year == 2026:
            if values[0].endswith(' октября'):
                records.append(values[:6])
        elif values[0].lower().startswith('участник '):
            records.append(values[1:5] if year == 2025 else values[1:4])
    expected = 370 if year == 2026 else 1000
    if len(records) != expected:
        raise ValueError(f'{year}: expected {expected} records, found {len(records)}')
    return records


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    reports = []
    for year in YEARS:
        raw = (ROOT / f'.cache/fipi/inf_9_{year}.zip').read_bytes()
        if digest(raw) != ARCHIVE_HASHES[year]:
            raise ValueError(f'{year}: unexpected archive checksum')
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            report = {'year': year, 'url': f'https://doc.fipi.ru/oge/demoversii-specifikacii-kodifikatory/{year}/inf_9_{year}.zip',
                      'archiveBytes': len(raw), 'archiveSha256': digest(raw), 'documents': []}
            for item in archive.infolist():
                if item.filename.endswith(('_ДЕМО.pdf', '_СПЕЦ.pdf')):
                    report['documents'].append({'member': item.filename, 'bytes': item.file_size, 'sha256': digest(archive.read(item))})
            for number in [11, 12]:
                files = dataset(archive, number)
                metadata = [{'path': name, 'size': len(data), 'sha256': digest(data)} for name, data in files]
                report[f'task{number}'] = {'files': len(files), 'bytes': sum(len(data) for _, data in files),
                                          'maxFileBytes': max(len(data) for _, data in files)}
                # Names, sizes and hashes only. Never redistribute the books or images.
                if number == 12:
                    (DEST / f'files-{year}.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
            sources = dataset(archive, 14)
            name, data = next((name, data) for name, data in sources if PurePosixPath(name).suffix == '.ods')
            rows = ods_rows(data, year)
            output = io.StringIO(newline='')
            writer = csv.writer(output, lineterminator='\n')
            writer.writerow(['gender', 'status', 'left', 'right'] if year == 2025 else ['date', 'from', 'to', 'distance', 'fuel', 'mass'] if year == 2026 else ['school', 'class', 'score'])
            writer.writerows(rows)
            csv_data = output.getvalue().encode('utf-8')
            (DEST / f'table-{year}.csv').write_bytes(csv_data)
            report['task14'] = {'member': name, 'bytes': len(data), 'sha256': digest(data), 'rows': len(rows), 'projectionSha256': digest(csv_data)}
            reports.append(report)
    (DEST / 'sources.json').write_text(json.dumps(reports, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for report in reports:
        print(report['year'], '11:', report['task11'], '12:', report['task12'], '14 rows:', report['task14']['rows'])


if __name__ == '__main__':
    main()
