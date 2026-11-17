from math import dist

NODES = ["RESERVOIR", "PUMP", "MAIN", "V1", "V2", "V3", "V4",
         "FIELD_A", "FIELD_B", "FIELD_C", "FIELD_D"]

# Coordinates match the 3D scene in static/app.js (x, y, z).
POSITIONS = {
    "RESERVOIR": (-10, 0, 5),
    "PUMP": (-7, 0, 5),
    "MAIN": (-3.5, 0, 2.5),
    "V1": (-8, 0, -1),
    "V2": (-3, 0, -1),
    "V3": (3, 0, -1),
    "V4": (8, 0, -1),
    "FIELD_A": (-8, 0, -5),
    "FIELD_B": (-2.7, 0, -5),
    "FIELD_C": (2.7, 0, -5),
    "FIELD_D": (8, 0, -5),
}

EDGES = [
    ("RESERVOIR", "PUMP"), ("PUMP", "MAIN"),
    ("MAIN", "V1"), ("MAIN", "V2"), ("MAIN", "V3"), ("MAIN", "V4"),
    ("V1", "FIELD_A"), ("V2", "FIELD_B"),
    ("V3", "FIELD_C"), ("V4", "FIELD_D"),
    ("V1", "V2"), ("V2", "V3"), ("V3", "V4")
]


def make_graph(blocked=None, pump_on=True):
    """Build an undirected weighted graph; each edge weight is pipe length."""
    blocked = {tuple(sorted(edge)) for edge in (blocked or [])}
    graph = {node: {} for node in NODES}
    for a, b in EDGES:
        edge = tuple(sorted((a, b)))
        if edge in blocked:
            continue
        if not pump_on and ("RESERVOIR" in (a, b) or "PUMP" in (a, b)):
            continue
        pipe_length = dist(POSITIONS[a], POSITIONS[b])
        graph[a][b] = pipe_length
        graph[b][a] = pipe_length
    return graph


def edge_key(a, b):
    return "--".join(sorted((a, b)))
