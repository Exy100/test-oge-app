"""Solve real CSVs independently, recalculate uncached formulas and inspect editable charts."""
from pathlib import Path
import csv
import hashlib
import io
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
import xml.etree.ElementTree as ET
NS={key:'urn:oasis:names:tc:opendocument:xmlns:'+value+':1.0' for key,value in [('table','table'),('office','office'),('text','text'),('chart','chart'),('draw','drawing'),('style','style')]}


def solve(rows,meta):
    kind=meta['kind']
    if kind=='sheet-count-range':
        selected=[r for r in rows if r[1]==meta['sex']]
        ordered=sorted(int(r[4]) for r in rows)
        values=[sum(r[2]==meta['group'] for r in selected),ordered[-1]-ordered[0]]
        chart=[sum(r[2]==status for r in selected) for status in ['пенсионер','студент','служащий']]
    elif kind=='sheet-sum-mean':
        distances=[int(r[3]) for r in rows if int(r[0].split()[0]) in range(meta['startDay'],meta['startDay']+3)]
        masses=[int(r[5]) for r in rows if r[1]==meta['group']]
        values=[sum(distances),(sum(masses)*10*2+len(masses))//(len(masses)*2)/10]
        chart=[sum(r[0]==str(day)+' октября' for r in rows) for day in [1,2,3]]
    elif kind=='sheet-count-mean':
        scores=[int(r[3]) for r in rows if int(r[1])==int(meta['group'])]
        values=[sum(int(r[2])==meta['grade'] and int(r[3])>meta['threshold'] for r in rows),(sum(scores)*100*2+len(scores))//(len(scores)*2)/100]
        chart=[sum(int(r[2])==grade for r in rows) for grade in [7,8,9]]
    else:raise RuntimeError('Unknown confirmed family')
    return values,chart


def uncached(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        content=ET.fromstring(archive.read('content.xml'));content.set('xmlns:of','urn:oasis:names:tc:opendocument:xmlns:of:1.2')
        count=0
        for cell in content.iter('{'+NS['table']+'}table-cell'):
            if '{'+NS['table']+'}formula' not in cell.attrib:continue
            count+=1
            cell.attrib.pop('{'+NS['office']+'}value',None);cell.attrib.pop('{'+NS['office']+'}value-type',None)
            for child in list(cell):cell.remove(child)
        if count!=5:raise RuntimeError('Expected two result and three chart formulas')
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_STORED) as changed:
            for entry in archive.infolist():changed.writestr(entry.filename,ET.tostring(content,encoding='utf-8',xml_declaration=True) if entry.filename=='content.xml' else archive.read(entry.filename))
        return output.getvalue()


def check_chart(data,labels,values):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        root=ET.fromstring(archive.read('Object1/content.xml'))
        chart=root.find('office:body/office:chart/chart:chart',NS)
        if chart.get('{'+NS['chart']+'}class')!='chart:circle' or chart.find('chart:legend',NS) is None:raise RuntimeError('Missing editable pie/legend')
        rows=chart.find('table:table',NS).findall('.//table:table-row',NS)[1:]
        texts=[''.join(row.findall('table:table-cell',NS)[0].itertext()) for row in rows]
        nums=[int(float(row.findall('table:table-cell',NS)[1].get('{'+NS['office']+'}value'))) for row in rows]
        if texts!=labels or nums!=values:raise RuntimeError('Chart data differ')
        props=root.findall('.//style:chart-properties',NS)
        if not any(p.get('{'+NS['chart']+'}data-label-number')=='value' for p in props):raise RuntimeError('Missing value labels')


def run(args):
    return subprocess.run(args,capture_output=True,text=True,check=True,timeout=120,env={**os.environ,'SAL_USE_VCLPLUGIN':'svp'})


def main():
    output=Path('.cache/spreadsheet-office').resolve();output.mkdir(parents=True,exist_ok=True)
    soffice=shutil.which('soffice') or shutil.which('libreoffice')
    if not soffice:raise RuntimeError('LibreOffice Calc required')
    directories=sorted(p for p in Path('samples/14-files').iterdir() if p.is_dir())
    if len(directories)!=12:raise RuntimeError('Expected twelve spreadsheet samples')
    fixtures=[];charts=[]
    for directory in directories:
        files=directory/'files';manifest=json.loads((directory/'manifest.json').read_text())
        with zipfile.ZipFile(directory/'dataset.zip') as archive:
            if archive.testzip() is not None or set(archive.namelist())!={f['path'] for f in manifest['files']}:raise RuntimeError('ZIP integrity differs')
            for e in manifest['files']:
                data=archive.read(e['path'])
                if data!=(files/e['path']).read_bytes() or len(data)!=e['size'] or hashlib.sha256(data).hexdigest()!=e['sha256']:raise RuntimeError('Bytes/hash differ')
        rows=list(csv.reader(io.StringIO((files/'source/data.csv').read_text()),delimiter=';'))
        meta=json.loads((files/'reference/answers.json').read_text());expected,chart=solve(rows[1:],meta)
        if expected!=meta['answers'] or chart!=meta['chart'] or len(rows)!=meta['rowCount']+1 or len(rows)!= (371 if meta['kind']=='sheet-sum-mean' else 1001):raise RuntimeError('Independent answers/data volume differ')
        check_chart((files/'reference/answer.ods').read_bytes(),meta['labels'],chart)
        for kind,path in [('source','source/data.ods'),('reference','reference/answer.ods')]:
            target=output/(directory.name+'-'+kind+'.ods');target.write_bytes((files/path).read_bytes() if kind=='source' else uncached((files/path).read_bytes()))
            fixtures.append((target,kind,rows,expected,chart))
        charts.append((output/(directory.name+'-reference.ods'),meta['labels'],chart))
    with tempfile.TemporaryDirectory(prefix='calc-profile-',dir=output) as profile:
        for start in range(0,len(fixtures),4):
            print(run([soffice,'-env:UserInstallation='+Path(profile).as_uri(),'--headless','--convert-to','csv:Text - txt - csv (StarCalc):44,34,76,1','--outdir',str(output),*[str(f[0]) for f in fixtures[start:start+4]]]).stdout.strip(),flush=True)
        for start in range(0,len(charts),4):
            print(run([soffice,'-env:UserInstallation='+Path(profile).as_uri(),'--headless','--convert-to','pdf:calc_pdf_Export','--outdir',str(output),*[str(p) for p,_,_ in charts[start:start+4]]]).stdout.strip(),flush=True)
    for target,kind,source,expected,chart in fixtures:
        rows=list(csv.reader(io.StringIO(target.with_suffix('.csv').read_text(encoding='utf-8-sig'))))
        columns=len(source[0])
        if len(rows)!=len(source) or [r[:columns] for r in rows]!=source:raise RuntimeError('Calc source cells differ: '+str(target))
        if kind=='reference' and ([float(rows[i][7]) for i in [1,2]]!=expected or [int(float(rows[i][10])) for i in [1,2,3]]!=chart):raise RuntimeError('Uncached formulas differ: '+str(target))
    for target,labels,values in charts:
        bbox=run(['pdftotext','-bbox-layout',str(target.with_suffix('.pdf')),'-']).stdout
        words=ET.fromstring(bbox).findall('.//{*}word')
        # Ignore the auxiliary data table above the chart: labels must also
        # render in the diagram itself, below its top edge.
        text=' '.join((w.text or '') for w in words if float(w.get('yMin'))>100)
        if any(label not in text or str(value) not in text for label,value in zip(labels,values)):raise RuntimeError('Rendered chart labels missing: '+str(target))
    # Every declared score has an actual editable office file; source values are read from its cells.
    for directory in sorted(Path('samples/office-scores/14').iterdir()):
        meta=json.loads((directory/'scores.json').read_text())
        for example in meta['examples']:
            with zipfile.ZipFile(directory/example['file']) as archive:
                root=ET.fromstring(archive.read('content.xml'));table=root.find('office:body/office:spreadsheet/table:table',NS)
                rows=table.findall('table:table-row',NS)
                actual=[float(rows[i].findall('table:table-cell',NS)[7].get('{'+NS['office']+'}value')) for i in [1,2]]
                score=sum(x==y for x,y in zip(actual,meta['answers']['values']))+int('Object1/content.xml' in archive.namelist())
                if score!=example['score']:raise RuntimeError('Score example differs')
                if score==3:check_chart((directory/example['file']).read_bytes(),meta['answers']['labels'],meta['answers']['chart'])
    print('Calc: 12 source/reference pairs, 60 uncached formulas, 24 numerical answers, 36 chart counts, 12 rendered editable pies and 12 score examples verified independently.',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('::error title=Spreadsheet validation::'+str(error).replace('%','%25').replace('\n','%0A'),flush=True)
        raise
