export function filterForecast(forecastObj = {}, minTemp, conditionFilter) {
  return Object.entries(forecastObj)
    .map(([date, day]) => ({ date, ...day }))
    .filter((day) => {
      const tempOk = Number.isFinite(minTemp) ? day.maxtemp >= minTemp : true;
      const conditionText = (day.hourly?.[0]?.weather_descriptions?.[0] || '').toLowerCase();
      const conditionOk = conditionFilter
        ? conditionText.includes(conditionFilter.toLowerCase())
        : true;

      return tempOk && conditionOk;
    });
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}
