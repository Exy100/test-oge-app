"""Reproducible blind source review: solve CSV queries before opening reference answers."""
from pathlib import Path
import csv
import hashlib
import importlib.util
import json
import random
import re
import xml.etree.ElementTree as ET
import zipfile
import sys
sys.dont_write_bytecode = True

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('spreadsheet_review',ROOT/'scripts/check-spreadsheets.py')
solver=importlib.util.module_from_spec(spec);spec.loader.exec_module(solver)
rng=random.Random(20261017)
report={'seed':20261017,'kind':'agent-source-review; not human subject review','presentation':[],'document':[],'spreadsheet':[]}
for branch,folder in [('presentation','13-1-files'),('document','13-2-files')]:
    for number in sorted(rng.sample(range(1,13),10)):
        files=ROOT/'samples'/folder/f'{number:02}'/'files'
        assignment=(files/'assignment.txt').read_text()
        with zipfile.ZipFile(files/'source/material.odt') as archive:
            root=ET.fromstring(archive.read('content.xml'))
            paragraphs=[''.join(p.itertext()) for p in root.findall('.//{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p')]
        if branch=='presentation':
            layout=json.loads((files/'layout/slides.json').read_text())
            counts=[sum(f['kind']=='image' for f in s['frames']) for s in layout['slides']]
            assert counts==[0,2,3]
            plan=['Три слайда 16:9, без анимации; название и идентификатор на титуле.',
                  'Перенести два смысловых блока и два изображения на второй слайд по макету.',
                  'Три подписи и три изображения на третьем; единый шрифт 40/24/20, проверить пропорции и края.']
        else:
            fmt=json.loads((files/'layout/format.json').read_text())
            assert fmt['bodySize']==14 and fmt['indent']==1 and fmt['widths']==[7,8]
            plan=['Набрать заголовок прописными буквами; основной текст 14 пт по ширине, первая строка 1 см.',
                  'Повторить порядок текста и таблицы и выделения по PDF; интервалы свойствами абзаца.',
                  'Два столбца 7/8 см, таблица по центру, объединить строки разделов по образцу; сохранить ODT.']
        report[branch].append({'set':('P' if branch=='presentation' else 'D')+f'{number:02}','title':paragraphs[0],
                              'sourceWords':len(' '.join(paragraphs).split()),'assignmentSha256':hashlib.sha256(assignment.encode()).hexdigest(),
                              'solutionPlanFromInputs':plan})
for number in sorted(rng.sample(range(1,13),10)):
    files=ROOT/'samples/14-files'/f'{number:02}'/'files'
    assignment=(files/'assignment.txt').read_text()
    with (files/'source/data.csv').open() as handle: source=list(csv.reader(handle,delimiter=';'))
    query={}
    if 'пол' in source[0]:
        sex,group=re.search('полом «([^»]+)» и статусом «([^»]+)»',assignment).groups()
        query={'kind':'sheet-count-range','sex':sex,'group':group}
    elif 'Дата' in source[0]:
        start=int(re.search(r'перевозок с (\d+) по',assignment).group(1))
        group=re.search('из пункта «([^»]+)»',assignment).group(1)
        query={'kind':'sheet-sum-mean','startDay':start,'group':group}
    else:
        grade,threshold=map(int,re.search(r'из (\d) класса набрали более (\d+)',assignment).groups())
        group=re.search(r'школы №(\d+)',assignment).group(1)
        query={'kind':'sheet-count-mean','grade':grade,'threshold':threshold,'group':group}
    values,chart=solver.solve(source[1:],query)
    # First access to the hidden reference occurs only after both values and all chart counts exist.
    reference=json.loads((files/'reference/answers.json').read_text())
    assert values==reference['answers'] and chart==reference['chart']
    report['spreadsheet'].append({'sample':number,'queryFromStatement':query,'rows':len(source)-1,'values':values,'chart':chart,'referenceAgrees':True})
output=ROOT/'docs/reviews/t3.16-student-check.json'
output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('Reviewed 10 presentation/document inputs each; independently solved 10 spreadsheet CSVs before opening answers. Human subject review remains pending.')
