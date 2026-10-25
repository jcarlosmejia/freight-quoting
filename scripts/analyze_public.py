#!/usr/bin/env python3
"""Static inventory: never imports or executes captured JavaScript."""
import csv, hashlib, json, re, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ASSETS=ROOT/'evidence/raw/app.fletcot.com/assets'
STRINGS=re.compile(r'"(?:[^"\\]|\\.)*"|\x27(?:[^\x27\\]|\\.)*\x27|`(?:[^`\\]|\\.)*`')
def split_top(text):
    # Skip strings, then count JS container delimiters; sufficient for Vite's route object literal.
    result=[]; start=0; depth=0; tokens={m.start():m.end() for m in STRINGS.finditer(text)};i=0
    while i<len(text):
        if i in tokens:i=tokens[i];continue
        ch=text[i]
        if ch in '[{(':depth+=1
        elif ch in ']})':depth-=1
        elif ch==',' and depth==0:result.append(text[start:i]);start=i+1
        i+=1
    result.append(text[start:]);return result

def object_fields(raw):
    return dict(x.split(':',1) for x in split_top(raw.strip()[1:-1]) if ':' in x)
def routes(raw,parent=''):
    out=[]
    for obj in split_top(raw.strip()[1:-1]):
        fields=object_fields(obj);path=fields['path'].strip('"');full=path if path.startswith('/') else parent.rstrip('/')+'/'+path
        meta=fields.get('meta','{}')
        out.append({'path':full,'name':fields.get('name','').strip('"'),'title':next(iter(re.findall(r'title:"([^"]+)"',meta)),''),'permissions':json.loads(next(iter(re.findall(r'requiredPermissions:(\[[^]]*\])',meta)),'[]')),'roles':json.loads(next(iter(re.findall(r'requiredRoles:(\[[^]]*\])',meta)),'[]')),'component':next(iter(re.findall(r'import\("\./([^"\n]+)"\)',fields.get('component',''))),'')})
        if 'children' in fields:out.extend(routes(fields['children'],full))
    return out

def main():
    evidence=ROOT/'evidence';evidence.mkdir(exist_ok=True)
    main=next(ASSETS.glob('index-Clak*.js')).read_text();start=main.index('Rx=[')+3;end=main.index('],Dx=',start)+1
    route_rows=routes(main[start:end]);(evidence/'routes.json').write_text(json.dumps(route_rows,ensure_ascii=False,indent=2)+'\n')
    endpoints=[];deps=[];docs=[]
    manifest=json.loads((evidence/'manifest.json').read_text())
    js_files=[ROOT/x['file'] for x in manifest if x['status']=='200' and 'javascript' in x['mime'] and not x['error']]
    for p in sorted(js_files):
        s=p.read_text();name=p.name
        deps.append({'file':name,'imports':sorted(set(re.findall(r'(?:from|import)\s*\(?["\x27](\./[^"\x27]+)',s))),'obfuscated':bool(re.search(r'_0x[0-9a-f]+',s)),'source_mapping_url':re.findall(r'sourceMappingURL=([^\s]+)',s)})
        for m in STRINGS.finditer(s):
            value=m.group()[1:-1]
            if re.match(r'^/(?:auth|vehicle|vehicles|clients|fixed|board|quotes|quotations|price|routes|saved|locations|bases|companies|billing|platform|tolls|fuel|support|whatsapp|telegram|quote|sent|users|roles|permissions|country|countries|bunny|rental|location-points|route-risk|road-incidents|routing|toll|route|saved-route|board-equipment|equipment|permissions|type-vehicles)',value) and len(value)<240 and '<' not in value:
                after=s[m.end():m.end()+180]; method=re.search(r'\.(get|post|put|patch|delete)\(',after)
                endpoints.append({'file':name,'path_expression':value,'nearby_method_hint':method.group(1).upper() if method else '', 'char_offset':m.start(),'status':'static reference; not requested'})
        if name.startswith('DocsPage-'):
            for m in STRINGS.finditer(s):
                value=m.group()[1:-1]
                if len(value)>35 and ' ' in value and not re.search(r'(?:\b(?:flex|grid|rounded|text|border|bg|px|py|mt|gap|font|items|justify|w|h|min|max|space|sticky|overflow|divide|scroll)-|https?://)',value):docs.append(value)
    (evidence/'endpoints.json').write_text(json.dumps(endpoints,ensure_ascii=False,indent=2)+'\n')
    (evidence/'dependencies.json').write_text(json.dumps(deps,ensure_ascii=False,indent=2)+'\n')
    (evidence/'docs-extracted.txt').write_text('\n\n'.join(docs)+'\n')
    with (evidence/'routes.csv').open('w') as f:
        w=csv.DictWriter(f,fieldnames=route_rows[0].keys(),lineterminator='\n');w.writeheader();w.writerows(route_rows)
    manifest=json.loads((evidence/'manifest.json').read_text());successful=[x for x in manifest if x['status']=='200' and not x['error']]
    for item in successful:assert hashlib.sha256((ROOT/item['file']).read_bytes()).hexdigest()==item['sha256'],item['file']
    assert any(x['path']=='/admin/quotes' for x in route_rows)
    assert any(x['path']=='/admin/vehicles/:id/edit' for x in route_rows)
    assert any(x['path_expression']=='/auth/login' for x in endpoints)
    print(json.dumps({'captured':len(successful),'routes':len(route_rows),'endpoint_references':len(endpoints),'js_chunks':len(deps),'obfuscated_chunks':[x['file'] for x in deps if x['obfuscated']],'referenced_source_maps':sum(bool(x['source_mapping_url']) for x in deps),'docs_paragraphs':len(docs)},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
