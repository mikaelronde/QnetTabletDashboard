/* ── Configuration ── */
const CONFIG = {
  homeDataUrl: 'http://192.168.1.100/homedata.json',
  authToken: '',
  pollInterval: 30_000,
  smhiUrl: 'https://opendata-download-metfcst.smhi.se/api/category/snow1g/version/1/geotype/point/lon/12.89/lat/55.52/data.json',
  smhiPollInterval: 600_000,
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
    pressure: d.air_pressure_at_mean_sea_level,
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

    // Compact view
    applyWeatherEntry(nowEntry, 'now');
    applyForecastEntry(entry6h, '6h');
    applyForecastEntry(entry24h, '24h');

    if (nowEntry?.data) {
      const ws = nowEntry.data.wind_speed;
      const wd = nowEntry.data.wind_from_direction;
      document.getElementById('wind-speed').textContent = `${ws} m/s`;
      document.getElementById('wind-dir').textContent = degToCardinal(wd);
    }

    // Expanded view
    const entries = { now: nowEntry, '6h': entry6h, '12h': entry12h, '24h': entry24h };
    for (const [suffix, entry] of Object.entries(entries)) {
      const w = getWeatherFromEntry(entry);
      if (!w) continue;
      const el = (id) => document.getElementById(id);
      const set = (id, txt) => { const e = el(id); if (e) e.textContent = txt; };
      set(`wd-icon-${suffix}`, w.icon);
      set(`wd-temp-${suffix}`, `${Math.round(w.temp)}\u00B0C`);
      set(`wd-wind-${suffix}`, w.wind);
      set(`wd-gust-${suffix}`, `${w.gust} m/s`);
      set(`wd-humidity-${suffix}`, `${Math.round(w.humidity)}%`);
      set(`wd-rain-${suffix}`, w.rainProb > 0 ? `${w.rainProb}% (${w.rainMm} mm)` : `${w.rainProb}%`);
      set(`wd-pressure-${suffix}`, `${Math.round(w.pressure)} hPa`);
    }
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

function degToCardinal(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

/* ── Overlay helpers ── */
function toggleOverlay(id) {
  const overlay = document.getElementById(id);
  overlay.classList.toggle('hidden');
}

document.getElementById('temps-overlay').addEventListener('click', () => toggleOverlay('temps-overlay'));
document.getElementById('weather-overlay').addEventListener('click', () => toggleOverlay('weather-overlay'));

// Stop clicks on the panel from closing the overlay
document.querySelectorAll('.overlay-panel').forEach(p => p.addEventListener('click', e => e.stopPropagation()));

/* ── Weather toggle ── */
document.getElementById('weather-card').addEventListener('click', () => toggleOverlay('weather-overlay'));

/* ── Temperatures toggle ── */
document.querySelector('.temps-card').addEventListener('click', () => toggleOverlay('temps-overlay'));

/* ── Price Chart ── */
let priceChart = null;

function initPriceChart(prices, labelData, isMultiDay) {
  const ctx = document.getElementById('price-chart').getContext('2d');
  const currentHour = new Date().getHours();

  if (!prices || prices.length === 0) {
    prices = [
      108, 105, 102, 100, 103, 112, 135, 172, 236, 299,
      363, 427, 390, 350, 310, 280, 250, 220, 195, 175,
      155, 140, 130, 118
    ];
    labelData = prices.map((_, i) => ({ hour: i }));
    isMultiDay = false;
  }

  // Highlight current hour (index 0..23 for today in single-day, same for multi-day)
  const barColors = prices.map((_, i) =>
    i === currentHour ? 'rgba(91,138,240,0.9)' :
    (isMultiDay && i >= 24) ? 'rgba(91,138,240,0.15)' : 'rgba(91,138,240,0.25)'
  );

  const chartLabels = labelData.map(l => l.hour);

  if (priceChart) {
    priceChart.data.labels = chartLabels;
    priceChart.data.datasets[0].data = prices;
    priceChart.data.datasets[0].backgroundColor = barColors;
    priceChart.options.scales.x.ticks.callback = isMultiDay
      ? (v) => v === 0 ? (labelData[0]?.day || '0') : v === 24 ? (labelData[24]?.day || '24') : (v % 6 === 0 ? chartLabels[v] : '')
      : (v) => v % 4 === 0 ? v : '';
    priceChart.update('none');
    return;
  }

  priceChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: chartLabels,
      datasets: [{
        data: prices,
        backgroundColor: barColors,
        borderRadius: 2,
        borderSkipped: false,
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
            color: '#7a8394',
            font: { size: 11 },
            callback: isMultiDay
              ? (v) => v === 0 ? (labelData[0]?.day || '0') : v === 24 ? (labelData[24]?.day || '24') : (v % 6 === 0 ? chartLabels[v] : '')
              : (v) => v % 4 === 0 ? v : '',
          },
          border: { display: false },
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: {
            color: '#7a8394',
            font: { size: 12 },
            maxTicksLimit: 5,
          },
          border: { display: false },
        }
      }
    }
  });
}

/* ── NordPool prices → hourly arrays (supports 1 or 2 days) ── */
function nordpoolToHourly(nordpoolPrices) {
  // Group by date, then average quarter-hours into hourly buckets
  const days = {};
  for (const entry of nordpoolPrices) {
    const d = new Date(entry.time);
    const dateKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!days[dateKey]) days[dateKey] = { sums: new Array(24).fill(0), counts: new Array(24).fill(0), date: d };
    const hour = d.getHours();
    days[dateKey].sums[hour] += entry.price;
    days[dateKey].counts[hour]++;
  }

  // Sort by date, build flat arrays
  const sorted = Object.values(days).sort((a, b) => a.date - b.date);
  const prices = [];
  const labels = [];
  const isMultiDay = sorted.length > 1;

  for (const day of sorted) {
    const dayLabel = day.date.toLocaleDateString('sv-SE', { weekday: 'short' });
    for (let h = 0; h < 24; h++) {
      prices.push(day.counts[h] > 0 ? Math.round(day.sums[h] / day.counts[h]) : 0);
      labels.push(isMultiDay ? { hour: h, day: dayLabel } : { hour: h });
    }
  }

  return { prices, labels, isMultiDay };
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

  // Temperatures (default 3)
  setTemp('temp-outdoor', findTemp(data.temperatures, 'outside'));
  setTemp('temp-patio', findTemp(data.temperatures, 'patio'));
  setTemp('temp-diningroom', findTemp(data.temperatures, 'diningRoom'));

  // Temperatures (expanded — all sensors)
  if (data.temperatures) {
    const container = document.getElementById('temps-all');
    container.innerHTML = '';
    for (const sensor of data.temperatures) {
      const label = TEMP_LABELS[sensor.name] || sensor.name;
      const row = document.createElement('div');
      row.className = 'temp-row';
      row.innerHTML = `<span class="temp-label">${label}</span><span class="temp-value">${formatTemp(sensor.value)}</span>`;
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
      `${data.energyCost.current} \u00F6re`;
  }

  // NordPool prices chart
  if (data.nordpoolPrices?.length) {
    const result = nordpoolToHourly(data.nordpoolPrices);
    initPriceChart(result.prices, result.labels, result.isMultiDay);
    const titleEl = document.querySelector('.chart-header span:first-child');
    if (titleEl) titleEl.textContent = result.isMultiDay ? 'Energy Price Today + Tomorrow' : 'Energy Price Today';
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
});
