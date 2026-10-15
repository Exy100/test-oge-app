"""Проверка собственного или доверенного Python-файла на учебных тестах."""
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def tokens(text):
    parts = text.split()
    if not parts or len(text) > 1024 or any(re.fullmatch(r"[+-]?[0-9]+", p) is None for p in parts):
        return None
    return [int(p) for p in parts]


def main():
    if len(sys.argv) != 2:
        print("Запуск: python3 check.py answer.py", file=sys.stderr)
        return 2
    program = Path(sys.argv[1]).resolve()
    if not program.is_file():
        print("Файл программы не найден.", file=sys.stderr)
        return 2
    root = Path(__file__).resolve().parent
    cases = json.loads((root / "tests/index.json").read_text(encoding="utf-8"))["cases"]
    passed = 0
    for case in cases:
        expected = tokens((root / case["expected"]).read_text(encoding="utf-8"))
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
                    success = result.returncode == 0 and expected is not None and tokens(actual) == expected
                except (subprocess.TimeoutExpired, UnicodeDecodeError, OSError):
                    success = False
        passed += int(success)
        print(case["id"] + ": " + ("верно" if success else "не пройден"))
    score = 2 if passed == len(cases) else 1 if passed else 0
    print("Пройдено: " + str(passed) + "/" + str(len(cases)) + "; учебный балл: " + str(score))
    return 0 if passed == len(cases) else 1


if __name__ == "__main__":
    sys.exit(main())
