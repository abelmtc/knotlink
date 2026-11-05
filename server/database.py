"""
Database layer for storing game results.
Uses MongoDB via pymongo.
"""

import os
import json
from typing import Optional, List
from datetime import datetime
from pymongo import MongoClient, ASCENDING
from pymongo.errors import ConnectionFailure


_client = None


def get_client():
    """One shared client. A short server-selection timeout keeps API requests (e.g. /classify)
    from blocking for pymongo's 30 s default when MongoDB is not running."""
    global _client
    if _client is None:
        uri = os.environ.get("MONGODB_URI", "mongodb://localhost:27017/")
        timeout_ms = int(os.environ.get("MONGODB_TIMEOUT_MS", "2000"))
        _client = MongoClient(uri, serverSelectionTimeoutMS=timeout_ms)
    return _client


def get_collection():
    client = get_client()
    db_name = os.environ.get("MONGODB_DB", "knotlink")
    return client[db_name]["games"]


def init_db():
    """Create indexes for common research queries."""
    col = get_collection()
    col.create_index([("game_id", ASCENDING)], unique=True)
    col.create_index([("is_unknot", ASCENDING)])
    col.create_index([("num_crossings", ASCENDING)])
    col.create_index([("jones_poly_is_one", ASCENDING)])
    col.create_index([("created_at", ASCENDING)])
    print("MongoDB indexes created successfully")


def save_game_result(
    game_id: str,
    initial_board: List,
    final_board: List,
    rows: int,
    cols: int,
    num_unresolved: int,
    starting_player: str,
    winner: Optional[str],
    move_sequence: List,
    classification: Optional[dict],
):
    """
    Persist a completed game to MongoDB.
    Upserts so it's safe to call multiple times for the same game.
    """
    is_unknot = None
    num_crossings = None
    jones_polynomial = None
    classification_method = None
    gauss_code = None

    if classification:
        is_unknot = classification.get("is_unknot")
        num_crossings = classification.get("num_crossings")
        jones_polynomial = classification.get("jones_polynomial")
        classification_method = classification.get("reason")
        gauss_code = classification.get("gauss_code")

    # The key research flag: nontrivial knot where Jones polynomial equals 1
    jones_poly_is_one = (
        is_unknot == False and
        jones_polynomial is not None and
        _is_jones_poly_one(jones_polynomial)
    )

    document = {
        "game_id": game_id,
        "created_at": datetime.utcnow(),

        # Board data
        "initial_board": initial_board,
        "final_board": final_board,
        "rows": rows,
        "cols": cols,
        "num_unresolved": num_unresolved,

        # Game result
        "starting_player": starting_player,
        "winner": winner,
        "move_sequence": move_sequence,

        # Classification
        "is_unknot": is_unknot,
        "num_crossings": num_crossings,
        "jones_polynomial": jones_polynomial,
        "classification_method": classification_method,
        "gauss_code": gauss_code,

        # Research flag
        "jones_poly_is_one": jones_poly_is_one,
    }

    col = get_collection()
    col.update_one(
        {"game_id": game_id},
        {"$set": document},
        upsert=True
    )


def _is_jones_poly_one(jones_polynomial) -> bool:
    if jones_polynomial is None:
        return False
    if isinstance(jones_polynomial, str):
        # SageMath represents the trivial Jones polynomial as "1"
        return jones_polynomial.strip() == "1"
    if isinstance(jones_polynomial, dict):
        return jones_polynomial == {"0": 1} or jones_polynomial == {0: 1}
    if isinstance(jones_polynomial, list):
        non_zero = [c for c in jones_polynomial if c != 0]
        return len(non_zero) == 1 and non_zero[0] == 1
    return False


def get_interesting_games():
    """Return all nontrivial knot results, sorted by crossing count."""
    col = get_collection()
    results = col.find(
        {"is_unknot": False},
        {"_id": 0}  # exclude MongoDB internal _id from results
    ).sort("num_crossings", ASCENDING)
    return list(results)


def get_jones_poly_one_games():
    """
    Return games where result is nontrivial but Jones polynomial is 1.
    These are the counterevidence candidates.
    """
    col = get_collection()
    results = col.find(
        {"jones_poly_is_one": True},
        {"_id": 0}
    ).sort("created_at", ASCENDING)
    return list(results)


def get_stats():
    """Summary statistics for the research dashboard."""
    col = get_collection()
    return {
        "total_games": col.count_documents({}),
        "completed_games": col.count_documents({"winner": {"$ne": None}}),
        "knot_results": col.count_documents({"is_unknot": False}),
        "unknot_results": col.count_documents({"is_unknot": True}),
        "jones_poly_one_candidates": col.count_documents({"jones_poly_is_one": True}),
        "knotter_wins": col.count_documents({"winner": "knotter"}),
        "unknotter_wins": col.count_documents({"winner": "unknotter"}),
    }