"""Execute only the repository's generated Python examples for test validation."""
import contextlib
import io
import json
import sys

results = []
for case in json.load(sys.stdin):
    inputs = iter(map(str, case["inputs"]))
    output = io.StringIO()
    builtins = {"input": lambda: next(inputs), "int": int, "range": range, "print": print}
    with contextlib.redirect_stdout(output):
        exec(compile(case["code"], "<generated-test>", "exec"), {"__builtins__": builtins})
    results.append(output.getvalue().strip())
json.dump(results, sys.stdout, ensure_ascii=False)
