"use strict";

const reading = document.getElementById("reading");
const storage = document.getElementById("storage");
const refresh = document.getElementById("refresh");

async function readTemperature() {
  try {
    const sensor = await cockpit.spawn(["cat", "/sys/class/thermal/thermal_zone0/temp"]);
    const millidegrees = Number(sensor.trim());
    if (!sensor.trim() || !Number.isFinite(millidegrees)) {
      throw new Error("Invalid sensor value");
    }
    reading.textContent = `${(millidegrees / 1000).toFixed(1)} °C`;
  } catch {
    reading.textContent = "Board temperature sensor unavailable.";
  }
}

async function readStorage() {
  try {
    const output = await cockpit.spawn(["df", "-B1", "--output=size,used,avail,pcent", "/"]);
    const [size, used, available, percent] = output.trim().split("\n").at(-1).trim().split(/\s+/);
    const gib = (bytes) => `${(Number(bytes) / 2 ** 30).toFixed(2)} GiB`;
    if (![size, used, available].every((value) => /^\d+$/.test(value)) || !/^\d+%$/.test(percent)) {
      throw new Error("Invalid filesystem usage");
    }
    storage.textContent = `${gib(used)} used of ${gib(size)} (${percent}). ${gib(available)} available.`;
  } catch {
    storage.textContent = "Root filesystem usage unavailable.";
  }
}

async function refreshReadings() {
  refresh.disabled = true;
  await Promise.all([readTemperature(), readStorage()]);
  refresh.disabled = false;
}

refresh.addEventListener("click", refreshReadings);
refreshReadings();
