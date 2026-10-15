"""Run repository-generated, trusted references only; never accept student code here."""
import contextlib
import io
import json
import resource
import sys

resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
results = []
for group in json.load(sys.stdin):
    code = compile(group["code"], "<generated-python16-reference>", "exec")
    outputs = []
    for data in group["inputs"]:
        lines = iter(data.splitlines())
        output = io.StringIO()
        builtins = {"input": lambda: next(lines), "int": int, "range": range, "print": print}
        with contextlib.redirect_stdout(output):
            exec(code, {"__builtins__": builtins})
        if list(lines):
            raise AssertionError("Reference did not consume all input")
        outputs.append(output.getvalue())
    results.append(outputs)
json.dump(results, sys.stdout, ensure_ascii=False)
