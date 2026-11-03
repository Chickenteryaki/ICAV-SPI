"""STEP (AP242 B-rep) -> GLB tessellator for the ICAV SPI assembly.
Handles PLANE, CYLINDRICAL, CONICAL, (DEGENERATE_)TOROIDAL and (rational) B-spline
surfaces bounded by LINE / CIRCLE / ELLIPSE / B-spline edges."""
import sys, json, struct
import numpy as np
from scipy.spatial import cKDTree
from geom import Model, make_curve, sample_edge, basis, expand_knots, TAU
from earcut import earcut

# ---------------------------------------------------------------- surfaces
class Surface:
    period = (None, None)
    def normal(self, uv):
        uv = np.atleast_2d(uv); h = self.h
        du = self.eval(uv + [h[0], 0]) - self.eval(uv - [h[0], 0])
        dv = self.eval(uv + [0, h[1]]) - self.eval(uv - [0, h[1]])
        n = np.cross(du, dv); l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
        return n / l

class Plane(Surface):
    def __init__(s, o, x, y, z): s.o, s.x, s.y, s.z = o, x, y, z; s.h = (1e-4, 1e-4); s.kind = 'plane'
    def eval(s, uv): uv = np.atleast_2d(uv); return s.o + np.outer(uv[:, 0], s.x) + np.outer(uv[:, 1], s.y)
    def inv(s, p): q = p - s.o; return np.c_[q @ s.x, q @ s.y]
    def normal(s, uv): return np.tile(s.z, (len(np.atleast_2d(uv)), 1))

class Cylinder(Surface):
    def __init__(s, o, x, y, z, r, tan=0.0, kind='cyl'):
        s.o, s.x, s.y, s.z, s.r, s.tan = o, x, y, z, r, tan; s.period = (TAU, None); s.h = (1e-4, 1e-5); s.kind = kind
    def eval(s, uv):
        uv = np.atleast_2d(uv); rad = s.r + uv[:, 1] * s.tan
        return s.o + np.outer(rad * np.cos(uv[:, 0]), s.x) + np.outer(rad * np.sin(uv[:, 0]), s.y) + np.outer(uv[:, 1], s.z)
    def inv(s, p): q = p - s.o; return np.c_[np.arctan2(q @ s.y, q @ s.x), q @ s.z]

class Torus(Surface):
    def __init__(s, o, x, y, z, R, r):
        s.o, s.x, s.y, s.z, s.R, s.r = o, x, y, z, R, r; s.period = (TAU, TAU); s.h = (1e-4, 1e-4); s.kind = 'torus'
    def eval(s, uv):
        uv = np.atleast_2d(uv); rad = s.R + s.r * np.cos(uv[:, 1])
        return (s.o + np.outer(rad * np.cos(uv[:, 0]), s.x) + np.outer(rad * np.sin(uv[:, 0]), s.y)
                + np.outer(s.r * np.sin(uv[:, 1]), s.z))
    def inv(s, p):
        q = p - s.o; th = np.arctan2(q @ s.y, q @ s.x); d = np.hypot(q @ s.x, q @ s.y); z = q @ s.z
        # degenerate tori self-intersect: pick the tube circle (same or opposite side) the point lies on
        r1 = np.abs(np.hypot(d - s.R, z) - s.r); r2 = np.abs(np.hypot(d + s.R, z) - s.r)
        opp = r2 < r1 - 1e-9
        th = np.where(opp, th + np.pi, th)
        phi = np.where(opp, np.arctan2(z, -d - s.R), np.arctan2(z, d - s.R))
        return np.c_[th, phi]

class BSplineSurface(Surface):
    def __init__(s, du, dv, cp, w, tu, tv, uclosed, vclosed):
        s.du, s.dv, s.cp, s.w, s.tu, s.tv = du, dv, cp, w, tu, tv; s.kind = 'bspline'
        s.ulo, s.uhi = tu[du], tu[-du - 1]; s.vlo, s.vhi = tv[dv], tv[-dv - 1]
        s.period = ((s.uhi - s.ulo) if uclosed else None, (s.vhi - s.vlo) if vclosed else None)
        s.h = ((s.uhi - s.ulo) * 1e-5, (s.vhi - s.vlo) * 1e-5)
        s.pw = cp * w[..., None]
        g = 120; us = np.linspace(s.ulo, s.uhi, g); vs = np.linspace(s.vlo, s.vhi, g)
        U, V = np.meshgrid(us, vs, indexing='ij'); s.guv = np.c_[U.ravel(), V.ravel()]
        s.gpts = s.eval(s.guv); s.tree = cKDTree(s.gpts)
    def wrap(s, uv):
        uv = np.array(uv, float)
        if s.period[0]: uv[:, 0] = s.ulo + np.mod(uv[:, 0] - s.ulo, s.period[0])
        if s.period[1]: uv[:, 1] = s.vlo + np.mod(uv[:, 1] - s.vlo, s.period[1])
        return uv
    def eval(s, uv):
        uv = s.wrap(np.atleast_2d(uv))
        Nu = basis(s.tu, s.du, uv[:, 0]); Nv = basis(s.tv, s.dv, uv[:, 1])
        num = np.einsum('ki,kj,ijc->kc', Nu, Nv, s.pw); den = np.einsum('ki,kj,ij->k', Nu, Nv, s.w)
        return num / den[:, None]
    def inv(s, p):
        p = np.atleast_2d(p); _, idx = s.tree.query(p); uv = s.guv[idx].copy()
        for _ in range(8):
            S = s.eval(uv); r = p - S
            Su = (s.eval(uv + [s.h[0], 0]) - s.eval(uv - [s.h[0], 0])) / (2 * s.h[0])
            Sv = (s.eval(uv + [0, s.h[1]]) - s.eval(uv - [0, s.h[1]])) / (2 * s.h[1])
            a = np.einsum('ij,ij->i', Su, Su); b = np.einsum('ij,ij->i', Su, Sv); c = np.einsum('ij,ij->i', Sv, Sv)
            ru = np.einsum('ij,ij->i', Su, r); rv = np.einsum('ij,ij->i', Sv, r)
            det = a * c - b * b; det[np.abs(det) < 1e-18] = 1e-18
            uv[:, 0] += (c * ru - b * rv) / det; uv[:, 1] += (a * rv - b * ru) / det
            if not s.period[0]: uv[:, 0] = np.clip(uv[:, 0], s.ulo, s.uhi)
            if not s.period[1]: uv[:, 1] = np.clip(uv[:, 1], s.vlo, s.vhi)
        return uv

def make_surface(m, ref):
    t, a = m.P[ref]
    if t == 'PLANE': return Plane(*m.frame(a[1]))
    if t == 'CYLINDRICAL_SURFACE': return Cylinder(*m.frame(a[1]), a[2])
    if t == 'CONICAL_SURFACE': return Cylinder(*m.frame(a[1]), a[2], np.tan(a[3]), kind='cone')
    if t in ('TOROIDAL_SURFACE', 'DEGENERATE_TOROIDAL_SURFACE'): return Torus(*m.frame(a[1]), a[2], a[3])
    if t == 'B_SPLINE_SURFACE_WITH_KNOTS':
        du, dv, pts = int(a[1]), int(a[2]), a[3]; uc, vc = a[5] == ('.', 'T'), a[6] == ('.', 'T')
        um, vm, uk, vk = a[8], a[9], a[10], a[11]; w = None
    elif t == 'COMPLEX':
        b = a['B_SPLINE_SURFACE']; du, dv, pts = int(b[0]), int(b[1]), b[2]; uc, vc = b[4] == ('.', 'T'), b[5] == ('.', 'T')
        k = a['B_SPLINE_SURFACE_WITH_KNOTS']; um, vm, uk, vk = k[0], k[1], k[2], k[3]
        w = np.array(a['RATIONAL_B_SPLINE_SURFACE'][0], float) if 'RATIONAL_B_SPLINE_SURFACE' in a else None
    else: raise ValueError('surface ' + t)
    cp = np.array([[m.vec(p) for p in row] for row in pts])
    if w is None: w = np.ones(cp.shape[:2])
    return BSplineSurface(du, dv, cp, w, expand_knots(um, uk), expand_knots(vm, vk), uc, vc)

# ---------------------------------------------------------------- face meshing
def poly_area(uv): x, y = uv[:, 0], uv[:, 1]; return 0.5 * (x @ np.roll(y, -1) - y @ np.roll(x, -1))

def grid_mesh(nu, nv):
    tris = []
    for i in range(nu - 1):
        for j in range(nv - 1):
            a = i * nv + j; b = a + nv
            tris += [(a, b, a + 1), (a + 1, b, b + 1)]
    return np.array(tris)

def resolution(S, uv_a, uv_b, along, lo=4, hi=96):
    """segments needed along a param line, from 3D length and turning."""
    t = np.linspace(0, 1, 64)[:, None]; uv = uv_a + (uv_b - uv_a) * t
    P = S.eval(uv); seg = np.diff(P, axis=0); L = np.linalg.norm(seg, axis=1).sum()
    d = seg / np.maximum(np.linalg.norm(seg, axis=1, keepdims=True), 1e-12)
    turn = np.arccos(np.clip(np.einsum('ij,ij->i', d[1:], d[:-1]), -1, 1)).sum()
    return int(np.clip(max(np.ceil(L / 0.09), np.ceil(turn / np.radians(7))), lo, hi)) + 1

def refine(S, uv, tris, tol=6e-4, maxlen=0.14, iters=6):
    uv = [tuple(p) for p in uv]; tris = [tuple(t) for t in tris]
    cache = {}
    def P(i):
        if i not in cache: cache[i] = S.eval(np.array([uv[i]]))[0]
        return cache[i]
    for _ in range(iters):
        mids = {}
        def need(a, b):
            k = (min(a, b), max(a, b))
            if k in mids: return mids[k] is not None
            m = ((uv[a][0] + uv[b][0]) / 2, (uv[a][1] + uv[b][1]) / 2)
            pm = S.eval(np.array([m]))[0]; pa, pb = P(a), P(b)
            if np.linalg.norm(pm - (pa + pb) / 2) > tol or np.linalg.norm(pa - pb) > maxlen:
                uv.append(m); cache[len(uv) - 1] = pm; mids[k] = len(uv) - 1; return True
            mids[k] = None; return False
        out = []; changed = False
        for (a, b, c) in tris:
            sab, sbc, sca = need(a, b), need(b, c), need(c, a)
            n = sab + sbc + sca
            if n == 0: out.append((a, b, c)); continue
            changed = True
            ab = mids.get((min(a, b), max(a, b))); bc = mids.get((min(b, c), max(b, c))); ca = mids.get((min(c, a), max(c, a)))
            if n == 3: out += [(a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca)]
            elif n == 1:
                if sab: out += [(a, ab, c), (ab, b, c)]
                elif sbc: out += [(a, b, bc), (a, bc, c)]
                else: out += [(a, b, ca), (ca, b, c)]
            else:
                if not sab: out += [(a, b, bc), (a, bc, ca), (ca, bc, c)]
                elif not sbc: out += [(a, ab, ca), (ab, b, c), (ca, ab, c)]
                else: out += [(a, ab, c), (ab, b, bc), (ab, bc, c)]
        tris = out
        if not changed: break
    return np.array(uv), np.array(tris)

def face_loops(m, face):
    loops = []
    for bd in face[1]:
        bt, ba = m.P[bd[1]]; lt, la = m.P[ba[1][1]]
        if lt == 'VERTEX_LOOP':
            loops.append(('vertex', np.array([m.vec(m.R(la[1])[1][1])]))); continue
        pts = []
        for oe in la[1]:
            oa = m.P[oe[1]][1]; ec = oa[3][1]
            seg = sample_edge(m, ec, True)
            if oa[4] != ('.', 'T'): seg = seg[::-1]
            pts.append(seg if not pts else seg[1:])
        loops.append(('edge', np.vstack(pts)))
    return loops

def unwrap(uv, S):
    uv = uv.copy()
    for d in (0, 1):
        if S.period[d]: uv[:, d] = np.unwrap(uv[:, d], period=S.period[d])
    return uv

def mesh_face(m, fref, S):
    face = m.P[fref][1]; same = face[3] == ('.', 'T')
    loops = face_loops(m, face)
    edges3d = [p for k, p in loops if k == 'edge']
    uvl = []
    for kind, pts in loops:
        uv = unwrap(S.inv(pts), S)
        span = uv[-1] - uv[0]
        per = [bool(S.period[d]) and abs(abs(span[d]) - S.period[d]) < 0.05 * S.period[d] for d in (0, 1)]
        uvl.append((kind, pts, uv, per))
    edge_loops = [l for l in uvl if l[0] == 'edge']
    periodic_dir = None
    for d in (0, 1):
        if edge_loops and all(l[3][d] for l in edge_loops): periodic_dir = d
    if periodic_dir is not None and len(uvl) in (1, 2):
        d, e = periodic_dir, 1 - periodic_dir; T = S.period[d]
        base = getattr(S, 'ulo' if d == 0 else 'vlo', 0.0)
        g = np.linspace(base, base + T, 97)
        rails = []
        for kind, pts, uv, per in uvl:
            if kind == 'vertex': rails.append(np.full_like(g, uv[0, e])); continue
            dd = base + np.mod(uv[:, d] - base, T); o = np.argsort(dd)
            rails.append(np.interp(g, dd[o], uv[o, e], period=T))
        if len(rails) == 1:   # closed by the surface's own edge (pole of a degenerate patch)
            lo, hi = (S.vlo, S.vhi) if e == 1 and hasattr(S, 'vlo') else (S.ulo, S.uhi) if hasattr(S, 'ulo') else (None, None)
            other = hi if abs(np.mean(rails[0]) - lo) < abs(np.mean(rails[0]) - hi) else lo
            rails.append(np.full_like(g, other))
        if S.period[e]:   # take the short way round between the two rails
            T2 = S.period[e]; dlt = np.mean(rails[1] - rails[0])
            rails[1] = rails[1] - T2 * np.round(dlt / T2)
        if S.kind in ('cyl', 'cone'): M = 2
        else:
            mid = 48
            a_uv = np.zeros(2); b_uv = np.zeros(2); a_uv[d] = b_uv[d] = g[mid]; a_uv[e] = rails[0][mid]; b_uv[e] = rails[1][mid]
            M = resolution(S, a_uv, b_uv, e, lo=3, hi=48)
        s = np.linspace(0, 1, M)
        uvg = np.zeros((len(g), M, 2)); uvg[:, :, d] = g[:, None]
        uvg[:, :, e] = rails[0][:, None] + (rails[1] - rails[0])[:, None] * s[None, :]
        uv = uvg.reshape(-1, 2); tris = grid_mesh(len(g), M)
    else:
        outer_i = int(np.argmax([np.ptp(l[2][:, 0]) * np.ptp(l[2][:, 1]) if l[0] == 'edge' else -1 for l in uvl]))
        ouv = uvl[outer_i][2]
        others = [l for i, l in enumerate(uvl) if i != outer_i and l[0] == 'edge']
        # shift holes into the outer loop's periodic window
        for k, l in enumerate(others):
            h = l[2].copy()
            for dd in (0, 1):
                if S.period[dd]:
                    T = S.period[dd]; h[:, dd] += T * np.round((ouv[:, dd].mean() - h[:, dd].mean()) / T)
            others[k] = h
        box = np.ptp(ouv[:, 0]) * np.ptp(ouv[:, 1])
        if not others and S.kind != 'plane' and box > 0 and abs(poly_area(ouv[:-1])) / box > 0.97:
            u0, v0 = ouv.min(0); u1, v1 = ouv.max(0)
            nu = resolution(S, np.array([u0, (v0 + v1) / 2]), np.array([u1, (v0 + v1) / 2]), 0)
            nv = resolution(S, np.array([(u0 + u1) / 2, v0]), np.array([(u0 + u1) / 2, v1]), 1)
            U, V = np.meshgrid(np.linspace(u0, u1, nu), np.linspace(v0, v1, nv), indexing='ij')
            uv = np.c_[U.ravel(), V.ravel()]; tris = grid_mesh(nu, nv)
        else:
            rings = [ouv[:-1]] + [h[:-1] for h in others]
            flat = np.vstack(rings); holes = list(np.cumsum([len(r) for r in rings])[:-1])
            sc = np.ptp(flat, axis=0); sc[sc == 0] = 1
            norm = (flat - flat.min(0)) / sc
            tris = np.array(earcut(norm.ravel().tolist(), holes or None))
            uv = flat
            if len(tris) and S.kind != 'plane': uv, tris = refine(S, uv, tris)
    if len(tris) == 0: return None
    P = S.eval(uv)
    # orient triangles to the face's material side
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    gn = np.cross(b - a, c - a)
    cuv = (uv[tris[:, 0]] + uv[tris[:, 1]] + uv[tris[:, 2]]) / 3
    sn = S.normal(cuv) * (1 if same else -1)
    flip = np.einsum('ij,ij->i', gn, sn) < 0
    tris[flip] = tris[flip][:, [0, 2, 1]]
    a, b, c = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]; gn = np.cross(b - a, c - a)
    N = np.zeros_like(P)
    for k in range(3): np.add.at(N, tris[:, k], gn)
    l = np.linalg.norm(N, axis=1, keepdims=True); l[l == 0] = 1; N /= l
    keep = np.linalg.norm(gn, axis=1) > 1e-14
    return P, N, tris[keep], edges3d

# ---------------------------------------------------------------- assembly + GLB
def colour_of(m, brep):
    for k, (t, a) in m.P.items():
        if t == 'STYLED_ITEM' and a[2][1] == brep:
            stack = [a[1]]
            while stack:
                x = stack.pop()
                if isinstance(x, tuple) and x[0] == '#':
                    tt, aa = m.P[x[1]]
                    if tt == 'COLOUR_RGB': return aa[1:4]
                    if tt == 'DRAUGHTING_PRE_DEFINED_COLOUR': return {'white': [1, 1, 1]}.get(aa[0], [.8, .8, .8])
                    stack.append(aa)
                elif isinstance(x, (list, tuple)): stack.extend(x)
    return [.8, .8, .8]

def main(src, out):
    m = Model(src); P = m.P
    from asm_info import instances
    parts = {}
    for brep in sorted({i['brep'] for i in instances(m)}):
        shell = P[P[brep][1][1][1]][1][1]
        Vs, Ns, Ts, Ls, off = [], [], [], [], 0
        for fr in shell:
            S = make_surface(m, P[fr[1]][1][2][1])
            res = mesh_face(m, fr[1], S)
            if res is None: print('  face', fr[1], 'empty'); continue
            V, N, T, E = res
            Vs.append(V); Ns.append(N); Ts.append(T + off); off += len(V)
            for e in E: Ls.append(e)
        parts[brep] = dict(V=np.vstack(Vs), N=np.vstack(Ns), T=np.vstack(Ts), L=Ls, colour=colour_of(m, brep))
        print('brep', brep, 'verts', off, 'tris', len(parts[brep]['T']))
    write_glb(out, parts, instances(m))

def write_glb(path, parts, inst):
    bin_ = bytearray(); views = []; accessors = []; meshes = []; materials = []; mesh_of = {}
    def add(arr, target, comp, typ, minmax=False):
        data = arr.tobytes(); off = len(bin_); bin_.extend(data)
        while len(bin_) % 4: bin_.append(0)
        views.append(dict(buffer=0, byteOffset=off, byteLength=len(data), target=target))
        acc = dict(bufferView=len(views) - 1, componentType=comp, count=len(arr), type=typ)
        if minmax: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
        accessors.append(acc); return len(accessors) - 1
    for brep, p in parts.items():
        c = [float(x) for x in p['colour']]
        materials.append(dict(name=f'part-{brep}', pbrMetallicRoughness=dict(baseColorFactor=c + [1.0], metallicFactor=0.0, roughnessFactor=0.55), doubleSided=True))
        pos = add(p['V'].astype(np.float32), 34962, 5126, 'VEC3', True)
        nor = add(p['N'].astype(np.float32), 34962, 5126, 'VEC3')
        idx = add(p['T'].astype(np.uint32).ravel(), 34963, 5125, 'SCALAR')
        segs = np.vstack([np.c_[e[:-1], e[1:]].reshape(-1, 3) for e in p['L']]).astype(np.float32)
        lpos = add(segs, 34962, 5126, 'VEC3', True)
        meshes.append(dict(name=f'part-{brep}', primitives=[dict(attributes=dict(POSITION=pos, NORMAL=nor), indices=idx, material=len(materials) - 1, mode=4),
                                                         dict(attributes=dict(POSITION=lpos), material=len(materials) - 1, mode=1)]))
        mesh_of[brep] = len(meshes) - 1
    nodes = [dict(name='ICAV-SPI', matrix=[1, 0, 0, 0, 0, 0, -1, 0, 0, 1, 0, 0, 0, 0, 0, 1], children=[])]
    for k, i in enumerate(inst):
        nodes.append(dict(name=f"{i['name']}", mesh=mesh_of[i['brep']], matrix=i['M'].T.ravel().tolist()))
        nodes[0]['children'].append(len(nodes) - 1)
    gltf = dict(asset=dict(version='2.0', generator='ICAV SPI step2glb'), scene=0, scenes=[dict(nodes=[0])], nodes=nodes,
                meshes=meshes, materials=materials, accessors=accessors, bufferViews=views, buffers=[dict(byteLength=len(bin_))])
    js = json.dumps(gltf, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bin_)
    print('wrote', path, total, 'bytes')

if __name__ == '__main__': main(sys.argv[1], sys.argv[2])
