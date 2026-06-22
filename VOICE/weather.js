// Weather service — wttr.in (free, no API key)
// Fallback: OpenWeatherMap if OWM_API_KEY is set in env

const https = require('https');

const CITY = process.env.WEATHER_CITY || 'Beijing';

function fetch(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : require('http');
    client.get(url, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (_) { resolve(data); }
      });
    }).on('error', reject);
  });
}

async function getCurrentWeather(city = CITY) {
  // Try OpenWeatherMap first if key is set
  if (process.env.OWM_API_KEY) {
    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${process.env.OWM_API_KEY}&units=metric&lang=zh_cn`;
      const res = await fetch(url);
      if (res && res.main) {
        return {
          city: res.name,
          temp: Math.round(res.main.temp),
          condition: res.weather[0].description,
          humidity: res.main.humidity,
          wind: res.wind.speed,
          icon: res.weather[0].main.toLowerCase(),
        };
      }
    } catch (_) {}
  }

  // Fallback: wttr.in
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const res = await fetch(url);
    if (res && res.current_condition && res.current_condition[0]) {
      const c = res.current_condition[0];
      return {
        city: res.nearest_area?.[0]?.areaName?.[0]?.value || city,
        temp: parseInt(c.temp_C),
        condition: c.lang_zh?.[0]?.value || c.weatherDesc[0].value,
        humidity: parseInt(c.humidity),
        wind: parseInt(c.windspeedKmph),
        icon: c.weatherCode,
      };
    }
  } catch (_) {}

  return { city, temp: '--', condition: '未知', humidity: '--', wind: '--', icon: 'unknown' };
}

// Generate a human-readable weather summary for DJ scripts
async function getWeatherSummary() {
  const w = await getCurrentWeather();
  const hour = new Date().getHours();
  let vibe = '舒适';

  if (w.temp !== '--') {
    if (w.temp > 35) vibe = '炎热';
    else if (w.temp > 28) vibe = '温暖';
    else if (w.temp > 18) vibe = '舒适';
    else if (w.temp > 8) vibe = '微凉';
    else vibe = '寒冷';
  }
  if (w.condition && (w.condition.includes('雨') || w.condition.includes('rain'))) vibe += '有雨';
  if (w.condition && (w.condition.includes('雪') || w.condition.includes('snow'))) vibe += '有雪';

  return {
    ...w,
    summary: `${w.city}，${w.temp}°C，${w.condition}`,
    vibe,
    timeContext: hour < 6 ? '凌晨' : hour < 12 ? '上午' : hour < 18 ? '下午' : '晚上',
  };
}

module.exports = { getCurrentWeather, getWeatherSummary };
