import numpy as np
NAMES = {1309: 'Motor and spinner', 1310: 'Tailplane', 1311: 'Pod and boom', 1312: 'Wing', 1313: 'Payload fairing', 1314: 'Fin'}
def placement(m, ref):
    o, x, y, z = m.frame(('#', ref)); M = np.eye(4); M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = x, y, z, o; return M
def instances(m):
    P = m.P; R = lambda r: r[1]
    sr2absr = {}
    for k, (t, a) in P.items():
        if t == 'SHAPE_REPRESENTATION_RELATIONSHIP':
            r1, r2 = R(a[2]), R(a[3])
            for s, b in ((r1, r2), (r2, r1)):
                if P[s][0] == 'SHAPE_REPRESENTATION' and P[b][0] == 'ADVANCED_BREP_SHAPE_REPRESENTATION': sr2absr[s] = b
    pd2sr = {}; pds_of = {}
    for k, (t, a) in P.items():
        if t == 'SHAPE_DEFINITION_REPRESENTATION': pd2sr[R(P[R(a[0])][1][2])] = R(a[1])
        if t == 'PRODUCT_DEFINITION_SHAPE': pds_of[k] = R(a[2])
    out = []
    for k, (t, a) in P.items():
        if t == 'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION':
            rel = P[R(a[0])][1]; nauo = pds_of[R(a[1])]
            ia = P[R(rel['REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION'][0])][1]
            M = placement(m, R(ia[3])) @ np.linalg.inv(placement(m, R(ia[2])))
            absr = sr2absr[pd2sr[R(P[nauo][1][4])]]
            brep = R(P[absr][1][1][0])
            out.append(dict(brep=brep, M=M, name=NAMES.get(brep, 'Part')))
    return out
