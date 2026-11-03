# Compact Python port of mapbox/earcut (ISC licence) — polygon triangulation with holes.
class Node:
    __slots__ = ('i', 'x', 'y', 'prev', 'next', 'steiner')
    def __init__(s, i, x, y):
        s.i, s.x, s.y = i, x, y; s.prev = s.next = None; s.steiner = False

def earcut(data, hole_indices=None, dim=2):
    has_holes = bool(hole_indices)
    outer_len = hole_indices[0] * dim if has_holes else len(data)
    outer = linked_list(data, 0, outer_len, dim, True)
    tris = []
    if outer is None or outer.next is outer.prev: return tris
    if has_holes: outer = eliminate_holes(data, hole_indices, outer, dim)
    earcut_linked(outer, tris, 0)
    return tris

def linked_list(data, start, end, dim, clockwise):
    last = None
    if clockwise == (signed_area(data, start, end, dim) > 0):
        for i in range(start, end, dim): last = insert_node(i // dim, data[i], data[i + 1], last)
    else:
        for i in range(end - dim, start - 1, -dim): last = insert_node(i // dim, data[i], data[i + 1], last)
    if last and equals(last, last.next):
        remove_node(last); last = last.next
    return last

def filter_points(start, end=None):
    if start is None: return start
    if end is None: end = start
    p = start
    while True:
        again = False
        if not p.steiner and (equals(p, p.next) or area(p.prev, p, p.next) == 0):
            remove_node(p); p = end = p.prev
            if p is p.next: break
            again = True
        else: p = p.next
        if not (again or p is not end): break
    return end

def earcut_linked(ear, tris, pass_):
    if ear is None: return
    stop = ear
    while ear.prev is not ear.next:
        prev, nxt = ear.prev, ear.next
        if is_ear(ear):
            tris.append((prev.i, ear.i, nxt.i))
            remove_node(ear); ear = nxt.next; stop = nxt.next
            continue
        ear = nxt
        if ear is stop:
            if pass_ == 0: earcut_linked(filter_points(ear), tris, 1)
            elif pass_ == 1:
                ear = cure_local_intersections(filter_points(ear), tris)
                earcut_linked(ear, tris, 2)
            elif pass_ == 2: split_earcut(ear, tris)
            break

def is_ear(ear):
    a, b, c = ear.prev, ear, ear.next
    if area(a, b, c) >= 0: return False
    x0, x1 = min(a.x, b.x, c.x), max(a.x, b.x, c.x); y0, y1 = min(a.y, b.y, c.y), max(a.y, b.y, c.y)
    p = c.next
    while p is not a:
        if x0 <= p.x <= x1 and y0 <= p.y <= y1 and point_in_triangle(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) and area(p.prev, p, p.next) >= 0:
            return False
        p = p.next
    return True

def cure_local_intersections(start, tris):
    p = start
    while True:
        a, b = p.prev, p.next.next
        if not equals(a, b) and intersects(a, p, p.next, b) and locally_inside(a, b) and locally_inside(b, a):
            tris.append((a.i, p.i, b.i)); remove_node(p); remove_node(p.next); p = start = b
        p = p.next
        if p is start: break
    return filter_points(p)

def split_earcut(start, tris):
    a = start
    while True:
        b = a.next.next
        while b is not a.prev:
            if a.i != b.i and is_valid_diagonal(a, b):
                c = split_polygon(a, b)
                a = filter_points(a, a.next); c = filter_points(c, c.next)
                earcut_linked(a, tris, 0); earcut_linked(c, tris, 0)
                return
            b = b.next
        a = a.next
        if a is start: break

def eliminate_holes(data, hole_indices, outer, dim):
    queue = []
    for k, h in enumerate(hole_indices):
        start = h * dim
        end = hole_indices[k + 1] * dim if k + 1 < len(hole_indices) else len(data)
        lst = linked_list(data, start, end, dim, False)
        if lst is lst.next: lst.steiner = True
        queue.append(get_leftmost(lst))
    queue.sort(key=lambda n: (n.x, n.y))
    for h in queue: outer = eliminate_hole(h, outer)
    return outer

def eliminate_hole(hole, outer):
    bridge = find_hole_bridge(hole, outer)
    if bridge is None: return outer
    bridge_reverse = split_polygon(bridge, hole)
    filter_points(bridge_reverse, bridge_reverse.next)
    return filter_points(bridge, bridge.next)

def find_hole_bridge(hole, outer):
    p = outer; hx, hy = hole.x, hole.y; qx = -float('inf'); m = None
    while True:
        if hy <= p.y and hy >= p.next.y and p.next.y != p.y:
            x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y)
            if hx >= x > qx:
                qx = x; m = p if p.x < p.next.x else p.next
                if x == hx: return m
        p = p.next
        if p is outer: break
    if m is None: return None
    stop = m; mx, my = m.x, m.y; tan_min = float('inf'); p = m
    while True:
        if hx >= p.x >= mx and hx != p.x and point_in_triangle(hx if hy < my else qx, hy, mx, my, qx if hy < my else hx, hy, p.x, p.y):
            tan = abs(hy - p.y) / (hx - p.x)
            if locally_inside(p, hole) and (tan < tan_min or (tan == tan_min and (p.x > m.x or (p.x == m.x and sector_contains_sector(m, p))))):
                m = p; tan_min = tan
        p = p.next
        if p is stop: break
    return m

def sector_contains_sector(m, p): return area(m.prev, m, p.prev) < 0 and area(p.next, m, m.next) < 0
def get_leftmost(start):
    p = start; left = start
    while True:
        if p.x < left.x or (p.x == left.x and p.y < left.y): left = p
        p = p.next
        if p is start: break
    return left
def point_in_triangle(ax, ay, bx, by, cx, cy, px, py):
    return (cx - px) * (ay - py) >= (ax - px) * (cy - py) and (ax - px) * (by - py) >= (bx - px) * (ay - py) and (bx - px) * (cy - py) >= (cx - px) * (by - py)
def is_valid_diagonal(a, b):
    return (a.next.i != b.i and a.prev.i != b.i and not intersects_polygon(a, b) and
            ((locally_inside(a, b) and locally_inside(b, a) and middle_inside(a, b) and (area(a.prev, a, b.prev) or area(a, b.prev, b))) or
             (equals(a, b) and area(a.prev, a, a.next) > 0 and area(b.prev, b, b.next) > 0)))
def area(p, q, r): return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y)
def equals(a, b): return a.x == b.x and a.y == b.y
def sign(v): return (v > 0) - (v < 0)
def on_segment(p, q, r): return min(p.x, r.x) <= q.x <= max(p.x, r.x) and min(p.y, r.y) <= q.y <= max(p.y, r.y)
def intersects(p1, q1, p2, q2):
    o1, o2, o3, o4 = sign(area(p1, q1, p2)), sign(area(p1, q1, q2)), sign(area(p2, q2, p1)), sign(area(p2, q2, q1))
    if o1 != o2 and o3 != o4: return True
    if o1 == 0 and on_segment(p1, p2, q1): return True
    if o2 == 0 and on_segment(p1, q2, q1): return True
    if o3 == 0 and on_segment(p2, p1, q2): return True
    if o4 == 0 and on_segment(p2, q1, q2): return True
    return False
def intersects_polygon(a, b):
    p = a
    while True:
        if p.i != a.i and p.next.i != a.i and p.i != b.i and p.next.i != b.i and intersects(p, p.next, a, b): return True
        p = p.next
        if p is a: break
    return False
def locally_inside(a, b):
    if area(a.prev, a, a.next) < 0: return area(a, b, a.next) >= 0 and area(a, a.prev, b) >= 0
    return area(a, b, a.prev) < 0 or area(a, a.next, b) < 0
def middle_inside(a, b):
    p = a; inside = False; px, py = (a.x + b.x) / 2, (a.y + b.y) / 2
    while True:
        if ((p.y > py) != (p.next.y > py)) and p.next.y != p.y and px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x: inside = not inside
        p = p.next
        if p is a: break
    return inside
def split_polygon(a, b):
    a2 = Node(a.i, a.x, a.y); b2 = Node(b.i, b.x, b.y); an, bp = a.next, b.prev
    a.next = b; b.prev = a; a2.next = an; an.prev = a2; b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp
    return b2
def insert_node(i, x, y, last):
    p = Node(i, x, y)
    if last is None: p.prev = p.next = p
    else: p.next = last.next; p.prev = last; last.next.prev = p; last.next = p
    return p
def remove_node(p): p.next.prev = p.prev; p.prev.next = p.next
def signed_area(data, start, end, dim):
    s = 0; j = end - dim
    for i in range(start, end, dim):
        s += (data[j] - data[i]) * (data[i + 1] + data[j + 1]); j = i
    return s
