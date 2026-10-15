"""Independently solve every sample and force Calc to recalculate uncached formulas."""
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
NS={'table':'urn:oasis:names:tc:opendocument:xmlns:table:1.0','office':'urn:oasis:names:tc:opendocument:xmlns:office:1.0','text':'urn:oasis:names:tc:opendocument:xmlns:text:1.0'}

def solve(rows,meta):
    values=[]
    for _,group,left,right in rows:
        left,right=int(left),int(right)
        if group!=meta['group']: continue
        if meta['kind']=='sheet-filter' and left<meta['threshold']:continue
        if meta['kind']=='sheet-growth' and right<=left:continue
        values.append(left*right if meta['kind']=='sheet-revenue' else left+right if meta['kind']=='sheet-group' else right-left if meta['kind']=='sheet-growth' else right)
    if not values:raise RuntimeError('Empty selection')
    total=sum(values)
    middle=((total*100*2+len(values))//(len(values)*2))/100 if meta['kind']=='sheet-group' else total
    return [len(values),middle,max(values)]

def main():
    root=Path('samples/14-files')
    output=Path('.cache/spreadsheet-office').resolve();output.mkdir(parents=True,exist_ok=True)
    soffice=shutil.which('soffice') or shutil.which('libreoffice')
    if not soffice:raise RuntimeError('LibreOffice Calc required')
    fixtures=[]
    directories=sorted(p for p in root.iterdir() if p.is_dir())
    if len(directories)!=12:raise RuntimeError('Expected twelve spreadsheet samples')
    for directory in directories:
        files=directory/'files';manifest=json.loads((directory/'manifest.json').read_text())
        with zipfile.ZipFile(directory/'dataset.zip') as archive:
            if archive.testzip() is not None or set(archive.namelist())!={f['path'] for f in manifest['files']}:raise RuntimeError('ZIP integrity mismatch')
            for entry in manifest['files']:
                data=archive.read(entry['path'])
                if data!=(files/entry['path']).read_bytes() or len(data)!=entry['size'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise RuntimeError('File/hash mismatch')
        rows=list(csv.reader(io.StringIO((files/'source/data.csv').read_text()),delimiter=';'))
        meta=json.loads((files/'reference/answers.json').read_text())
        expected=solve(rows[1:],meta)
        if expected!=meta['answers'] or len(rows)!=241:raise RuntimeError('Independent answers/range mismatch')
        for kind,original in [('source','source/data.ods'),('reference','reference/answer.ods')]:
            target=output/(directory.name+'-'+kind+'.ods')
            if kind=='source':shutil.copyfile(files/original,target)
            else:
                with zipfile.ZipFile(files/original) as archive:
                    content=ET.fromstring(archive.read('content.xml'))
                    content.set('xmlns:of','urn:oasis:names:tc:opendocument:xmlns:of:1.2')
                    table=content.find('office:body/office:spreadsheet/table:table',NS)
                    actual_rows=table.findall('table:table-row',NS)
                    if len(actual_rows)!=241:raise RuntimeError('Reference row count differs')
                    formula_count=0
                    for row_index,row in enumerate(actual_rows):
                        cells=row.findall('table:table-cell',NS)
                        for col_index,cell in enumerate(cells):
                            formula=cell.get('{'+NS['table']+'}formula')
                            if formula is None:continue
                            formula_count+=1
                            if row_index<1 or not (col_index==4 or col_index==7 and row_index<=3):raise RuntimeError('Unexpected formula position')
                            if not formula.startswith('of:='):raise RuntimeError('Missing OpenFormula namespace')
                            # Remove all cached results, including text; only Calc may calculate them.
                            cell.attrib.pop('{'+NS['office']+'}value',None)
                            cell.attrib.pop('{'+NS['office']+'}value-type',None)
                            for child in list(cell):cell.remove(child)
                    if formula_count!=243:raise RuntimeError('Missing helper/result formulas')
                    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_STORED) as changed:
                        for entry in archive.infolist():
                            changed.writestr(entry.filename,ET.tostring(content,encoding='utf-8',xml_declaration=True) if entry.filename=='content.xml' else archive.read(entry.filename))
            target.with_suffix('.csv').unlink(missing_ok=True)
            fixtures.append((target,kind,rows,expected))
    profile_dir=tempfile.TemporaryDirectory(prefix='calc-profile-',dir=output)
    profile=Path(profile_dir.name).as_uri()
    for start in range(0,len(fixtures),4):
        batch=fixtures[start:start+4]
        result=subprocess.run([soffice,'-env:UserInstallation='+profile,'--headless','--convert-to','csv:Text - txt - csv (StarCalc):44,34,76,1','--outdir',str(output),*[str(path) for path,_,_,_ in batch]],capture_output=True,text=True,check=True,timeout=120,env={**os.environ,'SAL_USE_VCLPLUGIN':'svp'})
        print(result.stdout.strip(),flush=True)
    profile_dir.cleanup()
    for target,kind,source,expected in fixtures:
        rows=list(csv.reader(io.StringIO(target.with_suffix('.csv').read_text(encoding='utf-8-sig'))))
        if len(rows)!=len(source) or [row[:4] for row in rows]!=source:raise RuntimeError('Calc source data differ: '+str(target))
        if kind=='reference':
            actual=[float(rows[i][7]) for i in [1,2,3]]
            if actual!=expected:raise RuntimeError('Calc formulas differ: '+str(target)+' '+repr(actual)+' expected '+repr(expected))
    print('LibreOffice: 12 source and 12 reference ODS opened; all original cells preserved; 2916 uncached formulas recalculated and all 36 results match an independent oracle.',flush=True)

if __name__=='__main__':
    try:main()
    except Exception as error:
        print('::error title=Spreadsheet calculation validation::'+str(error).replace('%','%25').replace('\n','%0A'),flush=True)
        raise
