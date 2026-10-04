from pathlib import Path
import hashlib
import json

expected = {
    'DepositForm.tsx': '835999ca284a95a9a69826932ace76e7b519bd56',
    'WithdrawForm.tsx': 'cb50246e63fbd8a24d764e3c264da025538d49cb',
}

def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

changes = [
    ("import React, { useState } from 'react';", "import React, { useState, useRef } from 'react';"),
    ("  const [submitting, setSubmitting] = useState(false);", "  const [submitting, setSubmitting] = useState(false);\n  const submissionInFlight = useRef(false);"),
    ("    if (!valid || amountError) return;", "    if (!isConnected || !valid || amountError || submissionInFlight.current) return;\n    // A ref closes reentrant submits before React commits the loading state.\n    submissionInFlight.current = true;"),
    ("    } finally {\n      setSubmitting(false);", "    } finally {\n      submissionInFlight.current = false;\n      setSubmitting(false);"),
]
receipt = {}
for filename, digest in expected.items():
    path = Path('src/components') / filename
    before = path.read_bytes()
    if blob(before) != digest:
        raise RuntimeError(f'{filename}: source identity mismatch')
    text = before.decode()
    for old, new in changes:
        if text.count(old) != 1:
            raise RuntimeError(f'{filename}: ambiguous patch block {old!r}')
        text = text.replace(old, new, 1)
    after = text.encode()
    path.write_bytes(after)
    receipt[filename] = {'before_git_blob': digest, 'after_git_blob': blob(after)}
print(json.dumps(receipt, indent=2))
