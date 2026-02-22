#!/usr/bin/env python3
import argparse
import copy
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

RAINDROP_API_BASE = "https://api.raindrop.io/rest/v1"
CHROME_EPOCH_OFFSET = 11644473600000000  # microseconds between 1601 and 1970


def normalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url.strip())
    scheme = (parsed.scheme or "https").lower()
    netloc = parsed.netloc.lower()
    path = parsed.path or "/"
    if path != "/" and path.endswith("/"):
        path = path[:-1]
    query_items = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = urllib.parse.urlencode(sorted(query_items))
    return urllib.parse.urlunsplit((scheme, netloc, path, query, ""))


def iso_to_unix_seconds(iso_str: str) -> float:
    return datetime.fromisoformat(iso_str.replace("Z", "+00:00")).timestamp()


def chrome_time_to_unix_seconds(chrome_ts: str) -> float:
    # Chrome timestamps are microseconds since 1601-01-01 UTC.
    return (int(chrome_ts) - CHROME_EPOCH_OFFSET) / 1_000_000


def unix_seconds_to_chrome_time(ts: float) -> str:
    return str(int(ts * 1_000_000 + CHROME_EPOCH_OFFSET))


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: Path, payload: dict) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
        f.write("\n")


def backup_file(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup = path.with_name(f"{path.name}.bak.{stamp}")
    backup.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    return backup


def _walk_chrome_nodes(node: dict, folder_path: str, out: List[dict]) -> None:
    node_type = node.get("type")
    if node_type == "url":
        out.append(
            {
                "id": node["id"],
                "title": node.get("name", "").strip() or "(untitled)",
                "url": node["url"],
                "created": chrome_time_to_unix_seconds(node.get("date_added", "0")),
                "folder": folder_path,
            }
        )
        return

    if node_type == "folder":
        next_path = f"{folder_path}/{node.get('name', '').strip()}" if folder_path else node.get("name", "").strip()
        for child in node.get("children", []):
            _walk_chrome_nodes(child, next_path, out)


def extract_chrome_bookmarks(bookmarks_payload: dict) -> List[dict]:
    found: List[dict] = []
    roots = bookmarks_payload.get("roots", {})
    for key in ("bookmark_bar", "other", "synced", "mobile"):
        root_node = roots.get(key)
        if not root_node:
            continue
        root_name = root_node.get("name", key)
        for child in root_node.get("children", []):
            _walk_chrome_nodes(child, root_name, found)
    return found


def raindrop_request(token: str, method: str, path: str, body: Optional[dict] = None) -> dict:
    data = None
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        f"{RAINDROP_API_BASE}{path}", method=method, headers=headers, data=data
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Raindrop API {method} {path} failed: {e.code} {raw}")


def fetch_raindrop_items(token: str, collection_id: int) -> List[dict]:
    items: List[dict] = []
    page = 0
    while True:
        payload = raindrop_request(
            token,
            "GET",
            f"/raindrops/{collection_id}?page={page}&perpage=50&sort=created",
        )
        batch = payload.get("items", [])
        items.extend(batch)
        if len(batch) < 50:
            break
        page += 1
    return items


def next_chrome_id(bookmarks_payload: dict) -> int:
    roots = bookmarks_payload.get("roots", {})
    # `checksum` is not a numeric bookmark id (often hex), so ignore it.
    current = 0

    for root in roots.values():
        stack = [root]
        while stack:
            node = stack.pop()
            node_id = node.get("id")
            if node_id and str(node_id).isdigit():
                current = max(current, int(node_id))
            for child in node.get("children", []):
                stack.append(child)
    return current + 1


def find_or_create_target_folder(bookmarks_payload: dict, folder_name: str) -> dict:
    roots = bookmarks_payload.setdefault("roots", {})
    bar = roots.get("bookmark_bar")
    if not bar:
        raise RuntimeError("Chrome bookmarks payload does not contain roots.bookmark_bar")

    bar.setdefault("children", [])
    for child in bar["children"]:
        if child.get("type") == "folder" and child.get("name") == folder_name:
            child.setdefault("children", [])
            return child

    nid = str(next_chrome_id(bookmarks_payload))
    now = unix_seconds_to_chrome_time(time.time())
    folder = {
        "type": "folder",
        "id": nid,
        "guid": "",
        "name": folder_name,
        "date_added": now,
        "date_modified": now,
        "children": [],
    }
    bar["children"].append(folder)
    return folder


def add_chrome_bookmark(target_folder: dict, nid: str, title: str, url: str) -> None:
    now = unix_seconds_to_chrome_time(time.time())
    target_folder.setdefault("children", []).append(
        {
            "type": "url",
            "id": nid,
            "guid": "",
            "name": title,
            "url": url,
            "date_added": now,
            "date_last_used": "0",
        }
    )
    target_folder["date_modified"] = now


def choose_title(chrome_item: dict, raindrop_item: dict) -> Tuple[str, str]:
    chrome_title = (chrome_item.get("title") or "").strip()
    rd_title = (raindrop_item.get("title") or "").strip()
    if not chrome_title:
        return rd_title or "(untitled)", "raindrop"
    if not rd_title:
        return chrome_title, "chrome"

    chrome_ts = chrome_item.get("created", 0)
    rd_ts = iso_to_unix_seconds(raindrop_item.get("lastUpdate") or raindrop_item.get("created"))
    if chrome_ts >= rd_ts:
        return chrome_title, "chrome"
    return rd_title, "raindrop"


def default_chrome_bookmarks_path() -> Path:
    home = Path.home()
    candidates = [
        home / "Library/Application Support/Google/Chrome/Default/Bookmarks",
        home / ".config/google-chrome/Default/Bookmarks",
        home / "AppData/Local/Google/Chrome/User Data/Default/Bookmarks",
    ]
    for path in candidates:
        if path.exists():
            return path
    return candidates[0]


def run_sync(
    chrome_path: Path,
    raindrop_token: str,
    raindrop_collection_id: int,
    chrome_import_folder: str,
    dry_run: bool,
) -> Dict[str, int]:
    chrome_raw = load_json(chrome_path)
    chrome_working = copy.deepcopy(chrome_raw)

    chrome_items = extract_chrome_bookmarks(chrome_working)
    chrome_by_url = {}
    for item in chrome_items:
        try:
            chrome_by_url[normalize_url(item["url"])] = item
        except Exception:
            continue

    raindrop_items = fetch_raindrop_items(raindrop_token, raindrop_collection_id)
    raindrop_by_url = {}
    for item in raindrop_items:
        link = item.get("link")
        if not link:
            continue
        try:
            raindrop_by_url[normalize_url(link)] = item
        except Exception:
            continue

    stats = {
        "chrome_total": len(chrome_by_url),
        "raindrop_total": len(raindrop_by_url),
        "created_in_raindrop": 0,
        "created_in_chrome": 0,
        "updated_raindrop_title": 0,
        "changed": 0,
    }

    # Chrome -> Raindrop (new URLs)
    for norm_url, item in chrome_by_url.items():
        if norm_url in raindrop_by_url:
            continue
        body = {
            "collection": {"$id": raindrop_collection_id},
            "title": item["title"],
            "link": item["url"],
        }
        if not dry_run:
            raindrop_request(raindrop_token, "POST", "/raindrop", body)
        stats["created_in_raindrop"] += 1

    # Raindrop -> Chrome (new URLs)
    target_folder = find_or_create_target_folder(chrome_working, chrome_import_folder)
    nid = next_chrome_id(chrome_working)
    for norm_url, item in raindrop_by_url.items():
        if norm_url in chrome_by_url:
            continue
        title = (item.get("title") or "").strip() or "(untitled)"
        add_chrome_bookmark(target_folder, str(nid), title, item["link"])
        nid += 1
        stats["created_in_chrome"] += 1

    # Resolve title conflicts using latest update timestamp.
    for norm_url, chrome_item in chrome_by_url.items():
        rd_item = raindrop_by_url.get(norm_url)
        if not rd_item:
            continue
        preferred_title, source = choose_title(chrome_item, rd_item)
        if source == "chrome" and preferred_title != (rd_item.get("title") or ""):
            if not dry_run:
                raindrop_request(
                    raindrop_token,
                    "PUT",
                    f"/raindrop/{rd_item['_id']}",
                    {"title": preferred_title},
                )
            stats["updated_raindrop_title"] += 1

    stats["changed"] = (
        stats["created_in_raindrop"]
        + stats["created_in_chrome"]
        + stats["updated_raindrop_title"]
    )

    if stats["created_in_chrome"] > 0 and not dry_run:
        backup_file(chrome_path)
        write_json(chrome_path, chrome_working)

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Bidirectional sync between Chrome bookmarks and a Raindrop collection."
    )
    parser.add_argument(
        "--chrome-bookmarks",
        type=Path,
        default=default_chrome_bookmarks_path(),
        help="Path to Chrome Bookmarks JSON file",
    )
    parser.add_argument(
        "--raindrop-collection-id",
        type=int,
        default=-1,
        help="Raindrop collection ID (default: -1 Unsorted)",
    )
    parser.add_argument(
        "--chrome-import-folder",
        default="Raindrop Synced",
        help="Folder under Chrome bookmark bar used for Raindrop -> Chrome inserts",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print changes without writing to Chrome/Raindrop",
    )
    args = parser.parse_args()

    token = os.environ.get("RAINDROP_TOKEN")
    if not token:
        print("ERROR: missing RAINDROP_TOKEN environment variable", file=sys.stderr)
        return 2

    if not args.chrome_bookmarks.exists():
        print(f"ERROR: Chrome bookmarks file not found: {args.chrome_bookmarks}", file=sys.stderr)
        return 2

    try:
        stats = run_sync(
            chrome_path=args.chrome_bookmarks,
            raindrop_token=token,
            raindrop_collection_id=args.raindrop_collection_id,
            chrome_import_folder=args.chrome_import_folder,
            dry_run=args.dry_run,
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    mode = "DRY RUN" if args.dry_run else "APPLY"
    print(f"[{mode}] chrome={stats['chrome_total']} raindrop={stats['raindrop_total']}")
    print(
        "changes "
        f"raindrop+={stats['created_in_raindrop']} "
        f"chrome+={stats['created_in_chrome']} "
        f"raindrop_title_updates={stats['updated_raindrop_title']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
