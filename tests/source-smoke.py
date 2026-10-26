from pathlib import Path
import re, subprocess, tempfile

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
arabic = (root / "عماره6.html").read_text(encoding="utf-8")
checks = {
    "valid standalone HTML": html.startswith("<!doctype html>") and "</html>" in html,
    "database schema v4": "DB_VERSION=4" in html,
    "studio photo store": '"studioPhotos"' in html,
    "studio navigation and renderer": 'data-page="studio"' in html and "async function studioPage" in html,
    "multiple photo upload": 'multiple required' in html and "async function uploadStudioFiles" in html,
    "photo view, download, edit, delete": all(x in html for x in ["async function viewStudioPhoto", "async function downloadStudioPhoto", "async function editStudioPhoto", "async function deleteStudioPhoto"]),
    "apartment form and list entry points": "openStudioAfterSave" in html and 'data-action="studio-open"' in html,
    "image compression and storage error handling": "compressStudioImage" in html and "QuotaExceededError" in html,
    "legacy backup protects missing stores": "const missingStores=stores.filter" in html and "for(const s of valid)await new Promise" in html,
    "studio photos prevent accidental apartment deletion": 'all("studioPhotos")' in html and "قبل نقل أو تنزيل أو حذف صور الاستوديو" in html,
    "database startup blocked handling": "req.onblocked" in html,
    "database startup timeout": "انتهت مهلة فتح قاعدة البيانات" in html,
    "old and new standalone sources synchronized": html == arabic,
    "resident movement history": '"residenceHistory"' in html and 'await save("residenceHistory"' in html,
    "backup and restore remain available": "async function exportBackup" in html and "async function importBackup" in html,
    "finance, maintenance and stock features retained": all(x in html for x in ["openRentForm", "maintenance", "stockMoves"]),
}
for label, ok in checks.items():
    print(("PASS" if ok else "FAIL") + ": " + label)
if not all(checks.values()):
    raise SystemExit(1)

scripts = re.findall(r"<script(?:\s[^>]*)?>(.*?)</script\s*>", html, re.I | re.S)
if not scripts:
    raise SystemExit("FAIL: inline JavaScript exists")
with tempfile.NamedTemporaryFile("w", suffix=".js", encoding="utf-8", delete=False) as f:
    f.write("\n".join(scripts))
    path = f.name
subprocess.run(["node", "--check", path], check=True)
print("PASS: inline JavaScript syntax")
