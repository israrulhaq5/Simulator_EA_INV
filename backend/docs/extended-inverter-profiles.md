# Extended inverter profile manual audit

Six generic Modbus TCP inverter profiles are seeded after the existing Unit IDs 1–4. The extended profiles use Unit IDs **5–10** in this order: SOFAR, Growatt, Deye/Nitrox, FoxESS, GoodWe and ESINV.

## Manual coverage

| Profile | Source manual | Definitions | Holding (FC03) | Input (FC04) |
|---|---|---:|---:|---:|
| SOFAR 110KTL | [SOFAR register workbook](https://docs.google.com/spreadsheets/d/1w7n2BHKOBV-zs1enzNzO2Y86zRo8TqDp/edit) | 1,906 | 1,906 | — |
| Growatt MAX | [Modbus V1.13](https://drive.google.com/file/d/1f_PtEQhFqvni5wYkYIZCzhN4pRkqdGj6/view) | 1,284 | 411 | 873 |
| Deye / NITROX 50 kW | [Modbus V1.34](https://drive.google.com/file/d/10dOowgYYibYXr8Y5JM5qNniaxQfrzNv0/view) | 254 | 254 | — |
| FoxESS R/V/H3Plus | [Modbus V1.07](https://drive.google.com/file/d/1vRWJOxO-eS5ZzC83ZqLg_u3XVCKCNLXb/view) | 559 | 559 | — |
| GoodWe Hybrid | [Modbus V1.3](https://drive.google.com/file/d/1XvQqYtvcPU0xyzXfZY4IDWuNGokdcBi4/view) | 156 | 156 | — |
| ESINV-33000ID | [Modbus V3.4](https://drive.google.com/file/d/128BIZGVoqwRNozznQOHcGiPUErooRHch/view) | 768 | 437 | 331 |

A dash means that the supplied manual does not define that register table for the profile. FC03 is exercised for all six profiles; FC04 is exercised for Growatt MAX and ESINV only. FC16 writes are exercised for each profile's configured power-control register.

## Register reconciliation and source caveats

- **SOFAR 110KTL:** The workbook reports 1,954 named rows. The profile models 1,906 typed definitions. Forty-seven named rows have no data type, `Production_Code` is reserved with no access mode, and one additional typed row at `0x102F` has no semantic label. None are assigned invented types or access. Four super-admin password words remain read-only zero placeholders.
- **Growatt MAX:** The V1.13 map is limited to the MAX profile; SPH/SPA-only storage blocks are not mixed into it. PID PV1–PV8 current scaling is 0.1 mA/count; StatusInfo voltage/current and maximum charge current are 10 mV/count or 10 mA/count; DCI_R/S/T are 0.1 mA/count; GFCI is 1 mA/count; DCV is 1 mV/count; timing values are 1 ms/count. The manual defines the register words as unsigned 16-bit values.
- **Deye / NITROX:** The 32-bit active/apparent-power values are kept as separate UINT16 low-word then high-word registers, matching the manual's address order. Heatsink and IGBT temperatures at 90–91 decode as `(raw × 0.1) − 100 °C`. Tripping-time registers 308–319 use 10 ms/count. Debug block 120–149 is not exposed because the manual does not define per-word types or meanings.
- **FoxESS:** Manual addresses are one-based; the map stores PDU offsets (manual address minus one). Numeric multipliers are represented in `scaleFactor`, not embedded in the unit label. The manual prints String 1/2/9 current units as `0 01A`, which is ambiguous; those three registers are disabled until FoxESS confirms the scale. Model 701 length is set to 153 from the next model start at 40226; the manual's printed length 31 conflicts with that contiguous block. Three overlapping Act Pt U32 / Dept Ref fields remain disabled. The SunSpec model chain and end marker are retained.
- **GoodWe:** The 0x0200 serial-number block (8 words) and 0x0210 model-name block (5 words) are represented as ASCII strings. Meter connection status registers 0x059D and 0x059E are included as read-only UINT16 values. Multiword values use the manual's high-word-first order.
- **ESINV-33000ID:** The map contains 331 input and 437 holding definitions. SOC/SOH at 34200, 34201, 34216 and 34217 use a 0.001 ratio; the simulator supplies fractional values (0.785 for 78.5%). Register 34203 is labeled Current but the manual prints `0.1V`; its `10 raw = 1A` conversion is consistent with 0.1 A/count, so the unit is normalized to A. Register 43077 is an enumeration, not a seconds value. Register 43074 uses 100 W/count for the ESINV-33000ID/S6/RHI 3–6 kW variants; the RHI-1P/3P 5–10 kW family is a separate 1 W/count variant and must use a separate profile.

## Byte order and word order

- All catalogued definitions declare **BIG_ENDIAN** byte order and word order.
- SOFAR, GoodWe and ESINV manuals specify high-byte-first / high-word-first ordering for their multiword values.
- Growatt's 16-bit words are high-byte-first; fields explicitly split into low/high words remain separate definitions.
- Deye is high-byte-first within each register. Its low-word/high-word pairs are modeled separately with the low word at the lower address.
- FoxESS uses SunSpec register types and big-endian word order by SunSpec convention. The V1.07 manual does not explicitly spell out the multiword word-order sentence; physical readback should be part of the first FoxESS bench test.

## Runtime and verification

- Unit IDs 5–10 route independently; existing Unit IDs 1–4 are unchanged.
- The TCP integration test opens real loopback TCP sockets and verifies FC03 holding reads, FC04 input reads where the manual defines them, FC16 power-control writes and readback, control-enable writes, remote-stop writes, and rejection of an unknown Unit ID.
- Register-audit tests verify the manual counts, register-type partitions, data types, byte/word order, scaling, offsets, explicit exclusions and SOC/SOH engineering conversion.
- CI is defined in `.github/workflows/backend-ci.yml` and runs on a self-hosted macOS ARM64 runner with Node 22, `npm ci` and `npm run check`.

**Important:** TCP integration tests exercise the simulator's Modbus TCP server, not physical inverter hardware. Physical-device bench validation is still required before enabling the three ambiguous FoxESS current registers or commissioning a real inverter.
