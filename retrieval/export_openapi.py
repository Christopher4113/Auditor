"""Regenerate the agreed Interface 1 spec without contacting external services."""
from pathlib import Path
import yaml
from main import app

if __name__ == "__main__":
    Path(__file__).with_name("openapi.yaml").write_text(
        yaml.safe_dump(app.openapi(), sort_keys=False), encoding="utf-8")
    print("wrote openapi.yaml")
