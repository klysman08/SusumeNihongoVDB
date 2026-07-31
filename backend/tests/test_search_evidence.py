from app.config import Settings
from app.models import SearchResult
from app.services import VectorIndex


def passage(*, dense: float | None, lexical: float | None, text: str = "Japanese particles") -> SearchResult:
    return SearchResult(
        id="point",
        document_id="document",
        title="Particles",
        text=text,
        source_type="book",
        chunk_index=0,
        score=0.01,
        dense_score=dense,
        lexical_score=lexical,
    )


def test_near_floor_dense_noise_requires_corroboration() -> None:
    index = VectorIndex(Settings(dense_relevance_floor=0.25))
    assert not index.has_evidence([passage(dense=0.27, lexical=None)], "zxqv plutonium nebula")
    assert index.has_evidence(
        [passage(dense=0.27, lexical=2.0, text="The direct object particle is を")],
        "direct object particle",
    )
    assert index.has_evidence([passage(dense=0.55, lexical=None)], "semantic paraphrase")
