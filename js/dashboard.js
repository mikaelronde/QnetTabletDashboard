/* ── Configuration ── */
const CONFIG = {
  homeDataUrl: 'http://192.168.1.100/homedata.json',
  apiBaseUrl: 'http://192.168.1.100:3001',
  authToken: '',
  pollInterval: 30_000,
  smhiUrl: 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/12.89/lat/55.52/data.json',
  smhiPollInterval: 600_000,
  healthCheckUrl: 'http://192.168.1.100/healthcheck.json',
  pingApiUrl: 'http://192.168.1.100/dashboard/pingapi/api/ping',
  sqlBackupUrl: 'http://192.168.1.100/dashboard/pingapi/api/sqlbackup',
  statusPollInterval: 60_000,
  rondeStatusUrl: 'http://192.168.1.100/ronde/status.json',
  sseUrl: 'http://192.168.1.100:5480/',
  cameraAlertDuration: 60_000,
  cameras: [
    { name: 'Front', src: 'front_sub' },
    { name: 'Back', src: 'back_sub' },
    { name: 'Patio', src: 'patio_sub' },
    { name: 'Parking', src: 'parking_sub' },
    { name: 'Pool', src: 'pool_sub' },
    { name: 'Garage', src: 'garage_sub' },
  ],
  go2rtcBase: 'http://192.168.1.140:1984',
};

/* ── Clock ── */
function updateClock() {
  const now = new Date();
  document.getElementById('clock-time').textContent =
    now.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('clock-date').textContent =
    now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
setInterval(updateClock, 1000);
updateClock();

/* ── SMHI Weather ── */
const WSYMB2 = {
  1:  { icon: '\u2600\uFE0F', desc: 'Clear' },
  2:  { icon: '\uD83C\uDF24\uFE0F', desc: 'Nearly clear' },
  3:  { icon: '\u26C5', desc: 'Variable clouds' },
  4:  { icon: '\uD83C\uDF25\uFE0F', desc: 'Half clear' },
  5:  { icon: '\u2601\uFE0F', desc: 'Cloudy' },
  6:  { icon: '\u2601\uFE0F', desc: 'Overcast' },
  7:  { icon: '\uD83C\uDF2B\uFE0F', desc: 'Fog' },
  8:  { icon: '\uD83C\uDF26\uFE0F', desc: 'Light rain showers' },
  9:  { icon: '\uD83C\uDF27\uFE0F', desc: 'Rain showers' },
  10: { icon: '\uD83C\uDF27\uFE0F', desc: 'Heavy rain showers' },
  11: { icon: '\u26C8\uFE0F', desc: 'Thunderstorm' },
  12: { icon: '\uD83C\uDF28\uFE0F', desc: 'Light sleet showers' },
  13: { icon: '\uD83C\uDF28\uFE0F', desc: 'Sleet showers' },
  14: { icon: '\uD83C\uDF28\uFE0F', desc: 'Heavy sleet showers' },
  15: { icon: '\uD83C\uDF28\uFE0F', desc: 'Light snow showers' },
  16: { icon: '\u2744\uFE0F', desc: 'Snow showers' },
  17: { icon: '\u2744\uFE0F', desc: 'Heavy snow showers' },
  18: { icon: '\uD83C\uDF27\uFE0F', desc: 'Light rain' },
  19: { icon: '\uD83C\uDF27\uFE0F', desc: 'Rain' },
  20: { icon: '\uD83C\uDF27\uFE0F', desc: 'Heavy rain' },
  21: { icon: '\u26C8\uFE0F', desc: 'Thunder' },
  22: { icon: '\uD83C\uDF28\uFE0F', desc: 'Light sleet' },
  23: { icon: '\uD83C\uDF28\uFE0F', desc: 'Sleet' },
  24: { icon: '\uD83C\uDF28\uFE0F', desc: 'Heavy sleet' },
  25: { icon: '\uD83C\uDF28\uFE0F', desc: 'Light snow' },
  26: { icon: '\u2744\uFE0F', desc: 'Snow' },
  27: { icon: '\u2744\uFE0F', desc: 'Heavy snow' },
};

function findClosestEntry(timeSeries, targetTime) {
  let closest = null;
  let minDiff = Infinity;
  for (const entry of timeSeries) {
    const diff = Math.abs(new Date(entry.time).getTime() - targetTime);
    if (diff < minDiff) { minDiff = diff; closest = entry; }
  }
  return closest;
}

function getWeatherFromEntry(entry) {
  if (!entry?.data) return null;
  const d = entry.data;
  const sym = d.symbol_code;
  const w = WSYMB2[sym] || { icon: '\u2753', desc: 'Unknown' };
  return {
    temp: d.air_temperature,
    icon: w.icon,
    desc: w.desc,
    wind: `${d.wind_speed} m/s ${degToCardinal(d.wind_from_direction)}`,
    gust: d.wind_speed_of_gust,
    humidity: d.relative_humidity,
    rainProb: d.probability_of_precipitation,
    rainMm: d.precipitation_amount_mean,
    windSpeed: d.wind_speed,
  };
}

function groupEntriesByDate(timeSeries) {
  const days = {};
  for (const entry of timeSeries) {
    const d = new Date(entry.time);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if (!days[key]) days[key] = [];
    days[key].push(entry);
  }
  return days;
}

function computeDailySummary(entries) {
  if (!entries || !entries.length) return null;
  const temps = entries.map(e => e.data.air_temperature);
  const symbols = entries.map(e => e.data.symbol_code);
  const freq = {};
  symbols.forEach(s => freq[s] = (freq[s] || 0) + 1);
  const topSymbol = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  return {
    avgTemp: temps.reduce((a, b) => a + b, 0) / temps.length,
    minTemp: Math.min(...temps),
    maxTemp: Math.max(...temps),
    symbol: Number(topSymbol),
    wind: entries.reduce((a, e) => a + e.data.wind_speed, 0) / entries.length,
    gust: Math.max(...entries.map(e => e.data.wind_speed_of_gust)),
    humidity: entries.reduce((a, e) => a + e.data.relative_humidity, 0) / entries.length,
    rainTotal: entries.reduce((a, e) => a + (e.data.precipitation_amount_mean || 0), 0),
    rainProb: Math.max(...entries.map(e => e.data.probability_of_precipitation || 0)),
  };
}

async function fetchWeather() {
  try {
    const resp = await fetch(CONFIG.smhiUrl);
    if (!resp.ok) throw new Error(`SMHI HTTP ${resp.status}`);
    const data = await resp.json();

    const now = Date.now();
    const nowEntry = findClosestEntry(data.timeSeries, now);
    const entry6h = findClosestEntry(data.timeSeries, now + 6 * 3600_000);
    const entry12h = findClosestEntry(data.timeSeries, now + 12 * 3600_000);
    const entry24h = findClosestEntry(data.timeSeries, now + 24 * 3600_000);

    // Daily summaries for tomorrow and day after
    const byDate = groupEntriesByDate(data.timeSeries);
    const today = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);
    const fmtKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    const tomorrowSummary = computeDailySummary(byDate[fmtKey(tomorrow)]);
    const dayAfterSummary = computeDailySummary(byDate[fmtKey(dayAfter)]);

    // Compact view
    applyWeatherEntry(nowEntry, 'now');
    applyForecastEntry(entry6h, '6h');
    applyDaySummaryCompact(tomorrowSummary, 'tomorrow', tomorrow);
    applyDaySummaryCompact(dayAfterSummary, 'dayafter', dayAfter);

    if (nowEntry?.data) {
      const ws = nowEntry.data.wind_speed;
      const wd = nowEntry.data.wind_from_direction;
      document.getElementById('wind-speed').textContent = `${ws} m/s`;
      document.getElementById('wind-dir').textContent = degToCardinal(wd);
    }

    // Weather alert on compact card
    cachedWeatherTimeSeries = data.timeSeries;
    updateWeatherAlert(nowEntry, data.timeSeries);
  } catch (err) {
    console.error('Failed to fetch SMHI weather:', err);
  }
}

function applyWeatherEntry(entry, suffix) {
  if (!entry?.data) return;
  const temp = entry.data.air_temperature;
  const sym = entry.data.symbol_code;
  const w = WSYMB2[sym] || { icon: '\u2753', desc: 'Unknown' };

  document.getElementById(`weather-icon-${suffix}`).textContent = w.icon;
  document.getElementById(`weather-temp-${suffix}`).textContent = `${Math.round(temp)}\u00B0C`;
  document.getElementById(`weather-desc-${suffix}`).textContent = w.desc;
}

function applyForecastEntry(entry, suffix) {
  if (!entry?.data) return;
  const temp = entry.data.air_temperature;
  const sym = entry.data.symbol_code;
  const w = WSYMB2[sym] || { icon: '\u2753', desc: 'Unknown' };

  document.getElementById(`weather-icon-${suffix}`).textContent = w.icon;
  document.getElementById(`weather-temp-${suffix}`).textContent = `${Math.round(temp)}\u00B0C`;
}

function applyDaySummaryCompact(summary, suffix, date) {
  if (!summary) return;
  const w = WSYMB2[summary.symbol] || { icon: '\u2753' };
  const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  set(`forecast-label-${suffix}`, date.toLocaleDateString('en-GB', { weekday: 'short' }));
  set(`weather-icon-${suffix}`, w.icon);
  set(`weather-temp-${suffix}`, `${Math.round(summary.minTemp)}\u2013${Math.round(summary.maxTemp)}\u00B0C`);
  set(`weather-wind-${suffix}`, `${summary.wind.toFixed(1)} m/s`);
  set(`weather-rain-${suffix}`, summary.rainTotal > 0 ? `${summary.rainTotal.toFixed(1)} mm` : '');
}

let cachedWeatherTimeSeries = null;

function renderWeatherHourly() {
  if (!cachedWeatherTimeSeries) return;

  const byDate = groupEntriesByDate(cachedWeatherTimeSeries);
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const fmtKey = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const todayEntries = byDate[fmtKey(today)] || [];
  const tomorrowEntries = byDate[fmtKey(tomorrow)] || [];

  const todayLabel = document.getElementById('weather-hourly-today-label');
  const tomorrowLabel = document.getElementById('weather-hourly-tomorrow-label');
  if (todayLabel) todayLabel.textContent = today.toLocaleDateString('en-GB', { weekday: 'long' });
  if (tomorrowLabel) tomorrowLabel.textContent = tomorrow.toLocaleDateString('en-GB', { weekday: 'long' });

  renderHourlyColumn('weather-hourly-today', todayEntries);
  renderHourlyColumn('weather-hourly-tomorrow', tomorrowEntries);
}

function renderHourlyColumn(containerId, entries) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  for (const entry of entries) {
    const d = entry.data;
    const hour = new Date(entry.time).getHours();
    const w = WSYMB2[d.symbol_code] || { icon: '\u2753' };
    const row = document.createElement('div');
    row.className = 'weather-hour-row';
    row.innerHTML = `
      <span class="weather-hour-time">${String(hour).padStart(2,'0')}:00</span>
      <span class="weather-hour-icon">${w.icon}</span>
      <span class="weather-hour-temp">${Math.round(d.air_temperature)}\u00B0C</span>
      <span class="weather-hour-wind">${d.wind_speed} m/s</span>
      <span class="weather-hour-rain">${d.precipitation_amount_mean > 0 ? d.precipitation_amount_mean.toFixed(1) + ' mm' : ''}</span>`;
    container.appendChild(row);
  }
}

function updateWeatherAlert(nowEntry, timeSeries) {
  const el = document.getElementById('weather-alert');
  if (!el) return;

  const isRaining = nowEntry?.data?.precipitation_amount_mean > 0;

  // Check if wind exceeds 10 m/s at any point today
  const todayStr = new Date().toLocaleDateString('sv-SE');
  let isWindyToday = false;
  if (timeSeries) {
    for (const entry of timeSeries) {
      const entryDate = new Date(entry.time).toLocaleDateString('sv-SE');
      if (entryDate !== todayStr) continue;
      if (entry.data.wind_speed >= 10) { isWindyToday = true; break; }
    }
  }

  const showRain = isRaining;
  const showWind = isWindyToday;

  if (!showRain && !showWind) {
    el.textContent = '';
    return;
  }

  let text = '\u26A0\uFE0F';
  if (showRain) text += ' \uD83C\uDF27\uFE0F';
  if (showWind) text += ' \uD83D\uDCA8';
  el.textContent = text;
}

function degToCardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/* ── Overlay helpers ── */
function toggleOverlay(id) {
  const overlay = document.getElementById(id);
  overlay.classList.toggle('hidden');
}

document.getElementById('temps-overlay')?.addEventListener('click', () => toggleOverlay('temps-overlay'));
document.getElementById('weather-overlay').addEventListener('click', () => toggleOverlay('weather-overlay'));

// Stop clicks on the panel from closing the overlay
document.querySelectorAll('.overlay-panel').forEach(p => p.addEventListener('click', e => e.stopPropagation()));

/* ── Weather toggle ── */
document.getElementById('weather-card').addEventListener('click', () => {
  renderWeatherHourly();
  toggleOverlay('weather-overlay');
});

/* ── Temperatures: click individual rows for history ── */
document.querySelectorAll('.temps-card .temp-row-clickable').forEach(row => {
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    const sensor = row.dataset.sensor;
    const label = row.dataset.label;
    if (sensor && label) showTempHistory(sensor, label);
  });
});

/* ── Price Chart ── */
let priceChart = null;

function initPriceChart(nordpoolPrices) {
  if (!nordpoolPrices || nordpoolPrices.length === 0) return;

  const ctx = document.getElementById('price-chart').getContext('2d');
  const now = new Date();
  const currentQtr = now.getHours() * 4 + Math.floor(now.getMinutes() / 15);

  // Sort by time, build labels and prices
  const sorted = [...nordpoolPrices].sort((a, b) => new Date(a.time) - new Date(b.time));
  const days = {};
  for (const entry of sorted) {
    const d = new Date(entry.time);
    const dayKey = d.toLocaleDateString('sv-SE');
    if (!days[dayKey]) days[dayKey] = [];
    days[dayKey].push(entry);
  }
  const dayKeys = Object.keys(days).sort();
  const isMultiDay = dayKeys.length > 1;

  const prices = sorted.map(e => Math.round(e.price));
  const labels = sorted.map(e => {
    const d = new Date(e.time);
    return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
  });

  // Color: highlight current quarter, dim tomorrow's data
  const todayCount = days[dayKeys[0]]?.length || 96;
  const pointColors = prices.map((_, i) => {
    if (i === currentQtr) return 'rgba(91,138,240,1)';
    return 'transparent';
  });
  const segmentColor = (ctx) => {
    const i = ctx.p0DataIndex;
    if (isMultiDay && i >= todayCount) return 'rgba(91,138,240,0.3)';
    return 'rgba(91,138,240,0.8)';
  };
  const fillColor = (ctx) => {
    const i = ctx.p0DataIndex;
    if (isMultiDay && i >= todayCount) return 'rgba(91,138,240,0.03)';
    return 'rgba(91,138,240,0.1)';
  };

  if (priceChart) {
    priceChart.data.labels = labels;
    priceChart.data.datasets[0].data = prices;
    priceChart.update('none');
    return;
  }

  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: 'rgba(91,138,240,0.8)',
        backgroundColor: 'rgba(91,138,240,0.08)',
        segment: {
          borderColor: segmentColor,
          backgroundColor: fillColor,
        },
        fill: true,
        tension: 0.2,
        pointRadius: pointColors.map(c => c === 'transparent' ? 0 : 5),
        pointBackgroundColor: pointColors,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: '#6b7a90',
            font: { size: 11 },
            maxTicksLimit: isMultiDay ? 12 : 8,
            callback: function(val, idx) {
              // Show only full hours
              const label = this.getLabelForValue(idx);
              if (label && label.endsWith(':00')) {
                const hour = parseInt(label);
                if (isMultiDay) return hour % 4 === 0 ? label : '';
                return hour % 3 === 0 ? label : '';
              }
              return '';
            },
          },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#6b7a90',
            font: { size: 11 },
            maxTicksLimit: 4,
          },
          border: { display: false },
          min: 0,
        }
      }
    }
  });
}

/* ── Data Parsing Helpers ── */
function parseSwedishFloat(str) {
  if (!str) return 0;
  return parseFloat(String(str).replace(',', '.'));
}

function findTemp(temperatures, name) {
  const t = temperatures?.find(s => s.name === name);
  return t ? t.value : null;
}

function formatTemp(value) {
  if (value === null || value === undefined) return '\u2014';
  return `${Number(value).toFixed(1)}\u00B0C`;
}

const TEMP_LABELS = {
  outside: 'Outdoor',
  patio: 'Patio',
  diningRoom: 'Dining Room',
  livingRoom: 'Living Room',
  office: 'Office',
  bedroom: 'Bedroom',
  playhouse: 'Playhouse',
  pool: 'Pool',
  attic: 'Attic',
  refrigerator: 'Refrigerator',
};

/* ── Update Dashboard from homedata.json ── */
function updateDashboard(data) {
  // Doors
  setDoorStatus('door-front', data.doors?.frontDoor?.locked);
  setDoorStatus('door-parking', data.doors?.parkingDoor?.locked);

  // Cars
  updateCar(1, data.cars?.carOne);
  updateCar(2, data.cars?.carTwo);

  // Pool
  if (data.pool) {
    const running = data.pool.pumpRunning;
    document.getElementById('pool-status').textContent = running ? 'Running' : 'Idle';
    document.getElementById('pool-time').textContent =
      `${data.pool.pumpHours}h ${data.pool.pumpMinutes}m`;
  }
  const poolTemp = findTemp(data.temperatures, 'pool');
  if (poolTemp !== null) {
    document.getElementById('pool-temp').textContent = formatTemp(poolTemp);
  }

  // Temperatures (all except pool)
  setTemp('temp-outdoor', findTemp(data.temperatures, 'outside'));
  setTemp('temp-patio', findTemp(data.temperatures, 'patio'));
  setTemp('temp-diningroom', findTemp(data.temperatures, 'diningRoom'));
  setTemp('temp-livingroom', findTemp(data.temperatures, 'livingRoom'));
  setTemp('temp-office', findTemp(data.temperatures, 'office'));
  setTemp('temp-bedroom', findTemp(data.temperatures, 'bedroom'));
  setTemp('temp-playhouse', findTemp(data.temperatures, 'playhouse'));
  setTemp('temp-attic', findTemp(data.temperatures, 'attic'));

  // Temperatures (expanded — all sensors)
  if (data.temperatures) {
    const container = document.getElementById('temps-all');
    container.innerHTML = '';
    for (const sensor of data.temperatures) {
      const label = TEMP_LABELS[sensor.name] || sensor.name;
      const row = document.createElement('div');
      row.className = 'temp-row temp-row-clickable';
      row.innerHTML = `<span class="temp-label">${label}</span><span class="temp-value">${formatTemp(sensor.value)}</span>`;
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        showTempHistory(sensor.name, label);
      });
      container.appendChild(row);
    }
  }

  // Energy
  if (data.energy) {
    updateEnergy(data.energy);
  }

  // Energy cost
  if (data.energyCost) {
    document.getElementById('price-current').textContent =
      `${data.energyCost.current}`;
    if (data.energyCost.maxToday) {
      document.getElementById('price-max').innerHTML =
        `max <span class="chart-max-val">${data.energyCost.maxToday}</span>`;
    }
  }

  // NordPool prices chart
  if (data.nordpoolPrices?.length) {
    initPriceChart(data.nordpoolPrices);
    const days = new Set(data.nordpoolPrices.map(p => new Date(p.time).toLocaleDateString('sv-SE')));
    const titleEl = document.querySelector('.chart-header span:first-child');
    if (titleEl) titleEl.textContent = days.size > 1 ? 'Energy Price Today + Tomorrow' : 'Energy Price Today';
  }

  // Funds
  if (data.funds) {
    setFundValue('funds-daily', data.funds.dailyChange, true);
    setFundValue('funds-total', data.funds.totalChange, true);
  }

  // Earnings (battery savings from energy object)
  if (data.energy?.batteryYesterdaySavings) {
    setEarningsValue('earnings-day', parseSwedishFloat(data.energy.batteryYesterdaySavings.value));
  }
  if (data.energy?.batteryTotalSavings) {
    setEarningsValue('earnings-total', parseSwedishFloat(data.energy.batteryTotalSavings.value));
  }

  // Ukraine stats
  if (data.ukraineStats) {
    updateUkraine(data.ukraineStats);
  }

  // TV Time
  if (data.tvTime?.children) {
    updateTvTime(data.tvTime.children);
  }
}

function setDoorStatus(id, locked) {
  const el = document.getElementById(id);
  if (!el || locked === undefined) return;
  el.textContent = locked ? 'LOCKED' : 'UNLOCKED';
  el.className = `door-status ${locked ? 'locked' : 'unlocked'}`;
}

function updateCar(num, car) {
  if (!car) return;
  const pct = car.batteryLevel ?? 0;
  document.getElementById(`car${num}-battery`).textContent = `${pct}%`;
  document.getElementById(`car${num}-battery-fill`).style.width = `${pct}%`;

  const fill = document.getElementById(`car${num}-battery-fill`);
  if (pct <= 20) fill.style.background = 'var(--red)';
  else if (pct <= 50) fill.style.background = 'var(--amber)';
  else fill.style.background = 'var(--green)';

  const statusEl = document.getElementById(`car${num}-status`);
  if (car.charging) {
    statusEl.textContent = '\u26A1';
    statusEl.title = 'Charging';
    statusEl.className = 'car-status-icon status-charging';
  } else if (car.connected) {
    statusEl.textContent = '\uD83D\uDD0C';
    statusEl.title = 'Connected';
    statusEl.className = 'car-status-icon status-connected';
  } else {
    statusEl.textContent = '\u2298';
    statusEl.title = 'Disconnected';
    statusEl.className = 'car-status-icon status-disconnected';
  }
}

function setTemp(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = formatTemp(value);
}

function updateEnergy(e) {
  setEnergyCell('energy-prod-now', e.currentSolarProduction, 'kW');
  setEnergyCell('energy-prod-yday', e.energyYesterdaySolarProduction, 'kWh');

  // Total production in its own row below the table
  if (e.energyTotalSolarProduction) {
    const val = parseSwedishFloat(e.energyTotalSolarProduction.value ?? e.energyTotalSolarProduction);
    document.getElementById('energy-prod-total').textContent = `${(val / 1000).toFixed(2)} MWh`;
  }

  const battLevel = parseSwedishFloat(e.currentHomeBatteryLevel?.value);
  const battEl = document.getElementById('energy-batt-now');
  if (battEl) battEl.textContent = `${Math.round(battLevel)}%`;

  setEnergyCell('energy-grid-in-now', e.energyCurrentFromGrid, 'kW');
  setEnergyCell('energy-grid-in-yday', e.energyYesterdayFromGrid, 'kWh');
  setEnergyCell('energy-grid-out-now', e.energyCurrentToGrid, 'kW');
  setEnergyCell('energy-grid-out-yday', e.energyYesterdayToGrid, 'kWh');
  setEnergyCell('energy-house-now', e.energyCurrentTotalHouse, 'kW');
  setEnergyCell('energy-house-yday', e.energyYesterdayTotalHouse, 'kWh');
  setEnergyCell('energy-heat-now', e.currentHeatingKwh, 'kW');
  setEnergyCell('energy-heat-yday', e.energyYesterdayHeating, 'kWh');
  setEnergyCell('energy-car-now', e.currentCarChargingWatt, 'kW');
  setEnergyCell('energy-car-yday', e.energyYesterdayCarCharging, 'kWh');
}

function setEnergyCell(id, source, unit) {
  const el = document.getElementById(id);
  if (!el || !source) return;
  const val = parseSwedishFloat(source.value ?? source);
  el.textContent = `${val} ${unit}`;
}

function setFundValue(id, value, isPercent) {
  const el = document.getElementById(id);
  if (!el || value === undefined) return;
  const num = Number(value);
  const sign = num >= 0 ? '+' : '';
  el.textContent = isPercent ? `${sign}${num}%` : `${sign}${num} kr`;
  el.className = `funds-value ${num >= 0 ? 'positive' : 'negative'}`;
}

function setEarningsValue(id, value) {
  const el = document.getElementById(id);
  if (!el || value === undefined) return;
  const num = Number(value);
  el.textContent = `${num} kr`;
  el.className = `earnings-value ${num <= 0 ? 'positive' : 'negative'}`;
}

function parseUkraineValue(str) {
  const match = str?.match(/\[b\](\d+)\[\/b\]/);
  return match ? match[1] : '\u2013';
}

function updateUkraine(stats) {
  const map = {
    'ua-personnel': stats.personnel,
    'ua-tanks': stats.tanks,
    'ua-artillery': stats.artillery,
    'ua-armored': stats.armoredVehicles,
    'ua-aircraft': stats.aircraft,
    'ua-missiles': stats.missiles,
  };
  for (const [id, stat] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el && stat) el.textContent = parseUkraineValue(stat.value);
  }
}

function updateTvTime(children) {
  const container = document.getElementById('tvtime-list');
  if (!container) return;
  container.innerHTML = '';

  for (const [name, data] of Object.entries(children)) {
    const used = data.minutesUsed || 0;
    const limit = data.limit || 30;
    const remaining = data.minutesRemaining ?? (limit - used);
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const color = remaining <= 0 ? 'var(--red)' : remaining <= 10 ? 'var(--amber)' : 'var(--green)';

    const row = document.createElement('div');
    row.className = 'tvtime-row';
    row.innerHTML = `
      <span class="tvtime-name">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
      <div class="tvtime-bar-wrap">
        <div class="tvtime-bar-fill" style="width:${pct}%; background:${color}"></div>
      </div>
      <span class="tvtime-values">${remaining}/${limit} min</span>`;
    container.appendChild(row);
  }
}

/* ══════════════════════════════════════════════ */
/* ── Rönde Römindör                          ── */
/* ══════════════════════════════════════════════ */

const RONDE_USERS = ['mikael', 'emma', 'agnes', 'ellie'];
let cachedRondeData = null;

async function fetchRondeStatus() {
  try {
    const resp = await fetch(CONFIG.rondeStatusUrl);
    const data = await resp.json();
    cachedRondeData = data;
    renderRondeKpis(data);
  } catch (err) {
    console.error('Failed to fetch ronde status:', err);
  }
}

function renderRondeKpis(data) {
  const container = document.getElementById('ronde-list');
  if (!container) return;
  container.innerHTML = '';

  const today = new Date().toLocaleDateString('sv-SE');

  for (const name of RONDE_USERS) {
    const person = data[name];
    const row = document.createElement('div');
    row.className = 'ronde-row';

    const isToday = person?.date === today ||
      (person?.updated_at && new Date(person.updated_at).toLocaleDateString('sv-SE') === today);

    if (!person || !isToday) {
      row.innerHTML = `
        <span class="ronde-name">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
        <span class="ronde-status unknown">\u2013</span>`;
    } else {
      const completed = person.completed || 0;
      const total = person.total_due || 0;
      const late = person.tasks?.filter(t => t.status === 'late').length || 0;
      const due = person.tasks?.filter(t => t.status === 'due').length || 0;

      let colorClass = 'green';
      if (late > 0) colorClass = 'red';
      else if (due > 0) colorClass = 'yellow';

      row.innerHTML = `
        <span class="ronde-name">${name.charAt(0).toUpperCase() + name.slice(1)}</span>
        <span class="ronde-status ${colorClass}">${completed}/${total}</span>`;
    }

    row.addEventListener('click', () => showRondeDetail(name));
    container.appendChild(row);
  }
}

function showRondeDetail(name) {
  const overlay = document.getElementById('ronde-overlay');
  const title = document.getElementById('ronde-overlay-title');
  const detail = document.getElementById('ronde-detail');

  title.textContent = `${name.charAt(0).toUpperCase() + name.slice(1)} \u2014 Tasks`;
  overlay.classList.remove('hidden');
  detail.innerHTML = '';

  const today = new Date().toLocaleDateString('sv-SE');
  const person = cachedRondeData?.[name];
  const isToday = person?.date === today ||
    (person?.updated_at && new Date(person.updated_at).toLocaleDateString('sv-SE') === today);

  if (!person || !isToday) {
    detail.innerHTML = '<div style="color:var(--text-dim);font-size:1.2rem;padding:12px 0">No data for today</div>';
    return;
  }

  for (const task of (person.tasks || [])) {
    const row = document.createElement('div');
    row.className = 'ronde-task-row';

    let color, label;
    if (task.status === 'completed') { color = 'var(--green)'; label = '\u2713'; }
    else if (task.status === 'late') { color = 'var(--red)'; label = 'LATE'; }
    else { color = 'var(--amber)'; label = 'DUE'; }

    row.innerHTML = `
      <span class="ronde-task-text" style="color:${color}">${task.text}</span>
      <span class="ronde-task-status" style="color:${color}">${label}</span>`;
    detail.appendChild(row);
  }
}

/* ══════════════════════════════════════════════ */
/* ── System Status KPIs                      ── */
/* ══════════════════════════════════════════════ */

let cachedPingData = null;
let cachedHealthData = null;
let cachedBackupData = null;

function setKpi(id, color, value) {
  const dot = document.getElementById(`kpi-dot-${id}`);
  const val = document.getElementById(`kpi-val-${id}`);
  if (dot) { dot.className = `kpi-dot ${color}`; }
  if (val) val.textContent = value;
}

async function fetchNetworkStatus() {
  try {
    const resp = await fetch(CONFIG.pingApiUrl);
    const data = await resp.json();
    cachedPingData = data;
    const down = data.down || 0;
    if (down === 0) {
      setKpi('network', 'green', 'OK');
    } else {
      setKpi('network', down >= 3 ? 'red' : 'yellow', `${down}/${data.total} Down`);
    }
  } catch (err) {
    setKpi('network', 'red', 'Error');
    console.error('Failed to fetch ping status:', err);
  }
}

async function fetchHealthCheck() {
  try {
    const resp = await fetch(CONFIG.healthCheckUrl);
    let text = await resp.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const data = JSON.parse(text);
    cachedHealthData = data;

    // Integrations
    const intFail = data.integrations?.results?.filter(r => !r.ok).length || 0;
    if (intFail === 0) {
      setKpi('integrations', 'green', 'OK');
    } else {
      setKpi('integrations', 'red', `${intFail} Failing`);
    }

    // Sensors
    const sensorFail = data.sensorData?.filter(s => !s.ok).length || 0;
    if (sensorFail === 0) {
      setKpi('sensors', 'green', 'OK');
    } else {
      setKpi('sensors', sensorFail >= 3 ? 'red' : 'yellow', `${sensorFail} Stale`);
    }
  } catch (err) {
    setKpi('integrations', 'red', 'Error');
    setKpi('sensors', 'red', 'Error');
    console.error('Failed to fetch health check:', err);
  }
}

async function fetchSqlBackup() {
  try {
    const resp = await fetch(CONFIG.sqlBackupUrl);
    const data = await resp.json();
    cachedBackupData = data;
    const failCount = data.failCount || 0;
    if (failCount === 0) {
      setKpi('backup', 'green', 'OK');
    } else {
      setKpi('backup', 'red', `${failCount}/${data.total} Fail`);
    }
  } catch (err) {
    setKpi('backup', 'red', 'Error');
    console.error('Failed to fetch SQL backup status:', err);
  }
}

function renderNetworkDetail() {
  const container = document.getElementById('network-detail');
  if (!cachedPingData?.devices) { container.textContent = 'No data'; return; }

  const groups = {};
  for (const d of cachedPingData.devices) {
    const g = d.group || 'Other';
    if (!groups[g]) groups[g] = [];
    groups[g].push(d);
  }

  container.innerHTML = '';
  for (const [group, devices] of Object.entries(groups)) {
    const label = document.createElement('div');
    label.className = 'status-group-label';
    label.textContent = group;
    container.appendChild(label);

    for (const d of devices) {
      const row = document.createElement('div');
      row.className = 'status-row';
      row.innerHTML = `
        <span class="kpi-dot ${d.online ? 'green' : 'red'}"></span>
        <span class="status-row-name">${d.name}</span>
        <span class="status-row-detail">${d.ip}</span>
        <span class="status-row-detail">${d.online ? d.rttMs + ' ms' : 'Offline'}</span>`;
      container.appendChild(row);
    }
  }
}

function renderIntegrationsDetail() {
  const container = document.getElementById('integrations-detail');
  if (!cachedHealthData?.integrations?.results) { container.textContent = 'No data'; return; }

  container.innerHTML = '';
  for (const item of cachedHealthData.integrations.results) {
    const row = document.createElement('div');
    row.className = 'status-row';
    row.innerHTML = `
      <span class="kpi-dot ${item.ok ? 'green' : 'red'}"></span>
      <span class="status-row-name">${item.name}</span>
      <span class="status-row-detail">${item.ok ? 'OK' : 'Failing'}</span>`;
    container.appendChild(row);
  }
}

function renderSensorsDetail() {
  const container = document.getElementById('sensors-detail');
  if (!cachedHealthData) { container.textContent = 'No data'; return; }

  container.innerHTML = '';

  // Sensor data
  if (cachedHealthData.sensorData) {
    const label = document.createElement('div');
    label.className = 'status-group-label';
    label.textContent = 'Sensors';
    container.appendChild(label);

    for (const s of cachedHealthData.sensorData) {
      const row = document.createElement('div');
      row.className = 'status-row';
      const age = s.lastUpdated ? timeSince(s.lastUpdated) : 'Unknown';
      row.innerHTML = `
        <span class="kpi-dot ${s.ok ? 'green' : 'red'}"></span>
        <span class="status-row-name">${s.name}</span>
        <span class="status-row-detail">${age}</span>`;
      container.appendChild(row);
    }
  }

  // System data
  if (cachedHealthData.systemData) {
    const label = document.createElement('div');
    label.className = 'status-group-label';
    label.textContent = 'System Data';
    container.appendChild(label);

    for (const s of cachedHealthData.systemData) {
      const row = document.createElement('div');
      row.className = 'status-row';
      const age = s.lastUpdated ? timeSince(s.lastUpdated) : 'Unknown';
      row.innerHTML = `
        <span class="kpi-dot ${s.ok ? 'green' : 'red'}"></span>
        <span class="status-row-name">${s.name}</span>
        <span class="status-row-detail">${age}</span>`;
      container.appendChild(row);
    }
  }
}

function renderBackupDetail() {
  const container = document.getElementById('backup-detail');
  if (!cachedBackupData?.databases) { container.textContent = 'No data'; return; }

  container.innerHTML = '';
  for (const db of cachedBackupData.databases) {
    const row = document.createElement('div');
    row.className = 'status-row';
    row.innerHTML = `
      <span class="kpi-dot ${db.ok ? 'green' : 'red'}"></span>
      <span class="status-row-name">${db.name}</span>
      <span class="status-row-detail">${db.sizeMb} MB</span>
      <span class="status-row-detail">${db.lastModified || 'Missing'}</span>`;
    container.appendChild(row);
  }
}

function timeSince(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/* ══════════════════════════════════════════════ */
/* ── Shared chart helpers                    ── */
/* ══════════════════════════════════════════════ */

function getChartColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    line: s.getPropertyValue('--chart-line').trim() || 'rgba(91,138,240,0.8)',
    fill: s.getPropertyValue('--chart-fill').trim() || 'rgba(91,138,240,0.1)',
    grid: s.getPropertyValue('--chart-grid').trim() || 'rgba(255,255,255,0.04)',
    tick: s.getPropertyValue('--chart-tick').trim() || '#6b7a90',
  };
}

// SQL Server stores local time but mssql driver appends 'Z' — strip it
function parseLocalTime(raw) {
  return new Date(typeof raw === 'string' ? raw.replace('Z', '') : raw);
}

// Standard chart options for 24h line charts
function make24hChartOptions(unit, yMin, yMax) {
  const cc = getChartColors();
  const yScale = {
    grid: { color: cc.grid },
    ticks: { color: cc.tick, font: { size: 11 }, callback: v => `${v} ${unit}` },
    border: { display: false },
  };
  if (yMin !== undefined) yScale.min = yMin;
  if (yMax !== undefined) yScale.suggestedMax = yMax;
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    spanGaps: true,
    scales: {
      x: {
        grid: { color: cc.grid },
        ticks: { color: cc.tick, font: { size: 11 } },
        border: { display: false },
      },
      y: yScale
    }
  };
}

const OUTDOOR_SENSORS = ['outside', 'patio', 'playhouse', 'attic', 'pool'];

/* ══════════════════════════════════════════════ */
/* ── Temperature History (SQL-powered)       ── */
/* ══════════════════════════════════════════════ */

// homedata sensor name → SQL tblTemp intSensor ID
const SENSOR_ID_MAP = {
  outside: 231,
  patio: 247,
  diningRoom: 135,
  livingRoom: 167,
  office: 199,
  bedroom: 151,
  playhouse: 110,
  attic: 183,
  pool: 130,
  refrigerator: 215,
};

let tempChart24h = null;
let tempChart14d = null;

async function showTempHistory(sensorName, label) {
  const overlay = document.getElementById('temp-history-overlay');
  const title = document.getElementById('temp-history-title');
  const container24h = document.getElementById('temp-chart-24h');
  const container14d = document.getElementById('temp-chart-14d');

  title.textContent = label;
  overlay.classList.remove('hidden');

  const sensorId = SENSOR_ID_MAP[sensorName];
  if (!sensorId) {
    container24h.parentElement.querySelector('.chart-note').textContent = 'No historical data for this sensor';
    return;
  }

  if (tempChart24h) { tempChart24h.destroy(); tempChart24h = null; }
  if (tempChart14d) { tempChart14d.destroy(); tempChart14d = null; }

  try {
    const [data24h, data14d] = await Promise.all([
      fetch(`${CONFIG.apiBaseUrl}/api/history/temperature?sensorId=${sensorId}&hours=24`).then(r => r.json()),
      fetch(`${CONFIG.apiBaseUrl}/api/history/temperature/daily?sensorId=${sensorId}&days=14`).then(r => r.json()),
    ]);

    // 24h chart — already hourly from server
    const labels24h = data24h.map(d => parseLocalTime(d.datHour).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
    const temps24h = data24h.map(d => Math.round(d.avgTemp * 10) / 10);

    tempChart24h = new Chart(container24h.getContext('2d'), {
      type: 'line',
      data: {
        labels: labels24h,
        datasets: [{
          data: temps24h,
          borderColor: 'rgba(91,138,240,0.8)',
          backgroundColor: 'rgba(91,138,240,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        }]
      },
      options: OUTDOOR_SENSORS.includes(sensorName)
        ? make24hChartOptions('\u00B0C')
        : make24hChartOptions('\u00B0C', 10, 30),
    });

    // 14d daily averages — already aggregated from server
    const dailyAvgs = data14d.map(d => Math.round(d.avgTemp * 10) / 10);
    const dailyLabels = data14d.map(d => {
      const dt = parseLocalTime(d.datDay);
      return `${dt.getDate()}/${dt.getMonth() + 1}`;
    });

    tempChart14d = new Chart(container14d.getContext('2d'), {
      type: 'bar',
      data: {
        labels: dailyLabels,
        datasets: [{
          data: dailyAvgs,
          backgroundColor: dailyAvgs.map(v => v >= 0 ? 'rgba(61,214,140,0.4)' : 'rgba(240,101,96,0.4)'),
          borderRadius: 3,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#7a8394', font: { size: 11 } },
            border: { display: false },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#7a8394', font: { size: 11 }, callback: v => `${v}\u00B0C` },
            border: { display: false },
          }
        }
      }
    });
  } catch (err) {
    console.error('Failed to fetch temperature history:', err);
  }
}

/* ══════════════════════════════════════════════ */
/* ── Energy History (SQL-powered)            ── */
/* ══════════════════════════════════════════════ */

// Map energy table row IDs to tblPowerProduction column or tblPowerConsumption sensor
const ENERGY_ROW_MAP = {
  'energy-prod': { source: 'production', field: 'productionW', label: 'Solar Production', unit: 'kW', toKw: true },
  'energy-batt': { source: 'production', field: 'batteryW', label: 'Battery', unit: 'kW', toKw: true, allowNeg: true },
  'energy-grid-in': { source: 'production', field: 'gridW', label: 'From Grid', unit: 'kW', toKw: true, filter: v => Math.max(0, v) },
  'energy-grid-out': { source: 'production', field: 'gridW', label: 'To Grid', unit: 'kW', toKw: true, filter: v => Math.max(0, -v) },
  'energy-house': { source: 'production', field: 'houseW', label: 'House Total', unit: 'kW', toKw: true },
  'energy-heat': { source: 'consumption', sensor: 'Heating', label: 'Heating', unit: 'kWh' },
  'energy-car': { source: 'consumption', sensor: 'CarCharge', label: 'Car Charging', unit: 'kWh' },
};

let energyHistoryChart = null;
let energyExtraChart = null;

async function showEnergyHistory(rowKey) {
  const mapping = ENERGY_ROW_MAP[rowKey];
  if (!mapping) return;

  const overlay = document.getElementById('energy-history-overlay');
  const title = document.getElementById('energy-history-title');
  const canvas = document.getElementById('energy-history-chart');
  const extraSection = document.getElementById('energy-extra-section');
  const extraCanvas = document.getElementById('energy-extra-chart');
  const extraLabel = document.getElementById('energy-extra-label');

  title.textContent = `${mapping.label} \u2014 Last 24 Hours`;
  overlay.classList.remove('hidden');
  extraSection.classList.add('hidden');

  if (energyHistoryChart) { energyHistoryChart.destroy(); energyHistoryChart = null; }
  if (energyExtraChart) { energyExtraChart.destroy(); energyExtraChart = null; }

  try {
    let labels, values, unit;

    if (mapping.source === 'production') {
      const data = await fetch(`${CONFIG.apiBaseUrl}/api/history/power?hours=24`).then(r => r.json());
      labels = data.map(d => parseLocalTime(d.datDate).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
      values = data.map(d => {
        let v = d[mapping.field];
        if (mapping.filter) v = mapping.filter(v);
        if (mapping.toKw) v = v / 1000;
        return Math.round(v * 100) / 100;
      });
      unit = mapping.unit;
    } else {
      const data = await fetch(`${CONFIG.apiBaseUrl}/api/history/consumption?hours=24&sensor=${mapping.sensor}`).then(r => r.json());
      labels = data.map(d => parseLocalTime(d.datStartDate).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
      values = data.map(d => d.dblConsumptionkWh);
      unit = mapping.unit;
    }

    energyHistoryChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: 'rgba(91,138,240,0.8)',
          backgroundColor: 'rgba(91,138,240,0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2,
        }]
      },
      options: make24hChartOptions(unit, mapping.allowNeg ? undefined : 0, mapping.toKw ? 1 : undefined),
    });

    // Battery: add percentage chart below
    if (rowKey === 'energy-batt' && mapping.source === 'production') {
      const data = await fetch(`${CONFIG.apiBaseUrl}/api/history/power?hours=24`).then(r => r.json());
      const pctLabels = data.map(d => parseLocalTime(d.datDate).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }));
      const pctValues = data.map(d => Math.round(d.batteryPct));

      extraSection.classList.remove('hidden');
      extraLabel.textContent = 'Battery Level';

      energyExtraChart = new Chart(extraCanvas.getContext('2d'), {
        type: 'line',
        data: {
          labels: pctLabels,
          datasets: [{
            data: pctValues,
            borderColor: 'rgba(52,211,153,0.8)',
            backgroundColor: 'rgba(52,211,153,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            borderWidth: 2,
          }]
        },
        options: make24hChartOptions('%', 0, 100),
      });
    }
  } catch (err) {
    console.error('Failed to fetch energy history:', err);
  }
}

/* ── Data Fetching ── */
async function fetchHomeData() {
  if (!CONFIG.homeDataUrl) return;

  try {
    const headers = {};
    if (CONFIG.authToken) headers['X-Auth-Token'] = CONFIG.authToken;

    const resp = await fetch(CONFIG.homeDataUrl, { headers });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    let text = await resp.text();
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

    const data = JSON.parse(text);
    updateDashboard(data);
  } catch (err) {
    console.error('Failed to fetch home data:', err);
  }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  initPriceChart();
  fetchWeather();
  fetchHomeData();

  setInterval(fetchWeather, CONFIG.smhiPollInterval);
  if (CONFIG.homeDataUrl) {
    setInterval(fetchHomeData, CONFIG.pollInterval);
  }

  // Camera grid
  const camGrid = document.getElementById('camera-grid');
  if (camGrid) {
    for (const cam of CONFIG.cameras) {
      const thumb = document.createElement('div');
      thumb.className = 'camera-thumb';
      const img = document.createElement('img');
      img.alt = cam.name;
      img.onload = () => img.classList.add('loaded');
      img.onerror = () => img.classList.remove('loaded');
      img.src = `http://192.168.1.140:5000/api/${cam.name.toLowerCase()}/latest.jpg`;
      thumb.appendChild(img);
      const label = document.createElement('div');
      label.className = 'camera-thumb-label';
      label.textContent = cam.name;
      thumb.appendChild(label);
      thumb.addEventListener('click', () => {
        showCameraAlert({
          camera: cam.name.toLowerCase(),
          thumbnail: `http://192.168.1.140:5000/api/${cam.name.toLowerCase()}/latest.jpg?t=${Date.now()}`,
          stream: `http://192.168.1.140:5000/api/${cam.name.toLowerCase()}`,
        });
      });
      camGrid.appendChild(thumb);
    }
    // Refresh thumbnails every 30s
    setInterval(() => {
      camGrid.querySelectorAll('.camera-thumb img').forEach((img, i) => {
        const newImg = new Image();
        newImg.onload = () => { img.src = newImg.src; img.classList.add('loaded'); };
        newImg.src = `http://192.168.1.140:5000/api/${CONFIG.cameras[i].name.toLowerCase()}/latest.jpg?t=${Date.now()}`;
      });
    }, 30_000);
  }

  // TODO: TEMP test trigger — remove after testing
  // Click clock once = preload, click again = show alert
  let testClickCount = 0;
  document.querySelector('.clock-card').addEventListener('click', () => {
    testClickCount++;
    const testData = {
      camera: 'front',
      eventId: 'test',
      thumbnail: 'http://192.168.1.140:5000/api/events/test/thumbnail.jpg',
      stream: 'http://192.168.1.140:1984/api/stream.mp4?src=front_sub',
    };
    if (testClickCount % 2 === 1) {
      console.log('TEST: preloading stream...');
      preloadCameraStream(testData);
    } else {
      console.log('TEST: showing alert...');
      showCameraAlert(testData);
    }
  });

  // Pool card click → temperature history
  document.querySelector('.pool-card')?.addEventListener('click', () => {
    showTempHistory('pool', 'Pool');
  });

  // Energy row click handlers
  document.querySelectorAll('.energy-table tbody tr').forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 2) return;
    const nowCell = cells[1];
    const id = nowCell?.id;
    if (!id) return;
    const rowKey = id.replace('-now', '');
    if (ENERGY_ROW_MAP[rowKey]) {
      row.classList.add('energy-row-clickable');
      row.addEventListener('click', () => showEnergyHistory(rowKey));
    }
  });

  // Overlay close handlers
  document.getElementById('temp-history-overlay').addEventListener('click', () => {
    document.getElementById('temp-history-overlay').classList.add('hidden');
  });
  document.getElementById('energy-history-overlay').addEventListener('click', () => {
    document.getElementById('energy-history-overlay').classList.add('hidden');
  });

  // System status KPI click handlers
  const kpiOverlayMap = {
    'kpi-network': { overlay: 'network-overlay', render: renderNetworkDetail },
    'kpi-integrations': { overlay: 'integrations-overlay', render: renderIntegrationsDetail },
    'kpi-sensors': { overlay: 'sensors-overlay', render: renderSensorsDetail },
    'kpi-backup': { overlay: 'backup-overlay', render: renderBackupDetail },
  };

  for (const [kpiId, config] of Object.entries(kpiOverlayMap)) {
    const kpiEl = document.getElementById(kpiId);
    const overlayEl = document.getElementById(config.overlay);
    if (kpiEl && overlayEl) {
      kpiEl.addEventListener('click', () => {
        config.render();
        overlayEl.classList.remove('hidden');
      });
      overlayEl.addEventListener('click', () => overlayEl.classList.add('hidden'));
      overlayEl.querySelector('.overlay-panel').addEventListener('click', e => e.stopPropagation());
    }
  }

  // System status polling
  fetchNetworkStatus();
  fetchHealthCheck();
  fetchSqlBackup();
  fetchRondeStatus();
  setInterval(fetchNetworkStatus, CONFIG.statusPollInterval);
  setInterval(fetchHealthCheck, CONFIG.statusPollInterval);
  setInterval(fetchSqlBackup, CONFIG.statusPollInterval);
  setInterval(fetchRondeStatus, CONFIG.statusPollInterval);

  // Rönde overlay close
  document.getElementById('ronde-overlay').addEventListener('click', () => {
    document.getElementById('ronde-overlay').classList.add('hidden');
  });
  document.getElementById('ronde-overlay').querySelector('.overlay-panel').addEventListener('click', e => e.stopPropagation());

  // Camera alert overlay close
  document.getElementById('camera-overlay').addEventListener('click', () => {
    closeCameraOverlay();
  });
  document.getElementById('camera-overlay').querySelector('.overlay-panel').addEventListener('click', e => e.stopPropagation());

  // SSE: Frigate camera alerts
  initCameraSSE();
});

let cameraAlertTimer = null;
let cameraPreloadTimer = null;
let cameraStreamReady = false;

function initCameraSSE() {
  const sse = new EventSource(CONFIG.sseUrl);

  sse.addEventListener('frigate_alert', (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.action === 'preload') {
        preloadCameraStream(data);
      } else if (data.action === 'alert') {
        showCameraAlert(data);
      }
    } catch (err) {
      console.error('Failed to parse frigate_alert:', err);
    }
  });

  sse.onerror = () => {
    console.warn('SSE connection lost, will auto-reconnect');
  };
}

function preloadCameraStream(data) {
  const stream = document.getElementById('camera-stream');
  if (!data.stream) return;

  cameraStreamReady = false;
  stream.classList.remove('live');

  stream.onload = () => {
    cameraStreamReady = true;
    const overlay = document.getElementById('camera-overlay');
    if (!overlay.classList.contains('hidden')) {
      stream.classList.add('live');
      document.getElementById('camera-thumbnail').classList.add('hidden-fade');
    }
  };
  stream.src = data.stream;

  // Tear down if no alert within 60s
  if (cameraPreloadTimer) clearTimeout(cameraPreloadTimer);
  cameraPreloadTimer = setTimeout(() => {
    tearDownCamera();
  }, 60_000);
}

function showCameraAlert(data) {
  const overlay = document.getElementById('camera-overlay');
  const title = document.getElementById('camera-overlay-title');
  const video = document.getElementById('camera-stream');
  const thumbnail = document.getElementById('camera-thumbnail');

  const camera = data.camera || 'front';
  title.textContent = camera.charAt(0).toUpperCase() + camera.slice(1);

  // Show snapshot immediately
  if (data.thumbnail) {
    thumbnail.src = data.thumbnail;
    thumbnail.classList.remove('hidden-fade');
  } else {
    thumbnail.src = '';
    thumbnail.classList.add('hidden-fade');
  }

  const stream = document.getElementById('camera-stream');

  // If stream already preloaded, swap instantly
  if (cameraStreamReady) {
    stream.classList.add('live');
    thumbnail.classList.add('hidden-fade');
  } else if (data.stream) {
    stream.classList.remove('live');
    stream.onload = () => {
      cameraStreamReady = true;
      stream.classList.add('live');
      thumbnail.classList.add('hidden-fade');
    };
    stream.src = data.stream;
  }

  overlay.classList.remove('hidden');

  // Auto-dismiss after 60s
  if (cameraAlertTimer) clearTimeout(cameraAlertTimer);
  cameraAlertTimer = setTimeout(() => {
    closeCameraOverlay();
  }, CONFIG.cameraAlertDuration);
}

function tearDownCamera() {
  const stream = document.getElementById('camera-stream');
  stream.src = '';
  stream.classList.remove('live');
  stream.onload = null;
  cameraStreamReady = false;
}

function closeCameraOverlay() {
  const overlay = document.getElementById('camera-overlay');
  const thumbnail = document.getElementById('camera-thumbnail');
  overlay.classList.add('hidden');
  tearDownCamera();
  thumbnail.src = '';
  thumbnail.classList.remove('hidden-fade');
  if (cameraPreloadTimer) clearTimeout(cameraPreloadTimer);
  if (cameraAlertTimer) clearTimeout(cameraAlertTimer);
}
