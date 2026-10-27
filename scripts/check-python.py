"""Independently verify and execute trusted, committed task 16 materials."""
import hashlib
import itertools
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def expected(parameters, data):
    values = list(map(int, data.split()))
    kind = parameters["kind"]
    if kind == "python-octal-sentinel":
        assert values.pop() == 0 and len(values) <= 1000
        assert all(1 <= value <= 10000 for value in values)
        result = [sum(len(oct(x)[2:]) == 4 and oct(x).endswith("5") for x in values)]
    elif kind == "python-digits":
        assert len(values) == 1 and 0 <= values[0] <= 999999999999
        digits = [int(d) for d in str(values[0])]
        selected = [d for d in digits if d % parameters["divisor"] == 0]
        result = [len(selected), sum(selected)]
    else:
        count, *values = values
        assert 1 <= count <= 1000 and len(values) == count
        assert all(-10000 <= value <= 10000 for value in values)
        if kind == "python-positive-mean":
            selected = [x for x in values if x > 0]
            assert selected
            result = [sum(selected) / len(selected), len(selected)]
        elif kind == "python-base7-sum":
            assert all(value > 0 for value in values)
            result = [sum(x for x in values if (x - 1) // 7 * 7 + 1 == x)]
        elif kind == "python-filter":
            selected = [x for x in values if x >= parameters["threshold"] and x % parameters["divisor"] == 0]
            result = [len(selected), sum(selected)]
        elif kind == "python-pairs":
            selected = [a + b for a, b in zip(values, values[1:]) if (a + b) % parameters["divisor"] == 0]
            result = [len(selected), max(selected) if selected else 0]
        else:
            assert kind == "python-run"
            runs = [len(list(group)) for valid, group in itertools.groupby(values, key=lambda x: x >= parameters["threshold"]) if valid]
            result = [max(runs, default=0)]
    return " ".join(map(str, result)) + "\n"


def run_checker(directory, program, expected_status):
    result = subprocess.run(
        [sys.executable, "-I", str(directory / "check.py"), str(program)],
        cwd=ROOT, capture_output=True, text=True, encoding="utf-8", timeout=30, check=False,
    )
    assert result.returncode == expected_status, (result.stdout, result.stderr)
    assert not result.stderr, result.stderr
    return result.stdout


def same_output(parameters, target, actual):
    if parameters["kind"] != "python-positive-mean":
        return actual == target
    parts, expected_parts = actual.split(), target.split()
    if len(parts) != 2 or re.fullmatch(r"[+-]?[0-9]+", parts[1]) is None:
        return False
    if re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", parts[0]) is None:
        return False
    return float(parts[0]) == float(expected_parts[0]) and int(parts[1]) == int(expected_parts[1])


def main():
    files_checked = 0
    executions = 0
    kinds = set()
    for sample in sorted((ROOT / "samples/16-files").iterdir()):
        manifest = json.loads((sample / "manifest.json").read_text())
        files = sample / "files"
        entries = manifest["files"]
        assert len(entries) == 27
        assert {path.relative_to(files).as_posix() for path in files.rglob("*") if path.is_file()} == {entry["path"] for entry in entries}
        with zipfile.ZipFile(sample / "dataset.zip") as archive:
            assert archive.testzip() is None
            assert len(archive.namelist()) == len(entries)
            assert set(archive.namelist()) == {entry["path"] for entry in entries}
            for entry in entries:
                data = (files / entry["path"]).read_bytes()
                assert archive.read(entry["path"]) == data
                assert len(data) == entry["size"]
                assert hashlib.sha256(data).hexdigest() == entry["sha256"]
                assert entry["license"] == "CC0-1.0"
                files_checked += 1
        parameters = json.loads((files / "source/parameters.json").read_text())
        kinds.add(parameters["kind"])
        index = json.loads((files / "tests/index.json").read_text())
        assert index["parameters"] == parameters and index["timeoutSeconds"] == 2
        assert len(index["cases"]) == 10
        assert [item["id"] for item in index["cases"]] == [f"{n:02}" for n in range(1, 11)]
        for case in index["cases"]:
            assert case["input"] in {entry["path"] for entry in entries}
            assert case["expected"] in {entry["path"] for entry in entries}
            data = (files / case["input"]).read_text(encoding="utf-8")
            target = (files / case["expected"]).read_text(encoding="utf-8")
            independent = expected(parameters, data)
            assert same_output(parameters, independent, target)
            with tempfile.TemporaryDirectory(prefix="oge-reference-") as work:
                result = subprocess.run(
                    [sys.executable, "-I", str(files / "reference/answer.py")],
                    input=data, capture_output=True, text=True, encoding="utf-8",
                    cwd=work, timeout=2, check=False,
                )
            assert result.returncode == 0 and not result.stderr, result.stderr
            assert same_output(parameters, target, result.stdout), (sample.name, case["id"], result.stdout, target)
            executions += 1
        output = run_checker(files, files / "reference/answer.py", 0)
        assert "Пройдено: 10/10; учебный балл: 2" in output
    assert kinds == {"python-positive-mean", "python-base7-sum", "python-octal-sentinel"}
    assert files_checked == 324 and executions == 120

    # Exercise the exported checker itself with trusted, deliberately faulty programs.
    with tempfile.TemporaryDirectory(prefix="oge-checker-negative-") as work:
        directory = Path(work) / "files"
        shutil.copytree(ROOT / "samples/16-files/01/files", directory)
        program = directory / "candidate.py"
        for code in ["", "if\n", "raise RuntimeError('test')\n", "print('ответ')\n", "print(0, 0)\nraise SystemExit(1)\n"]:
            program.write_text(code, encoding="utf-8")
            output = run_checker(directory, program, 1)
            assert "Пройдено: 0/10; учебный балл: 0" in output
        first = (directory / "tests/01.expected.txt").read_text().strip()
        program.write_text("print(" + repr(first) + ")\n", encoding="utf-8")
        output = run_checker(directory, program, 1)
        assert re.search(r"Пройдено: [1-9]/10; учебный балл: 1", output)
        index = json.loads((directory / "tests/index.json").read_text())
        index["cases"] = index["cases"][:1]
        (directory / "tests/index.json").write_text(json.dumps(index), encoding="utf-8")
        program.write_text("while True:\n    pass\n", encoding="utf-8")
        output = run_checker(directory, program, 1)
        assert "Пройдено: 0/1; учебный балл: 0" in output
        assert "Файл программы не найден." in subprocess.run(
            [sys.executable, "-I", str(directory / "check.py"), str(directory / "missing.py")],
            capture_output=True, text=True, encoding="utf-8", check=False,
        ).stderr
    print(f"Python 3: 12 datasets, {files_checked} files, {executions} independent reference executions passed.")
    print("All 12 exported checkers passed; syntax/runtime/output/exit/timeout failures and partial score verified.")


if __name__ == "__main__":
    main()
