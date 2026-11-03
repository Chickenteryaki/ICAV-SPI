import re
def parse(path):
    txt=open(path).read()
    data=txt[txt.index('DATA;')+5:txt.index('ENDSEC;',txt.index('DATA;'))]
    data=re.sub(r'/\*.*?\*/','',data,flags=re.S)
    ents={}
    for m in re.finditer(r'#(\d+)\s*=\s*(.*?);\s*(?=#\d+\s*=|$)',data,flags=re.S):
        ents[int(m.group(1))]=m.group(2).strip()
    return ents
def tokenize(s):
    i=0;out=[]
    while i<len(s):
        c=s[i]
        if c in ' \n\r\t': i+=1; continue
        if c in '(),': out.append(c); i+=1; continue
        if c=="'":
            j=i+1
            while True:
                if s[j]=="'" and (j+1>=len(s) or s[j+1]!="'"): break
                if s[j]=="'": j+=2
                else: j+=1
            out.append(('S',s[i+1:j])); i=j+1; continue
        m=re.match(r"#\d+|\.[A-Z_0-9]+\.|[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?\.?|\$|\*|[A-Z_][A-Z_0-9]*",s[i:])
        tok=m.group(0); i+=len(tok)
        if tok.startswith('#'): out.append(('R',int(tok[1:])))
        elif tok.startswith('.') and tok.endswith('.') and len(tok)>1 and tok[1].isalpha(): out.append(('E',tok[1:-1]))
        elif tok in('$','*'): out.append(None)
        elif re.match(r'[A-Z_]',tok): out.append(('K',tok))
        else: out.append(float(tok.rstrip('.')) if tok!='.' else 0.0)
    return out
def build(tokens):
    pos=[0]
    def val():
        t=tokens[pos[0]]
        if t=='(':
            pos[0]+=1; lst=[]
            while tokens[pos[0]]!=')':
                if tokens[pos[0]]==',': pos[0]+=1; continue
                lst.append(val())
            pos[0]+=1; return lst
        if isinstance(t,tuple) and t[0]=='K' and pos[0]+1<len(tokens) and tokens[pos[0]+1]=='(':
            pos[0]+=1; args=val(); return ('T',t[1],args)
        pos[0]+=1
        if isinstance(t,tuple):
            if t[0]=='R': return ('#',t[1])
            if t[0]=='S': return t[1]
            if t[0]=='E': return ('.',t[1])
            if t[0]=='K': return ('K',t[1])
        return t
    res=[]
    while pos[0]<len(tokens):
        if tokens[pos[0]]==',': pos[0]+=1; continue
        res.append(val())
    return res
def entity(raw):
    v=build(tokenize(raw))
    if len(v)==1 and isinstance(v[0],tuple) and v[0][0]=='T': return v[0][1], v[0][2]
    if len(v)==1 and isinstance(v[0],list):  # complex entity
        d={}
        for item in v[0]:
            if isinstance(item,tuple) and item[0]=='T': d[item[1]]=item[2]
            elif isinstance(item,tuple) and item[0]=='K': d[item[1]]=[]
        return 'COMPLEX', d
    return 'UNKNOWN', v
