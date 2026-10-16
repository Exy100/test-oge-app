"""Verify the ten committed review packages, execute programs and recalculate their ODS."""
import csv
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
import zipfile

sys.dont_write_bytecode = True

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".cache/variant-office"
NS = {"table": "urn:oasis:names:tc:opendocument:xmlns:table:1.0", "office": "urn:oasis:names:tc:opendocument:xmlns:office:1.0"}


def helper(name):
    spec = importlib.util.spec_from_file_location(name.replace("-", "_"), ROOT / "scripts" / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def unpack(data, manifest):
    result = {}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert archive.testzip() is None
        assert len(archive.namelist()) == len(manifest["files"])
        assert set(archive.namelist()) == {item["path"] for item in manifest["files"]}
        for item in manifest["files"]:
            payload = archive.read(item["path"])
            assert len(payload) == item["size"] and hashlib.sha256(payload).hexdigest() == item["sha256"]
            assert item["license"] == "CC0-1.0"
            result[item["path"]] = payload
    return result


def uncached(data):
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        content = ET.fromstring(archive.read("content.xml"))
        content.set("xmlns:of", "urn:oasis:names:tc:opendocument:xmlns:of:1.2")
        count = 0
        for cell in content.iter("{" + NS["table"] + "}table-cell"):
            if "{" + NS["table"] + "}formula" not in cell.attrib:
                continue
            count += 1
            cell.attrib.pop("{" + NS["office"] + "}value", None)
            cell.attrib.pop("{" + NS["office"] + "}value-type", None)
            for child in list(cell):
                cell.remove(child)
        assert count == 243
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_STORED) as changed:
            for item in archive.infolist():
                changed.writestr(item.filename, ET.tostring(content, encoding="utf-8", xml_declaration=True) if item.filename == "content.xml" else archive.read(item.filename))
        return output.getvalue()


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    python = helper("check-python")
    robot = helper("check-robots")
    spreadsheets = helper("check-spreadsheets")
    exam_files = helper("check-exam-files")
    directories = sorted((ROOT / "samples/variants").iterdir())
    assert [item.name for item in directories] == [f"V{i:02}" for i in range(1, 11)]
    nested_count = file_count = python_runs = robot_fields = 0
    fixtures = []
    for directory in directories:
        manifest = json.loads((directory / "manifest.json").read_text())
        files = unpack((directory / "dataset.zip").read_bytes(), manifest)
        assert len(files) == 19
        variant = json.loads(files["variant.json"])
        alternatives = json.loads(files["alternatives13.json"])
        index = json.loads(files["index.json"])
        tasks = variant["tasks"]
        assert variant["kind"] == "fixed" and variant["id"] == directory.name
        assert [task["taskNumber"] for task in tasks] == list(range(1, 17))
        assert len({task["id"] for task in tasks}) == 16
        assert [task.get("criteria", {}).get("max", 1) for task in tasks] == [1] * 12 + [2, 3, 2, 2]
        assert sum(task.get("criteria", {}).get("max", 1) for task in tasks) == 21
        assert index["selected13"] == "presentation" and index["taskCount"] == 16 and index["maxScore"] == 21
        assert tasks[12] == alternatives["presentation"]
        assert {task["variant13"] for task in alternatives.values()} == {"presentation", "document"}
        assert [(item["taskNumber"], item.get("variant13")) for item in index["datasets"]] == [(11, None), (12, None), (13, "presentation"), (13, "document"), (14, None), (15, None), (16, None)]
        for entry in index["datasets"]:
            child_manifest = json.loads(files[entry["manifest"]])
            child = unpack(files[entry["archive"]], child_manifest)
            task = alternatives[entry["variant13"]] if entry["taskNumber"] == 13 else tasks[entry["taskNumber"] - 1]
            assert entry["taskId"] == task["id"] and entry["datasetId"] == task["datasetId"] == child_manifest["id"]
            if child_manifest["kind"] == "generated":
                assert child_manifest["generatorId"] == task["generatorId"]
            else:
                assert child_manifest["kind"] == "curated" and entry["taskNumber"] == 13
            nested_count += 1
            file_count += len(child)
            if entry["taskNumber"] == 11:
                blocks = {path: exam_files.Paragraphs(payload).blocks for path, payload in child.items() if path.endswith('.htm')}
                assert exam_files.reading(task, blocks) == task['answer']['value']
            elif entry["taskNumber"] == 12:
                assert exam_files.selection(task, child) == task['answer']['value']
            elif entry["taskNumber"] == 13:
                bank = "13-1-files" if entry["variant13"] == "presentation" else "13-2-files"
                original = ROOT / "samples" / bank / task["seed"][1:] / "dataset.zip"
                assert original.read_bytes() == files[entry["archive"]]
                assert child_manifest == json.loads(original.with_name("manifest.json").read_text())
            elif entry["taskNumber"] == 14:
                source = list(csv.reader(io.StringIO(child["source/data.csv"].decode()), delimiter=";"))
                meta = json.loads(child["reference/answers.json"])
                expected = spreadsheets.solve(source[1:], meta)
                assert len(source) == 241 and expected == meta["answers"]
                for kind, path in [("source", "source/data.ods"), ("reference", "reference/answer.ods")]:
                    target = OUTPUT / (directory.name + "-" + kind + ".ods")
                    target.write_bytes(child[path] if kind == "source" else uncached(child[path]))
                    target.with_suffix(".csv").unlink(missing_ok=True)
                    fixtures.append((target, kind, source, expected))
            elif entry["taskNumber"] == 15:
                family = json.loads(child["source/family.json"])
                fields = json.loads(child["validation/fields.json"])
                ast = robot.program(child["reference/answer.txt"].decode())
                assert len(fields) == len(family["parameters"]) == 8
                for parameters, field in zip(family["parameters"], fields):
                    expected, start, size = robot.oracle(parameters)
                    assert size == (field["rows"], field["columns"]) and start == (field["start"]["row"], field["start"]["column"])
                    painted, _, _ = robot.execute(ast, field)
                    assert painted == expected
                    robot_fields += 1
            elif entry["taskNumber"] == 16:
                parameters = json.loads(child["source/parameters.json"])
                tests = json.loads(child["tests/index.json"])["cases"]
                assert len(tests) == 10
                with tempfile.TemporaryDirectory(prefix="variant-python-", dir=OUTPUT) as work:
                    program = Path(work) / "answer.py"
                    program.write_bytes(child["reference/answer.py"])
                    for case in tests:
                        data = child[case["input"]].decode()
                        expected = python.expected(parameters, data)
                        assert child[case["expected"]].decode() == expected
                        result = subprocess.run([sys.executable, "-I", str(program)], input=data, capture_output=True, text=True, encoding="utf-8", cwd=work, timeout=2, check=False)
                        assert result.returncode == 0 and not result.stderr and result.stdout == expected
                        python_runs += 1
    assert nested_count == 70 and python_runs == 100 and robot_fields == 80
    soffice = shutil.which("soffice") or shutil.which("libreoffice")
    if not soffice:
        raise RuntimeError("LibreOffice Calc is required")
    with tempfile.TemporaryDirectory(prefix="variant-calc-profile-", dir=OUTPUT) as profile:
        for start in range(0, len(fixtures), 4):
            result = subprocess.run([soffice, "-env:UserInstallation=" + Path(profile).as_uri(), "--headless", "--convert-to", "csv:Text - txt - csv (StarCalc):44,34,76,1", "--outdir", str(OUTPUT), *[str(item[0]) for item in fixtures[start:start + 4]]], capture_output=True, text=True, timeout=120, check=True, env={**os.environ, "SAL_USE_VCLPLUGIN": "svp"})
            print(result.stdout.strip(), flush=True)
    for target, kind, source, expected in fixtures:
        rows = list(csv.reader(io.StringIO(target.with_suffix(".csv").read_text(encoding="utf-8-sig"))))
        assert [row[:4] for row in rows] == source
        if kind == "reference":
            assert [float(rows[i][7]) for i in [1, 2, 3]] == expected
    print(f"Variants: 10 complete packages, 70 nested datasets and {file_count} component files verified with CRC/SHA-256.")
    print("Python: 100 independent runs passed; Robot: 80 fields passed; both curated alternatives match the verified originals.")
    print("File tasks №11–12: 20 answers independently recovered from the actual variant archives.")
    print("LibreOffice: 20 ODS opened, all source cells preserved, 2430 uncached formulas recalculated, all 30 answers matched.")


if __name__ == "__main__":
    main()
