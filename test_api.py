import unittest
from app import app


class SearchAPITests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()

    def test_search_returns_astar_evaluation_metrics(self):
        response = self.client.post('/api/search', json={
            'start': 'RESERVOIR',
            'goal': 'FIELD_D',
            'blocked': [],
            'pump_on': True
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data['found'])
        self.assertEqual(data['algorithm'], 'A* Search')
        self.assertGreater(data['cost'], 0)
        self.assertEqual(data['cost_unit'], 'world units (pipe length)')
        self.assertIn('execution_time_ms', data)
        self.assertGreaterEqual(data['execution_time_ms'], 0)
        self.assertEqual(data['nodes_explored'], len(data['explored']))
        self.assertEqual(data['graph_nodes'], 11)
        self.assertEqual(data['graph_edges'], 13)

    def test_smart_schedule_returns_priority_and_capacity(self):
        response = self.client.post('/api/schedule', json={
            'moisture': {'FIELD_A': 38, 'FIELD_B': 54, 'FIELD_C': 62, 'FIELD_D': 29},
            'targets': {'FIELD_A': 65, 'FIELD_B': 68, 'FIELD_C': 65, 'FIELD_D': 70}
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data['max_active_zones'], 2)
        self.assertEqual(data['priority_order'], ['FIELD_D', 'FIELD_A', 'FIELD_B', 'FIELD_C'])
        self.assertEqual(data['algorithm'], 'Normalized Moisture Deficit Priority')


if __name__ == '__main__':
    unittest.main()
