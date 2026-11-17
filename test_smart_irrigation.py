import unittest
from smart_irrigation import rank_fields, select_active_zones, MAX_ACTIVE_ZONES


class SmartIrrigationTests(unittest.TestCase):
    def setUp(self):
        self.targets = {"FIELD_A": 65, "FIELD_B": 68, "FIELD_C": 65, "FIELD_D": 70}
        self.moisture = {"FIELD_A": 38, "FIELD_B": 54, "FIELD_C": 62, "FIELD_D": 29}

    def test_priority_uses_normalized_moisture_deficit(self):
        ranked = rank_fields(self.moisture, self.targets)
        self.assertEqual([item["field"] for item in ranked],
                         ["FIELD_D", "FIELD_A", "FIELD_B", "FIELD_C"])
        self.assertGreater(ranked[0]["priority"], ranked[1]["priority"])

    def test_fields_at_target_are_not_scheduled(self):
        moisture = dict(self.moisture, FIELD_D=70)
        self.assertNotIn("FIELD_D", [item["field"] for item in rank_fields(moisture, self.targets)])

    def test_only_two_zones_start_at_once(self):
        ranked = rank_fields(self.moisture, self.targets)
        active, waiting = select_active_zones(ranked)
        self.assertEqual(active, ["FIELD_D", "FIELD_A"])
        self.assertEqual(waiting, ["FIELD_B", "FIELD_C"])
        self.assertEqual(len(active), MAX_ACTIVE_ZONES)

    def test_scheduler_supports_custom_capacity(self):
        active, waiting = select_active_zones(["A", "B", "C"], capacity=1)
        self.assertEqual(active, ["A"])
        self.assertEqual(waiting, ["B", "C"])

    def test_capacity_must_be_positive(self):
        with self.assertRaises(ValueError):
            select_active_zones(["A"], capacity=0)


if __name__ == "__main__":
    unittest.main()
