import numpy as np
from scipy.interpolate import BSpline
from stepparse import *
TAU=2*np.pi
class Model:
    def __init__(s,path):
        s.P={k:entity(v) for k,v in parse(path).items()}
    def R(s,r): return s.P[r[1]]
    def vec(s,r): return np.array(s.R(r)[1][1],float)
    def frame(s,ref):
        a=s.P[ref[1]][1]; o=s.vec(a[1]); z=s.vec(a[2]) if a[2] else np.array([0,0,1.]); x=s.vec(a[3]) if a[3] else np.array([1,0,0.])
        z/=np.linalg.norm(z); x=x-np.dot(x,z)*z; x/=np.linalg.norm(x); return o,x,np.cross(z,x),z
def expand_knots(mults,knots): return np.repeat(np.array(knots,float),np.array(mults,int))
def basis(t,k,x):
    t=np.asarray(t); x=np.clip(np.atleast_1d(x),t[k],t[-k-1]-1e-12)
    return BSpline.design_matrix(x,t,k).toarray()
# ---------------- curves ----------------
class Curve:
    pass
def make_curve(m,ref):
    t,a=m.P[ref]
    c=Curve(); c.kind=t
    if t=='LINE':
        c.p0=m.vec(a[1]); d=m.R(a[2])[1]; c.d=m.vec(d[1])*d[2]
    elif t in('CIRCLE','ELLIPSE'):
        c.o,c.x,c.y,c.z=m.frame(a[1]); c.a=a[2]; c.b=a[3] if t=='ELLIPSE' else a[2]
    elif t=='B_SPLINE_CURVE_WITH_KNOTS' or t=='COMPLEX':
        if t=='COMPLEX':
            bc=a['B_SPLINE_CURVE']; deg=int(bc[0]); pts=bc[1]; kn=a['B_SPLINE_CURVE_WITH_KNOTS']; mults,knots=kn[0],kn[1]
            w=np.array(a['RATIONAL_B_SPLINE_CURVE'][0],float) if 'RATIONAL_B_SPLINE_CURVE' in a else None
        else:
            deg=int(a[1]); pts=a[2]; mults,knots=a[6],a[7]; w=None
        c.kind='BSPLINE'; c.k=deg; c.cp=np.array([m.vec(p) for p in pts]); c.t=expand_knots(mults,knots)
        c.w=w if w is not None else np.ones(len(c.cp))
        c.lo,c.hi=c.t[deg],c.t[-deg-1]
    else: raise ValueError('curve '+t)
    return c
def curve_eval(c,u):
    u=np.atleast_1d(u)
    if c.kind=='LINE': return c.p0+np.outer(u,c.d)
    if c.kind in('CIRCLE','ELLIPSE'): return c.o+np.outer(c.a*np.cos(u),c.x)+np.outer(c.b*np.sin(u),c.y)
    N=basis(c.t,c.k,u); num=N@(c.cp*c.w[:,None]); den=N@c.w; return num/den[:,None]
def curve_param(c,p):
    if c.kind=='LINE': return np.dot(p-c.p0,c.d)/np.dot(c.d,c.d)
    if c.kind in('CIRCLE','ELLIPSE'):
        q=p-c.o; return np.arctan2(np.dot(q,c.y)/c.b,np.dot(q,c.x)/c.a)
    us=np.linspace(c.lo,c.hi,2000); P=curve_eval(c,us); i=np.argmin(np.linalg.norm(P-p,axis=1)); return us[i]
def sample_edge(m,ec_ref,same_sense):
    a=m.P[ec_ref][1]
    v0=m.vec(m.R(a[1])[1][1]); v1=m.vec(m.R(a[2])[1][1])
    c=make_curve(m,a[3][1]); sense=a[4]=='T' or a[4]==('.','T')
    if c.kind=='LINE': return np.array([v0,v1])
    t0,t1=curve_param(c,v0),curve_param(c,v1)
    if c.kind in('CIRCLE','ELLIPSE'):
        if sense:
            while t1<=t0+1e-9: t1+=TAU
        else:
            while t1>=t0-1e-9: t1-=TAU
        n=max(4,int(abs(t1-t0)/(TAU/72))+1)
    else:
        closed=np.linalg.norm(v0-v1)<1e-9
        if closed: t0,t1=(c.lo,c.hi) if sense else (c.hi,c.lo)
        n=60
    pts=curve_eval(c,np.linspace(t0,t1,n)); pts[0]=v0; pts[-1]=v1
    return pts
