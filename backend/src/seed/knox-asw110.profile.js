'use strict';

/**
 * Knox-branded 110 kW inverter simulator profile, derived from the supplied
 * AISWEI MB001_ASW GEN-Modbus-en_V2.1.5 register table (pp. 5-20).
 *
 * IMPORTANT: AISWEI's 3xxxx/4xxxx references are NOT PDU addresses:
 * 31371 => FC04 address 1370; 45403 => FC03/06 address 5402.
 * Registered addresses must always use this zero-based conversion.
 *
 * This is a simulator of the provided AISWEI map, not a claim that every
 * Knox firmware variant has the same map; verify at the actual site.
 */
const { REGISTER_DATA_TYPES } = require('../constants/modbus');
const { expectedWordLength } = require('../utils/register-length');

function wireAddress(reference) {
  if (reference >= 30001 && reference < 40000) return reference - 30001;
  if (reference >= 40001 && reference < 50000) return reference - 40001;
  throw new Error('Unsupported AISWEI 3x/4x reference: ' + reference);
}

function register({ reference, key, name, dataType, unit, scaleFactor = 1, group, writable = false, length }) {
  return {
    key, name,
    registerType: reference < 40000 ? 'INPUT_REGISTER' : 'HOLDING_REGISTER',
    address: wireAddress(reference),
    dataType: REGISTER_DATA_TYPES[dataType],
    length: length || expectedWordLength(REGISTER_DATA_TYPES[dataType]),
    byteOrder: 'BIG_ENDIAN',
    wordOrder: 'BIG_ENDIAN',
    bitIndex: 0,
    scaleFactor,
    offset: 0,
    unit: unit || undefined,
    group,
    writable,
    enabled: true,
    sortOrder: 0,
  };
}

const registers = [
  register({"reference":31001,"key":"device_type","name":"Device type","dataType":"STRING","scaleFactor":1,"group":"Identity","length":1}),
  register({"reference":31002,"key":"modbus_address","name":"Configured Modbus address","dataType":"UINT16","scaleFactor":1,"group":"Identity"}),
  register({"reference":31003,"key":"serial_number","name":"Serial number","dataType":"STRING","scaleFactor":1,"group":"Identity","length":16}),
  register({"reference":31019,"key":"machine_type","name":"Machine type","dataType":"STRING","scaleFactor":1,"group":"Identity","length":8}),
  register({"reference":31027,"key":"grid_code","name":"Grid code","dataType":"UINT16","scaleFactor":1,"group":"Identity"}),
  register({"reference":31028,"key":"rated_power","name":"Rated AC active power","dataType":"UINT32","unit":"W","scaleFactor":1,"group":"Identity"}),
  register({"reference":31051,"key":"protocol_version","name":"Protocol version","dataType":"STRING","scaleFactor":1,"group":"Identity","length":6}),
  register({"reference":31057,"key":"manufacturer_name","name":"Manufacturer","dataType":"STRING","scaleFactor":1,"group":"Identity","length":8}),
  register({"reference":31065,"key":"brand_name","name":"Brand","dataType":"STRING","scaleFactor":1,"group":"Identity","length":8}),
  register({"reference":31073,"key":"inverter_model_code","name":"Inverter model code","dataType":"UINT16","scaleFactor":1,"group":"Identity"}),
  register({"reference":31074,"key":"mppt_count","name":"MPPT quantity","dataType":"UINT16","scaleFactor":1,"group":"Identity"}),
  register({"reference":31075,"key":"string_count","name":"PV string quantity","dataType":"UINT16","scaleFactor":1,"group":"Identity"}),
  register({"reference":31301,"key":"grid_rated_voltage","name":"Rated grid voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"Measurements"}),
  register({"reference":31302,"key":"grid_rated_frequency","name":"Rated grid frequency","dataType":"UINT16","unit":"Hz","scaleFactor":0.01,"group":"Measurements"}),
  register({"reference":31303,"key":"daily_yield","name":"Inverter energy today","dataType":"UINT32","unit":"kWh","scaleFactor":0.1,"group":"Energy"}),
  register({"reference":31305,"key":"total_yield","name":"Inverter total energy","dataType":"UINT32","unit":"kWh","scaleFactor":0.1,"group":"Energy"}),
  register({"reference":31307,"key":"running_hours","name":"Running hours","dataType":"UINT32","unit":"h","scaleFactor":1,"group":"Energy"}),
  register({"reference":31309,"key":"device_state","name":"Inverter status (1=Normal)","dataType":"UINT16","scaleFactor":1,"group":"Status"}),
  register({"reference":31310,"key":"connect_time","name":"Grid connection time","dataType":"UINT16","unit":"s","scaleFactor":1,"group":"Status"}),
  register({"reference":31311,"key":"internal_temperature","name":"Internal temperature","dataType":"INT16","unit":"°C","scaleFactor":0.1,"group":"Measurements"}),
  register({"reference":31312,"key":"inverter_u_temperature","name":"U phase temperature","dataType":"INT16","unit":"°C","scaleFactor":0.1,"group":"Measurements"}),
  register({"reference":31313,"key":"inverter_v_temperature","name":"V phase temperature","dataType":"INT16","unit":"°C","scaleFactor":0.1,"group":"Measurements"}),
  register({"reference":31314,"key":"inverter_w_temperature","name":"W phase temperature","dataType":"INT16","unit":"°C","scaleFactor":0.1,"group":"Measurements"}),
  register({"reference":31317,"key":"dc_bus_voltage","name":"DC bus voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"DC"}),
  register({"reference":31319,"key":"pv1_voltage","name":"PV1 voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"DC"}),
  register({"reference":31320,"key":"pv1_current","name":"PV1 current","dataType":"UINT16","unit":"A","scaleFactor":0.01,"group":"DC"}),
  register({"reference":31321,"key":"pv2_voltage","name":"PV2 voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"DC"}),
  register({"reference":31322,"key":"pv2_current","name":"PV2 current","dataType":"UINT16","unit":"A","scaleFactor":0.01,"group":"DC"}),
  register({"reference":31323,"key":"pv3_voltage","name":"PV3 voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"DC"}),
  register({"reference":31324,"key":"pv3_current","name":"PV3 current","dataType":"UINT16","unit":"A","scaleFactor":0.01,"group":"DC"}),
  register({"reference":31325,"key":"pv4_voltage","name":"PV4 voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"DC"}),
  register({"reference":31326,"key":"pv4_current","name":"PV4 current","dataType":"UINT16","unit":"A","scaleFactor":0.01,"group":"DC"}),
  register({"reference":31359,"key":"phase_l1_voltage","name":"L1 phase voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31360,"key":"phase_l1_current","name":"L1 phase current","dataType":"UINT16","unit":"A","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31361,"key":"phase_l2_voltage","name":"L2 phase voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31362,"key":"phase_l2_current","name":"L2 phase current","dataType":"UINT16","unit":"A","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31363,"key":"phase_l3_voltage","name":"L3 phase voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31364,"key":"phase_l3_current","name":"L3 phase current","dataType":"UINT16","unit":"A","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31365,"key":"line_rs_voltage","name":"RS line voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31366,"key":"line_rt_voltage","name":"RT line voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31367,"key":"line_st_voltage","name":"ST line voltage","dataType":"UINT16","unit":"V","scaleFactor":0.1,"group":"AC"}),
  register({"reference":31368,"key":"grid_frequency","name":"Grid frequency","dataType":"UINT16","unit":"Hz","scaleFactor":0.01,"group":"AC"}),
  register({"reference":31369,"key":"apparent_power","name":"Total AC apparent power","dataType":"UINT32","unit":"VA","scaleFactor":1,"group":"AC"}),
  register({"reference":31371,"key":"active_power","name":"Total AC active power","dataType":"INT32","unit":"W","scaleFactor":1,"group":"AC"}),
  register({"reference":31373,"key":"reactive_power","name":"Total AC reactive power","dataType":"INT32","unit":"var","scaleFactor":1,"group":"AC"}),
  register({"reference":31375,"key":"power_factor","name":"Power factor","dataType":"INT16","scaleFactor":0.01,"group":"AC"}),
  register({"reference":31377,"key":"inverter_fault_state","name":"Inverter internal fault","dataType":"UINT16","scaleFactor":1,"group":"Status"}),
  register({"reference":31378,"key":"inverter_error_code","name":"Inverter error code","dataType":"UINT16","scaleFactor":1,"group":"Status"}),
  register({"reference":31379,"key":"inverter_warning_code","name":"Inverter warning code","dataType":"UINT16","scaleFactor":1,"group":"Status"}),
  register({"reference":31390,"key":"power_limit_role","name":"Power limitation status (1=master)","dataType":"UINT16","scaleFactor":1,"group":"Status"}),
  register({"reference":31391,"key":"grid_connection_status","name":"Grid connection (1=connected)","dataType":"UINT16","scaleFactor":1,"group":"Status"}),
  register({"reference":31601,"key":"pv_total_power","name":"PV total DC input power","dataType":"UINT32","unit":"W","scaleFactor":1,"group":"DC"}),
  register({"reference":31603,"key":"pv_daily_yield","name":"PV energy today","dataType":"UINT32","unit":"kWh","scaleFactor":0.1,"group":"Energy"}),
  register({"reference":31605,"key":"pv_total_yield","name":"PV total energy","dataType":"UINT32","unit":"kWh","scaleFactor":0.1,"group":"Energy"}),
  register({"reference":40201,"key":"remote_switch_command","name":"Remote on/off (0=off,1=on)","dataType":"UINT16","scaleFactor":1,"group":"Control","writable":true}),
  register({"reference":41108,"key":"smart_meter_status","name":"Smart meter status","dataType":"UINT16","scaleFactor":1,"group":"Control","writable":true}),
  register({"reference":41109,"key":"smart_meter_adjustment","name":"Smart meter adjustment flag","dataType":"UINT16","scaleFactor":1,"group":"Control","writable":true}),
  register({"reference":41110,"key":"target_meter_power","name":"Smart meter target power","dataType":"INT32","unit":"W","scaleFactor":1,"group":"Control","writable":true}),
  register({"reference":41112,"key":"current_meter_power","name":"Current smart meter power","dataType":"INT32","unit":"W","scaleFactor":1,"group":"Control","writable":true}),
  register({"reference":41114,"key":"anti_reverse_current_flag","name":"Anti reverse current enable","dataType":"UINT16","scaleFactor":1,"group":"Control","writable":true}),
  register({"reference":44001,"key":"active_power_control_enable","name":"Active power control enabled","dataType":"UINT16","scaleFactor":1,"group":"Control","writable":true}),
  register({"reference":45403,"key":"active_power_set","name":"Active power setpoint (%Pn)","dataType":"UINT16","unit":"%","scaleFactor":0.01,"group":"Control","writable":true}),
  register({"reference":45404,"key":"active_power_increase_rate","name":"Active power increase rate","dataType":"UINT16","unit":"%Pn/min","scaleFactor":0.01,"group":"Control","writable":true}),
  register({"reference":45405,"key":"active_power_decrease_rate","name":"Active power decrease rate","dataType":"UINT16","unit":"%Pn/min","scaleFactor":0.01,"group":"Control","writable":true}),
];

const KNOX_ASW110_PROFILE = Object.freeze({
  identifier: 'knox-asw110',
  name: 'Knox 110 kW (AISWEI ASW GEN V2.1.5)',
  description: 'Knox 110 kW simulator using AISWEI ASW GEN Modbus V2.1.5 addresses; FC04 telemetry, FC03/06 control. Active power 31371/31372 (wire 1370), power setting 45403 (wire 5402; 0.01% per word).',
  manufacturer: 'Knox / AISWEI reference map',
  model: '110 kW (ASW GEN)',
  registers: Object.freeze(registers),
  isActive: true,
  maxReadQuantity: 100,
  tags: Object.freeze(['knox', 'aiswei', '110kw', 'inverter', 'built-in']),
  metadata: Object.freeze({
    profileVersion: 2,
    notes: 'Derived from user-provided AISWEI Modbus V2.1.5 PDF. Addresses are 3xxxx/4xxxx minus 30001/40001 respectively. This is a selected operational subset, not the full AISWEI register catalog. Check device firmware before physical write-through.',
  }),
});

module.exports = { KNOX_ASW110_PROFILE, wireAddress };
