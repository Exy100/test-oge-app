"""Independently inspect Writer structure, merged cells, typography and rendered examples."""
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


def expected_rows(e):
    rows = [e['headers']]
    for i, row in enumerate(e['rows']):
        if e['family'] == 'sections' and i == 5:
            rows.append([e['sectionTitle']])
        rows.append(row)
    return rows


def validate_structure(path, e, score=2):
    with zipfile.ZipFile(path) as archive:
        content = ET.fromstring(archive.read('content.xml'))
        styles = ET.fromstring(archive.read('styles.xml'))
    body = content.find('office:body/office:text', NS)
    require(body is not None, 'Missing Writer body')
    paragraphs = body.findall('text:p', NS)
    require([paragraph_text(p) for p in paragraphs] == [e['title'], *(e['paragraphs'] if score else [])], 'Main text differs: '+str(path))
    require([attr(p, 'text', 'style-name') for p in paragraphs] == ['Title', *(['Body', 'Body'] if score else [])], 'Main styles differ')
    if e['family']=='instructions':
        bold=paragraphs[0].find('text:span',NS)
        require(bold is not None and attr(bold,'text','style-name')=='Bold' and attr(bold.find('text:span',NS),'text','style-name')=='Underline','Instruction title needs real bold and underline')
    tables = body.findall('table:table', NS)
    require(len(tables) == int(score == 2), 'Table count differs')
    if score == 2:
        rows = tables[0].findall('table:table-row', NS)
        require(len(tables[0].findall('table:table-column', NS)) == 2, 'Expected two columns')
        require([[paragraph_text(c.find('text:p', NS)) for c in row.findall('table:table-cell', NS)] for row in rows] == expected_rows(e), 'Table data differ')
        for row_index, (row, values) in enumerate(zip(rows, expected_rows(e))):
            cells = row.findall('table:table-cell', NS)
            if len(values) == 1:
                require(attr(cells[0], 'table', 'number-columns-spanned') == '2' and len(row.findall('table:covered-table-cell', NS)) == 1, 'Missing real merged row')
            for i, c in enumerate(cells):
                require(attr(c, 'table', 'style-name') == 'DataCell', 'Cell style differs')
                center = len(values) == 1 or row_index == 0 or (i == 0 if e['family'] == 'sections' else i == 1)
                require(attr(c.find('text:p', NS), 'text', 'style-name') == ('Center' if center else 'Cell'), 'Cell alignment assignment differs')
        require(list(body)[1].tag == '{'+NS['table']+'}table' if e['family'] == 'instructions' else list(body)[-1].tag == '{'+NS['table']+'}table', 'Text/table order differs')
    defs = {attr(s, 'style', 'name'): s for s in styles.findall('.//style:style', NS)}
    auto = {attr(s, 'style', 'name'): s for s in content.findall('.//style:style', NS)}
    page = styles.find('.//style:page-layout-properties', NS)
    for key, value in [('page-width','21cm'),('page-height','29.7cm'),('margin','2cm')]:
        require(attr(page,'fo',key) == value, 'Page geometry differs')
    for name, align in [('Title','center'),('Body','justify'),('Cell','start'),('Center','center')]:
        require(attr(defs[name].find('style:text-properties',NS),'fo','font-size') == '14pt', 'Expected 14pt '+name)
        require(attr(defs[name].find('style:paragraph-properties',NS),'fo','text-align') == align, 'Alignment differs '+name)
    props = defs['Body'].find('style:paragraph-properties',NS)
    require(attr(props,'fo','text-indent') == '1cm' and attr(props,'fo','line-height') == str(e['format']['lineHeight'])+'%', 'Paragraph properties differ')
    require(attr(props,'fo','margin-bottom') == '14pt', 'Paragraph gap differs')
    require(attr(defs['Bold'].find('style:text-properties',NS),'fo','font-weight') == 'bold', 'Missing bold')
    require(attr(defs['Italic'].find('style:text-properties',NS),'fo','font-style') == 'italic', 'Missing italic')
    require(attr(defs['Underline'].find('style:text-properties',NS),'style','text-underline-style') == 'solid', 'Missing underline')
    if score:
        require(len(paragraphs[1].findall('text:span',NS)) == len(paragraphs[2].findall('text:span',NS)) == 1, 'Missing main emphasis runs')
    grid = auto['Grid'].find('style:table-properties',NS)
    require(attr(grid,'style','width') == '15cm' and attr(grid,'table','align') == 'center', 'Table must be narrower than the 17cm text and centered')
    require(attr(auto['DataCell'].find('style:table-cell-properties',NS),'style','vertical-align') == 'middle', 'Vertical alignment differs')
    for i,width in enumerate(e['format']['widths']):
        require(attr(auto['Col'+str(i)].find('style:table-column-properties',NS),'style','column-width') == str(width)+'cm', 'Column width differs')


def validate_pdf(path, e, output, score=2):
    bbox = output/(path.stem+'-bbox.html')
    run(['pdftotext','-bbox-layout',str(path),str(bbox)])
    pages = ET.parse(bbox).getroot().findall('.//{*}page')
    require(len(pages)==1, 'Expected one page: '+str(path))
    page = pages[0]
    factor=72/2.54
    require(abs(float(page.attrib['width'])-21*factor)<1 and abs(float(page.attrib['height'])-29.7*factor)<1, 'Expected A4')
    words=page.findall('.//{*}word')
    for word in words:
        x0,y0,x1,y1=[float(word.attrib[k]) for k in ['xMin','yMin','xMax','yMax']]
        require(x0>=2*factor-2 and x1<=19*factor+2 and y0>=2*factor-2 and y1<=27.7*factor+2, 'Text outside margins')
        require(y1-y0>=12, 'Unexpectedly small font')
    text=' '.join(run(['pdftotext','-layout',str(path),'-']).stdout.split())
    for expected in [e['title'], *(e['paragraphs'] if score else [])]:
        require(' '.join(expected.split()) in text, 'Rendered main text missing: '+expected)
    if score==2:
        # Every table cell must render inside its actual column, with common row centers.
        starts=[3*factor,10*factor,18*factor]
        previous_bottom=0
        for values in expected_rows(e):
            options=[]
            for i,value in enumerate(values):
                left,right=(starts[0],starts[2]) if len(values)==1 else (starts[i],starts[i+1])
                own=sorted([w for w in words if float(w.attrib['xMin'])>=left-1 and float(w.attrib['xMax'])<=right+1 and float(w.attrib['yMin'])>previous_bottom], key=lambda w:(round(float(w.attrib['yMin']),1),float(w.attrib['xMin'])))
                tokens=value.split()
                matches=[own[n:n+len(tokens)] for n in range(len(own)-len(tokens)+1) if [w.text for w in own[n:n+len(tokens)]]==tokens]
                require(bool(matches), 'Cell missing inside column: '+value)
                options.append([(min(float(w.attrib['yMin']) for w in m),max(float(w.attrib['yMax']) for w in m)) for m in matches])
            candidates=[boxes for boxes in itertools.product(*options) if max((a+b)/2 for a,b in boxes)-min((a+b)/2 for a,b in boxes)<2]
            require(bool(candidates), 'Rendered row baselines differ: '+repr(values))
            boxes=min(candidates,key=lambda b:min(a for a,_ in b))
            previous_bottom=max(b for _,b in boxes)
    run(['pdftoppm','-scale-to','1100','-png',str(path),str(output/path.stem)])


def main():
    output=Path('.cache/document-office').resolve();output.mkdir(parents=True,exist_ok=True)
    soffice=shutil.which('soffice') or shutil.which('libreoffice')
    require(bool(soffice) and bool(shutil.which('pdftotext')) and bool(shutil.which('pdftoppm')), 'Required: Writer and poppler-utils')
    directories=sorted(p for p in Path('samples/13-2-files').iterdir() if p.is_dir())
    require(len(directories)==12,'Expected twelve documents')
    sources=[];formatted=[];samples=[]
    for directory in directories:
        files=directory/'files';m=json.loads((directory/'manifest.json').read_text())
        require(m['kind']=='curated' and m['generatorVersion']=='curated-documents-v2','Wrong manifest')
        with zipfile.ZipFile(directory/'dataset.zip') as z:
            require(z.testzip() is None and set(z.namelist())=={e['path'] for e in m['files']},'Archive composition differs')
            for e in m['files']:
                b=z.read(e['path']);require(b==(files/e['path']).read_bytes() and len(b)==e['size'] and hashlib.sha256(b).hexdigest()==e['sha256'],'Hash/bytes differ')
        checks=json.loads((files/'reference/checks.json').read_text());e=checks['reference'];identifier=checks['id']
        target=output/(identifier+'-source.odt');shutil.copyfile(files/'source/material.odt',target);sources.append((target,checks['sourceParagraphs']))
        for score,original in [(0,'examples/score-0.odt'),(1,'examples/score-1.odt'),(2,'reference/answer.odt')]:
            target=output/(identifier+'-score-'+str(score)+'.odt');shutil.copyfile(files/original,target)
            validate_structure(target,e,score);formatted.append((target,e,score))
        target=output/(identifier+'-sample.pdf');shutil.copyfile(files/'layout/sample.pdf',target);samples.append((target,e))
    profile=(output/'profile').as_uri()
    for paths,conversion in [([p for p,_ in sources],'txt:Text (encoded):UTF8'),([p for p,_,_ in formatted],'pdf:writer_pdf_Export')]:
        result=run([soffice,'-env:UserInstallation='+profile,'--headless','--convert-to',conversion,'--outdir',str(output),*map(str,paths)])
        print(result.stdout.strip(),flush=True)
    for path,paragraphs in sources:
        require(path.with_suffix('.txt').read_text(encoding='utf-8-sig').strip().splitlines()==paragraphs,'Writer source text differs')
    for path,e,score in formatted:validate_pdf(path.with_suffix('.pdf'),e,output,score)
    for path,e in samples:validate_pdf(path,e,output)
    print('Writer: 12 sources, 12 visual PDF samples and 36 score examples verified; real merged cells, emphasis, 14pt, geometry and all text checked independently.',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('::error title=Document validation::'+str(error).replace('%','%25').replace('\n','%0A'),flush=True)
        raise
