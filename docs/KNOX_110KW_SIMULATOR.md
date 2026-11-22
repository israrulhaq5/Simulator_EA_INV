# Knox 110 kW inverter — Modbus TCP simulator

## Source and scope
User-provided manual: AISWEI *MB001_ASW GEN-Modbus-en_V2.1.5*, 44 pages.
The inverter is labelled **Knox** in the simulator, using this AISWEI protocol
as the requested reference. This does **not** prove that every Knox hardware
revision uses this exact map. Compare against the installed inverter firmware
before using any real inverter control or gateway write-through.

The built-in `knox-asw110` profile implements **64 key registers**, including
identity, AC/DC live values, kWh, status, grid-meter input and writable power
controls. It is a selected operational subset of the much larger manual,
not an exhaustive register database.

## Default TCP settings

| Setting | Default | Editable |
|---|---:|---|
| Server bind | `0.0.0.0` | Yes |
| Modbus TCP port | `502` | Yes (1–65535) |
| Unit/slave ID | `3` | Yes (1–247) |
| Rated output | 110 kW | Yes |
| Solar availability | 80% | Yes |
| Update interval | 1000 ms | Yes |

The UI is at `/simulator`: edit **TCP port** and **Unit ID**, select
**Save**, then **Start**. Changes are stored in MongoDB and reapplied on
restart. When a linked `knox-simulator` EMS device already exists, its unit
ID and TCP port are synchronized to the simulator settings.

Port **502 is privileged on many Linux/macOS environments**. On Orange Pi,
run the service with a narrowly scoped `CAP_NET_BIND_SERVICE` systemd
capability (or provide an administrator-managed low-port forwarding rule).
Do not run an internet-exposed, unauthenticated control API as root.
The status card displays a bind error if 502 is unavailable.

An external Modbus master must connect to the Orange Pi's **actual LAN IP**,
not `0.0.0.0` or `127.0.0.1` (unless the master runs on the same machine).

## AISWEI reference-to-wire addressing

Per the manual (section 3.1), subtract 30001 from a 3xxxx reference, and
subtract 40001 from a 4xxxx reference before sending an FC03/FC04/FC06 PDU.
Do **not** send the displayed 3xxxx or 4xxxx number directly.

| Purpose | Manual reference | Wire address | FC | Format |
|---|---:|---:|---|---|
| Configured unit ID | 31002 | 1001 | 04 | U16 |
| Rated AC power | 31028–31029 | 1027 | 04 | U32, W |
| AC output active power | 31371–31372 | 1370 | 04 | S32, W |
| Grid frequency | 31368 | 1367 | 04 | U16 × 0.01 Hz |
| Active-power control enable | 44001 | 4000 | 03/06 | U16 0/1 |
| AC power setpoint | 45403 | 5402 | 03/06 | U16 × 0.01% Pn |
| Increase rate | 45404 | 5403 | 03/06 | U16 × 0.01% Pn/min |
| Decrease rate | 45405 | 5404 | 03/06 | U16 × 0.01% Pn/min |
| Remote on/off | 40201 | 200 | 03/06 | U16 0/1 |

Example: FC06 write **5000** at holding wire address **5402** gives
**50.00% rated power**. With 110 kW rating and 80% available irradiance,
the simulated AC output changes from 88 kW to 44 kW. Read the 2-word
FC04 active power at wire address 1370 to confirm.

The 110 kW simulator is a test slave. The live model uses deterministic
generation settings with mild voltage/frequency drift, not a hardware-grade
digital twin. The power-control loop is also available from `/zero-export`
after selecting `knox-simulator` and the **active_power_set** register.
Knox 0.01%-per-word scaling is converted automatically from the controller's
internal normalized percentage.

## Verification

- Static JavaScript syntax checks: backend changed modules and test files
- Pure runtime checks: 64 distinct profile keys, no occupied-wire collisions,
  wire addresses 1370 and 5402, output 88000 W → 44000 W at 50% setpoint
- Committed unit regression tests:
  `backend/tests/knox-simulator.test.js` and additions to
  `backend/tests/zero-export.service.test.js`
- Full `npm run check`, Vite build, real Modbus TCP master test and site
  commissioning **must still be run** in the connected Node/Mongo environment.
  Do not mark these tests as passed without their execution logs.

Suggested local checks:
```sh
cd backend
npm ci
npm run check
cd ../frontend
npm ci
npm run build
```

**Isolation:** Use a dedicated test LAN or localhost; do not connect the
test slave on the same address/port as a real inverter.
