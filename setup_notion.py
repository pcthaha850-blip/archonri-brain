#!/usr/bin/env python3
"""
Create Commands database in Notion for ArchonRI Brain
"""

import os
import json

try:
    from notion_client import Client
except ImportError:
    print("Installing notion-client...")
    os.system("pip install notion-client -q")
    from notion_client import Client

# Configuration - Set these environment variables before running
NOTION_API_KEY = os.environ.get("NOTION_API_KEY")
PARENT_PAGE_ID = os.environ.get("NOTION_PARENT_PAGE_ID")

if not NOTION_API_KEY:
    raise ValueError("NOTION_API_KEY environment variable is required")
if not PARENT_PAGE_ID:
    raise ValueError("NOTION_PARENT_PAGE_ID environment variable is required")

notion = Client(auth=NOTION_API_KEY)

COMMANDS_SCHEMA = {
    "Name": {"title": {}},
    "Status": {
        "select": {
            "options": [
                {"name": "Deploy", "color": "blue"},
                {"name": "Processing", "color": "yellow"},
                {"name": "Completed", "color": "green"},
                {"name": "Failed", "color": "red"},
                {"name": "Cancelled", "color": "gray"}
            ]
        }
    },
    "Entity ID": {"rich_text": {}},
    "Payload": {"rich_text": {}},
    "Notes": {"rich_text": {}},
    "Created": {"created_time": {}}
}

def create_commands_database():
    """Create the Commands database."""
    print("Creating Commands database...")

    response = notion.databases.create(
        parent={"type": "page_id", "page_id": PARENT_PAGE_ID},
        title=[{"type": "text", "text": {"content": "Commands — Brain Trigger"}}],
        icon={"type": "emoji", "emoji": "🧠"},
        properties=COMMANDS_SCHEMA
    )

    db_id = response["id"]
    db_id_clean = db_id.replace("-", "")

    print(f"\n✅ Commands database created!")
    print(f"   Database ID: {db_id}")
    print(f"   Clean ID (for env): {db_id_clean}")

    return db_id_clean

def main():
    print("="*50)
    print("ArchonRI Brain - Notion Setup")
    print("="*50)
    print()

    # Create Commands database
    commands_db_id = create_commands_database()

    # Save to file
    result = {
        "COMMANDS_DB_ID": commands_db_id
    }

    with open("notion_db_ids.json", "w") as f:
        json.dump(result, f, indent=2)

    print("\n" + "="*50)
    print("Setup Complete!")
    print("="*50)
    print(f"\nCOMMANDS_DB_ID={commands_db_id}")
    print("\nAdd this to your Railway environment variables.")
    print("\nDatabase IDs saved to: notion_db_ids.json")

if __name__ == "__main__":
    main()
