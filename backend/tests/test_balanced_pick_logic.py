"""Backend tests for the BALANCED-PICK fix in cluster_engine.py.

The bug: the engine picked 1X/X2/12 even when the match was balanced
(|λ_home - λ_away| < 0.30). The fix introduces an asymmetric boost
(only when there is a CLEAR direction) plus a penalty when balanced.

These tests exercise the structural engine through the public endpoint
POST /api/predict/structural which calls structural_analysis(odds) directly.
"""
import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _post_structural(api_client, base_url, odds: dict) -> dict:
    """Call /api/predict/structural with given odds and return parsed json."""
    r = api_client.post(f"{base_url}/api/predict/structural",
                        json={"odds": odds}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def _top_markets(result: dict, n: int = 3):
    return [r["market"] for r in (result.get("ranking") or [])[:n]]


# ---------------------------------------------------------------------------
# 1) MATCH BILANCIATO — pick must NOT be 1X / X2 / 12 secco
# ---------------------------------------------------------------------------

class TestBalancedMatchPick:
    """User case: Columbus Crew 2 vs Connecticut United, λ ~ 1.64 vs 1.69."""

    # Odds quoted by the user description: 1=2.45, X=3.50, 2=2.35
    BALANCED_ODDS = {
        "odd_1": 2.45, "odd_X": 3.50, "odd_2": 2.35,
        "odd_1X": 1.45, "odd_X2": 1.40, "odd_12": 1.22,
        "odd_O15": 1.35, "odd_U15": 2.80,
        "odd_O25": 1.95, "odd_U25": 1.80,
        "odd_O35": 3.20, "odd_U35": 1.30,
        "odd_GG": 1.80, "odd_NG": 1.90,
    }

    def test_lambdas_are_balanced(self, api_client, base_url):
        """Sanity: gap λ < 0.30 (user reported 0.05)."""
        res = _post_structural(api_client, base_url, self.BALANCED_ODDS)
        lh = res["structure"]["lambda_home"]
        la = res["structure"]["lambda_away"]
        gap = abs(lh - la)
        assert gap < 0.30, f"Test setup wrong: gap={gap} (lh={lh}, la={la})"

    def test_pick_is_not_double_chance(self, api_client, base_url):
        """The MAIN pick must NOT be 1X / X2 / 12 in a balanced match."""
        res = _post_structural(api_client, base_url, self.BALANCED_ODDS)
        pick = (res.get("pick") or {}).get("market", "")
        assert pick not in ("1X", "X2", "12"), (
            f"Bug regressed: pick is '{pick}' in a balanced match. "
            f"λ_h={res['structure']['lambda_home']}, "
            f"λ_a={res['structure']['lambda_away']}"
        )

    def test_double_chance_not_in_top_3(self, api_client, base_url):
        """1X / X2 must not appear in the top-3 of the structural ranking."""
        res = _post_structural(api_client, base_url, self.BALANCED_ODDS)
        top3 = _top_markets(res, 3)
        assert "1X" not in top3, f"1X in top-3 of balanced match: {top3}"
        assert "X2" not in top3, f"X2 in top-3 of balanced match: {top3}"


# ---------------------------------------------------------------------------
# 2) CASA MOLTO FAVORITA — 1X / 1 / 1+O1.5 allowed (regression)
# ---------------------------------------------------------------------------

class TestStrongHomeFavorite:
    """λ_h - λ_a >= 0.30: home is the clear favorite."""

    # Strong home: 1=1.55, X=3.80, 2=5.50; high over.
    HOME_FAV_ODDS = {
        "odd_1": 1.55, "odd_X": 3.80, "odd_2": 5.50,
        "odd_1X": 1.18, "odd_X2": 2.30, "odd_12": 1.25,
        "odd_O15": 1.25, "odd_U15": 3.60,
        "odd_O25": 1.70, "odd_U25": 2.10,
        "odd_O35": 2.50, "odd_U35": 1.50,
        "odd_GG": 1.85, "odd_NG": 1.85,
    }

    def test_lambdas_have_direction(self, api_client, base_url):
        res = _post_structural(api_client, base_url, self.HOME_FAV_ODDS)
        lh = res["structure"]["lambda_home"]
        la = res["structure"]["lambda_away"]
        assert lh - la >= 0.30, f"Test setup wrong: lh-la={lh-la}"

    def test_pick_is_home_oriented(self, api_client, base_url):
        """Pick must be home-side or neutral over — never X2/2."""
        res = _post_structural(api_client, base_url, self.HOME_FAV_ODDS)
        pick = (res.get("pick") or {}).get("market", "")
        assert pick not in ("X2", "2", "DC X2 + O1.5", "DC X2 + O2.5",
                            "DC X2 + GG", "DC X2 + U3.5", "2 + O1.5",
                            "2 + O2.5"), (
            f"Pick '{pick}' is away-side in a home-favored match."
        )

    def test_1X_not_penalized(self, api_client, base_url):
        """Regression: 1X must NOT be heavily penalized when home is favored.
        Either appears in the ranking or 1/1+Over emerges naturally."""
        res = _post_structural(api_client, base_url, self.HOME_FAV_ODDS)
        markets = [r["market"] for r in res.get("ranking", [])]
        # At least one of these home-oriented picks should be present
        home_oriented = {"1", "1X", "1 + O1.5", "1 + O2.5",
                        "DC 1X + O1.5", "DC 1X + O2.5", "DC 1X + GG"}
        assert any(m in home_oriented for m in markets), (
            f"No home-oriented market in ranking: {markets[:5]}"
        )


# ---------------------------------------------------------------------------
# 3) OSPITE MOLTO FAVORITO — 2 / X2 / 2+O1.5 allowed (regression)
# ---------------------------------------------------------------------------

class TestStrongAwayFavorite:
    """λ_a - λ_h >= 0.30: away is the clear favorite."""

    AWAY_FAV_ODDS = {
        "odd_1": 5.50, "odd_X": 3.80, "odd_2": 1.55,
        "odd_1X": 2.30, "odd_X2": 1.18, "odd_12": 1.25,
        "odd_O15": 1.25, "odd_U15": 3.60,
        "odd_O25": 1.70, "odd_U25": 2.10,
        "odd_O35": 2.50, "odd_U35": 1.50,
        "odd_GG": 1.85, "odd_NG": 1.85,
    }

    def test_lambdas_have_direction(self, api_client, base_url):
        res = _post_structural(api_client, base_url, self.AWAY_FAV_ODDS)
        lh = res["structure"]["lambda_home"]
        la = res["structure"]["lambda_away"]
        assert la - lh >= 0.30, f"Test setup wrong: la-lh={la-lh}"

    def test_pick_is_away_oriented(self, api_client, base_url):
        res = _post_structural(api_client, base_url, self.AWAY_FAV_ODDS)
        pick = (res.get("pick") or {}).get("market", "")
        assert pick not in ("1X", "1", "DC 1X + O1.5", "DC 1X + O2.5",
                            "DC 1X + GG", "DC 1X + U3.5", "1 + O1.5",
                            "1 + O2.5"), (
            f"Pick '{pick}' is home-side in an away-favored match."
        )

    def test_X2_not_penalized(self, api_client, base_url):
        res = _post_structural(api_client, base_url, self.AWAY_FAV_ODDS)
        markets = [r["market"] for r in res.get("ranking", [])]
        away_oriented = {"2", "X2", "2 + O1.5", "2 + O2.5",
                        "DC X2 + O1.5", "DC X2 + O2.5", "DC X2 + GG"}
        assert any(m in away_oriented for m in markets), (
            f"No away-oriented market in ranking: {markets[:5]}"
        )


# ---------------------------------------------------------------------------
# 4) REGRESSION: POST /api/matches/{id}/predict still works
# ---------------------------------------------------------------------------

class TestPredictEndpointRegression:

    @pytest.fixture(scope='class', autouse=True)
    def _seed(self, api_client, base_url):
        # Clean & seed via direct import (no Excel needed)
        api_client.delete(f"{base_url}/api/matches/all", timeout=15)
        new_match = {
            "id": "test-balanced-regression-1",
            "day": "2030-06-01",
            "time": "20:45",
            "manifestazione": "TEST_BALANCED",
            "squadra1": "TEST_HomeFav",
            "squadra2": "TEST_AwayDog",
            "odds": {
                "odd_1": 1.55, "odd_X": 3.80, "odd_2": 5.50,
                "odd_1X": 1.18, "odd_X2": 2.30, "odd_12": 1.25,
                "odd_O15": 1.25, "odd_U15": 3.60,
                "odd_O25": 1.70, "odd_U25": 2.10,
                "odd_O35": 2.50, "odd_U35": 1.50,
                "odd_GG": 1.85, "odd_NG": 1.85,
                "estimated": [],
            },
            "selected": False,
        }
        r = api_client.post(f"{base_url}/api/import",
                            json={"matches": [new_match], "predictions": []},
                            timeout=15)
        assert r.status_code == 200, r.text
        yield
        api_client.delete(f"{base_url}/api/matches/all", timeout=15)

    def test_predict_returns_valid_pick(self, api_client, base_url):
        ms = api_client.get(f"{base_url}/api/matches",
                            params={'q': 'HomeFav'}, timeout=10).json()
        assert ms, "Seed match not present"
        mid = ms[0]['id']
        r = api_client.post(f"{base_url}/api/matches/{mid}/predict",
                            timeout=90)
        assert r.status_code == 200, r.text
        pred = r.json()
        assert pred.get("main_prediction"), f"No main_prediction: {pred}"
        assert "family" in pred
        assert "playable_markets" in pred
        assert "_id" not in pred


# ---------------------------------------------------------------------------
# 5) REGRESSION: structural ranking is sane shape on every scenario
# ---------------------------------------------------------------------------

class TestRankingShape:

    def test_ranking_has_required_fields(self, api_client, base_url):
        res = _post_structural(api_client, base_url,
                               TestBalancedMatchPick.BALANCED_ODDS)
        assert "ranking" in res and isinstance(res["ranking"], list)
        assert "pick" in res
        assert "structure" in res
        for r in res["ranking"]:
            assert "market" in r
            assert "coverage" in r
            assert "fragility" in r
            assert "score" in r

    def test_pick_is_top_of_ranking(self, api_client, base_url):
        res = _post_structural(api_client, base_url,
                               TestStrongHomeFavorite.HOME_FAV_ODDS)
        if res.get("ranking") and res.get("pick"):
            assert res["ranking"][0]["market"] == res["pick"]["market"]
