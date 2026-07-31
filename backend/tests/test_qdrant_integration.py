"""Live Qdrant smoke tests.

Run with RUN_QDRANT_INTEGRATION=1 and the normal QDRANT_* environment. The file
also runs directly with unittest, which lets the production backend image verify
its baked FastEmbed assets against the private Qdrant network.
"""

import os
import unittest

from app.config import Settings
from app.models import SearchRequest
from app.services import VectorIndex


@unittest.skipUnless(os.getenv("RUN_QDRANT_INTEGRATION") == "1", "live Qdrant test is opt-in")
class QdrantIntegrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.index = VectorIndex(Settings())

    def test_collection_schema_payload_indexes_and_corpus(self) -> None:
        info = self.index.client.get_collection(self.index.settings.qdrant_collection)
        self.assertEqual(info.config.params.vectors["dense"].size, 384)
        self.assertIn("bm25", info.config.params.sparse_vectors)
        for field in ("document_id", "source_type", "level", "tags", "content_hash"):
            self.assertIn(field, info.payload_schema)
        self.assertGreater(info.points_count or 0, 64)

    def test_hybrid_english_japanese_romaji_and_level_filter(self) -> None:
        english = self.index.search(
            SearchRequest(query="What particle marks the direct object?", top_k=5, levels=["N5"])
        )
        self.assertTrue(english)
        self.assertTrue(all(result.level == "N5" for result in english))
        self.assertIn("Particle を", english[0].title)
        self.assertTrue(any(result.lexical_score for result in english))
        self.assertTrue(any(result.dense_score for result in english))

        japanese = self.index.search(
            SearchRequest(query="はずだ はいつ使いますか", top_k=5, levels=["N3"])
        )
        self.assertTrue(japanese)
        self.assertTrue(all(result.level == "N3" for result in japanese))
        self.assertTrue(any("はず" in result.text for result in japanese))

        romaji = self.index.search(SearchRequest(query="gakkou particle de", top_k=5))
        self.assertTrue(any("Particles" in result.title or "Particle" in result.title for result in romaji))

    def test_irrelevant_query_is_rejected_as_evidence(self) -> None:
        query = "zxqv plutonium nebula"
        results = self.index.search(SearchRequest(query=query, top_k=5))
        self.assertFalse(self.index.has_evidence(results, query))


if __name__ == "__main__":
    unittest.main(verbosity=2)

