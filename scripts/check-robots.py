"""Run exported Robot references with an independent parser, interpreter and target oracle."""
from pathlib import Path
import hashlib
import json
import zipfile


def program(source):
    lines=[line.split('|')[0].strip().lower() for line in source.splitlines()]
    lines=[line for line in lines if line]
    if lines and lines[0]=='использовать робот':lines.pop(0)
    if lines and lines[0].startswith('алг'):
        lines.pop(0)
        if lines.pop(0)!='нач' or lines.pop()!='кон':raise ValueError('Invalid program wrapper')
    index=0
    def block(stops):
        nonlocal index
        nodes=[]
        while index<len(lines) and lines[index] not in stops:
            line=lines[index];index+=1
            if line.startswith('нц пока '):
                body=block({'кц'})
                if index>=len(lines) or lines[index]!='кц':raise ValueError('Unclosed loop')
                index+=1;nodes.append(('while',line[8:],body))
            elif line.startswith('если ') and line.endswith(' то'):
                yes=block({'иначе','все'});no=[]
                if index<len(lines) and lines[index]=='иначе':index+=1;no=block({'все'})
                if index>=len(lines) or lines[index]!='все':raise ValueError('Unclosed branch')
                index+=1;nodes.append(('if',line[5:-3],yes,no))
            elif line in ['вверх','вниз','влево','вправо','закрасить']:nodes.append(('action',line))
            else:raise ValueError('Unsupported reference command: '+line)
        return nodes
    ast=block(set())
    if index!=len(lines):raise ValueError('Unexpected end marker')
    return ast


def oracle(p):
    kind=p['kind'];cells=set()
    if kind=='robot-corridor':
        cells={(p['top'],column) for column in range(p['left'],p['left']+p['length'])}
        start=(p['top'],p['left']);size=(p['top']+1+p['bottomPad'],p['left']+p['length']+p['rightPad'])
    elif kind=='robot-room':
        cells={(row,column) for row in range(p['top'],p['top']+p['height']) for column in range(p['left'],p['left']+p['width'])}
        start=(p['top'],p['left']);size=(p['top']+p['height']+p['bottomPad'],p['left']+p['width']+p['rightPad'])
    elif kind=='robot-wall-gaps':
        cells={(row,p['column']) for row in range(p['height']) if (p['mask']//(2**row))%2}
        start=(p['height']-1,p['column']);size=(p['height'],p['column']+1+p['rightPad'])
    else:
        base=max(1,*p['heights']);cells={(base-step,column) for column,height in enumerate(p['heights']) for step in range(1,height+1)}
        start=(base,0);size=(base+1,len(p['heights']))
    return cells,start,size


def execute(ast,field):
    point=lambda cell:(cell['row'],cell['column'])
    position=point(field['start']);painted={point(cell) for cell in field['painted']}
    walls={frozenset([point(wall['from']),point(wall['to'])]) for wall in field['walls']}
    deltas={'вверх':(-1,0),'вниз':(1,0),'влево':(0,-1),'вправо':(0,1)}
    sensors={'сверху':'вверх','снизу':'вниз','слева':'влево','справа':'вправо'}
    ticks=0
    def tick():
        nonlocal ticks
        ticks+=1
        if ticks>5000:raise RuntimeError('Independent step limit')
    def destination(direction):
        dr,dc=deltas[direction];next_cell=(position[0]+dr,position[1]+dc)
        if not (0<=next_cell[0]<field['rows'] and 0<=next_cell[1]<field['columns']) or frozenset([position,next_cell]) in walls:return None
        return next_cell
    def condition(text):
        tick();side,state=text.split(' ',1)
        if side not in sensors or state not in ['свободно','стена']:raise ValueError('Unknown reference sensor')
        return (destination(sensors[side]) is not None)==(state=='свободно')
    def walk(nodes):
        nonlocal position
        for node in nodes:
            if node[0]=='while':
                while condition(node[1]):walk(node[2])
            elif node[0]=='if':walk(node[2] if condition(node[1]) else node[3])
            else:
                tick()
                if node[1]=='закрасить':painted.add(position)
                else:
                    next_cell=destination(node[1])
                    if next_cell is None:raise RuntimeError('Collision')
                    position=next_cell
    walk(ast)
    return painted,position,ticks


def main():
    directories=sorted(p for p in Path('samples/15-files').iterdir() if p.is_dir())
    if len(directories)!=12:raise RuntimeError('Expected twelve Robot samples')
    count=0
    for directory in directories:
        files=directory/'files';manifest=json.loads((directory/'manifest.json').read_text())
        with zipfile.ZipFile(directory/'dataset.zip') as archive:
            if archive.testzip() is not None or set(archive.namelist())!={entry['path'] for entry in manifest['files']}:raise RuntimeError('ZIP CRC/composition differs')
            for entry in manifest['files']:
                data=archive.read(entry['path'])
                if data!=(files/entry['path']).read_bytes() or len(data)!=entry['size'] or hashlib.sha256(data).hexdigest()!=entry['sha256']:raise RuntimeError('File/hash mismatch')
        family=json.loads((files/'source/family.json').read_text());fields=json.loads((files/'validation/fields.json').read_text());results=json.loads((files/'reference/results.json').read_text())
        if len(fields)!=8 or len(family['parameters'])!=8 or results['score']!=2:raise RuntimeError('Incomplete family checks')
        if json.loads((files/'source/example.json').read_text())!=fields[0]:raise RuntimeError('Example differs from first field')
        ast=program((files/'reference/answer.txt').read_text())
        for index,(parameters,field) in enumerate(zip(family['parameters'],fields)):
            expected,start,size=oracle(parameters)
            if (field['rows'],field['columns'])!=size or (field['start']['row'],field['start']['column'])!=start or {(cell['row'],cell['column']) for cell in field['targets']}!=expected:raise RuntimeError('Geometry/targets differ from independent family oracle')
            painted,position,ticks=execute(ast,field)
            if painted!=expected:raise RuntimeError('Reference paints wrong cells: '+directory.name)
            result=results['results'][index]
            if result['status']!='completed' or not result['success'] or (result['position']['row'],result['position']['column'])!=position or {(cell['row'],cell['column']) for cell in result['painted']}!=painted:raise RuntimeError('Independent result differs from TS interpreter')
            count+=1
    print('Independent Python Robot interpreter: all 12 exported programs passed 96 fields; exact painting, positions, termination, walls, ZIP CRC and hashes verified.',flush=True)


if __name__=='__main__':
    try:main()
    except Exception as error:
        print('::error title=Robot family validation::'+str(error).replace('%','%25').replace('\n','%0A'),flush=True)
        raise
