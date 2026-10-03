from app.database.database import get_supabase_client


TABLES = [
    "profiles",
    "predictions",
    "diseases",
    "crops",
    "information",
    "settings",
    "audit_logs",
]


def main():
    print("\n" + "=" * 70)
    print("WHEATGUARD AI - SUPABASE TABLE TEST")
    print("=" * 70)

    try:
        client = get_supabase_client()
        print("\n[OK] Supabase client connected\n")
    except Exception as exc:
        print(f"\n[ERROR] Supabase connection failed: {exc}")
        return

    for table in TABLES:
        print("-" * 70)
        print(f"Testing table: {table}")

        try:
            result = (
                client
                .table(table)
                .select("*")
                .limit(1)
                .execute()
            )

            print(f"[OK] {table} is accessible")

            if result.data:
                print(f"     Sample row: {result.data[0]}")
            else:
                print("     Table is accessible but contains 0 rows.")

        except Exception as exc:
            print(f"[ERROR] {table} failed")
            print(f"        {exc}")

    print("\n" + "=" * 70)
    print("TABLE TEST COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()