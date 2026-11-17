import unittest
from astar import astar
from simulation import make_graph, POSITIONS


class AStarTests(unittest.TestCase):
    def test_route_to_field_a(self):
        result = astar(make_graph(), POSITIONS, "RESERVOIR", "FIELD_A")
        self.assertTrue(result["found"])
        self.assertEqual(result["path"][0], "RESERVOIR")
        self.assertEqual(result["path"][-1], "FIELD_A")
        self.assertGreater(result["cost"], 0)

    def test_blocked_pipe_removes_route(self):
        blocked = [("V1", "FIELD_A"), ("V1", "V2"), ("MAIN", "V1")]
        result = astar(make_graph(blocked), POSITIONS, "RESERVOIR", "FIELD_A")
        self.assertFalse(result["found"])

    def test_pump_off_disconnects_network(self):
        result = astar(make_graph(pump_on=False), POSITIONS, "RESERVOIR", "FIELD_D")
        self.assertFalse(result["found"])

    def test_astar_returns_physical_distance_cost(self):
        result = astar(make_graph(), POSITIONS, "RESERVOIR", "FIELD_D")
        self.assertTrue(result["found"])
        self.assertAlmostEqual(
            result["cost"],
            sum(
                make_graph()[a][b]
                for a, b in zip(result["path"], result["path"][1:])
            ),
            places=3
        )

    def test_astar_cost_matches_dijkstra_reference(self):
        import heapq
        graph = make_graph()
        start, goal = "RESERVOIR", "FIELD_D"
        distances = {node: float("inf") for node in graph}
        distances[start] = 0.0
        queue = [(0.0, start)]
        while queue:
            cost, node = heapq.heappop(queue)
            if cost != distances[node]:
                continue
            for neighbor, weight in graph[node].items():
                candidate = cost + weight
                if candidate < distances[neighbor]:
                    distances[neighbor] = candidate
                    heapq.heappush(queue, (candidate, neighbor))
        result = astar(graph, POSITIONS, start, goal)
        self.assertAlmostEqual(result["cost"], distances[goal], places=3)

    def test_all_four_fields_are_reachable(self):
        graph = make_graph()
        for field in ("FIELD_A", "FIELD_B", "FIELD_C", "FIELD_D"):
            with self.subTest(field=field):
                self.assertTrue(astar(graph, POSITIONS, "RESERVOIR", field)["found"])


if __name__ == "__main__":
    unittest.main()
