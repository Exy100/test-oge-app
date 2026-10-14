"""Independent №12 oracle: Python zipfile, fnmatch and the stdlib parsers.

Reads JSON cases from stdin: {"zip": base64, "kind", "catalog", ...}.
Prints a JSON list of answers computed from the archive alone.
"""

import base64
import csv
import fnmatch
import io
import json
import posixpath
import sys
import zipfile


def answer(case):
    archive = zipfile.ZipFile(io.BytesIO(base64.b64decode(case["zip"])))
    if archive.testzip() is not None:
        raise ValueError("CRC mismatch")
    count = 0
    total = 0
    for info in archive.infolist():
        if not info.flag_bits & 0x800 and not info.filename.isascii():
            raise ValueError("Non-ASCII name without the UTF-8 flag")
        data = archive.read(info)
        name = posixpath.basename(info.filename)
        extension = posixpath.splitext(name)[1]
        text = data.decode("utf-8")
        if extension == ".json":
            json.loads(text)
        elif extension == ".py":
            compile(text, info.filename, "exec")
        elif extension == ".csv":
            rows = list(csv.reader(io.StringIO(text), delimiter=";"))
            if not rows or any(len(row) != 3 for row in rows):
                raise ValueError("CSV rows must have three fields")
        if not info.filename.startswith(case["catalog"] + "/"):
            continue
        if case["kind"] == "file-mask-count":
            selected = fnmatch.fnmatchcase(name, case["mask"])
        else:
            selected = extension == "." + case["extension"]
        if not selected:
            continue
        if case["kind"] == "file-size-count":
            count += info.file_size > case["kib"] * 1024
        elif case["kind"] == "file-total-volume":
            if info.file_size % 1024:
                raise ValueError("Volume is not a whole number of KiB")
            total += info.file_size
        else:
            count += 1
    return str(total // 1024 if case["kind"] == "file-total-volume" else count)


print(json.dumps([answer(case) for case in json.load(sys.stdin)]))
