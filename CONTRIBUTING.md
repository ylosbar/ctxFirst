# Contributing to CtxFirst

Thanks for your interest in contributing!

## License of contributions

CtxFirst is dual-licensed (AGPL-3.0 open source + a commercial license — see
[COMMERCIAL.md](COMMERCIAL.md)). To keep dual-licensing possible, every
contribution must come in under terms that let the maintainer relicense it.

We use the **Developer Certificate of Origin (DCO)**. By signing off on your
commits you certify that you wrote the contribution (or otherwise have the
right to submit it) and agree that it is provided under:

- the **AGPL-3.0-or-later** for code in the application, or the **MIT License**
  for code in `packages/plugin-sdk/`, **and**
- that the project maintainer may **also** distribute your contribution under a
  separate commercial license.

If you cannot agree to these terms, please do not submit a contribution.

### Signing off

Add a `Signed-off-by` line to each commit (Git does this with `-s`):

```bash
git commit -s -m "your message"
```

This appends, using your real name and email:

```
Signed-off-by: Jane Doe <jane@example.com>
```

The full DCO text is at <https://developercertificate.org/>.

## Development

See [CLAUDE.md](CLAUDE.md) and [ARCHITECTURE.md](ARCHITECTURE.md) for the
project layout, commands, and architecture rules. Before opening a PR:

```bash
yarn lint        # ESLint (architecture rules are enforced here)
yarn typecheck   # tsc --noEmit
yarn test        # Vitest
```
