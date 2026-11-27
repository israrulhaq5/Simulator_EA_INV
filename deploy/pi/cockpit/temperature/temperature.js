"use strict";

const reading = document.getElementById("reading");
const refresh = document.getElementById("refresh");

async function readTemperature() {
  refresh.disabled = true;
  try {
    const sensor = await cockpit.spawn(["cat", "/sys/class/thermal/thermal_zone0/temp"]);
    const millidegrees = Number(sensor.trim());
    if (!sensor.trim() || !Number.isFinite(millidegrees)) {
      throw new Error("Invalid sensor value");
    }
    reading.textContent = `${(millidegrees / 1000).toFixed(1)} °C`;
  } catch {
    reading.textContent = "Board temperature sensor unavailable.";
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", readTemperature);
readTemperature();
