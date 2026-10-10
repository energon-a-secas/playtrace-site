"""Exercise the real migration in disposable SQLite databases only."""

from pathlib import Path
import sqlite3
import unittest


WORKER = Path(__file__).resolve().parents[1]
FORWARD = (WORKER / "migrations" / "0001_initial.sql").read_text()
ROLLBACK = (WORKER / "rollback" / "0001_initial.sql").read_text()
NOW = "2026-10-10T12:00:00.000Z"


class SchemaTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript(FORWARD)

    def add_game(self, game_id="g_test01"):
        self.db.execute(
            "INSERT INTO games(id,author_key,updated_at,payload_json) VALUES(?,?,?,?)",
            (game_id, "fixture_author", NOW, "{}"),
        )

    def add_price(self, subject="fixture_account", game_id="g_test01", amount=1500, currency="USD"):
        self.db.execute(
            "INSERT INTO price_signals VALUES(?,?,?,?,?)",
            (subject, game_id, amount, currency, NOW),
        )

    def test_forward_installs_exact_tables_and_enforces_foreign_keys(self):
        actual = {row[0] for row in self.db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        self.assertEqual(actual, {
            "games", "source_posts", "price_signals", "follows",
            "app_meta", "rate_limits", "media_assets", "removals",
        })
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone()[0], 1)
        with self.assertRaises(sqlite3.IntegrityError):
            self.add_price()

    def test_one_price_per_account_game_and_upsert_is_scoped(self):
        self.add_game()
        self.add_game("g_test02")
        self.add_price()
        self.add_price(subject="another_account", amount=2500)
        self.add_price(game_id="g_test02", amount=3000)
        with self.assertRaises(sqlite3.IntegrityError):
            self.add_price(amount=9000)
        self.db.execute(
            "INSERT INTO price_signals VALUES(?,?,?,?,?) "
            "ON CONFLICT(subject,game_id) DO UPDATE SET "
            "amount_cents=excluded.amount_cents,updated_at=excluded.updated_at",
            ("fixture_account", "g_test01", 0, "USD", NOW),
        )
        rows = self.db.execute(
            "SELECT subject,game_id,amount_cents FROM price_signals ORDER BY subject,game_id"
        ).fetchall()
        self.assertEqual(rows, [
            ("another_account", "g_test01", 2500),
            ("fixture_account", "g_test01", 0),
            ("fixture_account", "g_test02", 3000),
        ])

    def test_price_requires_integer_cents_usd_and_identity(self):
        self.add_game()
        for amount in (-1, 10001, 1.5, None, "nonnumeric"):
            with self.subTest(amount=amount), self.assertRaises(sqlite3.IntegrityError):
                self.add_price(amount=amount)
        for currency in ("CLP", "usd", "", None):
            with self.subTest(currency=currency), self.assertRaises(sqlite3.IntegrityError):
                self.add_price(currency=currency)
        with self.assertRaises(sqlite3.IntegrityError):
            self.add_price(subject=None)
        self.add_price(amount=0)
        self.add_price(subject="second_account", amount=10000)

    def test_follow_duplicate_is_rejected_and_explicit_upsert_is_idempotent(self):
        self.add_game()
        params = ("fixture_account", "g_test01", NOW)
        self.db.execute("INSERT INTO follows VALUES(?,?,?)", params)
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO follows VALUES(?,?,?)", params)
        self.db.execute(
            "INSERT INTO follows VALUES(?,?,?) ON CONFLICT(subject,game_id) DO NOTHING", params
        )
        self.assertEqual(self.db.execute("SELECT count(*) FROM follows").fetchone()[0], 1)

    def test_pending_post_can_lack_game_and_source_id_cannot_be_reassigned_by_insert(self):
        params = ("post01", None, "fixture_author", NOW, NOW, "{}")
        self.db.execute(
            "INSERT INTO source_posts(id,game_id,author_key,created_at,retrieved_at,payload_json) "
            "VALUES(?,?,?,?,?,?)", params,
        )
        self.assertEqual(self.db.execute("SELECT game_id,status FROM source_posts").fetchone(), (None, "pending"))
        self.add_game()
        self.db.execute("UPDATE source_posts SET game_id=?,status='published' WHERE id=?", ("g_test01", "post01"))
        self.add_game("g_test02")
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute(
                "INSERT INTO source_posts(id,game_id,author_key,created_at,retrieved_at,payload_json) "
                "VALUES(?,?,?,?,?,?)", ("post01", "g_test02", *params[2:]),
            )

    def test_game_deletion_cascades_personal_rows_and_keeps_removal_tombstone(self):
        self.add_game()
        self.add_price()
        self.db.execute("INSERT INTO follows VALUES(?,?,?)", ("fixture_account", "g_test01", NOW))
        self.db.execute("INSERT INTO source_posts VALUES(?,?,?,?,?,?,?)",
                        ("post01", "g_test01", "fixture_author", NOW, NOW, "{}", "published"))
        self.db.execute("INSERT INTO source_posts VALUES(?,?,?,?,?,?,?)",
                        ("post02", None, "another_author", NOW, NOW, "{}", "pending"))
        self.db.execute("INSERT INTO media_assets VALUES(?,?,?,?,?,?,?,?,?,?)", (
            "media01", "g_test01", "previews/test.webp", "https://example.com/test.webp",
            "https://example.com/permission", "Test consent fixture", "operator", NOW, "image/webp", 48,
        ))
        self.db.execute("INSERT INTO removals VALUES(?,?,?,?,?)",
                        ("g_test01", '["post01"]', "Test removal", NOW, "operator"))
        self.db.execute("DELETE FROM games WHERE id='g_test01'")
        for table in ("price_signals", "follows", "media_assets"):
            with self.subTest(table=table):
                self.assertEqual(self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0], 0)
        self.assertEqual(self.db.execute("SELECT id FROM source_posts").fetchall(), [("post02",)])
        self.assertEqual(self.db.execute("SELECT game_id,source_post_ids_json FROM removals").fetchone(),
                         ("g_test01", '["post01"]'))
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_invalid_status_json_and_negative_rate_count_are_rejected(self):
        self.add_game()
        for sql, params in (
            ("UPDATE games SET status=?", ("invented",)),
            ("UPDATE games SET payload_json=?", ("not json",)),
            ("INSERT INTO app_meta VALUES(?,?)", ("catalog", "not json")),
            ("INSERT INTO rate_limits VALUES(?,?,?)", ("test", -1, 1791687600)),
            ("INSERT INTO rate_limits VALUES(?,?,?)", ("test", 1.5, 1791687600)),
        ):
            with self.subTest(sql=sql, params=params), self.assertRaises(sqlite3.IntegrityError):
                self.db.execute(sql, params)

    def test_rollback_removes_schema_and_forward_can_be_reapplied(self):
        # A populated fixture proves dependency ordering, never a production DB.
        self.add_game()
        self.add_price()
        self.db.executescript(ROLLBACK)
        self.assertEqual(self.db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(), [])
        self.db.executescript(FORWARD)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.db.execute("SELECT count(*) FROM games").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
