'use strict';

const { REGISTER_DATA_TYPES: T, REGISTER_TYPES: R } = require('../constants/modbus');
const { expectedWordLength } = require('../utils/register-length');

function reg(address, key, name, dataType, opts = {}) {
  return {
    key, name,
    registerType: opts.registerType || R.INPUT,
    address, dataType,
    length: opts.length || expectedWordLength(dataType),
    byteOrder: 'BIG_ENDIAN',
    wordOrder: opts.wordOrder || 'BIG_ENDIAN',
    bitIndex: 0,
    scaleFactor: opts.scaleFactor === undefined ? 1 : opts.scaleFactor,
    offset: 0,
    unit: opts.unit,
    group: opts.group || 'Measurements',
    writable: Boolean(opts.writable),
    enabled: true,
    sortOrder: address,
  };
}

function profile(identifier, name, manufacturer, model, ratingKw, source, notes, registers, controls = {}) {
  return Object.freeze({
    identifier, name, manufacturer, model,
    description: manufacturer + ' ' + model + ' Modbus profile. Register addresses, data types, scaling, and function-code areas follow the linked manufacturer documentation.',
    registers: Object.freeze(registers),
    isActive: true,
    maxReadQuantity: 125,
    tags: Object.freeze([manufacturer.toLowerCase().replace(/[^a-z0-9]+/g, '-'), 'inverter', 'built-in']),
    metadata: Object.freeze({
      profileVersion: 1,
      source,
      notes,
      simulator: Object.freeze({
        genericInverter: true,
        ratingKw,
        powerControlKey: controls.powerControlKey,
        powerControlEnableKey: controls.powerControlEnableKey,
        remoteOnOffKey: controls.remoteOnOffKey,
      }),
    }),
  });
}

const H = R.HOLDING;
const I = R.INPUT;
const { INT16, UINT16, INT32, UINT32, UINT64, STRING } = T;

const SOFAR_110KTL_PROFILE = profile(
  'sofar-110ktl', 'SOFAR 110KTL inverter', 'SOFARSOLAR', '110KTL', 110,
  'https://drive.google.com/file/d/1w7n2BHKOBV-zs1enzNzO2Y86zRo8TqDp/view',
  'SOFAR 110 kW Modbus communication workbook. Telemetry points are taken from the 0x0400 real-time data area. The workbook marks the selected telemetry points read-only; no active-power write is exposed until the matching control map is confirmed.',
  [
    reg(1028, 'system_state', 'System operating state', UINT16, { registerType: H, group: 'Status' }),
    reg(1093, 'serial_number', 'Inverter serial number', STRING, { registerType: H, length: 7, group: 'Identity' }),
    reg(1156, 'grid_frequency', 'Grid frequency', UINT16, { registerType: H, scaleFactor: 0.01, unit: 'Hz' }),
    reg(1157, 'active_power', 'Total inverter active power', INT16, { registerType: H, scaleFactor: 0.01, unit: 'kW' }),
    reg(1158, 'reactive_power', 'Total inverter reactive power', INT16, { registerType: H, scaleFactor: 0.01, unit: 'kW' }),
    reg(1160, 'pcc_active_power', 'PCC active power', INT16, { registerType: H, scaleFactor: 0.01, unit: 'kW', group: 'Grid' }),
    reg(1165, 'phase_a_voltage', 'R phase grid voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(1167, 'phase_a_active_power', 'R phase inverter active power', INT16, { registerType: H, scaleFactor: 0.01, unit: 'kW' }),
    reg(1169, 'phase_a_power_factor', 'R phase power factor', INT16, { registerType: H, scaleFactor: 0.001 }),
    reg(1176, 'phase_b_voltage', 'S phase grid voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(1178, 'phase_b_active_power', 'S phase inverter active power', INT16, { registerType: H, scaleFactor: 0.01, unit: 'kW' }),
    reg(1187, 'phase_c_voltage', 'T phase grid voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(1189, 'phase_c_active_power', 'T phase inverter active power', INT16, { registerType: H, scaleFactor: 0.01, unit: 'kW' }),
    reg(1284, 'load_active_power', 'Total system load active power', INT16, { registerType: H, scaleFactor: 0.01, unit: 'kW', group: 'Load' }),
    reg(1287, 'output_frequency', 'Inverter output frequency', UINT16, { registerType: H, scaleFactor: 0.01, unit: 'Hz' }),
    reg(0x0684, 'daily_yield', 'PV generation today', UINT32, { registerType: H, scaleFactor: 0.01, unit: 'kWh', group: 'Energy' }),
    reg(0x0686, 'total_yield', 'Total PV generation', UINT32, { registerType: H, scaleFactor: 0.1, unit: 'kWh', group: 'Energy' }),
  ],
);

const GROWATT_MAX_PROFILE = profile(
  'growatt-max', 'Growatt MAX inverter', 'Growatt', 'MAX 50-100K', 100,
  'https://drive.google.com/file/d/1f_PtEQhFqvni5wYkYIZCzhN4pRkqdGj6/view',
  'Growatt Inverter Modbus RTU Protocol II V1.13. Input telemetry uses FC04; remote on/off and active-power rate are holding registers. High/low word pairs are modelled as two-word big-endian registers.',
  [
    reg(0, 'remote_on_off', 'Remote on/off command', UINT16, { registerType: H, group: 'Control', writable: true }),
    reg(3, 'active_power_rate', 'Maximum active power rate', UINT16, { registerType: H, group: 'Control', writable: true, unit: '%' }),
    reg(0, 'inverter_status', 'Inverter operating status', UINT16, { registerType: I, group: 'Status' }),
    reg(1, 'pv_total_power', 'Total PV input power', UINT32, { registerType: I, scaleFactor: 0.1, unit: 'W', group: 'PV' }),
    reg(3, 'pv1_voltage', 'PV1 voltage', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'V', group: 'PV' }),
    reg(4, 'pv1_current', 'PV1 current', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'A', group: 'PV' }),
    reg(7, 'pv2_voltage', 'PV2 voltage', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'V', group: 'PV' }),
    reg(8, 'pv2_current', 'PV2 current', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'A', group: 'PV' }),
    reg(35, 'active_power', 'AC output active power', UINT32, { registerType: I, scaleFactor: 0.1, unit: 'W' }),
    reg(37, 'grid_frequency', 'Grid frequency', UINT16, { registerType: I, scaleFactor: 0.01, unit: 'Hz' }),
    reg(38, 'grid_voltage', 'Grid voltage', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'V' }),
    reg(39, 'grid_current', 'Grid output current', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'A' }),
    reg(53, 'daily_yield', 'Energy generated today', UINT32, { registerType: I, scaleFactor: 0.1, unit: 'kWh', group: 'Energy' }),
    reg(55, 'total_yield', 'Total energy generated', UINT32, { registerType: I, scaleFactor: 0.1, unit: 'kWh', group: 'Energy' }),
    reg(57, 'total_running_time', 'Total running time', UINT32, { registerType: I, scaleFactor: 0.5, unit: 's', group: 'Status' }),
  ],
  { powerControlKey: 'active_power_rate', remoteOnOffKey: 'remote_on_off' },
);

const DEYE_NITROX_50KW_PROFILE = profile(
  'deye-nitrox-50kw', 'Deye / NITROX 50 kW inverter', 'Deye / NITROX', 'NITROX-50KW-3Ph-5G', 50,
  'https://drive.google.com/file/d/10dOowgYYibYXr8Y5JM5qNniaxQfrzNv0/view',
  'Deye Modbus RTU Protocol V1.34 / NITROX 50 kW register table. Documented low-word/high-word pairs are represented with LITTLE_ENDIAN word order. Reads use FC03; supported writes use FC10.',
  [
    reg(0, 'device_type', 'Device type', UINT16, { registerType: H, group: 'Identity' }),
    reg(1, 'modbus_address', 'Modbus address', UINT16, { registerType: H, group: 'Identity' }),
    reg(3, 'serial_number', 'Inverter serial number', STRING, { registerType: H, length: 5, group: 'Identity' }),
    reg(43, 'power_on_off', 'Remote power on/off', UINT16, { registerType: H, group: 'Control', writable: true }),
    reg(44, 'feed_in_power_pct', 'Feed-in power regulation', UINT16, { registerType: H, group: 'Control', writable: true, unit: '%' }),
    reg(60, 'daily_yield', 'Daily active production', INT16, { registerType: H, scaleFactor: 0.1, unit: 'kWh', group: 'Energy' }),
    reg(63, 'total_yield', 'Total active production', UINT32, { registerType: H, scaleFactor: 0.1, unit: 'kWh', wordOrder: 'LITTLE_ENDIAN', group: 'Energy' }),
    reg(70, 'grid_voltage_ab', 'Grid voltage AB', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(71, 'grid_voltage_bc', 'Grid voltage BC', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(72, 'grid_voltage_ac', 'Grid voltage AC', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(73, 'phase_a_voltage', 'Grid phase A voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(74, 'phase_b_voltage', 'Grid phase B voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(75, 'phase_c_voltage', 'Grid phase C voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(76, 'phase_a_current', 'Grid phase A current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A' }),
    reg(77, 'phase_b_current', 'Grid phase B current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A' }),
    reg(78, 'phase_c_current', 'Grid phase C current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A' }),
    reg(79, 'grid_frequency', 'Grid frequency', UINT16, { registerType: H, scaleFactor: 0.01, unit: 'Hz' }),
    reg(86, 'active_power', 'Output active power', UINT32, { registerType: H, scaleFactor: 0.1, unit: 'W', wordOrder: 'LITTLE_ENDIAN' }),
    reg(88, 'reactive_power', 'Output reactive power', UINT32, { registerType: H, scaleFactor: 0.1, unit: 'var', wordOrder: 'LITTLE_ENDIAN' }),
    reg(93, 'power_factor', 'Power factor', UINT16, { registerType: H, scaleFactor: 0.001 }),
    reg(109, 'pv1_voltage', 'DC voltage 1', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V', group: 'PV' }),
    reg(110, 'pv1_current', 'DC current 1', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A', group: 'PV' }),
    reg(111, 'pv2_voltage', 'DC voltage 2', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V', group: 'PV' }),
    reg(112, 'pv2_current', 'DC current 2', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A', group: 'PV' }),
  ],
  { powerControlKey: 'feed_in_power_pct', remoteOnOffKey: 'power_on_off' },
);

const FOXESS_RVH3_PROFILE = profile(
  'foxess-r-v-h3plus', 'FoxESS R / V / H3plus inverter', 'FoxESS', 'R/V/H3plus', 100,
  'https://drive.google.com/file/d/1vRWJOxO-eS5ZzC83ZqLg_u3XVCKCNLXb/view',
  'FoxESS R/V/H3plus Communication Protocol V1.07 (2025). SunSpec-style FC03 holding-register map. Active-power limiting is enabled at 40300 and set in percent at 40301 (0.1% units).',
  [
    reg(40005, 'manufacturer_name', 'Manufacturer name', STRING, { registerType: H, length: 16, group: 'Identity' }),
    reg(40021, 'model_name', 'Inverter model', STRING, { registerType: H, length: 16, group: 'Identity' }),
    reg(40053, 'serial_number', 'Serial number', STRING, { registerType: H, length: 16, group: 'Identity' }),
    reg(40074, 'operating_state', 'DER operating state', UINT16, { registerType: H, group: 'Status' }),
    reg(40075, 'inverter_state', 'Inverter state', UINT16, { registerType: H, group: 'Status' }),
    reg(40076, 'grid_connection_state', 'Grid connection state', UINT16, { registerType: H, group: 'Status' }),
    reg(40077, 'alarm_bitfield', 'Active alarm bitfield', UINT32, { registerType: H, group: 'Status' }),
    reg(40079, 'active_power', 'Total AC active power', INT16, { registerType: H, scaleFactor: 100, unit: 'W' }),
    reg(40080, 'apparent_power', 'Apparent power', INT16, { registerType: H, scaleFactor: 100, unit: 'VA' }),
    reg(40081, 'reactive_power', 'Reactive power', INT16, { registerType: H, scaleFactor: 100, unit: 'var' }),
    reg(40082, 'power_factor', 'Power factor', INT16, { registerType: H, scaleFactor: 0.001 }),
    reg(40083, 'grid_frequency', 'AC frequency', INT16, { registerType: H, scaleFactor: 0.01, unit: 'Hz' }),
    reg(40085, 'total_yield', 'Total energy injected', UINT64, { registerType: H, scaleFactor: 100, unit: 'Wh', group: 'Energy' }),
    reg(40089, 'heat_sink_temperature', 'Heat sink temperature', INT16, { registerType: H, scaleFactor: 0.1, unit: '°C' }),
    reg(40090, 'phase_a_current', 'Phase L1 current', INT16, { registerType: H, scaleFactor: 0.1, unit: 'A' }),
    reg(40091, 'phase_ab_voltage', 'Phase L1-L2 voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(40092, 'phase_a_voltage', 'Phase L1-N voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V' }),
    reg(40093, 'phase_b_current', 'Phase L2 current', INT16, { registerType: H, scaleFactor: 0.1, unit: 'A' }),
    reg(40300, 'active_power_limit_enable', 'Maximum active power limit enable', UINT16, { registerType: H, group: 'Control', writable: true }),
    reg(40301, 'active_power_limit_pct', 'Maximum active power limit', UINT16, { registerType: H, scaleFactor: 0.1, unit: '%', group: 'Control', writable: true }),
  ],
  { powerControlKey: 'active_power_limit_pct', powerControlEnableKey: 'active_power_limit_enable' },
);

const GOODWE_HYBRID_PROFILE = profile(
  'goodwe-hybrid', 'GoodWe Hybrid inverter', 'GoodWe', 'Hybrid / EN / 3EM series', 15,
  'https://drive.google.com/file/d/1XvQqYtvcPU0xyzXfZY4IDWuNGokdcBi4/view',
  'GoodWe Modbus Protocol V1.3 for hybrid EN/3EM series. FC03 holding-register map. Register 0x0100 is the documented real-power adjustment percentage (0-100); the selected map covers PV, battery, grid, load, frequency, and temperature telemetry.',
  [
    reg(0x0100, 'power_limit_pct', 'Real power adjustment', UINT16, { registerType: H, group: 'Control', writable: true, unit: '%' }),
    reg(0x0210, 'model_name', 'Inverter model name', STRING, { registerType: H, length: 5, group: 'Identity' }),
    reg(0x0500, 'pv1_voltage', 'PV1 voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V', group: 'PV' }),
    reg(0x0501, 'pv1_current', 'PV1 current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A', group: 'PV' }),
    reg(0x0503, 'pv2_voltage', 'PV2 voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V', group: 'PV' }),
    reg(0x0504, 'pv2_current', 'PV2 current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A', group: 'PV' }),
    reg(0x0506, 'battery_voltage', 'Battery voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V', group: 'Battery' }),
    reg(0x050A, 'battery_current', 'Battery current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A', group: 'Battery' }),
    reg(0x050E, 'battery_soc', 'Battery state of charge', UINT16, { registerType: H, unit: '%', group: 'Battery' }),
    reg(0x0516, 'grid_voltage', 'Grid voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V', group: 'Grid' }),
    reg(0x0517, 'grid_current', 'Grid current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A', group: 'Grid' }),
    reg(0x0518, 'grid_active_power', 'Grid active power', INT16, { registerType: H, unit: 'W', group: 'Grid' }),
    reg(0x0519, 'grid_frequency', 'Grid frequency', UINT16, { registerType: H, scaleFactor: 0.01, unit: 'Hz', group: 'Grid' }),
    reg(0x051B, 'load_voltage', 'Load voltage', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'V', group: 'Load' }),
    reg(0x051C, 'load_current', 'Load current', UINT16, { registerType: H, scaleFactor: 0.1, unit: 'A', group: 'Load' }),
    reg(0x051D, 'load_active_power', 'Load active power', UINT16, { registerType: H, unit: 'W', group: 'Load' }),
    reg(0x051E, 'load_frequency', 'Load frequency', UINT16, { registerType: H, scaleFactor: 0.01, unit: 'Hz', group: 'Load' }),
    reg(0x0520, 'work_mode', 'Storage inverter work mode', UINT16, { registerType: H, group: 'Status' }),
    reg(0x0521, 'inverter_temperature', 'Inverter internal temperature', UINT16, { registerType: H, scaleFactor: 0.1, unit: '°C', group: 'Status' }),
  ],
  { powerControlKey: 'power_limit_pct' },
);

const ESINV_HYBRID_PROFILE = profile(
  'esinv-33000id-hybrid', 'ESINV-33000ID energy storage inverter', 'ESINV', '33000ID energy storage series', 100,
  'https://drive.google.com/file/d/128BIZGVoqwRNozznQOHcGiPUErooRHch/view',
  'ESINV RS485 Modbus RTU Communication Protocol V3.4. Operational telemetry is read from input-register range 33000-36999 using FC04. The manual separately defines setting registers 43000-44999; no writable power command is exposed in this telemetry profile.',
  [
    reg(33000, 'product_model_number', 'Product model number', UINT16, { registerType: I, group: 'Identity' }),
    reg(33004, 'serial_number', 'Inverter serial number', STRING, { registerType: I, length: 16, group: 'Identity' }),
    reg(33073, 'phase_a_voltage', 'A phase voltage', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'V' }),
    reg(33074, 'phase_b_voltage', 'B phase voltage', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'V' }),
    reg(33075, 'phase_c_voltage', 'C phase voltage', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'V' }),
    reg(33076, 'phase_a_current', 'A phase current', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'A' }),
    reg(33077, 'phase_b_current', 'B phase current', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'A' }),
    reg(33078, 'phase_c_current', 'C phase current', UINT16, { registerType: I, scaleFactor: 0.1, unit: 'A' }),
    reg(33079, 'active_power', 'Inverter active power', INT32, { registerType: I, unit: 'W' }),
    reg(33081, 'reactive_power', 'Inverter reactive power', INT32, { registerType: I, unit: 'var' }),
    reg(33083, 'apparent_power', 'Inverter apparent power', INT32, { registerType: I, unit: 'VA' }),
    reg(33093, 'inverter_temperature', 'Inverter module temperature', INT16, { registerType: I, scaleFactor: 0.1, unit: '°C' }),
    reg(33094, 'grid_frequency', 'Grid frequency', UINT16, { registerType: I, scaleFactor: 0.01, unit: 'Hz' }),
    reg(33095, 'inverter_status', 'Inverter current status', UINT16, { registerType: I, group: 'Status' }),
    reg(33121, 'operating_status', 'Operating status bitfield', UINT16, { registerType: I, group: 'Status' }),
  ],
);

const EXTENDED_INVERTER_PROFILES = Object.freeze([
  SOFAR_110KTL_PROFILE,
  GROWATT_MAX_PROFILE,
  DEYE_NITROX_50KW_PROFILE,
  FOXESS_RVH3_PROFILE,
  GOODWE_HYBRID_PROFILE,
  ESINV_HYBRID_PROFILE,
]);

module.exports = {
  DEYE_NITROX_50KW_PROFILE,
  ESINV_HYBRID_PROFILE,
  EXTENDED_INVERTER_PROFILES,
  FOXESS_RVH3_PROFILE,
  GOODWE_HYBRID_PROFILE,
  GROWATT_MAX_PROFILE,
  SOFAR_110KTL_PROFILE,
};
