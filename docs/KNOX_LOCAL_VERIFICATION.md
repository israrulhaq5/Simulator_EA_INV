# Knox simulator — Windows local acceptance (no CI)

This is a **local test**, not a deployment. No database or running Zero-Export
application is needed for these isolated automated tests. The verification
runner installs the locked npm dependencies in `backend` and `frontend`.

## Prerequisites

- Windows 10/11 with Git and Node.js 22.10+ (22 LTS recommended), npm 10+.
- Run commands from a PowerShell terminal in the repository root.
- No other Modbus simulator/server may already be listening on
  **127.0.0.1:502** when the port 502 test runs.
- The test server binds **localhost only**, not an external IP; it does not
  contact any physical Knox inverter.

## 1. Update an existing checkout

```powershell
git status
git fetch origin
git switch feat/knox-asw110-simulator-502-20261122
git pull --ff-only
npm.cmd run verify:knox
```

If the branch does not exist locally yet, use
`git switch --track origin/feat/knox-asw110-simulator-502-20261122`
instead of the first `git switch`. Preserve/commit any local changes before
switching branches.

## 2. Or clone a fresh checkout

```powershell
git clone --branch feat/knox-asw110-simulator-502-20261122 https://github.com/israrulhaq5/Zero-Export.git
cd Zero-Export
npm.cmd run verify:knox
```

## What the one-command verification does

1. npm ci on the backend lockfile
2. npm ci on the frontend lockfile
3. Knox unit tests plus dynamic-port real Modbus TCP FC03/04/06 checks
4. Zero-Export controller unit tests including failsafe
5. Full backend lint and Node test suite
6. Vite production build
7. **Actual localhost port 502** test, with a local test Slave ID 3:
   - FC04 31371/31372 (wire 1370) reads 88,000 W
   - FC06 45403 (wire 5402) writes 5000 = 50%
   - FC03 readback is 5000 and FC04 becomes 44,000 W
   - Remote OFF/ON changes output
   - Stop and restart on a second local port and unit ID 17
   - FC06 25% becomes 22,000 W

Every step is sequential: if a step fails, the runner exits nonzero and
does not falsely report success.

## Rerun after a fix

If `npm ci` has already installed both sets of dependencies, update the
feature branch and use the fast path (no repeated dependency download):

```cmd
git pull --ff-only
npm.cmd run verify:knox -- --skip-install
```

The first full run's PASS logs remain useful evidence; this command reruns
the tests and build after fixes, overwriting `knox-verification.log` with
the latest acceptance result.

## Test report

Terminal output is copied to **`knox-verification.log`** in the repo root.
Upload that file to ChatGPT for failure diagnosis and final acceptance.
The last line indicates the result:

- `RESULT: ALL AUTOMATED LOCAL KNOX ACCEPTANCE STEPS PASSED.`
- `RESULT: FAIL.` — inspect the first failed step in the log
- `RESULT: PARTIAL PASS` — TCP port 502 was explicitly skipped

If port 502 is occupied by a *known* local server, stop it before running
the full verification. Do not attempt to bind both the test and the existing
service simultaneously. To run all checks other than the port-502 bind,
use `npm.cmd run verify:knox -- --skip-port502`; this is only a partial
acceptance and does **not** prove port 502 availability.

This test suite does not claim MongoDB-backed browser deployment or an
installed physical Knox inverter protocol match. Those are separate
acceptance activities after the tests pass.
