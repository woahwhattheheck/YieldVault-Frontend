from pathlib import Path
import hashlib
import json

expected = {
    'DepositForm.tsx': ('b60ab220be97871f7ee7aa31dcdfbae0bc6c500e', 'balance'),
    'WithdrawForm.tsx': ('ee1ed0dea28f4f7987c9396cfbde1d90bb761158', 'deposited'),
}

def blob(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

receipt = {}
for filename, (digest, amount) in expected.items():
    path = Path('src/components') / filename
    before = path.read_bytes()
    if blob(before) != digest:
        raise RuntimeError(f'{filename}: source identity mismatch')
    changes = [
        ("import AmountInput from './AmountInput';", "import AmountInput from './AmountInput';\nimport { parseLocaleAmount } from '../utils/localeAmount.js';"),
        (f"  const handleMax = () => setAmount(String({amount}));",
         "  const handleMax = () => {\n"
         f"    const maximum = parseLocaleAmount({amount});\n"
         f"    setAmount(maximum.ok ? maximum.canonical : String({amount}));\n"
         "  };"),
    ]
    text = before.decode()
    for old, new in changes:
        if text.count(old) != 1:
            raise RuntimeError(f'{filename}: ambiguous patch block {old!r}')
        text = text.replace(old, new, 1)
    after = text.encode()
    path.write_bytes(after)
    receipt[filename] = {'before_git_blob': digest, 'after_git_blob': blob(after)}
print(json.dumps(receipt, indent=2))
