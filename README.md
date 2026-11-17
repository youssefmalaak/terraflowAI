# TerraFlow AI — Smart 3D Farm Digital Twin

## Project overview
TerraFlow is a browser-based 3D smart-farm simulation. It combines **A* Search** for minimum-distance water routing with a **Smart Irrigation Controller** that prioritizes fields according to their soil-moisture deficit and limits simultaneous irrigation to two zones.

This is an educational simulation. It does not connect to real sensors, pumps, valves, or IoT hardware. The two-zone capacity is a configurable simulation assumption, not a measured pump limit.

## Problem statement
The farm pipe network is a weighted, undirected graph. A* finds a minimum-distance route from the reservoir to a selected field while avoiding blocked pipes and respecting pump availability. Separately, the smart controller decides which fields should receive water first and how many zones may run simultaneously.

## Search problem formulation
| Element | Definition |
|---|---|
| State | A node/location: reservoir, pump, main junction, valves V1–V4, or a field |
| Initial state | `RESERVOIR` |
| Goal state | One selected field: `FIELD_A`, `FIELD_B`, `FIELD_C`, or `FIELD_D` |
| Actions | Move to an adjacent node through an available pipe |
| Transition model | A move is possible only when the pipe exists and is not blocked |
| Action cost | Physical length of the pipe in scene/world units |
| Path cost | Sum of pipe lengths along the route |
| Search algorithm | A* Search |

## Why A*?
The network is weighted because pipes have different physical lengths. BFS would minimize the number of edges rather than the actual modeled distance. A* evaluates each candidate using:

`f(n) = g(n) + h(n)`

- `g(n)`: exact route cost from the reservoir to node `n`.
- `h(n)`: straight-line 3D Euclidean distance from node `n` to the selected field.
- `f(n)`: estimated total route cost through node `n`.

The heuristic is admissible and consistent because straight-line distance cannot exceed the length of a connected polyline route. The graph edge weights are Euclidean distances between the 3D coordinates in `simulation.py`.

## Smart Irrigation Controller
The controller is separate from A*. A* solves **where water should travel**; the controller decides **which field receives water next**.

### Priority rule
For every field below its target moisture, calculate its normalized moisture deficit:

`priority = (target moisture - current moisture) / target moisture`

Fields are sorted from highest priority to lowest. A field already at or above its target is not scheduled. Ties are resolved by field ID to keep the schedule deterministic.

### Zone capacity and queue
- The configured maximum is **2 active irrigation zones** at a time (`MAX_ACTIVE_ZONES = 2`).
- The first two reachable fields in the priority order are activated.
- Remaining reachable fields wait in a queue.
- When an active field reaches its target moisture, its zone stops and the next queued field starts automatically.
- A blocked or unreachable field is excluded; other reachable fields can still be irrigated.
- Turning off the pump or emptying the reservoir cancels active and waiting zones.

With the initial values, the priority order is **Field D → Field A → Field B → Field C**. Field D has the largest normalized deficit, followed by A, B, and C.

## How the implementation works
- `simulation.py` stores 3D node coordinates and pipe connections, and builds a weighted graph. Blocked edges are omitted; turning the pump off disconnects the supply network.
- `astar.py` implements A* using a heap-based priority queue, path-cost scores, Euclidean heuristic values, parent tracking, and an explored-node trace.
- `smart_irrigation.py` ranks fields by normalized moisture deficit and splits the schedule into active and waiting zones.
- `app.py` exposes `/api/search` for A* routing and `/api/schedule` for smart priority scheduling.
- `static/app.js` requests the schedule, calculates A* routes, activates up to two reachable zones, advances the waiting queue as fields finish, and animates the water flow.
- `templates/index.html` and `static/style.css` provide the dashboard and active/waiting field states.
- `tests/` contains A*, graph, API, and smart-controller tests.

## Main interface features
- Interactive 3D farm with reservoir, pump, valves, pipes, and four crop fields.
- A* route search with explored-node order, `g`, `h`, and `f` trace, and physical path cost.
- Moisture-deficit priority scheduling.
- Maximum two active irrigation zones, with automatic queue advancement.
- Active and waiting field status indicators.
- Animated water particles, moisture simulation, and reservoir consumption.
- Normal, drought, blocked-pipe, and leak scenarios.
- Pump, automatic-control, pause, reset, and irrigation-cycle controls.

## Technology stack
Python, Flask, HTML, CSS, JavaScript, and Three.js.

## Requirements and run instructions
- Python 3.9 or newer
- Install dependencies: `python -m pip install -r requirements.txt`
- Start: `python app.py`
- Open `http://127.0.0.1:5000`

On Windows, optionally use a virtual environment:

```bat
python -m venv venv
venv\Scripts\activate
python -m pip install -r requirements.txt
python app.py
```

Run tests:

```bat
python -m unittest discover -s tests -v
```

## Evaluation measures
- **Solution found:** whether A* reaches the selected field.
- **Path cost:** sum of pipe lengths along the returned route.
- **Nodes explored:** number of nodes expanded by A*.
- **Execution time:** backend A* runtime in milliseconds, measured with `perf_counter`.
- **Priority score:** normalized moisture deficit for each requested field.
- **Active-zone count:** must never exceed the configured capacity of two.

## Complexity
For A* with a binary heap, the typical graph-search bound is `O((V + E) log V)` with `O(V + E)` storage, subject to heuristic and implementation details. Priority ranking for `F` fields takes `O(F log F)` time due to sorting; the farm currently has four fields.

## Limitations and scope
- This is a software simulation; it does not control physical farm equipment.
- Moisture, water consumption, weather, and water flow are illustrative values.
- The two-zone capacity is an explicit configurable assumption, not a hardware specification.
- A* optimizes modeled pipe distance, not pressure, flow rate, energy, or monetary cost.
- The leak scenario changes simulated reservoir consumption; it is not modeled as a blocked graph edge.
- The automatic-control toggle is a UI setting; **Run Irrigation Cycle** starts the priority scheduler.

## Conclusion
TerraFlow combines informed route finding with a simple smart irrigation policy. A* computes minimum-distance paths through the weighted pipe network, while the priority controller allocates the limited simulated irrigation capacity to the driest fields first. This separation makes the system easier to explain, test, and extend.
