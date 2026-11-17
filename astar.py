"""A* search for the TerraFlow weighted irrigation network."""
from heapq import heappush, heappop
from math import dist, inf


def astar(graph, positions, start, goal):
    """Find a minimum-distance route using A* and Euclidean-distance heuristic.

    graph maps each node to {neighbor: pipe_length}. All edge weights must be
    non-negative. The heuristic is straight-line distance to the goal.
    """
    if start not in graph or goal not in graph or start not in positions or goal not in positions:
        return {
            "found": False, "path": [], "explored": [], "cost": None,
            "steps": [], "algorithm": "A* Search"
        }

    def heuristic(node):
        return dist(positions[node], positions[goal])

    open_heap = []
    counter = 0
    heappush(open_heap, (heuristic(start), 0.0, counter, start))
    came_from = {}
    g_score = {node: inf for node in graph}
    g_score[start] = 0.0
    closed = set()
    explored = []
    steps = []

    while open_heap:
        f_score, queued_g, _, current = heappop(open_heap)
        if current in closed or queued_g > g_score[current] + 1e-12:
            continue

        closed.add(current)
        explored.append(current)
        current_h = heuristic(current)
        open_nodes = [
            {"node": node, "g": round(g, 3), "h": round(heuristic(node), 3),
             "f": round(g + heuristic(node), 3)}
            for node, g in sorted(g_score.items())
            if g < inf and node not in closed
        ]
        steps.append({
            "current": current,
            "open": open_nodes,
            "g": round(g_score[current], 3),
            "h": round(current_h, 3),
            "f": round(g_score[current] + current_h, 3)
        })

        if current == goal:
            path = [current]
            while current in came_from:
                current = came_from[current]
                path.append(current)
            path.reverse()
            return {
                "found": True,
                "path": path,
                "explored": explored,
                "cost": round(g_score[goal], 3),
                "steps": steps,
                "algorithm": "A* Search"
            }

        for neighbor, edge_cost in graph.get(current, {}).items():
            if edge_cost < 0:
                raise ValueError("A* requires non-negative pipe costs")
            tentative_g = g_score[current] + edge_cost
            if tentative_g + 1e-12 < g_score.get(neighbor, inf):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                if neighbor in closed:
                    closed.remove(neighbor)
                counter += 1
                heappush(
                    open_heap,
                    (tentative_g + heuristic(neighbor), tentative_g, counter, neighbor)
                )

    return {
        "found": False, "path": [], "explored": explored,
        "cost": None, "steps": steps, "algorithm": "A* Search"
    }
