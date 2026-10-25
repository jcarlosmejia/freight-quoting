#!/usr/bin/env python3
"""Archive only public assets explicitly referenced by the two Fletcot sites."""
import concurrent.futures, hashlib, json, re, subprocess, sys
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
ROOT = Path(__file__).resolve().parents[1]
ALLOWED = {'fletcot.com', 'app.fletcot.com'}
class Links(HTMLParser):
    def __init__(self): super().__init__(); self.links=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag in {'script','img','link'}:
            v=a.get('src') or a.get('href','')
            if v: self.links.append(v)
def refs(url, body, mime):
    if 'html' in mime:
        p=Links(); p.feed(body); return [urljoin(url, x) for x in p.links]
    return [urljoin(url, '/'+x if x.startswith('assets/') else x) for x in re.findall(r'["\x27]((?:\./|/)?(?:assets/)?[\w./-]+\.(?:js|css))["\x27]',body)]
def permitted(url):
    p=urlparse(url)
    return p.scheme=='https' and p.hostname in ALLOWED and not p.query and not p.fragment and '..' not in p.path.split('/') and (p.path in {'/','/terminos','/privacidad'} or p.path.startswith(('/assets/','/_astro/')))
def fetch(url):
    p=urlparse(url); rel=p.path.lstrip('/') or 'index.html'
    if '.' not in Path(rel).name: rel += '.html'
    dest=ROOT/'evidence'/'raw'/p.hostname/rel; dest.parent.mkdir(parents=True,exist_ok=True)
    r=subprocess.run(['curl','-sS','-L','--proto','=https','--proto-redir','=https','--max-redirs','3','--max-time','25','--max-filesize','12000000','--retry','1','-w','%{http_code}\t%{content_type}\t%{url_effective}','-o',str(dest),url],capture_output=True,text=True)
    parts=r.stdout.split('\t'); code=parts[0] if parts else ''; mime=parts[1] if len(parts)>1 else ''; final=parts[2] if len(parts)>2 else url
    data=dest.read_bytes() if dest.exists() else b''
    item={'url':url,'final_url':final,'status':code,'mime':mime,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'file':str(dest.relative_to(ROOT)),'error':r.stderr.strip() if r.returncode else None,'fetched_at':datetime.now(timezone.utc).isoformat()}
    children=[]
    if r.returncode==0 and code=='200' and urlparse(final).hostname in ALLOWED and any(x in mime for x in ['javascript','text/css','text/html']): children=refs(final,data.decode('utf-8',errors='replace'),mime)
    return item,children
def main():
    seen=set(); pending={'https://fletcot.com/','https://app.fletcot.com/','https://fletcot.com/terminos','https://fletcot.com/privacidad'}; manifest=[]
    while pending:
        batch=sorted(pending-seen); pending=set()
        if len(seen)+len(batch)>450: raise RuntimeError('Asset limit reached; inspect before continuing')
        if not batch: break
        seen.update(batch)
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
            for item,children in pool.map(fetch,batch):
                manifest.append(item); pending.update(x for x in children if permitted(x) and x not in seen)
        print('Captured',len(manifest),'Next',len(pending),flush=True)
    (ROOT/'evidence'/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('Finished',len(manifest),'requests;',sum(i['status']=='200' and not i['error'] for i in manifest),'successful')
if __name__=='__main__':
    if '--self-test' in sys.argv:
        assert permitted('https://app.fletcot.com/assets/a.js')
        assert not permitted('https://evil.test/assets/a.js')
        assert not permitted('https://app.fletcot.com/private')
        assert refs('https://app.fletcot.com/assets/main.js','"assets/child.js"','application/javascript')==['https://app.fletcot.com/assets/child.js']
        assert not permitted('https://app.fletcot.com/assets/../private')
        assert refs('https://app.fletcot.com/assets/main.js','import "./child.js"','application/javascript')==['https://app.fletcot.com/assets/child.js']
        print('Collector self-check passed')
    else: main()
