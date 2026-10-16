"""Run exported Robot references with an independent parser, interpreter and target oracle."""
from pathlib import Path
import hashlib
import json
import re
import sys
import zipfile


def parse_condition(text):
    """Shunting-yard parser: independent of the TS recursive-descent compiler."""
    tokens=re.findall(r'[()]|[^()\s]+',text)
    output=[];operators=[];index=0;operand=True
    priority={'или':1,'и':2,'не':3}
    while index<len(tokens):
        token=tokens[index];index+=1
        if operand:
            if token in ['не','(']:
                operators.append(token)
                if sum(op in ['не','('] for op in operators)>32:raise ValueError('Слишком глубокая вложенность условия')
                continue
            if token in ['сверху','снизу','слева','справа']:
                if index>=len(tokens) or tokens[index] not in ['свободно','стена']:raise ValueError('Укажи свободно или стена')
                output.append(('sensor',token,tokens[index]=='свободно'));index+=1
            elif token=='клетка':
                expected=True
                if index<len(tokens) and tokens[index]=='не':expected=False;index+=1
                if index>=len(tokens) or tokens[index]!='закрашена':raise ValueError('Укажи клетка закрашена или клетка не закрашена')
                index+=1;output.append(('sensor',token,expected))
            else:raise ValueError('Неизвестное условие: проверь датчик')
            operand=False
        elif token==')':
            while operators and operators[-1]!='(':output.append((operators.pop(),))
            if not operators:raise ValueError('Убери лишнюю закрывающую скобку')
            operators.pop()
        elif token in ['и','или']:
            while operators and operators[-1]!='(' and priority[operators[-1]]>=priority[token]:output.append((operators.pop(),))
            operators.append(token);operand=True
        else:raise ValueError('Добавь и или или между проверками')
    if operand:raise ValueError('Допиши условие после оператора')
    while operators:
        operator=operators.pop()
        if operator=='(':raise ValueError('Закрой скобку условия')
        output.append((operator,))
    return output


def program(source):
    if len(source.encode('utf-16-le'))//2>32000:raise ValueError('Строка 1: сократи размер программы')
    raw=re.split(r'\r\n|\r|\n',source)
    if len(raw)>2000:raise ValueError('Строка 1: сократи число строк')
    lines=[(' '.join(line.split('|')[0].lower().split()),number) for number,line in enumerate(raw,1)]
    lines=[line for line in lines if line[0]]
    if lines and lines[0][0]=='использовать робот':lines.pop(0)
    if lines and lines[0][0].startswith('алг'):
        first,number=lines.pop(0)
        if not re.fullmatch(r'алг(?: [а-яёa-z_][а-яёa-z_0-9 ]*)?',first) or len(lines)<2 or lines.pop(0)[0]!='нач' or lines.pop()[0]!='кон':raise ValueError(f'Строка {number}: проверь оболочку алг / нач / кон')
    index=0;instructions=0
    def block(stops,depth=0):
        nonlocal index,instructions
        if depth>32:raise ValueError(f'Строка {lines[index][1] if index<len(lines) else 1}: сократи вложенность блоков')
        nodes=[]
        while index<len(lines) and lines[index][0] not in stops:
            line,number=lines[index];index+=1;instructions+=1
            try:
                if line.startswith('нц пока ') or re.fullmatch(r'нц [0-9]+ раз',line):
                    repeat=not line.startswith('нц пока ')
                    condition=int(line.split()[1]) if repeat else parse_condition(line[8:])
                    if repeat and condition>10000:raise ValueError('Уменьши число повторений')
                    body=block({'кц'},depth+1)
                    if index>=len(lines) or lines[index][0]!='кц':raise ValueError('Закрой цикл: кц')
                    index+=1;instructions+=1;nodes.append(('repeat' if repeat else 'while',condition,body))
                elif line.startswith('если ') and line.endswith(' то'):
                    condition=parse_condition(line[5:-3]);yes=block({'иначе','все'},depth+1);no=[]
                    if index<len(lines) and lines[index][0]=='иначе':index+=1;instructions+=1;no=block({'все'},depth+1)
                    if index>=len(lines) or lines[index][0]!='все':raise ValueError('Закрой условие: все')
                    index+=1;nodes.append(('if',condition,yes,no))
                elif line in ['вверх','вниз','влево','вправо','закрасить']:nodes.append(('action',line))
                else:raise ValueError('Неизвестная команда: '+line)
                if instructions>4000:raise ValueError('Сократи число инструкций')
            except ValueError as error:
                if str(error).startswith('Строка '):raise
                raise ValueError(f'Строка {number}: {error}. Проверь запись.') from error
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
    elif kind=='robot-comb':
        base=max(1,*p['heights']);cells={(base-step,column) for column,height in enumerate(p['heights']) for step in range(1,height+1)}
        start=(base,0);size=(base+1,len(p['heights']))
    elif kind=='robot-stairs':
        peak=p['left']+p['rise']
        cells={(p['top']+abs(column-peak),column) for column in range(p['left'],peak+p['fall']+1)}
        start=(p['top']+p['rise'],p['left']);size=(p['top']+max(p['rise'],p['fall'])+3,p['left']+p['rise']+p['fall']+3)
    elif kind in ['robot-corner-right','robot-corner-left']:
        column=p['left'] if kind=='robot-corner-right' else p['left']+p['width']-1
        cells={(p['top'],x) for x in range(p['left'],p['left']+p['width']) if not p['left']+p['holeX']<=x<p['left']+p['holeX']+p['holeWidth']}
        cells|={(y,column) for y in range(p['top'],p['top']+p['height']) if not p['top']+p['holeY']<=y<p['top']+p['holeY']+p['holeHeight']}
        start=(p['top'] if kind=='robot-corner-right' else p['top']+p['height']-1,p['left']+p['width']-1)
        size=(p['top']+p['height']+2,p['left']+p['width']+2)
    else:raise ValueError('Unknown Robot family')
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
    def condition(postfix):
        tick();values=[]
        for node in postfix:
            if node[0]=='sensor':
                actual=position in painted if node[1]=='клетка' else destination(sensors[node[1]]) is not None
                values.append(actual==node[2])
            elif node[0]=='не':values.append(not values.pop())
            else:
                right=values.pop();left=values.pop()
                values.append(left and right if node[0]=='и' else left or right)
        if len(values)!=1:raise ValueError('Invalid condition stack')
        return values[0]
    def walk(nodes):
        nonlocal position
        for node in nodes:
            if node[0]=='while':
                while condition(node[1]):walk(node[2])
            elif node[0]=='if':walk(node[2] if condition(node[1]) else node[3])
            elif node[0]=='repeat':
                tick()
                for _ in range(node[1]):walk(node[2]);tick()
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
    if len(directories)!=21:raise RuntimeError('Expected twenty-one Robot samples')
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
    print(f'Independent Python Robot interpreter: all {len(directories)} exported programs passed {count} fields; exact painting, positions, termination, walls, ZIP CRC and hashes verified.',flush=True)


if __name__=='__main__':
    try:
        if sys.argv[1:]==['--json']:
            results=[]
            for case in json.load(sys.stdin):
                try:
                    painted,position,ticks=execute(program(case['source']),case['field'])
                    results.append({'painted':[{'row':r,'column':c} for r,c in sorted(painted)],'position':{'row':position[0],'column':position[1]}})
                except (ValueError,RuntimeError) as error:results.append({'error':str(error)})
            print(json.dumps(results,ensure_ascii=False))
        else:main()
    except Exception as error:
        print('::error title=Robot family validation::'+str(error).replace('%','%25').replace('\n','%0A'),flush=True)
        raise
