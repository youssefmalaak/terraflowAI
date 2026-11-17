from flask import Flask, render_template, request, jsonify
from time import perf_counter
from astar import astar
from simulation import make_graph, POSITIONS
from smart_irrigation import rank_fields, MAX_ACTIVE_ZONES

app = Flask(__name__)


@app.get("/")
def home():
    return render_template("index.html")


@app.post("/api/search")
def search():
    data = request.get_json(force=True)
    start = data.get("start", "RESERVOIR")
    goal = data.get("goal", "FIELD_A")
    blocked = [tuple(edge.split("--")) for edge in data.get("blocked", []) if "--" in edge]
    graph = make_graph(blocked, data.get("pump_on", True))

    started = perf_counter()
    result = astar(graph, POSITIONS, start, goal)
    elapsed_ms = (perf_counter() - started) * 1000
    edge_count = sum(len(neighbors) for neighbors in graph.values()) // 2
    result.update({
        "execution_time_ms": round(elapsed_ms, 4),
        "nodes_explored": len(result.get("explored", [])),
        "graph_nodes": len(graph),
        "graph_edges": edge_count,
        "algorithm": "A* Search",
        "cost_unit": "world units (pipe length)"
    })
    return jsonify(result)


@app.post("/api/schedule")
def schedule():
    data = request.get_json(force=True)
    moisture = data.get("moisture", {})
    targets = data.get("targets")
    ranked = rank_fields(moisture, targets)
    return jsonify({
        "algorithm": "Normalized Moisture Deficit Priority",
        "max_active_zones": MAX_ACTIVE_ZONES,
        "schedule": ranked,
        "priority_order": [item["field"] for item in ranked],
    })


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "service": "TerraFlow 3D Farm Digital Twin"})


if __name__ == "__main__":
    app.run(debug=True)
