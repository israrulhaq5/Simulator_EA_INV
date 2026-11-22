'use strict';

/**
 * Knox-branded 110 kW test model using the supplied AISWEI ASW GEN V2.1.5
 * Modbus map. No physical inverter is contacted by this simulator.
 */
function initialKnoxModel() {
  return {
    manufacturer: 'Knox (AISWEI reference map)',
    phaseVoltage: [230.4, 231.2, 229.8],
    frequency: 50,
    deratingRaw: 10000, // document 45403 / wire holding address 5402: 0.01%
    activePowerControlEnabled: 1,
    remotePowerSwitch: 1,
    dailyYieldKwh: 12.6,
    totalYieldKwh: 15075.4,
    runningHours: 1200,
    startedAt: null,
  };
}

function computeKnox(device) {
  const model = device.model;
  const opts = device.configuration.options || {};
  const ratingKw = opts.ratingKw ?? 110;
  const availabilityPct = Math.max(0, Math.min(100, opts.availabilityPct ?? 80));
  const limit = model.activePowerControlEnabled === 1
    ? Math.max(0, Math.min(10000, model.deratingRaw)) / 10000 : 1;
  const outputKw = model.remotePowerSwitch === 0 ? 0 : ratingKw * availabilityPct / 100 * limit;
  const dtHours = device.configuration.updateIntervalMs / 3600000;
  model.dailyYieldKwh += outputKw * dtHours;
  model.totalYieldKwh += outputKw * dtHours;
  model.runningHours += dtHours;
  // Mild, bounded movement resembles stable three-phase site telemetry.
  model.phaseVoltage = model.phaseVoltage.map((v) =>
    Math.max(220, Math.min(240, v + (Math.random() - 0.5) * 0.4)));
  model.frequency = Math.max(49.9, Math.min(50.1, model.frequency + (Math.random() - 0.5) * 0.02));

  const voltage = model.phaseVoltage;
  const pf = 0.99;
  const acCurrent = outputKw * 1000 / (3 * (voltage.reduce((a, b) => a + b, 0) / 3) * pf);
  const pvVoltage = [620, 615, 625, 610];
  const dcPowerW = outputKw * 1000 / 0.984;
  const pvCurrent = pvVoltage.map(v => dcPowerW / (pvVoltage.length * v));
  const gridW = (opts.loadKw ?? 100) * 1000 - outputKw * 1000;
  const control = (key, fallback) => device.controlValues.get(key) ?? fallback;
  const values = {
    device_type: '3',
    modbus_address: device.configuration.unitId,
    serial_number: 'KNOX-SIM-110KW',
    machine_type: 'ASW110K',
    grid_code: 0,
    rated_power: ratingKw * 1000,
    protocol_version: '2.1.5',
    manufacturer_name: 'AISWEI',
    brand_name: 'KNOX',
    // AISWEI V2.1.5 does not define a 110 kW enum for 31073;
    // leave unclassified rather than falsely claiming 50–60 kW model (5).
    inverter_model_code: 0,
    mppt_count: 4,
    string_count: 4,
    grid_rated_voltage: 230,
    grid_rated_frequency: 50,
    daily_yield: model.dailyYieldKwh,
    total_yield: model.totalYieldKwh,
    running_hours: model.runningHours,
    device_state: model.remotePowerSwitch === 0 ? 0 : 1,
    connect_time: 10,
    internal_temperature: 41.3,
    inverter_u_temperature: 42,
    inverter_v_temperature: 41.5,
    inverter_w_temperature: 41.8,
    dc_bus_voltage: 635,
    pv1_voltage: pvVoltage[0],
    pv1_current: pvCurrent[0],
    pv2_voltage: pvVoltage[1],
    pv2_current: pvCurrent[1],
    pv3_voltage: pvVoltage[2],
    pv3_current: pvCurrent[2],
    pv4_voltage: pvVoltage[3],
    pv4_current: pvCurrent[3],
    phase_l1_voltage: voltage[0],
    phase_l2_voltage: voltage[1],
    phase_l3_voltage: voltage[2],
    phase_l1_current: acCurrent,
    phase_l2_current: acCurrent,
    phase_l3_current: acCurrent,
    line_rs_voltage: voltage[0] * Math.sqrt(3),
    line_rt_voltage: voltage[1] * Math.sqrt(3),
    line_st_voltage: voltage[2] * Math.sqrt(3),
    grid_frequency: model.frequency,
    apparent_power: outputKw * 1000 / pf,
    active_power: outputKw * 1000,
    // Keep P, Q, S and PF mathematically coherent in the telemetry.
    reactive_power: outputKw * 1000 * Math.tan(Math.acos(pf)),
    power_factor: pf,
    inverter_fault_state: 0,
    inverter_error_code: 0,
    inverter_warning_code: 0,
    power_limit_role: model.activePowerControlEnabled ? 1 : 0,
    grid_connection_status: model.remotePowerSwitch === 0 ? 0 : 1,
    pv_total_power: dcPowerW,
    pv_daily_yield: model.dailyYieldKwh,
    pv_total_yield: model.totalYieldKwh,
    remote_switch_command: model.remotePowerSwitch,
    smart_meter_status: control('smart_meter_status', 0x000a),
    smart_meter_adjustment: control('smart_meter_adjustment', 0x000a),
    target_meter_power: control('target_meter_power', 0),
    current_meter_power: control('current_meter_power', gridW),
    anti_reverse_current_flag: control('anti_reverse_current_flag', 0x0005),
    active_power_control_enable: model.activePowerControlEnabled,
    active_power_set: model.deratingRaw * 0.01,
    active_power_increase_rate: control('active_power_increase_rate', 100),
    active_power_decrease_rate: control('active_power_decrease_rate', 100),
  };
  for (const register of device.profile.registers) {
    if (values[register.key] === undefined) {
      values[register.key] = control(register.key, register.dataType === 'STRING' ? '' : 0);
    }
  }
  return values;
}

module.exports = { initialKnoxModel, computeKnox };
