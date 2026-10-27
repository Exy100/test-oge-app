"""Проверка собственного или доверенного Python-файла на учебных тестах."""
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def tokens(text):
    parts = text.split()
    if not parts or len(text) > 1024 or any(re.fullmatch(r"[+-]?[0-9]+", p) is None for p in parts):
        return None
    values = [int(p) for p in parts]
    return values if all(abs(value) <= 9007199254740991 for value in values) else None


def mean_tokens(text):
    parts = text.split()
    if len(text) > 1024 or len(parts) != 2:
        return None
    if re.fullmatch(r"[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?", parts[0]) is None:
        return None
    count = tokens(parts[1])
    mean = float(parts[0])
    return (mean, count[0]) if math.isfinite(mean) and count is not None else None


def equal_output(expected, actual, policy):
    if policy == "positive-mean":
        target, result = mean_tokens(expected), mean_tokens(actual)
        return target is not None and result is not None and target[1] == result[1] and math.isclose(target[0], result[0], rel_tol=0, abs_tol=1e-6)
    if policy != "integer":
        return False
    target = tokens(expected)
    return target is not None and target == tokens(actual)


def main():
    if len(sys.argv) != 2:
        print("Запуск: python3 check.py answer.py", file=sys.stderr)
        return 2
    program = Path(sys.argv[1]).resolve()
    if not program.is_file():
        print("Файл программы не найден.", file=sys.stderr)
        return 2
    root = Path(__file__).resolve().parent
    index = json.loads((root / "tests/index.json").read_text(encoding="utf-8"))
    cases = index["cases"]
    policy = index.get("outputPolicy", "integer")
    passed = 0
    for case in cases:
        expected = (root / case["expected"]).read_text(encoding="utf-8")
        data = (root / case["input"]).read_bytes()
        with tempfile.TemporaryDirectory(prefix="oge-python-") as work:
            with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
                try:
                    result = subprocess.run(
                        [sys.executable, "-I", str(program)], input=data,
                        stdout=output, stderr=errors, cwd=work, timeout=2,
                        check=False,
                    )
                    output.seek(0)
                    actual = output.read(1025).decode("utf-8")
                    success = result.returncode == 0 and equal_output(expected, actual, policy)
                except (subprocess.TimeoutExpired, UnicodeDecodeError, OSError):
                    success = False
        passed += int(success)
        print(case["id"] + ": " + ("верно" if success else "не пройден"))
    score = 2 if passed == len(cases) else 1 if passed else 0
    print("Пройдено: " + str(passed) + "/" + str(len(cases)) + "; учебный балл: " + str(score))
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
